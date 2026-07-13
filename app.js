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
  accreditationOverrides: readStorage("franchiseAccreditationOverrides", {}),
  operationalOverrides: readStorage("franchiseOperationalOverrides", {}),
  unitRecords: readStorage("franchiseUnitRecords", {}),
  profile: readStorage("nexaUserProfile", { name: "Usuário 33Doctor", photo: "" }),
  drafts: readStorage("franchiseDrafts", []),
  auth: readStorage("appSession", null),
  accessContext: { platformAdmin: true, memberships: [] },
  tenantModules: [],
  adminData: null,
  selectedTenantId: "",
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
    if (state.view === "franchises") state.franchiseWorkspaceUnitId = "";
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
  if (target.matches("[data-manual-record-status]")) {
    updateManualRecord(target.dataset.manualRecordStatus, { status: target.value });
    render();
  }
  if (target.matches("[data-accreditation-status]")) {
    target.className = `${statusClass(target.value)} manual-status-select`;
  }
  if (target.matches('[data-operational-field="status"]')) {
    target.className = `${statusClass(target.value)} manual-status-select`;
  }
  if (target.matches("[data-module-tenant]")) {
    state.selectedTenantId = target.value;
    render();
  }
  if (target.matches("[data-admin-module-status]")) {
    adminSetModuleStatus(target);
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

  const savePendencies = event.target.closest("[data-save-pendencies]");
  if (savePendencies) {
    savePendencyChanges(savePendencies);
  }

  const saveAccreditations = event.target.closest("[data-save-accreditations]");
  if (saveAccreditations) {
    saveAccreditationChanges(saveAccreditations);
  }

  const saveOperational = event.target.closest("[data-save-operational]");
  if (saveOperational) {
    saveOperationalChanges(saveOperational.dataset.saveOperational, saveOperational);
  }

  const deleteOperational = event.target.closest("[data-delete-operational]");
  if (deleteOperational) {
    deleteOperationalRecord(deleteOperational);
  }

  const deleteUnit = event.target.closest("[data-delete-unit]");
  if (deleteUnit) {
    deleteFranchiseUnit(deleteUnit.dataset.deleteUnit);
  }

  const deleteAccreditation = event.target.closest("[data-delete-accreditation]");
  if (deleteAccreditation) {
    deleteAccreditationRecord(deleteAccreditation);
  }

  const deleteRecord = event.target.closest("[data-delete-record]");
  if (deleteRecord) {
    deleteManualRecord(deleteRecord.dataset.deleteRecord);
  }

  const removeDraft = event.target.closest("[data-remove-draft]");
  if (removeDraft) {
    state.drafts = state.drafts.filter((draft) => draft.id !== removeDraft.dataset.removeDraft);
    writeStorage("franchiseDrafts", state.drafts);
    render();
  }

  const requestModuleButton = event.target.closest("[data-request-module]");
  if (requestModuleButton) requestModule(requestModuleButton.dataset.requestModule, requestModuleButton);

  const createPortalUserButton = event.target.closest("[data-create-portal-user]");
  if (createPortalUserButton) adminCreatePortalUser(createPortalUserButton);

  const saveUserAccessButton = event.target.closest("[data-save-user-access]");
  if (saveUserAccessButton) adminSaveUserAccess(saveUserAccessButton);

  const approveModuleButton = event.target.closest("[data-approve-module]");
  if (approveModuleButton) adminApproveModuleRequest(approveModuleButton);
});

init();

async function init() {
  const isLocalSystemPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get("preview") === "system";

  if (isLocalSystemPreview) {
    state.accessContext = { platformAdmin: true, memberships: [] };
    state.profile = { name: "Administrador 33Doctor", photo: "" };
    const previewTenants = data.units.map((unit) => ({
      id: unit.tenantId || unit.id,
      name: unit.name,
      code: unit.id,
    })).filter((tenant, index, tenants) => tenants.findIndex((item) => item.id === tenant.id) === index);
    state.adminData = { tenants: previewTenants, users: [], requests: [] };
    state.selectedTenantId = previewTenants[0]?.id || "";
    state.tenantModules = previewTenants.flatMap((tenant) => ["hr", "dp", "accounting", "finance"].map((moduleCode) => ({
      tenantId: tenant.id,
      moduleCode,
      status: "active",
    })));
    showApp();
    return;
  }

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
    <div class="login-shell">
      <form class="login-card" data-login-form>
        <button class="login-close" data-close-login type="button" aria-label="Voltar para a apresentação">×</button>
        <div class="brand product-brand login-product-brand" aria-label="33Doctor APP">
          <span class="brand-platform-lockup login-platform-lockup"><span class="brand-logo-crop"><img src="./assets/33doctor-logo.png" alt="33Doctor" /></span><small>Plataforma de Gestão do Franqueado</small></span>
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
      <div class="login-developed" aria-label="Desenvolvido pela Nexa">
        <span>Desenvolvido pela</span>
        <img src="./assets/nexa-logo.svg" alt="Nexa - conectando pessoas e transformando resultados" />
      </div>
    </div>
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
  updateNavigationAccess();
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
  let payload;
  try {
    payload = await supabaseRpc("get_portal_data", { p_token: state.auth.token });
  } catch (error) {
    if (!String(error.message || "").toLowerCase().includes("get_portal_data")) throw error;
    payload = await supabaseRpc("get_app_data", { p_token: state.auth.token });
  }
  data = normalizeLoadedData(payload);
  state.accessContext = payload.accessContext || {
    platformAdmin: ["admin", "platform_admin"].includes(String(state.auth?.user?.role || "").toLowerCase()),
    memberships: [],
  };
  state.tenantModules = payload.tenantModules || fallbackTenantModules(payload.units || []);
  state.adminData = payload.admin || null;
  state.selectedTenantId = state.accessContext.memberships?.[0]?.tenantId || payload.units?.[0]?.tenantId || "";
  if (payload.userProfile) {
    state.profile = {
      name: payload.userProfile.name || state.profile.name || "Usuário 33Doctor",
      photo: payload.userProfile.photo || state.profile.photo || "",
    };
    writeStorage("nexaUserProfile", state.profile);
  }
  state.selectedUnitId = data.units[0]?.id || "";
  state.dashboardUnit = "all";
  state.expandedUnitId = "";
  state.franchiseWorkspaceUnitId = "";
  updateNavigationAccess();
}

