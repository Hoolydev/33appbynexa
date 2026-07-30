-- Supabase Authentication passa a ser a fonte oficial de identidade.
-- app_users permanece como perfil de autorização e vínculo com os tenants.

alter table public.app_users
  add column if not exists auth_user_id uuid,
  add column if not exists franchisor_role text,
  add column if not exists job_title text;

update public.app_users
set job_title = ''
where job_title is null;

alter table public.app_users
  alter column job_title set default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_auth_user_id_fkey'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_franchisor_role_check'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_franchisor_role_check
      check (franchisor_role is null or franchisor_role in ('admin', 'gestao', 'user'));
  end if;
end
$$;

create unique index if not exists app_users_auth_user_id_key
  on public.app_users (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists app_users_email_lower_key
  on public.app_users (lower(email));

update public.app_users
set franchisor_role = 'admin',
    role = 'platform_admin'
where franchisor_role is null
  and lower(role) in ('admin', 'platform_admin');

create or replace function public.sync_33doctor_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuário 33Doctor'
  );

  update public.app_users
  set auth_user_id = new.id,
      email = lower(new.email),
      name = coalesce(nullif(name, ''), v_name),
      active = true,
      updated_at = now()
  where lower(email) = lower(new.email)
    and (auth_user_id is null or auth_user_id = new.id);

  if not found then
    insert into public.app_users (
      auth_user_id,
      email,
      password_hash,
      name,
      role,
      active,
      job_title
    )
    values (
      new.id,
      lower(new.email),
      extensions.crypt(
        encode(extensions.gen_random_bytes(32), 'hex'),
        extensions.gen_salt('bf')
      ),
      v_name,
      'tenant_user',
      true,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'job_title'), ''), '')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_33doctor on auth.users;
create trigger on_auth_user_created_33doctor
after insert on auth.users
for each row execute function public.sync_33doctor_auth_user();

-- Vincula também as identidades que já existiam no Authentication antes
-- desta migration. Perfis e memberships existentes são preservados.
do $$
declare
  v_auth_user record;
  v_name text;
begin
  for v_auth_user in
    select id, email, raw_user_meta_data
    from auth.users
    where email is not null
  loop
    v_name := coalesce(
      nullif(trim(v_auth_user.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(v_auth_user.email, '@', 1), ''),
      'Usuário 33Doctor'
    );

    update public.app_users
    set auth_user_id = v_auth_user.id,
        active = true,
        updated_at = now()
    where lower(email) = lower(v_auth_user.email)
      and (auth_user_id is null or auth_user_id = v_auth_user.id);

    if not found then
      insert into public.app_users (
        auth_user_id,
        email,
        password_hash,
        name,
        role,
        active,
        job_title
      )
      values (
        v_auth_user.id,
        lower(v_auth_user.email),
        extensions.crypt(
          encode(extensions.gen_random_bytes(32), 'hex'),
          extensions.gen_salt('bf')
        ),
        v_name,
        'tenant_user',
        true,
        coalesce(nullif(trim(v_auth_user.raw_user_meta_data ->> 'job_title'), ''), '')
      );
    end if;
  end loop;
end
$$;

-- Neste projeto, "platformAdmin" representa acesso à franqueadora. As ações
-- administrativas sensíveis continuam protegidas por require_platform_admin.
create or replace function public.is_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where u.id = p_user_id
      and u.active = true
      and (
        u.franchisor_role in ('admin', 'gestao', 'user')
        or lower(u.role) in (
          'admin',
          'platform_admin',
          'platform_gestao',
          'platform_user'
        )
      )
  );
$$;

