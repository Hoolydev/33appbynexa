const { bearerToken } = require("../_lib/auth");
const { clearRefreshTokenCookie } = require("../_lib/auth-cookie");
const { getAdminClient } = require("../_lib/storage");
const {
  enforceRequest,
  json,
  parseBody,
  securityLog,
} = require("../_lib/security");

module.exports = async function handler(request, response) {
  if (!enforceRequest(request, response, {
    methods: ["POST"],
    sameOrigin: true,
    maxBodyBytes: 8 * 1024,
    rateLimit: { limit: 30, windowMs: 15 * 60 * 1000, key: "auth-logout" },
  })) return;

  try {
    const client = getAdminClient();
    const body = parseBody(request, 8 * 1024);

    if (body.token) {
      await client.rpc("logout_app_user", { p_token: String(body.token) });
    }
    const accessToken = bearerToken(request);
    await client.auth.admin.signOut(accessToken, "global");
    clearRefreshTokenCookie(response);
    json(response, 200, { ok: true });
  } catch (error) {
    securityLog("auth_logout_error", request, { code: error?.code || "internal_error" });
    // O logout local não deve ficar bloqueado por uma sessão já expirada.
    clearRefreshTokenCookie(response);
    json(response, 200, { ok: true });
  }
};
