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
  dashboardTab: "overview",
  expandedUnitId: "",
  franchiseWorkspaceUnitId: "",
  unitTabs: readStorage("franchiseUnitTabs", {}),
  accreditationUnit: "all",
  statusOverrides: readStorage("franchiseStatusOverrides", {}),
  pendencyNotes: readStorage("franchisePendencyNotes", {}),
  unitRecords: readStorage("franchiseUnitRecords", {}),
  profile: readStorage("nexaUserProfile", { name: "Usuário Nexa", photo: "" }),
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
const topbarDate = document.querySelector("#topbar-date");
const profileToggle = document.querySelector("#profile-toggle");
const profileMenu = document.querySelector("#profile-menu");
const profileNameDisplay = document.querySelector("#profile-name-display");
const profileChipName = document.querySelector("#profile-chip-name");
const profileAvatar = document.querySelector("#profile-avatar");
const topbarAvatar = document.querySelector("#topbar-avatar");
const profileAvatarPreview = document.querySelector("#profile-avatar-preview");
const profileNameInput = document.querySelector("#profile-name-input");
const profilePhotoInput = document.querySelector("#profile-photo-input");
const profileSave = document.querySelector("#profile-save");

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
profileToggle.addEventListener("click", () => {
  const isOpen = !profileMenu.hidden;
  profileMenu.hidden = isOpen;
  profileToggle.setAttribute("aria-expanded", String(!isOpen));
});
profileSave.addEventListener("click", saveProfile);
profileMenu.addEventListener("submit", (event) => event.preventDefault());
profilePhotoInput.addEventListener("change", updateProfilePhoto);

document.addEventListener("click", (event) => {
  if (!event.target.closest(".profile-control")) {
    profileMenu.hidden = true;
    profileToggle.setAttribute("aria-expanded", "false");
  }
});

document.querySelectorAll("[data-quick-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.quickView;
    if (state.view === "franchises") state.franchiseWorkspaceUnitId = "";
    activateNav(state.view);
    render();
  });
});

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
    render();
  }
  if (target.matches("[data-franchise-workspace-unit]")) {
    state.franchiseWorkspaceUnitId = target.value;
    render();
  }
  if (target.matches("[data-status-id]")) {
    await updateStatus(target.dataset.statusId, target.value);
  }
  if (target.matches("[data-pendency-note]")) {
    updatePendencyNote(target.dataset.pendencyNote, target.value);
  }
  if (target.matches("[data-resolve-pendency]")) {
    await resolvePendency(target.dataset.resolvePendency, target.checked);
  }
});

app.addEventListener("click", (event) => {
  const dashboardTab = event.target.closest("[data-dashboard-tab]");
  if (dashboardTab) {
    state.dashboardTab = dashboardTab.dataset.dashboardTab;
    render();
  }

  const selectUnit = event.target.closest("[data-select-unit]");
  if (selectUnit) {
    state.franchiseWorkspaceUnitId = selectUnit.dataset.selectUnit;
    state.view = "franchises";
    activateNav("franchises");
    render();
  }

  const toggleUnit = event.target.closest("[data-toggle-unit]");
  if (toggleUnit) {
    state.franchiseWorkspaceUnitId = toggleUnit.dataset.toggleUnit;
    state.view = "franchises";
    activateNav("franchises");
    render();
  }

  const clearUnit = event.target.closest("[data-clear-franchise-unit]");
  if (clearUnit) {
    state.franchiseWorkspaceUnitId = "";
    state.view = "franchises";
    activateNav("franchises");
    render();
  }

  const createDraft = event.target.closest("[data-create-draft]");
  if (createDraft) {
    createNewDraft();
  }

  const unitTab = event.target.closest("[data-unit-tab]");
  if (unitTab) {
    state.unitTabs[unitTab.dataset.unitId] = unitTab.dataset.unitTab;
    writeStorage("franchiseUnitTabs", state.unitTabs);
    render();
  }

  const addRecord = event.target.closest("[data-add-unit-record]");
  if (addRecord) {
    addUnitRecord(addRecord);
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
  updateProfileUI();
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
  state.franchiseWorkspaceUnitId = "";
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
  if (sourceCount) sourceCount.textContent = supabaseEnabled ? "Supabase" : `${data.sourceFiles.length} planilhas`;
}

function render() {
  const titles = {
    dashboard: "Dashboard",
    franchises: "Franquias",
    units: "Unidades",
    roadmap: "Roadmap",
    purchases: "Compras",
    accreditation: "Credenciamentos",
    "new-unit": "Nova franquia",
  };
  title.textContent = titles[state.view];
  updateTopbarState(titles[state.view]);

  const views = {
    dashboard: renderDashboard,
    franchises: renderFranchises,
    units: renderUnits,
    roadmap: renderRoadmap,
    purchases: renderPurchases,
    accreditation: renderAccreditation,
    "new-unit": renderNewUnit,
  };
  app.innerHTML = views[state.view]();
}

function updateTopbarState(currentTitle) {
  if (topbarDate) {
    topbarDate.textContent = new Date().toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "short",
    });
  }
  document.querySelectorAll("[data-quick-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.quickView === state.view);
  });
  if (title) title.textContent = currentTitle;
  updateProfileUI();
}

function updateProfileUI() {
  if (!profileNameDisplay || !profileChipName || !profileNameInput) return;
  const name = currentProfileName();
  const initials = profileInitials(name);
  profileNameDisplay.textContent = name;
  profileChipName.textContent = name;
  profileNameInput.value = name;
  [profileAvatar, profileAvatarPreview, topbarAvatar].forEach((avatar) => {
    if (!avatar) return;
    avatar.textContent = state.profile.photo ? "" : initials;
    if (avatar.style) avatar.style.backgroundImage = state.profile.photo ? `url("${state.profile.photo}")` : "";
  });
}

function currentProfileName() {
  return state.profile.name || state.auth?.user?.name || state.auth?.name || state.auth?.email?.split("@")[0] || "Usuário Nexa";
}

function profileInitials(name) {
  return String(name || "NX")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "NX";
}

function saveProfile() {
  state.profile = {
    ...state.profile,
    name: profileNameInput.value.trim() || "Usuário Nexa",
  };
  writeStorage("nexaUserProfile", state.profile);
  profileMenu.hidden = true;
  profileToggle.setAttribute("aria-expanded", "false");
  updateProfileUI();
}

function updateProfilePhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.profile = {
      ...state.profile,
      photo: reader.result,
    };
    writeStorage("nexaUserProfile", state.profile);
    updateProfileUI();
  });
  reader.readAsDataURL(file);
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

