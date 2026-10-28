const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (name) => fs.readFileSync(path.join(__dirname, "../extension", name), "utf8");
const modesSource = read("modes.js");
const context = vm.createContext({});
vm.runInContext(modesSource, context);
const modes = context.FollowbackModes;
const plain = (value) => JSON.parse(JSON.stringify(value));
const dataset = { candidates: ["creator"], removalCandidates: ["fan", "new_friend", "unknown"], importedAt: "export-1" };
const run = { mode: "remove_follower", datasetId: "export-1", startedAt: "run-1", log: [
  { username: "fan", status: "follower_removed" },
  { username: "new_friend", status: "now_following" },
  { username: "unknown", status: "skipped" },
  { username: "outsider", status: "follower_removed" },
] };

test("legacy unfollow progress migrates without marking removal candidates as done", () => {
  const result = modes.mergeProgress({ dataset, progress: ["creator"] }, run);
  assert.deepEqual(plain(result), { unfollow: ["creator"], remove_follower: ["fan", "new_friend"] });
});

test("logs cannot cross modes or imports", () => {
  const saved = { dataset, progressByMode: { unfollow: ["creator"], remove_follower: [] } };
  assert.deepEqual(plain(modes.mergeProgress(saved, { ...run, datasetId: "older-export" })), plain(saved.progressByMode));
  assert.deepEqual(plain(modes.mergeProgress(saved, { ...run, mode: "unfollow" })), plain(saved.progressByMode));
  assert.deepEqual(plain(modes.mergeProgress(saved, { log: run.log })), plain(saved.progressByMode));
});

test("legacy automation logs still migrate for a legacy dataset", () => {
  const result = modes.mergeProgress({ dataset: { candidates: ["creator"] } }, { log: [{ username: "creator", status: "unfollowed" }] });
  assert.deepEqual(plain(result), { unfollow: ["creator"], remove_follower: [] });
});

test("resetting one mode survives reopening and a new run can record progress again", () => {
  const saved = { dataset, progressByMode: { unfollow: ["creator"], remove_follower: [], ignoredRuns: { remove_follower: "run-1" } } };
  assert.deepEqual(plain(modes.mergeProgress(saved, run)), plain(saved.progressByMode));
  const next = modes.mergeProgress(saved, { ...run, startedAt: "run-2" });
  assert.deepEqual(plain(next.remove_follower), ["fan", "new_friend"]);
  assert.deepEqual(plain(next.unfollow), ["creator"]);
});

function worker(initial, options = {}) {
  const saved = structuredClone(initial);
  const created = [];
  const listeners = {};
  const chrome = {
    storage: { local: {
      get: async () => structuredClone(saved),
      set: async (value) => Object.assign(saved, structuredClone(value)),
    } },
    runtime: { onMessage: { addListener: (fn) => { listeners.message = fn; } }, getURL: (file) => `chrome-extension://test/${file}` },
    scripting: { executeScript: async () => [{ result: { username: options.accountUsername ?? "owner" } }] },
    tabs: {
      get: async (id) => ({ id, url: "https://www.instagram.com/" }),
      create: async (options) => { created.push(options); return { id: 2 }; },
      onRemoved: { addListener: (fn) => { listeners.removed = fn; } },
    },
  };
  const ctx = vm.createContext({ chrome });
  ctx.importScripts = () => vm.runInContext(modesSource, ctx);
  vm.runInContext(read("service_worker.js"), ctx);
  return { saved, created, listeners, start: ctx.startAutomation };
}

test("worker uses removal candidates and their own progress, preserving completed unfollows", async () => {
  const fixture = worker({ dataset, progress: ["creator"], progressByMode: { unfollow: ["creator"], remove_follower: ["fan"] } });
  const result = await fixture.start({ mode: "remove_follower", tabId: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.automation.queue), ["new_friend", "unknown"]);
  assert.equal(result.automation.mode, "remove_follower");
  assert.equal(result.automation.accountUsername, "owner");
  assert.equal(result.automation.datasetId, dataset.importedAt);
  assert.equal(fixture.saved.automationMode, "remove_follower");
  assert.deepEqual(fixture.saved.progressByMode.unfollow, ["creator"]);
  assert.equal(fixture.created.length, 1);
});

test("removal cannot start without identifying the signed-in account", async () => {
  const fixture = worker({ dataset }, { accountUsername: "" });
  const result = await fixture.start({ mode: "remove_follower", tabId: 1 });
  assert.equal(result.ok, false);
  assert.match(result.error, /próprio perfil/);
  assert.equal(fixture.created.length, 0);
});

test("worker preserves the existing default unfollow workflow", async () => {
  const fixture = worker({ dataset: { candidates: ["creator", "done"], importedAt: "old" }, progress: ["done"] });
  const result = await fixture.start({ tabId: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.automation.mode, "unfollow");
  assert.deepEqual(plain(result.automation.queue), ["creator"]);
});

test("legacy exports require reimport for removal and invalid modes are rejected", async () => {
  const fixture = worker({ dataset: { candidates: ["creator"] } });
  const missing = await fixture.start({ mode: "remove_follower", tabId: 1 });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /mesmos arquivos da Meta/);
  const invalid = await fixture.start({ mode: "block", tabId: 1 });
  assert.equal(invalid.ok, false);
  assert.equal(fixture.created.length, 0);
});

test("worker rejects concurrent runs and empty queues without opening a runner", async () => {
  const active = worker({ dataset, automation: { status: "running" } });
  assert.equal((await active.start({ mode: "remove_follower", tabId: 1 })).ok, false);
  const empty = worker({ dataset, progressByMode: { remove_follower: dataset.removalCandidates } });
  assert.equal((await empty.start({ mode: "remove_follower", tabId: 1 })).ok, false);
  assert.equal(active.created.length + empty.created.length, 0);
});
