import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const comment = db.getCommentById(id);
  if (!comment) {
    return NextResponse.json({ error: "Commentaire introuvable" }, { status: 404 });
  }

  if (comment.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });
  }

  const body = await req.json();
  const updated = db.updateComment(id, {
    body: body.body,
    startTimeSeconds: body.startTimeSeconds !== undefined ? body.startTimeSeconds : comment.startTimeSeconds,
    endTimeSeconds: body.endTimeSeconds !== undefined ? body.endTimeSeconds : comment.endTimeSeconds,
  });

  return NextResponse.json({ comment: updated });
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
  const comment = db.getCommentById(id);
  if (!comment) {
    return NextResponse.json({ error: "Commentaire introuvable" }, { status: 404 });
  }

  if (comment.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });
  }

  db.deleteComment(id);
  return NextResponse.json({ success: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { emoji } = body;

  if (!emoji) {
    return NextResponse.json({ error: "Emoji manquant" }, { status: 400 });
  }

  const updated = db.toggleCommentReaction(id, emoji, user.id);
  return NextResponse.json({ comment: updated });
}
