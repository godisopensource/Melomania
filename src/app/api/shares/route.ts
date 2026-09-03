// src/app/api/shares/route.ts — /api/shares : création, listing et récupération des partages

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { YouTubeAdapter } from "@/lib/adapters/youtube";
import { normalizeMusicText, parseYouTubeUrl } from "@/lib/utils";
import { MusicResource, MusicShare, ConversationThread } from "@/types";

const youtubeAdapter = new YouTubeAdapter();

const rand = () => Math.random().toString(36).slice(2, 8);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const authorId = searchParams.get("authorId");
  const visibility = searchParams.get("visibility");

  const viewer = await getSessionUser();
  const viewerId = viewer?.id;

  let shares = await db.getMusicShares(viewerId);

  if (authorId) {
    shares = shares.filter((s) => s.authorId === authorId);
  }

  if (visibility) {
    shares = shares.filter((s) => s.visibility === visibility);
  }

  // Private shares are only visible to their author, invited users and participants.
  // Public stays the default feed.
  const visibleShares = [];
  for (const s of shares) {
    if (await db.isShareVisibleTo(s, viewerId)) visibleShares.push(s);
  }
  shares = visibleShares;

  return NextResponse.json({ shares });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      url,
      introductoryComment,
      visibility = "public",
      tags = [],
      sharedWithUsername,
      sharedWithUsernames,
    } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required." }, { status: 400 });
    }

    const safeVisibility = visibility === "private" ? "private" : "public";

    // Private shares can be kept for oneself or explicitly shared with
    // one or several users (by username).
    const rawNames: string[] = [];
    if (typeof sharedWithUsername === "string" && sharedWithUsername.trim()) {
      rawNames.push(sharedWithUsername.trim());
    }
    if (Array.isArray(sharedWithUsernames)) {
      for (const n of sharedWithUsernames) {
        if (typeof n === "string" && n.trim()) rawNames.push(n.trim());
      }
    }
    const invitedUsers: { id: string; username: string }[] = [];
    const unknownUsernames: string[] = [];
    if (safeVisibility === "private" && rawNames.length > 0) {
      const seen = new Set<string>();
      for (const name of rawNames) {
        const clean = name.replace(/^@/, "").slice(0, 30);
        if (!clean || seen.has(clean.toLowerCase())) continue;
        seen.add(clean.toLowerCase());
        const found = await db.getUserByUsername(clean);
        if (!found) {
          unknownUsernames.push(clean);
        } else if (found.id !== user.id) {
          invitedUsers.push({ id: found.id, username: found.username });
        }
      }
      if (unknownUsernames.length > 0) {
        return NextResponse.json(
          { error: `User not found: @${unknownUsernames.join(", @")}` },
          { status: 404 }
        );
      }
    }

    const now = new Date().toISOString();
    let resourceId = "";
    let threadTitle = "";

    const { playlistId, videoId } = parseYouTubeUrl(url);

    if (playlistId) {
      // Single fetch — reused for resources, sources and enrichments.
      const playlist = await youtubeAdapter.getPlaylist(url);
      if (!playlist) {
        return NextResponse.json({ error: "Unable to load playlist from YouTube." }, { status: 404 });
      }
      if (!playlist.tracks || playlist.tracks.length === 0) {
        return NextResponse.json(
          { error: "This playlist appears empty or unavailable (private, deleted, or region-blocked)." },
          { status: 422 }
        );
      }

      const existingSource = await db.getMusicSourceByExternalId("youtube", playlist.externalId);
      if (existingSource) {
        resourceId = existingSource.musicResourceId;
      } else {
        resourceId = `res_pl_${Date.now()}_${rand()}`;

        const playlistTracks: MusicResource[] = (playlist.tracks || []).map((t, idx) => ({
          // Unique id per track (timestamp + index + random suffix — no collisions)
          id: `res_trk_${Date.now()}_${idx}_${rand()}`,
          type: "track",
          title: t.title,
          artistName: t.artist,
          albumName: t.album || playlist.title,
          durationSeconds: t.durationSeconds,
          coverImageUrl: t.coverImageUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600",
          normalizedTitle: normalizeMusicText(t.title),
          normalizedArtist: normalizeMusicText(t.artist),
          // Immutable YouTube Music original order — never reordered locally
          sourcePosition: idx,
          playlistId: resourceId,
          categoryId: null,
          moodScore: null,
          softnessScore: null,
          tags: [],
          createdAt: now,
          updatedAt: now,
        }));

        for (const [idx, trk] of playlistTracks.entries()) {
          await db.createMusicResource(trk);
          try {
            await db.upsertTrackEnrichment(trk.id, {
              playlistId: resourceId,
              categoryId: null,
              moodScore: null,
              softnessScore: null,
              tags: [],
            });
          } catch {}
          // Index comes from the SAME fetch — no out-of-bounds access.
          const src = playlist.tracks[idx];
          await db.createMusicSource({
            id: `src_trk_${Date.now()}_${idx}_${rand()}`,
            musicResourceId: trk.id,
            provider: "youtube",
            externalId: src.externalId,
            externalUrl: src.externalUrl,
            sourceTitle: trk.title,
            sourceArtist: trk.artistName,
            sourceDurationSeconds: trk.durationSeconds,
            createdAt: now,
            updatedAt: now,
          });
        }

        const newPlaylistResource: MusicResource = {
          id: resourceId,
          type: "playlist",
          title: playlist.title,
          subtitle: `${playlistTracks.length} tracks`,
          artistName: playlist.author || user.displayName,
          durationSeconds: playlistTracks.reduce((acc, t) => acc + (t.durationSeconds || 0), 0),
          coverImageUrl: playlist.coverImageUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600",
          normalizedTitle: normalizeMusicText(playlist.title),
          normalizedArtist: normalizeMusicText(playlist.author || ""),
          trackCount: playlistTracks.length,
          tracks: playlistTracks,
          createdAt: now,
          updatedAt: now,
        };

        await db.createMusicResource(newPlaylistResource);
        await db.createMusicSource({
          id: `src_${Date.now()}_${rand()}`,
          musicResourceId: resourceId,
          provider: "youtube",
          externalId: playlist.externalId,
          externalUrl: playlist.externalUrl,
          sourceTitle: playlist.title,
          createdAt: now,
          updatedAt: now,
        });
      }

      threadTitle = `Playlist: ${playlist.title}`;
    } else if (videoId) {
      const track = await youtubeAdapter.getTrack(url);
      if (!track) {
        return NextResponse.json({ error: "Unable to load track from YouTube." }, { status: 404 });
      }

      const existingSource = await db.getMusicSourceByExternalId("youtube", track.externalId);
      if (existingSource) {
        resourceId = existingSource.musicResourceId;
      } else {
        resourceId = `res_${Date.now()}_${rand()}`;
        const newResource: MusicResource = {
          id: resourceId,
          type: "track",
          title: track.title,
          subtitle: track.artist,
          artistName: track.artist,
          albumName: track.album,
          durationSeconds: track.durationSeconds,
          coverImageUrl: track.coverImageUrl || `https://i.ytimg.com/vi/${track.externalId}/hqdefault.jpg`,
          normalizedTitle: normalizeMusicText(track.title),
          normalizedArtist: normalizeMusicText(track.artist),
          createdAt: now,
          updatedAt: now,
        };

        await db.createMusicResource(newResource);
        await db.createMusicSource({
          id: `src_${Date.now()}_${rand()}`,
          musicResourceId: resourceId,
          provider: "youtube",
          externalId: track.externalId,
          externalUrl: track.externalUrl,
          sourceTitle: track.title,
          sourceArtist: track.artist,
          sourceDurationSeconds: track.durationSeconds,
          createdAt: now,
          updatedAt: now,
        });
      }

      threadTitle = `${track.artist} — ${track.title}`;
    } else {
      return NextResponse.json({ error: "Invalid YouTube URL." }, { status: 400 });
    }

    // One share + one conversation per import (playlist = single coherent block
    // opened in the PlaylistWorkspace; per-track discussion lives in TrackNoteThreads).
    const shareId = `share_${Date.now()}_${rand()}`;
    const conversationId = `conv_${Date.now()}_${rand()}`;

    const thread: ConversationThread = {
      id: conversationId,
      createdById: user.id,
      title: threadTitle,
      visibility: safeVisibility,
      shareId,
      participantsCount: 1,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await db.createConversationThread(thread);

    await db.addParticipant({
      id: `part_${Date.now()}_${rand()}`,
      conversationId,
      userId: user.id,
      role: "owner",
      joinedAt: now,
    });

    const share: MusicShare = {
      id: shareId,
      authorId: user.id,
      resourceId,
      introductoryComment,
      visibility: safeVisibility,
      conversationId,
      likesCount: 0,
      likedByUserIds: [],
      allowedUserIds: invitedUsers.map((u) => u.id),
      tags: Array.isArray(tags) ? tags : [],
      createdAt: now,
      updatedAt: now,
    };
    const createdShare = await db.createMusicShare(share);

    // Invite the explicitly shared-with users: participant + notification.
    for (const invited of invitedUsers) {
      await db.addParticipant({
        id: `part_${Date.now()}_${rand()}`,
        conversationId,
        userId: invited.id,
        role: "member",
        joinedAt: now,
      });
      await db.createNotification({
        id: `notif_${Date.now()}_${rand()}`,
        recipientId: invited.id,
        actorId: user.id,
        type: "share_invitation",
        conversationId,
        shareId,
        musicResourceId: resourceId,
        isRead: false,
        message: `${user.displayName} shared a private track with you: ${threadTitle}`,
        createdAt: now,
      });
    }

    if (introductoryComment?.trim()) {
      await db.createComment({
        id: `comm_${Date.now()}_${rand()}`,
        conversationId,
        authorId: user.id,
        parentCommentId: null,
        body: introductoryComment.trim(),
        startTimeSeconds: null,
        endTimeSeconds: null,
        isEdited: false,
        reactions: {},
        createdAt: now,
        updatedAt: now,
      });
    }

    // Playlists resolve to their workspace; single tracks keep the legacy shape.
    if (playlistId) {
      return NextResponse.json({ share: createdShare, playlistId: resourceId });
    }
    return NextResponse.json({ share: createdShare });
  } catch (err: any) {
    console.error("Create share error:", err);
    return NextResponse.json({ error: "Error while creating share." }, { status: 500 });
  }
}
