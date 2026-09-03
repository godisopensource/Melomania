// GET + POST /api/playlists/:id/gap-comments — comments between two tracks.
// Creation is reserved for the playlist creator.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlaylistOwner } from "@/lib/playlist-auth";
import { GapComment } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json({ gapComments: db.getGapComments(id) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: playlistId } = await params;
  const check = await requirePlaylistOwner(playlistId);
  if (check.error || !check.user) {
    return NextResponse.json({ error: check.error || "You must be signed in." }, { status: check.status || 401 });
  }

  try {
    const body = await req.json();
    const { afterSourcePosition, body: text } = body;
    if (!text || !String(text).trim()) {
      return NextResponse.json({ error: "Comment body is required." }, { status: 400 });
    }
    const curated = db.getCuratedPlaylist(playlistId);
    const count = curated?.tracks.length ?? 0;
    const pos = Number(afterSourcePosition);
    // Sits between track `pos` and `pos + 1`.
    if (!Number.isInteger(pos) || pos < 0 || (count > 0 && pos > count - 2)) {
      return NextResponse.json({ error: "Invalid position for this comment." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const gap: GapComment = {
      id: `gap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      playlistId,
      afterSourcePosition: pos,
      authorId: check.user.id,
      body: String(text).trim().slice(0, 1000),
      createdAt: now,
      updatedAt: now,
    };
    const saved = db.createGapComment(gap);
    return NextResponse.json({ gapComment: saved }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error saving comment." }, { status: 500 });
  }
}
