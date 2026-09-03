// PATCH / DELETE /api/playlists/:id/categories/:catId — creator only
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlaylistOwner } from "@/lib/playlist-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; catId: string }> }
) {
  const { id: playlistId, catId } = await params;
  const check = await requirePlaylistOwner(playlistId);
  if (check.error || !check.user) {
    return NextResponse.json({ error: check.error || "You must be signed in." }, { status: check.status || 401 });
  }
  try {
    const body = await req.json();
    const allowed: Record<string, unknown> = {};
    if (body.name !== undefined) allowed.name = String(body.name).slice(0, 60);
    if (body.description !== undefined) allowed.description = String(body.description).slice(0, 200);
    if (body.color !== undefined) allowed.color = String(body.color).slice(0, 20);
    if (body.position !== undefined && Number.isFinite(Number(body.position))) {
      allowed.position = Number(body.position);
    }
    const updated = await db.updatePlaylistCategory(catId, allowed);
    if (!updated) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json({ category: updated });
  } catch {
    return NextResponse.json({ error: "Error updating category." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; catId: string }> }
) {
  const { id: playlistId, catId } = await params;
  const check = await requirePlaylistOwner(playlistId);
  if (check.error || !check.user) {
    return NextResponse.json({ error: check.error || "You must be signed in." }, { status: check.status || 401 });
  }
  const ok = await db.deletePlaylistCategory(catId);
  if (!ok) return NextResponse.json({ error: "Category not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
