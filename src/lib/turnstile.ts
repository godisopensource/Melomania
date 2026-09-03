// Vérification serveur Cloudflare Turnstile (anti-bots à l'inscription).
// Surface protégée : inscription — action stable "signup".
// Chaîne : navigateur → notre backend → siteverify (jamais d'appel direct navigateur → Cloudflare).
//
// Config :
//   TURNSTILE_SECRET (canonique) ou TURNSTILE_SECRET_KEY (legacy) — secret serveur, jamais exposé
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY — clé publique du widget (front)
//   TURNSTILE_HOSTNAMES — CSV des hostnames front autorisés (ex. "melomania.app,www.melomania.app").
//                         Vérifié quand défini ; warning en prod si absent.

export const TURNSTILE_SIGNUP_ACTION = "signup";

const SITE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function getTurnstileSecret(): string {
  return process.env.TURNSTILE_SECRET || process.env.TURNSTILE_SECRET_KEY || "";
}

export function isTurnstileConfigured(): boolean {
  return getTurnstileSecret().length > 0;
}

function expectedHostnames(): Set<string> {
  return new Set(
    (process.env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string
): Promise<{ ok: boolean; error?: string }> {
  const secret = getTurnstileSecret();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "Account creation is temporarily disabled (captcha not configured)." };
    }
    console.warn("[turnstile] TURNSTILE_SECRET missing — skipping verification in dev.");
    return { ok: true };
  }

  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, error: "Captcha verification is required." };
  }

  let result: { success?: boolean; action?: string; hostname?: string };
  try {
    const res = await fetch(SITE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret,
        response: token, // cf-turnstile-response from the request
        ...(remoteIp && remoteIp !== "unknown" ? { remoteip: remoteIp } : {}),
      }),
    });
    if (!res.ok) return { ok: false, error: "Captcha verification failed, please retry." };
    result = (await res.json()) as { success?: boolean; action?: string; hostname?: string };
  } catch {
    return { ok: false, error: "Captcha verification failed, please retry." };
  }

  if (!result.success) return { ok: false, error: "Captcha verification failed, please retry." };
  if (result.action !== TURNSTILE_SIGNUP_ACTION) {
    return { ok: false, error: "Captcha verification failed, please retry." };
  }
  const allowed = expectedHostnames();
  if (allowed.size > 0) {
    if (!result.hostname || !allowed.has(result.hostname.toLowerCase())) {
      return { ok: false, error: "Captcha verification failed, please retry." };
    }
  } else if (process.env.NODE_ENV === "production") {
    console.warn("[turnstile] TURNSTILE_HOSTNAMES not set — skipping hostname check in prod.");
  }
  return { ok: true };
}
