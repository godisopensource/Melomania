// GET /api/playlists/:id — curated playlist, tracks ALWAYS in sourcePosition order
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { describePlaylistAccess } from "@/lib/playlist-auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const curated = db.getCuratedPlaylist(id);
  if (!curated) {
    return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
  }
  const uncategorized = curated.tracks.filter((t) => !t.categoryId);
  const { ownerId, isOwner } = await describePlaylistAccess(id);
  return NextResponse.json({
    playlist: curated.playlist,
    categories: curated.categories,
    criteria: db.getEmotionalCriteria(id),
    tracks: curated.tracks,
    uncategorized,
    gapComments: db.getGapComments(id),
    ownerId: ownerId ?? null,
    isOwner,
  });
}
