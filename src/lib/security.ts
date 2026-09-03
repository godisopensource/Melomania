import crypto from "crypto";
import { z } from "zod";
import type { User } from "@/types";

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

export function getSessionSecret(): string {
  const s =
    process.env.SESSION_SECRET ||
    process.env.ENCRYPTION_KEY ||
    (process.env.NODE_ENV === "production" ? "" : "dev-only-session-secret-change-me-32b!");
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not configured.");
  }
  return s;
}

// ---------------------------------------------------------------------------
// Validation (serveur + réutilisable côté client pour les hints)
// ---------------------------------------------------------------------------

// Email strict : exige un point dans le domaine + TLD >= 2 lettres.
// Rejette "coucou@coucou", "a@b", "a@b.c", espaces, etc.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, "Email too short.")
  .max(254, "Email too long.")
  .email("Invalid email address.")
  .refine((v) => {
    const at = v.lastIndexOf("@");
    if (at <= 0) return false;
    const domain = v.slice(at + 1);
    if (domain.length < 4) return false; // ex. a.bc minimum
    if (!domain.includes(".")) return false; // rejette coucou@coucou
    if (domain.startsWith(".") || domain.endsWith(".")) return false;
    if (domain.includes("..")) return false;
    const tld = domain.slice(domain.lastIndexOf(".") + 1);
    return /^[a-z]{2,63}$/.test(tld);
  }, "Invalid email address: domain must contain a valid extension (e.g. .com, .fr).")
  .refine((v) => !v.includes(" ") && v === v.trim(), "Invalid email address.");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters.")
  .max(30, "Username must be at most 30 characters.")
  .regex(/^[a-z0-9_-]+$/, "Username may only contain lowercase letters, digits, _ and -.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40, "Display name must be at most 40 characters.")
  .refine((v) => !/[<>]/.test(v), "Display name must not contain < or >.")
  .optional();

const COMMON_PASSWORDS = new Set([
  "password",
  "password123",
  "123456",
  "123456789",
  "qwerty",
  "azerty",
  "letmein",
  "welcome",
  "admin123",
  "melomania",
  "motdepasse",
  "soleil123",
  "bonjour1",
]);

export function checkPasswordStrength(
  password: string,
  opts?: { username?: string; email?: string }
): string | null {
  if (typeof password !== "string") return "Invalid password.";
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (password.length > 128) return "Password must be at most 128 characters.";
  if (/^\s|\s$/.test(password)) return "Password must not start or end with a space.";

  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  if (/[^a-zA-Z0-9]/.test(password)) classes++;
  if (classes < 3) {
    return "Password must include at least 3 of: lowercase, UPPERCASE, digits, symbols.";
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "This password is too common, pick another one.";
  // Rejette les mots de passe qui contiennent le username ou la partie locale de l'email
  const uname = opts?.username?.toLowerCase();
  if (uname && uname.length >= 3 && lower.includes(uname)) {
    return "Password must not contain your username.";
  }
  const local = opts?.email?.toLowerCase().split("@")[0];
  if (local && local.length >= 4 && lower.includes(local)) {
    return "Password must not contain your email name.";
  }
  // Suites triviales
  if (/(.)\1{4,}/.test(password)) return "Password must not repeat the same character 5+ times.";
  return null;
}

export const loginSchema = z.object({
  emailOrUsername: z.string().trim().min(1, "Required.").max(254),
  password: z.string().min(1, "Required.").max(128),
});

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  password: z.string().min(12).max(128),
});

// ---------------------------------------------------------------------------
// Utilisateurs sûrs pour le front / l'API
// ---------------------------------------------------------------------------

export type SafeUser = Omit<User, "passwordHash">;
export type PublicUser = Omit<User, "passwordHash" | "email">;

export function toSafeUser(user: User): SafeUser {
  const { passwordHash: _omit, ...rest } = user;
  return rest;
}

/** Profil public : jamais d'email, jamais de hash. */
export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _h, email: _e, ...rest } = user;
  return rest;
}

// ---------------------------------------------------------------------------
// Sessions signées HMAC (anti-falsification du cookie)
// ---------------------------------------------------------------------------

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 jours (au lieu de 30)

export function getSessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(data).digest("base64url");
}

export function signSession(userId: string, ttlSeconds = SESSION_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}.${exp}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifySession(token: string): { userId: string } | null {
  if (!token || typeof token !== "string") return null;
  if (token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null; // ancien cookie non signé => invalide (déconnexion)
  const [userId, expStr, sig] = parts;
  if (!userId || !expStr || !sig) return null;
  if (!/^usr_[A-Za-z0-9_-]{1,64}$/.test(userId) && userId !== "usr_admin") return null;
  const exp = Number(expStr);
  if (!Number.isInteger(exp)) return null;
  if (exp * 1000 < Date.now()) return null;
  const expected = hmac(`${userId}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  return { userId };
}

// ---------------------------------------------------------------------------
// Rate limiting en mémoire (par instance ; suffisant sans dépendance externe)
// ---------------------------------------------------------------------------

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.count < limit) {
    entry.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }
  // Opportunistic cleanup
  if (buckets.size > 10000 && Math.random() < 0.01) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
}

export function getClientIp(req: Request): string {
  const h = (name: string) => req.headers.get(name);
  const forwarded = h("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return (h("x-real-ip") || "unknown").slice(0, 64);
}