function normalizeLoadedData(payload) {
  const operationalRecords = payload.operationalRecords || [];
  return {
    ...payload,
    sourceFiles: payload.sourceFiles || [],
    units: payload.units || [],
    accreditation: payload.accreditation || { units: [], procedures: [] },
    operationalRecords,
    operationalRecordsByKey: operationalRecords.reduce((acc, record) => {
      acc[operationalKey(record.unitId, record.recordType, record.recordId)] = record;
      return acc;
    }, {}),
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
    hr: "Recursos Humanos",
    dp: "Departamento Pessoal",
    accounting: "Contabilidade",
    finance: "Financeiro",
    admin: "Administração",
  };
  const currentTitle = titles[state.view] || "Dashboard";
  title.textContent = currentTitle;
  updateTopbarState(currentTitle);

  const views = {
    dashboard: renderDashboard,
    franchises: renderFranchises,
    units: renderUnits,
    roadmap: renderRoadmap,
    purchases: renderPurchases,
    accreditation: renderAccreditation,
    "new-unit": renderNewUnit,
    hr: () => renderModuleWorkspace("hr"),
    dp: () => renderModuleWorkspace("dp"),
    accounting: () => renderModuleWorkspace("accounting"),
    finance: () => renderModuleWorkspace("finance"),
    admin: renderAdminCenter,
  };
  app.innerHTML = (views[state.view] || renderDashboard)();
  applyViewPermissions();
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
  return state.profile.name || state.auth?.user?.name || state.auth?.name || state.auth?.email?.split("@")[0] || "Usuário 33Doctor";
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

async function saveProfile() {
  state.profile = {
    ...state.profile,
    name: profileNameInput.value.trim() || "Usuário 33Doctor",
  };
  writeStorage("nexaUserProfile", state.profile);
  updateProfileUI();
  await persistProfile(Boolean(state.profile.photo));
  profileMenu.hidden = true;
  profileToggle.setAttribute("aria-expanded", "false");
}

function updateProfilePhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    state.profile = {
      ...state.profile,
      photo: reader.result,
    };
    writeStorage("nexaUserProfile", state.profile);
    updateProfileUI();
    await persistProfile(true);
  });
  reader.readAsDataURL(file);
}

async function persistProfile(includePhoto) {
  if (!supabaseEnabled || !state.auth?.token) return;

  try {
    const payload = {
      p_token: state.auth.token,
      p_display_name: state.profile.name || currentProfileName(),
      p_photo_data: includePhoto ? state.profile.photo || "" : null,
    };
    const savedProfile = await supabaseRpc("update_user_profile", payload);
    state.profile = {
      name: savedProfile?.name || state.profile.name || "Usuário 33Doctor",
      photo: Object.prototype.hasOwnProperty.call(savedProfile || {}, "photo") ? savedProfile.photo || "" : state.profile.photo || "",
    };
    writeStorage("nexaUserProfile", state.profile);
    updateProfileUI();
  } catch (error) {
    alert(error.message || "Não foi possível salvar o perfil no Supabase.");
  }
}

const moduleDefinitions = {
  hr: {
    name: "Recursos Humanos",
    eyebrow: "Atração e seleção",
    description: "Vagas, página pública, candidatos, triagem, entrevistas e recomendações.",
    metrics: [["Vagas abertas", "0"], ["Candidatos", "0"], ["Em triagem", "0"], ["Entrevistas", "0"]],
    workflow: ["Requisição de vaga", "Publicação", "Triagem Nexa", "Entrevistas", "Recomendação"],
  },
  dp: {
    name: "Departamento Pessoal",
    eyebrow: "Rotina trabalhista",
    description: "Colaboradores, admissões, competências da folha, benefícios, férias e obrigações.",
    metrics: [["Colaboradores", "0"], ["Admissões", "0"], ["Folha atual", "Aberta"], ["Pendências", "0"]],
    workflow: ["Cadastro", "Admissão", "Movimentações", "Folha", "Conferência"],
  },
  accounting: {
    name: "Contabilidade",
    eyebrow: "Documentos e competências",
    description: "Recebimento, conferência e devolução de documentos fiscais e contábeis.",
    metrics: [["Competência", "Atual"], ["Solicitados", "0"], ["Em conferência", "0"], ["Devolvidos", "0"]],
    workflow: ["Solicitação", "Envio", "Conferência", "Correção", "Devolução"],
  },
  finance: {
    name: "Financeiro",
    eyebrow: "Controle e previsibilidade",
    description: "Contas a pagar e receber, fluxo de caixa, orçamento, conciliação e indicadores.",
    metrics: [["Saldo projetado", "R$ 0"], ["A receber", "R$ 0"], ["A pagar", "R$ 0"], ["Vencidos", "0"]],
    workflow: ["Lançamentos", "Aprovação", "Pagamento", "Conciliação", "Indicadores"],
  },
};

function fallbackTenantModules(units) {
  return (units || []).flatMap((unit) => Object.keys({ business: true, ...moduleDefinitions }).map((moduleCode) => ({
    tenantId: unit.tenantId || unit.id,
    moduleCode,
    status: moduleCode === "business" ? "active" : "locked",
  })));
}

function isPlatformAdmin() {
  return Boolean(state.accessContext?.platformAdmin);
}

function canManageTenant(tenantId = currentTenantId()) {
  if (isPlatformAdmin()) return true;
  const membership = (state.accessContext?.memberships || []).find((item) => item.tenantId === tenantId);
  return Boolean(membership?.role === "franchise_admin" || membership?.role === "manager");
}

function applyViewPermissions() {
  if (isPlatformAdmin()) return;
  app.querySelectorAll("[data-delete-unit]").forEach((element) => { element.hidden = true; });
  if (canManageTenant()) return;

  const protectedSelectors = [
    "[data-status-id]", "[data-pendency-status]", "[data-pendency-note]",
    "[data-accreditation-status]", "[data-accreditation-request-date]", "[data-accreditation-approval-date]",
    "[data-accreditation-owner]", "[data-accreditation-attachments]", "[data-accreditation-notes]",
    "[data-operational-field]", "[data-unit-record-form] input", "[data-unit-record-form] select",
    "[data-unit-record-form] textarea", "[data-add-unit-record]", "[data-save-pendencies]",
    "[data-save-accreditations]", "[data-save-operational]", "[data-delete-operational]",
    "[data-delete-accreditation]", "[data-delete-record]",
  ];
  app.querySelectorAll(protectedSelectors.join(",")).forEach((element) => { element.disabled = true; });
  if (["franchises", "roadmap", "purchases", "accreditation"].includes(state.view)) {
    app.insertAdjacentHTML("afterbegin", '<div class="permission-banner">Visualização de acompanhamento. Alterações são permitidas para administradores e gerentes da franquia.</div>');
  }
}

function availableTenants() {
  if (isPlatformAdmin()) return state.adminData?.tenants || data.units.map((unit) => ({ id: unit.tenantId || unit.id, name: unit.name, code: unit.id }));
  return (state.accessContext?.memberships || []).map((membership) => ({
    id: membership.tenantId,
    name: membership.tenantName,
    code: membership.tenantCode,
    role: membership.role,
  }));
}

function currentTenantId() {
  const tenants = availableTenants();
  if (!tenants.some((tenant) => tenant.id === state.selectedTenantId)) state.selectedTenantId = tenants[0]?.id || "";
  return state.selectedTenantId;
}

function tenantModuleStatus(moduleCode, tenantId = currentTenantId()) {
  if (moduleCode === "business") return "active";
  return state.tenantModules.find((item) => item.tenantId === tenantId && item.moduleCode === moduleCode)?.status || "locked";
}

