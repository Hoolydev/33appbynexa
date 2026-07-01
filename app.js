let data = window.FRANCHISE_DATA;
const supabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseEnabled = Boolean(supabaseConfig.url && supabaseConfig.anonKey);

const state = {
  view: "dashboard",
  search: "",
  selectedUnitId: data.units[0]?.id || "",
  roadmapFilters: {
    unit: "all",
    status: "all",
    phase: "all",
  },
  dashboardUnit: "all",
  expandedUnitId: "",
  accreditationUnit: "all",
  statusOverrides: readStorage("franchiseStatusOverrides", {}),
  drafts: readStorage("franchiseDrafts", []),
  auth: readStorage("appSession", null),
  loading: false,
};

const statusOptions = ["Concluído", "Em Andamento", "Pendente", "Sem status"];

const app = document.querySelector("#app");
const appShell = document.querySelector("#app-shell");
const landingScreen = document.querySelector("#landing-screen");
const loginScreen = document.querySelector("#login-screen");
const title = document.querySelector("#view-title");
const globalSearch = document.querySelector("#global-search");
const exportButton = document.querySelector("#export-csv");
const logoutButton = document.querySelector("#logout-button");
const sourceCount = document.querySelector("#source-count");

updateSourceCount();

landingScreen.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-login]")) {
    showLogin();
  }
});

loginScreen.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-login]")) {
    showLanding();
  }
});

loginScreen.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (!form.matches("[data-login-form]")) return;
  await login(form);
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    render();
  });
});

globalSearch.addEventListener("input", (event) => {
  state.search = event.target.value.trim().toLowerCase();
  render();
});

exportButton.addEventListener("click", exportCurrentView);
logoutButton.addEventListener("click", logout);

app.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.matches("[data-roadmap-filter]")) {
    state.roadmapFilters[target.dataset.roadmapFilter] = target.value;
    render();
  }
  if (target.matches("[data-accreditation-unit]")) {
    state.accreditationUnit = target.value;
    render();
  }
  if (target.matches("[data-dashboard-unit]")) {
    state.dashboardUnit = target.value;
    state.expandedUnitId = target.value === "all" ? "" : target.value;
    render();
  }
  if (target.matches("[data-status-id]")) {
    await updateStatus(target.dataset.statusId, target.value);
  }
});

app.addEventListener("click", (event) => {
  const selectUnit = event.target.closest("[data-select-unit]");
  if (selectUnit) {
    state.dashboardUnit = selectUnit.dataset.selectUnit;
    state.expandedUnitId = selectUnit.dataset.selectUnit;
    state.view = "dashboard";
    activateNav("dashboard");
    render();
  }

  const toggleUnit = event.target.closest("[data-toggle-unit]");
  if (toggleUnit) {
    const unitId = toggleUnit.dataset.toggleUnit;
    state.expandedUnitId = state.expandedUnitId === unitId ? "" : unitId;
    render();
  }

  const createDraft = event.target.closest("[data-create-draft]");
  if (createDraft) {
    createNewDraft();
  }

  const removeDraft = event.target.closest("[data-remove-draft]");
  if (removeDraft) {
    state.drafts = state.drafts.filter((draft) => draft.id !== removeDraft.dataset.removeDraft);
    writeStorage("franchiseDrafts", state.drafts);
    render();
  }
});

init();

async function init() {
  if (!supabaseEnabled || !state.auth?.token) {
    showLanding();
    return;
  }

  try {
    await loadSupabaseData();
    showApp();
  } catch (error) {
    console.error(error);
    state.auth = null;
    writeStorage("appSession", null);
    showLogin("Sessão expirada. Entre novamente.");
  }
}

function showLogin(message = "") {
  landingScreen.hidden = true;
  appShell.hidden = true;
  loginScreen.hidden = false;
  loginScreen.innerHTML = `
    <form class="login-card" data-login-form>
      <button class="login-close" data-close-login type="button" aria-label="Voltar para a apresentação">×</button>
      <div class="brand login-brand">
        <img class="brand-lockup" src="./assets/nexa-logo.svg" alt="Nexa - conectando pessoas e transformando resultados" />
      </div>
      <div>
        <p class="eyebrow">Acesso restrito</p>
        <h1>Entrar no sistema</h1>
      </div>
      ${message ? `<div class="login-alert">${escapeHtml(message)}</div>` : ""}
      ${!supabaseEnabled ? `<div class="login-alert">Configure URL e anon key em supabase-config.js para habilitar o login.</div>` : ""}
      <label>
        <span>E-mail</span>
        <input name="email" type="email" autocomplete="username" required ${!supabaseEnabled ? "disabled" : ""} />
      </label>
      <label>
        <span>Senha</span>
        <input name="password" type="password" autocomplete="current-password" required ${!supabaseEnabled ? "disabled" : ""} />
      </label>
      <button class="primary-button" type="submit" ${!supabaseEnabled ? "disabled" : ""}>Entrar</button>
      <small>Conexão segura com criptografia de ponta a ponta.</small>
    </form>
  `;
}

