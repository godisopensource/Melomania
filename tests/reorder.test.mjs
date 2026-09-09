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

// Mirror of resolveSections() in src/lib/playlist-sync.ts: the curator rule
// evaluated literally (adjacent neighbors of any kind) in ONE ascending pass
// over a working snapshot, so forward chains resolve (Elas sees OYE's Jazz).
function resolveSections(refFull, currentCat, candidates) {
  const snap = (id) => {
    const v = currentCat instanceof Map ? currentCat.get(id) : currentCat[id];
    return v ?? null;
  };
  const working = new Map();
  for (const e of refFull) working.set(e.id, snap(e.id));
  const cand = candidates instanceof Set ? candidates : new Set(candidates);
  const order = refFull
    .map((e, i) => i)
    .filter((i) => cand.has(refFull[i].id))
    .sort((a, b) => a - b);
  const neighbor = (idx, dir) => {
    for (let i = idx + dir; i >= 0 && i < refFull.length; i += dir) {
      const e = refFull[i];
      const c = working.get(e.id) ?? null;
      if (!e.isNew || c !== null) return { found: true, cat: c };
    }
    return { found: false, cat: null };
  };
  const changes = new Map();
  for (const idx of order) {
    const id = refFull[idx].id;
    const prev = neighbor(idx, -1);
    const next = neighbor(idx, +1);
    const target = prev.found ? prev.cat : next.found ? next.cat : (working.get(id) ?? null);
    if ((target ?? null) !== (snap(id) ?? null)) {
      working.set(id, target ?? null);
      changes.set(id, target ?? null);
    }
  }
  return changes;
}

test("engine: Tutu chain resolves forward in one pass (the Jazz split case)", () => {
  const refFull = [
    { id: "lullaby", isNew: false },
    { id: "oye", isNew: false },
    { id: "elas", isNew: false },
    { id: "puncha", isNew: false },
  ];
  const cats = { lullaby: JAZZ, oye: null, elas: null, puncha: JAZZ };
  const changes = resolveSections(refFull, cats, new Set(["oye", "elas"]));
  assert.equal(changes.get("oye"), JAZZ);
  assert.equal(changes.get("elas"), JAZZ);
});

test("engine: stationary tracks are never candidates, kept-absent keep cats", () => {
  const refFull = [
    { id: "a", isNew: false },
    { id: "kept", isNew: false },
  ];
  const changes = resolveSections(refFull, { a: SOUL, kept: SOUL }, new Set());
  assert.equal(changes.size, 0);
});

test("engine: existing chain through a moved anchor (X then Y)", () => {
  const refFull = [
    { id: "p", isNew: false },
    { id: "x", isNew: false },
    { id: "y", isNew: false },
    { id: "q", isNew: false },
  ];
  const cats = { p: JAZZ, x: null, y: null, q: JAZZ };
  const changes = resolveSections(refFull, cats, new Set(["x", "y"]));
  assert.equal(changes.get("x"), JAZZ);
  assert.equal(changes.get("y"), JAZZ);
});

test("engine: head track sees past null newcomers to the next section", () => {
  const refFull = [
    { id: "x", isNew: false },
    { id: "n", isNew: true },
    { id: "y", isNew: false },
  ];
  const cats = { x: JAZZ, y: JAZZ };
  const changes = resolveSections(refFull, cats, new Set(["x", "n"]));
  assert.equal(changes.has("x"), false);
  assert.equal(changes.get("n"), JAZZ);
});

test("engine: head newcomers attach to the following section", () => {
  const refFull = [
    { id: "n1", isNew: true },
    { id: "n2", isNew: true },
    { id: "y", isNew: false },
  ];
  const changes = resolveSections(refFull, { y: JAZZ }, new Set(["n1", "n2"]));
  assert.equal(changes.get("n1"), JAZZ);
  assert.equal(changes.get("n2"), JAZZ);
});

test("engine: existing null neighbor stops the scan (its own section)", () => {
  const refFull = [
    { id: "x", isNew: false },
    { id: "n", isNew: true },
    { id: "y", isNew: false },
  ];
  const cats = { x: null, y: JAZZ };
  const changes = resolveSections(refFull, cats, new Set(["n"]));
  assert.equal(changes.has("n"), false);
});

test("engine: lone candidate keeps its category", () => {
  const changes = resolveSections([{ id: "solo", isNew: false }], { solo: SOUL }, new Set(["solo"]));
  assert.equal(changes.size, 0);
});
