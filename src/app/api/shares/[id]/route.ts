import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const share = db.getMusicShareById(id);

  if (!share) {
    return NextResponse.json({ error: "Partage introuvable." }, { status: 404 });
  }

  const thread = db.getConversationThreadById(share.conversationId);
  const comments = db.getCommentsByConversationId(share.conversationId);
  const participants = db.getParticipantsByConversationId(share.conversationId);
  const sources = db.getMusicSourcesByResourceId(share.resourceId);

  return NextResponse.json({
    share,
    thread,
    comments,
    participants,
    sources,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const share = db.getMusicShareById(id);

  if (!share) {
    return NextResponse.json({ error: "Partage introuvable" }, { status: 404 });
  }

  if (share.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Permission refusée" }, { status: 403 });
  }

  db.deleteMusicShare(id);
  return NextResponse.json({ success: true });
}
