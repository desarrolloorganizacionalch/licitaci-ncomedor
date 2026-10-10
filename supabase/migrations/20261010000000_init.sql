-- =====================================================================
-- NOGASA · Ficha de evaluación de proveedores (Servicio de Alimentación)
-- Esquema, seguridad (RLS) y datos iniciales.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.app_role as enum ('evaluador', 'admin');

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

-- Perfil de cada usuario autenticado. Lo crea un trigger sobre auth.users.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.app_role not null default 'evaluador',
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Correos autorizados por un administrador. Solo quien figura aquí queda
-- activo al registrarse; el resto de cuentas permanece inactiva.
create table public.allowed_users (
  email       text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  full_name   text not null default '' check (char_length(full_name) <= 120),
  role        public.app_role not null default 'evaluador',
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

-- Empresas postoras.
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(btrim(name)) between 2 and 120),
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- Los 6 criterios de la ficha original.
create table public.criteria (
  id            smallint primary key check (id between 1 and 6),
  code          text not null unique,
  title         text not null,
  instruction   text not null,
  good_desc     text not null,
  regular_desc  text not null,
  bad_desc      text not null
);

-- Una evaluación por evaluador y postor.
create table public.evaluations (
  id              uuid primary key default gen_random_uuid(),
  evaluator_id    uuid not null references public.profiles (id) on delete cascade,
  evaluator_name  text not null,
  supplier_id     uuid not null references public.suppliers (id) on delete restrict,
  visit_date      date not null,
  total_score     smallint not null check (total_score between 0 and 60),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (evaluator_id, supplier_id)
);

create index evaluations_supplier_idx on public.evaluations (supplier_id);

-- Puntaje por criterio: Bueno = 10, Regular = 5, Malo = 0.
create table public.evaluation_answers (
  evaluation_id  uuid not null references public.evaluations (id) on delete cascade,
  criterion_id   smallint not null references public.criteria (id),
  score          smallint not null check (score in (0, 5, 10)),
  observation    text check (char_length(observation) <= 1000),
  primary key (evaluation_id, criterion_id)
);

-- ---------------------------------------------------------------------
-- Funciones de autorización (security definer: evitan recursión en RLS)
-- Un usuario solo cuenta como activo si su correo está confirmado.
-- ---------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and p.active
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and p.active
      and p.role = 'admin'
      and u.email_confirmed_at is not null
  );
$$;

-- ---------------------------------------------------------------------
-- Alta automática de perfil al registrarse
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.allowed_users%rowtype;
begin
  select * into a from public.allowed_users where email = lower(new.email);

  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    lower(new.email),
    left(coalesce(nullif(a.full_name, ''), new.raw_user_meta_data ->> 'full_name', ''), 120),
    coalesce(a.role, 'evaluador'),
    a.email is not null
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sincroniza la lista de autorizados con los perfiles existentes.
create or replace function public.sync_allowed_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles
       set active = false
     where email = old.email
       and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
    return old;
  end if;

  update public.profiles
     set active = true,
         role = new.role,
         full_name = case when new.full_name <> '' then new.full_name else full_name end
   where email = new.email
     and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  return new;
end;
$$;

create trigger allowed_users_sync
  after insert or update or delete on public.allowed_users
  for each row execute function public.sync_allowed_user();

-- Un administrador no puede quitarse a sí mismo el rol ni desactivarse,
-- y el correo del perfil nunca cambia desde la API.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email <> old.email or new.id <> old.id then
    raise exception 'No se puede modificar el correo ni el identificador';
  end if;
  if old.id = auth.uid() and (new.role <> old.role or new.active <> old.active) then
    raise exception 'No puedes cambiar tu propio rol ni desactivar tu cuenta';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- Envío de la ficha (única vía de escritura de evaluaciones)
