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
  const found = await db.getUserByUsername(decodeURIComponent(username).slice(0, 30));
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
  const allShares = await db.getMusicSharesByAuthorId(found.id, session?.id);
  const shares = [];
  for (const s of allShares) {
    if (await db.isShareVisibleTo(s, session?.id)) shares.push(s);
  }
  const latestComments = await db.getRecentCommentsByUserId(found.id, 3);
  const recentComments = await Promise.all(
    latestComments.map(async (c) => {
      const thread = await db.getConversationThreadById(c.conversationId);
      const share = thread?.shareId ? await db.getMusicShareById(thread.shareId) : undefined;
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
    })
  );

  return NextResponse.json({ user, shares, recentComments, isSelf });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  const { username } = await params;
  const found = await db.getUserByUsername(decodeURIComponent(username).slice(0, 30));
  if (!found) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (found.id !== session.id && session.role !== "admin") {
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  }
  try {
    const body = await req.json();
    const updates: Partial<typeof found> = {};
    if (typeof body.displayName === "string") {
      const clean = body.displayName.trim().slice(0, 40);
      if (!clean) return NextResponse.json({ error: "Display name cannot be empty." }, { status: 400 });
      if (/[<>]/.test(clean)) return NextResponse.json({ error: "Display name must not contain < or >." }, { status: 400 });
      updates.displayName = clean;
    }
    if (typeof body.bio === "string") {
      const clean = body.bio.trim().slice(0, 300);
      updates.bio = clean;
    }
    if (typeof body.avatarUrl === "string") {
      const clean = body.avatarUrl.trim().slice(0, 2000000);
      if (clean && !clean.startsWith("http://") && !clean.startsWith("https://") && !clean.startsWith("data:image/")) {
        return NextResponse.json({ error: "Avatar must be an https URL or an uploaded image." }, { status: 400 });
      }
      if (clean) updates.avatarUrl = clean;
    }
    if (typeof body.isPublic === "boolean") {
      updates.isPublic = body.isPublic;
    }
    const updated = await db.updateUser(found.id, updates);
    if (!updated) return NextResponse.json({ error: "User not found." }, { status: 404 });
    const isSelf = session.id === found.id;
    const user = isSelf ? toSafeUser(updated) : toPublicUser(updated);
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Unable to update profile." }, { status: 500 });
  }
}
