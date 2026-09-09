import test from "node:test";
import assert from "node:assert/strict";

// Mirrors of youtube-api.ts (tests run with plain node, no TS loader).

function parseIsoDuration(iso) {
  if (!iso || typeof iso !== "string") return -1;
  const m = iso.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return -1;
  const d = parseInt(m[1] || "0", 10);
  const h = parseInt(m[2] || "0", 10);
  const min = parseInt(m[3] || "0", 10);
  const s = parseInt(m[4] || "0", 10);
  if (!m[1] && !m[2] && !m[3] && !m[4]) return -1;
  return d * 86400 + h * 3600 + min * 60 + s;
}

function pickApiThumbnail(thumbs) {
  if (!thumbs || typeof thumbs !== "object") return undefined;
  for (const k of ["maxres", "standard", "high", "medium", "default"]) {
    const u = thumbs[k]?.url;
    if (typeof u === "string" && u.length > 0) return u;
  }
  return undefined;
}

function cleanTitle(raw) {
  const t =
    typeof raw === "string"
      ? raw.replace(/\s*\(Official.*?\)/gi, "").replace(/\s*\[Official.*?\]/gi, "").trim()
      : "";
  return t || "Track";
}

function cleanArtist(raw) {
  const a = typeof raw === "string" ? raw.replace(/\s*-\s*Topic$/i, "").trim() : "";
  return a || "Artist";
}

function mapApiItem(item, albumTitle) {
  if (!item || typeof item !== "object") return null;
  const snippet = item.snippet || {};
  const videoId = snippet?.resourceId?.videoId || item.contentDetails?.videoId;
  if (typeof videoId !== "string" || videoId.length < 5) return null;
  return {
    externalId: videoId,
    provider: "youtube",
    title: cleanTitle(snippet.title),
    artist: cleanArtist(snippet.videoOwnerChannelTitle || snippet.channelTitle),
    album: albumTitle,
    durationSeconds: 210,
    coverImageUrl:
      pickApiThumbnail(snippet.thumbnails) ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

test("parseIsoDuration handles YouTube formats", () => {
  assert.equal(parseIsoDuration("PT4M57S"), 297);
  assert.equal(parseIsoDuration("PT1H2M10S"), 3730);
  assert.equal(parseIsoDuration("PT30S"), 30);
  assert.equal(parseIsoDuration("PT12M"), 720);
  assert.equal(parseIsoDuration("P1DT2H"), 93600);
});

test("parseIsoDuration rejects garbage", () => {
  assert.equal(parseIsoDuration(undefined), -1);
  assert.equal(parseIsoDuration(""), -1);
  assert.equal(parseIsoDuration("4:57"), -1);
  assert.equal(parseIsoDuration("PT"), -1);
  assert.equal(parseIsoDuration("hello"), -1);
});

test("pickApiThumbnail prefers richest stable quality", () => {
  const thumbs = {
    default: { url: "https://i.ytimg.com/vi/abc/def.jpg" },
    medium: { url: "https://i.ytimg.com/vi/abc/mq.jpg" },
    high: { url: "https://i.ytimg.com/vi/abc/hq.jpg" },
  };
  assert.equal(pickApiThumbnail(thumbs), "https://i.ytimg.com/vi/abc/hq.jpg");
  assert.equal(
    pickApiThumbnail({ maxres: { url: "https://i.ytimg.com/vi/abc/max.jpg" }, ...thumbs }),
    "https://i.ytimg.com/vi/abc/max.jpg"
  );
  assert.equal(pickApiThumbnail(undefined), undefined);
  assert.equal(pickApiThumbnail({}), undefined);
});

test("mapApiItem maps a playlistItems snippet (Topic uploader stripped)", () => {
  const item = {
    snippet: {
      title: "Open Your Eyes",
      videoOwnerChannelTitle: "Release - Topic",
      channelTitle: "Charlie",
      resourceId: { videoId: "XKNfjxF10vA" },
      thumbnails: {
        default: { url: "https://i.ytimg.com/vi/XKNfjxF10vA/default.jpg" },
        medium: { url: "https://i.ytimg.com/vi/XKNfjxF10vA/mqdefault.jpg" },
        high: { url: "https://i.ytimg.com/vi/XKNfjxF10vA/hqdefault.jpg" },
      },
      position: 95,
    },
    contentDetails: { videoId: "XKNfjxF10vA" },
  };
  const t = mapApiItem(item, "Charlie");
  assert.equal(t.externalId, "XKNfjxF10vA");
  assert.equal(t.title, "Open Your Eyes");
  assert.equal(t.artist, "Release");
  assert.equal(t.album, "Charlie");
  assert.equal(t.coverImageUrl, "https://i.ytimg.com/vi/XKNfjxF10vA/hqdefault.jpg");
  assert.equal(t.externalUrl, "https://www.youtube.com/watch?v=XKNfjxF10vA");
});

test("mapApiItem cleans Official suffixes and skips unplayable entries", () => {
  const official = mapApiItem(
    {
      snippet: {
        title: "M83 - 'Kool Nuit' feat. Kaela (Official Audio)",
        videoOwnerChannelTitle: "M83",
        resourceId: { videoId: "q2A62QzfnJM" },
        thumbnails: {},
      },
    },
    "Charlie"
  );
  assert.equal(official.title, "M83 - 'Kool Nuit' feat. Kaela");
  assert.equal(
    official.coverImageUrl,
    "https://i.ytimg.com/vi/q2A62QzfnJM/hqdefault.jpg"
  );
  // Deleted/private videos have no resourceId → skipped (never stored).
  assert.equal(
    mapApiItem({ snippet: { title: "Deleted video" } }, "Charlie"),
    null
  );
  assert.equal(mapApiItem(null, "Charlie"), null);
});
