import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { YouTubeAdapter } from "@/lib/adapters/youtube";
import { normalizeMusicText, parseYouTubeUrl } from "@/lib/utils";
import { MusicResource, MusicSource, MusicShare, ConversationThread } from "@/types";

const youtubeAdapter = new YouTubeAdapter();

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
      playlistMode = "single",
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
      const playlist = await youtubeAdapter.getPlaylist(url);
      if (!playlist) {
        return NextResponse.json({ error: "Unable to load playlist from YouTube." }, { status: 404 });
      }

      let existingSource = db.getMusicSourceByExternalId("youtube", playlist.externalId);
      if (existingSource) {
        resourceId = existingSource.musicResourceId;
      } else {
        resourceId = `res_pl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        const playlistTracks: MusicResource[] = (playlist.tracks || []).map((t, idx) => ({
          id: `res_trk_${Date.now()}_${idx}`,
          type: "track",
          title: t.title,
          artistName: t.artist,
          albumName: t.album || playlist.title,
          durationSeconds: t.durationSeconds,
          coverImageUrl: t.coverImageUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600",
          normalizedTitle: normalizeMusicText(t.title),
          normalizedArtist: normalizeMusicText(t.artist),
          createdAt: now,
          updatedAt: now,
        }));

        playlistTracks.forEach((trk, idx) => {
          db.createMusicResource(trk);
          db.createMusicSource({
            id: `src_trk_${Date.now()}_${idx}`,
            musicResourceId: trk.id,
            provider: "youtube",
            externalId: playlist.tracks[idx].externalId,
            externalUrl: playlist.tracks[idx].externalUrl,
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
          id: `src_${Date.now()}`,
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

      let existingSource = db.getMusicSourceByExternalId("youtube", track.externalId);
      if (existingSource) {
        resourceId = existingSource.musicResourceId;
      } else {
        resourceId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
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
          id: `src_${Date.now()}`,
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

    const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Create Conversation Thread
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

    // Add author as owner participant
    db.addParticipant({
      id: `part_${Date.now()}`,
      conversationId,
      userId: user.id,
      role: "owner",
      joinedAt: now,
    });

    // Create MusicShare
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

    // If intro comment provided, insert as initial comment in conversation
    if (introductoryComment?.trim()) {
      db.createComment({
        id: `comm_${Date.now()}`,
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

    return NextResponse.json({ share: createdShare });
  } catch (err: any) {
    console.error("Create share error:", err);
    return NextResponse.json({ error: "Error while creating share." }, { status: 500 });
  }
}
