const crypto = require("node:crypto");
const {
  BUCKET,
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
    await authorize(client, body, "upload");

    const fileName = String(body.fileName || "").trim();
    const mimeType = String(body.mimeType || "application/octet-stream").toLowerCase();
    const sizeBytes = Number(body.sizeBytes);
    assertFile(fileName, mimeType, sizeBytes);

    const tenantId = String(body.tenantId);
    const moduleCode = safeSegment(body.moduleCode, "business");
    const unitId = safeSegment(body.unitId, "shared");
    const category = safeSegment(body.category, "geral");
    const date = new Date().toISOString().slice(0, 10);
    const path = `${tenantId}/${moduleCode}/${unitId}/${category}/${date}/${crypto.randomUUID()}-${safeSegment(fileName, "arquivo")}`;
    const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw error;

    json(response, 200, {
      bucket: BUCKET,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      expiresIn: 7200,
    });
  } catch (error) {
    handleError(response, error);
  }
};

