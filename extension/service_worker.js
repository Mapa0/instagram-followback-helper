importScripts("modes.js");

function isInstagramUrl(url) {
  return typeof url === "string" && /^https:\/\/www\.instagram\.com\//i.test(url);
}

function normalizeSettings(raw = {}) {
  const read = (value, fallback, max) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(0, Math.round(number))) : fallback;
  };
  return {
    intervalSeconds: read(raw.intervalSeconds, 15, 300),
    restEvery: read(raw.restEvery, 25, 5000),
    restSeconds: read(raw.restSeconds, 120, 3600),
  };
}

// Serialized into the page: identify the signed-in account from visible UI only.
function detectAccountUsername() {
  const normalize = (text) => (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const profileName = (href) => {
    try {
      const url = new URL(href, location.href);
      const parts = url.pathname.split("/").filter(Boolean);
      return url.hostname === "www.instagram.com" && parts.length === 1 && /^[a-z0-9._]{1,30}$/i.test(parts[0]) ? parts[0].toLowerCase() : "";
    } catch { return ""; }
  };
  const links = [...document.querySelectorAll("a[href]")].filter(visible);
  const ownProfile = new Set(links.filter((link) => {
    const labels = [link.innerText, link.getAttribute("aria-label"), ...[...link.querySelectorAll("[aria-label]")].map((icon) => icon.getAttribute("aria-label"))];
    return labels.some((label) => ["perfil", "profile"].includes(normalize(label)));
  }).map((link) => profileName(link.href)).filter(Boolean));
  if (ownProfile.size === 1) return { username: [...ownProfile][0] };
  const main = document.querySelector("main");
  const hasEditProfile = main && [...main.querySelectorAll("a, button, [role='button']")].filter(visible)
    .some((element) => ["editar perfil", "edit profile"].includes(normalize(element.innerText)));
  const current = profileName(location.href);
  return { username: hasEditProfile ? current : "" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "startAutomation") return;
  startAutomation(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Falha ao iniciar." }));
  return true;
});

async function startAutomation(message) {
  const saved = await chrome.storage.local.get(["dataset", "progress", "progressByMode", "automation", "automationSettings"]);
  if (saved.automation?.status === "running") {
    return { ok: false, error: "Já existe uma automação em andamento." };
  }
  if (message.mode !== undefined && !["unfollow", "remove_follower"].includes(message.mode)) {
    return { ok: false, error: "Opção de automação inválida." };
  }
  const mode = FollowbackModes.normalize(message.mode);
  if (mode === "remove_follower" && !Array.isArray(saved.dataset?.removalCandidates)) {
    return { ok: false, error: "Compare novamente os mesmos arquivos da Meta para criar a lista de seguidores que você não segue." };
  }
  const allCandidates = FollowbackModes.candidates(saved.dataset, mode);
  if (!Array.isArray(allCandidates) || allCandidates.length === 0) {
    return { ok: false, error: "Importe e compare os dois arquivos primeiro." };
  }
  const progressByMode = FollowbackModes.mergeProgress(saved, saved.automation);
  const done = new Set(progressByMode[mode]);
  const candidates = allCandidates.filter((username) => !done.has(username));
  if (!candidates.length) return { ok: false, error: "Todos os candidatos já estão marcados como concluídos." };
  const tab = await chrome.tabs.get(message.tabId).catch(() => null);
  if (!tab?.id || !isInstagramUrl(tab.url)) {
    return { ok: false, error: "Abra uma aba do Instagram antes de iniciar." };
  }

  let accountUsername = "";
  if (mode === "remove_follower") {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: detectAccountUsername });
    accountUsername = result?.result?.username || "";
    if (!/^[a-z0-9._]{1,30}$/.test(accountUsername)) {
      return { ok: false, error: "Não consegui identificar sua conta. Abra seu próprio perfil do Instagram e inicie a remoção novamente." };
    }
  }

  const automation = {
    status: "running",
    mode,
    accountUsername,
    datasetId: saved.dataset.importedAt,
    settings: normalizeSettings(message.settings || saved.automationSettings),
    queue: candidates,
    index: 0,
    confirmed: 0,
    alreadyNotFollowing: 0,
    skipped: 0,
    log: [],
    tabId: tab.id,
    runnerTabId: null,
    stopRequested: false,
    startedAt: new Date().toISOString(),
    currentUsername: "",
    stopReason: "",
  };
  await chrome.storage.local.set({ automation, progressByMode, automationMode: mode });
  let runner;
  try {
    runner = await chrome.tabs.create({ url: chrome.runtime.getURL("runner.html"), active: true });
  } catch (error) {
    automation.status = "stopped";
    automation.stopReason = "Não consegui abrir a aba de progresso.";
    await chrome.storage.local.set({ automation });
    throw error;
  }
  automation.runnerTabId = runner.id;
  await chrome.storage.local.set({ automation });
  return { ok: true, automation };
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { automation } = await chrome.storage.local.get("automation");
  if (automation?.status === "running" && automation.runnerTabId === tabId) {
    automation.status = "stopped";
    automation.stopRequested = true;
    automation.stopReason = "A aba de progresso foi fechada.";
    await chrome.storage.local.set({ automation });
  }
});
