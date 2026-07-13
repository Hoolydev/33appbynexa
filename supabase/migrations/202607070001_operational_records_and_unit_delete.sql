create table if not exists public.unit_operational_records (
  unit_id text not null references public.units(id) on delete cascade,
  record_type text not null,
  record_id text not null,
  payload jsonb not null default '{}'::jsonb,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (unit_id, record_type, record_id)
);

alter table public.unit_operational_records enable row level security;

drop trigger if exists touch_unit_operational_records_updated_at on public.unit_operational_records;
create trigger touch_unit_operational_records_updated_at before update on public.unit_operational_records
for each row execute function public.touch_updated_at();

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
  v_record public.unit_operational_records%rowtype;
begin
  v_user_id := public.require_app_user(p_token);

  insert into public.unit_operational_records (unit_id, record_type, record_id, payload, hidden)
  values (p_unit_id, p_record_type, p_record_id, coalesce(p_payload, '{}'::jsonb), false)
  on conflict (unit_id, record_type, record_id) do update
    set payload = coalesce(p_payload, '{}'::jsonb),
        hidden = false
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
begin
  v_user_id := public.require_app_user(p_token);

  insert into public.unit_operational_records (unit_id, record_type, record_id, hidden)
  values (p_unit_id, p_record_type, p_record_id, true)
  on conflict (unit_id, record_type, record_id) do update
    set hidden = true;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (
    v_user_id,
    'unit_operational_record',
    p_unit_id || ':' || p_record_type || ':' || p_record_id,
    'hide',
    jsonb_build_object('hidden', true)
  );

  return jsonb_build_object(
    'unitId', p_unit_id,
    'recordType', p_record_type,
    'recordId', p_record_id,
    'hidden', true
  );
end;
$$;

create or replace function public.delete_franchise_unit(
  p_token text,
  p_unit_id text
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

  delete from public.accreditation_statuses where unit_id = p_unit_id;
  delete from public.accreditation_units where id = p_unit_id;
  delete from public.unit_operational_records where unit_id = p_unit_id;
  delete from public.units where id = p_unit_id;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (v_user_id, 'unit', p_unit_id, 'delete', jsonb_build_object('unitId', p_unit_id));

  return jsonb_build_object('ok', true, 'unitId', p_unit_id);
end;
$$;

grant execute on function public.update_unit_operational_record(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.delete_unit_operational_record(text, text, text, text) to anon, authenticated;
grant execute on function public.delete_franchise_unit(text, text) to anon, authenticated;

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
    'userProfile', coalesce((
      select jsonb_build_object(
        'name', coalesce(nullif(p.display_name, ''), nullif(u.name, ''), split_part(u.email, '@', 1), 'Usuário Nexa'),
        'photo', coalesce(p.photo_data, '')
      )
      from public.app_users u
      left join public.app_user_profiles p on p.user_id = u.id
      where u.id = v_user_id
    ), jsonb_build_object('name', 'Usuário Nexa', 'photo', '')),
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
          'ownerName', coalesce(u.owner_name, ''),
          'priority', coalesce(u.priority, 'Normal'),
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
    'operationalRecords', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'unitId', r.unit_id,
          'recordType', r.record_type,
          'recordId', r.record_id,
          'hidden', r.hidden
        ) || r.payload
        order by r.updated_at desc
      )
      from public.unit_operational_records r
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
              and not coalesce(acs.hidden, false)
          ), '{}'::jsonb),
          'details', coalesce((
            select jsonb_object_agg(
              acs.unit_id,
              jsonb_build_object(
                'status', acs.status,
                'requestDate', coalesce(acs.request_date::text, ''),
                'approvalDate', coalesce(acs.approval_date::text, ''),
                'owner', coalesce(acs.owner_name, ''),
                'attachments', coalesce(acs.attachments, ''),
                'notes', coalesce(acs.notes, ''),
                'hidden', coalesce(acs.hidden, false)
              )
            )
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

grant execute on function public.get_app_data(text) to anon, authenticated;
