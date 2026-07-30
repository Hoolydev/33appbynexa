const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
}

const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function accountScope(user) {
  return user.franchisor_role || String(user.role || "").startsWith("platform_")
    ? "franchisor"
    : "tenant";
}

async function listAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function linkProfile(user, authUserId) {
  const { error } = await client.rpc("link_auth_user_profile", {
    p_auth_user_id: authUserId,
    p_email: user.email,
    p_name: user.name,
    p_role: user.role,
    p_franchisor_role: user.franchisor_role,
    p_job_title: user.job_title || "",
  });
  if (error) throw error;
}

async function migrateUser(user, authUsersByEmail) {
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) throw new Error(`Usuário ${user.id} não possui e-mail.`);

  const existingAuthUser = authUsersByEmail.get(email);
  if (existingAuthUser) {
    await linkProfile(user, existingAuthUser.id);
    process.stdout.write(`VINCULADO ${email}\n`);
    return;
  }

  if (!/^\$2[abxy]\$\d{2}\$/.test(String(user.password_hash || ""))) {
    throw new Error(`Hash bcrypt legado inválido para ${email}.`);
  }

  const { data, error } = await client.auth.admin.createUser({
    email,
    password_hash: user.password_hash,
    email_confirm: true,
    user_metadata: {
      name: user.name,
      job_title: user.job_title || "",
      account_scope: accountScope(user),
      migrated_from_legacy: true,
    },
  });
  if (error || !data?.user) throw error || new Error(`Falha ao criar ${email}.`);

  await linkProfile(user, data.user.id);
  authUsersByEmail.set(email, data.user);
  process.stdout.write(`MIGRADO ${email}\n`);
}

async function main() {
  const { data: legacyUsers, error } = await client
    .from("app_users")
    .select("id, email, password_hash, name, role, franchisor_role, job_title")
    .eq("active", true)
    .is("auth_user_id", null)
    .order("email");
  if (error) throw error;

  if (!legacyUsers.length) {
    process.stdout.write("Nenhum usuário legado pendente.\n");
    return;
  }

  const authUsers = await listAuthUsers();
  const authUsersByEmail = new Map(
    authUsers.map((user) => [String(user.email || "").toLowerCase(), user]),
  );

  for (const user of legacyUsers) {
    await migrateUser(user, authUsersByEmail);
  }
  process.stdout.write(`${legacyUsers.length} usuário(s) migrado(s) para o Authentication.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message || error}\n`);
  process.exitCode = 1;
});
