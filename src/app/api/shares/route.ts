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

  let shares = db.getMusicShares();

  if (authorId) {
    shares = shares.filter((s) => s.authorId === authorId);
  }

  if (visibility) {
    shares = shares.filter((s) => s.visibility === visibility);
  }

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
    } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required." }, { status: 400 });
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

      const existingSource = db.getMusicSourceByExternalId("youtube", playlist.externalId);
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

        playlistTracks.forEach((trk, idx) => {
          db.createMusicResource(trk);
          try {
            db.upsertTrackEnrichment(trk.id, {
              playlistId: resourceId,
              categoryId: null,
              moodScore: null,
              softnessScore: null,
              tags: [],
            });
          } catch {}
          // Index comes from the SAME fetch — no out-of-bounds access.
          const src = playlist.tracks[idx];
          db.createMusicSource({
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
        });

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

        db.createMusicResource(newPlaylistResource);
        db.createMusicSource({
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

      const existingSource = db.getMusicSourceByExternalId("youtube", track.externalId);
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

        db.createMusicResource(newResource);
        db.createMusicSource({
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
      visibility,
      shareId,
      participantsCount: 1,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };
    db.createConversationThread(thread);

    db.addParticipant({
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
      visibility,
      conversationId,
      likesCount: 0,
      tags: Array.isArray(tags) ? tags : [],
      createdAt: now,
      updatedAt: now,
    };
    const createdShare = db.createMusicShare(share);

    if (introductoryComment?.trim()) {
      db.createComment({
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
