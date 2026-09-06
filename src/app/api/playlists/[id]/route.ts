// GET /api/playlists/:id — curated playlist, tracks ALWAYS in sourcePosition order
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { toPublicUser } from "@/lib/security";
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
  // Sharing panel data (owner-only fields are filtered client-side, but the
  // full allowedUsers list is only useful to the owner — still safe: public users).
  const allowedUsers = [];
  if (share) {
    for (const uid of share.allowedUserIds || []) {
      const u = await db.getUserById(uid);
      if (u) allowedUsers.push(toPublicUser(u));
    }
  }
  return NextResponse.json({
    playlist: curated.playlist,
    categories: curated.categories,
    criteria: await db.getEmotionalCriteria(id),
    tracks: curated.tracks,
    uncategorized,
    gapComments: await db.getGapComments(id),
    ownerId: ownerId ?? null,
    isOwner,
    share: share
      ? {
          id: share.id,
          authorId: share.authorId,
          visibility: share.visibility,
          allowedUserIds: share.allowedUserIds || [],
        }
      : null,
    allowedUsers,
  });
}

/** DELETE /api/playlists/:id — owner (or admin) deletes the playlist share + conversation. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  const { id } = await params;
  const share = await db.getShareByResourceId(id);
  if (!share) {
    return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
  }
  if (share.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Only the playlist creator can delete this." }, { status: 403 });
  }
  await db.deleteShareCascade(share.id);
  return NextResponse.json({ success: true });
}
