"use client";

// src/components/player/AddToAppleMusicButton.tsx
//
// Mode GRATUIT (pas de programme dev Apple requis) :
// - recherche réelle via iTunes Search API (proxy /api/apple-music/search),
// - bouton « Open in Apple Music » qui ouvre le morceau dans Apple Music,
//   où l'utilisateur l'ajoute lui-même à sa playlist.
// - Visible uniquement si les liens Apple Music sont activés
//   (switch dans Settings → Services, ou onboarding).
// Aucun compte à connecter : aucun bouton quand le switch est off.

import React, { useState } from "react";
import { ExternalLink, Loader2, AlertTriangle, X, Music2 } from "lucide-react";
import { usePlayerState } from "../providers/PlayerProvider";
import { useLinkPrefs } from "@/lib/link-prefs";

interface ITunesHit {
  catalogId: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  artworkUrl?: string;
  previewUrl?: string;
  appleUrl: string;
}

export function AddToAppleMusicButton({ className = "" }: { className?: string }) {
  const { currentTrack } = usePlayerState();
  const [prefs] = useLinkPrefs();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<ITunesHit[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!prefs.appleLinks) return null;
  if (!currentTrack) return null;

  const trackLabel = `${currentTrack.title} ${currentTrack.artistName || ""}`.trim();

  const openPanel = async () => {
    setOpen(true);
    setBusy(true);
    setError(null);
    setHits([]);
    try {
      const res = await fetch(`/api/apple-music/search?term=${encodeURIComponent(trackLabel)}&limit=5`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Apple Music search failed.");
      const results: ITunesHit[] = data.results || [];
      setHits(results);
      if (results.length === 0) setError("No match found on Apple Music for this track.");
    } catch (e: any) {
      setError(e?.message || "Apple Music search failed.");
    } finally {
      setBusy(false);
    }
  };

  const best = hits[0];

  return (
    <div className={className}>
      <button
        type="button"
        onClick={openPanel}
        className="melo-focus-ring flex items-center gap-1.5 rounded-lg border border-[#FC3C44]/40 bg-[#FC3C44]/15 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-[#FC3C44]/25 transition-colors"
      >
        <Music2 className="h-3.5 w-3.5 text-[#FC3C44]" />
        <span>Open in Apple Music</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-label="Open in Apple Music"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border bg-black/20 p-3.5">
              <div className="flex items-center gap-2">
                <Music2 className="h-4 w-4 text-[#FC3C44]" />
                <h3 className="text-sm font-bold text-foreground">Open in Apple Music</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              {busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-[#FC3C44]" />
                  <span>Searching Apple Music for “{trackLabel}”…</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {best && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5 rounded-lg border border-border bg-white/5 p-2.5">
                    {best.artworkUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={best.artworkUrl} alt="" className="h-11 w-11 rounded object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded bg-[#FC3C44]/20 text-[#FC3C44]">
                        <Music2 className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-foreground">{best.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {best.artist}
                        {best.album ? ` · ${best.album}` : ""}
                      </p>
                    </div>
                  </div>

                  {best.previewUrl && (
                    <audio controls preload="none" src={best.previewUrl} className="w-full h-8" />
                  )}

                  {hits.length > 1 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        Other matches
                      </p>
                      <div className="max-h-32 space-y-1 overflow-y-auto">
                        {hits.slice(1).map((h) => (
                          <a
                            key={h.catalogId}
                            href={h.appleUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                          >
                            <span className="truncate">
                              {h.title} · {h.artist}
                            </span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <a
                    href={best.appleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#FC3C44] px-4 py-2 text-xs font-semibold text-white shadow hover:opacity-90 transition-opacity"
                  >
                    <span>Open in Apple Music</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <p className="text-center text-[11px] text-muted-foreground">
                    Add it to your playlist from the Apple Music app.
                  </p>
                </div>
              )}

              {!busy && !best && !error && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-white/5 hover:text-foreground"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
