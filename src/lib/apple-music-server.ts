// src/lib/apple-music-server.ts — serveur uniquement (jamais importé côté client).
//
// Apple Music API flow :
//  1. Developer Token (JWT ES256 signé avec la clé MusicKit .p8) — généré ici.
//  2. Music-User-Token — obtenu côté client via MusicKit JS (authorize()),
//     transmis une fois à /api/connections puis stocké chiffré (AES-256).
//  3. Appels API https://api.music.apple.com/v1/... avec les 2 tokens.
//
// Env requises :
//   APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, APPLE_MUSIC_PRIVATE_KEY (.p8, \n échappés ok)
//   Optionnel : APPLE_MUSIC_DEVELOPER_TOKEN (fallback si pas de clé privée sous la main)

import crypto from "crypto";

const APPLE_API_BASE = "https://api.music.apple.com/v1";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizePrivateKey(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  // Supporte les clés stockées avec des \n littéraux (Vercel env) ou déjà multilignes.
  if (trimmed.includes("\\n")) return trimmed.replace(/\\n/g, "\n");
  return trimmed;
}

// Cache mémoire (serverless-safe : régénéré au pire à chaque instance froide).
let cachedToken: { token: string; expiresAt: number } | null = null;

function signDeveloperToken(teamId: string, keyId: string, privateKeyPem: string): { token: string; expiresAt: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  // 30 jours (max Apple : 6 mois). Marge de régénération gérée par le cache.
  const expSec = nowSec + 30 * 24 * 3600;
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: nowSec, exp: expSec }));
  const data = `${header}.${payload}`;
  const signer = crypto.createSign("sha256");
  signer.update(data);
  signer.end();
  // ieee-p1363 = signature brute R||S directement base64url-able (pas de DER à convertir).
  const signature = signer.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" } as any);
  return { token: `${data}.${base64url(signature)}`, expiresAt: expSec * 1000 };
}

export function isAppleMusicServerConfigured(): boolean {
  if (process.env.APPLE_MUSIC_DEVELOPER_TOKEN) return true;
  return !!(
    process.env.APPLE_MUSIC_TEAM_ID &&
    process.env.APPLE_MUSIC_KEY_ID &&
    process.env.APPLE_MUSIC_PRIVATE_KEY
  );
}

export function configurationMissingReason(): string {
  if (isAppleMusicServerConfigured()) return "";
  const missing: string[] = [];
  if (!process.env.APPLE_MUSIC_TEAM_ID) missing.push("APPLE_MUSIC_TEAM_ID");
  if (!process.env.APPLE_MUSIC_KEY_ID) missing.push("APPLE_MUSIC_KEY_ID");
  if (!process.env.APPLE_MUSIC_PRIVATE_KEY) missing.push("APPLE_MUSIC_PRIVATE_KEY");
  return missing.length > 0
    ? `Variables manquantes : ${missing.join(", ")} (ou APPLE_MUSIC_DEVELOPER_TOKEN en fallback).`
    : "Apple Music non configuré.";
}

/** Developer Token frais (cache + régénération). Throw si non configuré. */
export function getDeveloperToken(): string {
  if (process.env.APPLE_MUSIC_DEVELOPER_TOKEN) {
    return process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
  }
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const rawKey = process.env.APPLE_MUSIC_PRIVATE_KEY;
  if (!teamId || !keyId || !rawKey) {
    throw new Error(configurationMissingReason());
  }
  const now = Date.now();
  // Régénère 24h avant expiration.
  if (cachedToken && cachedToken.expiresAt - 24 * 3600 * 1000 > now) {
    return cachedToken.token;
  }
  const pem = normalizePrivateKey(rawKey);
  try {
    cachedToken = signDeveloperToken(teamId, keyId, pem);
  } catch (err: any) {
    throw new Error(
      `Impossible de signer le developer token Apple (clé invalide ?) : ${err?.message || err}`
    );
  }
  return cachedToken.token;
}

interface AppleFetchOptions {
  developerToken: string;
  musicUserToken?: string;
  method?: string;
  body?: unknown;
}