function moduleStatusLabel(status) {
  return { active: "Ativo", requested: "Solicitado", suspended: "Suspenso", locked: "Bloqueado" }[status] || "Bloqueado";
}

function updateNavigationAccess() {
  document.querySelectorAll("[data-platform-only]").forEach((element) => {
    element.hidden = !isPlatformAdmin();
  });
  document.querySelectorAll("[data-module-nav]").forEach((button) => {
    const status = isPlatformAdmin() ? "admin" : tenantModuleStatus(button.dataset.moduleNav);
    button.dataset.moduleAccess = status;
    const label = button.querySelector("[data-module-state]");
    if (label) label.textContent = status === "admin" ? "Gerenciar" : moduleStatusLabel(status);
  });
}

function tenantSelector() {
  const tenants = availableTenants();
  return `
    <label class="tenant-context-select">
      <span>Franquia</span>
      <select data-module-tenant>
        ${tenants.map((tenant) => `<option value="${escapeHtml(tenant.id)}"${tenant.id === currentTenantId() ? " selected" : ""}>${escapeHtml(tenant.name)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderModuleWorkspace(moduleCode) {
  const module = moduleDefinitions[moduleCode];
  const tenantId = currentTenantId();
  const status = tenantModuleStatus(moduleCode, tenantId);
  const tenant = availableTenants().find((item) => item.id === tenantId);
  if (!tenant) return empty("Seu usuário ainda não está vinculado a uma franquia.");

  const accessPanel = status === "active"
    ? renderActiveModule(moduleCode, module, tenant)
    : renderLockedModule(moduleCode, module, tenant, status);

  return `
    <section class="module-page-head">
      <div>
        <span class="eyebrow">${escapeHtml(module.eyebrow)}</span>
        <h2>${escapeHtml(module.name)}</h2>
        <p>${escapeHtml(module.description)}</p>
      </div>
      ${tenantSelector()}
    </section>
    ${accessPanel}
  `;
}

function renderLockedModule(moduleCode, module, tenant, status) {
  const requested = status === "requested";
  const suspended = status === "suspended";
  return `
    <section class="module-lock-panel ${escapeHtml(status)}">
      <div class="module-lock-icon" aria-hidden="true">${requested ? "…" : suspended ? "!" : "×"}</div>
      <span class="module-status-pill ${escapeHtml(status)}">${moduleStatusLabel(status)}</span>
      <h3>${requested ? "Solicitação enviada para análise" : suspended ? "Acesso temporariamente suspenso" : `${escapeHtml(module.name)} ainda não está habilitado`}</h3>
      <p>${requested
        ? `A administração recebeu a solicitação da franquia ${escapeHtml(tenant.name)}. O módulo aparecerá completo assim que for liberado.`
        : suspended
          ? "Procure a administração da plataforma para regularizar o acesso deste módulo."
          : "Este é um módulo adicional do 33Doctor APP e precisa ser liberado pela administração da plataforma."}</p>
      ${!isPlatformAdmin() && status === "locked" ? `<button class="primary-button" data-request-module="${escapeHtml(moduleCode)}" type="button">Solicitar ativação</button>` : ""}
      ${isPlatformAdmin() ? `<button class="primary-button" data-approve-module="${escapeHtml(moduleCode)}" data-tenant-id="${escapeHtml(tenant.id)}" type="button">Ativar para esta franquia</button>` : ""}
    </section>
  `;
}

function renderActiveModule(moduleCode, module, tenant) {
  return `
    <section class="module-active-hero">
      <div>
        <span class="module-status-pill active">Módulo ativo</span>
        <h3>${escapeHtml(tenant.name)}</h3>
        <p>A estrutura do departamento está pronta para receber os fluxos operacionais.</p>
      </div>
      <button class="primary-button" type="button" disabled>Novo registro</button>
    </section>
    <div class="module-metric-grid">
      ${module.metrics.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>Sem registros nesta etapa</small></article>`).join("")}
    </div>
    <section class="panel module-workflow-panel">
      <div class="section-title-row"><div><span class="eyebrow">Fluxo do módulo</span><h2>Operação orientada por etapas</h2></div></div>
      <div class="module-workflow">
        ${module.workflow.map((step, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(step)}</strong><small>Configuração da próxima entrega</small></article>`).join("")}
      </div>
    </section>
  `;
}

function renderAdminCenter() {
  if (!isPlatformAdmin()) return empty("Esta área é exclusiva da administração da plataforma.");
  const admin = state.adminData || { tenants: [], users: [], requests: [] };
  const pendingRequests = admin.requests.filter((request) => request.status === "pending");
  const activeModules = state.tenantModules.filter((item) => item.status === "active").length;
  const configurableModules = Object.keys(moduleDefinitions);

  return `
    <section class="admin-hero">
      <div><span class="eyebrow">Controle da rede</span><h2>Central Administrativa</h2><p>Usuários, franquias, acessos e módulos em um único painel.</p></div>
      <span class="admin-scope-pill">Acesso global</span>
    </section>
    <div class="module-metric-grid admin-metrics">
      ${[["Franquias", admin.tenants.length], ["Usuários", admin.users.length], ["Módulos ativos", activeModules], ["Solicitações", pendingRequests.length]].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><small>Atualizado agora</small></article>`).join("")}
    </div>
    ${renderAdminRequests(pendingRequests)}
    <section class="panel admin-section">
      <div class="section-title-row"><div><span class="eyebrow">Ativações</span><h2>Módulos por franquia</h2></div><span class="badge info">Negócios ativo por padrão</span></div>
      <div class="table-wrap">
        <table class="admin-module-table">
          <thead><tr><th>Franquia</th>${configurableModules.map((code) => `<th>${escapeHtml(moduleDefinitions[code].name)}</th>`).join("")}</tr></thead>
          <tbody>${admin.tenants.map((tenant) => `<tr><td><strong>${escapeHtml(tenant.name)}</strong><small>${escapeHtml(tenant.code)}</small></td>${configurableModules.map((code) => {
            const status = tenantModuleStatus(code, tenant.id);
            return `<td><select class="module-status-select ${escapeHtml(status)}" data-admin-module-status data-tenant-id="${escapeHtml(tenant.id)}" data-module-code="${escapeHtml(code)}">${["locked", "requested", "active", "suspended"].map((option) => `<option value="${option}"${option === status ? " selected" : ""}>${moduleStatusLabel(option)}</option>`).join("")}</select></td>`;
          }).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
    </section>
    <section class="admin-grid">
      ${renderAdminUserForm(admin.tenants)}
      ${renderAdminUsers(admin.users, admin.tenants)}
    </section>
  `;
}

function renderAdminRequests(requests) {
  if (!requests.length) return "";
  return `
    <section class="panel admin-section request-section">
      <div class="section-title-row"><div><span class="eyebrow">Aguardando decisão</span><h2>Solicitações de módulos</h2></div><span class="badge progress">${requests.length} pendente(s)</span></div>
      <div class="admin-request-list">${requests.map((request) => `<article><div><strong>${escapeHtml(request.moduleName)}</strong><span>${escapeHtml(request.tenantName)} · solicitado por ${escapeHtml(request.requestedBy)}</span></div><button class="primary-button" data-approve-module="${escapeHtml(request.moduleCode)}" data-tenant-id="${escapeHtml(request.tenantId)}" type="button">Liberar acesso</button></article>`).join("")}</div>
    </section>
  `;
}

function renderAdminUserForm(tenants) {
  return `
    <section class="panel admin-section" data-admin-user-form>
      <span class="eyebrow">Novo acesso</span><h2>Criar usuário da franquia</h2>
      <div class="admin-form-grid">
        <label>Nome<input name="name" placeholder="Nome completo" /></label>
        <label>E-mail<input name="email" type="email" placeholder="usuario@empresa.com" /></label>
        <label>Senha temporária<input name="password" type="password" minlength="8" placeholder="Mínimo de 8 caracteres" /></label>
        <label>Franquia<select name="tenantId"><option value="">Selecione</option>${tenants.map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name)}</option>`).join("")}</select></label>
        <label>Perfil<select name="role"><option value="franchise_admin">Administrador da franquia</option><option value="manager">Gerente</option><option value="user">Usuário</option></select></label>
      </div>
      <div class="form-actions"><button class="primary-button" data-create-portal-user type="button">Criar usuário</button></div>
    </section>
  `;
}

function renderAdminUsers(users, tenants) {
  return `
    <section class="panel admin-section admin-user-list-section">
      <span class="eyebrow">Equipe e acessos</span><h2>Usuários cadastrados</h2>
      <div class="admin-user-list">${users.map((user) => `<article data-admin-access-row data-user-id="${escapeHtml(user.id)}"><div class="admin-user-copy"><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.email)}</span><div class="badge-row">${user.memberships.map((membership) => `<span class="badge info">${escapeHtml(membership.tenantName)} · ${escapeHtml(roleLabel(membership.role))}</span>`).join("") || `<span class="badge ${["admin", "platform_admin"].includes(user.platformRole) ? "done" : "pending"}">${["admin", "platform_admin"].includes(user.platformRole) ? "Administrador global" : "Sem franquia"}</span>`}</div></div>${["admin", "platform_admin"].includes(user.platformRole) ? "" : `<div class="admin-access-controls"><select data-access-tenant><option value="">Franquia</option>${tenants.map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name)}</option>`).join("")}</select><select data-access-role><option value="franchise_admin">Administrador</option><option value="manager">Gerente</option><option value="user">Usuário</option></select><select data-access-active><option value="true">Acesso ativo</option><option value="false">Suspender acesso</option></select><button class="ghost-button" data-save-user-access type="button">Salvar acesso</button></div>`}</article>`).join("") || empty("Nenhum usuário cadastrado")}</div>
    </section>
  `;
}

