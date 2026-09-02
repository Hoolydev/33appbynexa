const { PublicError, getAdminClient, handleError, json } = require("./_lib/storage");
const { sendOverdueNotificationEmail } = require("./_lib/email");
const { enforceRequest, fingerprint, securityLog } = require("./_lib/security");

function header(request, name) {
  const value = request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "");
}

function normalizedStatus(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isCompletedStatus(value) {
  return ["concluido", "concluida", "resolvido", "resolvida", "finalizado", "finalizada"]
    .includes(normalizedStatus(value));
}

async function sendOverdueNotifications(request, response) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (!cronSecret || header(request, "authorization") !== `Bearer ${cronSecret}`) {
    json(response, 401, { error: "Acesso não autorizado." });
    return;
  }

  const client = getAdminClient();
  const dryRun = String(request.query?.dryRun || "") === "1";
  const today = new Date().toISOString().slice(0, 10);
  const { data: unitRows, error: unitError } = await client
    .from("units")
    .select("id, name, city, state, tenant_id, opening_date")
    .not("opening_date", "is", null)
    .lt("opening_date", today);
  if (unitError) throw unitError;

  const unitIds = (unitRows || []).map((unit) => unit.id);
  if (!unitIds.length) {
    securityLog("overdue_notification_run", request, { tenants: 0, recipients: 0, sent: 0 });
    json(response, 200, { ok: true, tenants: 0, recipients: 0, sent: 0, dryRun });
    return;
  }

  const { data: taskRows, error: taskError } = await client
    .from("roadmap_tasks")
    .select("unit_id, status")
    .in("unit_id", unitIds);
  if (taskError) throw taskError;

  const progressByUnit = new Map();
  for (const task of taskRows || []) {
    const stats = progressByUnit.get(task.unit_id) || { total: 0, completed: 0, open: 0 };
    stats.total += 1;
    if (isCompletedStatus(task.status)) stats.completed += 1;
    else stats.open += 1;
    progressByUnit.set(task.unit_id, stats);
  }

  const overdueByTenant = new Map();
  for (const unit of unitRows || []) {
    if (!unit?.tenant_id) continue;
    const stats = progressByUnit.get(unit.id) || { total: 0, completed: 0, open: 0 };
    const progress = Math.round((stats.completed / Math.max(stats.total, 1)) * 100);
    if (progress >= 90) continue;
    const current = overdueByTenant.get(unit.tenant_id) || { count: 0, units: new Map() };
    current.count += Math.max(stats.open, 1);
    current.units.set(unit.id, unit);
    overdueByTenant.set(unit.tenant_id, current);
  }

  const tenantIds = [...overdueByTenant.keys()];
  if (!tenantIds.length) {
    securityLog("overdue_notification_run", request, { tenants: 0, recipients: 0, sent: 0 });
    json(response, 200, { ok: true, tenants: 0, recipients: 0, sent: 0 });
    return;
  }

  const { data: membershipRows, error: membershipError } = await client
    .from("tenant_memberships")
    .select("tenant_id, user_id, role, active")
    .in("tenant_id", tenantIds)
    .eq("active", true)
    .in("role", ["franchise_admin", "manager"]);
  if (membershipError) throw membershipError;

  const userIds = [...new Set((membershipRows || []).map((membership) => membership.user_id))];
  if (!userIds.length) {
    securityLog("overdue_notification_run", request, {
      tenants: tenantIds.length,
      recipients: 0,
      sent: 0,
    });
    json(response, 200, { ok: true, tenants: tenantIds.length, recipients: 0, sent: 0 });
    return;
  }

  const { data: userRows, error: userError } = await client
    .from("app_users")
    .select("id, email, name, active")
    .in("id", userIds)
    .eq("active", true);
  if (userError) throw userError;

  const users = new Map((userRows || []).map((user) => [user.id, user]));
  const appUrl = String(process.env.PUBLIC_APP_URL || "https://www.33doctor.app.br").replace(/\/$/, "");
  let sent = 0;
  let failed = 0;
  let planned = 0;

  for (const membership of membershipRows || []) {
    const user = users.get(membership.user_id);
    const overdue = overdueByTenant.get(membership.tenant_id);
    if (!user?.email || !overdue) continue;
    planned += 1;
    const unitName = [...overdue.units.values()]
      .map((unit) => unit.name || [unit.city, unit.state].filter(Boolean).join("/"))
      .filter(Boolean)
      .join(", ") || "Sua franquia";

    if (dryRun) continue;

    try {
      await sendOverdueNotificationEmail({
        to: user.email,
        name: user.name,
        unitName,
        overdueCount: overdue.count,
        actionUrl: `${appUrl}/?preview=system`,
        reference: `${today}/${membership.tenant_id}/${user.id}`,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      securityLog("overdue_notification_failed", request, {
        tenantId: membership.tenant_id,
        emailHash: fingerprint(user.email).slice(0, 16),
        code: error?.code || "email_error",
      });
    }
  }

  securityLog("overdue_notification_run", request, {
    tenants: tenantIds.length,
    recipients: (membershipRows || []).length,
    planned,
    sent,
    failed,
    dryRun,
  });
  json(response, 200, {
    ok: failed === 0,
    tenants: tenantIds.length,
    recipients: (membershipRows || []).length,
    planned,
    sent,
    failed,
    dryRun,
  });
}

module.exports = async function handler(request, response) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  const isCronRequest = header(request, "user-agent").includes("vercel-cron/")
    || (cronSecret && header(request, "authorization") === `Bearer ${cronSecret}`);
  if (request.method === "GET" && isCronRequest) {
    try {
      await sendOverdueNotifications(request, response);
    } catch (error) {
      handleError(response, error, request);
    }
    return;
  }

  if (!enforceRequest(request, response, {
    methods: ["GET"],
    maxBodyBytes: 1024,
    rateLimit: { limit: 120, windowMs: 60 * 1000, key: "jobs" },
  })) return;

  try {
    const tenantCode = String(request.query?.tenant || "").trim();
    if (!tenantCode) throw new PublicError("Franquia não informada.");
    if (tenantCode.length > 80 || !/^[a-zA-Z0-9._-]+$/.test(tenantCode)) throw new PublicError("Franquia inválida.");
    const client = getAdminClient();
    const { data: tenant, error: tenantError } = await client
      .from("tenants")
      .select("id, code, name, status")
      .eq("code", tenantCode)
      .eq("status", "active")
      .maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant) throw new PublicError("Franquia não encontrada.", 404);
    const { data: activation, error: activationError } = await client
      .from("tenant_modules")
      .select("status")
      .eq("tenant_id", tenant.id)
      .eq("module_code", "hr")
      .maybeSingle();
    if (activationError) throw activationError;
    if (activation?.status !== "active") throw new PublicError("O portal de vagas não está ativo para esta franquia.", 403);

    const { data: records, error } = await client
      .from("module_records")
      .select("id, title, status, payload, public_slug, created_at")
      .eq("tenant_id", tenant.id)
      .eq("module_code", "hr")
      .eq("record_type", "vacancy")
      .eq("archived", false)
      .eq("status", "Aberta")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const jobs = (records || [])
      .filter((record) => record.payload?.public !== false)
      .map((record) => ({
        id: record.id,
        slug: record.public_slug,
        title: record.title,
        department: record.payload?.department || "",
        workType: record.payload?.workType || "Presencial",
        city: record.payload?.city || "",
        quantity: record.payload?.quantity || 1,
        salary: record.payload?.salary || "",
        requirements: record.payload?.requirements || "",
        description: record.payload?.description || "",
      }));

    json(response, 200, { tenant: { code: tenant.code, name: tenant.name }, jobs });
  } catch (error) {
    handleError(response, error, request);
  }
};
