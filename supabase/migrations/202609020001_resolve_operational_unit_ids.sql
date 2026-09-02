create or replace function public.resolve_operational_unit_id(p_unit_reference text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_id text;
begin
  select u.id
  into v_unit_id
  from public.units u
  where u.id = nullif(trim(p_unit_reference), '')
     or u.tenant_id::text = nullif(trim(p_unit_reference), '')
  order by case when u.id = nullif(trim(p_unit_reference), '') then 0 else 1 end,
           u.created_at asc
  limit 1;

  if v_unit_id is null then
    raise exception 'Franquia não encontrada: referência de unidade inválida'
      using errcode = 'P0002';
  end if;

  return v_unit_id;
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
  v_unit_id text;
  v_module_code text;
  v_record public.unit_operational_records%rowtype;
begin
  v_user_id := public.require_app_user(p_token);
  v_unit_id := public.resolve_operational_unit_id(p_unit_id);
  v_module_code := case
    when p_record_type like 'department:hr:%' then 'hr'
    when p_record_type like 'department:dp:%' then 'dp'
    when p_record_type like 'department:finance:%' then 'finance'
    when p_record_type like 'department:accounting:%' then 'accounting'
    else 'business'
  end;
  perform public.require_unit_edit_access(v_user_id, v_unit_id, v_module_code);

  insert into public.unit_operational_records (unit_id, record_type, record_id, payload, hidden)
  values (v_unit_id, p_record_type, p_record_id, coalesce(p_payload, '{}'::jsonb), false)
  on conflict (unit_id, record_type, record_id) do update
    set payload = excluded.payload, hidden = false
  returning * into v_record;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (
    v_user_id,
    'unit_operational_record',
    v_unit_id || ':' || p_record_type || ':' || p_record_id,
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

create or replace function public.delete_unit_operational_record(
  p_token text,
  p_unit_id text,
  p_record_type text,
  p_record_id text
)
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
  v_unit_id := public.resolve_operational_unit_id(p_unit_id);
  perform public.require_unit_edit_access(v_user_id, v_unit_id, 'business');

  insert into public.unit_operational_records (unit_id, record_type, record_id, hidden)
  values (v_unit_id, p_record_type, p_record_id, true)
  on conflict (unit_id, record_type, record_id) do update set hidden = true;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (
    v_user_id,
    'unit_operational_record',
    v_unit_id || ':' || p_record_type || ':' || p_record_id,
    'hide',
    jsonb_build_object('hidden', true)
  );

  return jsonb_build_object(
    'unitId', v_unit_id,
    'recordType', p_record_type,
    'recordId', p_record_id,
    'hidden', true
  );
end;
$$;

revoke all on function public.resolve_operational_unit_id(text) from public, anon, authenticated;
grant execute on function public.update_unit_operational_record(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.delete_unit_operational_record(text, text, text, text) to anon, authenticated;