function roleLabel(role) {
  return { franchise_admin: "Administrador", manager: "Gerente", user: "Usuário" }[role] || role;
}

async function requestModule(moduleCode, button) {
  const tenantId = currentTenantId();
  if (!tenantId) return;
  button.disabled = true;
  try {
    await supabaseRpc("request_tenant_module", { p_token: state.auth.token, p_tenant_id: tenantId, p_module_code: moduleCode, p_notes: null });
    await loadSupabaseData();
    render();
  } catch (error) {
    button.disabled = false;
    alert(error.message || "Não foi possível solicitar o módulo.");
  }
}

async function adminSetModuleStatus(select) {
  select.disabled = true;
  try {
    await supabaseRpc("admin_set_tenant_module", {
      p_token: state.auth.token,
      p_tenant_id: select.dataset.tenantId,
      p_module_code: select.dataset.moduleCode,
      p_status: select.value,
    });
    await loadSupabaseData();
    render();
  } catch (error) {
    select.disabled = false;
    alert(error.message || "Não foi possível atualizar o módulo.");
  }
}

async function adminApproveModuleRequest(button) {
  button.disabled = true;
  try {
    await supabaseRpc("admin_set_tenant_module", {
      p_token: state.auth.token,
      p_tenant_id: button.dataset.tenantId,
      p_module_code: button.dataset.approveModule,
      p_status: "active",
    });
    await loadSupabaseData();
    render();
  } catch (error) {
    button.disabled = false;
    alert(error.message || "Não foi possível liberar o módulo.");
  }
}

async function adminCreatePortalUser(button) {
  const form = button.closest("[data-admin-user-form]");
  const values = Object.fromEntries([...form.querySelectorAll("input, select")].map((field) => [field.name, field.value.trim()]));
  if (!values.name || !values.email || !values.password || !values.tenantId) {
    alert("Preencha nome, e-mail, senha e franquia.");
    return;
  }
  button.disabled = true;
  try {
    await supabaseRpc("admin_create_portal_user", {
      p_token: state.auth.token, p_email: values.email, p_name: values.name, p_password: values.password,
      p_tenant_id: values.tenantId, p_role: values.role,
    });
    await loadSupabaseData();
    render();
  } catch (error) {
    button.disabled = false;
    alert(error.message || "Não foi possível criar o usuário.");
  }
}

async function adminSaveUserAccess(button) {
  const row = button.closest("[data-admin-access-row]");
  const tenantId = row.querySelector("[data-access-tenant]").value;
  const role = row.querySelector("[data-access-role]").value;
  const active = row.querySelector("[data-access-active]").value === "true";
  if (!tenantId) {
    alert("Selecione uma franquia.");
    return;
  }
  button.disabled = true;
  try {
    await supabaseRpc("admin_set_user_access", {
      p_token: state.auth.token, p_user_id: row.dataset.userId, p_tenant_id: tenantId, p_role: role, p_active: active,
    });
    await loadSupabaseData();
    render();
  } catch (error) {
    button.disabled = false;
    alert(error.message || "Não foi possível vincular o usuário.");
  }
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
    .map((task, index) => applyOperationalRecord(unit.id, "documents", {
      id: `doc-${task.id}`,
      recordId: `doc-${task.id}`,
      unitId: unit.id,
      recordType: "documents",
      sourceId: task.id,
      base: true,
      name: task.process,
      category: canonicalCategory(task.process),
      version: `v${Math.max(1, Math.floor(index / 5) + 1)}`,
      date: task.actualDate || task.deadline || unit.openingDate,
      owner: unit.owner || unit.ownerName || "Implantação",
      status: getStatus(task) === "Concluído" ? "Aprovado" : getStatus(task) === "Em Andamento" ? "Em análise" : "Pendente",
      signature: /contrato|aditivo|document/i.test(normalizeText(task.process)) ? "Aplicável" : "Não aplicável",
      history: task.notes || "Sem histórico registrado",
      file: "Visualizar / download pendente",
    }))
    .filter((item) => !item.hidden);
}

