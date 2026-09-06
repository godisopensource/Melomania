// POST /api/spotify/library — proxy bibliothèque Spotify de l'utilisateur.
// Le token d'accès (refresh auto) ne transite jamais vers le client.
//
// POST { action: "search", term, limit }
// POST { action: "playlists" }
// POST { action: "create-playlist", name, description? }
// POST { action: "add", playlistId?, playlistName?, uris: string[] }

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getValidSpotifyAccessToken,
  getSpotifyProfile,
  searchSpotifyTracks,
  listSpotifyUserPlaylists,
  createSpotifyPlaylist,
  addUrisToSpotifyPlaylist,
} from "@/lib/spotify-server";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const accessToken = await getValidSpotifyAccessToken(user.id);

    if (body.action === "search") {
      const term = String(body.term || "").trim();
      if (!term) return NextResponse.json({ error: "Missing search term." }, { status: 400 });
      const results = await searchSpotifyTracks(accessToken, term, Number(body.limit) || 5);
      return NextResponse.json({ results });
    }

    if (body.action === "playlists") {
      const playlists = await listSpotifyUserPlaylists(accessToken);
      return NextResponse.json({ playlists });
    }

    if (body.action === "create-playlist") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Missing playlist name." }, { status: 400 });
      const profile = await getSpotifyProfile(accessToken);
      const playlist = await createSpotifyPlaylist(
        accessToken,
        profile.id,
        name,
        body.description ? String(body.description) : undefined
      );
      return NextResponse.json({ playlist });
    }

    if (body.action === "add") {
      const uris: string[] = Array.isArray(body.uris)
        ? body.uris.filter((x: any) => typeof x === "string" && x.startsWith("spotify:track:"))
        : [];
      if (uris.length === 0) {
        return NextResponse.json({ error: "No Spotify tracks to add." }, { status: 400 });
      }
      let playlistId = String(body.playlistId || "");
      let playlistName: string | undefined;
      let playlistUrl: string | undefined;
      if (!playlistId) {
        const name = String(body.playlistName || "").trim();
        if (!name) {
          return NextResponse.json(
            { error: "Choose a playlist or provide a new playlist name." },
            { status: 400 }
          );
        }
        const profile = await getSpotifyProfile(accessToken);
        const created = await createSpotifyPlaylist(
          accessToken,
          profile.id,
          name,
          body.description ? String(body.description) : "Created from Melomania"
        );
        playlistId = created.id;
        playlistName = created.name;
        playlistUrl = created.externalUrl;
      }
      const { added } = await addUrisToSpotifyPlaylist(accessToken, playlistId, uris);
      if (!playlistUrl) {
        try {
          const all = await listSpotifyUserPlaylists(accessToken);
          playlistUrl = all.find((p) => p.id === playlistId)?.externalUrl;
        } catch {}
      }
      return NextResponse.json({ playlistId, playlistName, playlistUrl, added });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err: any) {
    const status = err?.status || 502;
    return NextResponse.json(
      { error: err?.message || "Spotify request failed." },
      { status }
    );
  }
}
