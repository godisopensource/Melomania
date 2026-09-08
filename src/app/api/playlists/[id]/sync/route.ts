// POST /api/playlists/:id/sync — resync non-destructive depuis YouTube Music.
//
// Cas d'usage : une playlist a été partagée puis enrichie sur Melomania
// (humeurs, énergie, notes...), et des titres ont été AJOUTÉS côté
// YouTube Music depuis. La sync rapatrie les morceaux manquants SANS
// toucher aux données éditoriales existantes :
// - match sur le videoId YouTube (jamais sur le titre),
// - ordre YouTube appliqué ; les morceaux déplacés sont rattachés à leur
//   nouvelle section (catégorie du précédent dans l'ordre de référence,
//   celle du suivant si en tête) — sauf si ça éclaterait une catégorie,
//   auquel cas l'ancien ordre est conservé et signalé,
// - nouveaux morceaux APPENDUS après la dernière position quand le reorder
//   est refusé (les positions existantes, les gaps et les blocs de
//   catégories ne bougent pas),
// - morceaux retirés de YouTube : conservés, juste signalés,
// - réservé au créateur de la playlist (ou admin).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlaylistOwner } from "@/lib/playlist-auth";
import { YouTubeAdapter } from "@/lib/adapters/youtube";

const youtubeAdapter = new YouTubeAdapter();

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: playlistId } = await params;

  const check = await requirePlaylistOwner(playlistId);
  if (check.error || !check.user) {
    return NextResponse.json(
      { error: check.error || "You must be signed in." },
      { status: check.status || 401 }
    );
  }

  const playlist = await db.getMusicResourceById(playlistId);
  if (!playlist || playlist.type !== "playlist") {
    return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
  }

  // Source YouTube de référence (posée à l'import).
  const sources = await db.getMusicSourcesByResourceId(playlistId);
  const ytSource = sources.find((s) => s.provider === "youtube");
  if (!ytSource) {
    return NextResponse.json(
      { error: "This playlist has no YouTube reference to sync from." },
      { status: 422 }
    );
  }

  let fresh;
  try {
    fresh = await youtubeAdapter.getPlaylist(
      ytSource.externalUrl || ytSource.externalId
    );
  } catch (e) {
    console.error("[sync] YouTube fetch failed:", e);
    return NextResponse.json(
      { error: "Could not reach YouTube. Try again in a moment." },
      { status: 502 }
    );
  }
  if (!fresh || !Array.isArray(fresh.tracks)) {
    return NextResponse.json(
      {
        error:
          "This YouTube playlist appears unavailable (private, deleted, or region-blocked). Nothing was changed.",
      },
      { status: 422 }
    );
  }

  try {
    const result = await db.syncPlaylistWithFreshTracks(
      playlistId,
      fresh.tracks.map((t) => ({
        externalId: t.externalId,
        title: t.title,
        artist: t.artist,
        album: t.album,
        durationSeconds: t.durationSeconds,
        coverImageUrl: t.coverImageUrl,
        externalUrl: t.externalUrl,
      }))
    );
    const curated = await db.getCuratedPlaylist(playlistId);
    // Resolve section names for the recategorization report (ids → names).
    const catName = new Map(
      (await db.getPlaylistCategories(playlistId)).map((c) => [c.id, c.name] as [string, string])
    );
    const nameOf = (id: string | null) => (id ? (catName.get(id) ?? "Uncategorized") : "Uncategorized");
    return NextResponse.json({
      added: result.added.map((t) => ({
        id: t.id,
        title: t.title,
        artistName: t.artistName,
      })),
      addedCount: result.added.length,
      updatedCount: result.updatedCount,
      removedFromSource: result.removedFromSource.map((t) => ({
        id: t.id,
        title: t.title,
        artistName: t.artistName,
      })),
      removedFromSourceCount: result.removedFromSource.length,
      reorderApplied: result.reorderApplied,
      reorderSkipped: result.reorderSkipped,
      recategorized: result.recategorized.map((r) => ({
        trackId: r.trackId,
        title: r.title,
        fromCategory: nameOf(r.fromCategoryId),
        toCategory: nameOf(r.toCategoryId),
      })),
      total: result.total,
      tracks: curated?.tracks ?? [],
    });
  } catch (e: any) {
    console.error("[sync] DB sync failed:", e);
    return NextResponse.json(
      { error: e?.message || "Sync failed. Nothing was changed." },
      { status: 500 }
    );
  }
}