-- p_answers: [{"criterion_id":1,"score":10,"observation":"..."}, ...]
-- ---------------------------------------------------------------------
create or replace function public.submit_evaluation(
  p_supplier_id uuid,
  p_visit_date date,
  p_answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text;
  v_eval_id uuid;
  v_total   int;
  v_count   int;
  v_ids     int;
  v_today   date := (now() at time zone 'America/Lima')::date;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;

  if not exists (select 1 from public.suppliers where id = p_supplier_id and active) then
    raise exception 'El postor no existe o no está habilitado';
  end if;

  if p_visit_date is null or p_visit_date > v_today or p_visit_date < v_today - 365 then
    raise exception 'La fecha de visita no es válida';
  end if;

  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Formato de respuestas inválido';
  end if;

  select count(*),
         count(distinct (x ->> 'criterion_id')::int),
         coalesce(sum((x ->> 'score')::int), 0)
    into v_count, v_ids, v_total
    from jsonb_array_elements(p_answers) x;

  if v_count <> 6 or v_ids <> 6
     or exists (
       select 1 from jsonb_array_elements(p_answers) x
       where (x ->> 'criterion_id')::int not in (select id from public.criteria)
          or (x ->> 'score')::int not in (0, 5, 10)
          or char_length(coalesce(x ->> 'observation', '')) > 1000
     ) then
    raise exception 'Debe calificar los 6 criterios con Bueno (10), Regular (5) o Malo (0)';
  end if;

  select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where id = v_uid;

  insert into public.evaluations (evaluator_id, evaluator_name, supplier_id, visit_date, total_score)
  values (v_uid, v_name, p_supplier_id, p_visit_date, v_total)
  on conflict (evaluator_id, supplier_id) do update
    set visit_date     = excluded.visit_date,
        total_score    = excluded.total_score,
        evaluator_name = excluded.evaluator_name,
        updated_at     = now()
  returning id into v_eval_id;

  delete from public.evaluation_answers where evaluation_id = v_eval_id;

  insert into public.evaluation_answers (evaluation_id, criterion_id, score, observation)
  select v_eval_id,
         (x ->> 'criterion_id')::smallint,
         (x ->> 'score')::smallint,
         nullif(btrim(x ->> 'observation'), '')
    from jsonb_array_elements(p_answers) x;

  return v_eval_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.allowed_users      enable row level security;
alter table public.suppliers          enable row level security;
alter table public.criteria           enable row level security;
alter table public.evaluations        enable row level security;
alter table public.evaluation_answers enable row level security;

-- profiles: cada uno ve el suyo; el admin ve y edita todos.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- allowed_users: solo administradores.
create policy allowed_users_admin on public.allowed_users
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- suppliers: usuarios activos leen los habilitados; admin gestiona todo.
create policy suppliers_select on public.suppliers
  for select to authenticated
  using ((active and (select public.is_active_user())) or (select public.is_admin()));

create policy suppliers_insert_admin on public.suppliers
  for insert to authenticated with check ((select public.is_admin()));
create policy suppliers_update_admin on public.suppliers
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy suppliers_delete_admin on public.suppliers
  for delete to authenticated using ((select public.is_admin()));

-- criteria: lectura para usuarios activos; sin escritura desde la API.
create policy criteria_select on public.criteria
  for select to authenticated
  using ((select public.is_active_user()));

-- evaluations: el evaluador ve las suyas; el admin ve todas y puede borrar.
-- Insertar o actualizar solo es posible mediante submit_evaluation().
create policy evaluations_select on public.evaluations
  for select to authenticated
  using (
    (evaluator_id = (select auth.uid()) and (select public.is_active_user()))
    or (select public.is_admin())
  );

create policy evaluations_delete_admin on public.evaluations
  for delete to authenticated
  using ((select public.is_admin()));

create policy evaluation_answers_select on public.evaluation_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.evaluations e
      where e.id = evaluation_id
        and (
          (e.evaluator_id = (select auth.uid()) and (select public.is_active_user()))
          or (select public.is_admin())
        )
    )
  );

-- ---------------------------------------------------------------------
-- Privilegios: nada para anónimos; mínimos para autenticados.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on public.profiles, public.allowed_users, public.suppliers, public.criteria,
              public.evaluations, public.evaluation_answers from authenticated;

grant select, update (full_name, role, active) on public.profiles to authenticated;
grant select, insert, update, delete on public.allowed_users to authenticated;
grant select, insert, update, delete on public.suppliers to authenticated;
grant select on public.criteria to authenticated;
grant select, delete on public.evaluations to authenticated;
grant select on public.evaluation_answers to authenticated;

revoke execute on function public.submit_evaluation(uuid, date, jsonb) from public, anon;
grant execute on function public.submit_evaluation(uuid, date, jsonb) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_allowed_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_admin(), public.is_active_user() to authenticated;

-- ---------------------------------------------------------------------
-- Datos iniciales (tomados de la ficha original)
-- ---------------------------------------------------------------------
insert into public.criteria (id, code, title, instruction, good_desc, regular_desc, bad_desc) values
(1, 'sabor', 'Sabor y sazón',
 'Probar el menú del día (entrada/sopa y segundo).',
 'Rico, bien sazonado, punto correcto de cocción.',
 'Aceptable, pero algún plato soso, salado o pasado.',
 'Sin sabor, mal cocido o desagradable.'),
(2, 'presentacion', 'Presentación, variedad y porción',
 'Observar cómo se sirve el plato y las opciones del día.',
 'Plato ordenado, porción completa, caliente, varias opciones.',
 'Porción justa o poca variedad.',
 'Porción pequeña, plato frío o desordenado, una sola opción.'),
(3, 'limpieza', 'Limpieza de cocina y comedor',
 'Pisos, mesas, superficies de trabajo, utensilios y vajilla.',
 'Todo limpio y ordenado.',
 'Limpio en general, con detalles por mejorar.',
 'Suciedad visible, grasa acumulada o desorden.'),
(4, 'almacen', 'Almacén, refrigeración y equipos',
 'Despensa, refrigeradoras/congeladoras, cocinas, hornos y menaje.',
 'Insumos rotulados y ordenados, frío con control de temperatura, equipos completos y en buen estado.',
 'Algún desorden o rotulado incompleto, equipos básicos.',
 'Productos mal almacenados, frío sin control, equipos insuficientes o malogrados.'),
(5, 'personal', 'Personal: higiene y atención',
 'Uniforme, gorro, mascarilla, uñas cortas, sin joyas y trato al comensal.',
 'Todos con uniforme completo y trato amable.',
 'Algunos sin implementos completos o trato poco cordial.',
 'Sin uniforme, sin gorro/mascarilla o mal trato.'),
(6, 'organizacion', 'Organización del servicio',
 'Observar la línea de servicio: orden, reposición, opciones disponibles y colas.',
 'Atención fluida, se reponen los platos y todas las opciones están disponibles hasta el final.',
 'Algunas demoras o alguna opción se acaba antes de terminar el servicio.',
 'Colas largas, desorden o se acaban las opciones del menú.');

insert into public.suppliers (name, sort_order) values
('Almark', 1),
('La Merced', 2),
('Servicial Holding', 3),
('Plus Aliments', 4);
