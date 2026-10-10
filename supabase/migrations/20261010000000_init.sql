-- =====================================================================
-- NOGASA · Ficha de evaluación de proveedores (Servicio de Alimentación)
-- Esquema, seguridad (RLS) y datos iniciales.
-- Todos los objetos llevan prefijo fv_ ("ficha de visita") para poder
-- convivir con otras aplicaciones en el mismo proyecto Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.fv_app_role as enum ('evaluador', 'admin');

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

-- Perfil de cada usuario autenticado. Lo crea un trigger sobre auth.users.
create table public.fv_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.fv_app_role not null default 'evaluador',
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Correos autorizados por un administrador. Solo quien figura aquí queda
-- activo al registrarse; el resto de cuentas permanece inactiva.
create table public.fv_allowed_users (
  email       text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  full_name   text not null default '' check (char_length(full_name) <= 120),
  role        public.fv_app_role not null default 'evaluador',
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

-- Empresas postoras.
create table public.fv_suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(btrim(name)) between 2 and 120),
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- Los 6 criterios de la ficha original.
create table public.fv_criteria (
  id            smallint primary key check (id between 1 and 6),
  code          text not null unique,
  title         text not null,
  instruction   text not null,
  good_desc     text not null,
  regular_desc  text not null,
  bad_desc      text not null
);

-- Una evaluación por evaluador y postor.
create table public.fv_evaluations (
  id              uuid primary key default gen_random_uuid(),
  evaluator_id    uuid not null references public.fv_profiles (id) on delete cascade,
  evaluator_name  text not null,
  supplier_id     uuid not null references public.fv_suppliers (id) on delete restrict,
  visit_date      date not null,
  total_score     smallint not null check (total_score between 0 and 60),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (evaluator_id, supplier_id)
);

create index fv_evaluations_supplier_idx on public.fv_evaluations (supplier_id);

-- Puntaje por criterio: Bueno = 10, Regular = 5, Malo = 0.
create table public.fv_evaluation_answers (
  evaluation_id  uuid not null references public.fv_evaluations (id) on delete cascade,
  criterion_id   smallint not null references public.fv_criteria (id),
  score          smallint not null check (score in (0, 5, 10)),
  observation    text check (char_length(observation) <= 1000),
  primary key (evaluation_id, criterion_id)
);

-- ---------------------------------------------------------------------
-- Funciones de autorización (security definer: evitan recursión en RLS)
-- Un usuario solo cuenta como activo si su correo está confirmado.
-- ---------------------------------------------------------------------
create or replace function public.fv_is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fv_profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and p.active
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.fv_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fv_profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and p.active
      and p.role = 'admin'
      and u.email_confirmed_at is not null
  );
$$;

-- ---------------------------------------------------------------------
-- Alta automática de perfil al registrarse
-- El proyecto Supabase puede ser compartido con otras apps: solo se crea
-- perfil para cuentas autorizadas o registradas desde esta app, y un error
-- aquí nunca debe bloquear el registro en las demás aplicaciones.
-- ---------------------------------------------------------------------
create or replace function public.fv_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.fv_allowed_users%rowtype;
begin
  begin
    select * into a from public.fv_allowed_users where email = lower(new.email);

    if a.email is null and coalesce(new.raw_user_meta_data ->> 'app', '') <> 'ficha_visita' then
      return new;
    end if;

    insert into public.fv_profiles (id, email, full_name, role, active)
    values (
      new.id,
      lower(new.email),
      left(coalesce(nullif(a.full_name, ''), new.raw_user_meta_data ->> 'full_name', ''), 120),
      coalesce(a.role, 'evaluador'),
      a.email is not null
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'fv_handle_new_user: %', sqlerrm;
  end;
  return new;
end;
$$;

create trigger fv_on_auth_user_created
  after insert on auth.users
  for each row execute function public.fv_handle_new_user();

-- Sincroniza la lista de autorizados con los perfiles. Si la persona ya
-- tiene cuenta en el proyecto (por ejemplo, de otra app), se le crea el perfil.
create or replace function public.fv_sync_allowed_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_self uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
begin
  if tg_op = 'DELETE' then
    update public.fv_profiles
       set active = false
     where email = old.email
       and id <> v_self;
    return old;
  end if;

  insert into public.fv_profiles (id, email, full_name, role, active)
  select u.id, lower(u.email), new.full_name, new.role, true
    from auth.users u
   where lower(u.email) = new.email
     and u.id <> v_self
  on conflict (id) do update
    set active = true,
        role = excluded.role,
        full_name = case when excluded.full_name <> '' then excluded.full_name else public.fv_profiles.full_name end;
  return new;
end;
$$;

create trigger fv_allowed_users_sync
  after insert or update or delete on public.fv_allowed_users
  for each row execute function public.fv_sync_allowed_user();

-- Un administrador no puede quitarse a sí mismo el rol ni desactivarse,
-- y el correo del perfil nunca cambia desde la API.
create or replace function public.fv_guard_profile_update()
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

create trigger fv_profiles_guard
  before update on public.fv_profiles
  for each row execute function public.fv_guard_profile_update();

-- ---------------------------------------------------------------------
-- Envío de la ficha (única vía de escritura de evaluaciones)
-- p_answers: [{"criterion_id":1,"score":10,"observation":"..."}, ...]
-- ---------------------------------------------------------------------
create or replace function public.fv_submit_evaluation(
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
  if v_uid is null or not public.fv_is_active_user() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;

  if not exists (select 1 from public.fv_suppliers where id = p_supplier_id and active) then
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
       where (x ->> 'criterion_id')::int not in (select id from public.fv_criteria)
          or (x ->> 'score')::int not in (0, 5, 10)
          or char_length(coalesce(x ->> 'observation', '')) > 1000
     ) then
    raise exception 'Debe calificar los 6 criterios con Bueno (10), Regular (5) o Malo (0)';
  end if;

  select coalesce(nullif(full_name, ''), email) into v_name from public.fv_profiles where id = v_uid;

  insert into public.fv_evaluations (evaluator_id, evaluator_name, supplier_id, visit_date, total_score)
  values (v_uid, v_name, p_supplier_id, p_visit_date, v_total)
  on conflict (evaluator_id, supplier_id) do update
    set visit_date     = excluded.visit_date,
        total_score    = excluded.total_score,
        evaluator_name = excluded.evaluator_name,
        updated_at     = now()
  returning id into v_eval_id;

  -- Se validan siempre los 6 criterios, así que el upsert reemplaza la ficha completa.
  insert into public.fv_evaluation_answers (evaluation_id, criterion_id, score, observation)
  select v_eval_id,
         (x ->> 'criterion_id')::smallint,
         (x ->> 'score')::smallint,
         nullif(btrim(x ->> 'observation'), '')
    from jsonb_array_elements(p_answers) x
  on conflict (evaluation_id, criterion_id) do update
    set score = excluded.score,
        observation = excluded.observation;

  return v_eval_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.fv_profiles           enable row level security;
alter table public.fv_allowed_users      enable row level security;
alter table public.fv_suppliers          enable row level security;
alter table public.fv_criteria           enable row level security;
alter table public.fv_evaluations        enable row level security;
alter table public.fv_evaluation_answers enable row level security;

-- fv_profiles: cada uno ve el suyo; el admin ve y edita todos.
create policy profiles_select on public.fv_profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.fv_is_admin()));

