// src/app/api/apple-music/developer-token/route.ts — fournit le developer token MusicKit au front.
// Le token développeur n'est pas un secret utilisateur, mais il est généré
// côté serveur (clé privée .p8 jamais exposée). Requiert une session.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getDeveloperToken,
  isAppleMusicServerConfigured,
  configurationMissingReason,
} from "@/lib/apple-music-server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAppleMusicServerConfigured()) {
    return NextResponse.json(
      { configured: false, error: configurationMissingReason() },
      { status: 503 }
    );
  }
  try {
    const developerToken = getDeveloperToken();
    return NextResponse.json({ configured: true, developerToken });
  } catch (err: any) {
    return NextResponse.json(
      { configured: false, error: err?.message || "Apple Music not configured." },
      { status: 503 }
    );
  }
}
