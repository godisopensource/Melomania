// PATCH / DELETE /api/tracks/notes/:noteId
// Initial editorial notes are frozen: 403 on any edit/delete attempt.
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { noteId } = await params;
  try {
    const body = await req.json();
    if (!body.body || !String(body.body).trim()) {
      return NextResponse.json({ error: "Note body is required." }, { status: 400 });
    }
    const updated = db.updateTrackNote(noteId, { body: String(body.body).trim().slice(0, 5000) }, user.id);
    if (!updated) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    return NextResponse.json({ note: updated });
  } catch (e: any) {
    const msg = e?.message || "Error updating note.";
    const locked = msg.includes("cannot be edited or deleted");
    return NextResponse.json({ error: msg }, { status: locked ? 403 : 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { noteId } = await params;
  try {
    const ok = db.deleteTrackNote(noteId);
    if (!ok) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Error deleting note.";
    const locked = msg.includes("cannot be edited or deleted");
    return NextResponse.json({ error: msg }, { status: locked ? 403 : 500 });
  }
}
