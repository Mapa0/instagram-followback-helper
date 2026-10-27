const statusEl = document.getElementById("status");
const processedEl = document.getElementById("processed");
const confirmedEl = document.getElementById("confirmed");
const totalEl = document.getElementById("total");
const progressEl = document.getElementById("progress");
const logEl = document.getElementById("log");
const stopButton = document.getElementById("stop");
let thisTabId = null;
let loopActive = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getAutomation() {
  const { automation } = await chrome.storage.local.get("automation");
  return automation;
}

async function setAutomation(automation) {
  await chrome.storage.local.set({ automation });
  render(automation);
}

function friendlyStatus(state) {
  if (!state) return "Não encontrei uma fila de execução.";
  if (state.status === "running") {
    const current = state.currentUsername ? `Perfil atual: @${state.currentUsername}.` : "Preparando próximo perfil.";
    return `Em andamento. ${current} Perfis inesperados são pulados; a fila para somente em captcha, bloqueio ou pedido de login.`;
  }
  if (state.status === "completed") return `Fila concluída: ${state.confirmed || 0} unfollow(s) confirmado(s), ${state.skipped || 0} perfil(is) pulado(s).`;
  if (state.status === "stopped") return `Fila parada: ${state.stopReason || "interrompida"}`;
  if (state.status === "cancelled") return "Fila cancelada.";
  return "Preparando…";
}

function render(state) {
  if (!state) return;
  const total = state.queue?.length || 0;
  const processed = state.index || 0;
  processedEl.textContent = processed.toLocaleString("pt-BR");
  confirmedEl.textContent = (state.confirmed || 0).toLocaleString("pt-BR");
  totalEl.textContent = total.toLocaleString("pt-BR");
  progressEl.max = Math.max(total, 1);
  progressEl.value = Math.min(processed, total);
  statusEl.textContent = friendlyStatus(state);
  stopButton.disabled = state.status !== "running";
  logEl.replaceChildren();
  for (const entry of [...(state.log || [])].slice(-30).reverse()) {
    const li = document.createElement("li");
    li.textContent = `@${entry.username}: ${entry.detail || statusLabel(entry.status)}`;
    li.className = entry.status === "unfollowed" ? "ok" : ["already_not_following", "skipped"].includes(entry.status) ? "skip" : "failed";
    logEl.append(li);
  }
}

function statusLabel(status) {
  const labels = {
    unfollowed: "deixou de seguir",
    already_not_following: "já não seguia; pulado",
    skipped: "perfil pulado; próximo da fila",
    blocked: "captcha/bloqueio detectado",
  };
  return labels[status] || status;
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

document.getElementById("download").addEventListener("click", async () => {
  const state = await getAutomation();
  const rows = [["username", "status", "detail", "timestamp"], ...(state?.log || []).map((item) => [item.username, item.status, item.detail, item.timestamp])];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "instagram-unfollow-log.csv";
  link.click();
  URL.revokeObjectURL(url);
});

stopButton.addEventListener("click", async () => {
  const state = await getAutomation();
  if (!state || state.status !== "running") return;
  state.stopRequested = true;
  state.stopReason = "Parada solicitada pelo usuário.";
  await setAutomation(state);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.automation) {
    render(changes.automation.newValue);
    maybeStartRun();
  }
});

