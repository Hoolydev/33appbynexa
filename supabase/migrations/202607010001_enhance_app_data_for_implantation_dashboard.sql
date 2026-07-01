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
