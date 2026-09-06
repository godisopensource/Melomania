// src/app/api/connections/route.ts — /api/connections : gestion des connexions musicales

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptToken, decryptToken } from "@/lib/encryption";
import { looksLikeRealMusicUserToken } from "@/lib/apple-music-server";
import { looksLikeRealSpotifyConnection } from "@/lib/spotify-server";
import { ExternalConnection } from "@/types";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const connections = await db.getConnectionsByUserId(user.id);
  const safeConnections = connections.map(({ accessTokenEncrypted, refreshTokenEncrypted, ...rest }: any) => {
    let isReal = true;
    let storefront: string | undefined = (rest as any).storefront;
    if (rest.provider === "apple_music") {
      // Les anciennes connexions mockées (bouton factice) ne contiennent pas
      // de vrai music-user-token : on les signale pour que le front les ignore.
      try {
        const raw = decryptToken(accessTokenEncrypted || "");
        isReal = looksLikeRealMusicUserToken(raw);
      } catch {
        isReal = false;
      }
    }
    if (rest.provider === "spotify") {
      // Idem : les connexions d'avant l'OAuth réel n'ont pas de vrai token.
      isReal = looksLikeRealSpotifyConnection(accessTokenEncrypted || "");
    }
    return {
      ...rest,
      ...(storefront ? { storefront } : {}),
      isConnected: true,
      isReal,
    };
  });

  return NextResponse.json({ connections: safeConnections });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { provider, action = "connect", accountName } = body;

  if (provider !== "spotify" && provider !== "apple_music") {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  if (action === "disconnect") {
    await db.deleteConnection(user.id, provider);
    return NextResponse.json({ success: true, isConnected: false });
  }

  if (action === "connect") {
    // --- Apple Music : connexion réelle via MusicKit (music-user-token) ---
    if (provider === "apple_music") {
      const musicUserToken = typeof body.musicUserToken === "string" ? body.musicUserToken : "";
      const storefront = typeof body.storefront === "string" && body.storefront.trim()
        ? body.storefront.trim().toLowerCase()
        : "fr";
      if (!looksLikeRealMusicUserToken(musicUserToken)) {
        return NextResponse.json(
          { error: "Invalid Apple Music user token. Please sign in with Apple Music again." },
          { status: 400 }
        );
      }
      const now = new Date().toISOString();
      const safeAccountName =
        typeof accountName === "string" && accountName.trim()
          ? accountName.trim().slice(0, 120)
          : `Apple Music · ${storefront.toUpperCase()}`;
      const newConnection: ExternalConnection = {
        id: `conn_${provider}_${user.id}_${Date.now()}`,
        userId: user.id,
        provider,
        providerAccountId: `apple_music_${storefront}_${user.id}`,
        accountName: safeAccountName,
        accessTokenEncrypted: encryptToken(musicUserToken),
        refreshTokenEncrypted: "",
        expiresAt: undefined,
        scopes: ["music-user-token", "library-playlists"],
        createdAt: now,
        updatedAt: now,
      } as ExternalConnection;
      (newConnection as any).storefront = storefront;

      await db.saveConnection(newConnection);
      return NextResponse.json({
        success: true,
        isConnected: true,
        isReal: true,
        connection: {
          id: newConnection.id,
          provider: newConnection.provider,
          accountName: newConnection.accountName,
          storefront,
          scopes: newConnection.scopes,
          createdAt: newConnection.createdAt,
        },
      });
    }

    const now = new Date().toISOString();
    const newConnection: ExternalConnection = {
      id: `conn_${provider}_${user.id}_${Date.now()}`,
      userId: user.id,
      provider,
      providerAccountId: `${provider}_user_${user.username}`,
      accountName: accountName || `${user.displayName} (${provider === "spotify" ? "Spotify" : "Apple Music"})`,
      accessTokenEncrypted: encryptToken(`token_${provider}_${Date.now()}`),
      refreshTokenEncrypted: encryptToken(`refresh_${provider}_${Date.now()}`),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      scopes: provider === "spotify" ? ["playlist-modify-public", "playlist-modify-private", "user-read-private"] : ["music-user-token", "playlist-management"],
      createdAt: now,
      updatedAt: now,
    };

    await db.saveConnection(newConnection);
    return NextResponse.json({
      success: true,
      isConnected: true,
      connection: {
        id: newConnection.id,
        provider: newConnection.provider,
        accountName: newConnection.accountName,
        scopes: newConnection.scopes,
        createdAt: newConnection.createdAt,
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