function trainingItems(unit) {
  return (unit.tasks || [])
    .filter((task) => normalizeText(task.process).includes("trein"))
    .map((task) => applyOperationalRecord(unit.id, "trainings", {
      id: `training-${task.id}`,
      recordId: `training-${task.id}`,
      unitId: unit.id,
      recordType: "trainings",
      sourceId: task.id,
      base: true,
      name: task.process,
      date: task.actualDate || task.deadline || "",
      instructor: "Equipe Nexa",
      participants: unit.franchisee || "Franqueado e equipe",
      workload: "A definir",
      certificate: getStatus(task) === "Concluído" ? "Liberado" : "Pendente",
      status: getStatus(task),
      attendance: getStatus(task) === "Concluído" ? "Registrada" : "Pendente",
      material: /manual/i.test(normalizeText(task.process)) ? "Manual da franquia" : "Material operacional",
      attachments: "Sem anexo",
      notes: task.notes || "",
    }))
    .filter((item) => !item.hidden);
}

function meetingItems(unit) {
  return (unit.tasks || [])
    .filter((task) => /reuniao|apresentacao|boas vindas|kickoff|alinhamento/i.test(normalizeText(task.process)))
    .slice(0, 16)
    .map((task) => applyOperationalRecord(unit.id, "meetings", {
      id: `meeting-${task.id}`,
      recordId: `meeting-${task.id}`,
      unitId: unit.id,
      recordType: "meetings",
      sourceId: task.id,
      base: true,
      date: task.actualDate || task.deadline || "",
      participants: unit.franchisee || "Franqueado",
      subject: task.process,
      pending: getStatus(task) === "Concluído" ? "Sem pendência aberta" : task.process,
      owner: unit.owner || unit.ownerName || "Consultor responsável",
      deadline: task.deadline || unit.openingDate,
      attachments: "Sem anexo",
      history: task.notes || "Sem observações",
    }))
    .filter((item) => !item.hidden);
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

function operationalKey(unitId, recordType, recordId) {
  return `${unitId}::${recordType}::${recordId}`;
}

function applyOperationalRecord(unitId, recordType, item) {
  const recordId = item.recordId || item.id;
  const key = operationalKey(unitId, recordType, recordId);
  const saved = data.operationalRecordsByKey?.[key] || {};
  const local = state.operationalOverrides[key] || {};
  return {
    ...item,
    ...saved,
    ...local,
    id: item.id,
    recordId,
    unitId,
    recordType,
    operationalKey: key,
  };
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
      <button class="ghost-button danger-action" data-delete-unit="${unit.id}" type="button">Excluir franquia</button>
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
      <button class="delete-unit-button" data-delete-unit="${unit.id}" type="button">
        Excluir franquia
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
  const manualRows = customRecords(unit, "accreditations").filter((record) => !record.hidden).map((record) => ({
    id: record.id,
    manual: true,
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
        <thead><tr><th>Tipo</th><th>Status</th><th>Solicitação</th><th>Aprovação</th><th>Responsável</th><th>Anexos</th><th>Observações</th><th>Ações</th></tr></thead>
        <tbody>
          ${rows.map((item) => `
            <tr data-accreditation-row data-accreditation-id="${escapeHtml(item.id)}" data-unit-id="${escapeHtml(item.unitId || unit.id)}" data-procedure-id="${escapeHtml(item.procedureId || "")}">
              <td><span class="row-title">${escapeHtml(item.name)}</span><small>${escapeHtml(item.group)}</small></td>
              <td>${accreditationStatusSelect(item)}</td>
              <td><input class="table-input" data-accreditation-request-date type="date" value="${escapeHtml(item.requestDate || "")}" /></td>
              <td><input class="table-input" data-accreditation-approval-date type="date" value="${escapeHtml(item.approvalDate || "")}" /></td>
              <td><input class="table-input" data-accreditation-owner type="text" value="${escapeHtml(item.owner || unit.owner || unit.ownerName || "Credenciamento")}" /></td>
              <td><input class="table-input" data-accreditation-attachments type="text" value="${escapeHtml(item.attachments || "")}" placeholder="Sem anexo" /></td>
              <td><textarea class="table-textarea" data-accreditation-notes rows="2" placeholder="Observações">${escapeHtml(item.notes || "")}</textarea></td>
              <td>${accreditationActions(item)}</td>
            </tr>
          `).join("") || `<tr><td colspan="8">${empty("Sem credenciamentos mapeados")}</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="pendency-save-bar">
      <span>As alterações de credenciamento só entram no sistema ao salvar.</span>
      <button class="primary-button" data-save-accreditations type="button">Salvar credenciamentos</button>
    </div>
  `;
}

function renderUnitDocuments(unit, stats) {
  const manualRows = customRecords(unit, "documents").filter((record) => !record.hidden).map((record) => ({
    id: record.id,
    recordId: record.id,
    unitId: unit.id,
    recordType: "documents",
    manual: true,
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
    ${renderEditableOperationalTable("documents", rows, [
      { key: "name", label: "Nome", type: "text", minWidth: 220 },
      { key: "category", label: "Categoria", type: "select", options: ["Contratos", "Alvarás", "Licenças", "Manual da franquia", "Marketing", "Financeiro", "Documentos da empresa", "Documentos societários", "Projeto arquitetônico", "Atas de reuniões", "Treinamentos"] },
      { key: "version", label: "Versão", type: "text", minWidth: 80 },
      { key: "date", label: "Data", type: "date" },
      { key: "owner", label: "Responsável", type: "text" },
      { key: "status", label: "Status", type: "status", options: ["Pendente", "Em análise", "Aprovado", "Reprovado"] },
      { key: "signature", label: "Assinatura", type: "select", options: ["Não informado", "Aplicável", "Não aplicável", "Assinado"] },
      { key: "history", label: "Histórico", type: "textarea", minWidth: 320 },
      { key: "file", label: "Arquivo", type: "text", minWidth: 220 },
    ], "Nenhum documento mapeado a partir do roadmap")}
  `;
}

function renderUnitTraining(unit, stats) {
  const manualRows = customRecords(unit, "trainings").filter((record) => !record.hidden).map((record) => ({
    id: record.id,
    recordId: record.id,
    unitId: unit.id,
    recordType: "trainings",
    manual: true,
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
    ${renderEditableOperationalTable("trainings", rows, [
      { key: "name", label: "Nome", type: "text", minWidth: 240 },
      { key: "date", label: "Data", type: "date" },
      { key: "instructor", label: "Instrutor", type: "text" },
      { key: "participants", label: "Participantes", type: "text", minWidth: 210 },
      { key: "workload", label: "Carga horária", type: "text", minWidth: 120 },
      { key: "certificate", label: "Certificado", type: "select", options: ["Pendente", "Liberado", "Não aplicável"] },
      { key: "status", label: "Status", type: "status", options: ["Pendente", "Em Andamento", "Concluído"] },
      { key: "attendance", label: "Presença", type: "text" },
      { key: "material", label: "Material", type: "text", minWidth: 220 },
      { key: "attachments", label: "Anexos", type: "text", minWidth: 220 },
    ], "Nenhum treinamento mapeado")}
  `;
}

function renderUnitMeetings(unit, stats) {
  const manualRows = customRecords(unit, "meetings").filter((record) => !record.hidden).map((record) => ({
    id: record.id,
    recordId: record.id,
    unitId: unit.id,
    recordType: "meetings",
    manual: true,
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
    ${renderEditableOperationalTable("meetings", rows, [
      { key: "date", label: "Data", type: "date" },
      { key: "participants", label: "Participantes", type: "text", minWidth: 220 },
      { key: "subject", label: "Assuntos", type: "text", minWidth: 260 },
      { key: "pending", label: "Pendências", type: "text", minWidth: 260 },
      { key: "owner", label: "Responsáveis", type: "text", minWidth: 190 },
      { key: "deadline", label: "Prazo", type: "date" },
      { key: "attachments", label: "Anexos", type: "text", minWidth: 220 },
      { key: "history", label: "Histórico", type: "textarea", minWidth: 340 },
    ], "Nenhuma ata mapeada")}
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
            <th>Pendência</th>
            <th>Responsável</th>
            <th>Prazo</th>
            <th>Prioridade</th>
            <th>Status</th>
            <th>Anexo</th>
            <th>Observações</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => {
            const resolved = getStatus(item) === "Concluído";
            return `
              <tr class="${resolved ? "pendency-resolved" : ""}">
                <td><span class="row-title">${escapeHtml(item.title)}</span></td>
                <td>${escapeHtml(item.owner)}</td>
                <td>${escapeHtml(formatDate(item.deadline))}</td>
                <td>${escapeHtml(item.priority)}</td>
                <td>${pendencyStatusSelect(item)}</td>
                <td>${escapeHtml(item.attachment)}</td>
                <td>
                  <textarea class="pendency-note-input" data-pendency-note="${item.id}" rows="2" placeholder="Adicionar observação">${escapeHtml(getPendencyNotes(item))}</textarea>
                </td>
                <td>${recordActions(item)}</td>
              </tr>
            `;
          }).join("") || `<tr><td colspan="8">${empty("Nenhuma pendência aberta")}</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="pendency-save-bar">
      <span>As alterações de status e observações só entram no sistema ao salvar.</span>
      <button class="primary-button" data-save-pendencies type="button">Salvar pendências</button>
    </div>
  `;
}

function pendencyStatusSelect(item) {
  const current = getStatus(item);
  const options = ["Pendente", "Em Andamento", "Concluído"];
  if (current && !options.includes(current)) options.push(current);
  return `
    <select class="${statusClass(current)} pendency-status-select" data-pendency-status="${item.id}" aria-label="Status de ${escapeHtml(item.title)}">
      ${options.map((status) => `<option value="${escapeHtml(status)}"${current === status ? " selected" : ""}>${escapeHtml(status)}</option>`).join("")}
    </select>
  `;
}

function accreditationStatusSelect(item) {
  const options = ["Pendente", "Em análise", "Em negociação", "Aprovado", "Fechado", "Reprovado", "Vazio"];
  const current = item.status || "Pendente";
  const mergedOptions = current && !options.includes(current) ? [...options, current] : options;
  return `
    <select class="${statusClass(current)} manual-status-select" data-accreditation-status aria-label="Status de ${escapeHtml(item.name || "credenciamento")}">
      ${mergedOptions.map((status) => `<option value="${escapeHtml(status)}"${current === status ? " selected" : ""}>${escapeHtml(status)}</option>`).join("")}
    </select>
  `;
}

function manualStatusSelect(item, options) {
  const current = item.status || options[0] || "Pendente";
  const mergedOptions = current && !options.includes(current) ? [...options, current] : options;
  return `
    <select class="${statusClass(current)} manual-status-select" data-manual-record-status="${item.id}" aria-label="Status de ${escapeHtml(item.name || item.title || "registro")}">
      ${mergedOptions.map((status) => `<option value="${escapeHtml(status)}"${current === status ? " selected" : ""}>${escapeHtml(status)}</option>`).join("")}
    </select>
  `;
}

function recordActions(item) {
  if (!item.manual) return `<span class="record-source">Base</span>`;
  return `<button class="link-button danger" data-delete-record="${item.id}" type="button">Excluir</button>`;
}

function accreditationActions(item) {
  if (item.manual) return `<button class="link-button danger" data-delete-record="${item.id}" type="button">Excluir</button>`;
  return `<button class="link-button danger" data-delete-accreditation data-accreditation-id="${escapeHtml(item.id)}" data-unit-id="${escapeHtml(item.unitId)}" data-procedure-id="${escapeHtml(item.procedureId)}" type="button">Excluir</button>`;
}

function renderEditableOperationalTable(recordType, rows, columns, emptyMessage) {
  return `
    <div class="table-wrap">
      <table class="workspace-table compact-table operational-table">
        <thead>
          <tr>
            ${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr data-operational-row="${escapeHtml(recordType)}" data-unit-id="${escapeHtml(item.unitId)}" data-record-id="${escapeHtml(item.recordId || item.id)}" data-manual="${item.manual ? "true" : "false"}">
              ${columns.map((column) => `<td>${operationalField(item, column)}</td>`).join("")}
              <td>${operationalActions(item)}</td>
            </tr>
          `).join("") || `<tr><td colspan="${columns.length + 1}">${empty(emptyMessage)}</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="pendency-save-bar">
      <span>As alterações desta aba só entram no sistema ao salvar.</span>
      <button class="primary-button" data-save-operational="${escapeHtml(recordType)}" type="button">Salvar alterações</button>
    </div>
  `;
}

function operationalField(item, column) {
  const value = item[column.key] || "";
  const width = column.minWidth ? ` style="min-width:${column.minWidth}px"` : "";
  const common = `data-operational-field="${escapeHtml(column.key)}" aria-label="${escapeHtml(column.label)}"${width}`;

  if (column.type === "textarea") {
    return `<textarea class="table-textarea" ${common} rows="2">${escapeHtml(value)}</textarea>`;
  }
  if (column.type === "date") {
    return `<input class="table-input" ${common} type="date" value="${escapeHtml(value)}" />`;
  }
  if (column.type === "status") {
    const options = column.options || ["Pendente", "Em análise", "Aprovado", "Reprovado", "Concluído"];
    const mergedOptions = value && !options.includes(value) ? [...options, value] : options;
    return `
      <select class="${statusClass(value || options[0])} manual-status-select" ${common}>
        ${mergedOptions.map((option) => `<option value="${escapeHtml(option)}"${value === option ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    `;
  }
  if (column.type === "select") {
    const options = column.options || [];
    const mergedOptions = value && !options.includes(value) ? [...options, value] : options;
    return `
      <select class="table-input" ${common}>
        ${mergedOptions.map((option) => `<option value="${escapeHtml(option)}"${value === option ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    `;
  }
  return `<input class="table-input" ${common} type="text" value="${escapeHtml(value)}" />`;
}

function operationalActions(item) {
  if (item.manual) return `<button class="link-button danger" data-delete-record="${escapeHtml(item.id)}" type="button">Excluir</button>`;
  return `<button class="link-button danger" data-delete-operational data-unit-id="${escapeHtml(item.unitId)}" data-record-type="${escapeHtml(item.recordType)}" data-record-id="${escapeHtml(item.recordId || item.id)}" type="button">Excluir</button>`;
}

function getPendencyNotes(item) {
  if (Object.prototype.hasOwnProperty.call(state.pendencyNotes, item.id)) return state.pendencyNotes[item.id];
  return item.notes || "";
}

async function savePendencyChanges(button) {
  const scope = button.closest(".unit-tab-panel") || app;
  const notes = {};
  scope.querySelectorAll("[data-pendency-note]").forEach((field) => {
    notes[field.dataset.pendencyNote] = field.value;
  });
  const updates = [...scope.querySelectorAll("[data-pendency-status]")].map((field) => ({
    id: field.dataset.pendencyStatus,
    status: field.value,
    notes: notes[field.dataset.pendencyStatus] || "",
  }));

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Salvando...";

  try {
    for (const item of updates) {
      if (updateManualRecord(item.id, { status: item.status, notes: item.notes })) continue;

      state.pendencyNotes[item.id] = item.notes;
      if (supabaseEnabled && state.auth?.token) {
        const functionName = isPurchaseId(item.id) ? "update_purchase_status" : "update_task_status";
        const payload = isPurchaseId(item.id)
          ? { p_token: state.auth.token, p_purchase_id: item.id, p_status: item.status }
          : { p_token: state.auth.token, p_task_id: item.id, p_status: item.status };
        await supabaseRpc(functionName, payload);
        setLocalItemStatus(item.id, item.status);
      } else {
        state.statusOverrides[item.id] = item.status;
      }
    }
    writeStorage("franchisePendencyNotes", state.pendencyNotes);
    writeStorage("franchiseStatusOverrides", state.statusOverrides);
    render();
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    alert(error.message || "Não foi possível salvar as pendências.");
  }
}

async function saveAccreditationChanges(button) {
  const scope = button.closest(".unit-tab-panel") || app;
  const rows = [...scope.querySelectorAll("[data-accreditation-row]")];
  const updates = rows.map((row) => ({
    id: row.dataset.accreditationId,
    unitId: row.dataset.unitId,
    procedureId: row.dataset.procedureId,
    status: row.querySelector("[data-accreditation-status]")?.value || "Pendente",
    requestDate: row.querySelector("[data-accreditation-request-date]")?.value || "",
    approvalDate: row.querySelector("[data-accreditation-approval-date]")?.value || "",
    owner: row.querySelector("[data-accreditation-owner]")?.value.trim() || "Credenciamento",
    attachments: row.querySelector("[data-accreditation-attachments]")?.value.trim() || "Sem anexo",
    notes: row.querySelector("[data-accreditation-notes]")?.value.trim() || "",
  }));

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Salvando...";

  try {
    for (const item of updates) {
      if (updateManualRecord(item.id, item)) continue;

      setLocalAccreditationRecord(item);
      if (supabaseEnabled && state.auth?.token) {
        await supabaseRpc("update_accreditation_record", {
          p_token: state.auth.token,
          p_unit_id: item.unitId,
          p_procedure_id: item.procedureId,
          p_status: item.status,
          p_request_date: item.requestDate || null,
          p_approval_date: item.approvalDate || null,
          p_owner_name: item.owner,
          p_attachments: item.attachments,
          p_notes: item.notes,
        });
      } else {
        state.accreditationOverrides[item.id] = { ...state.accreditationOverrides[item.id], ...item, hidden: false };
      }
    }
    writeStorage("franchiseAccreditationOverrides", state.accreditationOverrides);
    render();
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    alert(error.message || "Não foi possível salvar os credenciamentos.");
  }
}

async function deleteAccreditationRecord(button) {
  const item = {
    id: button.dataset.accreditationId,
    unitId: button.dataset.unitId,
    procedureId: button.dataset.procedureId,
    hidden: true,
  };

  try {
    setLocalAccreditationRecord(item);
    state.accreditationOverrides[item.id] = { ...state.accreditationOverrides[item.id], ...item };
    writeStorage("franchiseAccreditationOverrides", state.accreditationOverrides);

    if (supabaseEnabled && state.auth?.token) {
      await supabaseRpc("delete_accreditation_record", {
        p_token: state.auth.token,
        p_unit_id: item.unitId,
        p_procedure_id: item.procedureId,
      });
    }
    render();
  } catch (error) {
    alert(error.message || "Não foi possível excluir o credenciamento.");
  }
}

function setLocalAccreditationRecord(item) {
  const procedure = data.accreditation.procedures.find((entry) => entry.id === item.procedureId);
  if (!procedure) return;

  procedure.statuses ||= {};
  procedure.details ||= {};
  const current = procedure.details[item.unitId] || {};
  procedure.details[item.unitId] = { ...current, ...item };
  if (item.status) procedure.statuses[item.unitId] = item.status;
  if (item.hidden) delete procedure.statuses[item.unitId];
}

async function saveOperationalChanges(recordType, button) {
  const scope = button.closest(".unit-tab-panel") || app;
  const rows = [...scope.querySelectorAll(`[data-operational-row="${recordType}"]`)];
  const updates = rows.map((row) => {
    const values = {};
    row.querySelectorAll("[data-operational-field]").forEach((field) => {
      values[field.dataset.operationalField] = typeof field.value === "string" ? field.value.trim() : field.value;
    });
    return {
      unitId: row.dataset.unitId,
      recordType,
      recordId: row.dataset.recordId,
      manual: row.dataset.manual === "true",
      values,
    };
  });

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Salvando...";

  try {
    for (const item of updates) {
      if (item.manual) {
        updateManualRecord(item.recordId, item.values);
        continue;
      }

      setLocalOperationalRecord({ ...item, hidden: false });
      if (supabaseEnabled && state.auth?.token) {
        await supabaseRpc("update_unit_operational_record", {
          p_token: state.auth.token,
          p_unit_id: item.unitId,
          p_record_type: item.recordType,
          p_record_id: item.recordId,
          p_payload: item.values,
        });
      }
    }
    writeStorage("franchiseOperationalOverrides", state.operationalOverrides);
    render();
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    alert(error.message || "Não foi possível salvar as alterações.");
  }
}

async function deleteOperationalRecord(button) {
  const item = {
    unitId: button.dataset.unitId,
    recordType: button.dataset.recordType,
    recordId: button.dataset.recordId,
    values: {},
    hidden: true,
  };

  try {
    setLocalOperationalRecord(item);
    writeStorage("franchiseOperationalOverrides", state.operationalOverrides);

    if (supabaseEnabled && state.auth?.token) {
      await supabaseRpc("delete_unit_operational_record", {
        p_token: state.auth.token,
        p_unit_id: item.unitId,
        p_record_type: item.recordType,
        p_record_id: item.recordId,
      });
    }
    render();
  } catch (error) {
    alert(error.message || "Não foi possível excluir este registro.");
  }
}

function setLocalOperationalRecord(item) {
  const key = operationalKey(item.unitId, item.recordType, item.recordId);
  const current = data.operationalRecordsByKey?.[key] || state.operationalOverrides[key] || {};
  const next = {
    ...current,
    unitId: item.unitId,
    recordType: item.recordType,
    recordId: item.recordId,
    ...(item.values || {}),
    hidden: item.hidden ?? false,
  };
  state.operationalOverrides[key] = next;
  data.operationalRecordsByKey ||= {};
  data.operationalRecordsByKey[key] = next;
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

function deleteManualRecord(recordId) {
  let deleted = false;
  for (const unitRecords of Object.values(state.unitRecords)) {
    for (const [type, records] of Object.entries(unitRecords || {})) {
      const nextRecords = records.filter((item) => item.id !== recordId);
      if (nextRecords.length !== records.length) {
        unitRecords[type] = nextRecords;
        deleted = true;
      }
    }
  }
  if (!deleted) return;
  writeStorage("franchiseUnitRecords", state.unitRecords);
  render();
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
          ${rows.map((row) => `<tr>${mapRow(row).map((cell, index) => `<td>${tableCellContent(cell, index)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${headers.length}">${empty(emptyMessage)}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function htmlCell(html) {
  return { html };
}

function tableCellContent(cell, index) {
  if (cell && typeof cell === "object" && Object.prototype.hasOwnProperty.call(cell, "html")) return cell.html;
  return index === 0 ? `<span class="row-title">${escapeHtml(cell)}</span>` : escapeHtml(cell);
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
  return data.accreditation.procedures
    .map((procedure) => {
      const id = accreditationRecordId(unit.id, procedure.id);
      const saved = procedure.details?.[unit.id] || {};
      const override = state.accreditationOverrides[id] || {};
      const item = {
        id,
        unitId: unit.id,
        procedureId: procedure.id,
        group: procedure.group,
        name: procedure.name,
        status: override.status ?? saved.status ?? procedure.statuses?.[unit.id] ?? "",
        requestDate: override.requestDate ?? saved.requestDate ?? "",
        approvalDate: override.approvalDate ?? saved.approvalDate ?? "",
        owner: override.owner ?? saved.owner ?? unit.owner ?? unit.ownerName ?? "Credenciamento",
        attachments: override.attachments ?? saved.attachments ?? "Sem anexo",
        notes: override.notes ?? saved.notes ?? saved.status ?? procedure.statuses?.[unit.id] ?? "Aguardando atualização",
        hidden: override.hidden ?? saved.hidden ?? false,
      };
      return item;
    })
    .filter((item) => !item.hidden);
}

function accreditationRecordId(unitId, procedureId) {
  return `${unitId}::${procedureId}`;
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
  const donePercent = (done / total) * 100;
  const progressPercent = (inProgress / total) * 100;
  const progressStop = donePercent + progressPercent;
  return `
    <div class="donut-chart-layout">
      <div class="donut-chart" style="--done-stop:${donePercent}%;--progress-stop:${progressStop}%" role="img" aria-label="${done} concluídas, ${inProgress} em andamento e ${pending} pendentes">
        <div><strong>${done + inProgress + pending}</strong><span>etapas</span></div>
      </div>
      <div class="donut-legend">
        <div class="done"><span></span><p><strong>Concluídas</strong><small>${done} · ${Math.round(donePercent)}%</small></p></div>
        <div class="progress"><span></span><p><strong>Em andamento</strong><small>${inProgress} · ${Math.round(progressPercent)}%</small></p></div>
        <div class="pending"><span></span><p><strong>Pendentes</strong><small>${pending} · ${Math.round((pending / total) * 100)}%</small></p></div>
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
  const normalized = normalizeText(label);
  let tone = "info";
  if (normalized.includes("progresso") || normalized.includes("concluido")) tone = "done";
  else if (normalized.includes("pendencia") || normalized.includes("risco")) tone = "pending";
  else if (normalized.includes("documento") || normalized.includes("tempo")) tone = "progress";
  return `
    <section class="panel kpi kpi-${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(detail)}</small>
      <div class="kpi-segments" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
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
  const value = normalizeText(status);
  if (value.includes("conclu") || value.includes("aprov") || value.includes("fechado")) return "done";
  if (value.includes("andamento")) return "progress";
  if (value.includes("analise")) return "review";
  if (value.includes("negociacao")) return "negotiation";
  if (value.includes("reprov") || value.includes("recus")) return "rejected";
  if (value.includes("vazio") || value.includes("sem status")) return "empty-status";
  if (value.includes("pend")) return "pending";
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

async function deleteFranchiseUnit(unitId) {
  const unit = allUnits().find((item) => item.id === unitId);
  if (!unit) return;
  const confirmed = window.confirm(`Excluir a franquia ${unit.name || unit.city}? Esta ação remove a pasta digital e os dados vinculados a esta unidade.`);
  if (!confirmed) return;

  try {
    if (supabaseEnabled && state.auth?.token && !unitId.startsWith("draft-")) {
      await supabaseRpc("delete_franchise_unit", {
        p_token: state.auth.token,
        p_unit_id: unitId,
      });
    }

    data.units = data.units.filter((item) => item.id !== unitId);
    data.accreditation.units = (data.accreditation.units || []).filter((item) => item.id !== unitId);
    state.drafts = state.drafts.filter((item) => item.id !== unitId);
    delete state.unitRecords[unitId];
    delete state.unitTabs[unitId];

    Object.keys(state.operationalOverrides).forEach((key) => {
      if (key.startsWith(`${unitId}::`)) delete state.operationalOverrides[key];
    });
    Object.keys(state.accreditationOverrides).forEach((key) => {
      if (key.startsWith(`${unitId}::`)) delete state.accreditationOverrides[key];
    });
    data.accreditation.procedures.forEach((procedure) => {
      delete procedure.statuses?.[unitId];
      delete procedure.details?.[unitId];
    });

    writeStorage("franchiseDrafts", state.drafts);
    writeStorage("franchiseUnitRecords", state.unitRecords);
    writeStorage("franchiseUnitTabs", state.unitTabs);
    writeStorage("franchiseOperationalOverrides", state.operationalOverrides);
    writeStorage("franchiseAccreditationOverrides", state.accreditationOverrides);

    if (state.franchiseWorkspaceUnitId === unitId) state.franchiseWorkspaceUnitId = "";
    if (state.selectedUnitId === unitId) state.selectedUnitId = data.units[0]?.id || state.drafts[0]?.id || "";
    render();
  } catch (error) {
    alert(error.message || "Não foi possível excluir a franquia.");
  }
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

  const requiredField = primaryRecordField(recordType);
  if (!values[requiredField]) {
    alert(`Preencha ${primaryRecordLabel(recordType)} antes de adicionar.`);
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

function primaryRecordField(recordType) {
  return {
    accreditations: "name",
    documents: "name",
    trainings: "name",
    meetings: "subject",
    pendencies: "title",
  }[recordType] || "name";
}

function primaryRecordLabel(recordType) {
  return {
    accreditations: "o tipo de credenciamento",
    documents: "o nome do documento",
    trainings: "o nome do treinamento",
    meetings: "o assunto da ata",
    pendencies: "a pendência",
  }[recordType] || "o campo principal";
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