function showLanding() {
  loginScreen.hidden = true;
  appShell.hidden = true;
  landingScreen.hidden = false;
}

function showApp() {
  landingScreen.hidden = true;
  loginScreen.hidden = true;
  appShell.hidden = false;
  updateSourceCount();
  render();
}

async function login(form) {
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Entrando...";

  try {
    const payload = await supabaseRpc("login_app_user", {
      p_email: form.email.value,
      p_password: form.password.value,
    });
    state.auth = payload;
    writeStorage("appSession", payload);
    await loadSupabaseData();
    showApp();
  } catch (error) {
    showLogin(error.message || "Não foi possível entrar.");
  }
}

async function logout() {
  if (state.auth?.token && supabaseEnabled) {
    try {
      await supabaseRpc("logout_app_user", { p_token: state.auth.token });
    } catch {
      // Session cleanup is best-effort; local logout still proceeds.
    }
  }
  state.auth = null;
  writeStorage("appSession", null);
  showLogin();
}

async function loadSupabaseData() {
  const payload = await supabaseRpc("get_app_data", { p_token: state.auth.token });
  data = normalizeLoadedData(payload);
  state.selectedUnitId = data.units[0]?.id || "";
  state.dashboardUnit = "all";
  state.expandedUnitId = "";
}

function normalizeLoadedData(payload) {
  return {
    ...payload,
    sourceFiles: payload.sourceFiles || [],
    units: payload.units || [],
    accreditation: payload.accreditation || { units: [], procedures: [] },
    modelTasks: payload.modelTasks || [],
    purchaseItems: payload.purchaseItems || [],
    summary: {
      taskStatus: {},
      purchaseStatus: {},
      accreditationStatus: {},
      ...(payload.summary || {}),
    },
  };
}

async function supabaseRpc(functionName, body) {
  const response = await fetch(`${supabaseConfig.url.replace(/\/$/, "")}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: supabaseConfig.anonKey,
      Authorization: `Bearer ${supabaseConfig.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.message || payload?.hint || "Erro ao comunicar com Supabase.");
  }
  return payload;
}

function updateSourceCount() {
  sourceCount.textContent = supabaseEnabled ? "Supabase" : `${data.sourceFiles.length} planilhas`;
}

function render() {
  const titles = {
    dashboard: "Dashboard",
    units: "Unidades",
    roadmap: "Roadmap",
    purchases: "Compras",
    accreditation: "Credenciamentos",
    "new-unit": "Nova franquia",
  };
  title.textContent = titles[state.view];

  const views = {
    dashboard: renderDashboard,
    units: renderUnits,
    roadmap: renderRoadmap,
    purchases: renderPurchases,
    accreditation: renderAccreditation,
    "new-unit": renderNewUnit,
  };
  app.innerHTML = views[state.view]();
}

function allUnits() {
  return [...data.units, ...state.drafts];
}

function roadmapUnits() {
  return allUnits().filter((unit) => unit.tasks?.length);
}

function unitProgress(unit) {
  const tasks = unit.tasks || [];
  const total = tasks.length || 1;
  const done = tasks.filter((task) => getStatus(task) === "Concluído").length;
  const inProgress = tasks.filter((task) => getStatus(task) === "Em Andamento").length;
  const pending = tasks.filter((task) => getStatus(task) === "Pendente").length;
  return {
    total: tasks.length,
    done,
    inProgress,
    pending,
    percent: Math.round((done / total) * 100),
  };
}

function getStatus(item) {
  return state.statusOverrides[item.id] || item.status || "Sem status";
}

async function updateStatus(itemId, status) {
  if (supabaseEnabled && state.auth?.token) {
    const functionName = isPurchaseId(itemId) ? "update_purchase_status" : "update_task_status";
    const payload = isPurchaseId(itemId)
      ? { p_token: state.auth.token, p_purchase_id: itemId, p_status: status }
      : { p_token: state.auth.token, p_task_id: itemId, p_status: status };
    await supabaseRpc(functionName, payload);
    setLocalItemStatus(itemId, status);
    render();
    return;
  }

  state.statusOverrides[itemId] = status;
  writeStorage("franchiseStatusOverrides", state.statusOverrides);
  render();
}

