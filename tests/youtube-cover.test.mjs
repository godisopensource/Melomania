import test from "node:test";
import assert from "node:assert/strict";

// Mirrors of the fixed logic (tests run with plain node, no TS loader —
// same pattern as engine.test.mjs / sync.test.mjs which inline helpers).

// Mirror of coverFor() in src/lib/adapters/youtube.ts
function coverFor(videoId, thumbnail) {
  if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }
  if (thumbnail && /i\.ytimg\.com\/vi\//.test(thumbnail)) return thumbnail;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// Mirror of resolveYoutubeId() in src/components/providers/PlayerProvider.tsx
function resolveYoutubeId(track) {
  const explicit = track.youtubeVideoId;
  if (typeof explicit === "string" && /^[A-Za-z0-9_-]{5,}$/.test(explicit)) {
    return explicit;
  }
  let vidId = "dX3k_QDnzHE";
  if (track.coverImageUrl?.includes("vi/")) {
    const match = track.coverImageUrl.match(/vi\/([^\/]+)/);
    if (match) vidId = match[1];
  } else if (track.id.includes("midnight")) {
    vidId = "dX3k_QDnzHE";
  } else if (track.id.includes("lucky") || track.title.toLowerCase().includes("get lucky")) {
    vidId = "5qap5aO4i9A";
  } else if (track.id.includes("bohemian") || track.title.toLowerCase().includes("bohemian")) {
    vidId = "fJ9rUzIMcZQ";
  } else if (track.id.includes("nightcall") || track.title.toLowerCase().includes("nightcall")) {
    vidId = "MV_3Dpw-BRY";
  }
  return vidId;
}

const AVATAR =
  "https://yt3.googleusercontent.com/QiL3v467nbBkdRi8fTz_HqeNetnqatd5-9snpfnIbbGSBfqa9n_xAqUg9BVoCzUKYAvZR2kUPtQf_Gs=w120-h120-l90-rj";
const LH3 = "https://lh3.googleusercontent.com/abc123=w60-h60-l90-rj";
const VALID =
  "https://i.ytimg.com/vi/Gr26uDEjY7w/hqdefault.jpg?sqp=-oaymwEfCKgBEF5IVfKriqkDEggBFQAAiEIYAXABwAEGuAL3GA==&rs=AOn4CLComs2_H3umbVom3D5OXva6_gM0jQ";

test("coverFor replaces channel-avatar covers with the canonical thumbnail", () => {
  assert.equal(coverFor("Gr26uDEjY7w", AVATAR), "https://i.ytimg.com/vi/Gr26uDEjY7w/hqdefault.jpg");
});

test("coverFor replaces lh3 thumbnails with the canonical thumbnail", () => {
  assert.equal(coverFor("XKNfjxF10vA", LH3), "https://i.ytimg.com/vi/XKNfjxF10vA/hqdefault.jpg");
});

test("coverFor canonicalizes i.ytimg thumbnails (strips volatile sqp/rs params)", () => {
  assert.equal(
    coverFor("Gr26uDEjY7w", VALID),
    "https://i.ytimg.com/vi/Gr26uDEjY7w/hqdefault.jpg"
  );
});

test("coverFor leaves already-canonical thumbnails unchanged (stable sync diffs)", () => {
  const canonical = "https://i.ytimg.com/vi/Gr26uDEjY7w/hqdefault.jpg";
  assert.equal(coverFor("Gr26uDEjY7w", canonical), canonical);
});

test("coverFor handles missing thumbnails", () => {
  assert.equal(coverFor("abc123", undefined), "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
  assert.equal(coverFor("abc123", ""), "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
});

test("resolveYoutubeId prefers the explicit threaded video id (Tutu Puoane case)", () => {
  const track = {
    id: "res_trk_x",
    title: "Elasticity",
    coverImageUrl: AVATAR,
    youtubeVideoId: "Gr26uDEjY7w",
  };
  assert.equal(resolveYoutubeId(track), "Gr26uDEjY7w");
});

test("resolveYoutubeId still parses valid covers when no explicit id is present", () => {
  assert.equal(
    resolveYoutubeId({ id: "res_trk_x", title: "Deeper", coverImageUrl: VALID }),
    "Gr26uDEjY7w"
  );
});

test("resolveYoutubeId rejects malformed explicit ids and falls back safely", () => {
  const track = { id: "res_trk_x", title: "Elasticity", coverImageUrl: AVATAR, youtubeVideoId: "!!!" };
  assert.equal(resolveYoutubeId(track), "dX3k_QDnzHE");
});
