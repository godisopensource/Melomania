// GET /api/spotify/auth — démarre l'OAuth Spotify (compte dev gratuit).
// Requiert une session Melomania. Redirige vers accounts.spotify.com.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildAuthorizeUrl, spotifyEnvConfigured } from "@/lib/spotify-server";

function requestOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/?auth=required", req.url));
  }
  if (!spotifyEnvConfigured()) {
    return NextResponse.redirect(
      new URL("/settings/services?spotify=not-configured", requestOrigin(req))
    );
  }
  try {
    const authorizeUrl = buildAuthorizeUrl(requestOrigin(req), user.id);
    return NextResponse.redirect(authorizeUrl);
  } catch (err: any) {
    return NextResponse.redirect(
      new URL(
        `/settings/services?spotify=error&reason=${encodeURIComponent(err?.message || "setup")}`,
        requestOrigin(req)
      )
    );
  }
}
