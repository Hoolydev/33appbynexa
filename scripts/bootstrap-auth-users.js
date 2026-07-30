const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawUsers = process.env.AUTH_BOOTSTRAP_USERS;

if (!url || !serviceRoleKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
}
if (!rawUsers) {
  throw new Error(
    "Configure AUTH_BOOTSTRAP_USERS com um array JSON de usuários. Consulte o README.",
  );
}

let users;
try {
  users = JSON.parse(rawUsers);
} catch {
  throw new Error("AUTH_BOOTSTRAP_USERS não contém um JSON válido.");
}
if (!Array.isArray(users) || users.length === 0) {
  throw new Error("AUTH_BOOTSTRAP_USERS precisa conter pelo menos um usuário.");
}

const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function appRole(role) {
  return {
    admin: "platform_admin",
    gestao: "platform_gestao",
    user: "platform_user",
  }[role];
}

async function findAuthUser(email) {
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => String(user.email || "").toLowerCase() === email) || null;
}

async function bootstrapUser(input) {
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  const name = String(input.name || "").trim();
  const role = String(input.role || "").trim().toLowerCase();
  const jobTitle = String(input.jobTitle || "").trim();
  if (!email || !name || password.length < 8 || !appRole(role)) {
    throw new Error(`Dados inválidos para ${email || "usuário sem e-mail"}.`);
  }

  let authUser = await findAuthUser(email);
  if (authUser) {
    const { data, error } = await client.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: { ...authUser.user_metadata, name, job_title: jobTitle, account_scope: "franchisor" },
    });
    if (error) throw error;
    authUser = data.user;
  } else {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, job_title: jobTitle, account_scope: "franchisor" },
    });
    if (error) throw error;
    authUser = data.user;
  }

  const { data: linked, error: linkError } = await client.rpc("link_auth_user_profile", {
    p_auth_user_id: authUser.id,
    p_email: email,
    p_name: name,
    p_role: appRole(role),
    p_franchisor_role: role,
    p_job_title: jobTitle || null,
  });
  if (linkError) throw linkError;

  const { error: profileError } = await client.from("app_user_profiles").upsert({
    user_id: linked.id,
    display_name: name,
  }, { onConflict: "user_id" });
  if (profileError) throw profileError;

  process.stdout.write(`OK ${email} (${role})\n`);
}

async function main() {
  for (const user of users) await bootstrapUser(user);
  process.stdout.write("Usuários sincronizados com o Supabase Authentication.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.message || error}\n`);
  process.exitCode = 1;
});