create or replace function public.require_platform_admin(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.require_app_user(p_token);

  if not exists (
    select 1
    from public.app_users u
    where u.id = v_user_id
      and u.active = true
      and (
        u.franchisor_role = 'admin'
        or lower(u.role) in ('admin', 'platform_admin')
      )
  ) then
    raise exception 'Acesso permitido somente para administradores da franqueadora'
      using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;

-- Preserva a consulta consolidada existente e filtra os dados administrativos
-- conforme o cargo da franqueadora.
do $$
begin
  if to_regprocedure('public.get_portal_data_internal(text)') is null then
    alter function public.get_portal_data(text) rename to get_portal_data_internal;
  end if;
end
$$;

create or replace function public.get_portal_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_franchisor_role text;
  v_payload jsonb;
begin
  v_user_id := public.require_app_user(p_token);
  select coalesce(
    franchisor_role,
    case lower(role)
      when 'admin' then 'admin'
      when 'platform_admin' then 'admin'
      when 'platform_gestao' then 'gestao'
      when 'platform_user' then 'user'
      else null
    end
  )
  into v_franchisor_role
  from public.app_users
  where id = v_user_id;

  v_payload := public.get_portal_data_internal(p_token);
  v_payload := jsonb_set(
    v_payload,
    '{accessContext}',
    coalesce(v_payload -> 'accessContext', '{}'::jsonb) || jsonb_build_object(
      'franchisorRole', v_franchisor_role,
      'canCreateUsers', v_franchisor_role in ('admin', 'gestao'),
      'canDeleteUsers', v_franchisor_role = 'admin'
    ),
    true
  );

  if v_franchisor_role in ('admin', 'gestao') then
    v_payload := jsonb_set(
      v_payload,
      '{admin,users}',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', u.id,
          'authUserId', u.auth_user_id,
          'authManaged', u.auth_user_id is not null,
          'name', u.name,
          'email', u.email,
          'platformRole', u.role,
          'franchisorRole', u.franchisor_role,
          'jobTitle', coalesce(u.job_title, ''),
          'active', u.active,
          'memberships', coalesce((
            select jsonb_agg(jsonb_build_object(
              'tenantId', tm.tenant_id,
              'tenantName', t.name,
              'role', tm.role,
              'active', tm.active
            ) order by t.name)
            from public.tenant_memberships tm
            join public.tenants t on t.id = tm.tenant_id
            where tm.user_id = u.id
          ), '[]'::jsonb)
        ) order by u.name, u.email)
        from public.app_users u
      ), '[]'::jsonb),
      true
    );
  elsif v_franchisor_role = 'user' then
    v_payload := v_payload - 'admin';
  end if;

  return v_payload;
end;
$$;

revoke execute on function public.get_portal_data_internal(text)
  from public, anon, authenticated;
grant execute on function public.get_portal_data(text)
  to anon, authenticated;

