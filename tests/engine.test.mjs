import test from "node:test";
import assert from "node:assert/strict";

// Helper implementations directly verified
function formatTime(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
    return "0:00";
  }
  const rounded = Math.floor(seconds);
  const hrs = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  const secsPadded = secs < 10 ? `0${secs}` : `${secs}`;
  if (hrs > 0) {
    const minsPadded = mins < 10 ? `0${mins}` : `${mins}`;
    return `${hrs}:${minsPadded}:${secsPadded}`;
  }
  return `${mins}:${secsPadded}`;
}

function parseTimeToSeconds(input) {
  if (!input) return 0;
  const cleaned = input.trim().toLowerCase();
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":").map((p) => parseInt(p, 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  const hourMatch = cleaned.match(/(\d+)\s*h/);
  const minMatch = cleaned.match(/(\d+)\s*m/);
  const secMatch = cleaned.match(/(\d+)\s*s/);
  if (hourMatch || minMatch || secMatch) {
    const h = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const m = minMatch ? parseInt(minMatch[1], 10) : 0;
    const s = secMatch ? parseInt(secMatch[1], 10) : 0;
    return h * 3600 + m * 60 + s;
  }
  const numeric = parseFloat(cleaned);
  return isNaN(numeric) ? 0 : Math.max(0, Math.floor(numeric));
}

function normalizeMusicText(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(official\s+video|official\s+audio|lyrics?|clip\s+officiel|hq|hd|4k|audio|visualizer)\b/gi, "")
    .replace(/[\(\[\{].*?[\)\]\}]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVersionLabel(text) {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (lower.includes("remix")) return "Remix";
  if (lower.includes("live")) return "Live";
  if (lower.includes("acoustic") || lower.includes("acoustique")) return "Acoustic";
  if (lower.includes("radio edit")) return "Radio Edit";
  if (lower.includes("remaster")) return "Remastered";
  return "Original";
}

function parseYouTubeUrl(url) {
  if (!url) return {};
  const cleaned = url.trim();
  let videoId;
  let playlistId;
  let timecode;
  const listMatch = cleaned.match(/[?&]list=([^#&?]+)/);
  if (listMatch) playlistId = listMatch[1];
  const tMatch = cleaned.match(/[?&]t=([^#&?]+)/);
  if (tMatch) timecode = parseTimeToSeconds(tMatch[1]);
  const watchMatch = cleaned.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([^#&?]+)/);
  if (watchMatch) videoId = watchMatch[1];
  return { videoId, playlistId, timecode };
}

test("Time formatting and parsing", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(92), "1:32");
  assert.equal(formatTime(3665), "1:01:05");
  assert.equal(parseTimeToSeconds("1:32"), 92);
  assert.equal(parseTimeToSeconds("01:32"), 92);
  assert.equal(parseTimeToSeconds("1h01m05s"), 3665);
  assert.equal(parseTimeToSeconds("92"), 92);
});

test("YouTube URL parsing", () => {
  const videoUrl = "https://www.youtube.com/watch?v=dX3k_QDnzHE&t=92s";
  const parsed = parseYouTubeUrl(videoUrl);
  assert.equal(parsed.videoId, "dX3k_QDnzHE");
  assert.equal(parsed.timecode, 92);

  const playlistUrl = "https://www.youtube.com/playlist?list=PL_french_touch_melomania";
  const parsedPlaylist = parseYouTubeUrl(playlistUrl);
  assert.equal(parsedPlaylist.playlistId, "PL_french_touch_melomania");
});

test("Music text normalization", () => {
  assert.equal(
    normalizeMusicText("Get Lucky (Official Audio) ft. Pharrell Williams"),
    "get lucky ft pharrell williams"
  );
  assert.equal(
    normalizeMusicText("M83 'Midnight City' [Official Video]"),
    "m83 midnight city"
  );
  assert.equal(
    normalizeMusicText("Café Délice (Remastered 2024)"),
    "cafe delice"
  );
});

test("Version label extraction", () => {
  assert.equal(extractVersionLabel("Midnight City (Radio Edit)"), "Radio Edit");
  assert.equal(extractVersionLabel("Get Lucky - Live in Paris"), "Live");
  assert.equal(extractVersionLabel("Nightcall (Club Remix)"), "Remix");
  assert.equal(extractVersionLabel("Bohemian Rhapsody (Acoustic)"), "Acoustic");
  assert.equal(extractVersionLabel("Original Album Track"), "Original");
});
