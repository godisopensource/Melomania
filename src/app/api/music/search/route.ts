// src/app/api/music/search/route.ts — /api/music/search : recherche multi-services musicaux

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeMusicText } from "@/lib/utils";
import { toPublicUser } from "@/lib/security";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").slice(0, 100);
  const type = searchParams.get("type"); // 'all', 'user', 'track', 'artist', 'playlist'

  if (!q.trim()) {
    const allUsersEmpty = await db.getUsers();
    const allResourcesEmpty = await db.getMusicResources();
    return NextResponse.json({
      users: allUsersEmpty.slice(0, 5).map(toPublicUser),
      tracks: allResourcesEmpty.filter((r) => r.type === "track").slice(0, 5),
      playlists: allResourcesEmpty.filter((r) => r.type === "playlist").slice(0, 5),
    });
  }

  const queryClean = normalizeMusicText(q);

  // Match users
  const allUsers = await db.getUsers();
  const users = allUsers
    .filter(
      (u) =>
        u.username.toLowerCase().includes(queryClean) ||
        u.displayName.toLowerCase().includes(queryClean)
    )
    .slice(0, 6)
    .map(toPublicUser);

  void type;

  // Match music resources
  const allResources = await db.getMusicResources();
  const tracks = allResources
    .filter(
      (r) =>
        r.type === "track" &&
        (normalizeMusicText(r.title).includes(queryClean) ||
          normalizeMusicText(r.artistName).includes(queryClean) ||
          normalizeMusicText(r.albumName || "").includes(queryClean))
    )
    .slice(0, 6);

  const playlists = allResources
    .filter(
      (r) =>
        r.type === "playlist" &&
        (normalizeMusicText(r.title).includes(queryClean) ||
          normalizeMusicText(r.artistName).includes(queryClean))
    )
    .slice(0, 6);

  return NextResponse.json({
    users,
    tracks,
    playlists,
  });
}
