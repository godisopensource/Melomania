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

            const thumbnail =
              l.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url ||
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

      const coverImageUrl =
        tracks[0]?.coverImageUrl ||
        "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80";

      return {
        externalId: id,
        provider: "youtube",
        title: title.trim(),
        description: `Imported from YouTube (${tracks.length} tracks)`,
        author: author || "Curated Playlist",
        coverImageUrl,
        trackCount: tracks.length,
        tracks,
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
