const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Optional development dependency. All requests are intercepted; no account is used.
let chromium;
try { ({ chromium } = require("playwright")); } catch {}
let browser;
before(async () => { if (chromium) browser = await chromium.launch({ channel: process.env.FOLLOWBACK_BROWSER_CHANNEL || "chrome", headless: true }); });
after(async () => { await browser?.close(); });
const runner = fs.readFileSync(path.join(__dirname, "../extension/runner.js"), "utf8");
const removalSource = runner.slice(runner.indexOf("function performFollowerRemoval("), runner.indexOf("async function waitForPage("));
const worker = fs.readFileSync(path.join(__dirname, "../extension/service_worker.js"), "utf8");
const accountSource = worker.slice(worker.indexOf("function detectAccountUsername("), worker.indexOf("chrome.runtime.onMessage"));
const browserTest = (name, fn) => test(name, { skip: !chromium && "Install Playwright to run DOM integration tests in Chrome" }, fn);

async function fixture(options = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const english = options.language === "en";
  const followersLabel = english ? "followers" : "seguidores";
  // Reproduce the supplied nested span; React delegates the click to its parent.
  const span = `<span id="followers" dir="auto"><span title="1.637"><span class="html-span">1.637</span></span> ${followersLabel}</span>`;
  const control = options.control === "span" || options.control === "delayedSpan"
    ? `<div id="followers-parent">${span}</div>`
    : options.control === "button" ? `<button id="followers">1.637 ${followersLabel}</button>`
      : options.control === "role" ? `<div id="followers" role="button" tabindex="0">${span.replace('id="followers"', '')}</div>`
        : options.control === "missing" ? "" : `<a id="followers" href="/owner/followers/">3 ${followersLabel}</a>`;
  await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body>
    <nav><a href="/owner/" aria-label="${options.language === "en" ? "Profile" : "Perfil"}">${options.language === "en" ? "Profile" : "Perfil"}</a></nav>
    <main><header><a href="/accounts/edit/">${options.language === "en" ? "Edit profile" : "Editar perfil"}</a>
    <div id="stats"><span>16 ${english ? "posts" : "publicações"}</span>${control}<span id="following-count">222 ${english ? "following" : "seguindo"}</span></div></header></main>
    </body></html>` }));
  await page.goto(`https://www.instagram.com/${options.wrongAccount ? "other_owner" : "owner"}/`);
  await page.evaluate((options) => {
    const timeout = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) => timeout(fn, Math.min(ms, 10), ...args);
    window.clicks = [];
    window.inputEvents = [];
    const english = options.language === "en";
    const username = options.username || "_wendell.98";
    let list = document.createElement("div");
    if (!options.genericModal) list.setAttribute("role", "dialog");
    list.innerHTML = `<div><${options.genericModal ? "span" : "h2"}>${english ? "Followers" : "Seguidores"}</${options.genericModal ? "span" : "h2"}></div><input type="text" placeholder="${english ? "Search" : "Pesquisar"}"><div class="rows"></div>`;
    let input = list.querySelector("input");
    const replaceList = () => {
      const replacement = list.cloneNode(false);
      while (list.firstChild) replacement.append(list.firstChild);
      list.replaceWith(replacement);
      list = replacement;
    };
    const names = [username, `${username}.extra`, "other_follower"];
    for (const name of names) {
      const row = document.createElement("div");
      row.className = "follower-row";
      row.dataset.username = name;
      row.innerHTML = `<div><a href="/${name}/">avatar</a></div><div><a href="/${name}/">${name}</a></div><button class="relationship">${options.following && name === username ? "Following" : "Follow"}</button>`;
      if (!(options.missingTargetRemove && name === username)) {
        const remove = document.createElement("button");
        remove.innerText = english ? "Remove" : "Remover";
        remove.onclick = () => {
          window.clicks.push(`row:${name}`);
          const confirm = document.createElement("div");
          if (!options.genericModal) confirm.setAttribute("role", "dialog");
          confirm.innerHTML = `<h2>${options.wrongDialog ? "Remover foto?" : english ? "Remove follower?" : "Remover seguidor?"}</h2><p>${name}</p><button>${english ? "Remove" : "Remover"}</button>`;
          confirm.querySelector("button").onclick = () => {
            window.clicks.push(`confirm:${name}`);
            confirm.remove();
            if (!options.noEffect) row.remove();
            if (options.replaceListAfterRemoval) replaceList();
            if (options.closeList) list.remove();
            if (options.blockAfterConfirm) document.body.append(" Tente novamente mais tarde");
          };
          document.body.append(confirm);
          if (options.followDuringConfirmation) row.querySelector(".relationship").innerText = "Following";
          if (options.wrongAccountDuringConfirmation) history.replaceState(null, "", "/other_owner/");
          if (options.blockOnDialog) document.body.append(" CAPTCHA");
          if (options.changeSearchDuringConfirmation) input.value = "other_follower";
        };
        row.append(remove);
      }
      list.querySelector(".rows").append(row);
    }
    let firstSearch = true;
    document.addEventListener("input", (event) => {
      if (event.target !== input) return;
      window.inputEvents.push(input.value);
      if (options.resetSearchOnce && firstSearch) input.value = "";
      if (options.truncateFullQuery && input.value === username) input.value = username.replace(/\.[^.]+$/, "");
      if (options.replaceInputOnSearch) {
        const replacement = input.cloneNode(true);
        replacement.value = input.value;
        input.replaceWith(replacement);
        input = replacement;
      }
      for (const row of list.querySelectorAll(".follower-row")) {
        const exactQueryMiss = options.suffixSearchMiss && input.value === username;
        row.style.display = !exactQueryMiss && row.dataset.username.includes(input.value) ? "" : "none";
      }
      if (options.replaceListOnSearch) replaceList();
      if (options.missingTarget) list.querySelector(`[data-username='${username}']`)?.remove();
      firstSearch = false;
    });
    const openFollowers = (event) => {
      event.preventDefault();
      window.clicks.push("followers-list");
      if (!options.unchangedUrl) history.replaceState(null, "", "/owner/followers/");
      document.body.append(list);
    };
    const control = document.getElementById("followers-parent") || document.getElementById("followers");
    if (control) control.addEventListener("click", openFollowers);
    if (options.control === "delayedSpan") {
      control.remove();
      window.showFollowersControl = () => document.getElementById("stats").append(control);
    }
    if (options.preopened) document.body.append(list);
    document.getElementById("following-count").onclick = () => { window.clicks.push("WRONG:following-count"); };
  }, options);
  await page.addScriptTag({ content: `${removalSource}\n${accountSource}` });
  return { page, errors,
    remove: () => page.evaluate((username) => {
      if (window.showFollowersControl) setTimeout(window.showFollowersControl, 25);
      return performFollowerRemoval(username, "owner");
    }, options.username || "_wendell.98"),
    clicks: () => page.evaluate(() => window.clicks),
    close: () => page.close(),
  };
}

