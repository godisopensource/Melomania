import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "./db";
import { User } from "@/types";
import {
  signSession,
  verifySession,
  getSessionTtlSeconds,
  emailSchema,
  usernameSchema,
  displayNameSchema,
  checkPasswordStrength,
  toSafeUser,
  type SafeUser,
} from "./security";
import { verifyTurnstileToken } from "./turnstile";

const SESSION_COOKIE_NAME = "melomania_session";
const BCRYPT_COST = 12;

// Message volontairement générique : ne révèle pas si l'identifiant existe.
const GENERIC_LOGIN_ERROR = "Invalid email/username or password.";

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

async function setSessionCookie(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, signSession(userId), sessionCookieOptions(getSessionTtlSeconds()));
}

export async function getSessionUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!sessionCookie?.value) return null;
    const verified = verifySession(sessionCookie.value);
    if (!verified) return null;
    return db.getUserById(verified.userId) || null;
  } catch {
    return null;
  }
}

export async function loginUser(
  emailOrUsername: string,
  passwordPlain: string
): Promise<{ user?: SafeUser; error?: string }> {
  const identifier = (emailOrUsername || "").trim().slice(0, 254);
  if (!identifier || !passwordPlain || typeof passwordPlain !== "string") {
    return { error: GENERIC_LOGIN_ERROR };
  }
  if (passwordPlain.length > 128) return { error: GENERIC_LOGIN_ERROR };

  const isEmail = identifier.includes("@");
  const user = isEmail ? db.getUserByEmail(identifier) : db.getUserByUsername(identifier);

  // Comparaison à temps quasi-constant même si l'utilisateur n'existe pas
  // (anti-énumération par timing).
  const fakeHash = "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaO";
  const hashToCompare = user?.passwordHash || fakeHash;
  let isValid = false;
  try {
    isValid = await bcrypt.compare(passwordPlain, hashToCompare);
  } catch {
    isValid = false;
  }
  if (!user || !user.passwordHash || !isValid) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  await setSessionCookie(user.id);
  return { user: toSafeUser(user) };
}

export async function registerUser(input: {
  email: string;
  username: string;
  displayName?: string;
  passwordPlain: string;
  turnstileToken?: string;
  remoteIp?: string;
}): Promise<{ user?: SafeUser; error?: string }> {
  // 1. Captcha d'abord (anti-bots / anti-spam d'inscriptions)
  const captcha = await verifyTurnstileToken(input.turnstileToken, input.remoteIp);
  if (!captcha.ok) return { error: captcha.error || "Captcha verification failed." };

  // 2. Validation stricte (rejette "coucou@coucou", "abcdef", etc.)
  const emailParsed = emailSchema.safeParse(input.email);
  if (!emailParsed.success) {
    return { error: emailParsed.error.issues[0]?.message || "Invalid email address." };
  }
  const usernameParsed = usernameSchema.safeParse(input.username);
  if (!usernameParsed.success) {
    return { error: usernameParsed.error.issues[0]?.message || "Invalid username." };
  }
  const displayParsed = displayNameSchema.safeParse(input.displayName || undefined);
  if (!displayParsed.success) {
    return { error: "Invalid display name." };
  }
  const email = emailParsed.data;
  const cleanUsername = usernameParsed.data;

  const pwdError = checkPasswordStrength(input.passwordPlain, { username: cleanUsername, email });
  if (pwdError) return { error: pwdError };

  // 3. Unicité (messages distincts acceptés ici : le captcha + rate-limit
  //    rendent l'énumération massive impraticable, et l'UX y gagne)
  if (db.getUserByEmail(email)) {
    return { error: "This email address is already in use." };
  }
  if (db.getUserByUsername(cleanUsername)) {
    return { error: "This username is already taken." };
  }

  const passwordHash = await bcrypt.hash(input.passwordPlain, BCRYPT_COST);
  const now = new Date().toISOString();

  const newUser: User = {
    id: `usr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    email,
    username: cleanUsername,
    displayName: (input.displayName || "").trim().slice(0, 40) || cleanUsername,
    avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`,
    isPublic: true,
    passwordHash,
    role: "user",
    createdAt: now,
    updatedAt: now,
  };

  db.createUser(newUser);
  await setSessionCookie(newUser.id);
  return { user: toSafeUser(newUser) };
}

export async function logoutUser(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(0), maxAge: 0 });
}
