// GET + POST /api/playlists/:id/gap-comments — editorial comments.
// Positions (afterSourcePosition): -1 = intro (before Nº 1),
// 0..count-2 = between two tracks, count-1 = conclusion (after Nº N).
// Creation is reserved for the playlist creator.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlaylistOwner } from "@/lib/playlist-auth";
import { GapComment, Mention } from "@/types";
import { INTRO_GAP_POSITION } from "@/lib/gap-comments";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json({ gapComments: await db.getGapComments(id) });
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

  try {
    const body = await req.json();
    const { afterSourcePosition, body: text } = body;
    if (!text || !String(text).trim()) {
      return NextResponse.json({ error: "Comment body is required." }, { status: 400 });
    }
    const curated = await db.getCuratedPlaylist(playlistId);
    const count = curated?.tracks.length ?? 0;
    const pos = Number(afterSourcePosition);
    // -1 = intro (before the first track), count-1 = conclusion (after the
    // last track), anything in between sits between track `pos` and `pos + 1`.
    const isIntro = pos === INTRO_GAP_POSITION;
    const isOutro = count > 0 && pos === count - 1;
    const isInterior = count > 0 && Number.isInteger(pos) && pos >= 0 && pos <= count - 2;
    if (!Number.isInteger(pos) || (!isIntro && !isOutro && !isInterior)) {
      return NextResponse.json({ error: "Invalid position for this comment." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const gap: GapComment = {
      id: `gap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      playlistId,
      afterSourcePosition: pos,
      authorId: check.user.id,
      body: String(text).trim().slice(0, 1000),
      createdAt: now,
      updatedAt: now,
    };
    const saved = await db.createGapComment(gap);

    // @user mentions notify, like in discussions and track threads.
    await notifyMentionedUsers({
      text: String(text),
      gapId: saved.id,
      playlistId,
      actorId: check.user.id,
      actorDisplayName: check.user.displayName,
      slotLabel: isIntro ? "the intro" : isOutro ? "the conclusion" : "a comment",
    });

    return NextResponse.json({ gapComment: saved }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error saving comment." }, { status: 500 });
  }
}

/**
 * Parse @username mentions and notify each mentioned user (once, never
 * self). The notification links to the playlist workspace via musicResourceId.
 */
async function notifyMentionedUsers(args: {
  text: string;
  gapId: string;
  playlistId: string;
  actorId: string;
  actorDisplayName: string;
  slotLabel: string;
}): Promise<void> {
  try {
    const now = new Date().toISOString();
    const playlist = await db.getMusicResourceById(args.playlistId);
    const where = playlist ? `${args.slotLabel} of “${playlist.title}”` : args.slotLabel;
    const matches = Array.from(args.text.matchAll(/@([a-zA-Z0-9_-]+)/g)) as RegExpExecArray[];
    const notified = new Set<string>();
    for (const m of matches) {
      const targetUser = await db.getUserByUsername(m[1]);
      if (!targetUser || targetUser.id === args.actorId || notified.has(targetUser.id)) {
        continue;
      }
      notified.add(targetUser.id);
      const mention: Mention = {
        id: `men_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
        commentId: args.gapId,
        mentionType: "user",
        targetUserId: targetUser.id,
        startOffset: m.index || 0,
        endOffset: (m.index || 0) + m[0].length,
        rawText: m[0],
        createdAt: now,
      };
      await db.createMention(mention);
      await db.createNotification({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
        recipientId: targetUser.id,
        actorId: args.actorId,
        type: "user_mention",
        musicResourceId: args.playlistId,
        isRead: false,
        message: `${args.actorDisplayName} mentioned you in ${where}`,
        createdAt: now,
      });
    }
  } catch {
    // Mention notifications are best-effort — the comment itself is saved.
  }
}
