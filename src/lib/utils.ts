import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format seconds into mm:ss or hh:mm:ss
 */
export function formatTime(seconds: number | null | undefined): string {
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

/**
 * Parse a string like "1:32", "01:32", "92", "1h02m30s" to seconds
 */
export function parseTimeToSeconds(input: string): number {
  if (!input) return 0;
  const cleaned = input.trim().toLowerCase();

  if (cleaned.includes(":")) {
    const parts = cleaned.split(":").map((p) => parseInt(p, 10) || 0);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
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

/**
 * Relative date in English
 */
export function formatRelativeDate(dateString: string): string {
  try {
    const date = parseISO(dateString);
    return formatDistanceToNow(date, { addSuffix: true, locale: enUS });
  } catch {
    return dateString;
  }
}

/**
 * Text normalizer for music titles/artists matching
 */
export function normalizeMusicText(text: string): string {
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

/**
 * Extract version labels like 'remix', 'live', 'acoustic', 'radio edit', 'remastered'
 */
export function extractVersionLabel(text: string): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (lower.includes("remix")) return "Remix";
  if (lower.includes("live")) return "Live";
  if (lower.includes("acoustic")) return "Acoustic";
  if (lower.includes("radio edit")) return "Radio Edit";
  if (lower.includes("remaster")) return "Remastered";
  if (lower.includes("instrumental")) return "Instrumental";
  if (lower.includes("orchestral")) return "Orchestral";
  return "Original";
}

/**
 * Extracts tags from YouTube track/playlist metadata
 * Uses title and artist words as tags
 */
export function extractYouTubeTags(
  track?: { title: string; artist: string; album?: string },
  playlistTitle?: string
): string[] {
  const tags: string[] = [];

  if (track) {
    // Extract from track title - split by " - " to separate artist and title
    const titleParts = track.title.split(" - ");
    const artist = titleParts[0]?.trim();
    const songTitle = titleParts.slice(1).join(" - ")?.trim() || track.title;

    // Add artist name words as tags (if meaningful)
    if (artist && artist !== "YouTube Artist") {
      const artistWords = artist
        .split(" ")
        .map((w) => w.toLowerCase())
        .filter((w) => w.length >= 3 && !["the", "and", "of", "in", "for", "you", "my", "feel"].includes(w.toLowerCase()));
      tags.push(...artistWords.slice(0, 3));
    }

    // Add song title words as tags
    const titleWords = songTitle
      .split(" ")
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
      .filter((w) => w.length >= 3);
    tags.push(...titleWords.slice(0, 5));
  }

  // Add playlist title words as tags
  if (playlistTitle) {
    const plWords = playlistTitle
      .split(" ")
      .map((w) => w.toLowerCase())
      .filter((w) => w.length >= 3);
    tags.push(...plWords.slice(0, 5));
  }

  // Deduplicate and limit
  return [...new Set(tags)].slice(0, 8);
}

/**
 * Extracts YouTube Video ID or Playlist ID from URL
 */
export function parseYouTubeUrl(url: string): { videoId?: string; playlistId?: string; timecode?: number } {
  if (!url) return {};
  const cleaned = url.trim();

  let videoId: string | undefined;
  let playlistId: string | undefined;
  let timecode: number | undefined;

  // Extract playlist ID (e.g. list=PLcYJaHm-lMGA)
  const listMatch = cleaned.match(/[?&]list=([^#&?]+)/);
  if (listMatch) {
    playlistId = listMatch[1];
  }

  // Extract timecode: t=92 or t=1m32s
  const tMatch = cleaned.match(/[?&]t=([^#&?]+)/);
  if (tMatch) {
    timecode = parseTimeToSeconds(tMatch[1]);
  }

  // Match youtube.com/watch?v=ID or music.youtube.com/watch?v=ID or youtu.be/ID
  const watchMatch = cleaned.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([^#&?]+)/);
  if (watchMatch) {
    videoId = watchMatch[1];
  }

  return { videoId, playlistId, timecode };
}