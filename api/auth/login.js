const { getAdminClient } = require("../_lib/storage");
const {
  PublicError,
  clientIp,
  enforceRequest,
  fingerprint,
  json,
  parseBody,
  securityLog,
} = require("../_lib/security");

function isMissingSecureFunction(error) {
  const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return message.includes("pgrst202") || message.includes("login_app_user_secure") && message.includes("not find");
}

module.exports = async function handler(request, response) {
  if (!enforceRequest(request, response, {
    methods: ["POST"],
    sameOrigin: true,
    maxBodyBytes: 8 * 1024,
    rateLimit: { limit: 10, windowMs: 15 * 60 * 1000, key: "auth-login" },
  })) return;

  try {
    const body = parseBody(request, 8 * 1024);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) throw new PublicError("Informe e-mail e senha.");
    if (email.length > 254 || password.length > 256 || !/^\S+@\S+\.\S+$/.test(email)) {
      throw new PublicError("Login ou senha inválidos.", 401);
    }

    const client = getAdminClient();
    const securePayload = {
      p_email: email,
      p_password: password,
      p_ip_hash: fingerprint(clientIp(request)),
      p_user_agent_hash: fingerprint(request.headers?.["user-agent"] || "unknown"),
    };
    let { data, error } = await client.rpc("login_app_user_secure", securePayload);

    // Mantém o deploy utilizável durante a pequena janela entre código e migration.
    if (error && isMissingSecureFunction(error)) {
      ({ data, error } = await client.rpc("login_app_user", {
        p_email: email,
        p_password: password,
      }));
    }
    if (error) throw error;

    if (data?.ok === false) {
      const rateLimited = data.code === "RATE_LIMITED";
      securityLog(rateLimited ? "login_rate_limited" : "login_failed", request);
      json(
        response,
        rateLimited ? 429 : 401,
        { error: data.error || "Login ou senha inválidos." },
        rateLimited ? { "Retry-After": String(data.retryAfter || 900) } : {},
      );
      return;
    }

    const session = data?.session || data;
    if (!session?.token || !session?.user) throw new Error("Invalid login response");
    securityLog("login_success", request, { userId: session.user.id });
    json(response, 200, { session });
  } catch (error) {
    if (error?.expose) {
      json(response, error.statusCode || 400, { error: error.message });
      return;
    }
    securityLog("login_error", request, { code: error?.code || "internal_error" });
    json(response, /login|password|credential|senha/i.test(error?.message || "") ? 401 : 500, {
      error: /login|password|credential|senha/i.test(error?.message || "")
        ? "Login ou senha inválidos."
        : "Não foi possível entrar no sistema.",
    });
  }
};
