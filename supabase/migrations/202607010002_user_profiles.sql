create table if not exists public.app_user_profiles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  display_name text not null default '',
  photo_data text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_user_profiles_photo_size check (photo_data is null or char_length(photo_data) <= 5000000)
);

alter table public.app_user_profiles enable row level security;

drop trigger if exists touch_app_user_profiles_updated_at on public.app_user_profiles;
create trigger touch_app_user_profiles_updated_at before update on public.app_user_profiles
for each row execute function public.touch_updated_at();

create or replace function public.update_user_profile(
  p_token text,
  p_display_name text,
  p_photo_data text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_name text;
  v_profile public.app_user_profiles%rowtype;
begin
  v_user_id := public.require_app_user(p_token);

  select coalesce(nullif(btrim(p_display_name), ''), nullif(btrim(name), ''), split_part(email, '@', 1), 'Usuário Nexa')
  into v_name
  from public.app_users
  where id = v_user_id;

  insert into public.app_user_profiles (user_id, display_name, photo_data)
  values (v_user_id, v_name, p_photo_data)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        photo_data = case
          when p_photo_data is null then public.app_user_profiles.photo_data
          else excluded.photo_data
        end
  returning * into v_profile;

  update public.app_users
  set name = v_profile.display_name
  where id = v_user_id;

  return jsonb_build_object(
    'name', v_profile.display_name,
    'photo', coalesce(v_profile.photo_data, '')
  );
end;
$$;

grant execute on function public.update_user_profile(text, text, text) to anon, authenticated;

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
