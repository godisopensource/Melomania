// PATCH / DELETE /api/playlists/:id/criteria/:criterionId — creator only.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlaylistOwner } from "@/lib/playlist-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; criterionId: string }> }
) {
  const { id: playlistId, criterionId } = await params;
  const check = await requirePlaylistOwner(playlistId);
  if (check.error || !check.user) {
    return NextResponse.json({ error: check.error || "You must be signed in." }, { status: check.status || 401 });
  }
  try {
    const body = await req.json();
    const allowed: Record<string, unknown> = {};
    if (body.name !== undefined) allowed.name = String(body.name).slice(0, 40);
    if (body.minLabel !== undefined) allowed.minLabel = String(body.minLabel).slice(0, 40);
    if (body.maxLabel !== undefined) allowed.maxLabel = String(body.maxLabel).slice(0, 40);
    if (body.color !== undefined) allowed.color = String(body.color).slice(0, 20);
    const updated = db.updateEmotionalCriterion(criterionId, allowed);
    if (!updated) return NextResponse.json({ error: "Criterion not found." }, { status: 404 });
    return NextResponse.json({ criterion: updated });
  } catch {
    return NextResponse.json({ error: "Error updating criterion." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; criterionId: string }> }
) {
  const { id: playlistId, criterionId } = await params;
  const check = await requirePlaylistOwner(playlistId);
  if (check.error || !check.user) {
    return NextResponse.json({ error: check.error || "You must be signed in." }, { status: check.status || 401 });
  }
  const ok = db.deleteEmotionalCriterion(criterionId);
  if (!ok) return NextResponse.json({ error: "Criterion not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
