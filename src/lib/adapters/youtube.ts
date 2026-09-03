import { MusicProviderAdapter, TrackSearchInput, TrackSearchResult, ExternalTrack, ExternalPlaylist, CreatePlaylistInput, AddTracksResult } from "./types";
import { parseYouTubeUrl, normalizeMusicText } from "../utils";

function parseDurationText(text?: string): number {
  if (!text) return 210;
  let dur = 0;
  const hourMatch = text.match(/(\d+)\s*(?:hour|hours|heure|heures|h)/i);
  const minMatch = text.match(/(\d+)\s*(?:minute|minutes|min|m)/i);
  const secMatch = text.match(/(\d+)\s*(?:second|seconds|sec|s)/i);
  if (hourMatch) dur += parseInt(hourMatch[1], 10) * 3600;
  if (minMatch) dur += parseInt(minMatch[1], 10) * 60;
  if (secMatch) dur += parseInt(secMatch[1], 10);
  return dur > 0 ? dur : 210;
}

/** Maximum tracks imported from a single YouTube playlist. */
export const MAX_PLAYLIST_TRACKS = 200;

/** Finds a playlist continuation token (scoped node only — safe scope). */
function findPlaylistContinuation(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  if (obj.continuationItemRenderer) {
    const token =
      obj.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
    if (typeof token === "string" && token.length > 0) return token;
  }
  // Classic playlistVideoListRenderer.continuations shape.
  if (typeof obj.continuation === "string" && obj.continuation.length > 0) {
    return obj.continuation;
  }
  if (obj.nextContinuationData && typeof obj.nextContinuationData.continuation === "string") {
    return obj.nextContinuationData.continuation;
  }
  if (
    obj.continuationEndpoint?.continuationCommand &&
    typeof obj.continuationEndpoint.continuationCommand.token === "string"
  ) {
    return obj.continuationEndpoint.continuationCommand.token;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findPlaylistContinuation(item);
      if (found) return found;
    }
    return null;
  }
  for (const k of Object.keys(obj)) {
    // Skip video metadata subtrees: tokens there belong to other features.
    if (k === "playlistVideoRenderer" || k === "lockupViewModel") continue;
    const found = findPlaylistContinuation(obj[k]);
    if (found) return found;
  }
  return null;
}

/** Locates the playlist video list node so continuation tokens stay in scope. */
function findVideoListNode(obj: any): any | null {
  if (!obj || typeof obj !== "object") return null;
  if (
    obj.playlistVideoListRenderer ||
    obj.playlistVideoListContinuation ||
    obj.musicPlaylistShelfRenderer
  )
    return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findVideoListNode(item);
      if (found) return found;
    }
    return null;
  }
  for (const k of Object.keys(obj)) {
    const found = findVideoListNode(obj[k]);
    if (found) return found;
  }
  return null;
}

/**
 * One bounded pass over a browse response: top-level contents keys plus
 * hit counts for the renderers we understand. Used for terminal diagnostics
 * when no usable video list is found.
 */
function diagnoseBrowse(vl: any): string {
  const stats = {
    contentsKeys: [] as string[],
    playlistVideoRenderer: 0,
    musicResponsiveListItemRenderer: 0,
    musicPlaylistShelfRenderer: 0,
    playlistVideoListRenderer: 0,
    error: "",
  };
  if (!vl || typeof vl !== "object") return "empty/non-object response";
  if ((vl as any)?.error) {
    stats.error = JSON.stringify((vl as any).error).slice(0, 300);
  }
  const contents = (vl as any).contents;
  if (contents && typeof contents === "object" && !Array.isArray(contents)) {
    stats.contentsKeys = Object.keys(contents).slice(0, 12);
  }
  const stack: any[] = [vl];
  let visited = 0;
  while (stack.length > 0 && visited < 60000) {
    const node = stack.pop();
    visited++;
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    if (node.playlistVideoRenderer && stats.playlistVideoRenderer < 1000) {
      stats.playlistVideoRenderer++;
    }
    if (node.musicResponsiveListItemRenderer && stats.musicResponsiveListItemRenderer < 1000) {
      stats.musicResponsiveListItemRenderer++;
    }
    if (node.musicPlaylistShelfRenderer) stats.musicPlaylistShelfRenderer++;
    if (node.playlistVideoListRenderer) stats.playlistVideoListRenderer++;
    for (const k of Object.keys(node)) stack.push(node[k]);
  }
  return (
    `contentsKeys=[${stats.contentsKeys.join("|")}] ` +
    `playlistVideoRenderer~${stats.playlistVideoRenderer} ` +
    `musicItems~${stats.musicResponsiveListItemRenderer} ` +
    `musicShelves=${stats.musicPlaylistShelfRenderer} ` +
    `videoLists=${stats.playlistVideoListRenderer}` +
    (stats.error ? ` error=${stats.error}` : "")
  );
}

