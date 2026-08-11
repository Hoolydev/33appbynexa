-- Expõe ao painel administrativo os campos editáveis do perfil.
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
      'canEditUsers', v_franchisor_role = 'admin',
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
          'regional', coalesce(u.regional, ''),
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

grant execute on function public.get_portal_data(text) to anon, authenticated;
