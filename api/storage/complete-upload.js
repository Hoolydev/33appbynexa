const {
  BUCKET,
  PublicError,
  assertFile,
  authorize,
  getAdminClient,
  handleError,
  json,
  requestBody,
  requirePost,
  safeSegment,
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
    const moduleCode = safeSegment(body.moduleCode, "business");
    const unitId = safeSegment(body.unitId, "shared");
    const category = safeSegment(body.category, "geral");
    const expectedPrefix = `${body.tenantId}/${moduleCode}/${unitId}/${category}/`;
    if (path.length > 500 || path.includes("..") || !path.startsWith(expectedPrefix)) {
      throw new PublicError("Caminho de arquivo inválido.");
    }

    const pathParts = path.split("/");
    const storedName = pathParts.pop();
    const directory = pathParts.join("/");
    const { data: objects, error: objectError } = await client.storage.from(BUCKET).list(directory, {
      limit: 2,
      search: storedName,
    });
    if (objectError) throw objectError;
    const storedObject = (objects || []).find((object) => object.name === storedName);
    if (!storedObject) {
      throw new PublicError("O upload não foi localizado no armazenamento.", 409);
    }
    const actualSize = Number(storedObject.metadata?.size);
    const actualMimeType = String(storedObject.metadata?.mimetype || storedObject.metadata?.contentType || "").toLowerCase();
    if (!Number.isFinite(actualSize) || actualSize !== sizeBytes || (actualMimeType && actualMimeType !== mimeType)) {
      await client.storage.from(BUCKET).remove([path]);
      throw new PublicError("O arquivo recebido não corresponde ao upload autorizado.", 409);
    }

    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? body.metadata
      : {};
    if (Buffer.byteLength(JSON.stringify(metadata)) > 4096) throw new PublicError("Metadados maiores que o limite permitido.");

    const { data, error } = await client.from("tenant_files").insert({
      tenant_id: body.tenantId,
      unit_id: body.unitId || null,
      module_code: moduleCode,
      category,
      original_name: fileName,
      storage_path: path,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      uploaded_by: access.userId,
      metadata,
    }).select("id, tenant_id, unit_id, module_code, category, original_name, mime_type, size_bytes, created_at").single();
    if (error) {
      await client.storage.from(BUCKET).remove([path]);
      throw error;
    }

    json(response, 201, { file: data });
  } catch (error) {
    handleError(response, error, request);
  }
};
