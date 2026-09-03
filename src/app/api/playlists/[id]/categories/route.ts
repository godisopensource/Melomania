// /api/playlists/:id/categories — manual category management (creator only for writes)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlaylistOwner } from "@/lib/playlist-auth";

const PALETTE = ["#AF3535", "#D9A441", "#4FA3A3", "#7A6FF0", "#5FA85F", "#C97BA8", "#E4BCBC", "#8A8F98"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json({ categories: await db.getPlaylistCategories(id) });
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
  const curated = await db.getCuratedPlaylist(playlistId);
  if (!curated) return NextResponse.json({ error: "Playlist not found." }, { status: 404 });

  try {
    const body = await req.json();
    const { name, description, color } = body;
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Category name is required." }, { status: 400 });
    }
    const existing = await db.getPlaylistCategories(playlistId);
    const now = new Date().toISOString();
    const cat = await db.createPlaylistCategory({
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      playlistId,
      name: String(name).trim().slice(0, 60),
      description: description ? String(description).slice(0, 200) : undefined,
      color: color || PALETTE[existing.length % PALETTE.length],
      position: existing.length,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ category: cat }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "Error creating category." }, { status: 500 });
  }
}
