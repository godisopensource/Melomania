import test from "node:test";
import assert from "node:assert/strict";

// Mirror of recategorizeMovedTracks() in src/lib/playlist-sync.ts
// (tests run with plain node, no TS loader — same pattern as sync.test.mjs).
function recategorizeMovedTracks(order, currentCat, moved) {
  const get = (id) => {
    const v = currentCat instanceof Map ? currentCat.get(id) : currentCat[id];
    return v ?? null;
  };
  const movedSet = moved instanceof Set ? moved : new Set(moved);
  const changes = new Map();
  order.forEach((id, idx) => {
    if (!movedSet.has(id)) return;
    const prev = idx > 0 ? order[idx - 1] : null;
    const next = idx < order.length - 1 ? order[idx + 1] : null;
    const target = prev ? get(prev) : next ? get(next) : get(id);
    if ((target ?? null) !== (get(id) ?? null)) {
      changes.set(id, target ?? null);
    }
  });
  return changes;
}

const JAZZ = "cat_jazz";
const SOUL = "cat_soul";

test("moved track between same-category neighbors joins them", () => {
  const changes = recategorizeMovedTracks(
    ["a", "tutu", "b"],
    { a: JAZZ, tutu: SOUL, b: JAZZ },
    new Set(["tutu"])
  );
  assert.equal(changes.get("tutu"), JAZZ);
});

test("moved track between different categories takes the previous one (Tutu Puoane case)", () => {
  // Reference order: ... Rin Seo (Jazz instrumental), Tutu track, <Soul track>
  const changes = recategorizeMovedTracks(
    ["rin", "tutu", "soulTrack"],
    { rin: JAZZ, tutu: null, soulTrack: SOUL },
    new Set(["tutu"])
  );
  assert.equal(changes.get("tutu"), JAZZ);
});

test("moved track at the head takes the next track's category", () => {
  const changes = recategorizeMovedTracks(
    ["tutu", "b"],
    { tutu: null, b: SOUL },
    new Set(["tutu"])
  );
  assert.equal(changes.get("tutu"), SOUL);
});

test("unmoved tracks never change category, even between different sections", () => {
  const changes = recategorizeMovedTracks(
    ["a", "st steady", "b"],
    { a: JAZZ, "st steady": JAZZ, b: SOUL },
    new Set(["b"])
  );
  assert.equal(changes.has("st steady"), false);
  assert.equal(changes.has("a"), false);
});

test("already-correct moved tracks produce no change entry", () => {
  const changes = recategorizeMovedTracks(
    ["a", "tutu"],
    { a: JAZZ, tutu: JAZZ },
    new Set(["tutu"])
  );
  assert.equal(changes.size, 0);
});

test("lone moved track with no neighbors keeps its own category", () => {
  const changes = recategorizeMovedTracks(["solo"], { solo: SOUL }, new Set(["solo"]));
  assert.equal(changes.size, 0);
});

test("moved track can leave a section (previous is uncategorized)", () => {
  const changes = recategorizeMovedTracks(
    ["new-ish", "tutu", "b"],
    { "new-ish": null, tutu: JAZZ, b: JAZZ },
    new Set(["tutu"])
  );
  assert.equal(changes.get("tutu"), null);
});
