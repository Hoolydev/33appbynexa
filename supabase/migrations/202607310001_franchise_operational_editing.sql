-- Libera a operação diária para usuários da franquia sem conceder poderes
-- administrativos ou de exclusão. Negócios/Implantação é editável por padrão.

create or replace function public.can_edit_tenant(
  p_user_id uuid,
  p_tenant_id uuid,
  p_module_code text default 'business'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(p_user_id) or exists (
    select 1
    from public.tenant_memberships tm
    join public.tenants t on t.id = tm.tenant_id
    where tm.user_id = p_user_id
      and tm.tenant_id = p_tenant_id
      and tm.active = true
      and t.status = 'active'
      and (
        tm.role in ('franchise_admin', 'manager')
        or p_module_code = 'business'
        or exists (
          select 1
          from public.membership_module_permissions mp
          where mp.tenant_id = tm.tenant_id
            and mp.user_id = tm.user_id
            and mp.module_code = p_module_code
            and mp.can_view = true
            and mp.can_edit = true
        )
      )
  );
$$;

-- A identificação ampla de usuário da franqueadora não deve conceder poder
-- de exclusão aos perfis de gestão e operação.
create or replace function public.can_manage_tenant(p_user_id uuid, p_tenant_id uuid)
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
        u.franchisor_role = 'admin'
        or lower(u.role) in ('admin', 'platform_admin')
      )
  ) or exists (
    select 1
    from public.tenant_memberships tm
    where tm.user_id = p_user_id
      and tm.tenant_id = p_tenant_id
      and tm.active = true
      and tm.role in ('franchise_admin', 'manager')
  );
$$;

