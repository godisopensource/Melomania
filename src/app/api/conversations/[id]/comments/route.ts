// src/app/api/conversations/[id]/comments/route.ts — /api/conversations/:id/comments : commentaires d'une conversation

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Comment, Mention } from "@/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const comments = await db.getCommentsByConversationId(id);
  return NextResponse.json({ comments });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id: conversationId } = await params;
  const thread = await db.getConversationThreadById(conversationId);
  if (!thread) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  try {
    const body = await req.json();
    const {
      body: textBody,
      parentCommentId = null,
      startTimeSeconds = null,
      endTimeSeconds = null,
      attachedResourceId = null,
    } = body;

    if (!textBody || !textBody.trim()) {
      return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const commentId = `comm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Add user as participant
    await db.addParticipant({
      id: `part_${Date.now()}`,
      conversationId,
      userId: user.id,
      role: "member",
      joinedAt: now,
    });

    const comment: Comment = {
      id: commentId,
      conversationId,
      authorId: user.id,
      parentCommentId,
      body: textBody.trim(),
      startTimeSeconds: startTimeSeconds !== null && !isNaN(startTimeSeconds) ? Number(startTimeSeconds) : null,
      endTimeSeconds: endTimeSeconds !== null && !isNaN(endTimeSeconds) ? Number(endTimeSeconds) : null,
      attachedResourceId,
      isEdited: false,
      reactions: {},
      createdAt: now,
      updatedAt: now,
    };

    const savedComment = await db.createComment(comment);

    const alreadyNotified = new Set<string>();

    // Parse Mentions (@username)
    const mentionMatches = Array.from(textBody.matchAll(/@([a-zA-Z0-9_-]+)/g)) as RegExpExecArray[];
    for (const match of mentionMatches) {
      const matchedName = match[1];
      const targetUser = await db.getUserByUsername(matchedName);
      if (targetUser && targetUser.id !== user.id) {
        const mention: Mention = {
          id: `men_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          commentId,
          mentionType: "user",
          targetUserId: targetUser.id,
          startOffset: match.index || 0,
          endOffset: (match.index || 0) + match[0].length,
          rawText: match[0],
          createdAt: now,
        };
        await db.createMention(mention);

        await db.createNotification({
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          recipientId: targetUser.id,
          actorId: user.id,
          type: "user_mention",
          conversationId,
          commentId,
          isRead: false,
          message: `${user.displayName} mentioned you in a comment`,
          createdAt: now,
        });
        alreadyNotified.add(targetUser.id);
      }
    }

    if (parentCommentId) {
      const parent = await db.getCommentById(parentCommentId);
      if (parent && parent.authorId !== user.id) {
        await db.createNotification({
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          recipientId: parent.authorId,
          actorId: user.id,
          type: "comment_reply",
          conversationId,
          commentId,
          isRead: false,
          message: `${user.displayName} replied to your comment`,
          createdAt: now,
        });
        alreadyNotified.add(parent.authorId);
      }
    }

    // Notify everyone else involved in the shared context (playlist/share
    // audience + conversation participants) so activity is never silent.
    try {
      const { notifyShareAudience } = await import("@/lib/share-notifications");
      const share = thread.shareId
        ? await db.getMusicShareById(thread.shareId)
        : undefined;
      if (share) {
        const title = thread.title || share.resource?.title || "a shared playlist";
        await notifyShareAudience({
          share,
          actorId: user.id,
          actorDisplayName: user.displayName,
          type: "share_comment",
          message: parentCommentId
            ? `${user.displayName} replied in “${title}”`
            : `${user.displayName} commented on “${title}”`,
          conversationId,
          commentId,
          musicResourceId: share.resourceId,
          excludeUserIds: alreadyNotified,
        });
      } else {
        // Standalone conversation: notify fellow participants.
        const participants = await db.getParticipantsByConversationId(conversationId);
        for (const p of participants) {
          if (p.userId === user.id || alreadyNotified.has(p.userId)) continue;
          await db.createNotification({
            id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            recipientId: p.userId,
            actorId: user.id,
            type: "share_comment",
            conversationId,
            commentId,
            isRead: false,
            message: parentCommentId
              ? `${user.displayName} replied in “${thread.title || "a conversation"}”`
              : `${user.displayName} commented on “${thread.title || "a conversation"}”`,
            createdAt: now,
          });
        }
      }
    } catch {}

    return NextResponse.json({ comment: savedComment });
  } catch (err: any) {
    console.error("Create comment error:", err);
    return NextResponse.json({ error: "Error saving comment." }, { status: 500 });
  }
}
