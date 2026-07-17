const {
  BUCKET,
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

    const { data: file, error: fileError } = await client.from("tenant_files")
      .select("id, tenant_id, original_name, storage_path")
      .eq("id", body.fileId)
      .eq("tenant_id", body.tenantId)
      .is("deleted_at", null)
      .single();
    if (fileError) throw fileError;

    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(file.storage_path, 300, {
      download: file.original_name,
    });
    if (error) throw error;
    json(response, 200, { url: data.signedUrl, expiresIn: 300 });
  } catch (error) {
    handleError(response, error, request);
  }
};
