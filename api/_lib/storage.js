const { createClient } = require("@supabase/supabase-js");
const { PublicError, enforceRequest, json, parseBody, securityLog } = require("./security");

const BUCKET = "tenant-documents";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "csv", "xls", "xlsx", "doc", "docx"]);
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

function getAuthClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase Authentication não configurado no servidor.");
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function requirePost(request, response, options = {}) {
  return enforceRequest(request, response, {
    methods: ["POST"],
    sameOrigin: true,
    maxBodyBytes: 64 * 1024,
    rateLimit: { limit: 30, windowMs: 60 * 1000 },
    ...options,
  });
}

function requestBody(request, maxBodyBytes = 64 * 1024) {
  return parseBody(request, maxBodyBytes);
}

async function authorize(client, body, action) {
  const token = String(body.token || "").trim();
  const tenantId = String(body.tenantId || "").trim();
  const unitId = body.unitId ? String(body.unitId).trim() : null;
  if (!token || !tenantId) throw new PublicError("Sessão e franquia são obrigatórias.", 401);

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
  if (!fileName) throw new PublicError("Nome do arquivo é obrigatório.");
  if (fileName.length > 255) throw new PublicError("Nome do arquivo maior que o limite permitido.");
  const extension = fileName.toLowerCase().split(".").pop();
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) throw new PublicError("Extensão de arquivo não permitida.");
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new PublicError("Formato de arquivo não permitido.");
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_FILE_SIZE) {
    throw new PublicError("O arquivo deve ter até 25 MB.");
  }
}

function handleError(response, error, request) {
  const authenticationError = /sessão|acesso|perfil|franquia/i.test(error?.message || "");
  const status = error?.statusCode || (authenticationError ? 403 : 500);
  if (request) securityLog("api_error", request, { status, code: error?.code || "internal_error" });
  if (error?.expose) {
    json(response, status, { error: error.message });
    return;
  }
  json(response, status, { error: status === 403 ? "Acesso não autorizado." : "Não foi possível concluir a operação." });
}

module.exports = {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  BUCKET,
  MAX_FILE_SIZE,
  PublicError,
  assertFile,
  authorize,
  getAdminClient,
  getAuthClient,
  handleError,
  json,
  requestBody,
  requirePost,
  safeSegment,
};