function unitStats(unit) {
  const progress = unitProgress(unit);
  const docs = documentItems(unit);
  const trainings = trainingItems(unit);
  const meetings = meetingItems(unit);
  const accreditation = accreditationForUnit(unit);
  const pendingItems = pendingItemsForUnit(unit);
  const overduePending = pendingItems.filter((item) => item.overdue).length;
  const approvedDocs = docs.filter((item) => item.status === "Aprovado").length;
  const completedTrainings = trainings.filter((item) => item.status === "Concluído").length;
  const closedAccreditation = accreditation.filter((item) => isAccreditationClosed(item.status)).length;
  return {
    progress,
    documents: docs,
    trainings,
    meetings,
    accreditation,
    pendingItems,
    alerts: alertsForUnit(unit, pendingItems, docs, trainings, accreditation),
    documentsPercent: percentOf(approvedDocs, docs.length),
    accreditationPercent: percentOf(closedAccreditation, accreditation.length),
    trainingPercent: percentOf(completedTrainings, trainings.length),
    approvedDocs,
    pendingDocs: docs.filter((item) => item.status !== "Aprovado").length,
    completedTrainings,
    pendingTrainings: trainings.filter((item) => item.status !== "Concluído").length,
    closedAccreditation,
    pendingAccreditation: accreditation.filter((item) => !isAccreditationClosed(item.status)).length,
    openPending: pendingItems.length,
    overduePending,
  };
}

function percentOf(done, total) {
  return Math.round((done / Math.max(total, 1)) * 100);
}

function unitStatus(unit) {
  const stats = unitStats(unit);
  const days = daysTo(unit.openingDate);
  if (stats.progress.percent >= 95 && stats.pendingAccreditation === 0 && stats.openPending <= 2) {
    return { label: "Pronta para inauguração", className: "done", dot: "green" };
  }
  if (days !== null && days < 0) {
    return { label: stats.overduePending >= 5 ? "Implantação crítica" : "Em atraso", className: "critical", dot: "red" };
  }
  if (stats.pendingDocs > 0) {
    return { label: "Aguardando documentação", className: "pending", dot: "yellow" };
  }
  return { label: "Em implantação", className: "progress", dot: "blue" };
}

function canonicalCategory(text) {
  const value = normalizeText(text);
  if (value.includes("contrato")) return "Contratos";
  if (value.includes("aditivo")) return "Aditivos";
  if (value.includes("cnpj") || value.includes("societ")) return "Documentos societários";
  if (value.includes("bombeiro")) return "Bombeiros";
  if (value.includes("alvara")) return "Alvarás";
  if (value.includes("vigilancia") || value.includes("sanitaria")) return "Vigilância Sanitária";
  if (value.includes("marketing")) return "Marketing";
  if (value.includes("arquitet")) return "Projeto arquitetônico";
  if (value.includes("trein")) return "Treinamentos";
  if (value.includes("reuniao") || value.includes("ata")) return "Atas de reuniões";
  if (value.includes("credenc")) return "Credenciamentos";
  if (value.includes("finance") || value.includes("pagamento")) return "Financeiro";
  if (value.includes("foto")) return "Fotos da implantação";
  if (value.includes("manual")) return "Manual da franquia";
  if (value.includes("licenca") || value.includes("licenca")) return "Licenças";
  return "Documentos da empresa";
}

function documentItems(unit) {
  return (unit.tasks || [])
    .filter((task) => /document|contrato|cnpj|licen|alvar|bombeir|vigil|manual|arquitet|ata|relat|credenc|finance|foto|marketing|trein/i.test(normalizeText(task.process)))
    .map((task, index) => ({
      id: `doc-${task.id}`,
      name: task.process,
      category: canonicalCategory(task.process),
      version: `v${Math.max(1, Math.floor(index / 5) + 1)}`,
      date: task.actualDate || task.deadline || unit.openingDate,
      owner: unit.owner || unit.ownerName || "Implantação",
      status: getStatus(task) === "Concluído" ? "Aprovado" : getStatus(task) === "Em Andamento" ? "Em análise" : "Pendente",
      signature: /contrato|aditivo|document/i.test(normalizeText(task.process)) ? "Aplicável" : "Não aplicável",
      history: task.notes || "Sem histórico registrado",
    }));
}

function trainingItems(unit) {
  return (unit.tasks || [])
    .filter((task) => normalizeText(task.process).includes("trein"))
    .map((task) => ({
      id: `training-${task.id}`,
      name: task.process,
      date: task.actualDate || task.deadline || "",
      instructor: "Equipe Nexa",
      participants: unit.franchisee || "Franqueado e equipe",
      workload: "A definir",
      certificate: getStatus(task) === "Concluído" ? "Liberado" : "Pendente",
      status: getStatus(task),
      attendance: getStatus(task) === "Concluído" ? "Registrada" : "Pendente",
      material: /manual/i.test(normalizeText(task.process)) ? "Manual da franquia" : "Material operacional",
      notes: task.notes || "",
    }));
}

function meetingItems(unit) {
  return (unit.tasks || [])
    .filter((task) => /reuniao|apresentacao|boas vindas|kickoff|alinhamento/i.test(normalizeText(task.process)))
    .slice(0, 16)
    .map((task) => ({
      id: `meeting-${task.id}`,
      date: task.actualDate || task.deadline || "",
      participants: unit.franchisee || "Franqueado",
      subject: task.process,
      pending: getStatus(task) === "Concluído" ? "Sem pendência aberta" : task.process,
      owner: unit.owner || unit.ownerName || "Consultor responsável",
      deadline: task.deadline || unit.openingDate,
      history: task.notes || "Sem observações",
    }));
}

function pendingItemsForUnit(unit) {
  const taskPendencies = (unit.tasks || [])
    .filter((task) => getStatus(task) !== "Concluído")
    .map((task) => ({
      id: task.id,
      title: task.process,
      area: task.phase,
      owner: unit.owner || unit.ownerName || "Implantação",
      deadline: task.deadline || "",
      priority: pendingPriority(task, unit),
      status: getStatus(task),
      attachment: "Não anexado",
      notes: task.notes || "",
      overdue: isOverdue(task.deadline),
    }));
  const purchasePendencies = (unit.purchases || [])
    .filter((item) => getStatus(item) !== "Concluído")
    .map((item) => ({
      id: item.id,
      title: item.item,
      area: "Compras",
      owner: "Operação",
      deadline: "",
      priority: "Média",
      status: getStatus(item),
      attachment: "Não anexado",
      notes: item.notes || "",
      overdue: false,
    }));
  return [...taskPendencies, ...purchasePendencies];
}

function pendingPriority(item, unit) {
  const days = daysTo(item.deadline || unit.openingDate);
  if (days !== null && days <= 7) return "Alta";
  if (/contrato|licen|alvar|vigil|bombeir|credenc/i.test(normalizeText(item.process || item.item))) return "Alta";
  if (days !== null && days <= 20) return "Média";
  return "Baixa";
}

function isOverdue(value) {
  const days = daysTo(value);
  return days !== null && days < 0;
}

