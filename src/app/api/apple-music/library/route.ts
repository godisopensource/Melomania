// src/app/api/apple-music/library/route.ts — proxy bibliothèque iCloud de l'utilisateur.
// Toutes les opérations utilisent le music-user-token chiffré en base + le
// developer token serveur. Le token utilisateur ne transite jamais vers le client.
//
// POST { action: "search", term, limit }
// POST { action: "playlists" }
// POST { action: "create-playlist", name, description? }
// POST { action: "add", playlistId?, playlistName?, catalogSongIds: string[] }
//   - si playlistId absent mais playlistName présent : crée la playlist puis ajoute.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptToken } from "@/lib/encryption";
import {
  getDeveloperToken,
  searchAppleCatalog,
  listAppleLibraryPlaylists,
  createAppleLibraryPlaylist,
  addSongsToAppleLibraryPlaylist,
  looksLikeRealMusicUserToken,
} from "@/lib/apple-music-server";

async function getAppleCredentials(userId: string) {
  const developerToken = getDeveloperToken();
  const connection = await db.getConnection(userId, "apple_music");
  if (!connection) {
    throw Object.assign(
      new Error("Apple Music n'est pas connecté. Connectez-le dans Settings → Services."),
      { status: 400 }
    );
  }
  const musicUserToken = decryptToken(connection.accessTokenEncrypted || "");
  if (!looksLikeRealMusicUserToken(musicUserToken)) {
    throw Object.assign(
      new Error(
        "Connexion Apple Music incomplète (ancien format). Déconnectez puis reconnectez votre compte dans Settings → Services."
      ),
      { status: 400 }
    );
  }
  const storefront =
    ((connection as any).storefront as string) ||
    "fr";
  return { developerToken, musicUserToken, storefront, connection };
}

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
    const { developerToken, musicUserToken, storefront } = await getAppleCredentials(user.id);

    if (body.action === "search") {
      const term = String(body.term || "").trim();
      if (!term) return NextResponse.json({ error: "Missing search term." }, { status: 400 });
      const results = await searchAppleCatalog(
        developerToken,
        String(body.storefront || storefront || "fr"),
        term,
        Number(body.limit) || 5
      );
      return NextResponse.json({ results });
    }

    if (body.action === "playlists") {
      const playlists = await listAppleLibraryPlaylists(developerToken, musicUserToken);
      return NextResponse.json({ playlists });
    }

    if (body.action === "create-playlist") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Missing playlist name." }, { status: 400 });
      const playlist = await createAppleLibraryPlaylist(
        developerToken,
        musicUserToken,
        name,
        body.description ? String(body.description) : undefined
      );
      return NextResponse.json({ playlist });
    }

    if (body.action === "add") {
      const catalogSongIds: string[] = Array.isArray(body.catalogSongIds)
        ? body.catalogSongIds.filter((x: any) => typeof x === "string" && x.length > 0)
        : [];
      if (catalogSongIds.length === 0) {
        return NextResponse.json({ error: "No Apple Music songs to add." }, { status: 400 });
      }
      let playlistId = String(body.playlistId || "");
      let playlistName: string | undefined;
      if (!playlistId) {
        const name = String(body.playlistName || "").trim();
        if (!name) {
          return NextResponse.json(
            { error: "Choose a playlist or provide a new playlist name." },
            { status: 400 }
          );
        }
        const created = await createAppleLibraryPlaylist(
          developerToken,
          musicUserToken,
          name,
          body.description ? String(body.description) : "Created from Melomania"
        );
        playlistId = created.id;
        playlistName = created.name;
      }
      const { added } = await addSongsToAppleLibraryPlaylist(
        developerToken,
        musicUserToken,
        playlistId,
        catalogSongIds
      );
      return NextResponse.json({ playlistId, playlistName, added });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err: any) {
    const status = err?.status || 502;
    return NextResponse.json(
      { error: err?.message || "Apple Music request failed." },
      { status }
    );
  }
}