export class YouTubeAdapter implements MusicProviderAdapter {
  provider = "youtube" as const;

  /**
   * Fetches metadata for a YouTube video URL or ID
   */
  async getTrack(externalIdOrUrl: string): Promise<ExternalTrack | null> {
    const { videoId } = parseYouTubeUrl(externalIdOrUrl);
    const id = videoId || externalIdOrUrl;

    if (!id || id.length < 5) return null;

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
      const res = await fetch(oembedUrl, { next: { revalidate: 3600 } });
      
      let title = "Unknown Title";
      let artist = "YouTube Artist";
      let coverImageUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      if (res.ok) {
        const data = await res.json();
        const rawTitle: string = data.title || "Unknown Title";
        artist = data.author_name || "YouTube Artist";

        if (rawTitle.includes(" - ")) {
          const parts = rawTitle.split(" - ");
          artist = parts[0].trim();
          title = parts.slice(1).join(" - ").trim();
        } else if (rawTitle.includes(" – ")) {
          const parts = rawTitle.split(" – ");
          artist = parts[0].trim();
          title = parts.slice(1).join(" – ").trim();
        } else {
          title = rawTitle;
        }

        if (data.thumbnail_url) {
          coverImageUrl = data.thumbnail_url;
        }
      }

      return {
        externalId: id,
        provider: "youtube",
        title: title.replace(/\s*\(Official.*?\)/gi, "").replace(/\s*\[Official.*?\]/gi, "").trim(),
        artist: artist.replace(/\s*-\s*Topic$/i, "").trim(),
        album: "Single",
        durationSeconds: 230,
        coverImageUrl,
        externalUrl: `https://www.youtube.com/watch?v=${id}`,
      };
    } catch (err) {
      console.error("Error fetching YouTube track metadata:", err);
      return {
        externalId: id,
        provider: "youtube",
        title: `YouTube Track (${id})`,
        artist: "YouTube",
        durationSeconds: 230,
        coverImageUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        externalUrl: `https://www.youtube.com/watch?v=${id}`,
      };
    }
  }

  /**
   * Fetches full playlist items from YouTube / YouTube Music
   */
  async getPlaylist(externalIdOrUrl: string): Promise<ExternalPlaylist | null> {
    const { playlistId } = parseYouTubeUrl(externalIdOrUrl);
    const id = playlistId || externalIdOrUrl;

    if (!id) return null;

    try {
      const playlistUrl = `https://www.youtube.com/playlist?list=${id}`;
      const res = await fetch(playlistUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch playlist page (${res.status})`);
      }

      const html = await res.text();
      const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);

      if (!match) {
        throw new Error("Unable to parse ytInitialData from YouTube playlist page.");
      }

      const data = JSON.parse(match[1]);

      // Extract Playlist Title & Author
      let title = data.metadata?.playlistMetadataRenderer?.title;
      let author = "";
      if (!title) {
        title =
          data.header?.playlistHeaderRenderer?.title?.simpleText ||
          data.header?.pageHeaderRenderer?.pageTitle ||
          data.microformat?.microformatDataRenderer?.title ||
          "YouTube Playlist";
      }

      // Search all tracks in the response tree
      const tracks: ExternalTrack[] = [];
      const seenIds = new Set<string>();

      const searchTree = (obj: any) => {
        if (!obj || typeof obj !== "object") return;

        // Legacy playlistVideoRenderer
        if (obj.playlistVideoRenderer) {
          const p = obj.playlistVideoRenderer;
          const videoId = p.videoId;
          if (videoId && !seenIds.has(videoId)) {
            seenIds.add(videoId);
            const trackTitle = (p.title?.runs?.[0]?.text || p.title?.simpleText || "Track")
              .replace(/\s*\(Official.*?\)/gi, "")
              .replace(/\s*\[Official.*?\]/gi, "")
              .trim();
            const artist = (p.shortBylineText?.runs?.[0]?.text || "Artist")
              .replace(/\s*-\s*Topic$/i, "")
              .trim();
            const lengthSeconds = parseInt(p.lengthSeconds, 10) || 210;
            const thumbnail =
              p.thumbnail?.thumbnails?.[p.thumbnail.thumbnails.length - 1]?.url ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            tracks.push({
              externalId: videoId,
              provider: "youtube",
              title: trackTitle,
              artist,
              album: title,
              durationSeconds: lengthSeconds,
              coverImageUrl: thumbnail,
              externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
            });
          }
        }

        // Modern lockupViewModel
        if (
          obj.lockupViewModel &&
          obj.lockupViewModel.contentId &&
          obj.lockupViewModel.contentType === "LOCKUP_CONTENT_TYPE_VIDEO"
        ) {
          const l = obj.lockupViewModel;
          const videoId = l.contentId;
          if (videoId && !seenIds.has(videoId)) {
            seenIds.add(videoId);
            const meta = l.metadata?.lockupMetadataViewModel;
            const trackTitle = (meta?.title?.content || "Track")
              .replace(/\s*\(Official.*?\)/gi, "")
              .replace(/\s*\[Official.*?\]/gi, "")
              .trim();

            let artist = "Artist";
            const lines = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
            if (lines[0]?.metadataParts?.[0]?.text?.content) {
              artist = lines[0].metadataParts[0].text.content.replace(/\s*-\s*Topic$/i, "").trim();
            }

            const labelText = l.rendererContext?.accessibilityContext?.label || "";
            const durationSeconds = parseDurationText(labelText);

            // Largest source available (best cover quality).
            const imgSources = l.contentImage?.thumbnailViewModel?.image?.sources || [];
            const thumbnail =
              imgSources[imgSources.length - 1]?.url ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            tracks.push({
              externalId: videoId,
              provider: "youtube",
              title: trackTitle,
              artist,
              album: title,
              durationSeconds,
              coverImageUrl: thumbnail,
              externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
            });
          }
        }

        // YouTube Music shelf items (musicResponsiveListItemRenderer)
        if (obj.musicResponsiveListItemRenderer) {
          const m = obj.musicResponsiveListItemRenderer;
          const videoId =
            m.playlistItemData?.videoId ||
            m.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
              ?.playNavigationEndpoint?.watchEndpoint?.videoId;
          if (videoId && !seenIds.has(videoId)) {
            seenIds.add(videoId);
            const colText = (c: any) =>
              c?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
                ?.map((r: any) => r.text || "")
                .join("") ||
              c?.musicResponsiveListItemFlexColumnRenderer?.text?.simpleText ||
              "";
            const trackTitle = (colText((m.flexColumns || [])[0]) || "Track")
              .replace(/\s*\(Official.*?\)/gi, "")
              .replace(/\s*\[Official.*?\]/gi, "")
              .trim();
            const artist = (colText((m.flexColumns || [])[1]) || "Artist")
              .replace(/\s*-\s*Topic$/i, "")
              .trim();

            let durationSeconds = 210;
            for (const f of m.fixedColumns || []) {
              const fr = f?.musicResponsiveListItemFixedColumnRenderer?.text;
              const t =
                fr?.runs?.map((r: any) => r.text || "").join("") || fr?.simpleText || "";
              const s = parseDurationText(t);
              if (t && /[\d:]{2,}/.test(t) && s > 0) durationSeconds = s;
            }

            const imgSources =
              m.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
            const thumbnail =
              imgSources[imgSources.length - 1]?.url ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            tracks.push({
              externalId: videoId,
              provider: "youtube",
              title: trackTitle,
              artist,
              album: title,
              durationSeconds,
              coverImageUrl: thumbnail,
              externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
            });
          }
        }

        for (const k of Object.keys(obj)) {
          searchTree(obj[k]);
        }
      };

      searchTree(data);

      // The initial HTML only embeds the first ~100 items and often carries
      // NO continuation token (YouTube issues it on scroll). To go further,
      // query the browse API directly with browseId "VL<playlistId>", which
      // returns the list together with a continuation token, then follow it.
      const apiKey = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1];
      const clientVersion =
        html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1] || "2.20250101.00.00";

      const browse = async (
        body: Record<string, unknown>,
        clientName = "WEB",
        clientVer = clientVersion
      ): Promise<any | null> => {
        if (!apiKey) return null;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20000);
          const r = await fetch(
            `https://www.youtube.com/youtubei/v1/browse?key=${apiKey}&prettyPrint=false`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "User-Agent":
                  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Origin: "https://www.youtube.com",
              },
              body: JSON.stringify({
                context: {
                  client: { clientName, clientVersion: clientVer, hl: "en", gl: "US" },
                },
                ...body,
              }),
              signal: controller.signal,
            }
          );
          clearTimeout(timeout);
          if (!r.ok) {
            console.warn(`[YouTube] browse request failed (${r.status}) [${clientName}]`);
            return null;
          }
          return await r.json();
        } catch (err) {
          console.warn("[YouTube] browse fetch error:", err);
          return null;
        }
      };

      // Ingests a video-list node's contents (pushes videos, returns next token).
      // Handles classic playlistVideoListRenderer and musicPlaylistShelfRenderer.
      const ingestVideoList = (node: any): string | null => {
        if (!node || typeof node !== "object") return null;
        const list =
          node.playlistVideoListRenderer ||
          node.playlistVideoListContinuation ||
          node.musicPlaylistShelfRenderer;
        const contents: any[] = Array.isArray(list?.contents) ? list.contents : [];
        for (const item of contents) {
          if (
            item?.playlistVideoRenderer ||
            item?.lockupViewModel ||
            item?.musicResponsiveListItemRenderer
          ) {
            searchTree(item);
          }
          if (tracks.length >= MAX_PLAYLIST_TRACKS) break;
        }
        let token: string | null = null;
        for (const item of contents) {
          if (
            item?.playlistVideoRenderer ||
            item?.lockupViewModel ||
            item?.musicResponsiveListItemRenderer
          )
            continue;
          token = findPlaylistContinuation(item);
          if (token) break;
        }
        if (!token && list) token = findPlaylistContinuation({ continuations: list.continuations });
        return token;
      };

      // Ingests continuation action payloads (append + reload shapes),
      // including the music-shelf continuationContents shape.
      const ingestActions = (json: any): string | null => {
        if (!json || typeof json !== "object") return null;
        const shelf = json?.continuationContents?.musicPlaylistShelfContinuation;
        if (shelf) {
          const token = ingestVideoList({ musicPlaylistShelfRenderer: shelf });
          if (token || tracks.length >= MAX_PLAYLIST_TRACKS) return token;
        }
        const actionLists = [
          ...(json?.onResponseReceivedActions || []),
          ...(json?.onResponseReceivedEndpoints || []),
        ];
        let token: string | null = null;
        for (const a of actionLists) {
          const buckets = [
            a?.appendContinuationItemsAction?.continuationItems,
            a?.reloadContinuationItemsAction?.continuationItems,
          ];
          for (const items of buckets) {
            if (!Array.isArray(items)) continue;
            for (const item of items) {
              if (
                item?.playlistVideoRenderer ||
                item?.lockupViewModel ||
                item?.musicResponsiveListItemRenderer
              ) {
                searchTree(item);
              } else if (!token) {
                token = findPlaylistContinuation(item);
                if (!token) {
                  const conts = item?.playlistVideoListContinuation?.continuations;
                  if (Array.isArray(conts)) {
                    for (const c of conts) {
                      token = findPlaylistContinuation(c);
                      if (token) break;
                    }
                  }
                }
              }
              if (tracks.length >= MAX_PLAYLIST_TRACKS) break;
            }
          }
        }
        return token;
      };

      let continuation = findPlaylistContinuation(
        findVideoListNode(data) || data
      );
      console.warn(
        `[YouTube] playlist ${id}: ${tracks.length} tracks in initial page` +
          (continuation ? ", continuation found" : ", no continuation token in HTML")
      );

      // No token in HTML but the list may be truncated: open the list via
      // browseId "VL<id>" to obtain one. Falls back to the YouTube Music
      // web client when the main client returns no usable list.
      if (!continuation && tracks.length >= 95 && tracks.length < MAX_PLAYLIST_TRACKS) {
        const tryClients: Array<[string, string]> = [
          ["WEB", clientVersion],
          ["WEB_REMIX", "1.20250101.00.00"],
        ];
        for (const [clientName, clientVer] of tryClients) {
          const vl = await browse({ browseId: `VL${id}` }, clientName, clientVer);
          if (!vl) continue;
          const node = findVideoListNode(vl);
          if (node) {
            continuation = ingestVideoList(node);
            console.warn(
              `[YouTube] playlist ${id}: ${tracks.length} tracks after VL browse [${clientName}]` +
                (continuation ? ", continuation found" : ", list complete")
            );
            break;
          }
          const keys = vl && typeof vl === "object" ? Object.keys(vl).slice(0, 12).join(",") : typeof vl;
          const errMsg =
            (vl as any)?.error?.message || (vl as any)?.error?.code || "no video list node";
          console.warn(
            `[YouTube] playlist ${id}: no video list in VL browse response [${clientName}] (keys: ${keys}; ${errMsg}; diag: ${diagnoseBrowse(vl)})`
          );
        }
      }

      if (continuation && tracks.length < MAX_PLAYLIST_TRACKS) {
        let guard = 0;
        while (continuation && tracks.length < MAX_PLAYLIST_TRACKS && guard < 8) {
          guard++;
          const json = await browse({ continuation });
          if (!json) break;
          continuation = ingestActions(json);
          console.warn(`[YouTube] playlist ${id}: ${tracks.length} tracks after page ${guard}`);
        }
      }

      const trimmedTracks = tracks.slice(0, MAX_PLAYLIST_TRACKS);

      const coverImageUrl =
        trimmedTracks[0]?.coverImageUrl ||
        "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80";

      return {
        externalId: id,
        provider: "youtube",
        title: title.trim(),
        description: `Imported from YouTube (${trimmedTracks.length} tracks)`,
        author: author || "Curated Playlist",
        coverImageUrl,
        trackCount: trimmedTracks.length,
        tracks: trimmedTracks,
        externalUrl: `https://www.youtube.com/playlist?list=${id}`,
      };
    } catch (err) {
      console.error("Error extracting YouTube playlist:", err);
      return null;
    }
  }

  async searchTrack(input: TrackSearchInput): Promise<TrackSearchResult[]> {
    return [];
  }

  async createPlaylist(input: CreatePlaylistInput): Promise<ExternalPlaylist> {
    throw new Error("YouTube playlist creation is not supported for export.");
  }

  async addTracks(playlistId: string, trackIds: string[]): Promise<AddTracksResult> {
    throw new Error("Adding tracks to YouTube playlists is not supported.");
  }
}
