alter table public.accreditation_statuses
  add column if not exists request_date date,
  add column if not exists approval_date date,
  add column if not exists attachments text,
  add column if not exists notes text,
  add column if not exists hidden boolean not null default false;

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

  insert into public.accreditation_statuses (
    procedure_id,
    unit_id,
    status,
    request_date,
    approval_date,
    owner_name,
    attachments,
    notes,
    hidden
  )
  values (
    p_procedure_id,
    p_unit_id,
    coalesce(nullif(btrim(p_status), ''), 'Pendente'),
    p_request_date,
    p_approval_date,
    nullif(btrim(p_owner_name), ''),
    nullif(btrim(p_attachments), ''),
    nullif(btrim(p_notes), ''),
    false
  )
  on conflict (procedure_id, unit_id) do update
    set status = excluded.status,
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
    jsonb_build_object(
      'status', v_record.status,
      'requestDate', v_record.request_date,
      'approvalDate', v_record.approval_date,
      'ownerName', v_record.owner_name,
      'attachments', v_record.attachments,
      'notes', v_record.notes
    )
  );

  return jsonb_build_object(
    'unitId', v_record.unit_id,
    'procedureId', v_record.procedure_id,
    'status', v_record.status,
    'requestDate', coalesce(v_record.request_date::text, ''),
    'approvalDate', coalesce(v_record.approval_date::text, ''),
    'owner', coalesce(v_record.owner_name, ''),
    'attachments', coalesce(v_record.attachments, ''),
    'notes', coalesce(v_record.notes, ''),
    'hidden', v_record.hidden
  );
end;
$$;

create or replace function public.delete_accreditation_record(
  p_token text,
  p_unit_id text,
  p_procedure_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_existing_status text;
begin
  v_user_id := public.require_app_user(p_token);

  select status
  into v_existing_status
  from public.accreditation_statuses
  where unit_id = p_unit_id
    and procedure_id = p_procedure_id;

  insert into public.accreditation_statuses (procedure_id, unit_id, status, hidden)
  values (p_procedure_id, p_unit_id, coalesce(v_existing_status, 'Oculto'), true)
  on conflict (procedure_id, unit_id) do update
    set hidden = true;

  insert into public.audit_events (user_id, entity_type, entity_id, action, payload)
  values (
    v_user_id,
    'accreditation_status',
    p_unit_id || ':' || p_procedure_id,
    'hide',
    jsonb_build_object('hidden', true)
  );

  return jsonb_build_object(
    'unitId', p_unit_id,
    'procedureId', p_procedure_id,
    'hidden', true
  );
end;
$$;

grant execute on function public.update_accreditation_record(text, text, text, text, date, date, text, text, text) to anon, authenticated;
grant execute on function public.delete_accreditation_record(text, text, text) to anon, authenticated;

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