create or replace function public.require_unit_edit_access(
  p_user_id uuid,
  p_unit_id text,
  p_module_code text default 'business'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from public.units
  where id = p_unit_id;

  if v_tenant_id is null then
    raise exception 'Franquia não encontrada' using errcode = 'P0002';
  end if;

  if not public.can_edit_tenant(p_user_id, v_tenant_id, p_module_code) then
    raise exception 'Você não possui permissão para editar esta operação' using errcode = '42501';
  end if;

  return v_tenant_id;
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
  v_unit_id text;
begin
  v_user_id := public.require_app_user(p_token);
  select unit_id into v_unit_id from public.roadmap_tasks where id = p_task_id;
  perform public.require_unit_edit_access(v_user_id, v_unit_id, 'business');
  update public.roadmap_tasks set status = p_status where id = p_task_id;
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
  v_unit_id text;
begin
  v_user_id := public.require_app_user(p_token);
  select unit_id into v_unit_id from public.purchase_items where id = p_purchase_id;
  perform public.require_unit_edit_access(v_user_id, v_unit_id, 'business');
  update public.purchase_items set status = p_status where id = p_purchase_id;
  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (v_user_id, 'purchase_item', p_purchase_id, 'update_status', jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.update_unit_operational_record(
  p_token text,
  p_unit_id text,
  p_record_type text,
  p_record_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_module_code text;
  v_record public.unit_operational_records%rowtype;
begin
  v_user_id := public.require_app_user(p_token);
  v_module_code := case
    when p_record_type like 'department:hr:%' then 'hr'
    when p_record_type like 'department:dp:%' then 'dp'
    when p_record_type like 'department:finance:%' then 'finance'
    when p_record_type like 'department:accounting:%' then 'accounting'
    else 'business'
  end;
  perform public.require_unit_edit_access(v_user_id, p_unit_id, v_module_code);

  insert into public.unit_operational_records (unit_id, record_type, record_id, payload, hidden)
  values (p_unit_id, p_record_type, p_record_id, coalesce(p_payload, '{}'::jsonb), false)
  on conflict (unit_id, record_type, record_id) do update
    set payload = excluded.payload, hidden = false
  returning * into v_record;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (
    v_user_id,
    'unit_operational_record',
    p_unit_id || ':' || p_record_type || ':' || p_record_id,
    'update',
    v_record.payload
  );

  return jsonb_build_object(
    'unitId', v_record.unit_id,
    'recordType', v_record.record_type,
    'recordId', v_record.record_id,
    'hidden', v_record.hidden
  ) || v_record.payload;
end;
$$;

create or replace function public.update_accreditation_record(
  p_token text,
  p_unit_id text,
  p_procedure_id text,
  p_status text,
  p_request_date date default null,
  p_approval_date date default null,
  p_owner_name text default null,
  p_attachments text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_record public.accreditation_statuses%rowtype;
begin
  v_user_id := public.require_app_user(p_token);
  perform public.require_unit_edit_access(v_user_id, p_unit_id, 'business');

  insert into public.accreditation_statuses (
    procedure_id, unit_id, status, request_date, approval_date,
    owner_name, attachments, notes, hidden
  ) values (
    p_procedure_id, p_unit_id, p_status, p_request_date, p_approval_date,
    p_owner_name, p_attachments, p_notes, false
  )
  on conflict (procedure_id, unit_id) do update set
    status = excluded.status,
    request_date = excluded.request_date,
    approval_date = excluded.approval_date,
    owner_name = excluded.owner_name,
    attachments = excluded.attachments,
    notes = excluded.notes,
    hidden = false
  returning * into v_record;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (
    v_user_id,
    'accreditation_status',
    p_unit_id || ':' || p_procedure_id,
    'update',
    jsonb_build_object('status', p_status)
  );
  return jsonb_build_object('ok', true, 'unitId', v_record.unit_id, 'procedureId', v_record.procedure_id);
end;
$$;

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

  if p_manage and not public.can_edit_tenant(p_user_id, p_tenant_id, p_module_code) then
    raise exception 'Seu perfil não pode alterar este módulo' using errcode = '42501';
  end if;
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
  perform public.require_module_access(v_user_id, p_tenant_id, p_module_code, false);

  if not public.can_manage_tenant(v_user_id, p_tenant_id) then
    raise exception 'Seu perfil não pode excluir registros deste módulo' using errcode = '42501';
  end if;

  update public.module_records
  set archived = true, updated_by = v_user_id
  where id = p_record_id
    and tenant_id = p_tenant_id
    and module_code = p_module_code;

  if not found then
    raise exception 'Registro não encontrado' using errcode = 'P0002';
  end if;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (v_user_id, 'module_record', p_record_id::text, 'archive', jsonb_build_object('moduleCode', p_module_code));
  return jsonb_build_object('ok', true);
end;
$$;

-- Upload e leitura são operações diárias. Usuários ativos da franqueadora e
-- membros da franquia podem anexar; remoção continua sendo administrativa.
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
  v_platform_access boolean;
  v_platform_manage boolean;
  v_tenant_role text;
begin
  v_user_id := public.require_app_user(p_token);

  select
    (
      u.franchisor_role in ('admin', 'gestao', 'user')
      or lower(u.role) in ('admin', 'platform_admin', 'platform_gestao', 'platform_user')
    ),
    (
      u.franchisor_role = 'admin'
      or lower(u.role) in ('admin', 'platform_admin')
    )
  into v_platform_access, v_platform_manage
  from public.app_users u
  where u.id = v_user_id and u.active = true;

  select lower(tm.role)
  into v_tenant_role
  from public.tenant_memberships tm
  where tm.tenant_id = p_tenant_id
    and tm.user_id = v_user_id
    and tm.active = true;

  if not coalesce(v_platform_access, false) and v_tenant_role is null then
    raise exception 'Usuário sem acesso a esta franquia' using errcode = '42501';
  end if;

  if p_unit_id is not null and not exists (
    select 1 from public.units
    where id = p_unit_id and tenant_id = p_tenant_id
  ) then
    raise exception 'Unidade não pertence à franquia informada' using errcode = '42501';
  end if;

  if lower(p_action) in ('delete', 'manage')
     and not coalesce(v_platform_manage, false)
     and coalesce(v_tenant_role, '') not in ('franchise_admin', 'manager') then
    raise exception 'Seu perfil não pode excluir arquivos' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'userId', v_user_id,
    'tenantId', p_tenant_id,
    'role', case when coalesce(v_platform_access, false) then 'platform_user' else v_tenant_role end,
    'action', lower(p_action)
  );
end;
$$;

revoke execute on function public.can_edit_tenant(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.require_unit_edit_access(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.can_manage_tenant(uuid, uuid) from public, anon, authenticated;

grant execute on function public.update_task_status(text, text, text) to anon, authenticated;
grant execute on function public.update_purchase_status(text, text, text) to anon, authenticated;
grant execute on function public.update_unit_operational_record(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.update_accreditation_record(text, text, text, text, date, date, text, text, text) to anon, authenticated;
grant execute on function public.upsert_module_record(text, uuid, text, text, text, text, text, jsonb, uuid) to anon, authenticated;
grant execute on function public.delete_module_record(text, uuid, text, uuid) to anon, authenticated;
grant execute on function public.authorize_tenant_file(text, uuid, text, text) to anon, authenticated;
