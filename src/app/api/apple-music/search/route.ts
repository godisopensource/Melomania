// GET /api/apple-music/search?term=... — recherche gratuite via iTunes Search API.
// Aucune clé, aucun compte : résultats réels (titre, artiste, pochette,
// extrait 30s, lien Apple Music). Utilisé par le bouton « Open in Apple Music ».

import { NextRequest, NextResponse } from "next/server";

export interface ITunesTrackHit {
  catalogId: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  artworkUrl?: string;
  previewUrl?: string;
  appleUrl: string;
}

export async function GET(req: NextRequest) {
  const term = (req.nextUrl.searchParams.get("term") || "").trim();
  if (!term) {
    return NextResponse.json({ error: "Missing search term." }, { status: 400 });
  }
  const country = (req.nextUrl.searchParams.get("country") || "FR").toUpperCase().slice(0, 2);
  const limit = Math.max(1, Math.min(10, Number(req.nextUrl.searchParams.get("limit")) || 5));

  try {
    const url =
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
      `&media=music&entity=song&limit=${limit}&country=${encodeURIComponent(country)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Melomania/1.0" } });
    if (!res.ok) throw new Error(`iTunes Search error ${res.status}`);
    const data = await res.json();
    const results: ITunesTrackHit[] = (data.results || []).map((r: any) => ({
      catalogId: String(r.trackId),
      title: r.trackName || "Unknown title",
      artist: r.artistName || "Unknown artist",
      album: r.collectionName,
      durationSeconds: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : undefined,
      artworkUrl: typeof r.artworkUrl100 === "string"
        ? r.artworkUrl100.replace("100x100bb", "400x400bb")
        : undefined,
      previewUrl: r.previewUrl,
      appleUrl: r.trackViewUrl as string,
    })).filter((r: ITunesTrackHit) => !!r.appleUrl);
    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Apple Music search failed." },
      { status: 502 }
    );
  }
}
