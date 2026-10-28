const followersInput = document.getElementById("followers-file");
const followingInput = document.getElementById("following-file");
const compareButton = document.getElementById("compare");
const message = document.getElementById("message");
const results = document.getElementById("results");
const stats = document.getElementById("stats");
const usersList = document.getElementById("users");
const searchInput = document.getElementById("search");
const progressLabel = document.getElementById("progress-label");
const startRunButton = document.getElementById("start-run");
const automationStatus = document.getElementById("automation-status");
const intervalInput = document.getElementById("interval-seconds");
const restEveryInput = document.getElementById("rest-every");
const restSecondsInput = document.getElementById("rest-seconds");
const modeInput = document.getElementById("automation-mode");
const DEFAULT_SETTINGS = { intervalSeconds: 15, restEvery: 25, restSeconds: 120 };

let currentData = null;
let currentAutomation = null;
let selectedMode = "unfollow";
let progressByMode = { unfollow: [], remove_follower: [] };

function activeCandidates() {
  return FollowbackModes.candidates(currentData, selectedMode);
}

function activeDone() {
  return progressByMode[selectedMode] || [];
}

async function saveProgress(done) {
  progressByMode[selectedMode] = done;
  if (currentAutomation?.startedAt && FollowbackModes.normalize(currentAutomation.mode) === selectedMode) {
    progressByMode.ignoredRuns = { ...progressByMode.ignoredRuns, [selectedMode]: currentAutomation.startedAt };
  }
  await chrome.storage.local.set({ progressByMode });
}

function renderMode() {
  const mode = FollowbackModes.info(selectedMode);
  modeInput.value = selectedMode;
  document.getElementById("automation-title").textContent = mode.heading;
  document.getElementById("automation-copy").textContent = mode.copy;
  document.getElementById("reimport-note").hidden = selectedMode !== "remove_follower" || Array.isArray(currentData?.removalCandidates);
}

function cleanUsername(value) {
  if (typeof value !== "string") return "";
  const name = value.trim().replace(/^@/, "").toLowerCase();
  if (!name || name.startsWith("__deleted__") || name === "instagram user") return "";
  return /^[a-z0-9._]{1,30}$/.test(name) ? name : "";
}

function hrefUsername(value) {
  if (typeof value !== "string") return "";
  try {
    const parts = new URL(value, "https://www.instagram.com").pathname.split("/").filter(Boolean);
    return parts.length === 1 ? cleanUsername(decodeURIComponent(parts[0])) : "";
  } catch {
    return "";
  }
}

function rowUsername(row) {
  if (!row || typeof row !== "object") return "";
  const title = cleanUsername(row.title);
  if (title) return title;
  const first = Array.isArray(row.string_list_data) ? row.string_list_data[0] : null;
  if (!first || typeof first !== "object") return "";
  return cleanUsername(first.value) || hrefUsername(first.href);
}

function extractRows(followersJson, followingJson) {
  if (!Array.isArray(followersJson)) {
    throw new Error("O arquivo de seguidores não tem o formato esperado.");
  }
  const followingRows = followingJson?.relationships_following;
  if (!Array.isArray(followingRows)) {
    throw new Error("O arquivo following.json não tem o formato esperado.");
  }
  const followers = new Set(followersJson.map(rowUsername).filter(Boolean));
  const following = new Set(followingRows.map(rowUsername).filter(Boolean));
  return { followers, following };
}

function compareLists(followers, following) {
  const sortedDifference = (left, right) => [...left].filter((name) => !right.has(name)).sort((a, b) => a.localeCompare(b));
  return {
    candidates: sortedDifference(following, followers),
    removalCandidates: sortedDifference(followers, following),
  };
}

function readJson(file) {
  return file.text().then((text) => JSON.parse(text));
}

async function readFollowersFiles(files) {
  const chunks = await Promise.all(Array.from(files, readJson));
  if (!chunks.length || !chunks.every(Array.isArray)) {
    throw new Error("Selecione todos os arquivos followers_*.json da mesma exportação.");
  }
  return chunks.flat();
}

function updateCompareState() {
  compareButton.disabled = currentAutomation?.status === "running" || !(followersInput.files.length && followingInput.files.length);
}

function normalizeSettings(raw = {}) {
  const read = (value, fallback, max) => {
    if (value === "" || value === null || value === undefined) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(0, Math.round(number))) : fallback;
  };
  return {
    intervalSeconds: read(raw.intervalSeconds, DEFAULT_SETTINGS.intervalSeconds, 300),
    restEvery: read(raw.restEvery, DEFAULT_SETTINGS.restEvery, 5000),
    restSeconds: read(raw.restSeconds, DEFAULT_SETTINGS.restSeconds, 3600),
  };
}

function settingsFromInputs() {
  return normalizeSettings({
    intervalSeconds: intervalInput.value,
    restEvery: restEveryInput.value,
    restSeconds: restSecondsInput.value,
  });
}