create or replace function public.create_app_session_for_auth_user(
  p_auth_user_id uuid,
  p_ip_hash text default null,
  p_user_agent_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users%rowtype;
  v_token text;
  v_expires_at timestamptz := now() + interval '8 hours';
begin
  select *
  into v_user
  from public.app_users
  where auth_user_id = p_auth_user_id
    and active = true;

  if v_user.id is null then
    raise exception 'Perfil de acesso não encontrado para este usuário'
      using errcode = '42501';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.app_sessions (user_id, token_hash, expires_at)
  values (
    v_user.id,
    encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    v_expires_at
  );

  delete from public.app_sessions
  where id in (
    select id
    from public.app_sessions
    where user_id = v_user.id
    order by created_at desc
    offset 5
  );

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (
    v_user.id,
    'app_user',
    v_user.id::text,
    'auth_login',
    jsonb_build_object(
      'provider', 'supabase_auth',
      'ipHash', left(coalesce(p_ip_hash, ''), 16),
      'userAgentHash', left(coalesce(p_user_agent_hash, ''), 16)
    )
  );

  return jsonb_build_object(
    'token', v_token,
    'expiresAt', v_expires_at,
    'user', jsonb_build_object(
      'id', v_user.id,
      'authUserId', v_user.auth_user_id,
      'email', v_user.email,
      'name', v_user.name,
      'role', v_user.role,
      'franchisorRole', v_user.franchisor_role,
      'jobTitle', coalesce(v_user.job_title, '')
    )
  );
end;
$$;

create or replace function public.authorize_tenant_file(
  p_token text,
  p_tenant_id uuid,
  p_unit_id text default null,
  p_action text default 'read'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_tenant_role text;
  v_is_platform_user boolean;
begin
  v_user_id := public.require_app_user(p_token);
  v_is_platform_user := public.is_platform_admin(v_user_id);

  select lower(role)
  into v_tenant_role
  from public.tenant_memberships
  where tenant_id = p_tenant_id
    and user_id = v_user_id
    and active = true;

  if not v_is_platform_user and v_tenant_role is null then
    raise exception 'Usuário sem acesso a esta franquia' using errcode = '42501';
  end if;

  if p_unit_id is not null and not exists (
    select 1
    from public.units
    where id = p_unit_id and tenant_id = p_tenant_id
  ) then
    raise exception 'Unidade não pertence à franquia informada' using errcode = '42501';
  end if;

  if lower(p_action) in ('delete', 'manage')
     and not v_is_platform_user
     and v_tenant_role not in ('franchise_admin', 'manager') then
    raise exception 'Seu perfil não pode excluir arquivos' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'userId', v_user_id,
    'tenantId', p_tenant_id,
    'role', case when v_is_platform_user then 'franchisor' else v_tenant_role end,
    'action', lower(p_action)
  );
end;
$$;

create or replace function public.link_auth_user_profile(
  p_auth_user_id uuid,
  p_email text,
  p_name text,
  p_role text,
  p_franchisor_role text default null,
  p_job_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if p_role not in ('platform_admin', 'platform_gestao', 'platform_user', 'tenant_user') then
    raise exception 'Papel de usuário inválido' using errcode = '22023';
  end if;
  if p_franchisor_role is not null
    and p_franchisor_role not in ('admin', 'gestao', 'user') then
    raise exception 'Cargo da franqueadora inválido' using errcode = '22023';
  end if;

  update public.app_users
  set auth_user_id = p_auth_user_id,
      email = lower(trim(p_email)),
      name = trim(p_name),
      role = p_role,
      franchisor_role = p_franchisor_role,
      job_title = trim(coalesce(p_job_title, '')),
      active = true,
      updated_at = now()
  where lower(email) = lower(trim(p_email))
     or auth_user_id = p_auth_user_id
  returning id into v_user_id;

  if v_user_id is null then
    insert into public.app_users (
      auth_user_id,
      email,
      password_hash,
      name,
      role,
      franchisor_role,
      job_title,
      active
    )
    values (
      p_auth_user_id,
      lower(trim(p_email)),
      extensions.crypt(
        encode(extensions.gen_random_bytes(32), 'hex'),
        extensions.gen_salt('bf')
      ),
      trim(p_name),
      p_role,
      p_franchisor_role,
      trim(coalesce(p_job_title, '')),
      true
    )
    returning id into v_user_id;
  end if;

  return jsonb_build_object('id', v_user_id);
end;
$$;

revoke execute on function public.create_app_session_for_auth_user(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_app_session_for_auth_user(uuid, text, text)
  to service_role;
revoke execute on function public.link_auth_user_profile(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.link_auth_user_profile(uuid, text, text, text, text, text)
  to service_role;
revoke execute on function public.authorize_tenant_file(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.authorize_tenant_file(text, uuid, text, text)
  to service_role;

-- A criação de identidades não pode mais ser feita por RPC pública.
revoke execute on function public.admin_create_portal_user(text, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_create_portal_user(text, text, text, text, uuid, text)
  to service_role;

revoke execute on function public.is_platform_admin(uuid)
  from public, anon, authenticated;
revoke execute on function public.require_platform_admin(text)
  from public, anon, authenticated;

comment on column public.app_users.auth_user_id is
  'Identidade oficial correspondente em auth.users.';
comment on column public.app_users.franchisor_role is
  'Papel na franqueadora: admin, gestao ou user. Nulo para usuários de franquias.';
comment on column public.app_users.password_hash is
  'Campo legado. Novas senhas são administradas exclusivamente pelo Supabase Authentication.';
