// GET /api/playlists/:id — curated playlist, tracks ALWAYS in sourcePosition order
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { describePlaylistAccess } from "@/lib/playlist-auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const curated = await db.getCuratedPlaylist(id);
  if (!curated) {
    return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
  }
  // Same visibility rule as shares: a private share's playlist stays private.
  const share = await db.getShareByResourceId(id);
  if (share) {
    const viewer = await getSessionUser();
    if (!await db.isShareVisibleTo(share, viewer?.id)) {
      return NextResponse.json({ error: "This playlist is private." }, { status: 403 });
    }
  }
  const uncategorized = curated.tracks.filter((t) => !t.categoryId);
  const { ownerId, isOwner } = await describePlaylistAccess(id);
  return NextResponse.json({
    playlist: curated.playlist,
    categories: curated.categories,
    criteria: await db.getEmotionalCriteria(id),
    tracks: curated.tracks,
    uncategorized,
    gapComments: await db.getGapComments(id),
    ownerId: ownerId ?? null,
    isOwner,
  });
}
