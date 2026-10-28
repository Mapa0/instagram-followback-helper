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
  const saved = await chrome.storage.local.get(["dataset", "progress", "progressByMode"]);
  const progressByMode = FollowbackModes.mergeProgress(saved, automation);
  await chrome.storage.local.set({ automation, progressByMode });
  render(automation);
}

function friendlyStatus(state) {
  if (!state) return "Não encontrei uma fila de execução.";
  if (state.status === "running") {
    const current = state.currentUsername ? `Perfil atual: @${state.currentUsername}.` : "Preparando próximo perfil.";
    return `Em andamento. ${current} Perfis inesperados são pulados; a fila para somente em captcha, bloqueio ou pedido de login.`;
  }
  if (state.status === "completed") return `Fila concluída: ${state.confirmed || 0} ${FollowbackModes.info(state.mode).confirmedLabel}, ${state.skipped || 0} perfil(is) pulado(s).`;
  if (state.status === "stopped") return `Fila parada: ${state.stopReason || "interrompida"}`;
  if (state.status === "cancelled") return "Fila cancelada.";
  return "Preparando…";
}

function render(state) {
  if (!state) return;
  const mode = FollowbackModes.info(state.mode);
  document.getElementById("run-title").textContent = mode.title;
  document.getElementById("confirmed-label").textContent = mode.confirmedLabel;
  document.title = mode.title;
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
    li.className = ["unfollowed", "follower_removed"].includes(entry.status) ? "ok" : ["already_not_following", "now_following", "skipped"].includes(entry.status) ? "skip" : "failed";
    logEl.append(li);
  }
}