async function appleFetch(path: string, opts: AppleFetchOptions): Promise<any> {
  const res = await fetch(`${APPLE_API_BASE}${path}`, {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${opts.developerToken}`,
      ...(opts.musicUserToken ? { "Music-User-Token": opts.musicUserToken } : {}),
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const detail =
      (json?.errors?.[0]?.detail as string) ||
      (json?.errors?.[0]?.title as string) ||
      text.slice(0, 300) ||
      `Apple API error ${res.status}`;
    const err = new Error(detail) as any;
    err.status = res.status;
    throw err;
  }
  return json;
}

export interface AppleCatalogSong {
  catalogId: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  artworkUrl?: string;
  appleUrl?: string;
}

function artworkToUrl(artwork?: { url?: string; width?: number; height?: number }, size = 400): string | undefined {
  if (!artwork?.url) return undefined;
  return artwork.url.replace("{w}", String(size)).replace("{h}", String(size));
}

/** Recherche catalogue (nécessite le storefront, ex: "fr", "us"). */
export async function searchAppleCatalog(
  developerToken: string,
  storefront: string,
  term: string,
  limit = 5
): Promise<AppleCatalogSong[]> {
  const sf = (storefront || "fr").toLowerCase();
  const json = await appleFetch(
    `/catalog/${encodeURIComponent(sf)}/search?term=${encodeURIComponent(term)}&types=songs&limit=${Math.max(1, Math.min(10, limit))}`,
    { developerToken }
  );
  const songs: any[] = json?.results?.songs?.data || [];
  return songs.map((s) => ({
    catalogId: s.id as string,
    title: s.attributes?.name || "Unknown title",
    artist: s.attributes?.artistName || "Unknown artist",
    album: s.attributes?.albumName,
    durationSeconds: s.attributes?.durationInMillis
      ? Math.round(s.attributes.durationInMillis / 1000)
      : undefined,
    artworkUrl: artworkToUrl(s.attributes?.artwork),
    appleUrl: s.attributes?.url,
  }));
}

export interface AppleLibraryPlaylist {
  id: string;
  name: string;
  trackCount?: number;
  appleUrl?: string;
}

/** Playlists de la bibliothèque iCloud de l'utilisateur (nécessite le music-user-token). */
export async function listAppleLibraryPlaylists(
  developerToken: string,
  musicUserToken: string
): Promise<AppleLibraryPlaylist[]> {
  const json = await appleFetch(`/me/library/playlists?limit=100`, {
    developerToken,
    musicUserToken,
  });
  const items: any[] = json?.data || [];
  return items.map((p) => ({
    id: p.id as string,
    name: p.attributes?.name || "Untitled playlist",
    trackCount: p.attributes?.trackCount,
    appleUrl: p.attributes?.url,
  }));
}

/** Crée une playlist dans la bibliothèque iCloud de l'utilisateur. */
export async function createAppleLibraryPlaylist(
  developerToken: string,
  musicUserToken: string,
  name: string,
  description?: string
): Promise<AppleLibraryPlaylist> {
  const json = await appleFetch(`/me/library/playlists`, {
    developerToken,
    musicUserToken,
    method: "POST",
    body: {
      attributes: {
        name,
        ...(description ? { description } : {}),
      },
    },
  });
  const created: any = json?.data?.[0];
  if (!created?.id) throw new Error("Apple n'a pas retourné la playlist créée.");
  return {
    id: created.id as string,
    name: created.attributes?.name || name,
    trackCount: 0,
  };
}

/** Ajoute des morceaux du catalogue (ids "songs") à une playlist de la bibliothèque. */
export async function addSongsToAppleLibraryPlaylist(
  developerToken: string,
  musicUserToken: string,
  playlistLibraryId: string,
  catalogSongIds: string[]
): Promise<{ added: number }> {
  if (catalogSongIds.length === 0) return { added: 0 };
  await appleFetch(`/me/library/playlists/${encodeURIComponent(playlistLibraryId)}/tracks`, {
    developerToken,
    musicUserToken,
    method: "POST",
    body: {
      data: catalogSongIds.map((id) => ({ id, type: "songs" })),
    },
  });
  return { added: catalogSongIds.length };
}

/** Un token MusicKit user ressemble à un long JWT ; les faux tokens de dev commencent par "token_". */
export function looksLikeRealMusicUserToken(token: string): boolean {
  if (!token) return false;
  if (token.startsWith("token_")) return false;
  return token.length > 100;
}
