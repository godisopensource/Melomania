import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Contract mirror of src/lib/playlist-sync.ts > diffPlaylistSync.
// (tests/*.test.mjs run with plain node, no TS loader — same pattern as
// engine.test.mjs which inlines the helpers it verifies.)
// Precondition for orderChanged: `existing` sorted by sourcePosition ascending.
function diffPlaylistSync(existing, fresh) {
  const existingByExt = new Map();
  for (const e of existing) {
    if (!e.externalId) continue;
    if (!existingByExt.has(e.externalId)) existingByExt.set(e.externalId, e);
  }

  const seenFresh = new Set();
  const toAdd = [];
  const toKeep = [];
  const freshIds = new Set();

  for (const f of fresh) {
    if (!f.externalId || seenFresh.has(f.externalId)) continue;
    seenFresh.add(f.externalId);
    freshIds.add(f.externalId);
    const match = existingByExt.get(f.externalId);
    if (match) {
      toKeep.push({ fresh: f, existing: match });
    } else {
      toAdd.push(f);
    }
  }

  const removedFromSource = existing.filter(
    (e) => e.externalId && !freshIds.has(e.externalId)
  );

  const referenceOrder = [...seenFresh];

  const knownInRefOrder = [];
  for (const ext of referenceOrder) {
    const match = existingByExt.get(ext);
    if (match) knownInRefOrder.push(match.resourceId);
  }
  const knownInLocalOrder = existing
    .filter((e) => e.externalId && freshIds.has(e.externalId))
    .map((e) => e.resourceId);
  const orderChanged =
    knownInRefOrder.length === knownInLocalOrder.length &&
    knownInRefOrder.length > 1 &&
    knownInRefOrder.some((id, i) => id !== knownInLocalOrder[i]);

  return { toAdd, toKeep, removedFromSource, referenceOrder, orderChanged };
}

// Contract mirror of src/lib/playlist-sync.ts > findChronologyViolations.
function findChronologyViolations(tracks) {
  const byCat = new Map();
  for (const t of tracks) {
    if (!t.categoryId) continue;
    const arr = byCat.get(t.categoryId) ?? [];
    arr.push({ id: t.id, pos: t.sourcePosition ?? 0 });
    byCat.set(t.categoryId, arr);
  }
  const violations = [];
  for (const [categoryId, arr] of byCat) {
    arr.sort((a, b) => a.pos - b.pos);
    let broken = false;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].pos - arr[i - 1].pos !== 1) {
        broken = true;
        break;
      }
    }
    if (broken) violations.push({ categoryId, trackIds: arr.map((x) => x.id) });
  }
  return violations;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("sync source stays in sync with the TS implementation", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "lib", "playlist-sync.ts"),
    "utf8"
  );
  for (const marker of [
    "existingByExt",
    "seenFresh",
    "freshIds",
    "toAdd",
    "toKeep",
    "removedFromSource",
    "referenceOrder",
    "orderChanged",
    "findChronologyViolations",
  ]) {
    assert.ok(src.includes(marker), `playlist-sync.ts should contain ${marker}`);
  }
});

test("sync diff: new YouTube tracks are detected as additions", () => {
  const existing = [
    { resourceId: "r1", externalId: "vid1" },
    { resourceId: "r2", externalId: "vid2" },
  ];
  const fresh = [
    { externalId: "vid1" },
    { externalId: "vid2" },
    { externalId: "vid3" },
    { externalId: "vid4" },
  ];
  const diff = diffPlaylistSync(existing, fresh);
  assert.equal(diff.toAdd.length, 2);
  assert.deepEqual(
    diff.toAdd.map((t) => t.externalId),
    ["vid3", "vid4"]
  );
  assert.equal(diff.toKeep.length, 2);
  assert.equal(diff.removedFromSource.length, 0);
});

test("sync diff: nothing added when already up to date", () => {
  const existing = [{ resourceId: "r1", externalId: "vid1" }];
  const diff = diffPlaylistSync(existing, [{ externalId: "vid1" }]);
  assert.equal(diff.toAdd.length, 0);
  assert.equal(diff.toKeep.length, 1);
  assert.equal(diff.removedFromSource.length, 0);
});

