const { getAdminClient } = require("./storage");
const { PublicError } = require("./security");

function bearerToken(request) {
  const authorization = String(request.headers?.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new PublicError("Sessão do Supabase Authentication obrigatória.", 401);
  return match[1].trim();
}

function normalizedFranchisorRole(appUser) {
  if (appUser.franchisor_role) return appUser.franchisor_role;
  const role = String(appUser.role || "").toLowerCase();
  if (["admin", "platform_admin"].includes(role)) return "admin";
  if (role === "platform_gestao") return "gestao";
  if (role === "platform_user") return "user";
  return null;
}

async function requireAuthenticatedAppUser(request) {
  const token = bearerToken(request);
  const client = getAdminClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw new PublicError("Sessão expirada ou inválida.", 401);

  const { data: appUser, error: profileError } = await client
    .from("app_users")
    .select("id, auth_user_id, email, name, role, franchisor_role, job_title, active")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!appUser?.active) throw new PublicError("Usuário sem perfil ativo no sistema.", 403);

  return {
    client,
    token,
    authUser: data.user,
    appUser,
    franchisorRole: normalizedFranchisorRole(appUser),
  };
}

function requireUserCreationAccess(context) {
  if (!["admin", "gestao"].includes(context.franchisorRole)) {
    throw new PublicError("Seu perfil não pode criar usuários.", 403);
  }
}

function requireUserDeletionAccess(context) {
  if (context.franchisorRole !== "admin") {
    throw new PublicError("Somente administradores podem excluir usuários.", 403);
  }
}

module.exports = {
  bearerToken,
  normalizedFranchisorRole,
  requireAuthenticatedAppUser,
  requireUserCreationAccess,
  requireUserDeletionAccess,
};
