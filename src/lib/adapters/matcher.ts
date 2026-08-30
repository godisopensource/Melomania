import { MusicResource, TrackMatch, MatchStatus } from "@/types";
import { TrackSearchResult } from "./types";
import { normalizeMusicText, extractVersionLabel } from "../utils";

export const CONFIDENCE_THRESHOLDS = {
  AUTOMATIC: 90, // >= 90: Automatic match
  CONFIRMATION: 70, // 70-89: User confirmation requested
  UNCERTAIN: 0, // < 70: Low confidence / not matched
};

/**
 * Calculates string similarity using Levenshtein distance normalized between 0 and 1
 */
function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1.0;

  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  return 1 - distance / maxLen;
}

/**
 * Calculates a confidence score between 0 and 100 for a candidate match against a source track
 */
export function calculateMatchConfidence(
  source: {
    title: string;
    artistName?: string;
    albumName?: string;
    durationSeconds?: number;
  },
  candidate: TrackSearchResult
): number {
  const normSourceTitle = normalizeMusicText(source.title);
  const normCandidateTitle = normalizeMusicText(candidate.title);

  const normSourceArtist = normalizeMusicText(source.artistName || "");
  const normCandidateArtist = normalizeMusicText(candidate.artist || "");

  // 1. Title similarity (Weight: 45%)
  const titleSim = stringSimilarity(normSourceTitle, normCandidateTitle);

  // 2. Artist similarity (Weight: 35%)
  let artistSim = 0.5; // default neutral if source artist is unknown
  if (normSourceArtist && normCandidateArtist) {
    // Check if one contains the other (for feat. / collaborations)
    if (
      normCandidateArtist.includes(normSourceArtist) ||
      normSourceArtist.includes(normCandidateArtist)
    ) {
      artistSim = 0.95;
    } else {
      artistSim = stringSimilarity(normSourceArtist, normCandidateArtist);
    }
  } else if (!normSourceArtist && normCandidateTitle.toLowerCase().includes(normSourceTitle)) {
    artistSim = 0.8;
  }

  // 3. Duration match (Weight: 15%)
  let durationScore = 0.8; // default
  if (source.durationSeconds && candidate.durationSeconds && source.durationSeconds > 0) {
    const diff = Math.abs(source.durationSeconds - candidate.durationSeconds);
    if (diff <= 3) {
      durationScore = 1.0;
    } else if (diff <= 8) {
      durationScore = 0.9;
    } else if (diff <= 15) {
      durationScore = 0.7;
    } else if (diff <= 30) {
      durationScore = 0.4;
    } else {
      durationScore = 0.1;
    }
  }

  // 4. Version penalty / bonus (Weight: 5%)
  let versionScore = 1.0;
  const sourceVer = extractVersionLabel(source.title);
  const candVer = extractVersionLabel(candidate.title) || candidate.versionLabel;

  if (sourceVer && candVer) {
    if (sourceVer.toLowerCase() !== candVer.toLowerCase()) {
      versionScore = 0.3; // version mismatch (e.g. remix vs original)
    }
  } else if (
    (sourceVer === "Live" && !candVer?.includes("Live")) ||
    (!sourceVer && candVer === "Live")
  ) {
    versionScore = 0.4; // Live vs Studio
  }

  const rawScore =
    titleSim * 45 +
    artistSim * 35 +
    durationScore * 15 +
    versionScore * 5;

  return Math.min(100, Math.max(0, Math.round(rawScore)));
}

/**
 * Evaluates candidate tracks for a given source track and creates a TrackMatch record
 */
export function buildTrackMatch(
  source: MusicResource,
  targetProvider: 'spotify' | 'apple_music',
  candidates: TrackSearchResult[]
): TrackMatch {
  if (!candidates || candidates.length === 0) {
    return {
      id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sourceMusicResourceId: source.id,
      targetProvider,
      targetExternalId: '',
      targetTitle: '',
      targetArtist: '',
      targetDurationSeconds: 0,
      confidenceScore: 0,
      matchStatus: 'not_found',
      matchedBy: 'automatic',
      createdAt: new Date().toISOString(),
    };
  }

  // Score all candidates
  const scored = candidates.map((cand) => ({
    ...cand,
    confidenceScore: calculateMatchConfidence(source, cand),
    versionLabel: extractVersionLabel(cand.title) || cand.versionLabel || 'Original',
  }));

  // Sort descending by confidence score
  scored.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  const best = scored[0];
  const bestScore = best.confidenceScore || 0;

  let status: MatchStatus = 'pending_confirmation';
  if (bestScore >= CONFIDENCE_THRESHOLDS.AUTOMATIC) {
    status = 'automatic';
  } else if (bestScore >= CONFIDENCE_THRESHOLDS.CONFIRMATION) {
    status = 'pending_confirmation';
  } else {
    status = 'pending_confirmation';
  }

  const alternativeMatches = scored.slice(1, 5).map((c) => ({
    externalId: c.externalId,
    title: c.title,
    artist: c.artist,
    album: c.album,
    durationSeconds: c.durationSeconds,
    coverUrl: c.coverImageUrl,
    versionLabel: c.versionLabel,
    confidenceScore: c.confidenceScore || 0,
  }));

  return {
    id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sourceMusicResourceId: source.id,
    sourceResource: source,
    targetProvider,
    targetExternalId: best.externalId,
    targetTitle: best.title,
    targetArtist: best.artist,
    targetAlbum: best.album,
    targetDurationSeconds: best.durationSeconds,
    targetCoverUrl: best.coverImageUrl,
    targetVersionLabel: best.versionLabel,
    confidenceScore: bestScore,
    matchStatus: status,
    matchedBy: status === 'automatic' ? 'automatic' : 'manual',
    alternativeMatches: alternativeMatches.length > 0 ? alternativeMatches : undefined,
    createdAt: new Date().toISOString(),
  };
}