function alertsForUnit(unit, pendingItems, docs, trainings, accreditation) {
  const alerts = [];
  const days = daysTo(unit.openingDate);
  if (days !== null && days < 0) alerts.push({ type: "Crítico", message: `Implantação atrasada há ${Math.abs(days)} dias.` });
  if (days !== null && days <= 15 && days >= 0) alerts.push({ type: "Prazo", message: `Inauguração prevista em ${days} dias.` });
  const high = pendingItems.filter((item) => item.priority === "Alta").length;
  if (high) alerts.push({ type: "Pendência crítica", message: `${high} pendência(s) de alta prioridade exigem ação.` });
  const pendingDocs = docs.filter((item) => item.status !== "Aprovado").length;
  if (pendingDocs) alerts.push({ type: "Documento", message: `${pendingDocs} documento(s) pendente(s) ou em análise.` });
  const pendingTrainings = trainings.filter((item) => item.status !== "Concluído").length;
  if (pendingTrainings) alerts.push({ type: "Treinamento", message: `${pendingTrainings} treinamento(s) ainda não concluído(s).` });
  const pendingCred = accreditation.filter((item) => !isAccreditationClosed(item.status)).length;
  if (pendingCred) alerts.push({ type: "Credenciamento", message: `${pendingCred} credenciamento(s) sem conclusão.` });
  return alerts.slice(0, 8);
}