function renderSettings(raw) {
  const settings = normalizeSettings(raw);
  intervalInput.value = settings.intervalSeconds;
  restEveryInput.value = settings.restEvery;
  restSecondsInput.value = settings.restSeconds;
  const disabled = currentAutomation?.status === "running";
  intervalInput.disabled = disabled;
  restEveryInput.disabled = disabled;
  restSecondsInput.disabled = disabled;
}

async function saveSettings() {
  const settings = settingsFromInputs();
  renderSettings(settings);
  await chrome.storage.local.set({ automationSettings: settings });
  return settings;
}

function setMessage(text, isError = true) {
  message.textContent = text;
  message.style.color = isError ? "#a13a35" : "#28794b";
}

function showStats() {
  const done = new Set(activeDone());
  stats.innerHTML = "";
  [
    [currentData.followersCount, "seguidores"],
    [currentData.followingCount, "seguindo"],
    [activeCandidates().length, FollowbackModes.info(selectedMode).candidatesLabel],
  ].forEach(([value, label]) => {
    const card = document.createElement("div");
    card.className = "stat";
    const strong = document.createElement("strong");
    strong.textContent = Number(value).toLocaleString("pt-BR");
    const span = document.createElement("span");
    span.textContent = label;
    card.append(strong, span);
    stats.append(card);
  });
  progressLabel.textContent = `${done.size.toLocaleString("pt-BR")} concluído(s)`;
  updateRunButton();
}

function updateRunButton() {
  const done = new Set(activeDone());
  const count = activeCandidates().filter((name) => !done.has(name)).length;
  startRunButton.textContent = count ? `${FollowbackModes.info(selectedMode).actionLabel} — ${count} perfil(is)` : "Nenhum perfil pendente";
  startRunButton.disabled = !count || currentAutomation?.status === "running";
}

function renderAutomation(state) {
  currentAutomation = state || null;
  renderSettings(state?.status === "running" && state.settings ? state.settings : settingsFromInputs());
  const running = state?.status === "running";
  modeInput.disabled = running;
  followersInput.disabled = running;
  followingInput.disabled = running;
  document.getElementById("reset").disabled = running;
  updateCompareState();
  syncAutomationProgress(state);
  if (!state) {
    automationStatus.textContent = "Abra o Instagram em uma aba e deixe a conta logada antes de iniciar.";
    updateRunButton();
    return;
  }
  const done = Number(state.index || 0);
  const total = Number(state.queue?.length || 0);
  const confirmed = Number(state.confirmed || 0);
  const skipped = Number(state.skipped || 0);
  const mode = FollowbackModes.info(state.mode);
  if (state.status === "running") {
    automationStatus.textContent = `${mode.title}. Em andamento: ${done}/${total} verificados; ${confirmed} ${mode.confirmedLabel}, ${skipped} pulado(s). Acompanhe na aba da automação.`;
  } else if (state.status === "completed") {
    automationStatus.textContent = `${mode.title}. Concluído: ${confirmed} ${mode.confirmedLabel}, ${skipped} pulado(s) de ${total} candidatos.`;
  } else if (state.status === "stopped") {
    automationStatus.textContent = `Parou após ${done}/${total}: ${state.stopReason || "interrompido"}. Confirmados: ${confirmed}.`;
  } else {
    automationStatus.textContent = state.status === "cancelled" ? "Automação cancelada." : "Abra o Instagram em uma aba e deixe a conta logada antes de iniciar.";
  }
  updateRunButton();
}

function syncAutomationProgress(state) {
  if (!currentData || !Array.isArray(state?.log)) return;
  const merged = FollowbackModes.mergeProgress({ dataset: currentData, progressByMode }, state);
  if (JSON.stringify(merged) === JSON.stringify(progressByMode)) return;
  progressByMode = merged;
  chrome.storage.local.set({ progressByMode });
  showStats();
  renderUsers();
}

function renderUsers() {
  if (!currentData) return;
  const done = new Set(activeDone());
  const query = searchInput.value.trim().replace(/^@/, "").toLowerCase();
  const visible = activeCandidates().filter((name) => !query || name.includes(query));
  usersList.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = query ? "Nenhum usuário corresponde à busca." : "Não há candidatos nesta exportação.";
    usersList.append(empty);
    return;
  }

  for (const username of visible) {
    const row = document.createElement("li");
    row.className = `user-row${done.has(username) ? " done" : ""}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = done.has(username);
    checkbox.disabled = currentAutomation?.status === "running";
    checkbox.setAttribute("aria-label", `Marcar @${username} como concluído`);
    checkbox.addEventListener("change", async () => {
      const scrollTop = usersList.scrollTop;
      const updated = new Set(activeDone());
      checkbox.checked ? updated.add(username) : updated.delete(username);
      await saveProgress([...updated]);
      showStats();
      renderUsers();
      usersList.scrollTop = scrollTop;
    });

    const profile = document.createElement("a");
    profile.href = `https://www.instagram.com/${encodeURIComponent(username)}/`;
    profile.target = "_blank";
    profile.rel = "noopener noreferrer";
    profile.textContent = `@${username}`;
    profile.title = `Abrir perfil de @${username}`;

    const open = document.createElement("a");
    open.href = profile.href;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.className = "open-link";
    open.textContent = "Abrir ↗";
    open.setAttribute("aria-label", `Abrir perfil de @${username}`);

    row.append(checkbox, profile, open);
    usersList.append(row);
  }
}

