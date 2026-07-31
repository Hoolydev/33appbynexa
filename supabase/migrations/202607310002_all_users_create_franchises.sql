-- Permite que qualquer usuário autenticado e ativo cadastre uma franquia.
-- Usuários de franquia recebem acesso operacional mínimo à unidade criada;
-- permissões administrativas e exclusão continuam restritas.

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
  v_tenant_id uuid;
  v_is_franchisor_user boolean;
begin
  v_user_id := public.require_app_user(p_token);

  if nullif(trim(p_city), '') is null then
    raise exception 'Informe a cidade da franquia' using errcode = '22023';
  end if;

  if p_opening_date is null then
    raise exception 'Informe a inauguração estimada' using errcode = '22023';
  end if;

  v_unit_id := public.slugify(concat_ws('-', trim(p_city), trim(p_state)));
  v_name := trim(concat(upper(trim(p_city)), ' ', upper(coalesce(trim(p_state), ''))));

  if exists (select 1 from public.units where id = v_unit_id) then
    v_unit_id := v_unit_id || '-' || substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 6);
  end if;

  insert into public.tenants (code, name)
  values (v_unit_id, v_name)
  returning id into v_tenant_id;

  insert into public.units (
    id, tenant_id, name, city, state, franchisee, opening_date,
    source_file, owner_name, priority
  ) values (
    v_unit_id, v_tenant_id, v_name, initcap(trim(p_city)), upper(trim(p_state)),
    p_franchisee, p_opening_date, 'Criado no sistema', p_owner_name,
    coalesce(nullif(trim(p_priority), ''), 'Normal')
  );

  insert into public.roadmap_tasks (
    id, unit_id, template_id, item, phase, process, status, sort_order
  )
  select v_unit_id || '-task-' || sort_order, v_unit_id, id, item, phase,
         process, 'Pendente', sort_order
  from public.roadmap_task_templates
  order by sort_order;

  insert into public.purchase_items (
    id, unit_id, template_id, item, status, sort_order
  )
  select v_unit_id || '-purchase-' || sort_order, v_unit_id, id, item,
         'Pendente', sort_order
  from public.purchase_item_templates
  order by sort_order;

  insert into public.accreditation_units (id, name, owner_name)
  values (v_unit_id, upper(trim(p_city)), p_owner_name);

  insert into public.tenant_modules (
    tenant_id, module_code, status, enabled_at, enabled_by
  )
  select v_tenant_id, code,
         case when default_enabled then 'active' else 'locked' end,
         case when default_enabled then now() else null end,
         case when default_enabled then v_user_id else null end
  from public.module_catalog
  where active = true;

  select public.is_platform_admin(v_user_id)
  into v_is_franchisor_user;

  if not v_is_franchisor_user then
    insert into public.tenant_memberships (tenant_id, user_id, role, active)
    values (v_tenant_id, v_user_id, 'user', true)
    on conflict (tenant_id, user_id) do update
      set active = true,
          updated_at = now();
  end if;

  insert into public.audit_events (
    user_id, entity_type, entity_id, action, payload
  ) values (
    v_user_id,
    'unit',
    v_unit_id,
    'create_from_template',
    jsonb_build_object(
      'tenantId', v_tenant_id,
      'city', trim(p_city),
      'state', upper(trim(p_state)),
      'creatorScope', case when v_is_franchisor_user then 'franchisor' else 'tenant' end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'unitId', v_unit_id,
    'tenantId', v_tenant_id
  );
end;
$$;

revoke execute on function public.create_unit_from_template(text, text, text, text, date, text, text)
  from public;
grant execute on function public.create_unit_from_template(text, text, text, text, date, text, text)
  to anon, authenticated;

comment on function public.create_unit_from_template(text, text, text, text, date, text, text) is
  'Cria uma franquia a partir do template para qualquer usuário autenticado e ativo.';
