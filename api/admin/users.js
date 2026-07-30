const {
  requireAuthenticatedAppUser,
  requireUserCreationAccess,
  requireUserDeletionAccess,
} = require("../_lib/auth");
const {
  PublicError,
  enforceRequest,
  json,
  parseBody,
  securityLog,
} = require("../_lib/security");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FRANCHISOR_ROLES = new Set(["admin", "gestao", "user"]);
const TENANT_ROLES = new Set(["franchise_admin", "manager", "user"]);

function platformRole(role) {
  return {
    admin: "platform_admin",
    gestao: "platform_gestao",
    user: "platform_user",
  }[role];
}

async function findAuthUserByEmail(client, email) {
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => String(user.email || "").toLowerCase() === email) || null;
}

async function createUser(request, response) {
  const context = await requireAuthenticatedAppUser(request);
  requireUserCreationAccess(context);
  const body = parseBody(request, 16 * 1024);
  const scope = String(body.scope || "").trim().toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  const jobTitle = String(body.jobTitle || "").trim();
  const role = String(body.role || "").trim().toLowerCase();
  const tenantId = String(body.tenantId || "").trim();

  if (!["franchisor", "tenant"].includes(scope)) throw new PublicError("Vínculo de usuário inválido.");
  if (!name || name.length > 160) throw new PublicError("Informe um nome válido.");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new PublicError("Informe um e-mail válido.");
  if (jobTitle.length > 160) throw new PublicError("Informe um cargo válido.");
  if (password.length < 8 || password.length > 256) {
    throw new PublicError("A senha temporária precisa ter pelo menos 8 caracteres.");
  }
  if (scope === "franchisor" && !FRANCHISOR_ROLES.has(role)) {
    throw new PublicError("Cargo da franqueadora inválido.");
  }
  if (context.franchisorRole === "gestao" && scope === "franchisor" && role === "admin") {
    throw new PublicError("O perfil Gestão não pode conceder o cargo de Administrador.", 403);
  }
  if (scope === "tenant" && (!TENANT_ROLES.has(role) || !UUID_PATTERN.test(tenantId))) {
    throw new PublicError("Selecione uma franquia e um perfil válidos.");
  }

  if (scope === "tenant") {
    const { data: tenant, error } = await context.client
      .from("tenants")
      .select("id")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!tenant) throw new PublicError("Franquia não encontrada.", 404);
  }

  let authUser;
  let createdNow = false;
  const { data: created, error: createError } = await context.client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      job_title: jobTitle,
      account_scope: scope,
    },
  });

  if (createError) {
    authUser = await findAuthUserByEmail(context.client, email);
    if (!authUser) throw createError;
    const { data: updated, error: updateError } = await context.client.auth.admin.updateUserById(
      authUser.id,
      {
        password,
        email_confirm: true,
        user_metadata: {
          ...authUser.user_metadata,
          name,
          job_title: jobTitle,
          account_scope: scope,
        },
      },
    );
    if (updateError) throw updateError;
    authUser = updated.user;
  } else {
    authUser = created.user;
    createdNow = true;
  }

  try {
    const appValues = {
      role: scope === "franchisor" ? platformRole(role) : "tenant_user",
      franchisor_role: scope === "franchisor" ? role : null,
    };
    const { data: linked, error: linkError } = await context.client.rpc(
      "link_auth_user_profile",
      {
        p_auth_user_id: authUser.id,
        p_email: email,
        p_name: name,
        p_role: appValues.role,
        p_franchisor_role: appValues.franchisor_role,
        p_job_title: jobTitle || null,
      },
    );
    if (linkError) throw linkError;

    const { data: appUser, error: appError } = await context.client
      .from("app_users")
      .select("id, auth_user_id, email, name, role, franchisor_role, job_title, active")
      .eq("id", linked.id)
      .single();
    if (appError) throw appError;

    if (scope === "tenant") {
      const { error: membershipError } = await context.client
        .from("tenant_memberships")
        .upsert({
          tenant_id: tenantId,
          user_id: appUser.id,
          role,
          active: true,
        }, { onConflict: "tenant_id,user_id" });
      if (membershipError) throw membershipError;
    }

    const { error: profileError } = await context.client.from("app_user_profiles").upsert({
      user_id: appUser.id,
      display_name: name,
    }, { onConflict: "user_id" });
    if (profileError) throw profileError;

    await context.client.from("audit_events").insert({
      user_id: context.appUser.id,
      entity_type: "app_user",
      entity_id: appUser.id,
      action: createdNow ? "auth_user_create" : "auth_user_link",
      payload: { scope, role, tenantId: scope === "tenant" ? tenantId : null },
    });

    securityLog("admin_auth_user_saved", request, {
      actorId: context.appUser.id,
      targetId: appUser.id,
      scope,
    });
    json(response, createdNow ? 201 : 200, { ok: true, user: appUser });
  } catch (error) {
    if (createdNow && authUser?.id) {
      await context.client.auth.admin.deleteUser(authUser.id);
    }
    throw error;
  }
}

async function deleteUser(request, response) {
  const context = await requireAuthenticatedAppUser(request);
  requireUserDeletionAccess(context);
  const body = parseBody(request, 8 * 1024);
  const userId = String(body.userId || "");
  if (!UUID_PATTERN.test(userId)) throw new PublicError("Usuário inválido.");
  if (userId === context.appUser.id) throw new PublicError("Você não pode excluir seu próprio usuário.");

  const { data: target, error } = await context.client
    .from("app_users")
    .select("id, auth_user_id, email, name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!target) throw new PublicError("Usuário não encontrado.", 404);

  if (target.auth_user_id) {
    const { error: authError } = await context.client.auth.admin.deleteUser(target.auth_user_id);
    if (authError) throw authError;
  } else {
    const { error: deleteError } = await context.client.from("app_users").delete().eq("id", target.id);
    if (deleteError) throw deleteError;
  }

  await context.client.from("audit_events").insert({
    user_id: context.appUser.id,
    entity_type: "app_user",
    entity_id: target.id,
    action: "auth_user_delete",
    payload: { email: target.email },
  });
  securityLog("admin_auth_user_deleted", request, {
    actorId: context.appUser.id,
    targetId: target.id,
  });
  json(response, 200, { ok: true });
}

module.exports = async function handler(request, response) {
  if (!enforceRequest(request, response, {
    methods: ["POST", "DELETE"],
    sameOrigin: true,
    maxBodyBytes: 16 * 1024,
    rateLimit: { limit: 30, windowMs: 15 * 60 * 1000, key: "admin-users" },
  })) return;

  try {
    if (request.method === "DELETE") {
      await deleteUser(request, response);
      return;
    }
    await createUser(request, response);
  } catch (error) {
    if (error?.expose) {
      json(response, error.statusCode || 400, { error: error.message });
      return;
    }
    const duplicate = /already|registered|duplicate|unique/i.test(error?.message || "");
    securityLog("admin_auth_user_error", request, { code: error?.code || "internal_error" });
    json(response, duplicate ? 409 : 500, {
      error: duplicate
        ? "Este e-mail já está vinculado a outro usuário."
        : "Não foi possível salvar o usuário no Supabase Authentication.",
    });
  }
};
