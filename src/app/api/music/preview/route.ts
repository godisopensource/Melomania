// src/app/api/music/preview/route.ts — /api/music/preview : prévisualisation audio via YouTube

import { NextRequest, NextResponse } from "next/server";
import { YouTubeAdapter } from "@/lib/adapters/youtube";
import { parseYouTubeUrl } from "@/lib/utils";

const youtubeAdapter = new YouTubeAdapter();

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required." }, { status: 400 });
    }

    const { videoId, playlistId, timecode } = parseYouTubeUrl(url);

    if (playlistId) {
      const playlist = await youtubeAdapter.getPlaylist(url);
      if (!playlist) {
        return NextResponse.json({ error: "Unable to retrieve this YouTube playlist." }, { status: 404 });
      }
      return NextResponse.json({
        type: "playlist",
        playlist,
        detectedTimecode: timecode,
      });
    }

    if (videoId) {
      const track = await youtubeAdapter.getTrack(url);
      if (!track) {
        return NextResponse.json({ error: "Unable to retrieve metadata for this video." }, { status: 404 });
      }
      return NextResponse.json({
        type: "track",
        track,
        detectedTimecode: timecode,
      });
    }

    return NextResponse.json(
      { error: "Please enter a valid YouTube or YouTube Music link (track or playlist)." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("Music preview error:", err);
    return NextResponse.json({ error: "Error while fetching music metadata." }, { status: 500 });
  }
}
