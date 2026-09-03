"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../providers/AuthProvider";
import { Lock, Mail, AlertCircle } from "lucide-react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: string | HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      getResponse: (id?: string) => string;
    };
    melomaniaTurnstileLoad?: () => void;
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export function AuthModal() {
  const { authModalOpen, authModalMode, closeAuthModal, openAuthModal, login, register } = useAuth();

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const widgetId = useRef<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Charge le widget Turnstile uniquement sur l'onglet inscription
  useEffect(() => {
    if (!authModalOpen || authModalMode !== "register" || !TURNSTILE_SITE_KEY) return;
    setTurnstileToken("");
    widgetId.current = null;

    const renderWidget = () => {
      if (!window.turnstile || !widgetRef.current) return;
      widgetRef.current.innerHTML = "";
      try {
        widgetId.current = window.turnstile.render(widgetRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action: "signup",
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => setTurnstileToken(""),
        });
      } catch {
        /* widget indisponible : le serveur rejettera proprement */
      }
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }
    window.melomaniaTurnstileLoad = renderWidget;
    const script = document.querySelector<HTMLScriptElement>('script[data-melomania-turnstile]');
    if (!script) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=melomaniaTurnstileLoad";
      s.async = true;
      s.defer = true;
      s.setAttribute("data-melomania-turnstile", "1");
      document.head.appendChild(s);
    } else {
      // Script déjà présent mais pas encore prêt : réessaie
      const t = setInterval(() => {
        if (window.turnstile) {
          clearInterval(t);
          renderWidget();
        }
      }, 300);
      const stop = setTimeout(() => clearInterval(t), 10000);
      return () => {
        clearInterval(t);
        clearTimeout(stop);
      };
    }
  }, [authModalOpen, authModalMode]);

  if (!authModalOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await login(emailOrUsername.trim(), password);
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || "Authentication failed");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Pré-validation côté client (le serveur re-valide strictement)
    const em = email.trim();
    if (!em.includes("@") || !em.split("@")[1]?.includes(".")) {
      setError("Please enter a valid email address (e.g. you@example.com).");
      return;
    }
    if (regPassword.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    setSubmitting(true);
    const res = await register({
      email: em,
      username: username.trim(),
      displayName: displayName.trim(),
      passwordPlain: regPassword,
      // Champ canonique Turnstile : cf-turnstile-response
      "cf-turnstile-response": turnstileToken || undefined,
    });
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || "Registration failed");
      // Le token Turnstile est à usage unique : on le régénère après échec
      setTurnstileToken("");
      try {
        if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
      } catch {}
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          onClick={closeAuthModal}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          ✕
        </button>

        <div className="text-center mb-6">
          <img src="/icon.png" alt="Melomania" className="mx-auto h-12 w-12 rounded-xl object-contain mb-3" />
          <h2 className="font-display text-2xl font-bold text-foreground">
            {authModalMode === "login" ? "Sign in to Melomania" : "Create an account"}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Share and annotate music with precise timecode conversations
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {authModalMode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Email or username
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  required
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder="Username or email"
                  autoComplete="username"
                  maxLength={254}
                  className="w-full rounded-lg border border-border bg-black/40 py-2.5 pl-10 pr-3.5 text-sm text-foreground focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  maxLength={128}
                  className="w-full rounded-lg border border-border bg-black/40 py-2.5 pl-10 pr-3.5 text-sm text-foreground focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-brand-500 py-2.5 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors disabled:opacity-50"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Don&apos;t have an account yet?{" "}
              <button
                type="button"
                onClick={() => openAuthModal("register")}
                className="font-semibold text-brand-320 hover:underline"
              >
                Create account
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                autoComplete="email"
                maxLength={254}
                className="w-full rounded-lg border border-border bg-black/40 px-3.5 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  autoComplete="username"
                  maxLength={30}
                  pattern="[a-z0-9_-]{3,30}"
                  title="3-30 chars: lowercase letters, digits, _ and -"
                  className="w-full rounded-lg border border-border bg-black/40 px-3.5 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Display name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display Name"
                  autoComplete="nickname"
                  maxLength={40}
                  className="w-full rounded-lg border border-border bg-black/40 px-3.5 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Password</label>
              <input
                type="password"
                required
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Minimum 12 characters"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                className="w-full rounded-lg border border-border bg-black/40 px-3.5 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                12+ characters with at least 3 of: lowercase, UPPERCASE, digits, symbols.
              </p>
            </div>

            {TURNSTILE_SITE_KEY ? (
              <div className="flex justify-center">
                <div ref={widgetRef} />
              </div>
            ) : (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-200/90">
                Bot protection (Cloudflare Turnstile) will be active once{" "}
                <code>NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> is configured.
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-brand-500 py-2.5 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors disabled:opacity-50"
            >
              {submitting ? "Creating account..." : "Sign up"}
            </button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => openAuthModal("login")}
                className="font-semibold text-brand-320 hover:underline"
              >
                Sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
