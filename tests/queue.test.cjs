const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (name) => fs.readFileSync(path.join(__dirname, "../extension", name), "utf8");

function runner(outcomes, options = {}) {
  const queue = outcomes.map((_, index) => `fan${index}`);
  const saved = {
    dataset: { importedAt: "export", candidates: ["creator"], removalCandidates: queue },
    progressByMode: { unfollow: ["creator"], remove_follower: [] },
    automation: {
      mode: "remove_follower", datasetId: "export", status: "running", startedAt: "run",
      accountUsername: "owner",
      queue, index: 0, confirmed: 0, skipped: 0, log: [], runnerTabId: 2, tabId: 1,
      settings: { intervalSeconds: 0, restEvery: 0, restSeconds: 0 },
    },
  };
  const elements = new Map();
  const element = () => ({ textContent: "", disabled: false, children: [], addEventListener() {}, replaceChildren() { this.children = []; }, append(child) { this.children.push(child); } });
  const document = {
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element,
  };
  const invocations = [];
  const chrome = {
    storage: { local: {
      get: async () => structuredClone(saved),
      set: async (value) => Object.assign(saved, structuredClone(value)),
    }, onChanged: { addListener() {} } },
    tabs: { getCurrent: async () => ({ id: 2 }) },
    scripting: { executeScript: async (injection) => {
      invocations.push(injection.args);
      if (options.useFollowersList && injection.func.name === "performProfileAction") return [{ result: { status: "ready_for_removal" } }];
      const index = options.useFollowersList ? (invocations.length / 2) - 1 : invocations.length - 1;
      const result = outcomes[index];
      if (options.stopAfterFirst) saved.automation.stopRequested = true;
      if (result instanceof Error) throw result;
      return [{ result }];
    } },
  };
  const context = vm.createContext({ document, chrome, setTimeout, clearTimeout, URL, Blob });
  // Disable automatic startup so each test can await the queue deterministically.
  vm.runInContext(read("modes.js"), context);
  vm.runInContext(read("runner.js").replace(/initialize\(\);\s*$/, ""), context);
  vm.runInContext("thisTabId = 2; waitForPage = async () => {};", context);
  return { saved, elements, invocations, run: () => context.runQueue() };
}

test("removal queue persists successes with the popup closed and continues after a skipped profile", async () => {
  const fixture = runner([
    { status: "follower_removed", detail: "confirmed" },
    new Error("profile did not load"),
    { status: "now_following", detail: "preserved" },
  ]);
  await fixture.run();
  assert.equal(fixture.saved.automation.status, "completed");
  assert.equal(fixture.saved.automation.confirmed, 1);
  assert.equal(fixture.saved.automation.skipped, 2);
  assert.equal(fixture.saved.automation.index, 3);
  assert.deepEqual(fixture.saved.progressByMode, { unfollow: ["creator"], remove_follower: ["fan0", "fan2"] });
  assert.deepEqual(fixture.invocations.map((args) => Array.from(args)), [["fan0", "remove_follower"], ["fan1", "remove_follower"], ["fan2", "remove_follower"]]);
  assert.match(fixture.elements.get("confirmed-label").textContent, /removido/);
});

test("a checked candidate is removed through the owner's followers list", async () => {
  const fixture = runner([{ status: "follower_removed" }], { useFollowersList: true });
  await fixture.run();
  assert.deepEqual(fixture.invocations.map((args) => Array.from(args)), [["fan0", "remove_follower"], ["fan0", "owner"]]);
  assert.equal(fixture.saved.automation.confirmed, 1);
  assert.equal(fixture.saved.automation.status, "completed");
  assert.deepEqual(fixture.saved.progressByMode.remove_follower, ["fan0"]);
});

test("a challenge stops the removal queue before the next profile", async () => {
  const fixture = runner([{ status: "blocked", detail: "captcha" }, { status: "follower_removed" }]);
  await fixture.run();
  assert.equal(fixture.saved.automation.status, "stopped");
  assert.equal(fixture.saved.automation.stopReason, "captcha");
  assert.equal(fixture.invocations.length, 1);
  assert.deepEqual(fixture.saved.progressByMode.remove_follower, []);
});

test("the stop button finishes the current profile and preserves its result", async () => {
  const fixture = runner([{ status: "follower_removed" }, { status: "follower_removed" }], { stopAfterFirst: true });
  await fixture.run();
  assert.equal(fixture.saved.automation.status, "cancelled");
  assert.equal(fixture.invocations.length, 1);
  assert.deepEqual(fixture.saved.progressByMode.remove_follower, ["fan0"]);
});
