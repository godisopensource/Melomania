import test from "node:test";
import assert from "node:assert/strict";

// Mirrors of findStationaryIds() / assignNewTrackCategories() in
// src/lib/playlist-sync.ts (plain node, no TS loader — repo convention).

function findStationaryIds(localOrder, refOrder) {
  const refRank = new Map();
  refOrder.forEach((id, i) => {
    if (!refRank.has(id)) refRank.set(id, i);
  });
  const seq = [];
  for (const id of localOrder) {
    const rank = refRank.get(id);
    if (rank !== undefined) seq.push({ id, rank });
  }
  const n = seq.length;
  const stationary = new Set();
  if (n === 0) return stationary;
  const len = new Array(n).fill(1);
  const parent = new Array(n).fill(-1);
  let end = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (seq[j].rank < seq[i].rank && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        parent[i] = j;
      }
    }
    if (len[i] > len[end]) end = i;
  }
  for (let p = end; p !== -1; p = parent[p]) stationary.add(seq[p].id);
  return stationary;
}

function assignNewTrackCategories(refFull, currentCat) {
  const get = (id) => {
    const v = currentCat instanceof Map ? currentCat.get(id) : currentCat[id];
    return v ?? null;
  };
  const assigned = new Map();
  refFull.forEach((entry, idx) => {
    if (!entry.isNew) return;
    let prev = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (!refFull[i].isNew) {
        prev = refFull[i].id;
        break;
      }
    }
    let next = null;
    for (let i = idx + 1; i < refFull.length; i++) {
      if (!refFull[i].isNew) {
        next = refFull[i].id;
        break;
      }
    }
    const target = prev ? get(prev) : next ? get(next) : null;
    if (target !== null) assigned.set(entry.id, target);
  });
  return assigned;
}

const JAZZ = "cat_jazz";
const SOUL = "cat_soul";

test("rotation flags only the truly moved track", () => {
  const stationary = findStationaryIds(["a", "b", "c"], ["b", "c", "a"]);
  assert.deepEqual([...stationary].sort(), ["b", "c"]);
});

test("pure index shifts from insertions flag nothing", () => {
  // Samara Joy slides 98 → 101 behind insertions but keeps its neighbors.
  const local = ["rin", "puncha", "samara1", "samara2", "breathe"];
  const ref = ["rin", "tutu1", "tutu2", "puncha", "samara1", "samara2", "breathe"];
  const stationary = findStationaryIds(local, ref);
  assert.deepEqual([...stationary].sort(), ["breathe", "puncha", "rin", "samara1", "samara2"]);
});

test("a genuinely reordered track is flagged (Pure Imagination case)", () => {
  const local = ["misty", "pure", "breathe"];
  const ref = ["allatsea", "pure", "dontstop", "misty", "breathe"];
  const stationary = findStationaryIds(local, ref);
  assert.equal(stationary.has("pure"), false);
  assert.equal(stationary.has("misty"), true);
  assert.equal(stationary.has("breathe"), true);
});

test("swap keeps a longest stationary subsequence (one of the pair moves)", () => {
  const stationary = findStationaryIds(["a", "b", "c", "d"], ["a", "c", "b", "d"]);
  assert.equal(stationary.has("a"), true);
  assert.equal(stationary.has("d"), true);
  assert.equal(stationary.size, 3);
  assert.equal(stationary.has("b") !== stationary.has("c"), true);
});

test("empty and single orders", () => {
  assert.deepEqual([...findStationaryIds([], [])], []);
  assert.deepEqual([...findStationaryIds(["a"], ["a"])], ["a"]);
});

test("new track between same-category neighbors joins them", () => {
  const assigned = assignNewTrackCategories(
    [
      { id: "lullaby", isNew: false },
      { id: "tutu1", isNew: true },
      { id: "puncha", isNew: false },
    ],
    { lullaby: JAZZ, puncha: JAZZ }
  );
  assert.equal(assigned.get("tutu1"), JAZZ);
});

test("adjacent new tracks anchor on existing tracks (never on each other)", () => {
  const assigned = assignNewTrackCategories(
    [
      { id: "lullaby", isNew: false },
      { id: "tutu1", isNew: true },
      { id: "tutu2", isNew: true },
      { id: "puncha", isNew: false },
    ],
    { lullaby: JAZZ, puncha: JAZZ }
  );
  assert.equal(assigned.get("tutu1"), JAZZ);
  assert.equal(assigned.get("tutu2"), JAZZ);
});

test("new track at the head takes the next track's category", () => {
  const assigned = assignNewTrackCategories(
    [
      { id: "intro", isNew: true },
      { id: "a", isNew: false },
    ],
    { a: SOUL }
  );
  assert.equal(assigned.get("intro"), SOUL);
});

test("new track after an uncategorized previous stays uncategorized", () => {
  const assigned = assignNewTrackCategories(
    [
      { id: "breathe", isNew: false },
      { id: "newbie", isNew: true },
      { id: "soul", isNew: false },
    ],
    { breathe: null, soul: SOUL }
  );
  assert.equal(assigned.has("newbie"), false);
});

test("no existing neighbors anywhere keeps null", () => {
  const assigned = assignNewTrackCategories(
    [
      { id: "n1", isNew: true },
      { id: "n2", isNew: true },
    ],
    {}
  );
  assert.equal(assigned.size, 0);
});
