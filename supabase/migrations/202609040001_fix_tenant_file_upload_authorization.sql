-- Mantém a autorização de arquivos alinhada aos perfis atuais da plataforma.
-- Usuários da franqueadora podem operar os documentos da rede; membros ativos
-- da franquia podem anexar no módulo de negócios. Exclusão continua restrita.
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
  v_action text := lower(coalesce(nullif(trim(p_action), ''), 'read'));
  v_platform_role text;
  v_tenant_role text;
  v_unit_id text;
  v_is_franchisor boolean := false;
begin
  v_user_id := public.require_app_user(p_token);

  select
    coalesce(
      nullif(lower(u.franchisor_role), ''),
      case lower(u.role)
        when 'admin' then 'admin'
        when 'platform_admin' then 'admin'
        when 'platform_gestao' then 'gestao'
        when 'platform_user' then 'user'
        else null
      end
    )
  into v_platform_role
  from public.app_users u
  where u.id = v_user_id
    and u.active = true;

  v_is_franchisor := coalesce(v_platform_role in ('admin', 'gestao', 'user'), false);

  select lower(tm.role)
  into v_tenant_role
  from public.tenant_memberships tm
  join public.tenants t on t.id = tm.tenant_id
  where tm.tenant_id = p_tenant_id
    and tm.user_id = v_user_id
    and tm.active = true
    and t.status = 'active';

  if not v_is_franchisor and v_tenant_role is null then
    raise exception 'Usuário sem acesso a esta franquia' using errcode = '42501';
  end if;

  if p_unit_id is not null and nullif(trim(p_unit_id), '') is not null then
    select u.id
    into v_unit_id
    from public.units u
    where u.tenant_id = p_tenant_id
      and (
        u.id = trim(p_unit_id)
        or u.tenant_id::text = trim(p_unit_id)
      )
    order by case when u.id = trim(p_unit_id) then 0 else 1 end,
             u.created_at asc
    limit 1;

    if v_unit_id is null then
      raise exception 'Unidade não pertence à franquia informada' using errcode = '42501';
    end if;
  end if;

  if v_action = 'upload'
     and not v_is_franchisor
     and v_tenant_role not in ('franchise_admin', 'manager', 'user') then
    raise exception 'Seu perfil não pode anexar arquivos' using errcode = '42501';
  end if;

  if v_action in ('delete', 'manage')
     and not (
       v_platform_role = 'admin'
       or v_tenant_role in ('franchise_admin', 'manager')
     ) then
    raise exception 'Seu perfil não pode excluir arquivos' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'userId', v_user_id,
    'tenantId', p_tenant_id,
    'unitId', v_unit_id,
    'role', case when v_is_franchisor then v_platform_role else v_tenant_role end,
    'action', v_action
  );
end;
$$;

revoke execute on function public.authorize_tenant_file(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.authorize_tenant_file(text, uuid, text, text)
  to service_role;
