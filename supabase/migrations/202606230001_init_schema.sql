create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_users (
  id uuid primary key default extensions.gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null default 'admin',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.units (
  id text primary key,
  name text not null,
  city text not null,
  state text,
  franchisee text,
  opening_date date,
  source_file text,
  owner_name text,
  priority text not null default 'Normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roadmap_task_templates (
  id bigserial primary key,
  sort_order integer not null,
  item text,
  phase text not null,
  process text not null,
  unique (phase, item, process)
);

create table if not exists public.roadmap_tasks (
  id text primary key,
  unit_id text not null references public.units(id) on delete cascade,
  template_id bigint references public.roadmap_task_templates(id) on delete set null,
  item text,
  phase text not null,
  process text not null,
  status text not null default 'Pendente',
  deadline date,
  actual_date date,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_item_templates (
  id bigserial primary key,
  sort_order integer not null,
  item text not null unique
);

create table if not exists public.purchase_items (
  id text primary key,
  unit_id text not null references public.units(id) on delete cascade,
  template_id bigint references public.purchase_item_templates(id) on delete set null,
  item text not null,
  status text not null default 'Pendente',
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accreditation_units (
  id text primary key,
  name text not null,
  owner_name text
);

create table if not exists public.accreditation_procedures (
  id text primary key,
  group_name text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accreditation_statuses (
  procedure_id text not null references public.accreditation_procedures(id) on delete cascade,
  unit_id text not null,
  status text not null,
  owner_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (procedure_id, unit_id)
);

create table if not exists public.audit_events (
  id bigserial primary key,
  user_id uuid references public.app_users(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.units
  add column if not exists owner_name text,
  add column if not exists priority text not null default 'Normal';

alter table public.roadmap_tasks
  add column if not exists template_id bigint references public.roadmap_task_templates(id) on delete set null,
  add column if not exists sort_order integer not null default 0;

alter table public.purchase_items
  add column if not exists template_id bigint references public.purchase_item_templates(id) on delete set null,
  add column if not exists sort_order integer not null default 0;

alter table public.accreditation_procedures
  add column if not exists sort_order integer not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'accreditation_statuses'
      and constraint_name = 'accreditation_statuses_unit_id_fkey'
  ) then
    alter table public.accreditation_statuses
      drop constraint accreditation_statuses_unit_id_fkey;
  end if;
end;
$$;

alter table public.accreditation_statuses
  add column if not exists owner_name text;

alter table public.audit_events
  add column if not exists user_id uuid references public.app_users(id) on delete set null,
  add column if not exists payload jsonb;

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.units enable row level security;
alter table public.roadmap_task_templates enable row level security;
alter table public.roadmap_tasks enable row level security;
alter table public.purchase_item_templates enable row level security;
alter table public.purchase_items enable row level security;
alter table public.accreditation_units enable row level security;
alter table public.accreditation_procedures enable row level security;
alter table public.accreditation_statuses enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.unaccent_fallback(value text)
returns text
language sql
immutable
as $$
  select lower(translate(coalesce(value, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
  ));
$$;

create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(public.unaccent_fallback(value), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_app_users_updated_at on public.app_users;
create trigger touch_app_users_updated_at before update on public.app_users
for each row execute function public.touch_updated_at();

drop trigger if exists touch_units_updated_at on public.units;
create trigger touch_units_updated_at before update on public.units
for each row execute function public.touch_updated_at();

drop trigger if exists touch_roadmap_tasks_updated_at on public.roadmap_tasks;
create trigger touch_roadmap_tasks_updated_at before update on public.roadmap_tasks
for each row execute function public.touch_updated_at();

drop trigger if exists touch_purchase_items_updated_at on public.purchase_items;
create trigger touch_purchase_items_updated_at before update on public.purchase_items
for each row execute function public.touch_updated_at();

drop trigger if exists touch_accreditation_procedures_updated_at on public.accreditation_procedures;
create trigger touch_accreditation_procedures_updated_at before update on public.accreditation_procedures
for each row execute function public.touch_updated_at();

drop trigger if exists touch_accreditation_statuses_updated_at on public.accreditation_statuses;
create trigger touch_accreditation_statuses_updated_at before update on public.accreditation_statuses
for each row execute function public.touch_updated_at();

create or replace function public.current_app_user_id(p_token text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select s.user_id
  from public.app_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    and s.expires_at > now()
    and u.active = true
  limit 1;
$$;

create or replace function public.require_app_user(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_app_user_id(p_token);
  if v_user_id is null then
    raise exception 'Sessão inválida ou expirada' using errcode = '28000';
  end if;
  return v_user_id;
end;
$$;

create or replace function public.login_app_user(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users%rowtype;
  v_token text;
  v_expires_at timestamptz;
begin
  select *
  into v_user
  from public.app_users
  where lower(email) = lower(trim(p_email))
    and active = true
  limit 1;

  if v_user.id is null or v_user.password_hash <> extensions.crypt(p_password, v_user.password_hash) then
    raise exception 'Login ou senha inválidos' using errcode = '28000';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '12 hours';

  insert into public.app_sessions (user_id, token_hash, expires_at)
  values (v_user.id, encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), v_expires_at);

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (v_user.id, 'app_user', v_user.id::text, 'login', jsonb_build_object('email', v_user.email));

  return jsonb_build_object(
    'token', v_token,
    'expiresAt', v_expires_at,
    'user', jsonb_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'name', v_user.name,
      'role', v_user.role
    )
  );
end;
$$;

create or replace function public.logout_app_user(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.app_sessions
  where token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
  return true;
end;
$$;

create or replace function public.get_app_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.require_app_user(p_token);

  return jsonb_build_object(
    'generatedAt', now(),
    'sourceFiles', coalesce((select jsonb_agg(distinct source_file) from public.units where source_file is not null), '[]'::jsonb),
    'units', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'name', u.name,
          'city', u.city,
          'state', coalesce(u.state, ''),
          'franchisee', coalesce(u.franchisee, ''),
          'openingDate', coalesce(u.opening_date::text, ''),
          'sourceFile', coalesce(u.source_file, ''),
          'tasks', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', t.id,
              'item', coalesce(t.item, ''),
              'phase', t.phase,
              'process', t.process,
              'status', t.status,
              'deadline', coalesce(t.deadline::text, ''),
              'actualDate', coalesce(t.actual_date::text, ''),
              'notes', coalesce(t.notes, '')
            ) order by t.sort_order, t.item, t.process)
            from public.roadmap_tasks t
            where t.unit_id = u.id
          ), '[]'::jsonb),
          'purchases', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', p.id,
              'item', p.item,
              'status', p.status,
              'notes', coalesce(p.notes, '')
            ) order by p.sort_order, p.item)
            from public.purchase_items p
            where p.unit_id = u.id
          ), '[]'::jsonb)
        )
        order by u.city, u.state
      )
      from public.units u
    ), '[]'::jsonb),
    'accreditation', jsonb_build_object(
      'sourceFile', 'Supabase',
      'units', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'owner', coalesce(owner_name, '')) order by name)
        from public.accreditation_units
      ), '[]'::jsonb),
      'procedures', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ap.id,
          'group', ap.group_name,
          'name', ap.name,
          'statuses', coalesce((
            select jsonb_object_agg(acs.unit_id, acs.status)
            from public.accreditation_statuses acs
            where acs.procedure_id = ap.id
          ), '{}'::jsonb)
        ) order by ap.sort_order, ap.name)
        from public.accreditation_procedures ap
      ), '[]'::jsonb)
    ),
    'modelTasks', coalesce((
      select jsonb_agg(jsonb_build_object('phase', phase, 'item', coalesce(item, ''), 'process', process) order by sort_order)
      from public.roadmap_task_templates
    ), '[]'::jsonb),
    'purchaseItems', coalesce((
      select jsonb_agg(item order by sort_order, item)
      from public.purchase_item_templates
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_task_status(p_token text, p_task_id text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.require_app_user(p_token);

  update public.roadmap_tasks
  set status = p_status
  where id = p_task_id;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (v_user_id, 'roadmap_task', p_task_id, 'update_status', jsonb_build_object('status', p_status));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.update_purchase_status(p_token text, p_purchase_id text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.require_app_user(p_token);

  update public.purchase_items
  set status = p_status
  where id = p_purchase_id;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (v_user_id, 'purchase_item', p_purchase_id, 'update_status', jsonb_build_object('status', p_status));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.create_unit_from_template(
  p_token text,
  p_city text,
  p_state text,
  p_franchisee text,
  p_opening_date date,
  p_owner_name text default null,
  p_priority text default 'Normal'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_unit_id text;
  v_name text;
begin
  v_user_id := public.require_app_user(p_token);
  v_unit_id := public.slugify(concat_ws('-', p_city, p_state));
  v_name := trim(concat(upper(p_city), ' ', upper(coalesce(p_state, ''))));

  if exists (select 1 from public.units where id = v_unit_id) then
    v_unit_id := v_unit_id || '-' || substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 6);
  end if;

  insert into public.units (id, name, city, state, franchisee, opening_date, source_file, owner_name, priority)
  values (v_unit_id, v_name, initcap(trim(p_city)), upper(trim(p_state)), p_franchisee, p_opening_date, 'Criado no sistema', p_owner_name, p_priority);

  insert into public.roadmap_tasks (id, unit_id, template_id, item, phase, process, status, sort_order)
  select
    v_unit_id || '-task-' || sort_order,
    v_unit_id,
    id,
    item,
    phase,
    process,
    'Pendente',
    sort_order
  from public.roadmap_task_templates
  order by sort_order;

  insert into public.purchase_items (id, unit_id, template_id, item, status, sort_order)
  select
    v_unit_id || '-purchase-' || sort_order,
    v_unit_id,
    id,
    item,
    'Pendente',
    sort_order
  from public.purchase_item_templates
  order by sort_order;

  insert into public.accreditation_units (id, name, owner_name)
  values (v_unit_id, upper(trim(p_city)), p_owner_name)
  on conflict (id) do update set name = excluded.name, owner_name = excluded.owner_name;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (v_user_id, 'unit', v_unit_id, 'create_from_template', jsonb_build_object('city', p_city, 'state', p_state));

  return jsonb_build_object('ok', true, 'unitId', v_unit_id);
end;
$$;

grant execute on function public.login_app_user(text, text) to anon, authenticated;
grant execute on function public.logout_app_user(text) to anon, authenticated;
grant execute on function public.get_app_data(text) to anon, authenticated;
grant execute on function public.update_task_status(text, text, text) to anon, authenticated;
grant execute on function public.update_purchase_status(text, text, text) to anon, authenticated;
grant execute on function public.create_unit_from_template(text, text, text, text, date, text, text) to anon, authenticated;
