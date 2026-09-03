// src/app/api/shares/[id]/like/route.ts — toggle like + notification
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

const rand = () => Math.random().toString(36).slice(2, 6);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  const { id } = await params;
  const existing = await db.getMusicShareById(id);
  if (!existing) {
    return NextResponse.json({ error: "Share not found." }, { status: 404 });
  }
  if (!await db.isShareVisibleTo(existing, user.id)) {
    return NextResponse.json({ error: "This share is private." }, { status: 403 });
  }
  const result = await db.toggleShareLike(id, user.id);
  if (!result) {
    return NextResponse.json({ error: "Share not found." }, { status: 404 });
  }
  // Notify the author when someone else likes their share (only on like, not unlike).
  if (result.liked && existing.authorId !== user.id) {
    const now = new Date().toISOString();
    await db.createNotification({
      id: `notif_${Date.now()}_${rand()}`,
      recipientId: existing.authorId,
      actorId: user.id,
      type: "share_like",
      conversationId: existing.conversationId,
      shareId: existing.id,
      musicResourceId: existing.resourceId,
      isRead: false,
      message: `${user.displayName} liked your share${existing.resource?.title ? `: ${existing.resource.title}` : ""}`,
      createdAt: now,
    });
  }
  return NextResponse.json({ share: result.share, liked: result.liked });
}