function isPurchaseId(itemId) {
  return itemId.includes("-compra-") || itemId.includes("-purchase-");
}

function setLocalItemStatus(itemId, status) {
  for (const unit of data.units) {
    const task = unit.tasks?.find((item) => item.id === itemId);
    if (task) task.status = status;
    const purchase = unit.purchases?.find((item) => item.id === itemId);
    if (purchase) purchase.status = status;
  }
}

function daysTo(dateValue) {
  if (!dateValue) return null;
  const target = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function formatDays(dateValue) {
  const days = daysTo(dateValue);
  if (days === null) return "sem data";
  if (days === 0) return "hoje";
  if (days > 0) return `${days} dias`;
  return `${Math.abs(days)} dias em atraso`;
}

function riskLevel(unit) {
  const progress = unitProgress(unit);
  const days = daysTo(unit.openingDate);
  const overdue = days !== null && days < 0 ? Math.min(30, Math.abs(days)) : 0;
  const score = progress.pending * 2 + progress.inProgress + overdue;
  if (score >= 45) return { label: "Alto", className: "risk-high" };
  if (score >= 22) return { label: "Médio", className: "risk-medium" };
  return { label: "Baixo", className: "risk-low" };
}

function matchesSearch(...values) {
  if (!state.search) return true;
  return values.join(" ").toLowerCase().includes(state.search);
}

function renderDashboard() {
  const units = roadmapUnits();
  const visibleUnits = state.dashboardUnit === "all" ? units : units.filter((unit) => unit.id === state.dashboardUnit);
  const tasks = visibleUnits.flatMap((unit) => unit.tasks);
  const purchases = visibleUnits.flatMap((unit) => unit.purchases || []);
  const done = tasks.filter((task) => getStatus(task) === "Concluído").length;
  const inProgress = tasks.filter((task) => getStatus(task) === "Em Andamento").length;
  const pending = tasks.filter((task) => getStatus(task) === "Pendente").length;
  const avg = Math.round(visibleUnits.reduce((sum, unit) => sum + unitProgress(unit).percent, 0) / Math.max(visibleUnits.length, 1));
  const closedCred = accreditationCountForUnits(visibleUnits);
  const blockers = visibleUnits.flatMap((unit) =>
    unit.tasks
      .filter((task) => getStatus(task) !== "Concluído")
      .slice(0, 4)
      .map((task) => ({ unit, task }))
  );

  return `
    <section class="toolbar-panel dashboard-toolbar">
      <label>
        <span class="small-label">Unidade</span>
        <select data-dashboard-unit>
          <option value="all"${state.dashboardUnit === "all" ? " selected" : ""}>Todas as unidades</option>
          ${units.map((unit) => `<option value="${unit.id}"${state.dashboardUnit === unit.id ? " selected" : ""}>${escapeHtml(unit.city)} ${escapeHtml(unit.state || "")}</option>`).join("")}
        </select>
      </label>
      <div class="view-tabs">
        <span class="view-tab active">Visão geral</span>
        <span class="view-tab">Roadmap</span>
        <span class="view-tab">Compras</span>
        <span class="view-tab">Credenciamentos</span>
      </div>
    </section>

    <div class="grid kpi-grid">
      ${kpi("Unidades em implantação", visibleUnits.length, `${state.drafts.length} plano(s) novo(s)`)}
      ${kpi("Progresso médio", `${avg}%`, `${done} de ${tasks.length} etapas concluídas`)}
      ${kpi("Etapas pendentes", pending, `${inProgress} em andamento`)}
      ${kpi("Credenciamentos mapeados", closedCred, `${data.accreditation.procedures.length} procedimentos com status`)}
    </div>

    <div class="grid two-col" style="margin-top:16px">
      <section class="panel">
        <h2>Roadmap por unidade</h2>
        <div class="unit-accordion">
          ${visibleUnits
            .filter((unit) => matchesSearch(unit.name, unit.franchisee, unit.city))
            .map((unit) => dashboardUnitRow(unit))
            .join("") || empty("Nenhuma unidade encontrada")}
        </div>
      </section>

      <section class="panel">
        <h2>Pendências por unidade</h2>
        ${pendingByUnitChart(visibleUnits)}
      </section>
    </div>

    <div class="grid two-col" style="margin-top:16px">
      <section class="panel">
        <h2>Status geral do roadmap</h2>
        ${statusDistributionChart(done, inProgress, pending)}
      </section>

      <section class="panel">
        <h2>Próximas pendências</h2>
        <div class="blocker-list">
          ${blockers
            .filter(({ unit, task }) => matchesSearch(unit.name, task.process, task.phase))
            .slice(0, 12)
            .map(({ unit, task }) => `
              <div class="unit-card">
                <header>
                  <div>
                    <strong>${escapeHtml(task.process)}</strong>
                    <div class="meta">${escapeHtml(unit.city)} · ${escapeHtml(task.phase)}</div>
                  </div>
                  ${statusBadge(getStatus(task))}
                </header>
              </div>
            `)
            .join("") || empty("Nenhum bloqueio encontrado")}
        </div>
      </section>
    </div>
  `;
}

function accreditationCountForUnits(units) {
  const ids = new Set(units.map((unit) => unit.id));
  return data.accreditation.procedures.reduce((total, procedure) => {
    return total + Object.entries(procedure.statuses).filter(([unitId]) => ids.has(unitId)).length;
  }, 0);
}

function dashboardUnitRow(unit) {
  const progress = unitProgress(unit);
  const risk = riskLevel(unit);
  const expanded = state.expandedUnitId === unit.id || state.dashboardUnit === unit.id;
  return `
    <article class="unit-workspace ${expanded ? "expanded" : ""}">
      <button class="unit-workspace-head" data-toggle-unit="${unit.id}" type="button">
        <span>
          <strong>${escapeHtml(unit.city)} ${escapeHtml(unit.state || "")}</strong>
          <small>${escapeHtml(unit.franchisee || "Franqueado a definir")}</small>
        </span>
        <span class="unit-head-metrics">
          ${statusBadge(`${progress.percent}%`, "done")}
          <span class="${risk.className}">${risk.label}</span>
          <span class="chevron">${expanded ? "−" : "+"}</span>
        </span>
      </button>
      <div class="stacked-bar" aria-label="Progresso ${progress.percent}%">
        <span class="done" style="--value:${(progress.done / Math.max(progress.total, 1)) * 100}%"></span>
        <span class="progress" style="--value:${(progress.inProgress / Math.max(progress.total, 1)) * 100}%"></span>
        <span class="pending" style="--value:${(progress.pending / Math.max(progress.total, 1)) * 100}%"></span>
      </div>
      <div class="badge-row">
        ${statusBadge(`${progress.done} concluídas`, "done")}
        ${statusBadge(`${progress.inProgress} em andamento`, "progress")}
        ${statusBadge(`${progress.pending} pendentes`, "pending")}
        <span class="badge info">${formatDays(unit.openingDate)}</span>
      </div>
      ${expanded ? unitDetail(unit) : ""}
    </article>
  `;
}

function unitDetail(unit) {
  const byPhase = groupBy(unit.tasks || [], (task) => task.phase);
  const accreditationRows = accreditationForUnit(unit);
  return `
    <div class="unit-detail">
      <section class="detail-section">
        <h3>Progresso por fase</h3>
        ${Object.entries(byPhase).map(([phase, tasks]) => phaseProgress(phase, tasks)).join("")}
      </section>
      <section class="detail-section">
        <h3>Compras</h3>
        <div class="compact-list">
          ${(unit.purchases || [])
            .map((item) => `
              <label class="compact-row">
                <span>${escapeHtml(item.item)}</span>
                ${statusSelect(item)}
              </label>
            `)
            .join("")}
        </div>
      </section>
      <section class="detail-section wide">
        <h3>Roadmap da unidade</h3>
        <div class="table-wrap">
          <table class="workspace-table compact-table">
            <thead>
              <tr>
                <th>Fase</th>
                <th>Item</th>
                <th>Etapa</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${(unit.tasks || [])
                .map((task) => `
                  <tr>
                    <td>${escapeHtml(task.phase)}</td>
                    <td>${escapeHtml(task.item)}</td>
                    <td><span class="row-title">${escapeHtml(task.process)}</span></td>
                    <td>${statusSelect(task)}</td>
                  </tr>
                `)
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
      <section class="detail-section wide">
        <h3>Credenciamentos</h3>
        <div class="table-wrap">
          <table class="workspace-table compact-table">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Procedimento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${accreditationRows
                .map((row) => `
                  <tr>
                    <td>${escapeHtml(row.group)}</td>
                    <td>${escapeHtml(row.name)}</td>
                    <td>${heatCell(row.status)}</td>
                  </tr>
                `)
                .join("") || `<tr><td colspan="3">${empty("Sem credenciamentos mapeados para esta unidade")}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function accreditationForUnit(unit) {
  return data.accreditation.procedures.map((procedure) => ({
    group: procedure.group,
    name: procedure.name,
    status: procedure.statuses[unit.id] || "",
  }));
}

function pendingByUnitChart(units) {
  const rows = units
    .map((unit) => ({ unit, pending: unitProgress(unit).pending, progress: unitProgress(unit).percent }))
    .sort((a, b) => b.pending - a.pending);
  const max = Math.max(1, ...rows.map((row) => row.pending));
  return `
    <div class="pending-chart">
      ${rows
        .map(({ unit, pending, progress }) => `
          <button class="chart-row" data-select-unit="${unit.id}" type="button">
            <span>${escapeHtml(unit.city)}</span>
            <div class="bar"><span class="pending" style="--value:${(pending / max) * 100}%"></span></div>
            <strong>${pending}</strong>
            <small>${progress}%</small>
          </button>
        `)
        .join("") || empty("Nenhuma pendência")}
    </div>
  `;
}

function statusDistributionChart(done, inProgress, pending) {
  const total = Math.max(1, done + inProgress + pending);
  return `
    <div class="status-split">
      <div class="stacked-bar tall">
        <span class="done" style="--value:${(done / total) * 100}%"></span>
        <span class="progress" style="--value:${(inProgress / total) * 100}%"></span>
        <span class="pending" style="--value:${(pending / total) * 100}%"></span>
      </div>
      <div class="badge-row">
        ${statusBadge(`${done} concluídas`, "done")}
        ${statusBadge(`${inProgress} em andamento`, "progress")}
        ${statusBadge(`${pending} pendentes`, "pending")}
      </div>
    </div>
  `;
}

function renderUnits() {
  const units = roadmapUnits().filter((unit) => matchesSearch(unit.name, unit.franchisee, unit.city));
  const selected = units.find((unit) => unit.id === state.selectedUnitId) || units[0] || data.units[0];
  const byPhase = groupBy(selected.tasks || [], (task) => task.phase);
  return `
    <div class="grid two-col">
      <section class="panel">
        <h2>Carteira de unidades</h2>
        <div class="unit-list">
          ${units.map((unit) => unitProgressRow(unit)).join("") || empty("Nenhuma unidade encontrada")}
        </div>
      </section>

      <section class="panel">
        <h2>${escapeHtml(selected.city || selected.name)}</h2>
        <p class="meta">${escapeHtml(selected.franchisee || "Franqueado a definir")}</p>
        <div class="badge-row" style="margin-bottom:16px">
          ${statusBadge(`${unitProgress(selected).percent}% concluído`, "done")}
          <span class="badge info">Inauguração: ${formatDate(selected.openingDate)}</span>
          <span class="badge pending">${formatDays(selected.openingDate)}</span>
        </div>
        ${Object.entries(byPhase)
          .map(([phase, tasks]) => phaseProgress(phase, tasks))
          .join("")}
      </section>
    </div>
  `;
}

function renderRoadmap() {
  const units = roadmapUnits();
  const phases = [...new Set(units.flatMap((unit) => unit.tasks.map((task) => task.phase)))].sort();
  const rows = units
    .flatMap((unit) => unit.tasks.map((task) => ({ unit, task })))
    .filter(({ unit, task }) => state.roadmapFilters.unit === "all" || unit.id === state.roadmapFilters.unit)
    .filter(({ task }) => state.roadmapFilters.status === "all" || getStatus(task) === state.roadmapFilters.status)
    .filter(({ task }) => state.roadmapFilters.phase === "all" || task.phase === state.roadmapFilters.phase)
    .filter(({ unit, task }) => matchesSearch(unit.name, task.process, task.phase, task.notes));
  const grouped = statusOptions.reduce((acc, status) => {
    acc[status] = rows.filter(({ task }) => getStatus(task) === status);
    return acc;
  }, {});

  return `
    <section class="toolbar-panel">
      <div class="filters">
        ${selectFilter("unit", "Unidade", [["all", "Todas"], ...units.map((unit) => [unit.id, unit.city])], state.roadmapFilters.unit)}
        ${selectFilter("status", "Status", [["all", "Todos"], ...statusOptions.map((status) => [status, status])], state.roadmapFilters.status)}
        ${selectFilter("phase", "Fase", [["all", "Todas"], ...phases.map((phase) => [phase, phase])], state.roadmapFilters.phase)}
        <div>
          <span class="small-label">Resultado</span>
          <strong>${rows.length} etapas</strong>
        </div>
      </div>
      <div class="view-tabs" aria-label="Visualização do roadmap">
        <span class="view-tab active">Lista</span>
        <span class="view-tab">Quadro</span>
        <span class="view-tab">Carga</span>
      </div>
    </section>

    <section class="roadmap-board">
      ${roadmapColumn("Concluído", grouped["Concluído"])}
      ${roadmapColumn("Em Andamento", grouped["Em Andamento"])}
      ${roadmapColumn("Pendente", grouped["Pendente"])}
    </section>

    <section class="panel tight">
      <div class="table-wrap">
        <table class="workspace-table">
          <thead>
            <tr>
              <th>Unidade</th>
              <th>Fase</th>
              <th>Item</th>
              <th>Etapa</th>
              <th>Status</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(({ unit, task }) => `
                <tr>
                  <td class="nowrap"><button class="link-button" data-select-unit="${unit.id}" type="button">${escapeHtml(unit.city)}</button></td>
                  <td>${escapeHtml(task.phase)}</td>
                  <td>${escapeHtml(task.item)}</td>
                  <td><span class="row-title">${escapeHtml(task.process)}</span></td>
                  <td>${statusSelect(task)}</td>
                  <td>${escapeHtml(task.notes || "")}</td>
                </tr>
              `)
              .join("") || `<tr><td colspan="6">${empty("Nenhuma etapa encontrada")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function roadmapColumn(status, rows) {
  return `
    <article class="kanban-column ${statusClass(status)}">
      <header>
        <div>
          <span class="tiny-dot"></span>
          <strong>${escapeHtml(status)}</strong>
        </div>
        <span class="task-count">${rows.length}</span>
      </header>
      <div class="kanban-list">
        ${rows
          .slice(0, 5)
          .map(({ unit, task }) => `
            <button class="task-chip" data-select-unit="${unit.id}" type="button">
              <strong>${escapeHtml(task.process)}</strong>
              <span>${escapeHtml(unit.city)} · ${escapeHtml(task.phase)}</span>
            </button>
          `)
          .join("") || empty("Sem etapas")}
      </div>
    </article>
  `;
}

function renderPurchases() {
  const units = roadmapUnits();
  const rows = units
    .flatMap((unit) => (unit.purchases || []).map((item) => ({ unit, item })))
    .filter(({ unit, item }) => matchesSearch(unit.name, item.item, item.notes));

  return `
    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Unidade</th>
              <th>Item</th>
              <th>Status</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(({ unit, item }) => `
                <tr>
                  <td class="nowrap">${escapeHtml(unit.city)}</td>
                  <td>${escapeHtml(item.item)}</td>
                  <td>${statusSelect(item)}</td>
                  <td>${escapeHtml(item.notes || "")}</td>
                </tr>
              `)
              .join("") || `<tr><td colspan="4">${empty("Nenhum item encontrado")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAccreditation() {
  const units = data.accreditation.units;
  const visibleUnits = state.accreditationUnit === "all" ? units : units.filter((unit) => unit.id === state.accreditationUnit);
  const rows = data.accreditation.procedures.filter((procedure) =>
    matchesSearch(procedure.name, procedure.group, Object.values(procedure.statuses).join(" "))
  );

  return `
    <section class="panel">
      <div class="filters">
        <label>
          <span class="small-label">Unidade</span>
          <select data-accreditation-unit>
            <option value="all"${state.accreditationUnit === "all" ? " selected" : ""}>Todas</option>
            ${units.map((unit) => `<option value="${unit.id}"${state.accreditationUnit === unit.id ? " selected" : ""}>${escapeHtml(unit.name)}</option>`).join("")}
          </select>
        </label>
        <div>
          <span class="small-label">Procedimentos</span>
          <strong>${rows.length}</strong>
        </div>
        <div>
          <span class="small-label">Fechados</span>
          <strong>${data.summary.accreditationStatus.FECHADO || 0}</strong>
        </div>
        <div>
          <span class="small-label">Negociação</span>
          <strong>${data.summary.accreditationStatus["EM NEGOCIAÇÃO"] || 0}</strong>
        </div>
      </div>
      <div class="table-wrap">
        <table class="heatmap">
          <thead>
            <tr>
              <th>Grupo</th>
              <th>Procedimento</th>
              ${visibleUnits.map((unit) => `<th>${escapeHtml(unit.name)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((procedure) => `
                <tr>
                  <td>${escapeHtml(procedure.group)}</td>
                  <td>${escapeHtml(procedure.name)}</td>
                  ${visibleUnits.map((unit) => `<td>${heatCell(procedure.statuses[unit.id] || "")}</td>`).join("")}
                </tr>
              `)
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderNewUnit() {
  return `
    <div class="grid two-col">
      <section class="panel">
        <h2>Plano de abertura</h2>
        <div class="form-grid">
          <label>Cidade <input id="draft-city" placeholder="Ex.: Recife" /></label>
          <label>UF <input id="draft-state" maxlength="2" placeholder="PE" /></label>
          <label>Inauguração estimada <input id="draft-date" type="date" /></label>
          <label>Franqueado <input id="draft-franchisee" placeholder="Nome e telefone" /></label>
          <label>Responsável credenciamento <input id="draft-owner" placeholder="Responsável" /></label>
          <label>Prioridade
            <select id="draft-priority">
              <option>Normal</option>
              <option>Alta</option>
              <option>Baixa</option>
            </select>
          </label>
        </div>
        <div class="form-actions">
          <button class="primary-button" data-create-draft type="button">Criar plano</button>
        </div>
      </section>

      <section class="panel">
        <h2>Template operacional</h2>
        ${miniChart([
          ["Etapas", data.modelTasks.length, data.modelTasks.length],
          ["Compras", data.purchaseItems.length, data.purchaseItems.length],
          ["Procedimentos", data.accreditation.procedures.length, data.accreditation.procedures.length],
        ])}
      </section>
    </div>

    <section class="panel" style="margin-top:16px">
      <h2>Planos criados</h2>
      <div class="draft-grid">
        ${state.drafts
          .map((draft) => `
            <div class="unit-card">
              <header>
                <div>
                  <strong>${escapeHtml(draft.city)} ${escapeHtml(draft.state || "")}</strong>
                  <div class="meta">${escapeHtml(draft.franchisee || "Franqueado a definir")}</div>
                </div>
                <button class="icon-button" data-remove-draft="${draft.id}" title="Remover plano" type="button">×</button>
              </header>
              <div class="badge-row">
                <span class="badge info">Inauguração: ${formatDate(draft.openingDate)}</span>
                ${statusBadge(`${unitProgress(draft).percent}% concluído`, "done")}
              </div>
            </div>
          `)
          .join("") || empty("Nenhum plano criado nesta sessão")}
      </div>
    </section>
  `;
}

function unitProgressRow(unit) {
  const progress = unitProgress(unit);
  const risk = riskLevel(unit);
  return `
    <article class="unit-card">
      <header>
        <div>
          <button data-select-unit="${unit.id}" type="button">${escapeHtml(unit.city)} ${escapeHtml(unit.state || "")}</button>
          <div class="meta">${escapeHtml(unit.franchisee || "Franqueado a definir")}</div>
        </div>
        <span class="${risk.className}">${risk.label}</span>
      </header>
      <div class="stacked-bar" aria-label="Progresso ${progress.percent}%">
        <span class="done" style="--value:${(progress.done / Math.max(progress.total, 1)) * 100}%"></span>
        <span class="progress" style="--value:${(progress.inProgress / Math.max(progress.total, 1)) * 100}%"></span>
        <span class="pending" style="--value:${(progress.pending / Math.max(progress.total, 1)) * 100}%"></span>
      </div>
      <div class="badge-row">
        ${statusBadge(`${progress.done} concluídas`, "done")}
        ${statusBadge(`${progress.inProgress} em andamento`, "progress")}
        ${statusBadge(`${progress.pending} pendentes`, "pending")}
        <span class="badge info">${formatDays(unit.openingDate)}</span>
      </div>
    </article>
  `;
}

function phaseProgress(phase, tasks) {
  const total = tasks.length || 1;
  const done = tasks.filter((task) => getStatus(task) === "Concluído").length;
  const percent = Math.round((done / total) * 100);
  return `
    <div class="phase-row">
      <div><strong>${escapeHtml(phase)}</strong><span>${done}/${tasks.length}</span></div>
      <div class="bar"><span style="--value:${percent}%"></span></div>
    </div>
  `;
}

function kpi(label, value, detail) {
  return `
    <section class="panel kpi">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(detail)}</small>
    </section>
  `;
}

function miniChart(rows) {
  return `
    <div class="mini-chart">
      ${rows
        .map(([label, value, total]) => {
          const percent = total ? Math.round((value / total) * 100) : 0;
          return `
            <div class="mini-chart-row">
              <span title="${escapeHtml(label)}">${escapeHtml(label)}</span>
              <div class="bar"><span style="--value:${percent}%"></span></div>
              <strong>${escapeHtml(String(value))}</strong>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function selectFilter(key, label, options, value) {
  return `
    <label>
      <span class="small-label">${escapeHtml(label)}</span>
      <select data-roadmap-filter="${key}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}"${optionValue === value ? " selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
      </select>
    </label>
  `;
}

function statusSelect(item) {
  return `
    <select class="${statusClass(getStatus(item))}" data-status-id="${item.id}" aria-label="Status de ${escapeHtml(item.process || item.item)}">
      ${statusOptions.map((status) => `<option value="${status}"${getStatus(item) === status ? " selected" : ""}>${status}</option>`).join("")}
    </select>
  `;
}

function statusBadge(label, forcedClass) {
  const className = forcedClass || statusClass(label);
  return `<span class="badge ${className}">${escapeHtml(label)}</span>`;
}

function statusClass(status) {
  if (status === "Concluído" || status.includes("conclu")) return "done";
  if (status === "Em Andamento" || status.includes("andamento")) return "progress";
  if (status === "Pendente" || status.includes("pend")) return "pending";
  return "info";
}

function heatCell(status) {
  const classes = {
    FECHADO: "heat-closed",
    "FECHADO E EM NEGOCIAÇÃO": "heat-mixed",
    "EM NEGOCIAÇÃO": "heat-negotiation",
  };
  const label = status ? status.replace("FECHADO E EM NEGOCIAÇÃO", "MISTO") : "VAZIO";
  return `<span class="heat-cell ${classes[status] || "heat-empty"}">${escapeHtml(label)}</span>`;
}

function formatDate(value) {
  if (!value) return "sem data";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

async function createNewDraft() {
  const city = document.querySelector("#draft-city").value.trim();
  const stateCode = document.querySelector("#draft-state").value.trim().toUpperCase();
  const openingDate = document.querySelector("#draft-date").value;
  const franchisee = document.querySelector("#draft-franchisee").value.trim();
  const owner = document.querySelector("#draft-owner").value.trim();
  const priority = document.querySelector("#draft-priority").value;

  if (!city || !openingDate) {
    alert("Informe cidade e inauguração estimada.");
    return;
  }

  if (supabaseEnabled && state.auth?.token) {
    const result = await supabaseRpc("create_unit_from_template", {
      p_token: state.auth.token,
      p_city: city,
      p_state: stateCode,
      p_franchisee: franchisee,
      p_opening_date: openingDate,
      p_owner_name: owner,
      p_priority: priority,
    });
    await loadSupabaseData();
    state.selectedUnitId = result.unitId;
    state.dashboardUnit = result.unitId;
    state.expandedUnitId = result.unitId;
    state.view = "dashboard";
    activateNav("dashboard");
    showApp();
    return;
  }

  const id = `draft-${slug(`${city}-${stateCode}-${Date.now()}`)}`;
  const draft = {
    id,
    name: `${city.toUpperCase()} ${stateCode}`,
    city,
    state: stateCode,
    franchisee,
    openingDate,
    owner,
    priority,
    sourceFile: "Plano criado no sistema",
    tasks: data.modelTasks.map((task, index) => ({
      id: `${id}-task-${index + 1}`,
      item: task.item,
      phase: task.phase,
      process: task.process,
      status: "Pendente",
      deadline: "",
      actualDate: "",
      notes: "",
    })),
    purchases: data.purchaseItems.map((item, index) => ({
      id: `${id}-purchase-${index + 1}`,
      item,
      status: "Pendente",
      notes: "",
    })),
  };

  state.drafts = [draft, ...state.drafts];
  writeStorage("franchiseDrafts", state.drafts);
  state.selectedUnitId = id;
  render();
}

function exportCurrentView() {
  let rows = [];
  if (state.view === "accreditation") {
    rows = data.accreditation.procedures.flatMap((procedure) =>
      data.accreditation.units.map((unit) => ({
        grupo: procedure.group,
        procedimento: procedure.name,
        unidade: unit.name,
        status: procedure.statuses[unit.id] || "",
      }))
    );
  } else {
    rows = roadmapUnits().flatMap((unit) =>
      unit.tasks.map((task) => ({
        unidade: unit.city,
        franqueado: unit.franchisee,
        inauguracao: unit.openingDate,
        fase: task.phase,
        item: task.item,
        etapa: task.process,
        status: getStatus(task),
        observacoes: task.notes,
      }))
    );
  }
  downloadCsv(`${state.view}-nexa.csv`, rows);
}

function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(";"),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(";")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] ||= [];
    acc[key].push(item);
    return acc;
  }, {});
}

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function activateNav(view) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}
