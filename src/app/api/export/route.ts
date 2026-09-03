// src/app/api/export/route.ts — /api/export : export des données utilisateur

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMusicAdapter, buildTrackMatch } from "@/lib/adapters";
import { ExportJob, TrackMatch, MusicResource } from "@/types";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      action,
      resourceId,
      targetProvider = "spotify",
      selectedMatches = [],
      playlistTitle,
    } = body;

    const resource = await db.getMusicResourceById(resourceId);
    if (!resource) {
      return NextResponse.json({ error: "Music resource not found." }, { status: 404 });
    }

    const adapter = getMusicAdapter(targetProvider);
    const tracksToProcess: MusicResource[] =
      resource.type === "playlist" && resource.tracks && resource.tracks.length > 0
        ? resource.tracks
        : [resource];

    if (action === "preview_match") {
      const matchResults: TrackMatch[] = [];

      for (const track of tracksToProcess) {
        const searchCandidates = await adapter.searchTrack({
          title: track.title,
          artist: track.artistName,
          album: track.albumName,
          durationSeconds: track.durationSeconds,
          limit: 4,
        });

        const match = buildTrackMatch(track, targetProvider, searchCandidates);
        matchResults.push(match);
      }

      const autoCount = matchResults.filter((m) => m.matchStatus === "automatic").length;
      const confirmCount = matchResults.filter((m) => m.matchStatus === "pending_confirmation").length;
      const notFoundCount = matchResults.filter((m) => m.matchStatus === "not_found").length;

      return NextResponse.json({
        total: matchResults.length,
        automatic: autoCount,
        pendingConfirmation: confirmCount,
        notFound: notFoundCount,
        matches: matchResults,
      });
    }

    if (action === "execute_export") {
      const connection = await db.getConnection(user.id, targetProvider);
      if (!connection) {
        return NextResponse.json(
          {
            error: `Your ${targetProvider === "spotify" ? "Spotify" : "Apple Music"} account is not connected yet. Please connect it in settings.`,
          },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      const exportedPlaylist = await adapter.createPlaylist({
        userId: user.id,
        title: playlistTitle || resource.title || "Melomania Export",
        description: `Exported from Melomania on ${new Date().toLocaleDateString("en-US")}`,
      });

      const trackIdsToAdd = selectedMatches
        .filter((m: any) => m.targetExternalId && m.matchStatus !== "rejected" && m.matchStatus !== "not_found")
        .map((m: any) => m.targetExternalId);

      const addResult = await adapter.addTracks(exportedPlaylist.externalId, trackIdsToAdd);

      const matchedCount = addResult.totalAdded;
      const unmatchedCount = tracksToProcess.length - matchedCount;
      const jobStatus = unmatchedCount > 0 ? "completed_with_warnings" : "completed";

      const job: ExportJob = {
        id: jobId,
        userId: user.id,
        sourcePlaylistId: resource.id,
        sourcePlaylist: resource,
        targetProvider,
        targetPlaylistId: exportedPlaylist.externalId,
        targetPlaylistUrl: exportedPlaylist.externalUrl,
        status: jobStatus,
        totalItems: tracksToProcess.length,
        processedItems: tracksToProcess.length,
        matchedItems: matchedCount,
        unmatchedItems: unmatchedCount,
        items: selectedMatches,
        createdAt: now,
        completedAt: new Date().toISOString(),
      };

      await db.createExportJob(job);

      await db.createNotification({
        id: `notif_${Date.now()}`,
        recipientId: user.id,
        actorId: user.id,
        type: jobStatus === "completed" ? "export_completed" : "export_warning",
        musicResourceId: resource.id,
        isRead: false,
        message:
          jobStatus === "completed"
            ? `Successfully exported to ${targetProvider === "spotify" ? "Spotify" : "Apple Music"} (${matchedCount}/${tracksToProcess.length} tracks)`
            : `Export completed with warnings to ${targetProvider === "spotify" ? "Spotify" : "Apple Music"} (${matchedCount}/${tracksToProcess.length} tracks)`,
        createdAt: now,
      });

      return NextResponse.json({ job });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err: any) {
    console.error("Export error:", err);
    return NextResponse.json({ error: "Error during export." }, { status: 500 });
  }
}
