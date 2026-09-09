import type { ExternalPlaylist, ExternalTrack } from "./types";
import { MAX_PLAYLIST_TRACKS } from "./types";

/**
 * YouTube Data API v3 fallback (server-side only — the key never leaves
 * the server). Used ONLY when HTML scraping + browse API yield nothing
 * usable (failure, empty list, or truncated pagination): the official API
 * returns fresh data where edge-cached scrapes can lag days behind.
 *
 * Quota cost per full fetch ≈ 1 (playlists.list) + ~3 (playlistItems, 50/page)
 * + ~3 (videos.list durations, 50/call) ≈ 8 units of the 10 000/day free
 * quota. Users can disable it per-account (settings → services) via
 * `User.youtubeDataApiEnabled`; absent key also disables silently.
 */

/** Server-side API key. Env name the user must set in Vercel. */
export function getDataApiKey(): string | null {
  const key = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
  return typeof key === "string" && key.length > 10 ? key : null;
}

/** ISO8601 duration (PT4M57S, PT1H2M10S, P1DT2H…) → seconds. -1 if unparsable. */
export function parseIsoDuration(iso?: string): number {
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

/** Richest stable thumbnail available (API URLs carry no rotating params). */
export function pickApiThumbnail(
  thumbs?: Record<string, { url?: string } | undefined>
): string | undefined {
  if (!thumbs || typeof thumbs !== "object") return undefined;
  for (const k of ["maxres", "standard", "high", "medium", "default"]) {
    const u = thumbs[k]?.url;
    if (typeof u === "string" && u.length > 0) return u;
  }
  return undefined;
}

function cleanTitle(raw: unknown): string {
  const t =
    typeof raw === "string"
      ? raw.replace(/\s*\(Official.*?\)/gi, "").replace(/\s*\[Official.*?\]/gi, "").trim()
      : "";
  return t || "Track";
}

function cleanArtist(raw: unknown): string {
  const a = typeof raw === "string" ? raw.replace(/\s*-\s*Topic$/i, "").trim() : "";
  return a || "Artist";
}

/** One playlist item → track. Null when unplayable (deleted/private videos
 *  have no resourceId). Duration injected afterwards in batch. */
export function mapApiItem(item: any, albumTitle: string): ExternalTrack | null {
  if (!item || typeof item !== "object") return null;
  const snippet = item.snippet || {};
  const videoId: unknown =
    snippet?.resourceId?.videoId || item.contentDetails?.videoId;
  if (typeof videoId !== "string" || videoId.length < 5) return null;
  return {
    externalId: videoId,
    provider: "youtube",
    title: cleanTitle(snippet.title),
    artist: cleanArtist(
      snippet.videoOwnerChannelTitle || snippet.channelTitle
    ),
    album: albumTitle,
    durationSeconds: 210,
    coverImageUrl:
      pickApiThumbnail(snippet.thumbnails) ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

async function apiGet(
  path: string,
  params: Record<string, string>,
  key: string
): Promise<any | null> {
  const qs = new URLSearchParams({ ...params, key });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${qs}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.warn(
        `[YouTubeAPI] ${path} failed (${r.status}): ${body.slice(0, 200)}`
      );
      return null;
    }
    return await r.json();
  } catch (err) {
    console.warn("[YouTubeAPI] fetch error:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Full playlist via the official API. Returns null on any failure or when
 * pagination never terminates (caller falls back to today's behavior).
 * Durations come from a batched videos.list (50 ids/call).
 */
export async function fetchPlaylistViaApi(
  playlistId: string,
  keyArg?: string | null
): Promise<ExternalPlaylist | null> {
  const key = keyArg ?? getDataApiKey();
  if (!playlistId || !key) return null;
  let apiCalls = 0;

  const meta = await apiGet("playlists", { part: "snippet", id: playlistId }, key);
  apiCalls++;
  const ms = meta?.items?.[0]?.snippet;
  if (!ms) {
    console.warn(`[YouTubeAPI] playlist ${playlistId}: metadata not found`);
    return null;
  }
  const title = (typeof ms.title === "string" && ms.title.trim()) || "YouTube Playlist";
  const author =
    (typeof ms.channelTitle === "string" && ms.channelTitle.trim()) || "Curated Playlist";

  const tracks: ExternalTrack[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  let guard = 0;
  let terminal = false;
  while (tracks.length < MAX_PLAYLIST_TRACKS && guard < 6) {
    guard++;
    const params: Record<string, string> = {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50",
    };
    if (pageToken) params.pageToken = pageToken;
    const page = await apiGet("playlistItems", params, key);
    apiCalls++;
    if (!page) break;
    const items: any[] = Array.isArray(page.items) ? page.items : [];
    for (const it of items) {
      const t = mapApiItem(it, title);
      if (t && !seen.has(t.externalId)) {
        seen.add(t.externalId);
        tracks.push(t);
      }
      if (tracks.length >= MAX_PLAYLIST_TRACKS) break;
    }
    pageToken = typeof page.nextPageToken === "string" ? page.nextPageToken : undefined;
    if (!pageToken) {
      terminal = true;
      break;
    }
  }
  if (!terminal && tracks.length < MAX_PLAYLIST_TRACKS) {
    console.warn(
      `[YouTubeAPI] playlist ${playlistId}: pagination never terminated (${tracks.length} tracks) — discarding`
    );
    return null;
  }
  if (tracks.length === 0) return null;

  // Batched durations (50 ids/call).
  const ids = tracks.map((t) => t.externalId);
  const durations = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const vids = await apiGet(
      "videos",
      { part: "contentDetails", id: batch.join(",") },
      key
    );
    apiCalls++;
    if (!vids) continue;
    for (const v of Array.isArray(vids.items) ? vids.items : []) {
      const s = parseIsoDuration(v?.contentDetails?.duration);
      if (typeof v?.id === "string" && s >= 0) durations.set(v.id, s);
    }
  }
  for (const t of tracks) {
    const d = durations.get(t.externalId);
    if (typeof d === "number") t.durationSeconds = d;
  }

  console.warn(
    `[YouTubeAPI] playlist ${playlistId}: ${tracks.length} tracks via Data API (~${apiCalls} quota units)`
  );
  return {
    externalId: playlistId,
    provider: "youtube",
    title: title.trim(),
    description:
      (typeof ms.description === "string" && ms.description.slice(0, 200)) ||
      `Imported from YouTube (${tracks.length} tracks)`,
    author,
    coverImageUrl:
      pickApiThumbnail(ms.thumbnails) ||
      tracks[0]?.coverImageUrl ||
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    trackCount: tracks.length,
    tracks: tracks.slice(0, MAX_PLAYLIST_TRACKS),
    externalUrl: `https://music.youtube.com/playlist?list=${playlistId}`,
  };
}
