// src/app/api/auth/me/route.ts — /api/auth/me : session, connexion, déconnexion

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, loginUser, registerUser, logoutUser } from "@/lib/auth";
import { toSafeUser } from "@/lib/security";
import { checkRateLimit, getClientIp } from "@/lib/security";

export async function GET() {
  const user = await getSessionUser();
  // NOTE: on ne renvoie plus la liste des utilisateurs (fuite d'emails).
  return NextResponse.json({ user: user ? toSafeUser(user) : null });
}

export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { action } = body || {};
  const ip = getClientIp(req);

  if (action === "login") {
    const rl = checkRateLimit(`login:${ip}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts, please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }
    const { emailOrUsername, password } = body;
    if (typeof emailOrUsername !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Invalid email/username or password." }, { status: 400 });
    }
    const result = await loginUser(emailOrUsername.slice(0, 254), password.slice(0, 128));
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    return NextResponse.json({ user: result.user });
  }

  if (action === "register") {
    const rl = checkRateLimit(`register:${ip}`, 5, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many accounts created from this network, please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }
    const { email, username, displayName, password } = body;
    // Champ canonique Turnstile (cf-turnstile-response).
    const cfToken = body["cf-turnstile-response"];
    if (typeof email !== "string" || typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const result = await registerUser({
      email: email.slice(0, 254),
      username: username.slice(0, 30),
      displayName: typeof displayName === "string" ? displayName.slice(0, 40) : undefined,
      passwordPlain: password.slice(0, 128),
      turnstileToken: typeof cfToken === "string" ? cfToken.slice(0, 2048) : undefined,
      remoteIp: ip,
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

  // "switch_demo" supprimé : c'était une impersonnation sans authentification.
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
