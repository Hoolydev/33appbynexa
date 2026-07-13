const {
  BUCKET,
  assertFile,
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
    const access = await authorize(client, body, "upload");
    const path = String(body.path || "");
    const fileName = String(body.fileName || "").trim();
    const mimeType = String(body.mimeType || "application/octet-stream").toLowerCase();
    const sizeBytes = Number(body.sizeBytes);
    assertFile(fileName, mimeType, sizeBytes);
    if (!path.startsWith(`${body.tenantId}/`)) throw new Error("Caminho de arquivo inválido.");

    const { data, error } = await client.from("tenant_files").insert({
      tenant_id: body.tenantId,
      unit_id: body.unitId || null,
      module_code: body.moduleCode || "business",
      category: body.category || "geral",
      original_name: fileName,
      storage_path: path,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      uploaded_by: access.userId,
      metadata: body.metadata || {},
    }).select("id, tenant_id, unit_id, module_code, category, original_name, mime_type, size_bytes, created_at").single();
    if (error) {
      await client.storage.from(BUCKET).remove([path]);
      throw error;
    }

    json(response, 201, { file: data });
  } catch (error) {
    handleError(response, error);
  }
};

