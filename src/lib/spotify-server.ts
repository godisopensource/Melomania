// src/lib/spotify-server.ts — serveur uniquement.
//
// OAuth Authorization Code Spotify (compte dev gratuit) :
//  1. GET /api/spotify/auth -> redirect accounts.spotify.com/authorize
//  2. GET /api/spotify/callback -> échange code <-> tokens, profil /v1/me,
//     stockage chiffré AES-256 via /lib/encryption.
//  3. Helpers API (search, playlists, create, add) avec refresh auto du token.
//
// Env : SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET.
// La redirect URI est dérivée de la requête (<origin>/api/spotify/callback)
// et doit être déclarée telle quelle dans le dashboard Spotify
// (dev local + prod).

import crypto from "crypto";
import { db } from "@/lib/db";
import { encryptToken, decryptToken } from "@/lib/encryption";

export const SPOTIFY_SCOPES = [
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-private",
  "user-read-email",
].join(" ");

export function spotifyEnvConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

export function spotifySetupHint(): string {
  return "Crée une app gratuite sur https://developer.spotify.com/dashboard, renseigne SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET, et déclare la Redirect URI (<ton-domaine>/api/spotify/callback).";
}

function stateSecret(): string {
  const s = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY || "";
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET (ou ENCRYPTION_KEY) manquant pour signer le state Spotify.");
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

/** State OAuth = userId + timestamp signés HMAC (anti-CSRF, 10 min). */
export function buildSpotifyState(userId: string): string {
  const payload = JSON.stringify({ u: userId, t: Date.now() });
  const sig = crypto.createHmac("sha256", stateSecret()).update(payload).digest();
  return `${b64url(Buffer.from(payload))}.${b64url(sig)}`;
}

export function verifySpotifyState(state: string, expectedUserId: string): boolean {
  try {
    const [p, s] = state.split(".");
    if (!p || !s) return false;
    const payload = b64urlDecode(p).toString("utf8");
    const expected = crypto.createHmac("sha256", stateSecret()).update(payload).digest();
    const got = b64urlDecode(s);
    if (got.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(got, expected)) return false;
    const parsed = JSON.parse(payload) as { u: string; t: number };
    if (parsed.u !== expectedUserId) return false;
    if (Date.now() - parsed.t > 10 * 60 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

export function spotifyRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/spotify/callback`;
}

export function buildAuthorizeUrl(origin: string, userId: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID as string,
    scope: SPOTIFY_SCOPES,
    redirect_uri: spotifyRedirectUri(origin),
    state: buildSpotifyState(userId),
    show_dialog: "false",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error_description || data?.error || `Spotify token error ${res.status}`);
  }
  return data as TokenResponse;
}

export function exchangeCodeForTokens(code: string, origin: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: spotifyRedirectUri(origin),
  });
  return tokenRequest(body);
}

export function refreshSpotifyTokens(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return tokenRequest(body);
}

/** Token d'accès valide (refresh auto si expiré dans < 60s). Throw si non connecté. */
export async function getValidSpotifyAccessToken(userId: string): Promise<string> {
  const connection = await db.getConnection(userId, "spotify");
  if (!connection) {
    throw Object.assign(
      new Error("Spotify n'est pas connecté. Connectez-le dans Settings → Services."),
      { status: 400 }
    );
  }
  const accessToken = decryptToken(connection.accessTokenEncrypted || "");
  // Anciennes connexions mockées (avant OAuth réel) : forcer une reconnexion.
  if (!accessToken || accessToken.startsWith("token_")) {
    throw Object.assign(
      new Error("Reconnectez votre compte Spotify dans Settings → Services."),
      { status: 400 }
    );
  }
  const expiresAt = connection.expiresAt ? Date.parse(connection.expiresAt) : 0;
  if (expiresAt - Date.now() > 60 * 1000) return accessToken;

  const refreshToken = connection.refreshTokenEncrypted
    ? decryptToken(connection.refreshTokenEncrypted)
    : "";
  if (!refreshToken) return accessToken; // pas de refresh possible : on tente quand même
  const refreshed = await refreshSpotifyTokens(refreshToken);
  const now = new Date().toISOString();
  await db.saveConnection({
    ...connection,
    accessTokenEncrypted: encryptToken(refreshed.access_token),
    refreshTokenEncrypted: refreshed.refresh_token
      ? encryptToken(refreshed.refresh_token)
      : connection.refreshTokenEncrypted,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    updatedAt: now,
  } as any);
  return refreshed.access_token;
}

/** Un token mocké historique commence par "token_" : pas une vraie connexion. */
export function looksLikeRealSpotifyConnection(accessTokenEncrypted: string): boolean {
  try {
    const raw = decryptToken(accessTokenEncrypted || "");
    return !!raw && !raw.startsWith("token_") && raw.length > 20;
  } catch {
    return false;
  }
}

async function spotifyFetch(
  path: string,
  accessToken: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string> }
): Promise<any> {
  const qs = init?.query ? `?${new URLSearchParams(init.query).toString()}` : "";
  const res = await fetch(`https://api.spotify.com/v1${path}${qs}`, {
    method: init?.method || "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Spotify API error ${res.status}`);
  }
  return data;
}

export interface SpotifyTrackHit {
  uri: string;
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds: number;
  coverImageUrl?: string;
  externalUrl: string;
}

export async function searchSpotifyTracks(
  accessToken: string,
  query: string,
  limit = 5
): Promise<SpotifyTrackHit[]> {
  const data = await spotifyFetch("/search", accessToken, {
    query: { q: query, type: "track", limit: String(Math.max(1, Math.min(10, limit))) },
  });
  const items: any[] = data?.tracks?.items || [];
  return items.map((t) => ({
    uri: t.uri as string,
    id: t.id as string,
    title: t.name,
    artist: (t.artists || []).map((a: any) => a.name).join(", "),
    album: t.album?.name,
    durationSeconds: Math.round((t.duration_ms || 0) / 1000),
    coverImageUrl: t.album?.images?.[0]?.url,
    externalUrl: t.external_urls?.spotify as string,
  }));
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
  externalUrl: string;
}

export async function listSpotifyUserPlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
  const data = await spotifyFetch("/me/playlists", accessToken, {
    query: { limit: "50" },
  });
  const items: any[] = data?.items || [];
  return items.map((p) => ({
    id: p.id as string,
    name: p.name,
    trackCount: p.tracks?.total ?? 0,
    externalUrl: p.external_urls?.spotify as string,
  }));
}

export async function createSpotifyPlaylist(
  accessToken: string,
  spotifyUserId: string,
  name: string,
  description?: string
): Promise<SpotifyPlaylistSummary> {
  const data = await spotifyFetch(`/users/${encodeURIComponent(spotifyUserId)}/playlists`, accessToken, {
    method: "POST",
    body: { name, description: description || "Created from Melomania", public: false },
  });
  return {
    id: data.id as string,
    name: data.name,
    trackCount: 0,
    externalUrl: data.external_urls?.spotify as string,
  };
}

export async function addUrisToSpotifyPlaylist(
  accessToken: string,
  playlistId: string,
  uris: string[]
): Promise<{ added: number }> {
  if (uris.length === 0) return { added: 0 };
  // Par lots de 100 (limite Spotify).
  for (let i = 0; i < uris.length; i += 100) {
    await spotifyFetch(`/playlists/${encodeURIComponent(playlistId)}/tracks`, accessToken, {
      method: "POST",
      body: { uris: uris.slice(i, i + 100) },
    });
  }
  return { added: uris.length };
}

export async function getSpotifyProfile(accessToken: string): Promise<{
  id: string;
  displayName: string;
  email?: string;
}> {
  const data = await spotifyFetch("/me", accessToken);
  return {
    id: data.id as string,
    displayName: data.display_name || data.id,
    email: data.email,
  };
}
