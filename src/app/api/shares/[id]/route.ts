// src/app/api/shares/[id]/route.ts — /api/shares/:id : consultation/suppression d'un partage

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { toPublicUser } from "@/lib/security";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewer = await getSessionUser();
  const share = await db.getMusicShareById(id, viewer?.id);

  if (!share) {
    return NextResponse.json({ error: "Share not found." }, { status: 404 });
  }

  if (!await db.isShareVisibleTo(share, viewer?.id)) {
    return NextResponse.json({ error: "This share is private." }, { status: 403 });
  }

  const thread = await db.getConversationThreadById(share.conversationId);
  const comments = await db.getCommentsByConversationId(share.conversationId);
  const participants = await db.getParticipantsByConversationId(share.conversationId);
  const sources = await db.getMusicSourcesByResourceId(share.resourceId);

  // Public view of explicitly invited users (for the sharing panel).
  const allowedUsers = [];
  for (const uid of share.allowedUserIds || []) {
    const u = await db.getUserById(uid);
    if (u) allowedUsers.push(toPublicUser(u));
  }

  return NextResponse.json({
    share,
    thread,
    comments,
    participants,
    sources,
    allowedUsers,
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
  const share = await db.getMusicShareById(id);

  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  if (share.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  await db.deleteShareCascade(id);
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
  const share = await db.getMusicShareById(id);
  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }
  if (share.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { action } = body;
    const now = new Date().toISOString();
    const rand = Math.random().toString(36).slice(2, 8);

    // 1. Switch visibility at any time (public <-> private). The invited
    //    users list is preserved so going private again restores sharing.
    //    The linked conversation thread mirrors the share visibility.
    if (action === "set_visibility") {
      const { visibility } = body;
      if (visibility !== "public" && visibility !== "private") {
        return NextResponse.json({ error: "visibility must be 'public' or 'private'." }, { status: 400 });
      }
      await db.updateMusicShare(id, { visibility } as any);
      try {
        await db.updateConversationThread(share.conversationId, { visibility } as any);
      } catch {}
      const updated = await db.getMusicShareById(id, user.id);
      return NextResponse.json({ share: updated });
    }

    // 2. Invite someone by username (works from any state; on a public
    //    share it simply grants nothing extra — everyone can already see it).
    if (action === "invite") {
      const { username } = body;
      if (typeof username !== "string" || !username.trim()) {
        return NextResponse.json({ error: "Provide { action: 'invite', username }." }, { status: 400 });
      }
      const clean = username.trim().replace(/^@/, "").slice(0, 30);
      const target = await db.getUserByUsername(clean);
      if (!target) {
        return NextResponse.json({ error: `User not found: @${clean}` }, { status: 404 });
      }
      if (target.id === share.authorId) {
        return NextResponse.json({ error: "You already own this share." }, { status: 400 });
      }
      const current = await db.getMusicShareById(id);
      const allowed = new Set(current?.allowedUserIds || []);
      const already = allowed.has(target.id);
      allowed.add(target.id);
      await db.updateMusicShare(id, { allowedUserIds: [...allowed] } as any);
      await db.addParticipant({
        id: `part_${Date.now()}_${rand}`,
        conversationId: share.conversationId,
        userId: target.id,
        role: "member",
        joinedAt: now,
      });
      if (!already) {
        const resourceWord = share.resource?.type === "playlist" ? "playlist" : "track";
        const privacyWord = share.visibility === "private" ? "private " : "";
        const intro = (share.introductoryComment || "").trim();
        const snippet = intro
          ? `: \u201c${intro.slice(0, 140)}${intro.length > 140 ? "\u2026" : ""}\u201d`
          : "";
        await db.createNotification({
          id: `notif_${Date.now()}_${rand}`,
          recipientId: target.id,
          actorId: user.id,
          type: "share_invitation",
          conversationId: share.conversationId,
          shareId: share.id,
          musicResourceId: share.resourceId,
          isRead: false,
          message: `${user.displayName} shared a ${privacyWord}${resourceWord} with you${snippet}`,
          createdAt: now,
        });
      }
      const updated = await db.getMusicShareById(id, user.id);
      return NextResponse.json({ share: updated, alreadyInvited: already });
    }

    // 3. Uninvite someone: removed from the allowed list AND from the
    //    conversation participants (participants alone grant visibility).
    if (action === "uninvite") {
      const { userId } = body;
      if (typeof userId !== "string" || !userId) {
        return NextResponse.json({ error: "Provide { action: 'uninvite', userId }." }, { status: 400 });
      }
      if (userId === share.authorId) {
        return NextResponse.json({ error: "You cannot remove the owner." }, { status: 400 });
      }
      const current = await db.getMusicShareById(id);
      await db.updateMusicShare(id, {
        allowedUserIds: (current?.allowedUserIds || []).filter((uid) => uid !== userId),
      } as any);
      await db.removeParticipant(share.conversationId, userId);
      const updated = await db.getMusicShareById(id, user.id);
      return NextResponse.json({ share: updated });
    }

    return NextResponse.json(
      { error: "Unknown action. Use 'set_visibility', 'invite' or 'uninvite'." },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json({ error: "Unable to update sharing." }, { status: 500 });
  }
}
