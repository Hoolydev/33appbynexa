const { createClient } = require("@supabase/supabase-js");

const BUCKET = "tenant-documents";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Storage não configurado no servidor.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function json(response, status, payload) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function requirePost(request, response) {
  if (request.method === "POST") return true;
  json(response, 405, { error: "Método não permitido." });
  return false;
}

function requestBody(request) {
  return typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
}

async function authorize(client, body, action) {
  const token = String(body.token || "").trim();
  const tenantId = String(body.tenantId || "").trim();
  const unitId = body.unitId ? String(body.unitId).trim() : null;
  if (!token || !tenantId) throw new Error("Sessão e franquia são obrigatórias.");

  const { data, error } = await client.rpc("authorize_tenant_file", {
    p_token: token,
    p_tenant_id: tenantId,
    p_unit_id: unitId,
    p_action: action,
  });
  if (error) throw error;
  return data;
}

function safeSegment(value, fallback) {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const safe = normalized.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  return safe || fallback;
}

function assertFile(fileName, mimeType, sizeBytes) {
  if (!fileName) throw new Error("Nome do arquivo é obrigatório.");
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error("Formato de arquivo não permitido.");
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_FILE_SIZE) {
    throw new Error("O arquivo deve ter até 25 MB.");
  }
}

function handleError(response, error) {
  const message = error?.message || "Não foi possível concluir a operação.";
  const status = /sessão|acesso|perfil|franquia/i.test(message) ? 403 : 400;
  json(response, status, { error: message });
}

module.exports = {
  ALLOWED_MIME_TYPES,
  BUCKET,
  MAX_FILE_SIZE,
  assertFile,
  authorize,
  getAdminClient,
  handleError,
  json,
  requestBody,
  requirePost,
  safeSegment,
};

