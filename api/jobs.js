const { getAdminClient, handleError, json } = require("./_lib/storage");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    json(response, 405, { error: "Método não permitido." });
    return;
  }

  try {
    const tenantCode = String(request.query?.tenant || "").trim();
    if (!tenantCode) throw new Error("Franquia não informada.");
    const client = getAdminClient();
    const { data: tenant, error: tenantError } = await client
      .from("tenants")
      .select("id, code, name, status")
      .eq("code", tenantCode)
      .eq("status", "active")
      .maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant) throw new Error("Franquia não encontrada.");
    const { data: activation, error: activationError } = await client
      .from("tenant_modules")
      .select("status")
      .eq("tenant_id", tenant.id)
      .eq("module_code", "hr")
      .maybeSingle();
    if (activationError) throw activationError;
    if (activation?.status !== "active") throw new Error("O portal de vagas não está ativo para esta franquia.");

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
    handleError(response, error);
  }
};
