create table if not exists public.module_records (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id text references public.units(id) on delete cascade,
  module_code text not null references public.module_catalog(code) on delete restrict,
  record_type text not null,
  title text not null,
  status text not null default 'Ativo',
  payload jsonb not null default '{}'::jsonb,
  public_slug text unique,
  archived boolean not null default false,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.module_records enable row level security;

drop trigger if exists touch_module_records_updated_at on public.module_records;
create trigger touch_module_records_updated_at before update on public.module_records
for each row execute function public.touch_updated_at();

create index if not exists module_records_tenant_module_idx
  on public.module_records (tenant_id, module_code, record_type, created_at desc)
  where archived = false;

create index if not exists module_records_unit_idx
  on public.module_records (unit_id, module_code)
  where archived = false;

create or replace function public.require_module_access(
  p_user_id uuid,
  p_tenant_id uuid,
  p_module_code text,
  p_manage boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_tenant(p_user_id, p_tenant_id) then
    raise exception 'Você não possui acesso a esta franquia' using errcode = '42501';
  end if;

  if not public.is_platform_admin(p_user_id) and not exists (
    select 1 from public.tenant_modules tm
    where tm.tenant_id = p_tenant_id
      and tm.module_code = p_module_code
      and tm.status = 'active'
  ) then
    raise exception 'Este módulo não está ativo para a franquia' using errcode = '42501';
  end if;

  if p_manage and not public.can_manage_tenant(p_user_id, p_tenant_id) then
    raise exception 'Seu perfil não pode alterar este módulo' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.get_module_records(
  p_token text,
  p_tenant_id uuid,
  p_module_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.require_app_user(p_token);
  perform public.require_module_access(v_user_id, p_tenant_id, p_module_code, false);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'tenantId', r.tenant_id,
      'unitId', r.unit_id,
      'moduleCode', r.module_code,
      'recordType', r.record_type,
      'title', r.title,
      'status', r.status,
      'payload', r.payload,
      'publicSlug', r.public_slug,
      'createdAt', r.created_at,
      'updatedAt', r.updated_at
    ) order by r.created_at desc)
    from public.module_records r
    where r.tenant_id = p_tenant_id
      and r.module_code = p_module_code
      and r.archived = false
  ), '[]'::jsonb);
end;
$$;

create or replace function public.upsert_module_record(
  p_token text,
  p_tenant_id uuid,
  p_unit_id text,
  p_module_code text,
  p_record_type text,
  p_title text,
  p_status text,
  p_payload jsonb,
  p_record_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_record public.module_records%rowtype;
begin
  v_user_id := public.require_app_user(p_token);
  perform public.require_module_access(v_user_id, p_tenant_id, p_module_code, true);

  if p_unit_id is not null and not exists (
    select 1 from public.units u where u.id = p_unit_id and u.tenant_id = p_tenant_id
  ) then
    raise exception 'A unidade não pertence à franquia selecionada' using errcode = '42501';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'O título do registro é obrigatório';
  end if;

  if p_record_id is null then
    insert into public.module_records (
      tenant_id, unit_id, module_code, record_type, title, status, payload,
      public_slug, created_by, updated_by
    ) values (
      p_tenant_id, p_unit_id, p_module_code, p_record_type, trim(p_title),
      coalesce(nullif(trim(p_status), ''), 'Ativo'), coalesce(p_payload, '{}'::jsonb),
      case when p_module_code = 'hr' and p_record_type = 'vacancy'
        then lower(regexp_replace(trim(p_title), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(extensions.gen_random_uuid()::text, 1, 8)
        else null end,
      v_user_id, v_user_id
    ) returning * into v_record;
  else
    update public.module_records
    set unit_id = p_unit_id,
        title = trim(p_title),
        status = coalesce(nullif(trim(p_status), ''), status),
        payload = coalesce(p_payload, '{}'::jsonb),
        updated_by = v_user_id,
        archived = false
    where id = p_record_id
      and tenant_id = p_tenant_id
      and module_code = p_module_code
    returning * into v_record;

    if v_record.id is null then
      raise exception 'Registro não encontrado' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (v_user_id, 'module_record', v_record.id::text, case when p_record_id is null then 'create' else 'update' end,
    jsonb_build_object('tenantId', p_tenant_id, 'moduleCode', p_module_code, 'recordType', p_record_type));

  return jsonb_build_object(
    'id', v_record.id, 'tenantId', v_record.tenant_id, 'unitId', v_record.unit_id,
    'moduleCode', v_record.module_code, 'recordType', v_record.record_type,
    'title', v_record.title, 'status', v_record.status, 'payload', v_record.payload,
    'publicSlug', v_record.public_slug, 'createdAt', v_record.created_at, 'updatedAt', v_record.updated_at
  );
end;
$$;

create or replace function public.delete_module_record(
  p_token text,
  p_tenant_id uuid,
  p_module_code text,
  p_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.require_app_user(p_token);
  perform public.require_module_access(v_user_id, p_tenant_id, p_module_code, true);

  update public.module_records
  set archived = true, updated_by = v_user_id
  where id = p_record_id and tenant_id = p_tenant_id and module_code = p_module_code;

  if not found then raise exception 'Registro não encontrado' using errcode = 'P0002'; end if;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (v_user_id, 'module_record', p_record_id::text, 'archive', jsonb_build_object('moduleCode', p_module_code));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on table public.module_records from anon, authenticated;
revoke execute on function public.require_module_access(uuid, uuid, text, boolean) from public;
grant execute on function public.get_module_records(text, uuid, text) to anon, authenticated;
grant execute on function public.upsert_module_record(text, uuid, text, text, text, text, text, jsonb, uuid) to anon, authenticated;
grant execute on function public.delete_module_record(text, uuid, text, uuid) to anon, authenticated;
