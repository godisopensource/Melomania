"use client";

// src/components/layout/OnboardingModal.tsx — onboarding à la création de compte.
// « Quels services connecter / activer ? » parmi Spotify et Apple Music.
// - Spotify : vraie connexion OAuth (redirige vers /api/spotify/auth ; la
//   modale se rouvre au retour grâce au flag onboarding-pending).
// - Apple Music : switch d'activation des liens (mode gratuit, sans compte).
// Fermée via Done/Skip -> flag onboarded (ne se rouvre plus jamais).

import React, { useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import { useLinkPrefs } from "@/lib/link-prefs";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { CheckCircle2, Loader2, Music2 } from "lucide-react";

export const ONBOARDED_KEY = "melomania:onboarded";
export const ONBOARDING_PENDING_KEY = "melomania:onboarding-pending";

export function isOnboarded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return true;
  }
}

export function OnboardingModal() {
  const { user, onboardingOpen, completeOnboarding } = useAuth();
  const [linkPrefs, setLinkPrefs] = useLinkPrefs();
  const [spotifyConn, setSpotifyConn] = useState<any | null>(null);
  const [checking, setChecking] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!onboardingOpen) return;
    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const res = await fetch("/api/connections");
        if (res.ok) {
          const data = await res.json();
          const list: any[] = data.connections || [];
          const sp = list.find((c) => c.provider === "spotify");
          if (!cancelled) setSpotifyConn(sp && sp.isReal !== false ? sp : null);
        }
      } catch {}
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [onboardingOpen, user]);

  if (!onboardingOpen) return null;

  const handleSpotifyConnect = () => {
    setConnecting(true);
    try {
      window.localStorage.setItem(ONBOARDING_PENDING_KEY, "1");
    } catch {}
    window.location.href = "/api/spotify/auth";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="text-center mb-5">
          <img src="/icon.png" alt="Melomania" className="mx-auto h-12 w-12 rounded-xl object-contain mb-3" />
          <h2 className="font-display text-2xl font-bold text-foreground">
            Welcome{user?.displayName ? `, ${user.displayName}` : ""} 🎶
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Connect your streaming services to get the most out of Melomania.
          </p>
        </div>

        <div className="space-y-3">
          {/* Spotify */}
          <div className="rounded-xl border border-border bg-black/20 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1DB954]/20 text-[#1DB954] ring-1 ring-[#1DB954]/30">
                  <span className="font-black text-lg">S</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Spotify</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {checking
                      ? "Checking…"
                      : spotifyConn
                        ? spotifyConn.accountName
                        : "Add tracks to your playlists in one click"}
                  </p>
                </div>
              </div>
              {spotifyConn ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Connected
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleSpotifyConnect}
                  disabled={connecting || checking}
                  className="rounded-lg bg-[#1DB954] px-3.5 py-1.5 text-xs font-semibold text-black hover:opacity-90 shadow disabled:opacity-50"
                >
                  {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
                </button>
              )}
            </div>
          </div>

          {/* Apple Music — activation des liens */}
          <div className="rounded-xl border border-border bg-black/20 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FC3C44]/20 text-[#FC3C44] ring-1 ring-[#FC3C44]/30">
                  <Music2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Apple Music</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Show « Open in Apple Music » buttons on the player
                  </p>
                </div>
              </div>
              <ToggleSwitch
                checked={linkPrefs.appleLinks}
                onChange={(v) => setLinkPrefs({ appleLinks: v })}
                label="Enable Apple Music links"
                activeClass="bg-[#FC3C44]"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              No login needed — links open the real track in Apple Music.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={completeOnboarding}
            className="w-full rounded-lg bg-brand-500 py-2.5 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={completeOnboarding}
            className="w-full py-1 text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
