const { requireAuthenticatedAppUser } = require("../_lib/auth");
const { PublicError, enforceRequest, json, parseBody, securityLog } = require("../_lib/security");

const STAGE_STATUS = Object.freeze({
  "Prospecção": "Pendente",
  "Documentação": "Aguardando documentos",
  "Análise": "Em análise",
  "Negociação": "Em negociação",
  "Contratação": "Fechado",
});

module.exports = async function handler(request, response) {
  if (!enforceRequest(request, response, {
    methods: ["POST"],
    sameOrigin: true,
    maxBodyBytes: 16 * 1024,
    rateLimit: { limit: 60, windowMs: 60 * 1000 },
  })) return;

  try {
    const context = await requireAuthenticatedAppUser(request);
    if (!context.franchisorRole) {
      throw new PublicError("A movimentação da pipeline é exclusiva da franqueadora.", 403);
    }

    const body = parseBody(request, 16 * 1024);
    const unitId = String(body.unitId || "").trim();
    const procedureId = String(body.procedureId || "").trim();
    const stage = String(body.stage || "").trim();
    const status = STAGE_STATUS[stage];
    if (!unitId || !procedureId || !status) {
      throw new PublicError("Unidade, procedimento e etapa válidos são obrigatórios.");
    }

    const { data: unit, error: unitError } = await context.client
      .from("units")
      .select("id")
      .eq("id", unitId)
      .maybeSingle();
    if (unitError) throw unitError;
    if (!unit) throw new PublicError("Franquia não encontrada.", 404);

    const { data: record, error: updateError } = await context.client
      .from("accreditation_statuses")
      .upsert({
        procedure_id: procedureId,
        unit_id: unit.id,
        status,
        hidden: false,
      }, { onConflict: "procedure_id,unit_id" })
      .select("procedure_id, unit_id, status")
      .single();
    if (updateError) throw updateError;

    const { error: auditError } = await context.client.from("audit_events").insert({
      user_id: context.appUser.id,
      entity_type: "accreditation_status",
      entity_id: `${unit.id}:${procedureId}`,
      action: "move_pipeline",
      payload: { stage, status },
    });
    if (auditError) throw auditError;

    securityLog("credential_pipeline_moved", request, {
      userId: context.appUser.id,
      unitId: unit.id,
      procedureId,
      stage,
    });
    json(response, 200, {
      ok: true,
      unitId: record.unit_id,
      procedureId: record.procedure_id,
      status: record.status,
      stage,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (error.expose) {
      json(response, status, { error: error.message });
      return;
    }
    securityLog("credential_pipeline_move_failed", request, {
      status,
      code: error.code || "internal_error",
    });
    json(response, status, { error: "Não foi possível mover o credenciamento." });
  }
};
