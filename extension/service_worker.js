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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "startAutomation") return;
  startAutomation(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Falha ao iniciar." }));
  return true;
});

async function startAutomation(message) {
  const saved = await chrome.storage.local.get(["dataset", "progress", "automation", "automationSettings"]);
  if (saved.automation?.status === "running") {
    return { ok: false, error: "Já existe uma automação em andamento." };
  }
  const allCandidates = saved.dataset?.candidates;
  if (!Array.isArray(allCandidates) || allCandidates.length === 0) {
    return { ok: false, error: "Importe e compare os dois arquivos primeiro." };
  }
  const done = new Set(Array.isArray(saved.progress) ? saved.progress : []);
  const candidates = allCandidates.filter((username) => !done.has(username));
  if (!candidates.length) return { ok: false, error: "Todos os candidatos já estão marcados como concluídos." };
  const tab = await chrome.tabs.get(message.tabId).catch(() => null);
  if (!tab?.id || !isInstagramUrl(tab.url)) {
    return { ok: false, error: "Abra uma aba do Instagram antes de iniciar." };
  }

  const automation = {
    status: "running",
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
  await chrome.storage.local.set({ automation });
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
