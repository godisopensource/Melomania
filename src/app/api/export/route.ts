// src/app/api/export/route.ts — /api/export : export des données utilisateur

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptToken } from "@/lib/encryption";
import { getMusicAdapter, buildTrackMatch } from "@/lib/adapters";
import {
  getDeveloperToken,
  searchAppleCatalog,
  createAppleLibraryPlaylist,
  addSongsToAppleLibraryPlaylist,
  looksLikeRealMusicUserToken,
} from "@/lib/apple-music-server";
import {
  getValidSpotifyAccessToken,
  getSpotifyProfile,
  searchSpotifyTracks,
  createSpotifyPlaylist,
  addUrisToSpotifyPlaylist,
} from "@/lib/spotify-server";
import { ExportJob, TrackMatch, MusicResource } from "@/types";

/** Vrai token Apple de l'utilisateur si connecté réellement, sinon null. */
async function getRealAppleAuth(userId: string): Promise<{
  developerToken: string;
  musicUserToken: string;
  storefront: string;
} | null> {
  try {
    const connection = await db.getConnection(userId, "apple_music");
    if (!connection) return null;
    const musicUserToken = decryptToken(connection.accessTokenEncrypted || "");
    if (!looksLikeRealMusicUserToken(musicUserToken)) return null;
    const developerToken = getDeveloperToken();
    const storefront = ((connection as any).storefront as string) || "fr";
    return { developerToken, musicUserToken, storefront };
  } catch {
    return null;
  }
}

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

      // Apple Music réel : recherche catalogue via l'API quand le compte est connecté.
      const realApple =
        targetProvider === "apple_music" ? await getRealAppleAuth(user.id) : null;

      // Spotify réel : recherche via l'API avec le token de l'utilisateur.
      let realSpotifyToken: string | null = null;
      if (targetProvider === "spotify") {
        try {
          realSpotifyToken = await getValidSpotifyAccessToken(user.id);
        } catch {
          realSpotifyToken = null;
        }
      }

      for (const track of tracksToProcess) {
        if (realSpotifyToken) {
          try {
            const term = `${track.title} ${track.artistName || ""}`.trim();
            const hits = await searchSpotifyTracks(realSpotifyToken, term, 4);
            const candidates = hits.map((h) => ({
              externalId: h.uri,
              provider: "spotify" as const,
              title: h.title,
              artist: h.artist,
              album: h.album,
              durationSeconds: h.durationSeconds,
              coverImageUrl: h.coverImageUrl,
              versionLabel: undefined as string | undefined,
              externalUrl: h.externalUrl,
            }));
            matchResults.push(buildTrackMatch(track, targetProvider, candidates));
            continue;
          } catch (err) {
            console.warn("Spotify search failed, fallback to mock adapter:", err);
          }
        }
        if (realApple) {
          try {
            const term = `${track.title} ${track.artistName || ""}`.trim();
            const hits = await searchAppleCatalog(
              realApple.developerToken,
              realApple.storefront,
              term,
              4
            );
            const candidates = hits.map((h) => ({
              externalId: h.catalogId,
              provider: "apple_music" as const,
              title: h.title,
              artist: h.artist,
              album: h.album,
              durationSeconds: h.durationSeconds || track.durationSeconds || 0,
              coverImageUrl: h.artworkUrl,
              versionLabel: undefined as string | undefined,
              externalUrl:
                h.appleUrl || `https://music.apple.com/search?term=${encodeURIComponent(term)}`,
            }));
            matchResults.push(buildTrackMatch(track, targetProvider, candidates));
            continue;
          } catch (err) {
            console.warn("Apple catalog search failed, fallback to mock adapter:", err);
          }
        }
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

      const trackIdsToAdd = selectedMatches
        .filter((m: any) => m.targetExternalId && m.matchStatus !== "rejected" && m.matchStatus !== "not_found")
        .map((m: any) => m.targetExternalId);

      // Apple Music réel : création dans la bibliothèque iCloud de l'utilisateur.
      if (targetProvider === "apple_music") {
        const realApple = await getRealAppleAuth(user.id);
        if (realApple && trackIdsToAdd.length > 0) {
          const created = await createAppleLibraryPlaylist(
            realApple.developerToken,
            realApple.musicUserToken,
            playlistTitle || resource.title || "Melomania Export",
            `Exported from Melomania on ${new Date().toLocaleDateString("en-US")}`
          );
          await addSongsToAppleLibraryPlaylist(
            realApple.developerToken,
            realApple.musicUserToken,
            created.id,
            trackIdsToAdd
          );
          const matchedCount = trackIdsToAdd.length;
          const unmatchedCount = tracksToProcess.length - matchedCount;
          const jobStatus = unmatchedCount > 0 ? "completed_with_warnings" : "completed";
          const job: ExportJob = {
            id: jobId,
            userId: user.id,
            sourcePlaylistId: resource.id,
            sourcePlaylist: resource,
            targetProvider,
            targetPlaylistId: created.id,
            targetPlaylistUrl: undefined,
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
                ? `Successfully exported to Apple Music (${matchedCount}/${tracksToProcess.length} tracks)`
                : `Export completed with warnings to Apple Music (${matchedCount}/${tracksToProcess.length} tracks)`,
            createdAt: now,
          });
          return NextResponse.json({ job });
        }
        // Sinon (pas de vrai compte) : on retombe sur le flux mock historique.
      }

      // Spotify réel : playlist créée dans le compte de l'utilisateur.
      if (targetProvider === "spotify") {
        try {
          const accessToken = await getValidSpotifyAccessToken(user.id);
          const uris = trackIdsToAdd.filter(
            (id: string) => typeof id === "string" && id.startsWith("spotify:track:")
          );
          if (uris.length > 0) {
            const profile = await getSpotifyProfile(accessToken);
            const created = await createSpotifyPlaylist(
              accessToken,
              profile.id,
              playlistTitle || resource.title || "Melomania Export",
              `Exported from Melomania on ${new Date().toLocaleDateString("en-US")}`
            );
            await addUrisToSpotifyPlaylist(accessToken, created.id, uris);
            const matchedCount = uris.length;
            const unmatchedCount = tracksToProcess.length - matchedCount;
            const jobStatus = unmatchedCount > 0 ? "completed_with_warnings" : "completed";
            const job: ExportJob = {
              id: jobId,
              userId: user.id,
              sourcePlaylistId: resource.id,
              sourcePlaylist: resource,
              targetProvider,
              targetPlaylistId: created.id,
              targetPlaylistUrl: created.externalUrl,
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
                  ? `Successfully exported to Spotify (${matchedCount}/${tracksToProcess.length} tracks)`
                  : `Export completed with warnings to Spotify (${matchedCount}/${tracksToProcess.length} tracks)`,
              createdAt: now,
            });
            return NextResponse.json({ job });
          }
        } catch (err) {
          console.warn("Spotify export failed, fallback to mock adapter:", err);
        }
        // Sinon : flux mock historique.
      }

      const exportedPlaylist = await adapter.createPlaylist({
        userId: user.id,
        title: playlistTitle || resource.title || "Melomania Export",
        description: `Exported from Melomania on ${new Date().toLocaleDateString("en-US")}`,
      });

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
