import test from "node:test";
import assert from "node:assert/strict";

// Mirror of isDocCacheFresh() in src/lib/db.ts (transfer saver contract).
function isDocCacheFresh(at, now, ttlMs = 2000) {
  return now - at < ttlMs;
}

test("cache is fresh inside the window", () => {
  assert.equal(isDocCacheFresh(1000, 1000), true);
  assert.equal(isDocCacheFresh(1000, 2999), true);
});

test("cache expires at the TTL boundary", () => {
  assert.equal(isDocCacheFresh(1000, 3000), false);
  assert.equal(isDocCacheFresh(1000, 5000), false);
});

test("custom TTL is honored", () => {
  assert.equal(isDocCacheFresh(0, 5000, 10000), true);
  assert.equal(isDocCacheFresh(0, 5000, 1000), false);
});

test("clock skew backwards stays fresh (never crashes the read path)", () => {
  assert.equal(isDocCacheFresh(5000, 1000), true);
});
