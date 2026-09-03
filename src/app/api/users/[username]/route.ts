// GET /api/users/:username — public profile: user, shares, recent comments.
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { toPublicUser, toSafeUser } from "@/lib/security";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const found = db.getUserByUsername(decodeURIComponent(username).slice(0, 30));
  if (!found) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const session = await getSessionUser();
  const isSelf = !!session && session.id === found.id;
  if (!found.isPublic && !isSelf) {
    return NextResponse.json({ error: "This profile is private." }, { status: 403 });
  }

  // Email visible uniquement par soi-même, jamais de hash.
  const user = isSelf ? toSafeUser(found) : toPublicUser(found);
  const shares = db.getMusicSharesByAuthorId(found.id);
  const recentComments = db.getRecentCommentsByUserId(found.id, 3).map((c) => {
    const thread = db.getConversationThreadById(c.conversationId);
    const share = thread?.shareId ? db.getMusicShareById(thread.shareId) : undefined;
    const resource = share?.resource;
    return {
      ...c,
      context: thread
        ? {
            threadTitle: thread.title,
            shareId: thread.shareId ?? share?.id ?? null,
            resourceId: resource?.id ?? null,
            resourceTitle: resource?.title ?? null,
            resourceType: resource?.type ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({ user, shares, recentComments, isSelf });
}
