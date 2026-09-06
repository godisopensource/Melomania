// GET + POST /api/tracks/:id/notes — TrackNoteThread
// POST without parentNoteId creates the ONE immutable initial editorial note.
// POST with parentNoteId creates a reply (mentions + timecodes supported).
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Mention, TrackNote } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const notes = await db.getTrackNotes(id);
  return NextResponse.json({ notes, initial: notes.find((n) => n.isInitial) ?? null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id: trackId } = await params;
  const track = await db.getMusicResourceById(trackId);
  if (!track) return NextResponse.json({ error: "Track not found." }, { status: 404 });

  try {
    const body = await req.json();
    const { body: textBody, parentNoteId = null, startTimeSeconds = null, endTimeSeconds = null } = body;
    if (!textBody || !String(textBody).trim()) {
      return NextResponse.json({ error: "Note body is required." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const existingInitial = await db.getTrackInitialNote(trackId);

    // Initial editorial note: single, immutable once published
    if (!parentNoteId) {
      if (existingInitial) {
        return NextResponse.json(
          { error: "This track already has its opening note. Please reply in the thread instead.", initial: existingInitial },
          { status: 409 }
        );
      }
      const note: TrackNote = {
        id: `tn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        trackId,
        playlistId: track.playlistId,
        authorId: user.id,
        body: String(textBody).trim().slice(0, 5000),
        parentNoteId: null,
        startTimeSeconds: startTimeSeconds !== null ? Number(startTimeSeconds) : null,
        endTimeSeconds: endTimeSeconds !== null ? Number(endTimeSeconds) : null,
        isInitial: true,
        isLocked: true,
        isEdited: false,
        createdAt: now,
        updatedAt: now,
      };
      const saved = await db.createTrackNote(note);
      const mentionedIds = await parseMentions(String(textBody), saved.id, user.id, {
        trackId,
        trackTitle: track.title,
        actorDisplayName: user.displayName,
      });
      await notifyPlaylistAudience({
        trackId,
        playlistId: track.playlistId,
        trackTitle: track.title,
        actorId: user.id,
        actorDisplayName: user.displayName,
        excludeUserIds: mentionedIds,
        isReply: false,
      });
      return NextResponse.json({ note: saved }, { status: 201 });
    }

    // Reply
    const allNotes = await db.getTrackNotes(trackId);
    const parentList = allNotes.flatMap((n) => [n, ...(n.replies ?? [])]);
    const parentFound = parentList.find((n) => n.id === parentNoteId);
    if (!parentFound) return NextResponse.json({ error: "Parent note not found." }, { status: 404 });

    const reply: TrackNote = {
      id: `tn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trackId,
      playlistId: track.playlistId,
      authorId: user.id,
      body: String(textBody).trim().slice(0, 5000),
      parentNoteId,
      startTimeSeconds: startTimeSeconds !== null && !isNaN(Number(startTimeSeconds)) ? Number(startTimeSeconds) : null,
      endTimeSeconds: endTimeSeconds !== null && !isNaN(Number(endTimeSeconds)) ? Number(endTimeSeconds) : null,
      isInitial: false,
      isLocked: false,
      isEdited: false,
      createdAt: now,
      updatedAt: now,
    };
    const savedReply = await db.createTrackNote(reply);
    const mentionedIds = await parseMentions(String(textBody), savedReply.id, user.id, {
      trackId,
      trackTitle: track.title,
      actorDisplayName: user.displayName,
    });

    const alreadyNotified = new Set<string>(mentionedIds);

    // Notify parent note author on reply
    if (parentFound.authorId !== user.id) {
      await db.createNotification({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
        recipientId: parentFound.authorId,
        actorId: user.id,
        type: "comment_reply",
        musicResourceId: trackId,
        isRead: false,
        message: `${user.displayName} replied in the thread of “${track.title}”`,
        createdAt: now,
      });
      alreadyNotified.add(parentFound.authorId);
    }
    await notifyPlaylistAudience({
      trackId,
      playlistId: track.playlistId,
      trackTitle: track.title,
      actorId: user.id,
      actorDisplayName: user.displayName,
      excludeUserIds: [...alreadyNotified],
      isReply: true,
    });
    return NextResponse.json({ note: savedReply }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "Error saving note." }, { status: 500 });
  }
}

async function parseMentions(
  text: string,
  noteId: string,
  authorId: string,
  ctx?: { trackId: string; trackTitle: string; actorDisplayName: string }
): Promise<string[]> {
  const now = new Date().toISOString();
  const notified: string[] = [];
  const matches = Array.from(text.matchAll(/@([a-zA-Z0-9_-]+)/g)) as RegExpExecArray[];
  for (const m of matches) {
    const targetUser = await db.getUserByUsername(m[1]);
    if (targetUser && targetUser.id !== authorId && !notified.includes(targetUser.id)) {
      const mention: Mention = {
        id: `men_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
        commentId: noteId,
        mentionType: "user",
        targetUserId: targetUser.id,
        startOffset: m.index || 0,
        endOffset: (m.index || 0) + m[0].length,
        rawText: m[0],
        createdAt: now,
      };
      await db.createMention(mention);
      // Mentions under a track now notify too (previously silent).
      if (ctx) {
        await db.createNotification({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
          recipientId: targetUser.id,
          actorId: authorId,
          type: "user_mention",
          musicResourceId: ctx.trackId,
          isRead: false,
          message: `${ctx.actorDisplayName} mentioned you in the thread of “${ctx.trackTitle}”`,
          createdAt: now,
        });
      }
      notified.push(targetUser.id);
    }
  }
  return notified;
}

/**
 * Notify everyone involved in the shared playlist(s) containing this track:
 * share author + allowed users + conversation participants. A track can live
 * in a shared playlist (playlistId) or be shared directly (trackId), so both
 * are resolved. Dedupes across shares and skips already-notified users.
 */
async function notifyPlaylistAudience(args: {
  trackId: string;
  playlistId?: string;
  trackTitle: string;
  actorId: string;
  actorDisplayName: string;
  excludeUserIds?: Iterable<string>;
  isReply: boolean;
}): Promise<number> {
  try {
    const { notifyShareAudience } = await import("@/lib/share-notifications");
    const resourceIds = [args.trackId, args.playlistId].filter(Boolean) as string[];
    const seenShares = new Set<string>();
    const excluded = new Set(args.excludeUserIds || []);
    let created = 0;
    for (const resourceId of resourceIds) {
      const shares = await db.getSharesByResourceId(resourceId);
      for (const share of shares) {
        if (seenShares.has(share.id)) continue;
        seenShares.add(share.id);
        created += await notifyShareAudience({
          share,
          actorId: args.actorId,
          actorDisplayName: args.actorDisplayName,
          type: "track_comment",
          message: args.isReply
            ? `${args.actorDisplayName} replied under “${args.trackTitle}”`
            : `${args.actorDisplayName} commented under “${args.trackTitle}”`,
          musicResourceId: args.trackId,
          excludeUserIds: excluded,
        });
        // Users notified via the first share shouldn't get a duplicate.
        const audience = await db.getMusicShareById(share.id);
        if (audience) {
          for (const uid of [audience.authorId, ...(audience.allowedUserIds || [])]) {
            excluded.add(uid);
          }
        }
      }
    }
    return created;
  } catch {
    return 0;
  }
}
