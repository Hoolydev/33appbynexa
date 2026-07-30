const { getAdminClient, getAuthClient } = require("../_lib/storage");
const { setRefreshTokenCookie } = require("../_lib/auth-cookie");
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

async function legacyUserHasAuthIdentity(client, email) {
  const { data, error } = await client
    .from("app_users")
    .select("auth_user_id")
    .ilike("email", email)
    .maybeSingle();
  if (error && /auth_user_id/i.test(error.message || "")) return false;
  if (error) throw error;
  return Boolean(data?.auth_user_id);
}

async function createBridgeSession(client, authSession, request) {
  const { data, error } = await client.rpc("create_app_session_for_auth_user", {
    p_auth_user_id: authSession.user.id,
    p_ip_hash: fingerprint(clientIp(request)),
    p_user_agent_hash: fingerprint(request.headers?.["user-agent"] || "unknown"),
  });
  if (error) throw error;
  if (!data?.token || !data?.user) throw new Error("Invalid auth bridge response");
  return {
    ...data,
    accessToken: authSession.access_token,
    authExpiresAt: authSession.expires_at,
  };
}

async function legacyLogin(client, email, password, request) {
  const securePayload = {
    p_email: email,
    p_password: password,
    p_ip_hash: fingerprint(clientIp(request)),
    p_user_agent_hash: fingerprint(request.headers?.["user-agent"] || "unknown"),
  };
  let { data, error } = await client.rpc("login_app_user_secure", securePayload);

  if (error && isMissingSecureFunction(error)) {
    ({ data, error } = await client.rpc("login_app_user", {
      p_email: email,
      p_password: password,
    }));
  }
  if (error) throw error;
  return data;
}

async function upgradeLegacyIdentity(adminClient, authClient, legacySession, email, password, request) {
  const legacyUser = legacySession.user;
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: legacyUser.name || email.split("@")[0],
      job_title: legacyUser.jobTitle || "",
      account_scope: legacyUser.franchisorRole ? "franchisor" : "tenant",
      migrated_from_legacy: true,
    },
  });
  if (createError || !created?.user) throw createError || new Error("Auth user was not created");

  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !authData?.session || !authData?.user) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    throw authError || new Error("Migrated Auth user could not sign in");
  }

  const session = await createBridgeSession(adminClient, {
    ...authData.session,
    user: authData.user,
  }, request);
  return { session, refreshToken: authData.session.refresh_token };
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

    const authClient = getAuthClient();
    const adminClient = getAdminClient();
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (!authError && authData?.session && authData?.user) {
      const session = await createBridgeSession(adminClient, {
        ...authData.session,
        user: authData.user,
      }, request);
      securityLog("auth_login_success", request, { userId: session.user.id });
      setRefreshTokenCookie(response, authData.session.refresh_token);
      json(response, 200, { session });
      return;
    }

    // Compatibilidade temporária: usuários legados ainda não vinculados ao
    // Authentication continuam entrando até a migração das identidades.
    if (await legacyUserHasAuthIdentity(adminClient, email)) {
      securityLog("auth_login_failed", request);
      json(response, 401, { error: "Login ou senha inválidos." });
      return;
    }

    const data = await legacyLogin(adminClient, email, password, request);
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

    const legacySession = data?.session || data;
    if (!legacySession?.token || !legacySession?.user) throw new Error("Invalid login response");

    const upgraded = await upgradeLegacyIdentity(
      adminClient,
      authClient,
      legacySession,
      email,
      password,
      request,
    );
    setRefreshTokenCookie(response, upgraded.refreshToken);
    securityLog("legacy_auth_user_migrated", request, { userId: upgraded.session.user.id });
    json(response, 200, { session: upgraded.session });
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
