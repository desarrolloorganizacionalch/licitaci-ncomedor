-- =====================================================================
-- Voto público: los evaluadores ya no inician sesión.
-- Escriben su nombre, eligen el postor y envían la ficha.
-- El panel administrativo sigue protegido por inicio de sesión.
-- =====================================================================

-- La ficha ya no exige una cuenta: el evaluador se identifica por su nombre.
alter table public.fv_evaluations alter column evaluator_id drop not null;

-- Nombre normalizado (minúsculas, espacios simples) para evitar duplicados.
alter table public.fv_evaluations
  add column evaluator_key text generated always as (lower(regexp_replace(btrim(evaluator_name), '\s+', ' ', 'g'))) stored;

alter table public.fv_evaluations
  add constraint fv_evaluations_name_len check (char_length(btrim(evaluator_name)) between 3 and 120);

-- Una ficha por evaluador (nombre) y postor.
create unique index fv_evaluations_evaluator_supplier_key on public.fv_evaluations (supplier_id, evaluator_key);

-- ---------------------------------------------------------------------
-- Lectura pública de postores habilitados y criterios (no son sensibles)
-- ---------------------------------------------------------------------
create policy suppliers_select_public on public.fv_suppliers
  for select to anon
  using (active);

create policy criteria_select_public on public.fv_criteria
  for select to anon
  using (true);

grant select on public.fv_suppliers, public.fv_criteria to anon;

-- ¿Ya existe una ficha con este nombre para este postor? (aviso temprano)
create or replace function public.fv_vote_exists(p_evaluator_name text, p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fv_evaluations
    where supplier_id = p_supplier_id
      and evaluator_key = lower(regexp_replace(btrim(coalesce(p_evaluator_name, '')), '\s+', ' ', 'g'))
  );
$$;

-- ---------------------------------------------------------------------
-- Registro público de la ficha. Valida todo y calcula el total sobre 60.
-- Devuelve el puntaje total.
-- ---------------------------------------------------------------------
create or replace function public.fv_submit_public_evaluation(
  p_evaluator_name text,
  p_supplier_id uuid,
  p_visit_date date,
  p_answers jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name    text := regexp_replace(btrim(coalesce(p_evaluator_name, '')), '\s+', ' ', 'g');
  v_eval_id uuid;
  v_total   int;
  v_count   int;
  v_ids     int;
  v_today   date := (now() at time zone 'America/Lima')::date;
begin
  if char_length(v_name) < 3 or char_length(v_name) > 120 then
    raise exception 'Escribe tu nombre y apellido.';
  end if;

  if not exists (select 1 from public.fv_suppliers where id = p_supplier_id and active) then
    raise exception 'El postor no existe o no está habilitado.';
  end if;

  if p_visit_date is null or p_visit_date > v_today or p_visit_date < v_today - 365 then
    raise exception 'La fecha de visita no es válida.';
  end if;

  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Formato de respuestas inválido.';
  end if;

  select count(*), count(distinct (x ->> 'criterion_id')::int), coalesce(sum((x ->> 'score')::int), 0)
    into v_count, v_ids, v_total
    from jsonb_array_elements(p_answers) x;

  if v_count <> 6 or v_ids <> 6
     or exists (
       select 1 from jsonb_array_elements(p_answers) x
       where (x ->> 'criterion_id')::int not in (select id from public.fv_criteria)
          or (x ->> 'score')::int not in (0, 5, 10)
          or char_length(coalesce(x ->> 'observation', '')) > 1000
     ) then
    raise exception 'Debe calificar los 6 criterios con Bueno (10), Regular (5) o Malo (0).';
  end if;

  begin
    insert into public.fv_evaluations (evaluator_id, evaluator_name, supplier_id, visit_date, total_score)
    values (auth.uid(), v_name, p_supplier_id, p_visit_date, v_total)
    returning id into v_eval_id;
  exception when unique_violation then
    raise exception 'Ya se registró una ficha de % para este postor. Si necesitas corregirla, pide al administrador que la elimine.', v_name;
  end;

  insert into public.fv_evaluation_answers (evaluation_id, criterion_id, score, observation)
  select v_eval_id, (x ->> 'criterion_id')::smallint, (x ->> 'score')::smallint, nullif(btrim(x ->> 'observation'), '')
    from jsonb_array_elements(p_answers) x;

  return v_total;
end;
$$;

revoke execute on function public.fv_submit_public_evaluation(text, uuid, date, jsonb) from public;
grant execute on function public.fv_submit_public_evaluation(text, uuid, date, jsonb) to anon, authenticated;
revoke execute on function public.fv_vote_exists(text, uuid) from public;
grant execute on function public.fv_vote_exists(text, uuid) to anon, authenticated;

-- La función anterior (ligada a cuentas de evaluador) ya no se usa.
revoke execute on function public.fv_submit_evaluation(uuid, date, jsonb) from authenticated;
