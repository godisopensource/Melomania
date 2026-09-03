// GET + POST /api/playlists/:id/criteria — custom emotional criteria.
// Writes are reserved for the playlist creator.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlaylistOwner } from "@/lib/playlist-auth";

const PALETTE = ["#7A6FF0", "#5FA85F", "#C97BA8", "#D97941", "#4FA3A3", "#E4BCBC", "#9BBFE8"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json({ criteria: db.getEmotionalCriteria(id) });
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
  const curated = db.getCuratedPlaylist(playlistId);
  if (!curated) return NextResponse.json({ error: "Playlist not found." }, { status: 404 });

  try {
    const body = await req.json();
    const { name, minLabel, maxLabel, color } = body;
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Criterion name is required." }, { status: 400 });
    }
    if (!minLabel || !String(minLabel).trim() || !maxLabel || !String(maxLabel).trim()) {
      return NextResponse.json({ error: "Labels for both ends (min and max) are required." }, { status: 400 });
    }
    const existing = db.getEmotionalCriteria(playlistId);
    const now = new Date().toISOString();
    const criterion = db.createEmotionalCriterion({
      id: `crit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      playlistId,
      name: String(name).trim().slice(0, 40),
      minLabel: String(minLabel).trim().slice(0, 40),
      maxLabel: String(maxLabel).trim().slice(0, 40),
      color: color || PALETTE[existing.length % PALETTE.length],
      position: existing.length,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ criterion }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error creating criterion." }, { status: 500 });
  }
}
