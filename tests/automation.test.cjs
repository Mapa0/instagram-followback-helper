const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../extension/runner.js"), "utf8");
const action = source.slice(source.indexOf("function performProfileAction("), source.indexOf("async function waitForPage("));

// A minimal DOM fixture models the candidate profile and the original unfollows.
// These tests never load Instagram or mutate a real account.
function profile(options = {}) {
  const english = options.language === "en";
  const labels = english
    ? { follow: "Follow back", following: "Following", options: "Options", block: "Block", unfollow: "Unfollow" }
    : { follow: "Seguir de volta", following: "Seguindo", options: "Opções", block: "Bloquear", unfollow: "Deixar de seguir" };
  const clicks = [];
  let menu = false;
  const body = { innerText: options.body || "" };
  const location = new URL(options.url || "https://www.instagram.com/fan/");
  const element = (label, onClick = () => {}, attrs = {}) => ({
    innerText: label,
    isConnected: true,
    getAttribute: (key) => attrs[key] || null,
    getBoundingClientRect: () => ({ width: 20, height: 20 }),
    querySelectorAll: () => [],
    click() { clicks.push(label || attrs["aria-label"] || "options-icon"); onClick(); },
  });
  const relationship = element(options.relationship || labels.follow, () => {
    menu = true;
  });
  const block = element(labels.block, () => { throw new Error("Block must never be clicked"); });
  const unfollow = element(labels.unfollow, () => {
    menu = false;
    relationship.innerText = english ? "Follow" : "Seguir";
  });
  const overflow = element(labels.options, () => {
    menu = true;
  });
  const controls = [relationship, overflow];
  const root = { querySelectorAll: () => controls };
  const document = {
    body,
    querySelector: () => root,
    querySelectorAll: () => [...controls, ...(menu ? [block, unfollow] : [])],
  };
  const context = vm.createContext({ document, location,
    getComputedStyle: () => ({ visibility: "visible", display: "block" }),
    setTimeout: (fn) => { fn(); },
  });
  vm.runInContext(action, context);
  return { clicks, perform: (mode = "remove_follower") => context.performProfileAction("fan", mode), labels };
}

for (const language of ["pt", "en"]) {
  test(`checks a candidate without relying on Remove follower in the profile menu (${language})`, async () => {
    const fixture = profile({ language });
    const result = await fixture.perform();
    assert.equal(result.status, "ready_for_removal");
    assert.deepEqual(fixture.clicks, []);
  });
  test(`existing unfollows still work (${language})`, async () => {
    const fixture = profile({ language, relationship: language === "en" ? "Following" : "Seguindo" });
    assert.equal((await fixture.perform("unfollow")).status, "unfollowed");
    assert.deepEqual(fixture.clicks, [fixture.labels.following, fixture.labels.unfollow]);
  });
}

for (const relationship of ["Seguindo", "Following", "Solicitado", "Requested"]) {
  test(`preserves a follower when the live relationship is ${relationship}`, async () => {
    const fixture = profile({ relationship });
    assert.equal((await fixture.perform()).status, "now_following");
    assert.deepEqual(fixture.clicks, []);
  });
}

for (const options of [
  { body: "Captcha" }, { url: "https://www.instagram.com/accounts/login/" },
]) {
  test(`stops on a challenge or block: ${JSON.stringify(options)}`, async () => {
    const fixture = profile(options);
    assert.equal((await fixture.perform()).status, "blocked");
  });
}

for (const options of [{ url: "https://www.instagram.com/other/" }, { body: "Esta página não está disponível" }, { relationship: "Mensagem" }]) {
  test(`skips unexpected profiles without clicks: ${JSON.stringify(options)}`, async () => {
    const fixture = profile(options);
    assert.equal((await fixture.perform()).status, "skipped");
    assert.deepEqual(fixture.clicks, []);
  });
}

test("an unsupported mode cannot trigger an action", async () => {
  const fixture = profile();
  assert.equal((await fixture.perform("block")).status, "skipped");
  assert.deepEqual(fixture.clicks, []);
});