create policy profiles_update_admin on public.fv_profiles
  for update to authenticated
  using ((select public.fv_is_admin()))
  with check ((select public.fv_is_admin()));

-- fv_allowed_users: solo administradores.
create policy allowed_users_admin on public.fv_allowed_users
  for all to authenticated
  using ((select public.fv_is_admin()))
  with check ((select public.fv_is_admin()));

-- fv_suppliers: usuarios activos leen los habilitados; admin gestiona todo.
create policy suppliers_select on public.fv_suppliers
  for select to authenticated
  using ((active and (select public.fv_is_active_user())) or (select public.fv_is_admin()));

create policy suppliers_insert_admin on public.fv_suppliers
  for insert to authenticated with check ((select public.fv_is_admin()));
create policy suppliers_update_admin on public.fv_suppliers
  for update to authenticated using ((select public.fv_is_admin())) with check ((select public.fv_is_admin()));
create policy suppliers_delete_admin on public.fv_suppliers
  for delete to authenticated using ((select public.fv_is_admin()));

-- fv_criteria: lectura para usuarios activos; sin escritura desde la API.
create policy criteria_select on public.fv_criteria
  for select to authenticated
  using ((select public.fv_is_active_user()));

-- fv_evaluations: el evaluador ve las suyas; el admin ve todas y puede borrar.
-- Insertar o actualizar solo es posible mediante fv_submit_evaluation().
create policy evaluations_select on public.fv_evaluations
  for select to authenticated
  using (
    (evaluator_id = (select auth.uid()) and (select public.fv_is_active_user()))
    or (select public.fv_is_admin())
  );

create policy evaluations_delete_admin on public.fv_evaluations
  for delete to authenticated
  using ((select public.fv_is_admin()));

create policy evaluation_answers_select on public.fv_evaluation_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.fv_evaluations e
      where e.id = evaluation_id
        and (
          (e.evaluator_id = (select auth.uid()) and (select public.fv_is_active_user()))
          or (select public.fv_is_admin())
        )
    )
  );

-- ---------------------------------------------------------------------
-- Privilegios: nada para anónimos; mínimos para autenticados.
-- ---------------------------------------------------------------------
-- Solo sobre las tablas de esta app (el esquema puede ser compartido).
revoke all on public.fv_profiles, public.fv_allowed_users, public.fv_suppliers, public.fv_criteria,
              public.fv_evaluations, public.fv_evaluation_answers from anon;
revoke all on public.fv_profiles, public.fv_allowed_users, public.fv_suppliers, public.fv_criteria,
              public.fv_evaluations, public.fv_evaluation_answers from authenticated;

grant select, update (full_name, role, active) on public.fv_profiles to authenticated;
grant select, insert, update, delete on public.fv_allowed_users to authenticated;
grant select, insert, update, delete on public.fv_suppliers to authenticated;
grant select on public.fv_criteria to authenticated;
grant select, delete on public.fv_evaluations to authenticated;
grant select on public.fv_evaluation_answers to authenticated;

revoke execute on function public.fv_submit_evaluation(uuid, date, jsonb) from public, anon;
grant execute on function public.fv_submit_evaluation(uuid, date, jsonb) to authenticated;
revoke execute on function public.fv_handle_new_user() from public, anon, authenticated;
revoke execute on function public.fv_sync_allowed_user() from public, anon, authenticated;
revoke execute on function public.fv_is_admin() from public, anon;
revoke execute on function public.fv_is_active_user() from public, anon;
grant execute on function public.fv_is_admin(), public.fv_is_active_user() to authenticated;
revoke execute on function public.fv_guard_profile_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Datos iniciales (tomados de la ficha original)
-- ---------------------------------------------------------------------
insert into public.fv_criteria (id, code, title, instruction, good_desc, regular_desc, bad_desc) values
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

insert into public.fv_suppliers (name, sort_order) values
('Almark', 1),
('La Merced', 2),
('Servicial Holding', 3),
('Plus Aliments', 4);
