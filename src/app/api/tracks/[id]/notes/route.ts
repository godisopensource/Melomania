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
  const notes = db.getTrackNotes(id);
  return NextResponse.json({ notes, initial: notes.find((n) => n.isInitial) ?? null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id: trackId } = await params;
  const track = db.getMusicResourceById(trackId);
  if (!track) return NextResponse.json({ error: "Track not found." }, { status: 404 });

  try {
    const body = await req.json();
    const { body: textBody, parentNoteId = null, startTimeSeconds = null, endTimeSeconds = null } = body;
    if (!textBody || !String(textBody).trim()) {
      return NextResponse.json({ error: "Note body is required." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const existingInitial = db.getTrackInitialNote(trackId);

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
      const saved = db.createTrackNote(note);
      parseMentions(String(textBody), saved.id, user.id);
      return NextResponse.json({ note: saved }, { status: 201 });
    }

    // Reply
    const parentList = db.getTrackNotes(trackId).flatMap((n) => [n, ...(n.replies ?? [])]);
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
    const savedReply = db.createTrackNote(reply);
    parseMentions(String(textBody), savedReply.id, user.id);

    // Notify initial note author on reply
    if (parentFound.authorId !== user.id) {
      db.createNotification({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
        recipientId: parentFound.authorId,
        actorId: user.id,
        type: "comment_reply",
        musicResourceId: trackId,
        isRead: false,
        message: `${user.displayName} replied in the thread of “${track.title}”`,
        createdAt: now,
      });
    }
    return NextResponse.json({ note: savedReply }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "Error saving note." }, { status: 500 });
  }
}

function parseMentions(text: string, noteId: string, authorId: string) {
  const now = new Date().toISOString();
  const matches = Array.from(text.matchAll(/@([a-zA-Z0-9_-]+)/g)) as RegExpExecArray[];
  for (const m of matches) {
    const targetUser = db.getUserByUsername(m[1]);
    if (targetUser && targetUser.id !== authorId) {
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
      db.createMention(mention);
    }
  }
}
