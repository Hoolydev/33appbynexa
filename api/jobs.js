const { PublicError, getAdminClient, handleError, json } = require("./_lib/storage");
const { enforceRequest } = require("./_lib/security");

module.exports = async function handler(request, response) {
  if (!enforceRequest(request, response, {
    methods: ["GET"],
    maxBodyBytes: 1024,
    rateLimit: { limit: 120, windowMs: 60 * 1000, key: "jobs" },
  })) return;

  try {
    const tenantCode = String(request.query?.tenant || "").trim();
    if (!tenantCode) throw new PublicError("Franquia não informada.");
    if (tenantCode.length > 80 || !/^[a-zA-Z0-9._-]+$/.test(tenantCode)) throw new PublicError("Franquia inválida.");
    const client = getAdminClient();
    const { data: tenant, error: tenantError } = await client
      .from("tenants")
      .select("id, code, name, status")
      .eq("code", tenantCode)
      .eq("status", "active")
      .maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant) throw new PublicError("Franquia não encontrada.", 404);
    const { data: activation, error: activationError } = await client
      .from("tenant_modules")
      .select("status")
      .eq("tenant_id", tenant.id)
      .eq("module_code", "hr")
      .maybeSingle();
    if (activationError) throw activationError;
    if (activation?.status !== "active") throw new PublicError("O portal de vagas não está ativo para esta franquia.", 403);

    const { data: records, error } = await client
      .from("module_records")
      .select("id, title, status, payload, public_slug, created_at")
      .eq("tenant_id", tenant.id)
      .eq("module_code", "hr")
      .eq("record_type", "vacancy")
      .eq("archived", false)
      .eq("status", "Aberta")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const jobs = (records || [])
      .filter((record) => record.payload?.public !== false)
      .map((record) => ({
        id: record.id,
        slug: record.public_slug,
        title: record.title,
        department: record.payload?.department || "",
        workType: record.payload?.workType || "Presencial",
        city: record.payload?.city || "",
        quantity: record.payload?.quantity || 1,
        salary: record.payload?.salary || "",
        requirements: record.payload?.requirements || "",
        description: record.payload?.description || "",
      }));

    json(response, 200, { tenant: { code: tenant.code, name: tenant.name }, jobs });
  } catch (error) {
    handleError(response, error, request);
  }
};
