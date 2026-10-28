const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercise the real import helpers without loading the UI or touching an account.
const source = fs.readFileSync(path.join(__dirname, "../extension/popup.js"), "utf8");
const helpers = source.slice(source.indexOf("function cleanUsername("), source.indexOf("function updateCompareState("));
const context = vm.createContext({ URL });
vm.runInContext(`${helpers}\nglobalThis.helpers = { extractRows, readFollowersFiles, compareLists };`, context);
const { extractRows, readFollowersFiles, compareLists } = context.helpers;
const file = (value) => ({ text: async () => JSON.stringify(value) });
const row = (name) => ({ string_list_data: [{ value: name, href: `https://www.instagram.com/${name}/` }] });

test("all follower parts are combined before computing candidates", async () => {
  const followers = await readFollowersFiles([file([row("alice"), row("bob")]), file([row("bob"), row("carol")])]);
  const result = extractRows(followers, { relationships_following: [row("alice"), row("bob"), row("carol"), { title: "dave" }] });
  assert.equal(result.followers.size, 3);
  assert.deepEqual(Array.from(result.following).filter((name) => !result.followers.has(name)), ["dave"]);
});

test("single-file exports, normalized names and href-only records remain supported", async () => {
  const followers = await readFollowersFiles([file([row("@ALICE"), { string_list_data: [{ href: "https://www.instagram.com/bob/" }] }])]);
  const result = extractRows(followers, { relationships_following: [{ title: "alice" }, { title: "bob" }, { title: "charlie" }] });
  assert.deepEqual(Array.from(result.following).filter((name) => !result.followers.has(name)), ["charlie"]);
});

test("invalid or empty follower selection fails instead of silently using incomplete data", async () => {
  await assert.rejects(readFollowersFiles([]), /followers_/);
  await assert.rejects(readFollowersFiles([file([row("alice")]), file({ wrong: [] })]), /followers_/);
  await assert.rejects(readFollowersFiles([{ text: async () => "<html>not JSON</html>" }]), /JSON|Unexpected token/);
});

test("unrelated following reports are rejected", () => {
  assert.throws(() => extractRows([], { relationships_follow_requests_sent: [] }), /following.json/);
});

test("duplicate and deleted usernames do not create extra candidates", () => {
  const result = extractRows([row("alice")], { relationships_following: [{ title: "alice" }, { title: "dave" }, { title: "DAVE" }, row("__deleted__123"), row("instagram user")] });
  assert.equal(result.following.size, 2);
  assert.deepEqual(Array.from(result.following).filter((name) => !result.followers.has(name)), ["dave"]);
});

test("the same Meta files produce both directional differences, excluding mutual follows", async () => {
  const followers = await readFollowersFiles([file([row("mutual"), row("@FAN")]), file([row("fan"), row("another_fan")])]);
  const parsed = extractRows(followers, { relationships_following: [row("mutual"), row("creator")] });
  const lists = compareLists(parsed.followers, parsed.following);
  assert.deepEqual(Array.from(lists.candidates), ["creator"]);
  assert.deepEqual(Array.from(lists.removalCandidates), ["another_fan", "fan"]);
});

test("empty and fully mutual lists produce the correct removal candidates", () => {
  assert.deepEqual(Array.from(compareLists(new Set(["fan"]), new Set()).removalCandidates), ["fan"]);
  assert.deepEqual(Array.from(compareLists(new Set(), new Set(["creator"])).removalCandidates), []);
  const mutual = compareLists(new Set(["friend"]), new Set(["friend"]));
  assert.equal(mutual.candidates.length, 0);
  assert.equal(mutual.removalCandidates.length, 0);
});
