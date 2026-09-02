const { getAdminClient } = require("../_lib/storage");
const { sendPasswordRecoveryEmail } = require("../_lib/email");
const {
  PublicError,
  enforceRequest,
  fingerprint,
  json,
  parseBody,
  securityLog,
} = require("../_lib/security");

function appOrigin(request) {
  const configured = String(process.env.PUBLIC_APP_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");

  const host = String(request.headers?.["x-forwarded-host"] || request.headers?.host || "").split(",")[0].trim();
  const proto = String(request.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim();
  if (!host) throw new Error("Application URL is not configured");
  return `${proto}://${host}`;
}

module.exports = async function handler(request, response) {
  if (!enforceRequest(request, response, {
    methods: ["POST"],
    sameOrigin: true,
    maxBodyBytes: 4 * 1024,
    rateLimit: { limit: 5, windowMs: 30 * 60 * 1000, key: "auth-recover" },
  })) return;

  try {
    const body = parseBody(request, 4 * 1024);
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
      throw new PublicError("Informe um e-mail válido.");
    }

    const client = getAdminClient();
    const requestId = String(request.headers?.["x-vercel-id"] || fingerprint(`${email}:${Date.now()}`)).slice(0, 120);
    const { data, error } = await client.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${appOrigin(request)}/?password-reset=1` },
    });
    if (error) throw error;
    if (!data?.properties?.action_link) throw new Error("Recovery link was not generated");

    await sendPasswordRecoveryEmail({
      to: email,
      name: data.user?.user_metadata?.name || data.user?.user_metadata?.display_name || "",
      actionUrl: data.properties.action_link,
      requestId,
    });

    securityLog("auth_recovery_email_sent", request, {
      emailHash: fingerprint(email).slice(0, 16),
    });
    json(response, 200, { ok: true });
  } catch (error) {
    if (error?.expose) {
      json(response, error.statusCode || 400, { error: error.message });
      return;
    }
    securityLog("auth_recovery_error", request, { code: error?.code || "internal_error" });
    json(response, 200, { ok: true });
  }
};