function performUnfollow(username) {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => (value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const visible = (element) => {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const labelOf = (element) => normalize(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title"));
  const profileControls = () => {
    const root = document.querySelector("main header") || document.querySelector("main") || document.body;
    return [...root.querySelectorAll("button, [role='button']")].filter(visible);
  };
  const stateOf = () => {
    const labels = profileControls().map(labelOf);
    if (labels.some((label) => label === "seguindo" || label === "following")) return "following";
    if (labels.some((label) => ["seguir", "follow", "seguir de volta", "follow back"].includes(label))) return "not_following";
    return "unknown";
  };
  const blockedReason = () => {
    const url = location.href.toLowerCase();
    const body = (document.body?.innerText || "").toLowerCase();
    if (url.includes("/challenge/") || url.includes("/accounts/login")) return "Instagram pediu login ou apresentou um desafio.";
    const phrases = [
      "captcha", "não é um robô", "nao e um robo", "not a robot", "try again later",
      "tente novamente mais tarde", "ação bloqueada", "acao bloqueada", "action blocked",
      "confirme que é você", "confirm it's you", "verifique que é você", "verify it's you",
      "confirme sua identidade", "confirm your identity", "complete o desafio de segurança",
    ];
    const found = phrases.find((phrase) => body.includes(phrase));
    return found ? `Verificação/bloqueio detectado (${found}).` : "";
  };
  const pageUnavailableReason = () => {
    const body = normalize(document.body?.innerText);
    const phrases = [
      "esta página não está disponível", "esta pagina nao esta disponivel",
      "o link em que você clicou pode não estar funcionando", "the link you clicked may be broken",
      "the link you followed may be broken", "sorry, this page isn't available",
      "this page isn't available right now",
    ];
    return phrases.some((phrase) => body.includes(phrase)) ? "Página indisponível; perfil pulado automaticamente." : "";
  };
  const isConfirmation = (label) => ["deixar de seguir", "unfollow"].some((phrase) => label === phrase || label.startsWith(`${phrase} @`));

  return (async () => {
    const expectedPath = `/${username}`.toLowerCase();
    const actualPath = location.pathname.replace(/\/+$/, "").toLowerCase();
    let blocked = blockedReason();
    if (blocked) return { status: "blocked", detail: blocked };
    const unavailable = pageUnavailableReason();
    if (unavailable) return { status: "skipped", detail: unavailable };
    if (location.hostname !== "www.instagram.com" || actualPath !== expectedPath) {
      return { status: "skipped", detail: "A página aberta não corresponde ao perfil da fila." };
    }

    let currentState = "unknown";
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const unavailable = pageUnavailableReason();
      if (unavailable) return { status: "skipped", detail: unavailable };
      currentState = stateOf();
      if (currentState !== "unknown") break;
      await pause(500);
    }
    if (currentState === "not_following") return { status: "already_not_following", detail: "O botão já indica que não segue este perfil." };
    if (currentState !== "following") return { status: "skipped", detail: "Não encontrei um botão Seguindo/Following inequívoco." };

    const followButton = profileControls().find((element) => ["seguindo", "following"].includes(labelOf(element)));
    if (!followButton) return { status: "skipped", detail: "O botão de seguir mudou antes do clique." };
    followButton.click();

    let confirmButton = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      blocked = blockedReason();
      if (blocked) return { status: "blocked", detail: blocked };
      confirmButton = [...document.querySelectorAll("button, [role='button']")]
        .filter(visible)
        .find((element) => isConfirmation(labelOf(element)));
      if (confirmButton) break;
      await pause(300);
    }
    if (!confirmButton) return { status: "skipped", detail: "Não apareceu a confirmação inequívoca Deixar de seguir." };
    confirmButton.click();

    for (let attempt = 0; attempt < 30; attempt += 1) {
      blocked = blockedReason();
      if (blocked) return { status: "blocked", detail: blocked };
      currentState = stateOf();
      if (currentState === "not_following") return { status: "unfollowed", detail: "Unfollow confirmado pela interface." };
      await pause(500);
    }
    return { status: "skipped", detail: "A interface não confirmou a mudança; o próximo perfil será tentado." };
  })();
}

async function waitForPage(tabId, username) {
  const expected = `https://www.instagram.com/${username}/`;
  const tab = await chrome.tabs.get(tabId);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const listener = (updatedId, changeInfo, updatedTab) => {
      if (updatedId === tabId && changeInfo.status === "complete") finish(null, updatedTab);
    };
    const timer = setTimeout(() => finish(new Error("O perfil demorou demais para abrir.")), 45000);
    chrome.tabs.onUpdated.addListener(listener);
    const sameProfile = (tab.url || "").replace(/\/+$/, "").toLowerCase() === expected.replace(/\/+$/, "").toLowerCase();
    const navigation = sameProfile ? chrome.tabs.reload(tabId) : chrome.tabs.update(tabId, { url: expected });
    navigation.catch((error) => finish(error));
  });
}

async function runQueue() {
  if (loopActive) return;
  loopActive = true;
  try {
    let state = await getAutomation();
    if (!state || state.status !== "running" || state.runnerTabId !== thisTabId) return;
    for (;;) {
      state = await getAutomation();
      if (state.status !== "running") break;
      if (state.stopRequested) {
        state.status = "cancelled";
        state.stopReason = state.stopReason || "Parada solicitada.";
        await setAutomation(state);
        break;
      }
      if (state.index >= state.queue.length) {
        state.status = "completed";
        state.currentUsername = "";
        await setAutomation(state);
        break;
      }

      const username = state.queue[state.index];
      state.currentUsername = username;
      await setAutomation(state);
      let outcome;
      try {
        await waitForPage(state.tabId, username);
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId: state.tabId },
          func: performUnfollow,
          args: [username],
        });
        outcome = injection?.result || { status: "skipped", detail: "Sem resultado deste perfil." };
      } catch (error) {
        outcome = { status: "skipped", detail: error instanceof Error ? error.message : "Falha ao abrir o perfil." };
      }

      state = await getAutomation();
      state.log.push({ username, status: outcome.status, detail: outcome.detail || "", timestamp: new Date().toISOString() });
      state.index += 1;
      state.currentUsername = "";
      if (outcome.status === "unfollowed") state.confirmed += 1;
      if (outcome.status === "already_not_following") state.alreadyNotFollowing += 1;
      if (outcome.status === "skipped") state.skipped = (state.skipped || 0) + 1;
      if (outcome.status === "blocked") {
        state.status = "stopped";
        state.stopReason = outcome.detail || statusLabel(outcome.status);
        await setAutomation(state);
        break;
      }
      await setAutomation(state);

      const pageUnavailable = outcome.status === "skipped" && (outcome.detail || "").startsWith("Página indisponível;");
      if (state.index < state.queue.length && !pageUnavailable) {
        const settings = state.settings || { intervalSeconds: 15, restEvery: 25, restSeconds: 120 };
        const shouldRest = settings.restEvery > 0 && settings.restSeconds > 0 && state.index % settings.restEvery === 0;
        const delayMs = (shouldRest ? settings.restSeconds : settings.intervalSeconds) * 1000;
        const cutoff = Date.now() + delayMs;
        while (Date.now() < cutoff) {
          await wait(Math.min(1000, cutoff - Date.now()));
          state = await getAutomation();
          if (state.stopRequested || state.status !== "running") break;
        }
      }
    }
  } finally {
    loopActive = false;
  }
}

async function initialize() {
  const tab = await chrome.tabs.getCurrent();
  thisTabId = tab?.id;
  const state = await getAutomation();
  render(state);
  maybeStartRun();
}

async function maybeStartRun() {
  if (thisTabId == null || loopActive) return;
  const state = await getAutomation();
  if (state?.status === "running" && state.runnerTabId === thisTabId) runQueue();
}

initialize();
