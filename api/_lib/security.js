const crypto = require("node:crypto");

const rateLimitStore = globalThis.__nexaRateLimitStore || new Map();
globalThis.__nexaRateLimitStore = rateLimitStore;

class PublicError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "PublicError";
    this.statusCode = status;
    this.expose = true;
  }
}

function json(response, status, payload, extraHeaders = {}) {
  response.status(status);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  Object.entries(extraHeaders).forEach(([key, value]) => response.setHeader(key, value));
  response.end(JSON.stringify(payload));
}

function header(request, name) {
  const value = request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "");
}

function clientIp(request) {
  const forwarded = header(request, "x-forwarded-for").split(",")[0].trim();
  return forwarded || header(request, "x-real-ip") || request.socket?.remoteAddress || "unknown";
}

function fingerprint(value) {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "local-development";
  return crypto.createHmac("sha256", secret).update(String(value || "unknown")).digest("hex");
}

function requestSize(request) {
  const declared = Number(header(request, "content-length"));
  if (Number.isFinite(declared) && declared >= 0) return declared;
  if (Buffer.isBuffer(request.body)) return request.body.length;
  if (typeof request.body === "string") return Buffer.byteLength(request.body);
  if (request.body && typeof request.body === "object") return Buffer.byteLength(JSON.stringify(request.body));
  return 0;
}

function hasTrustedOrigin(request) {
  const fetchSite = header(request, "sec-fetch-site").toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;

  const origin = header(request, "origin");
  if (!origin) return true;
  const host = (header(request, "x-forwarded-host") || header(request, "host")).split(",")[0].trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function consumeRateLimit(key, limit, windowMs) {
  const now = Date.now();
  if (rateLimitStore.size > 5000) {
    for (const [storedKey, value] of rateLimitStore) {
      if (value.resetAt <= now || rateLimitStore.size > 7500) rateLimitStore.delete(storedKey);
      if (rateLimitStore.size <= 5000) break;
    }
  }
  const current = rateLimitStore.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfter: Math.ceil(windowMs / 1000) };
  }

  current.count += 1;
  rateLimitStore.set(key, current);
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

function enforceRequest(request, response, options = {}) {
  const methods = options.methods || ["POST"];
  if (!methods.includes(request.method)) {
    json(response, 405, { error: "Método não permitido." }, { Allow: methods.join(", ") });
    return false;
  }

  if (options.sameOrigin && !hasTrustedOrigin(request)) {
    securityLog("blocked_origin", request);
    json(response, 403, { error: "Origem da requisição não autorizada." });
    return false;
  }

  const maxBodyBytes = options.maxBodyBytes || 64 * 1024;
  if (requestSize(request) > maxBodyBytes) {
    securityLog("blocked_payload_size", request, { maxBodyBytes });
    json(response, 413, { error: "Requisição maior que o limite permitido." });
    return false;
  }

  if (options.rateLimit) {
    const ipHash = fingerprint(clientIp(request));
    const route = options.rateLimit.key || request.url || "api";
    const key = `${route}:${ipHash}`;
    const result = consumeRateLimit(key, options.rateLimit.limit, options.rateLimit.windowMs);
    response.setHeader("X-RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      securityLog("rate_limited", request, { route });
      json(response, 429, { error: "Muitas tentativas. Aguarde e tente novamente." }, { "Retry-After": String(result.retryAfter) });
      return false;
    }
  }

  return true;
}

function securityLog(event, request, details = {}) {
  const payload = {
    type: "security",
    event,
    requestId: header(request, "x-vercel-id") || crypto.randomUUID(),
    method: request.method,
    path: String(request.url || "").split("?")[0],
    ipHash: fingerprint(clientIp(request)).slice(0, 16),
    ...details,
  };
  console.warn(JSON.stringify(payload));
}

function parseBody(request, maxBodyBytes = 64 * 1024) {
  if (requestSize(request) > maxBodyBytes) throw new PublicError("Requisição maior que o limite permitido.", 413);
  let body = request.body;
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    try {
      body = JSON.parse(String(body || "{}"));
    } catch {
      throw new PublicError("JSON inválido.");
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PublicError("Corpo da requisição inválido.");
  return body;
}

module.exports = {
  PublicError,
  clientIp,
  enforceRequest,
  fingerprint,
  json,
  parseBody,
  securityLog,
};