test("sync diff: tracks gone from YouTube are reported, never deleted", () => {
  const existing = [
    { resourceId: "r1", externalId: "vid1" },
    { resourceId: "r2", externalId: "vidGone" },
  ];
  const diff = diffPlaylistSync(existing, [{ externalId: "vid1" }]);
  assert.equal(diff.toAdd.length, 0);
  assert.equal(diff.removedFromSource.length, 1);
  assert.equal(diff.removedFromSource[0].resourceId, "r2");
});

test("sync diff: matches by videoId only, dedupes fresh entries", () => {
  const existing = [{ resourceId: "r1", externalId: "vid1" }];
  const fresh = [
    { externalId: "vid1" },
    { externalId: "vid1" }, // duplicate from YouTube response
    { externalId: "vid2" },
    { externalId: "" }, // invalid entry
  ];
  const diff = diffPlaylistSync(existing, fresh);
  assert.equal(diff.toKeep.length, 1);
  assert.deepEqual(
    diff.toAdd.map((t) => t.externalId),
    ["vid2"]
  );
});

test("sync diff: empty local playlist adds everything", () => {
  const diff = diffPlaylistSync([], [{ externalId: "a" }, { externalId: "b" }]);
  assert.equal(diff.toAdd.length, 2);
  assert.equal(diff.toKeep.length, 0);
  assert.equal(diff.removedFromSource.length, 0);
});

test("sync diff: same order is not flagged", () => {
  const existing = [
    { resourceId: "r1", externalId: "vid1" },
    { resourceId: "r2", externalId: "vid2" },
    { resourceId: "r3", externalId: "vid3" },
  ];
  const diff = diffPlaylistSync(existing, [
    { externalId: "vid1" },
    { externalId: "vid2" },
    { externalId: "vid3" },
  ]);
  assert.equal(diff.orderChanged, false);
  assert.deepEqual(diff.referenceOrder, ["vid1", "vid2", "vid3"]);
});

test("sync diff: reordered YouTube tracks are detected", () => {
  const existing = [
    { resourceId: "r1", externalId: "vid1" },
    { resourceId: "r2", externalId: "vid2" },
    { resourceId: "r3", externalId: "vid3" },
  ];
  const diff = diffPlaylistSync(existing, [
    { externalId: "vid2" },
    { externalId: "vid3" },
    { externalId: "vid1" },
  ]);
  assert.equal(diff.orderChanged, true);
  assert.equal(diff.toAdd.length, 0);
  assert.equal(diff.removedFromSource.length, 0);
});

test("sync diff: reorder detection ignores new and removed tracks", () => {
  const existing = [
    { resourceId: "r1", externalId: "vid1" },
    { resourceId: "r2", externalId: "vid2" },
    { resourceId: "rGone", externalId: "vidGone" },
  ];
  const diff = diffPlaylistSync(existing, [
    { externalId: "vid2" },
    { externalId: "vid1" },
    { externalId: "vidNew" },
  ]);
  assert.equal(diff.orderChanged, true);
  assert.equal(diff.toAdd.length, 1);
  assert.equal(diff.removedFromSource.length, 1);
});

test("sync diff: single known track never counts as reorder", () => {
  const diff = diffPlaylistSync(
    [{ resourceId: "r1", externalId: "vid1" }],
    [{ externalId: "vid1" }, { externalId: "vidNew" }]
  );
  assert.equal(diff.orderChanged, false);
});

test("chronology: consecutive categories pass", () => {
  const violations = findChronologyViolations([
    { id: "a", categoryId: "cat1", sourcePosition: 0 },
    { id: "b", categoryId: "cat1", sourcePosition: 1 },
    { id: "c", categoryId: null, sourcePosition: 2 },
    { id: "d", categoryId: "cat2", sourcePosition: 3 },
  ]);
  assert.deepEqual(violations, []);
});

test("chronology: split category is reported", () => {
  const violations = findChronologyViolations([
    { id: "a", categoryId: "cat1", sourcePosition: 0 },
    { id: "b", categoryId: "cat2", sourcePosition: 1 },
    { id: "c", categoryId: "cat1", sourcePosition: 2 },
  ]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].categoryId, "cat1");
  assert.deepEqual(violations[0].trackIds, ["a", "c"]);
});

test("chronology: single-track categories never break", () => {
  const violations = findChronologyViolations([
    { id: "a", categoryId: "cat1", sourcePosition: 0 },
    { id: "b", categoryId: "cat2", sourcePosition: 5 },
  ]);
  assert.deepEqual(violations, []);
});
