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
    await authorize(client, body, "delete");

    const { data: file, error: fileError } = await client.from("tenant_files")
      .select("id, tenant_id, storage_path")
      .eq("id", body.fileId)
      .eq("tenant_id", body.tenantId)
      .is("deleted_at", null)
      .single();
    if (fileError) throw fileError;

    const { error: storageError } = await client.storage.from(BUCKET).remove([file.storage_path]);
    if (storageError) throw storageError;
    const { error: updateError } = await client.from("tenant_files")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", file.id);
    if (updateError) throw updateError;

    json(response, 200, { ok: true });
  } catch (error) {
    handleError(response, error);
  }
};

