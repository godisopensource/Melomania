// src/lib/gap-comments.ts — shared helpers for editorial gap comments.
//
// Positions (afterSourcePosition):
// - INTRO_POS (-1) ........... intro, before the very first track (Nº 1)
// - 0 .. trackCount - 2 ...... interior, between two consecutive tracks
// - trackCount - 1 ........... conclusion, after the very last track (Nº N)
//
// The conclusion is encoded as "after the last track" so it needs no magic
// sentinel and sorts naturally. It stays unambiguous: interior positions
// never reach trackCount - 1.

import type { GapComment } from "@/types";

/** Intro position: before the first track. */
export const INTRO_GAP_POSITION = -1;

/** True when the comment is the playlist intro (before Nº 1). */
export function isIntroGap(gap: Pick<GapComment, "afterSourcePosition">): boolean {
  return gap.afterSourcePosition === INTRO_GAP_POSITION;
}

/**
 * True when the comment is the playlist conclusion (after the last track).
 * Needs the current track count: conclusion === afterSourcePosition N-1.
 */
export function isOutroGap(
  gap: Pick<GapComment, "afterSourcePosition">,
  trackCount: number
): boolean {
  return trackCount > 0 && gap.afterSourcePosition === trackCount - 1;
}

/** True for interior comments (strictly between two tracks). */
export function isInteriorGap(
  gap: Pick<GapComment, "afterSourcePosition">,
  trackCount: number
): boolean {
  return !isIntroGap(gap) && !isOutroGap(gap, trackCount);
}

/** Short human label: "Intro", "Conclusion" or "Between Nº a & b". */
export function gapShortLabel(
  gap: Pick<GapComment, "afterSourcePosition">,
  trackCount: number
): string {
  if (isIntroGap(gap)) return "Intro";
  if (isOutroGap(gap, trackCount)) return "Conclusion";
  return `Between Nº ${gap.afterSourcePosition + 1} & ${gap.afterSourcePosition + 2}`;
}

/** Contextual sub-label: "Before Nº 1", "After Nº N", or null for interior. */
export function gapEdgeDetail(
  gap: Pick<GapComment, "afterSourcePosition">,
  trackCount: number
): string | null {
  if (isIntroGap(gap)) return "Before Nº 1";
  if (isOutroGap(gap, trackCount)) return `After Nº ${trackCount}`;
  return null;
}

/** Accessible label for opening a comment. */
export function gapAriaLabel(
  gap: Pick<GapComment, "afterSourcePosition">,
  trackCount: number
): string {
  if (isIntroGap(gap)) return "Playlist intro comment. Open to read.";
  if (isOutroGap(gap, trackCount))
    return `Playlist conclusion comment, after track ${trackCount}. Open to read.`;
  return `Comment between tracks ${gap.afterSourcePosition + 1} and ${gap.afterSourcePosition + 2}. Open to read.`;
}