function statusLabel(status) {
  const labels = {
    unfollowed: "deixou de seguir",
    already_not_following: "já não seguia; pulado",
    follower_removed: "seguidor removido",
    now_following: "você segue este perfil agora; preservado",
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
  link.download = FollowbackModes.info(state?.mode).logCsv;
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

// This function is serialized into Instagram; keep every DOM helper inside it.
function performProfileAction(username, mode = "unfollow") {
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
    if (labels.some((label) => ["solicitado", "solicitada", "requested"].includes(label))) return "requested";
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
    if (!["unfollow", "remove_follower"].includes(mode)) return { status: "skipped", detail: "Opção de automação inválida; nenhuma ação foi feita." };
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
      blocked = blockedReason();
      if (blocked) return { status: "blocked", detail: blocked };
      const unavailable = pageUnavailableReason();
      if (unavailable) return { status: "skipped", detail: unavailable };
      currentState = stateOf();
      if (currentState !== "unknown") break;
      await pause(500);
    }
    if (mode === "remove_follower") {
      if (["following", "requested"].includes(currentState)) return { status: "now_following", detail: "Você segue este perfil ou solicitou segui-lo agora; seguidor preservado." };
      if (currentState !== "not_following") return { status: "skipped", detail: "Não consegui confirmar que você não segue este perfil; seguidor preservado." };
      return { status: "ready_for_removal", detail: "Você não segue este perfil; procurar na sua lista de seguidores." };
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

// Run on the account owner's profile, after checking the candidate's live follow state.
function performFollowerRemoval(username, accountUsername) {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => (value || "").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = (element) => {
    if (!element?.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const labelOf = (element) => normalize(element.innerText || element.getAttribute("aria-label"));
  const buttons = (root) => [...root.querySelectorAll("button, [role='button']")].filter(visible);
  const dialogs = () => [...document.querySelectorAll("[role='dialog'], [role='alertdialog'], [aria-modal='true'], dialog")].filter(visible);
  const profileName = (link) => {
    try {
      const url = new URL(link.href, location.href);
      const parts = url.pathname.split("/").filter(Boolean);
      return url.hostname === "www.instagram.com" && parts.length === 1 && /^[a-z0-9._]{1,30}$/i.test(parts[0]) ? parts[0].toLowerCase() : "";
    } catch { return ""; }
  };
  const targetLinks = (root) => [...root.querySelectorAll("a[href]")].filter((link) => visible(link) && profileName(link) === username);
  const accountMatches = () => {
    const path = location.pathname.replace(/\/+$/, "").toLowerCase();
    if (location.hostname !== "www.instagram.com" || ![`/${accountUsername}`, `/${accountUsername}/followers`].includes(path)) return false;
    const main = document.querySelector("main, [role='main']");
    return main && [...main.querySelectorAll("a, button, [role='button']")].filter(visible)
      .some((element) => ["editar perfil", "edit profile"].includes(labelOf(element)));
  };
  const blockedReason = () => {
    const body = normalize(document.body?.innerText);
    if (/\/(challenge|checkpoint)\/|\/accounts\/login/.test(location.href.toLowerCase())) return "Instagram pediu login ou apresentou um desafio.";
    const phrases = ["captcha", "não é um robô", "nao e um robo", "not a robot", "try again later", "tente novamente mais tarde", "ação bloqueada", "acao bloqueada", "action blocked", "confirme que é você", "confirm it's you", "verifique que é você", "verify it's you", "confirme sua identidade", "confirm your identity", "complete o desafio de segurança"];
    const found = phrases.find((phrase) => body.includes(phrase));
    return found ? `Verificação/bloqueio detectado (${found}).` : "";
  };
  const searchBox = (dialog) => [...dialog.querySelectorAll("input")].filter(visible).find((input) => {
    const label = normalize(`${input.getAttribute("placeholder") || ""} ${input.getAttribute("aria-label") || ""}`);
    return input.type === "search" || /pesquisar|buscar|search/.test(label);
  });
  const headingElements = () => [...document.querySelectorAll("h1, h2, h3, [role='heading'], span, div")].filter(visible);
  const followerDialog = () => {
    const semantic = dialogs().find((dialog) => searchBox(dialog) && (
      [...dialog.querySelectorAll("h1, h2, h3, [role='heading'], span, div")].some((heading) => ["seguidores", "followers"].includes(labelOf(heading))) ||
      /^(seguidores|followers)\b/.test(labelOf(dialog))));
    if (semantic) return semantic;
    // Some layouts render a floating panel made entirely of generic divs/spans.
    for (const heading of headingElements().filter((element) => ["seguidores", "followers"].includes(labelOf(element)))) {
      for (let panel = heading.parentElement; panel && panel !== document.body && panel !== document.documentElement; panel = panel.parentElement) {
        if (visible(panel) && searchBox(panel)) return panel;
      }
    }
    return null;
  };
  const followersControl = () => {
    const main = document.querySelector("main, [role='main']");
    if (!main) return null;
    const link = [...main.querySelectorAll("a[href]")].filter(visible).find((element) => {
      try {
        const url = new URL(element.href, location.href);
        return url.hostname === "www.instagram.com" && url.pathname.replace(/\/+$/, "").toLowerCase() === `/${accountUsername}/followers`;
      } catch { return false; }
    });
    if (link) return link;
    const isLabel = (element) => /^(?:[\d.,\s]+(?:mil|mi|[km])?\s*)?(?:seguidores?|followers?)$/.test(labelOf(element));
    const candidates = [...main.querySelectorAll("a, button, [role='button'], [tabindex], span, div")].filter((element) => visible(element) && isLabel(element));
    const label = candidates.find((element) => !candidates.some((child) => child !== element && element.contains(child)));
    if (!label) return null;
    const control = label.closest("a, button, [role='button'], [tabindex]");
    // Clicks on a plain span bubble to its parent and React's delegated handler.
    return control && main.contains(control) && isLabel(control) ? control : label;
  };
  const removalConfirmation = (list) => {
    const isTitle = (element) => /remover.*seguidor|remove.*follower/.test(labelOf(element));
    const semantic = dialogs().reverse().find((dialog) => dialog !== list && !dialog.contains(list) && !searchBox(dialog) && isTitle(dialog));
    if (semantic) return semantic;
    for (const heading of headingElements().filter((element) => /^(?:remover.*seguidor|remove.*follower)\??$/.test(labelOf(element)))) {
      for (let panel = heading.parentElement; panel && panel !== document.body && panel !== document.documentElement; panel = panel.parentElement) {
        if (panel === list || panel.contains(list) || searchBox(panel)) break;
        const remove = buttons(panel).filter((button) => ["remover", "remove"].includes(labelOf(button)));
        if (visible(panel) && remove.length === 1) return panel;
      }
    }
    return null;
  };
  const findTargetRow = (dialog, actionLabels = ["remover", "remove"]) => {
    for (const link of targetLinks(dialog)) {
      let row = link.parentElement;
      while (row && row !== dialog) {
        const names = new Set([...row.querySelectorAll("a[href]")].map(profileName).filter(Boolean));
        // Never walk up to a container with another user's Remove button.
        if (names.size !== 1 || !names.has(username)) break;
        const remove = buttons(row).filter((button) => actionLabels.includes(labelOf(button)));
        if (remove.length === 1) return { row, remove: remove[0] };
        row = row.parentElement;
      }
    }
    return null;
  };
  const preservesFollowing = (row) => buttons(row).some((button) => ["seguindo", "following", "solicitado", "solicitada", "requested"].includes(labelOf(button)));
  const removalNotices = () => [...document.querySelectorAll("[role='status'], [role='alert'], [aria-live]")]
    .filter((element) => visible(element) && /\bseguidor(?:a)? removid[oa]\b|\bfollower removed\b/.test(labelOf(element)));
  const skipped = (detail) => ({ status: "skipped", detail });
  const guard = () => {
    const blocked = blockedReason();
    if (blocked) return { status: "blocked", detail: blocked };
    return accountMatches() ? null : skipped("Não consegui confirmar seu próprio perfil; nenhuma remoção foi feita.");
  };

  return (async () => {
    if (!/^[a-z0-9._]{1,30}$/.test(username) || !/^[a-z0-9._]{1,30}$/.test(accountUsername) || username === accountUsername) return skipped("Conta ou seguidor inválido para remoção.");
    let failure;
    // Allow the owner's profile controls to finish rendering after navigation.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      failure = guard();
      if (!failure || failure.status === "blocked") break;
      await pause(500);
    }
    if (failure) return failure;

    let list = followerDialog();
    if (!list) {
      let opener;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        failure = guard();
        if (failure) return failure;
        list = followerDialog();
        if (list) break;
        opener = followersControl();
        if (opener) break;
        await pause(500);
      }
      if (!list) {
        if (!opener) return skipped("Não encontrei o controle Seguidores no seu próprio perfil.");
        opener.click();
      }
    }
    let search;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      failure = guard();
      if (failure) return failure;
      list = followerDialog();
      search = list && searchBox(list);
      if (search) break;
      await pause(500);
    }
    if (!search) return skipped("Não encontrei a busca na sua lista de seguidores.");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) return skipped("Não consegui preencher a busca de seguidores.");

    // Search results may replace the panel or input. Never keep using detached nodes.
    const refreshSearch = () => {
      const panel = followerDialog();
      const input = panel && searchBox(panel);
      if (!input) return null;
      list = panel;
      search = input;
      return { list, search };
    };
    const readSearch = async () => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const failure = guard();
        if (failure) return { outcome: failure };
        const current = refreshSearch();
        if (current) return current;
        await pause(200);
      }
      return { outcome: skipped("O modal de seguidores foi fechado ou não voltou a ficar disponível; nenhuma remoção foi feita.") };
    };
    const loading = () => [...list.querySelectorAll("[role='progressbar'], [aria-busy='true']")].some(visible);
    const fillSearch = async (query) => {
      for (let retry = 0; retry < 3; retry += 1) {
        const current = await readSearch();
        if (current.outcome) return current;
        if (normalize(current.search.value) === query) return { ok: true };
        // Retry as incremental input if the app rejected or reset a whole-value update.
        const values = retry === 0 ? [query] : ["", ...Array.from(query, (_, index) => query.slice(0, index + 1))];
        for (const value of values) {
          const live = await readSearch();
          if (live.outcome) return live;
          live.search.focus();
          setter.call(live.search, value);
          live.search.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            inputType: value ? "insertText" : "deleteContentBackward",
            data: value ? (retry === 0 ? value : value.slice(-1)) : null,
          }));
          const updated = refreshSearch();
          if (updated && normalize(updated.search.value) === value) {
            updated.search.dispatchEvent(new KeyboardEvent("keyup", { key: value.slice(-1) || "Backspace", bubbles: true }));
          }
          if (retry > 0) await pause(60);
        }
        const updated = refreshSearch();
        if (updated) updated.search.dispatchEvent(new Event("change", { bubbles: true }));
        await pause(300);
        const settled = refreshSearch();
        if (settled && normalize(settled.search.value) === query) return { ok: true };
      }
      return { ok: false };
    };

    // A broader query only locates candidates; findTargetRow always checks the FULL username.
    const stem = username.replace(/\.[^.]+$/, "");
    const plainStem = stem.replace(/^[\d_]+/, "").replace(/[._]?\d+$/, "");
    const word = username.split(/[._\d]+/).sort((a, b) => b.length - a.length)[0];
    const queries = [...new Set([username, stem, plainStem, word].filter((query) => query === username || query?.length >= 3))];

    let target;
    let activeQuery = "";
    let stableQuery = false;
    for (const query of queries) {
      const filled = await fillSearch(query);
      if (filled.outcome) return filled.outcome;
      if (!filled.ok) continue;
      stableQuery = true;
      activeQuery = query;
      await pause(750);
      let repairs = 0;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        failure = guard();
        if (failure) return failure;
        const current = refreshSearch();
        if (!current || normalize(current.search.value) !== query) {
          if (repairs >= 2) break;
          repairs += 1;
          const restored = await fillSearch(query);
          if (restored.outcome) return restored.outcome;
          if (!restored.ok) break;
          await pause(750);
          continue;
        }
        if (!loading()) target = findTargetRow(list);
        if (target) break;
        const empty = /nenhum(?:a)? (?:resultado|usuário|usuario|conta)|não (?:foram encontrados|encontramos)|no (?:results|users|accounts)(?: found)?/.test(labelOf(list));
        if (empty && !loading() && attempt >= 2) break;
        await pause(400);
      }
      if (target) break;
    }
    if (!target) return skipped(stableQuery
      ? `Não encontrei o @ exato com botão Remover após tentar as buscas ${queries.join(", ")}; nenhuma ação foi feita.`
      : "O Instagram não manteve o texto no campo de busca após as tentativas; nenhuma remoção foi feita.");
    const beforeRemoval = refreshSearch();
    if (!beforeRemoval || normalize(beforeRemoval.search.value) !== activeQuery) return skipped("O texto da busca mudou antes da remoção; seguidor preservado.");
    target = findTargetRow(list);
    if (!target) return skipped("O @ exato deixou de aparecer antes da remoção; nenhuma ação foi feita.");
    if (preservesFollowing(target.row)) return { status: "now_following", detail: "A lista indica que você segue ou solicitou seguir este perfil; seguidor preservado." };
    failure = guard();
    if (failure) return failure;
    target.remove.click();

    let confirmation;
    let confirm;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      failure = guard();
      if (failure) return failure;
      refreshSearch();
      confirmation = removalConfirmation(list);
      confirm = confirmation && buttons(confirmation).find((button) => ["remover", "remove"].includes(labelOf(button)));
      if (confirm) break;
      await pause(300);
    }
    if (!confirm) return skipped("Não apareceu a confirmação de remoção do seguidor selecionado.");
    // Recheck the exact row and the owner's account immediately before confirmation.
    const beforeConfirmation = refreshSearch();
    const currentTarget = findTargetRow(list);
    if (!beforeConfirmation || !currentTarget || normalize(search.value) !== activeQuery) return skipped("O resultado da busca mudou antes da confirmação; seguidor preservado.");
    if (preservesFollowing(currentTarget.row)) return { status: "now_following", detail: "Você passou a seguir ou solicitar este perfil; seguidor preservado." };
    failure = guard();
    if (failure) return failure;
    const previousNoticeTexts = new Set(removalNotices().map(labelOf));
    confirm.click();

    const verificationGuard = () => {
      const failure = guard();
      return failure?.status === "skipped"
        ? skipped("A página mudou após a confirmação; não consegui verificar a remoção.") : failure;
    };
    const completionEvidence = () => {
      // React may replace a still-open confirmation; do not rely on the old node.
      if (removalConfirmation(followerDialog() || list)) return "";
      if (removalNotices().some((notice) => !previousNoticeTexts.has(labelOf(notice)))) {
        return "O Instagram exibiu um novo aviso de seguidor removido.";
      }
      const current = refreshSearch();
      if (!current || normalize(current.search.value) !== activeQuery || loading()) return "";
      if (targetLinks(list).length === 0) return "O @ deixou de aparecer na busca da sua lista de seguidores.";
      if (findTargetRow(list, ["removido", "removida", "removed"])) {
        return "A linha do @ passou a indicar Removido/Removed.";
      }
      // Some layouts retain the profile link after removing only its Remove control.
      if (visible(currentTarget.row) && list.contains(currentTarget.row) && targetLinks(currentTarget.row).length
          && (!currentTarget.remove.isConnected || !visible(currentTarget.remove)) && !findTargetRow(list)
          && !buttons(currentTarget.row).some((button) => button.disabled || button.getAttribute("aria-disabled") === "true")) {
        return "O controle Remover desapareceu da linha do @ após a confirmação.";
      }
      return "";
    };
    const observeCompletion = async (attempts) => {
      let lastEvidence = "";
      let stableChecks = 0;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const failure = verificationGuard();
        if (failure) return failure;
        const evidence = completionEvidence();
        stableChecks = evidence && evidence === lastEvidence ? stableChecks + 1 : evidence ? 1 : 0;
        lastEvidence = evidence;
        if (stableChecks >= 2) return { status: "follower_removed", detail: `Remoção confirmada: ${evidence}` };
        await pause(200);
      }
      return null;
    };

    // Most successful actions settle immediately; avoid the old 15-second wait.
    const immediate = await observeCompletion(6);
    if (immediate) return immediate;

    // Refresh only the search once if its results are stale or the input was reset.
    // No Remove or confirmation button is clicked a second time.
    for (let attempt = 0; attempt < 12 && removalConfirmation(followerDialog() || list); attempt += 1) {
      failure = verificationGuard();
      if (failure) return failure;
      await pause(200);
    }
    failure = verificationGuard();
    if (failure) return failure;
    if (removalConfirmation(followerDialog() || list)) return skipped("A confirmação de remoção continua aberta; não repeti a ação.");
    if (!refreshSearch()) {
      const opener = followersControl();
      if (!opener) return skipped("A lista fechou após a confirmação e não consegui reabri-la para verificar a remoção.");
      opener.click();
      for (let attempt = 0; attempt < 12; attempt += 1) {
        failure = verificationGuard();
        if (failure) return failure;
        if (refreshSearch()) break;
        await pause(200);
      }
    }
    if (!refreshSearch()) return skipped("A busca de seguidores não voltou após a confirmação; não consegui verificar a remoção.");
    for (const query of ["", activeQuery]) {
      const filled = await fillSearch(query);
      if (filled.outcome) return filled.outcome;
      if (!filled.ok) return skipped("Não consegui atualizar a busca após a confirmação; não repeti a remoção.");
    }
    const refreshed = await observeCompletion(20);
    return refreshed || skipped("A busca atualizada ainda não confirmou a remoção; o próximo perfil será tentado sem repetir a ação.");
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
          func: performProfileAction,
          args: [username, FollowbackModes.normalize(state.mode)],
        });
        outcome = injection?.result || { status: "skipped", detail: "Sem resultado deste perfil." };
        if (outcome.status === "ready_for_removal") {
          // Read fresh state before navigating, so Stop can cancel before removal.
          const latest = await getAutomation();
          if (latest.stopRequested || latest.status !== "running") {
            outcome = { status: "skipped", detail: "Parada solicitada antes de remover o seguidor." };
          } else if (!/^[a-z0-9._]{1,30}$/.test(state.accountUsername || "")) {
            outcome = { status: "skipped", detail: "Sua conta não foi identificada. Reinicie a remoção a partir do seu próprio perfil." };
          } else {
            await waitForPage(state.tabId, state.accountUsername);
            const [removal] = await chrome.scripting.executeScript({
              target: { tabId: state.tabId },
              func: performFollowerRemoval,
              args: [username, state.accountUsername],
            });
            outcome = removal?.result || { status: "skipped", detail: "Sem confirmação na lista de seguidores." };
          }
        }
      } catch (error) {
        outcome = { status: "skipped", detail: error instanceof Error ? error.message : "Falha ao abrir o perfil." };
      }

      state = await getAutomation();
      state.log.push({ username, status: outcome.status, detail: outcome.detail || "", timestamp: new Date().toISOString() });
      state.index += 1;
      state.currentUsername = "";
      if (["unfollowed", "follower_removed"].includes(outcome.status)) state.confirmed += 1;
      if (outcome.status === "already_not_following") state.alreadyNotFollowing += 1;
      if (["skipped", "now_following"].includes(outcome.status)) state.skipped = (state.skipped || 0) + 1;
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
