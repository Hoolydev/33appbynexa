const {
  requireAuthenticatedAppUser,
  requireUserCreationAccess,
  requireUserDeletionAccess,
  requireUserEditingAccess,
} = require("./_lib/auth");
const {
  PublicError,
  enforceRequest,
  json,
  parseBody,
  securityLog,
} = require("./_lib/security");
const moveCredentialing = require("./_lib/credentialing-move");

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

function currentFranchisorRole(user) {
  if (FRANCHISOR_ROLES.has(String(user.franchisor_role || "").toLowerCase())) {
    return String(user.franchisor_role).toLowerCase();
  }
  return {
    admin: "admin",
    platform_admin: "admin",
    platform_gestao: "gestao",
    platform_user: "user",
  }[String(user.role || "").toLowerCase()] || null;
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

async function updateUser(request, response) {
  const context = await requireAuthenticatedAppUser(request);
  requireUserEditingAccess(context);
  const body = parseBody(request, 16 * 1024);
  const userId = String(body.userId || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  const jobTitle = String(body.jobTitle || "").trim();
  const regional = String(body.regional || "").trim();
  const requestedRole = String(body.role || "").trim().toLowerCase();
  const active = body.active !== false;

  if (!UUID_PATTERN.test(userId)) throw new PublicError("Usuário inválido.");
  if (!name || name.length > 160) throw new PublicError("Informe um nome válido.");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new PublicError("Informe um e-mail válido.");
  if (jobTitle.length > 160) throw new PublicError("Informe um cargo válido.");
  if (regional.length > 120) throw new PublicError("Informe uma regional válida.");
  if (password && (password.length < 8 || password.length > 256)) {
    throw new PublicError("A nova senha precisa ter pelo menos 8 caracteres.");
  }

  const { data: target, error: targetError } = await context.client
    .from("app_users")
    .select("id, auth_user_id, email, name, role, franchisor_role, job_title, regional, active")
    .eq("id", userId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) throw new PublicError("Usuário não encontrado.", 404);

  const targetFranchisorRole = currentFranchisorRole(target);
  const isFranchisor = Boolean(targetFranchisorRole);
  const nextFranchisorRole = isFranchisor ? requestedRole : null;
  if (isFranchisor && !FRANCHISOR_ROLES.has(nextFranchisorRole)) {
    throw new PublicError("Perfil da franqueadora inválido.");
  }
  if (userId === context.appUser.id && (!active || nextFranchisorRole !== "admin")) {
    throw new PublicError("Você não pode desativar ou remover seu próprio acesso de administrador.");
  }

  if (targetFranchisorRole === "admin" && (!active || nextFranchisorRole !== "admin")) {
    const { count, error: countError } = await context.client
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .or("franchisor_role.eq.admin,role.in.(admin,platform_admin)")
      .neq("id", userId);
    if (countError) throw countError;
    if (!count) throw new PublicError("Mantenha pelo menos um administrador ativo no sistema.");
  }

  const { data: duplicate, error: duplicateError } = await context.client
    .from("app_users")
    .select("id")
    .ilike("email", email)
    .neq("id", userId)
    .limit(1);
  if (duplicateError) throw duplicateError;
  if (duplicate?.length) throw new PublicError("Este e-mail já está vinculado a outro usuário.", 409);

  let authUser = null;
  if (target.auth_user_id) {
    const { data: authData, error: authReadError } = await context.client.auth.admin.getUserById(target.auth_user_id);
    if (authReadError || !authData?.user) throw authReadError || new Error("Identidade não encontrada.");
    authUser = authData.user;
    const { error: authUpdateError } = await context.client.auth.admin.updateUserById(target.auth_user_id, {
      email,
      email_confirm: true,
      user_metadata: {
        ...authUser.user_metadata,
        name,
        job_title: jobTitle,
        regional,
        account_scope: isFranchisor ? "franchisor" : "tenant",
      },
    });
    if (authUpdateError) throw authUpdateError;
  } else if (password) {
    throw new PublicError("Este usuário ainda não possui identidade no Supabase Authentication; migre-o antes de alterar a senha.");
  }

  const updateValues = {
    email,
    name,
    job_title: jobTitle,
    regional: regional || null,
    active,
    updated_at: new Date().toISOString(),
  };
  if (isFranchisor) {
    updateValues.role = platformRole(nextFranchisorRole);
    updateValues.franchisor_role = nextFranchisorRole;
  }

  const { data: updatedUser, error: updateError } = await context.client
    .from("app_users")
    .update(updateValues)
    .eq("id", userId)
    .select("id, auth_user_id, email, name, role, franchisor_role, job_title, regional, active")
    .single();
  if (updateError) {
    if (authUser) {
      await context.client.auth.admin.updateUserById(target.auth_user_id, {
        email: authUser.email,
        email_confirm: true,
        user_metadata: authUser.user_metadata,
      });
    }
    throw updateError;
  }

  const { error: profileError } = await context.client.from("app_user_profiles").upsert({
    user_id: userId,
    display_name: name,
  }, { onConflict: "user_id" });
  if (profileError) throw profileError;

  if (password && target.auth_user_id) {
    const { error: passwordError } = await context.client.auth.admin.updateUserById(target.auth_user_id, { password });
    if (passwordError) throw passwordError;
  }

  await context.client.from("audit_events").insert({
    user_id: context.appUser.id,
    entity_type: "app_user",
    entity_id: userId,
    action: "auth_user_update",
    payload: {
      emailChanged: target.email !== email,
      role: isFranchisor ? nextFranchisorRole : "tenant_user",
      active,
      passwordChanged: Boolean(password),
    },
  });
  securityLog("admin_auth_user_updated", request, {
    actorId: context.appUser.id,
    targetId: userId,
  });
  json(response, 200, { ok: true, user: updatedUser });
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
  let resource = String(request.query?.resource || "").trim().toLowerCase();
  if (!resource) {
    try {
      resource = new URL(request.url || "/api/admin", "http://localhost")
        .searchParams.get("resource")
        ?.trim()
        .toLowerCase() || "";
    } catch {
      resource = "";
    }
  }
  if (resource === "credentialing") {
    await moveCredentialing(request, response);
    return;
  }
  if (resource !== "users") {
    json(response, 404, { error: "Recurso administrativo não encontrado." });
    return;
  }
  if (!enforceRequest(request, response, {
    methods: ["POST", "PATCH", "DELETE"],
    sameOrigin: true,
    maxBodyBytes: 16 * 1024,
    rateLimit: { limit: 30, windowMs: 15 * 60 * 1000, key: "admin-users" },
  })) return;

  try {
    if (request.method === "DELETE") {
      await deleteUser(request, response);
      return;
    }
    if (request.method === "PATCH") {
      await updateUser(request, response);
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
