-- =====================================================================
-- Panel administrativo sin contraseña: acceso con un enlace secreto.
-- La clave nunca se guarda en claro: solo su hash SHA-256.
-- Todas las operaciones del panel pasan por funciones que validan la clave.
-- =====================================================================

create table public.fv_settings (
  key   text primary key,
  value text not null
);
alter table public.fv_settings enable row level security;
revoke all on public.fv_settings from anon, authenticated;
-- Sin políticas: nadie la lee desde la API; solo las funciones de abajo.

-- Para crear o cambiar el enlace secreto (desde el SQL Editor):
--   insert into public.fv_settings (key, value)
--   values ('admin_key_sha256', encode(sha256(convert_to('<CLAVE>', 'UTF8')), 'hex'))
--   on conflict (key) do update set value = excluded.value;

create or replace function public.fv_admin_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(char_length(p_key) >= 24, false) and exists (
    select 1 from public.fv_settings
    where key = 'admin_key_sha256'
      and value = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
  );
$$;

create or replace function public.fv_admin_assert(p_key text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fv_admin_ok(p_key) then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end if;
end;
$$;

-- Todo lo que necesita el panel en una sola llamada.
create or replace function public.fv_admin_panel(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fv_admin_assert(p_key);
  return jsonb_build_object(
    'suppliers', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'active', s.active, 'sort_order', s.sort_order)
                       order by s.sort_order, s.name)
      from public.fv_suppliers s), '[]'::jsonb),
    'criteria', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.id) from public.fv_criteria c), '[]'::jsonb),
    'evaluations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'evaluator_id', e.evaluator_id,
               'evaluator_name', e.evaluator_name,
               'evaluator_key', e.evaluator_key,
               'supplier_id', e.supplier_id,
               'visit_date', e.visit_date,
               'total_score', e.total_score,
               'created_at', e.created_at,
               'updated_at', e.updated_at,
               'evaluation_answers', coalesce((
                 select jsonb_agg(jsonb_build_object('criterion_id', a.criterion_id, 'score', a.score, 'observation', a.observation)
                                  order by a.criterion_id)
                 from public.fv_evaluation_answers a where a.evaluation_id = e.id), '[]'::jsonb))
             order by e.created_at desc)
      from public.fv_evaluations e), '[]'::jsonb)
  );
end;
$$;

-- Elimina una ficha y sus respuestas (cascada).
create or replace function public.fv_admin_delete_evaluation(p_key text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fv_admin_assert(p_key);
  delete from public.fv_evaluations where id = p_id;
end;
$$;

-- Crea (p_id nulo) o actualiza un postor: nombre y/o estado.
create or replace function public.fv_admin_save_supplier(p_key text, p_id uuid, p_name text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  perform public.fv_admin_assert(p_key);
  if v_name is not null and char_length(v_name) not between 2 and 120 then
    raise exception 'Escribe un nombre válido.';
  end if;

  if p_id is null then
    if v_name is null then
      raise exception 'Escribe el nombre del postor.';
    end if;
    insert into public.fv_suppliers (name, active, sort_order)
    values (v_name, coalesce(p_active, true),
            coalesce((select max(sort_order) from public.fv_suppliers), 0) + 1);
  else
    update public.fv_suppliers
       set name = coalesce(v_name, name),
           active = coalesce(p_active, active)
     where id = p_id;
  end if;
exception when unique_violation then
  raise exception 'Ya existe un postor con ese nombre.';
end;
$$;

revoke execute on function public.fv_admin_ok(text) from public;
revoke execute on function public.fv_admin_assert(text) from public, anon, authenticated;
revoke execute on function public.fv_admin_panel(text) from public;
revoke execute on function public.fv_admin_delete_evaluation(text, uuid) from public;
revoke execute on function public.fv_admin_save_supplier(text, uuid, text, boolean) from public;
grant execute on function public.fv_admin_ok(text) to anon, authenticated;
grant execute on function public.fv_admin_panel(text) to anon, authenticated;
grant execute on function public.fv_admin_delete_evaluation(text, uuid) to anon, authenticated;
grant execute on function public.fv_admin_save_supplier(text, uuid, text, boolean) to anon, authenticated;
