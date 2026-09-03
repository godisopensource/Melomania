// PATCH /api/playlists/:id/tracks/:trackId — manual metadata only.
// sourcePosition never changes. Categories must stay chronological
// (all tracks in one category occupy consecutive positions).
// Editing is reserved for the playlist creator.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlaylistOwner, wouldBreakChronology } from "@/lib/playlist-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; trackId: string }> }
) {
  const { id: playlistId, trackId } = await params;
  const check = await requirePlaylistOwner(playlistId);
  if (check.error || !check.user) {
    return NextResponse.json({ error: check.error || "You must be signed in." }, { status: check.status || 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Hard guard: ordering fields are forbidden
  if (
    body.sourcePosition !== undefined ||
    body.position !== undefined ||
    body.order !== undefined ||
    body.move !== undefined
  ) {
    return NextResponse.json(
      { error: "Track order follows the original playlist and cannot be changed here." },
      { status: 422 }
    );
  }

  const resource = db.getMusicResourceById(trackId);
  if (!resource) return NextResponse.json({ error: "Track not found." }, { status: 404 });

  // If a category is provided, it must belong to this playlist
  if (body.categoryId !== undefined && body.categoryId !== null) {
    const cats = db.getPlaylistCategories(playlistId);
    if (!cats.some((c) => c.id === body.categoryId)) {
      return NextResponse.json({ error: "Unknown category for this playlist." }, { status: 400 });
    }
  }

  // Chronological categories: assigning this track must keep every
  // category on consecutive positions.
  if (body.categoryId !== undefined) {
    const curated = db.getCuratedPlaylist(playlistId);
    if (
      curated &&
      wouldBreakChronology(curated.tracks, trackId, body.categoryId as string | null)
    ) {
      return NextResponse.json(
        { error: "Categories must group consecutive tracks. Pick an adjacent category, or stretch a block to include this track." },
        { status: 422 }
      );
    }
  }

  const clampScore = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.max(0, Math.min(100, Math.round(n)));
  };

  const mood = clampScore(body.moodScore);
  const soft = clampScore(body.softnessScore);
  if (body.moodScore !== undefined && mood === undefined) {
    return NextResponse.json({ error: "moodScore must be a number between 0 and 100." }, { status: 400 });
  }
  if (body.softnessScore !== undefined && soft === undefined) {
    return NextResponse.json({ error: "softnessScore must be a number between 0 and 100." }, { status: 400 });
  }

  let tags: string[] | undefined;
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      return NextResponse.json({ error: "tags must be an array of strings." }, { status: 400 });
    }
    tags = [...new Set(body.tags.map((t: unknown) => String(t).trim()).filter(Boolean))].slice(0, 20).map((t) => t.slice(0, 40));
  }

  // Custom criterion scores: each key must be a criterion of this playlist.
  let customScores: Record<string, number | null> | undefined;
  if (body.customScores !== undefined) {
    if (typeof body.customScores !== "object" || body.customScores === null || Array.isArray(body.customScores)) {
      return NextResponse.json({ error: "customScores must be an object." }, { status: 400 });
    }
    const criteria = db.getEmotionalCriteria(playlistId);
    const validIds = new Set(criteria.map((c) => c.id));
    customScores = {};
    for (const [key, raw] of Object.entries(body.customScores)) {
      if (!validIds.has(key)) {
        return NextResponse.json({ error: "Unknown criterion for this playlist." }, { status: 400 });
      }
      if (raw === null || (raw as unknown) === "") {
        customScores[key] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: "Custom scores must be numbers between 0 and 100." }, { status: 400 });
      }
      customScores[key] = Math.max(0, Math.min(100, Math.round(n)));
    }
  }

  try {
    const updates: Record<string, unknown> = {};
    if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
    if (mood !== undefined) updates.moodScore = mood;
    if (soft !== undefined) updates.softnessScore = soft;
    if (customScores !== undefined) updates.customScores = customScores;
    if (tags !== undefined) updates.tags = tags;
    db.upsertTrackEnrichment(trackId, updates as any);
    const curated = db.getCuratedPlaylist(playlistId);
    const track = curated?.tracks.find((t) => t.id === trackId) ?? db.getMusicResourceById(trackId);
    return NextResponse.json({ track });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error updating track." }, { status: 422 });
  }
}
