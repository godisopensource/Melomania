// GET /api/spotify/callback — retour OAuth Spotify.
// Vérifie le state, échange le code, récupère le profil, stocke les tokens
// chiffrés, puis redirige vers /settings/services avec le statut.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptToken } from "@/lib/encryption";
import {
  exchangeCodeForTokens,
  getSpotifyProfile,
  verifySpotifyState,
} from "@/lib/spotify-server";
import { ExternalConnection } from "@/types";

function requestOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const origin = requestOrigin(req);
  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/settings/services?spotify=error&reason=${encodeURIComponent(reason)}`, origin)
    );

  const user = await getSessionUser();
  if (!user) return fail("not-signed-in");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") || "";
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) return fail(oauthError);
  if (!code) return fail("missing-code");
  if (!verifySpotifyState(state, user.id)) return fail("bad-state");

  try {
    const tokens = await exchangeCodeForTokens(code, origin);
    const profile = await getSpotifyProfile(tokens.access_token);
    const now = new Date().toISOString();
    const connection: ExternalConnection = {
      id: `conn_spotify_${user.id}_${Date.now()}`,
      userId: user.id,
      provider: "spotify",
      providerAccountId: `spotify_${profile.id}`,
      accountName: `${profile.displayName} (Spotify)`,
      accessTokenEncrypted: encryptToken(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encryptToken(tokens.refresh_token) : "",
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: ["playlist-modify-public", "playlist-modify-private", "user-read-private", "user-read-email"],
      createdAt: now,
      updatedAt: now,
    };
    await db.saveConnection(connection);
    return NextResponse.redirect(new URL("/settings/services?spotify=connected", origin));
  } catch (err: any) {
    return fail(err?.message || "oauth-failed");
  }
}