function isAccreditationClosed(status) {
  return ["FECHADO", "CONCLUÍDO", "CONCLUIDO", "APROVADO"].includes(normalizeText(status).toUpperCase());
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

function averageDaysLabel(units) {
  const values = units.map((unit) => daysTo(unit.openingDate)).filter((value) => value !== null);
  if (!values.length) return "sem data";
  const avg = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return avg >= 0 ? `${avg} dias` : `${Math.abs(avg)} dias atraso`;
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
  const visibleUnits = units;
  const tasks = visibleUnits.flatMap((unit) => unit.tasks);
  const purchases = visibleUnits.flatMap((unit) => unit.purchases || []);
  const done = tasks.filter((task) => getStatus(task) === "Concluído").length;
  const inProgress = tasks.filter((task) => getStatus(task) === "Em Andamento").length;
  const pending = tasks.filter((task) => getStatus(task) === "Pendente").length;
  const avg = Math.round(visibleUnits.reduce((sum, unit) => sum + unitProgress(unit).percent, 0) / Math.max(visibleUnits.length, 1));
  const closedCred = accreditationCountForUnits(visibleUnits);
  const criticalUnits = visibleUnits.filter((unit) => ["Implantação crítica", "Em atraso"].includes(unitStatus(unit).label)).length;
  const totalDocuments = visibleUnits.reduce((sum, unit) => sum + unitStats(unit).documents.length, 0);
  const pendingDocuments = visibleUnits.reduce((sum, unit) => sum + unitStats(unit).pendingDocs, 0);
  const openPendencies = visibleUnits.reduce((sum, unit) => sum + unitStats(unit).openPending, 0);
  const statusCounts = unitStatusCounts(visibleUnits);
  const blockers = visibleUnits.flatMap((unit) =>
    unit.tasks
      .filter((task) => getStatus(task) !== "Concluído")
      .slice(0, 4)
      .map((task) => ({ unit, task }))
  );

  return `
    <section class="toolbar-panel dashboard-toolbar">
      <div>
        <span class="small-label">Visão executiva</span>
        <strong>Todas as unidades</strong>
      </div>
      <div class="view-tabs">
        ${dashboardTabButton("overview", "Visão geral")}
        ${dashboardTabButton("roadmap", "Roadmap")}
        ${dashboardTabButton("purchases", "Compras")}
        ${dashboardTabButton("accreditation", "Credenciamentos")}
      </div>
    </section>

    <section class="implantation-hero-panel">
      <div>
        <span class="small-label">Central de implantação</span>
        <h2>Gestão completa das franquias em implantação</h2>
        <p>Visão executiva, pasta digital por unidade, cronograma, documentos, treinamentos, credenciamentos, alertas e pendências em um único painel operacional.</p>
      </div>
      <div class="status-overview-grid">
        ${statusOverview("Em implantação", statusCounts["Em implantação"] || 0, "blue")}
        ${statusOverview("Aguardando documentação", statusCounts["Aguardando documentação"] || 0, "yellow")}
        ${statusOverview("Em atraso", statusCounts["Em atraso"] || 0, "orange")}
        ${statusOverview("Pronta para inauguração", statusCounts["Pronta para inauguração"] || 0, "green")}
        ${statusOverview("Implantação crítica", statusCounts["Implantação crítica"] || 0, "red")}
      </div>
    </section>

    <div class="grid kpi-grid">
      ${kpi("Total de franquias", visibleUnits.length, `${criticalUnits} em risco ou atraso`)}
      ${kpi("Progresso médio", `${avg}%`, `${done} de ${tasks.length} etapas concluídas`)}
      ${kpi("Pendências abertas", openPendencies, `${pending} etapas pendentes`)}
      ${kpi("Documentos pendentes", pendingDocuments, `${totalDocuments} documentos mapeados`)}
      ${kpi("Credenciamentos concluídos", closedCred, `${data.accreditation.procedures.length} procedimentos base`)}
      ${kpi("Tempo médio de implantação", averageDaysLabel(visibleUnits), "prazo até inauguração")}
    </div>

    ${renderDashboardTabContent(state.dashboardTab, visibleUnits, {
      done,
      inProgress,
      pending,
      blockers,
      purchases,
      closedCred,
      totalProcedures: visibleUnits.length * data.accreditation.procedures.length,
    })}
  `;
}

function dashboardTabButton(key, label) {
  return `<button class="view-tab ${state.dashboardTab === key ? "active" : ""}" data-dashboard-tab="${key}" type="button">${escapeHtml(label)}</button>`;
}

function renderDashboardTabContent(tab, visibleUnits, context) {
  if (tab === "roadmap") {
    return `
      <div class="grid two-col" style="margin-top:16px">
        <section class="panel">
          <h2>Roadmap por unidade</h2>
          ${pendingByUnitChart(visibleUnits)}
        </section>
        <section class="panel">
          <h2>Status geral do roadmap</h2>
          ${statusDistributionChart(context.done, context.inProgress, context.pending)}
        </section>
      </div>
      <section class="panel" style="margin-top:16px">
        <h2>Etapas abertas do roadmap</h2>
        <div class="blocker-list">
          ${context.blockers
            .filter(({ unit, task }) => matchesSearch(unit.name, task.process, task.phase))
            .slice(0, 18)
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
            .join("") || empty("Nenhuma etapa aberta encontrada")}
        </div>
      </section>
    `;
  }

  if (tab === "purchases") {
    const purchaseRows = visibleUnits.flatMap((unit) => (unit.purchases || []).map((item) => ({ unit, item })));
    const done = purchaseRows.filter(({ item }) => getStatus(item) === "Concluído").length;
    const inProgress = purchaseRows.filter(({ item }) => getStatus(item) === "Em Andamento").length;
    const pending = purchaseRows.filter(({ item }) => getStatus(item) === "Pendente").length;
    return `
      <div class="grid two-col" style="margin-top:16px">
        <section class="panel">
          <h2>Status das compras</h2>
          ${statusDistributionChart(done, inProgress, pending)}
        </section>
        <section class="panel">
          <h2>Compras pendentes</h2>
          <div class="blocker-list">
            ${purchaseRows
              .filter(({ unit, item }) => getStatus(item) !== "Concluído" && matchesSearch(unit.name, item.item, item.notes))
              .slice(0, 14)
              .map(({ unit, item }) => `
                <div class="unit-card">
                  <header>
                    <div>
                      <strong>${escapeHtml(item.item)}</strong>
                      <div class="meta">${escapeHtml(unit.city)} · ${escapeHtml(item.notes || "Sem observação")}</div>
                    </div>
                    ${statusBadge(getStatus(item))}
                  </header>
                </div>
              `)
              .join("") || empty("Nenhuma compra pendente")}
          </div>
        </section>
      </div>
    `;
  }

  if (tab === "accreditation") {
    const rows = visibleUnits.map((unit) => {
      const acc = accreditationForUnit(unit);
      const summary = accreditationSummary(acc);
      return { unit, total: acc.length, ...summary };
    });
    return `
      <div class="grid two-col" style="margin-top:16px">
        <section class="panel">
          <h2>Credenciamentos por unidade</h2>
          <div class="blocker-list">
            ${rows
              .filter(({ unit }) => matchesSearch(unit.name, unit.city, unit.franchisee))
              .map(({ unit, total, closed, pending, review, rejected }) => `
                <div class="unit-card">
                  <header>
                    <div>
                      <strong>${escapeHtml(unit.city)} ${escapeHtml(unit.state || "")}</strong>
                      <div class="meta">${closed}/${total} concluídos · ${pending} pendente(s) · ${review} em análise · ${rejected} reprovado(s)</div>
                    </div>
                    <button class="link-button" data-select-unit="${unit.id}" type="button">Abrir</button>
                  </header>
                </div>
              `)
              .join("") || empty("Nenhum credenciamento encontrado")}
          </div>
        </section>
        <section class="panel">
          <h2>Resumo de credenciamentos</h2>
          <div class="status-split">
            <div class="stacked-bar tall">
              <span class="done" style="--value:${percentOf(context.closedCred, Math.max(context.totalProcedures, 1))}%"></span>
              <span class="pending" style="--value:${percentOf(Math.max(context.totalProcedures - context.closedCred, 0), Math.max(context.totalProcedures, 1))}%"></span>
            </div>
            <div class="badge-row">
              ${statusBadge(`${context.closedCred} concluídos`, "done")}
              ${statusBadge(`${Math.max(context.totalProcedures - context.closedCred, 0)} em aberto`, "pending")}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  return `
    <div class="grid two-col" style="margin-top:16px">
      <section class="panel">
        <h2>Pendências por unidade</h2>
        ${pendingByUnitChart(visibleUnits)}
      </section>
      <section class="panel">
        <h2>Status geral do roadmap</h2>
        ${statusDistributionChart(context.done, context.inProgress, context.pending)}
      </section>
    </div>

    <div class="grid two-col" style="margin-top:16px">
      <section class="panel">
        <h2>Próximas pendências</h2>
        <div class="blocker-list">
          ${context.blockers
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
      <section class="panel">
        <h2>Mapa de alertas</h2>
        <div class="blocker-list">
          ${visibleUnits
            .flatMap((unit) => unitStats(unit).alerts.slice(0, 2).map((alert) => ({ unit, alert })))
            .slice(0, 10)
            .map(({ unit, alert }) => `
              <div class="unit-card">
                <header>
                  <div>
                    <strong>${escapeHtml(alert.type)}</strong>
                    <div class="meta">${escapeHtml(unit.city)} · ${escapeHtml(alert.message)}</div>
                  </div>
                  <button class="link-button" data-select-unit="${unit.id}" type="button">Abrir</button>
                </header>
              </div>
            `)
            .join("") || empty("Nenhum alerta automático")}
        </div>
      </section>
    </div>
  `;
}

function renderFranchises() {
  const units = roadmapUnits();
  const focusedUnit = state.franchiseWorkspaceUnitId ? units.find((unit) => unit.id === state.franchiseWorkspaceUnitId) : null;
  if (focusedUnit) return renderUnitWorkspacePage(focusedUnit, units);

  const visibleUnits = units.filter((unit) => matchesSearch(unit.name, unit.franchisee, unit.city, unit.state));
  const statusCounts = unitStatusCounts(units);
  const avg = Math.round(units.reduce((sum, unit) => sum + unitProgress(unit).percent, 0) / Math.max(units.length, 1));
  const openPendencies = units.reduce((sum, unit) => sum + unitStats(unit).openPending, 0);
  const criticalUnits = units.filter((unit) => ["Implantação crítica", "Em atraso"].includes(unitStatus(unit).label)).length;

  return `
    <section class="implantation-hero-panel franchises-hero">
      <div>
        <span class="small-label">Pasta digital das franquias</span>
        <h2>Carteira completa de unidades</h2>
        <p>Selecione uma franquia para abrir a tela inteira com cronograma, documentos, treinamentos, atas, pendências, credenciamentos e campos de atualização operacional.</p>
      </div>
      <div class="status-overview-grid">
        ${statusOverview("Total", units.length, "blue")}
        ${statusOverview("Progresso médio", `${avg}%`, "green")}
        ${statusOverview("Pendências", openPendencies, "yellow")}
        ${statusOverview("Em risco", criticalUnits, "red")}
      </div>
    </section>

    <section class="panel implantation-board">
      <div class="panel-heading-row">
        <div>
          <span class="small-label">Franquias</span>
          <h2>Painel de unidades</h2>
        </div>
        <div class="badge-row">
          <span class="badge info">${visibleUnits.length} visível(is)</span>
          <span class="badge">${statusCounts["Em implantação"] || 0} em implantação</span>
        </div>
      </div>
      <div class="franchise-grid">
        ${visibleUnits.map((unit) => dashboardUnitRow(unit)).join("") || empty("Nenhuma unidade encontrada")}
      </div>
    </section>
  `;
}

function unitStatusCounts(units) {
  return units.reduce((acc, unit) => {
    const label = unitStatus(unit).label;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

function statusOverview(label, value, color) {
  return `
    <article class="status-overview ${color}">
      <strong>${escapeHtml(String(value))}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `;
}

function renderUnitWorkspacePage(unit, units) {
  const stats = unitStats(unit);
  const progress = stats.progress;
  const status = unitStatus(unit);
  const risk = riskLevel(unit);
  return `
    <section class="toolbar-panel unit-focus-toolbar">
      <button class="ghost-button" data-clear-franchise-unit type="button">Voltar para franquias</button>
      <label>
        <span class="small-label">Trocar unidade</span>
        <select data-franchise-workspace-unit>
          ${units.map((item) => `<option value="${item.id}"${unit.id === item.id ? " selected" : ""}>${escapeHtml(item.city)} ${escapeHtml(item.state || "")}</option>`).join("")}
        </select>
      </label>
    </section>

    <section class="unit-focus-hero">
      <div>
        <span class="small-label">Pasta digital da franquia</span>
        <h2>${escapeHtml(unit.name || `${unit.city} ${unit.state || ""}`)}</h2>
        <p>${escapeHtml(unit.city)} ${escapeHtml(unit.state || "")} · ${escapeHtml(unit.franchisee || "Franqueado a definir")}</p>
        <div class="badge-row">
          ${statusBadge(status.label, status.className)}
          <span class="${risk.className}">Risco ${risk.label}</span>
          <span class="badge info">Código ${escapeHtml(unit.id)}</span>
        </div>
      </div>
      <div class="unit-focus-progress">
        <strong>${progress.percent}%</strong>
        <span>implantação</span>
        <div class="stacked-bar" aria-label="Progresso ${progress.percent}%">
          <span class="done" style="--value:${(progress.done / Math.max(progress.total, 1)) * 100}%"></span>
          <span class="progress" style="--value:${(progress.inProgress / Math.max(progress.total, 1)) * 100}%"></span>
          <span class="pending" style="--value:${(progress.pending / Math.max(progress.total, 1)) * 100}%"></span>
        </div>
      </div>
    </section>

    <div class="grid kpi-grid unit-focus-kpis">
      ${kpi("Inauguração prevista", formatDate(unit.openingDate), formatDays(unit.openingDate))}
      ${kpi("Pendências abertas", stats.openPending, `${stats.overduePending} vencida(s)`)}
      ${kpi("Documentação", `${stats.documentsPercent}%`, `${stats.pendingDocs} pendente(s)`)}
      ${kpi("Credenciamento", `${stats.accreditationPercent}%`, `${stats.pendingAccreditation} pendente(s)`)}
      ${kpi("Treinamentos", `${stats.trainingPercent}%`, `${stats.pendingTrainings} pendente(s)`)}
      ${kpi("Alertas", stats.alerts.length, "automáticos")}
    </div>

    <section class="panel unit-focus-workspace">
      ${unitDetail(unit)}
    </section>
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
  const status = unitStatus(unit);
  const stats = unitStats(unit);
  return `
    <article class="unit-workspace franchise-card">
      <button class="unit-workspace-head" data-toggle-unit="${unit.id}" type="button">
        <span>
          <strong>${escapeHtml(unit.name || `${unit.city} ${unit.state || ""}`)}</strong>
          <small>${escapeHtml(unit.city)} ${escapeHtml(unit.state || "")} · ${escapeHtml(unit.franchisee || "Franqueado a definir")}</small>
        </span>
        <span class="unit-head-metrics">
          <strong class="unit-percent">${progress.percent}%</strong>
          ${statusBadge(status.label, status.className)}
          <span class="chevron">+</span>
        </span>
      </button>
      <div class="franchise-meta-grid">
        <span><small>Responsável interno</small><strong>${escapeHtml(unit.owner || unit.ownerName || "Implantação")}</strong></span>
        <span><small>Assinatura do contrato</small><strong>${formatDate(contractDate(unit))}</strong></span>
        <span><small>Inauguração prevista</small><strong>${formatDate(unit.openingDate)}</strong></span>
        <span><small>Status da unidade</small><strong>${escapeHtml(status.label)}</strong></span>
      </div>
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
        <span class="${risk.className}">Risco ${risk.label}</span>
        <span class="badge info">${stats.alerts.length} alerta(s)</span>
      </div>
      <button class="open-folder-button" data-toggle-unit="${unit.id}" type="button">
        Abrir pasta digital
      </button>
    </article>
  `;
}

function unitDetail(unit) {
  const activeTab = state.unitTabs[unit.id] || "summary";
  const tabs = [
    ["summary", "Resumo geral"],
    ["schedule", "Cronograma"],
    ["kpis", "Indicadores"],
    ["accreditation", "Credenciamentos"],
    ["documents", "Documentos"],
    ["training", "Treinamentos"],
    ["meetings", "Atas"],
    ["pendencies", "Pendências"],
  ];
  return `
    <div class="unit-detail">
      <div class="unit-tabbar">
        ${tabs.map(([key, label]) => `<button class="${activeTab === key ? "active" : ""}" data-unit-id="${unit.id}" data-unit-tab="${key}" type="button">${escapeHtml(label)}</button>`).join("")}
      </div>
      <section class="detail-section wide unit-tab-panel">
        ${renderUnitTab(unit, activeTab)}
      </section>
    </div>
  `;
}

function renderUnitTab(unit, tab) {
  const stats = unitStats(unit);
  const renderers = {
    summary: renderUnitSummary,
    schedule: renderUnitSchedule,
    kpis: renderUnitKpis,
    accreditation: renderUnitAccreditation,
    documents: renderUnitDocuments,
    training: renderUnitTraining,
    meetings: renderUnitMeetings,
    pendencies: renderUnitPendencies,
  };
  return (renderers[tab] || renderUnitSummary)(unit, stats);
}

function renderUnitSummary(unit, stats) {
  const status = unitStatus(unit);
  return `
    <div class="unit-summary-grid">
      <article class="summary-card">
        <span>Nome da unidade</span>
        <strong>${escapeHtml(unit.name || `${unit.city} ${unit.state || ""}`)}</strong>
      </article>
      <article class="summary-card">
        <span>Código da franquia</span>
        <strong>${escapeHtml(unit.id)}</strong>
      </article>
      <article class="summary-card">
        <span>Responsável</span>
        <strong>${escapeHtml(unit.owner || unit.ownerName || "Implantação")}</strong>
      </article>
      <article class="summary-card">
        <span>Consultor responsável</span>
        <strong>${escapeHtml(unit.owner || unit.ownerName || "Consultor Nexa")}</strong>
      </article>
      <article class="summary-card">
        <span>Assinatura</span>
        <strong>${formatDate(contractDate(unit))}</strong>
      </article>
      <article class="summary-card">
        <span>Inauguração prevista</span>
        <strong>${formatDate(unit.openingDate)}</strong>
      </article>
      <article class="summary-card">
        <span>Status atual</span>
        <strong>${escapeHtml(status.label)}</strong>
      </article>
    </div>
    <div class="grid kpi-grid compact-kpis">
      ${kpi("Implantação", `${stats.progress.percent}%`, `${stats.progress.done}/${stats.progress.total} etapas`)}
      ${kpi("Documentação", `${stats.documentsPercent}%`, `${stats.pendingDocs} pendentes`)}
      ${kpi("Credenciamento", `${stats.accreditationPercent}%`, `${stats.pendingAccreditation} pendentes`)}
      ${kpi("Treinamentos", `${stats.trainingPercent}%`, `${stats.pendingTrainings} pendentes`)}
      ${kpi("Pendências abertas", stats.openPending, `${stats.overduePending} vencida(s)`)}
      ${kpi("Documentos enviados", stats.approvedDocs, `${stats.pendingDocs} aguardando`) }
    </div>
    ${renderAlerts(stats.alerts)}
  `;
}

function renderUnitSchedule(unit, stats) {
  const schedule = scheduleState(unit);
  const byPhase = groupBy(unit.tasks || [], (task) => task.phase);
  return `
    <div class="schedule-hero ${schedule.className}">
      <div>
        <span>Implantação em ${schedule.totalDays} dias</span>
        <strong>${schedule.main}</strong>
        <small>${schedule.detail}</small>
      </div>
      <div class="schedule-ring" style="--value:${schedule.usedPercent}%">
        <strong>${schedule.currentDay}</strong>
        <span>dia atual</span>
      </div>
    </div>
    <div class="phase-grid">
      ${Object.entries(byPhase).map(([phase, tasks]) => phaseProgress(phase, tasks)).join("")}
    </div>
    <div class="table-wrap">
      <table class="workspace-table compact-table">
        <thead>
          <tr>
            <th>Etapa</th>
            <th>Status</th>
            <th>Responsável</th>
            <th>Prazo</th>
            <th>Conclusão</th>
            <th>Observações</th>
            <th>Anexos</th>
          </tr>
        </thead>
        <tbody>
          ${(unit.tasks || []).map((task) => `
            <tr>
              <td><span class="row-title">${escapeHtml(task.process)}</span><small>${escapeHtml(task.phase)}</small></td>
              <td>${statusSelect(task)}</td>
              <td>${escapeHtml(unit.owner || unit.ownerName || "Implantação")}</td>
              <td>${formatDate(task.deadline || unit.openingDate)}</td>
              <td>${formatDate(task.actualDate)}</td>
              <td>${escapeHtml(task.notes || "")}</td>
              <td>${task.notes ? "Registro em observações" : "Sem anexo"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderUnitKpis(unit, stats) {
  const days = daysTo(unit.openingDate);
  return `
    <div class="grid kpi-grid compact-kpis">
      ${kpi("Dias restantes", days === null ? "sem data" : days >= 0 ? days : `${Math.abs(days)} atraso`, "até inauguração")}
      ${kpi("Implantação", `${stats.progress.percent}%`, `${stats.progress.done}/${stats.progress.total} etapas`)}
      ${kpi("Documentos pendentes", stats.pendingDocs, `${stats.approvedDocs} aprovados`)}
      ${kpi("Credenciamentos concluídos", stats.closedAccreditation, `${stats.pendingAccreditation} pendentes`)}
      ${kpi("Treinamentos realizados", stats.completedTrainings, `${stats.pendingTrainings} pendentes`)}
      ${kpi("Reuniões realizadas", stats.meetings.length, "atas e alinhamentos")}
      ${kpi("Pendências vencidas", stats.overduePending, `${stats.openPending} abertas`)}
      ${kpi("Documentos aguardando assinatura", stats.documents.filter((item) => item.signature === "Aplicável" && item.status !== "Aprovado").length, "itens obrigatórios")}
    </div>
    ${renderAlerts(stats.alerts)}
  `;
}

function renderUnitAccreditation(unit, stats) {
  const manualRows = customRecords(unit, "accreditations").map((record) => ({
    group: record.group || "Manual",
    name: record.name || "Credenciamento",
    status: record.status || "Pendente",
    requestDate: record.requestDate || "",
    approvalDate: record.approvalDate || "",
    owner: record.owner || unit.owner || unit.ownerName || "Credenciamento",
    attachments: record.attachments || "Sem anexo",
    notes: record.notes || "Inserido manualmente",
  }));
  const rows = [...manualRows, ...stats.accreditation];
  const counts = accreditationSummary(rows);
  return `
    <div class="grid kpi-grid compact-kpis">
      ${kpi("Total", rows.length, "credenciamentos")}
      ${kpi("Concluídos", counts.closed, "aprovados/fechados")}
      ${kpi("Pendentes", counts.pending, "sem status")}
      ${kpi("Em análise", counts.review, "em negociação")}
      ${kpi("Reprovados", counts.rejected, "recusados")}
    </div>
    ${recordForm(unit, "accreditations", [
      { name: "name", label: "Tipo", placeholder: "Ex.: Vigilância Sanitária" },
      { name: "status", label: "Status", type: "select", options: ["Pendente", "Em análise", "Aprovado", "Reprovado", "Fechado"] },
      { name: "requestDate", label: "Solicitação", type: "date" },
      { name: "approvalDate", label: "Aprovação", type: "date" },
      { name: "owner", label: "Responsável", placeholder: "Responsável interno" },
      { name: "attachments", label: "Anexos", placeholder: "Link ou nome do arquivo" },
      { name: "notes", label: "Observações", type: "textarea", placeholder: "Histórico, retorno do órgão, próximos passos" },
    ], "Adicionar credenciamento")}
    <div class="table-wrap">
      <table class="workspace-table compact-table">
        <thead><tr><th>Tipo</th><th>Status</th><th>Solicitação</th><th>Aprovação</th><th>Responsável</th><th>Anexos</th><th>Observações</th></tr></thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td><span class="row-title">${escapeHtml(item.name)}</span><small>${escapeHtml(item.group)}</small></td>
              <td>${heatCell(item.status)}</td>
              <td>${formatDate(item.requestDate || contractDate(unit))}</td>
              <td>${item.approvalDate ? formatDate(item.approvalDate) : isAccreditationClosed(item.status) ? formatDate(unit.openingDate) : "pendente"}</td>
              <td>${escapeHtml(item.owner || unit.owner || unit.ownerName || "Credenciamento")}</td>
              <td>${escapeHtml(item.attachments || "Sem anexo")}</td>
              <td>${escapeHtml(item.notes || item.status || "Aguardando atualização")}</td>
            </tr>
          `).join("") || `<tr><td colspan="7">${empty("Sem credenciamentos mapeados")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderUnitDocuments(unit, stats) {
  const manualRows = customRecords(unit, "documents").map((record) => ({
    name: record.name || "Documento",
    category: record.category || "Documento da empresa",
    version: record.version || "v1",
    date: record.date || "",
    owner: record.owner || unit.owner || unit.ownerName || "Implantação",
    status: record.status || "Pendente",
    signature: record.signature || "Não informado",
    history: record.history || record.notes || "Inserido manualmente",
    file: record.file || "Sem arquivo",
  }));
  const rows = [...manualRows, ...stats.documents];
  return `
    ${recordForm(unit, "documents", [
      { name: "name", label: "Nome", placeholder: "Ex.: Contrato social" },
      { name: "category", label: "Categoria", type: "select", options: ["Contratos", "Alvarás", "Licenças", "Manual da franquia", "Marketing", "Financeiro", "Documentos da empresa"] },
      { name: "version", label: "Versão", placeholder: "v1" },
      { name: "date", label: "Data", type: "date" },
      { name: "owner", label: "Responsável", placeholder: "Quem acompanha" },
      { name: "status", label: "Status", type: "select", options: ["Pendente", "Em análise", "Aprovado", "Reprovado"] },
      { name: "signature", label: "Assinatura", type: "select", options: ["Não informado", "Aplicável", "Não aplicável", "Assinado"] },
      { name: "file", label: "Arquivo", placeholder: "Link ou nome do arquivo" },
      { name: "history", label: "Histórico", type: "textarea", placeholder: "Observações e versões anteriores" },
    ], "Adicionar documento")}
    ${renderGenericTable(
    ["Nome", "Categoria", "Versão", "Data", "Responsável", "Status", "Assinatura", "Histórico", "Arquivo"],
    rows,
    (item) => [
      item.name,
      item.category,
      item.version,
      formatDate(item.date),
      item.owner,
      item.status,
      item.signature,
      item.history,
      item.file || "Visualizar / download pendente",
    ],
    "Nenhum documento mapeado a partir do roadmap"
  )}
  `;
}

function renderUnitTraining(unit, stats) {
  const manualRows = customRecords(unit, "trainings").map((record) => ({
    name: record.name || "Treinamento",
    date: record.date || "",
    instructor: record.instructor || "Equipe Nexa",
    participants: record.participants || unit.franchisee || "Equipe da unidade",
    workload: record.workload || "A definir",
    certificate: record.certificate || "Pendente",
    status: record.status || "Pendente",
    attendance: record.attendance || "Pendente",
    material: record.material || "Material operacional",
    attachments: record.attachments || "Sem anexo",
  }));
  const rows = [...manualRows, ...stats.trainings];
  return `
    ${recordForm(unit, "trainings", [
      { name: "name", label: "Nome", placeholder: "Ex.: Treinamento de atendimento" },
      { name: "date", label: "Data", type: "date" },
      { name: "instructor", label: "Instrutor", placeholder: "Instrutor ou área" },
      { name: "participants", label: "Participantes", placeholder: "Equipe envolvida" },
      { name: "workload", label: "Carga horária", placeholder: "Ex.: 4h" },
      { name: "certificate", label: "Certificado", type: "select", options: ["Pendente", "Liberado", "Não aplicável"] },
      { name: "status", label: "Status", type: "select", options: ["Pendente", "Em Andamento", "Concluído"] },
      { name: "attendance", label: "Presença", placeholder: "Registrada, pendente..." },
      { name: "material", label: "Material", placeholder: "Manual, vídeo, apresentação" },
      { name: "attachments", label: "Anexos", placeholder: "Link ou nome do arquivo" },
    ], "Adicionar treinamento")}
    ${renderGenericTable(
    ["Nome", "Data", "Instrutor", "Participantes", "Carga horária", "Certificado", "Status", "Presença", "Material", "Anexos"],
    rows,
    (item) => [item.name, formatDate(item.date), item.instructor, item.participants, item.workload, item.certificate, item.status, item.attendance, item.material, item.attachments || "Sem anexo"],
    "Nenhum treinamento mapeado"
  )}
  `;
}

function renderUnitMeetings(unit, stats) {
  const manualRows = customRecords(unit, "meetings").map((record) => ({
    date: record.date || "",
    participants: record.participants || unit.franchisee || "Franqueado",
    subject: record.subject || "Reunião de implantação",
    pending: record.pending || "Sem pendência aberta",
    owner: record.owner || unit.owner || unit.ownerName || "Consultor responsável",
    deadline: record.deadline || "",
    attachments: record.attachments || "Sem anexo",
    history: record.history || record.notes || "Inserida manualmente",
  }));
  const rows = [...manualRows, ...stats.meetings];
  return `
    ${recordForm(unit, "meetings", [
      { name: "date", label: "Data", type: "date" },
      { name: "participants", label: "Participantes", placeholder: "Quem participou" },
      { name: "subject", label: "Assuntos", placeholder: "Pauta principal" },
      { name: "pending", label: "Pendências", placeholder: "Ações geradas" },
      { name: "owner", label: "Responsáveis", placeholder: "Responsável pela ação" },
      { name: "deadline", label: "Prazo", type: "date" },
      { name: "attachments", label: "Anexos", placeholder: "Ata, gravação, arquivo" },
      { name: "history", label: "Histórico", type: "textarea", placeholder: "Decisões e encaminhamentos" },
    ], "Adicionar ata")}
    ${renderGenericTable(
    ["Data", "Participantes", "Assuntos", "Pendências", "Responsáveis", "Prazo", "Anexos", "Histórico"],
    rows,
    (item) => [formatDate(item.date), item.participants, item.subject, item.pending, item.owner, formatDate(item.deadline), item.attachments || "Sem anexo", item.history],
    "Nenhuma ata mapeada"
  )}
  `;
}

function renderUnitPendencies(unit, stats) {
  const manualRows = customRecords(unit, "pendencies").map((record) => ({
    id: record.id,
    manual: true,
    title: record.title || "Pendência",
    owner: record.owner || unit.owner || unit.ownerName || "Implantação",
    deadline: record.deadline || "",
    priority: record.priority || "Média",
    status: record.status || "Pendente",
    attachment: record.attachment || "Não anexado",
    notes: record.notes || "Inserida manualmente",
  }));
  const rows = [...manualRows, ...stats.pendingItems];
  return `
    <div class="pendency-filters">
      <span>Alta prioridade: ${rows.filter((item) => item.priority === "Alta").length}</span>
      <span>Média: ${rows.filter((item) => item.priority === "Média").length}</span>
      <span>Baixa: ${rows.filter((item) => item.priority === "Baixa").length}</span>
      <span>Em atraso: ${stats.overduePending}</span>
    </div>
    ${recordForm(unit, "pendencies", [
      { name: "title", label: "Pendência", placeholder: "O que precisa ser resolvido" },
      { name: "owner", label: "Responsável", placeholder: "Quem resolve" },
      { name: "deadline", label: "Prazo", type: "date" },
      { name: "priority", label: "Prioridade", type: "select", options: ["Alta", "Média", "Baixa"] },
      { name: "status", label: "Status", type: "select", options: ["Pendente", "Em Andamento", "Concluído"] },
      { name: "attachment", label: "Anexo", placeholder: "Link ou nome do arquivo" },
      { name: "notes", label: "Observações", type: "textarea", placeholder: "Contexto, risco ou próximo passo" },
    ], "Adicionar pendência")}
    <div class="table-wrap">
      <table class="workspace-table compact-table pendency-table">
        <thead>
          <tr>
            <th>Resolver</th>
            <th>Pendência</th>
            <th>Responsável</th>
            <th>Prazo</th>
            <th>Prioridade</th>
            <th>Status</th>
            <th>Anexo</th>
            <th>Observações</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => {
            const resolved = getStatus(item) === "Concluído";
            return `
              <tr class="${resolved ? "pendency-resolved" : ""}">
                <td>
                  <label class="resolve-check" title="${resolved ? "Reabrir pendência" : "Resolver pendência"}">
                    <input data-resolve-pendency="${item.id}" type="checkbox"${resolved ? " checked" : ""} />
                    <span>${resolved ? "Resolvida" : "Resolver"}</span>
                  </label>
                </td>
                <td><span class="row-title">${escapeHtml(item.title)}</span></td>
                <td>${escapeHtml(item.owner)}</td>
                <td>${escapeHtml(formatDate(item.deadline))}</td>
                <td>${escapeHtml(item.priority)}</td>
                <td>${statusBadge(getStatus(item))}</td>
                <td>${escapeHtml(item.attachment)}</td>
                <td>
                  <textarea class="pendency-note-input" data-pendency-note="${item.id}" rows="2" placeholder="Adicionar observação">${escapeHtml(getPendencyNotes(item))}</textarea>
                </td>
              </tr>
            `;
          }).join("") || `<tr><td colspan="8">${empty("Nenhuma pendência aberta")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function getPendencyNotes(item) {
  if (Object.prototype.hasOwnProperty.call(state.pendencyNotes, item.id)) return state.pendencyNotes[item.id];
  return item.notes || "";
}

function updatePendencyNote(itemId, value) {
  if (updateManualRecord(itemId, { notes: value })) return;
  state.pendencyNotes[itemId] = value;
  writeStorage("franchisePendencyNotes", state.pendencyNotes);
}

async function resolvePendency(itemId, resolved) {
  const status = resolved ? "Concluído" : "Pendente";
  if (updateManualRecord(itemId, { status })) {
    render();
    return;
  }
  await updateStatus(itemId, status);
}

function updateManualRecord(recordId, patch) {
  let updated = false;
  for (const unitRecords of Object.values(state.unitRecords)) {
    for (const records of Object.values(unitRecords || {})) {
      const record = records.find((item) => item.id === recordId);
      if (record) {
        Object.assign(record, patch);
        updated = true;
      }
    }
  }
  if (updated) writeStorage("franchiseUnitRecords", state.unitRecords);
  return updated;
}

function customRecords(unit, type) {
  return state.unitRecords[unit.id]?.[type] || [];
}

function recordForm(unit, type, fields, buttonLabel) {
  return `
    <form class="record-form" data-unit-record-form data-unit-id="${unit.id}" data-record-type="${type}">
      <div class="record-form-head">
        <div>
          <span class="small-label">Inserção de dados</span>
          <h3>${escapeHtml(buttonLabel.replace("Adicionar ", ""))}</h3>
        </div>
        <span class="badge info">salvo localmente</span>
      </div>
      <div class="record-form-grid">
        ${fields.map((field) => recordField(field)).join("")}
      </div>
      <div class="record-form-actions">
        <button class="primary-button" data-add-unit-record type="button">${escapeHtml(buttonLabel)}</button>
      </div>
    </form>
  `;
}

function recordField(field) {
  const common = `name="${escapeHtml(field.name)}"`;
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
  let control = `<input ${common} type="${escapeHtml(field.type || "text")}"${placeholder} />`;
  if (field.type === "select") {
    control = `
      <select ${common}>
        ${(field.options || []).map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
      </select>
    `;
  }
  if (field.type === "textarea") {
    control = `<textarea ${common}${placeholder} rows="3"></textarea>`;
  }
  return `
    <label class="${field.type === "textarea" ? "span-2" : ""}">
      <span>${escapeHtml(field.label)}</span>
      ${control}
    </label>
  `;
}

function renderGenericTable(headers, rows, mapRow, emptyMessage) {
  return `
    <div class="table-wrap">
      <table class="workspace-table compact-table">
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${mapRow(row).map((cell, index) => `<td>${index === 0 ? `<span class="row-title">${escapeHtml(cell)}</span>` : escapeHtml(cell)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${headers.length}">${empty(emptyMessage)}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderAlerts(alerts) {
  return `
    <div class="alert-panel">
      <h3>Alertas automáticos</h3>
      <div class="alert-list">
        ${alerts.map((alert) => `<article><strong>${escapeHtml(alert.type)}</strong><span>${escapeHtml(alert.message)}</span></article>`).join("") || empty("Nenhum alerta crítico para esta unidade")}
      </div>
    </div>
  `;
}

function contractDate(unit) {
  const firstDone = (unit.tasks || []).find((task) => getStatus(task) === "Concluído" && (task.actualDate || task.deadline));
  return firstDone?.actualDate || firstDone?.deadline || "";
}

function scheduleState(unit) {
  const totalDays = 90;
  const days = daysTo(unit.openingDate);
  if (days === null) {
    return { totalDays, currentDay: "—", usedPercent: 0, main: "Cronograma sem data", detail: "Defina a inauguração prevista para ativar a contagem.", className: "schedule-neutral" };
  }
  if (days < 0) {
    return { totalDays, currentDay: totalDays, usedPercent: 100, main: `Prazo vencido há ${Math.abs(days)} dias`, detail: "A implantação está fora do prazo previsto.", className: "schedule-red" };
  }
  const currentDay = Math.max(1, totalDays - days);
  const availablePercent = Math.round((days / totalDays) * 100);
  const usedPercent = Math.min(100, Math.max(0, 100 - availablePercent));
  let className = "schedule-green";
  if (availablePercent <= 20) className = "schedule-red";
  else if (availablePercent <= 40) className = "schedule-orange";
  else if (availablePercent <= 70) className = "schedule-yellow";
  return { totalDays, currentDay, usedPercent, main: `Restam ${days} dias`, detail: `${availablePercent}% do prazo disponível`, className };
}

function accreditationSummary(rows) {
  return rows.reduce(
    (acc, row) => {
      const value = normalizeText(row.status);
      if (isAccreditationClosed(row.status)) acc.closed += 1;
      else if (!value) acc.pending += 1;
      else if (value.includes("reprov") || value.includes("recus")) acc.rejected += 1;
      else acc.review += 1;
      return acc;
    },
    { closed: 0, pending: 0, review: 0, rejected: 0 }
  );
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
    state.franchiseWorkspaceUnitId = result.unitId;
    state.view = "franchises";
    activateNav("franchises");
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
  state.franchiseWorkspaceUnitId = id;
  state.view = "franchises";
  activateNav("franchises");
  render();
}

function addUnitRecord(button) {
  const form = button.closest("[data-unit-record-form]");
  if (!form) return;

  const unitId = form.dataset.unitId;
  const recordType = form.dataset.recordType;
  const values = {};
  form.querySelectorAll("input, select, textarea").forEach((field) => {
    values[field.name] = typeof field.value === "string" ? field.value.trim() : field.value;
  });

  if (!Object.values(values).some(Boolean)) {
    alert("Preencha ao menos um campo antes de adicionar.");
    return;
  }

  state.unitRecords[unitId] ||= {};
  state.unitRecords[unitId][recordType] ||= [];
  state.unitRecords[unitId][recordType] = [
    {
      id: `${recordType}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...values,
    },
    ...state.unitRecords[unitId][recordType],
  ];
  writeStorage("franchiseUnitRecords", state.unitRecords);
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
