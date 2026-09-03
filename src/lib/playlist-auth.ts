// src/lib/playlist-auth.ts — ownership + chronological category rules.
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MusicResource, User } from "@/types";

export interface OwnerCheck {
  user?: User;
  ownerId?: string;
  error?: string;
  status?: number;
}

/** Only the share creator (or an admin) may edit curation. Others get read-only vinyl. */
export async function requirePlaylistOwner(playlistId: string): Promise<OwnerCheck> {
  const user = await getSessionUser();
  if (!user) return { error: "You must be signed in.", status: 401 };
  const share = await db.getShareByResourceId(playlistId);
  const ownerId = share?.authorId;
  if (share && share.authorId !== user.id && user.role !== "admin") {
    return { user, ownerId, error: "Only the playlist creator can edit this.", status: 403 };
  }
  return { user, ownerId };
}

export async function describePlaylistAccess(
  playlistId: string
): Promise<{ ownerId?: string; isOwner: boolean }> {
  const user = await getSessionUser();
  const share = await db.getShareByResourceId(playlistId);
  const ownerId = share?.authorId;
  const isOwner = !!user && (!share || share.authorId === user.id || user.role === "admin");
  return { ownerId, isOwner };
}

/**
 * Categories must stay chronological: all tracks sharing a category
 * must occupy consecutive source positions. Returns true when the
 * simulated assignment would break that rule.
 */
export function wouldBreakChronology(
  tracks: MusicResource[],
  trackId: string,
  nextCategoryId: string | null
): boolean {
  const byCat = new Map<string, number[]>();
  for (const t of tracks) {
    const cat = t.id === trackId ? nextCategoryId : t.categoryId;
    if (!cat) continue;
    const arr = byCat.get(cat) ?? [];
    arr.push(t.sourcePosition ?? 0);
    byCat.set(cat, arr);
  }
  for (const positions of byCat.values()) {
    positions.sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] - positions[i - 1] !== 1) return true;
    }
  }
  return false;
}
