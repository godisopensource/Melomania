import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptToken } from "@/lib/encryption";
import { ExternalConnection } from "@/types";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const connections = db.getConnectionsByUserId(user.id);
  const safeConnections = connections.map(({ accessTokenEncrypted, refreshTokenEncrypted, ...rest }) => ({
    ...rest,
    isConnected: true,
  }));

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
    db.deleteConnection(user.id, provider);
    return NextResponse.json({ success: true, isConnected: false });
  }

  if (action === "connect") {
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

    db.saveConnection(newConnection);
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