async function loadSavedData() {
  const saved = await chrome.storage.local.get(["dataset", "progress", "progressByMode", "automationMode", "automation", "automationSettings"]);
  selectedMode = FollowbackModes.normalize(saved.automation?.status === "running" ? saved.automation.mode : saved.automationMode);
  progressByMode = FollowbackModes.mergeProgress(saved, saved.automation);
  renderSettings(saved.automationSettings);
  renderAutomation(saved.automation);
  if (!saved.dataset) return;
  currentData = saved.dataset;
  results.hidden = false;
  renderMode();
  syncAutomationProgress(saved.automation);
  showStats();
  renderUsers();
}

followersInput.addEventListener("change", updateCompareState);
followingInput.addEventListener("change", updateCompareState);
searchInput.addEventListener("input", renderUsers);
modeInput.addEventListener("change", async () => {
  if (currentAutomation?.status === "running") return;
  selectedMode = FollowbackModes.normalize(modeInput.value);
  searchInput.value = "";
  await chrome.storage.local.set({ automationMode: selectedMode });
  renderMode();
  showStats();
  renderUsers();
  setMessage("", false);
});
for (const input of [intervalInput, restEveryInput, restSecondsInput]) {
  input.addEventListener("change", () => { saveSettings(); });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.progressByMode) progressByMode = changes.progressByMode.newValue || { unfollow: [], remove_follower: [] };
  if (changes.automation) renderAutomation(changes.automation.newValue);
  if (currentData) { showStats(); renderUsers(); }
});

compareButton.addEventListener("click", async () => {
  if (currentAutomation?.status === "running") return;
  setMessage("Lendo os arquivos…", false);
  try {
    const [followersJson, followingJson] = await Promise.all([
      readFollowersFiles(followersInput.files),
      readJson(followingInput.files[0]),
    ]);
    const { followers, following } = extractRows(followersJson, followingJson);
    const lists = compareLists(followers, following);
    currentData = {
      followersCount: followers.size,
      followingCount: following.size,
      ...lists,
      importedAt: new Date().toISOString(),
    };
    progressByMode = { unfollow: [], remove_follower: [] };
    await chrome.storage.local.set({ dataset: currentData, progress: [], progressByMode });
    results.hidden = false;
    renderMode();
    showStats();
    renderUsers();
    setMessage(`Comparação concluída: ${activeCandidates().length.toLocaleString("pt-BR")} perfil(is) na opção selecionada.`, false);
    updateRunButton();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Não consegui ler os arquivos.");
  }
});

startRunButton.addEventListener("click", async () => {
  const done = new Set(activeDone());
  const pending = activeCandidates().filter((name) => !done.has(name));
  if (!pending.length) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/www\.instagram\.com\//i.test(tab.url || "")) {
    automationStatus.textContent = "Abra uma aba do Instagram logada, clique na extensão e tente novamente.";
    return;
  }
  startRunButton.disabled = true;
  automationStatus.textContent = "Preparando a fila…";
  try {
    const settings = await saveSettings();
    const response = await chrome.runtime.sendMessage({
      type: "startAutomation",
      tabId: tab.id,
      mode: selectedMode,
      settings,
    });
    if (!response?.ok) {
      automationStatus.textContent = response?.error || "Não consegui iniciar a automação.";
      updateRunButton();
      return;
    }
    renderAutomation(response.automation);
  } catch (error) {
    automationStatus.textContent = error instanceof Error ? error.message : "Falha ao iniciar.";
    updateRunButton();
  }
});

document.getElementById("copy").addEventListener("click", async () => {
  if (!currentData) return;
  const done = new Set(activeDone());
  const pending = activeCandidates().filter((name) => !done.has(name)).map((name) => `@${name}`).join("\n");
  try {
    await navigator.clipboard.writeText(pending);
    setMessage("Lista pendente copiada.", false);
  } catch {
    setMessage("Não consegui acessar a área de transferência.");
  }
});

document.getElementById("csv").addEventListener("click", () => {
  if (!currentData) return;
  const done = new Set(activeDone());
  const rows = [["username", "profile_url", "status"], ...activeCandidates().map((name) => [
    name,
    `https://www.instagram.com/${name}/`,
    done.has(name) ? "concluido" : "pendente",
  ])];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = FollowbackModes.info(selectedMode).csv;
  link.click();
  URL.revokeObjectURL(url);
});

document.getElementById("reset").addEventListener("click", async () => {
  if (!currentData) return;
  if (currentAutomation?.status === "running") return;
  await saveProgress([]);
  showStats();
  renderUsers();
  setMessage("Progresso da opção selecionada zerado.", false);
});

loadSavedData();