for (const language of ["pt", "en"]) {
  browserTest(`removes the exact follower from the owner's searchable list (${language})`, async () => {
    const f = await fixture({ language });
    try {
      assert.equal((await f.remove()).status, "follower_removed");
      assert.deepEqual(await f.clicks(), ["followers-list", "row:_wendell.98", "confirm:_wendell.98"]);
      assert.deepEqual(await f.page.evaluate(() => window.inputEvents), ["_wendell.98"]);
      assert.equal(await f.page.locator("[data-username='_wendell.98.extra']").count(), 1);
      assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
  });
  browserTest(`detects the signed-in account from the sidebar and own profile (${language})`, async () => {
    const f = await fixture({ language });
    try {
      assert.equal((await f.page.evaluate(() => detectAccountUsername())).username, "owner");
      await f.page.locator("nav").evaluate((nav) => nav.remove());
      assert.equal((await f.page.evaluate(() => detectAccountUsername())).username, "owner");
    } finally { await f.close(); }
  });
}

for (const control of ["span", "button", "role", "delayedSpan"]) {
  browserTest(`opens the floating modal from a ${control} control without changing the profile URL`, async () => {
    const f = await fixture({ control, unchangedUrl: true, genericModal: true });
    try {
      assert.equal((await f.remove()).status, "follower_removed");
      assert.deepEqual(await f.clicks(), ["followers-list", "row:_wendell.98", "confirm:_wendell.98"]);
      assert.equal(new URL(f.page.url()).pathname, "/owner/");
      assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
  });
}

browserTest("reuses an already open generic followers modal without looking for an opener", async () => {
  const f = await fixture({ control: "missing", preopened: true, unchangedUrl: true, genericModal: true });
  try {
    assert.equal((await f.remove()).status, "follower_removed");
    assert.deepEqual(await f.clicks(), ["row:_wendell.98", "confirm:_wendell.98"]);
  } finally { await f.close(); }
});

browserTest("does not mistake the following or posts counter for the followers control", async () => {
  const f = await fixture({ control: "missing" });
  try {
    assert.equal((await f.remove()).status, "skipped");
    assert.deepEqual(await f.clicks(), []);
  } finally { await f.close(); }
});

for (const option of ["replaceListOnSearch", "replaceInputOnSearch", "resetSearchOnce", "replaceListAfterRemoval"]) {
  browserTest(`reacquires the live modal and search field when ${option}`, async () => {
    const f = await fixture({ [option]: true, genericModal: true, unchangedUrl: true });
    try {
      assert.equal((await f.remove()).status, "follower_removed");
      assert.deepEqual(await f.clicks(), ["followers-list", "row:_wendell.98", "confirm:_wendell.98"]);
      assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
  });
}

for (const [username, shorter] of [["51_joao.93", "51_joao"], ["name.64", "name"], ["_ivanir67", "ivanir"]]) {
  browserTest(`retries a shorter search when ${username} returns no results`, async () => {
    const f = await fixture({ username, suffixSearchMiss: true });
    try {
      assert.equal((await f.remove()).status, "follower_removed");
      assert.deepEqual(await f.clicks(), ["followers-list", `row:${username}`, `confirm:${username}`]);
      const queries = await f.page.evaluate(() => window.inputEvents);
      assert.equal(queries.includes(username), true);
      assert.equal(queries.includes(shorter), true);
      assert.equal(await f.page.locator(`[data-username='${username}.extra']`).count(), 1);
    } finally { await f.close(); }
  });
}

browserTest("a shorter search also works when every input update replaces the modal and field", async () => {
  const f = await fixture({ suffixSearchMiss: true, replaceListOnSearch: true, replaceInputOnSearch: true, genericModal: true });
  try {
    assert.equal((await f.remove()).status, "follower_removed");
    assert.deepEqual(await f.clicks(), ["followers-list", "row:_wendell.98", "confirm:_wendell.98"]);
  } finally { await f.close(); }
});

browserTest("tries a shorter query when the search field will not keep the full numeric suffix", async () => {
  const f = await fixture({ username: "name.64", truncateFullQuery: true });
  try {
    assert.equal((await f.remove()).status, "follower_removed");
    assert.deepEqual(await f.clicks(), ["followers-list", "row:name.64", "confirm:name.64"]);
  } finally { await f.close(); }
});

browserTest("a shorter query never authorizes removing a similar username", async () => {
  const f = await fixture({ username: "51_joao.93", suffixSearchMiss: true, missingTarget: true });
  try {
    assert.equal((await f.remove()).status, "skipped");
    assert.deepEqual(await f.clicks(), ["followers-list"]);
  } finally { await f.close(); }
});

browserTest("a query changed during confirmation cannot authorize a removal", async () => {
  const f = await fixture({ changeSearchDuringConfirmation: true });
  try {
    assert.equal((await f.remove()).status, "skipped");
    assert.equal((await f.clicks()).some((click) => click.startsWith("confirm:")), false);
  } finally { await f.close(); }
});

for (const option of ["missingTarget", "missingTargetRemove", "wrongDialog", "noEffect", "closeList", "wrongAccount", "wrongAccountDuringConfirmation"]) {
  browserTest(`skips safely when ${option}`, async () => {
    const f = await fixture({ [option]: true });
    try {
      assert.equal((await f.remove()).status, "skipped");
      const clicks = await f.clicks();
      assert.equal(clicks.some((click) => click.includes(".extra")), false);
      if (!["noEffect", "closeList"].includes(option)) assert.equal(clicks.some((click) => click.startsWith("confirm:")), false);
    } finally { await f.close(); }
  });
}

for (const option of ["following", "followDuringConfirmation"]) {
  browserTest(`preserves live follows when ${option}`, async () => {
    const f = await fixture({ [option]: true });
    try {
      assert.equal((await f.remove()).status, "now_following");
      assert.equal((await f.clicks()).some((click) => click.startsWith("confirm:")), false);
    } finally { await f.close(); }
  });
}

for (const option of ["blockOnDialog", "blockAfterConfirm"]) {
  browserTest(`stops on a challenge when ${option}`, async () => {
    const f = await fixture({ [option]: true });
    try { assert.equal((await f.remove()).status, "blocked"); }
    finally { await f.close(); }
  });
}
