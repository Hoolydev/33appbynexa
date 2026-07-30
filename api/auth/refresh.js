const { getAdminClient, getAuthClient } = require("../_lib/storage");
const {
  refreshTokenCookie,
  setRefreshTokenCookie,
} = require("../_lib/auth-cookie");
const {
  PublicError,
  clientIp,
  enforceRequest,
  fingerprint,
  json,
  parseBody,
  securityLog,
} = require("../_lib/security");

module.exports = async function handler(request, response) {
  if (!enforceRequest(request, response, {
    methods: ["POST"],
    sameOrigin: true,
    maxBodyBytes: 16 * 1024,
    rateLimit: { limit: 30, windowMs: 15 * 60 * 1000, key: "auth-refresh" },
  })) return;

  try {
    const body = parseBody(request, 16 * 1024);
    const refreshToken = refreshTokenCookie(request) || String(body.refreshToken || "");
    if (!refreshToken) throw new PublicError("Sessão não pode ser renovada.", 401);

    const authClient = getAuthClient();
    const adminClient = getAdminClient();
    const { data, error } = await authClient.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data?.session || !data?.user) {
      throw new PublicError("Sessão expirada. Entre novamente.", 401);
    }

    const { data: bridge, error: bridgeError } = await adminClient.rpc(
      "create_app_session_for_auth_user",
      {
        p_auth_user_id: data.user.id,
        p_ip_hash: fingerprint(clientIp(request)),
        p_user_agent_hash: fingerprint(request.headers?.["user-agent"] || "unknown"),
      },
    );
    if (bridgeError) throw bridgeError;

    setRefreshTokenCookie(response, data.session.refresh_token);
    json(response, 200, {
      session: {
        ...bridge,
        accessToken: data.session.access_token,
        authExpiresAt: data.session.expires_at,
      },
    });
  } catch (error) {
    if (error?.expose) {
      json(response, error.statusCode || 400, { error: error.message });
      return;
    }
    securityLog("auth_refresh_error", request, { code: error?.code || "internal_error" });
    json(response, 500, { error: "Não foi possível renovar a sessão." });
  }
};
