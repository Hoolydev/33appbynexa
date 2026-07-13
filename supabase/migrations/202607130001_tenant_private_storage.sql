create table if not exists public.tenant_files (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id text references public.units(id) on delete cascade,
  module_code text not null default 'business',
  category text not null default 'geral',
  original_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0 and size_bytes <= 26214400),
  uploaded_by uuid not null references public.app_users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tenant_files_module_code_check check (module_code in ('business', 'hr', 'dp', 'accounting', 'finance'))
);

alter table public.tenant_files enable row level security;

create index if not exists tenant_files_tenant_created_idx
  on public.tenant_files (tenant_id, created_at desc)
  where deleted_at is null;

create index if not exists tenant_files_unit_module_idx
  on public.tenant_files (unit_id, module_code)
  where deleted_at is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-documents',
  'tenant-documents',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- There are intentionally no anon/authenticated policies on storage.objects.
-- The application uses custom app sessions, so private file operations are
-- brokered by Vercel Functions after this function validates tenant access.
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
  v_platform_role text;
  v_tenant_role text;
  v_is_platform_admin boolean;
begin
  v_user_id := public.require_app_user(p_token);

  select lower(role)
  into v_platform_role
  from public.app_users
  where id = v_user_id and active = true;

  v_is_platform_admin := v_platform_role in ('admin', 'platform_admin');

  select lower(role)
  into v_tenant_role
  from public.tenant_memberships
  where tenant_id = p_tenant_id
    and user_id = v_user_id
    and active = true;

  if not v_is_platform_admin and v_tenant_role is null then
    raise exception 'Usuário sem acesso a esta franquia';
  end if;

  if p_unit_id is not null and not exists (
    select 1 from public.units
    where id = p_unit_id and tenant_id = p_tenant_id
  ) then
    raise exception 'Unidade não pertence à franquia informada';
  end if;

  if lower(p_action) in ('delete', 'manage')
     and not v_is_platform_admin
     and v_tenant_role not in ('franchise_admin', 'manager') then
    raise exception 'Seu perfil não pode excluir arquivos';
  end if;

  return jsonb_build_object(
    'userId', v_user_id,
    'tenantId', p_tenant_id,
    'role', case when v_is_platform_admin then 'platform_admin' else v_tenant_role end,
    'action', lower(p_action)
  );
end;
$$;

revoke all on table public.tenant_files from anon, authenticated;
revoke execute on function public.authorize_tenant_file(text, uuid, text, text) from public;
grant execute on function public.authorize_tenant_file(text, uuid, text, text) to anon, authenticated;

