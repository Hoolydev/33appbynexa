-- A franquia pode manter dados, anexos e observações do credenciamento, mas
-- somente usuários da franqueadora podem alterar a etapa/status da pipeline.
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
  v_unit_id text;
  v_existing_status text;
  v_effective_status text;
  v_can_move_pipeline boolean;
  v_record public.accreditation_statuses%rowtype;
begin
  v_user_id := public.require_app_user(p_token);
  v_unit_id := public.resolve_operational_unit_id(p_unit_id);
  perform public.require_unit_edit_access(v_user_id, v_unit_id, 'business');

  v_can_move_pipeline := public.is_platform_admin(v_user_id);

  select status
  into v_existing_status
  from public.accreditation_statuses
  where procedure_id = p_procedure_id
    and unit_id = v_unit_id;

  v_effective_status := case
    when v_can_move_pipeline then coalesce(nullif(trim(p_status), ''), v_existing_status, 'Pendente')
    else coalesce(v_existing_status, 'Pendente')
  end;

  insert into public.accreditation_statuses (
    procedure_id, unit_id, status, request_date, approval_date,
    owner_name, attachments, notes, hidden
  ) values (
    p_procedure_id, v_unit_id, v_effective_status, p_request_date, p_approval_date,
    p_owner_name, p_attachments, p_notes, false
  )
  on conflict (procedure_id, unit_id) do update set
    status = v_effective_status,
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
    v_unit_id || ':' || p_procedure_id,
    'update',
    jsonb_build_object(
      'status', v_effective_status,
      'pipelineMovementAllowed', v_can_move_pipeline
    )
  );

  return jsonb_build_object(
    'ok', true,
    'unitId', v_record.unit_id,
    'procedureId', v_record.procedure_id,
    'status', v_record.status
  );
end;
$$;

grant execute on function public.update_accreditation_record(
  text, text, text, text, date, date, text, text, text
) to anon, authenticated;
