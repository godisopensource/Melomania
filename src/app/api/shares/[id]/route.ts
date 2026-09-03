// src/app/api/shares/[id]/route.ts — /api/shares/:id : consultation/suppression d'un partage

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewer = await getSessionUser();
  const share = db.getMusicShareById(id, viewer?.id);

  if (!share) {
    return NextResponse.json({ error: "Share not found." }, { status: 404 });
  }

  if (!db.isShareVisibleTo(share, viewer?.id)) {
    return NextResponse.json({ error: "This share is private." }, { status: 403 });
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
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id } = await params;
  const share = db.getMusicShareById(id);

  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  if (share.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  db.deleteShareCascade(id);
  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;
  const share = db.getMusicShareById(id);
  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }
  if (share.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { action, username } = body;
    if (action !== "invite" || typeof username !== "string" || !username.trim()) {
      return NextResponse.json({ error: "Provide { action: 'invite', username }." }, { status: 400 });
    }
    const clean = username.trim().replace(/^@/, "").slice(0, 30);
    const target = db.getUserByUsername(clean);
    if (!target) {
      return NextResponse.json({ error: `User not found: @${clean}` }, { status: 404 });
    }
    if (target.id === share.authorId) {
      return NextResponse.json({ error: "You already own this share." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const rand = Math.random().toString(36).slice(2, 8);
    const current = db.getMusicShareById(id);
    const allowed = new Set(current?.allowedUserIds || []);
    allowed.add(target.id);
    db.updateMusicShare(id, {
      visibility: "private",
      allowedUserIds: [...allowed],
    } as any);
    db.addParticipant({
      id: `part_${Date.now()}_${rand}`,
      conversationId: share.conversationId,
      userId: target.id,
      role: "member",
      joinedAt: now,
    });
    db.createNotification({
      id: `notif_${Date.now()}_${rand}`,
      recipientId: target.id,
      actorId: user.id,
      type: "share_invitation",
      conversationId: share.conversationId,
      shareId: share.id,
      musicResourceId: share.resourceId,
      isRead: false,
      message: `${user.displayName} shared a private track with you`,
      createdAt: now,
    });
    const updated = db.getMusicShareById(id, user.id);
    return NextResponse.json({ share: updated });
  } catch (e) {
    return NextResponse.json({ error: "Unable to invite user." }, { status: 500 });
  }
}
