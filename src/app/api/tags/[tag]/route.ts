// src/app/api/tags/[tag]/route.ts — everything associated with a tag:
// tagged shares, tagged tracks, and every text mentioning #tag
// (share intros, discussion comments, track notes, gap comments).
// Only content visible to the viewer is returned.
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { INTRO_GAP_POSITION } from "@/lib/gap-comments";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normTag = (t: string) => t.trim().toLowerCase().replace(/^#/, "");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  const { tag: rawTag } = await params;
  const tag = normTag(decodeURIComponent(rawTag)).slice(0, 40);
  if (!tag) {
    return NextResponse.json({ error: "Invalid tag." }, { status: 400 });
  }
  // Token match: #tag followed by a boundary (so #rock doesn't match #rocket).
  const tokenRe = new RegExp(`#${escapeRegExp(tag)}(?![A-Za-zÀ-ÖØ-öø-ÿ0-9_-])`, "i");
  const hasTag = (tags?: string[]) => (tags || []).some((t) => normTag(t) === tag);

  const viewer = await getSessionUser();
  const viewerId = viewer?.id;

  const allShares = await db.getMusicShares(viewerId);
  const visibleShares = [];
  for (const s of allShares) {
    if (await db.isShareVisibleTo(s, viewerId)) visibleShares.push(s);
  }

  const shares = visibleShares.filter((s) => hasTag(s.tags));

  // resourceId -> a visible share giving context (direct share or playlist share).
  const resourceToShare = new Map<string, (typeof visibleShares)[number]>();
  for (const s of visibleShares) {
    if (!resourceToShare.has(s.resourceId)) resourceToShare.set(s.resourceId, s);
    for (const t of s.resource?.tracks || []) {
      if (!resourceToShare.has(t.id)) resourceToShare.set(t.id, s);
    }
  }

  const allResources = await db.getMusicResources();
  const resourceById = new Map(allResources.map((r) => [r.id, r]));

  // Tagged tracks / playlists visible through a share.
  const tracks = allResources
    .filter((r) => hasTag(r.tags) && resourceToShare.has(r.id))
    .slice(0, 50)
    .map((r) => {
      const share = resourceToShare.get(r.id)!;
      const isPlaylistShare = share.resource?.type === "playlist";
      return {
        id: r.id,
        type: r.type,
        title: r.title,
        artistName: r.artistName,
        coverImageUrl: r.coverImageUrl,
        href: isPlaylistShare ? `/playlists/${share.resourceId}` : `/share/${share.id}`,
        contextLabel: isPlaylistShare
          ? `In playlist ${share.resource?.title || ""}`.trim()
          : "Shared track",
      };
    });

  interface TagMention {
    kind: "shareIntro" | "comment" | "trackNote" | "gapComment";
    id: string;
    body: string;
    author?: { username?: string; displayName?: string; avatarUrl?: string } | null;
    createdAt: string;
    href: string;
    contextLabel: string;
  }
  const mentions: TagMention[] = [];

  // Share intros + discussion comments (flattened replies included).
  for (const s of visibleShares) {
    const contextLabel = s.resource
      ? `${s.resource.type === "playlist" ? "Playlist" : "Track"} · ${s.resource.title}`
      : "Share";
    if (s.introductoryComment && tokenRe.test(s.introductoryComment)) {
      mentions.push({
        kind: "shareIntro",
        id: s.id,
        body: s.introductoryComment,
        author: s.author,
        createdAt: s.createdAt,
        href: `/share/${s.id}`,
        contextLabel: `Intro · ${contextLabel}`,
      });
    }
    try {
      const comments = await db.getCommentsByConversationId(s.conversationId);
      const flat = comments.flatMap((c) => [c, ...(c.replies || [])]);
      for (const c of flat) {
        if (c.body && tokenRe.test(c.body)) {
          mentions.push({
            kind: "comment",
            id: c.id,
            body: c.body,
            author: c.author,
            createdAt: c.createdAt,
            href: `/share/${s.id}#comment-${c.id}`,
            contextLabel: `Discussion · ${contextLabel}`,
          });
        }
      }
    } catch {
      // A share without a readable conversation simply contributes nothing.
    }
  }

  // Track notes (opening notes + replies) on tracks in a visible context.
  try {
    const notes = await db.getAllTrackNotes();
    for (const n of notes) {
      if (!n.body || !tokenRe.test(n.body)) continue;
      const share = resourceToShare.get(n.trackId) ?? (n.playlistId ? resourceToShare.get(n.playlistId) : undefined);
      if (!share) continue;
      const track = resourceById.get(n.trackId);
      const isPlaylistShare = share.resource?.type === "playlist";
      mentions.push({
        kind: "trackNote",
        id: n.id,
        body: n.body,
        author: n.author,
        createdAt: n.createdAt,
        href: isPlaylistShare ? `/playlists/${share.resourceId}` : `/share/${share.id}`,
        contextLabel: `Note · ${track ? `${track.title} — ${track.artistName}` : "Track"}`,
      });
    }
  } catch {
    // No notes readable — nothing to add.
  }

  // Gap comments (intro / inside / conclusion) on visible playlists.
  try {
    const gaps = await db.getAllGapComments();
    for (const g of gaps) {
      if (!g.body || !tokenRe.test(g.body)) continue;
      const share = resourceToShare.get(g.playlistId);
      if (!share) continue;
      const playlistTitle = share.resource?.title || "Playlist";
      const label =
        g.afterSourcePosition === INTRO_GAP_POSITION
          ? `Intro · ${playlistTitle}`
          : `Between tracks · ${playlistTitle}`;
      mentions.push({
        kind: "gapComment",
        id: g.id,
        body: g.body,
        author: g.author,
        createdAt: g.createdAt,
        href: `/playlists/${g.playlistId}`,
        contextLabel: label,
      });
    }
  } catch {
    // No gap comments readable — nothing to add.
  }

  mentions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return NextResponse.json({
    tag,
    shares,
    tracks,
    mentions: mentions.slice(0, 100),
  });
}
