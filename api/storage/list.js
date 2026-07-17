const {
  authorize,
  getAdminClient,
  handleError,
  json,
  requestBody,
  requirePost,
} = require("../_lib/storage");

module.exports = async function handler(request, response) {
  if (!requirePost(request, response)) return;

  try {
    const body = requestBody(request);
    const client = getAdminClient();
    await authorize(client, body, "read");

    let query = client.from("tenant_files")
      .select("id, tenant_id, unit_id, module_code, category, original_name, mime_type, size_bytes, metadata, created_at")
      .eq("tenant_id", body.tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (body.unitId) query = query.eq("unit_id", body.unitId);
    if (body.moduleCode) query = query.eq("module_code", body.moduleCode);
    if (body.category) query = query.eq("category", body.category);

    const { data, error } = await query;
    if (error) throw error;
    json(response, 200, { files: data || [] });
  } catch (error) {
    handleError(response, error, request);
  }
};
