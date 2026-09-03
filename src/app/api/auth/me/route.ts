// src/app/api/auth/me/route.ts — /api/auth/me : session, connexion, déconnexion

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, loginUser, registerUser, logoutUser, switchDemoUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  const allUsers = db.getUsers().map(({ passwordHash, ...rest }) => rest);
  return NextResponse.json({ user, allUsers });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === "login") {
    const { emailOrUsername, password } = body;
    const result = await loginUser(emailOrUsername, password);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ user: result.user });
  }

  if (action === "register") {
    const { email, username, displayName, password } = body;
    const result = await registerUser({
      email,
      username,
      displayName,
      passwordPlain: password,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ user: result.user });
  }

  if (action === "logout") {
    await logoutUser();
    return NextResponse.json({ success: true });
  }

  if (action === "switch_demo") {
    const { userId } = body;
    const user = await switchDemoUser(userId);
    return NextResponse.json({ user });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
