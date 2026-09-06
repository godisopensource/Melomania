"use client";

import React, { useState, useEffect } from "react";
import { MusicResource, TrackMatch, ExportJob } from "@/types";
import { formatTime } from "@/lib/utils";
import {
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Share2,
  Loader2,
  Check,
  ArrowRight,
} from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: MusicResource;
}

export function ExportModal({ isOpen, onClose, resource }: ExportModalProps) {
  const [provider, setProvider] = useState<"spotify" | "apple_music">("spotify");
  const [step, setStep] = useState<"matching" | "review" | "exporting" | "success">("matching");
  const [matches, setMatches] = useState<TrackMatch[]>([]);
  const [selectedMatchMap, setSelectedMatchMap] = useState<Record<string, TrackMatch>>({});
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState(resource.title || "Melomania Export");
  // L'onglet Apple Music n'existe qu'avec un vrai compte connecté (MusicKit
  // payant). En mode gratuit, seul l'export Spotify est proposé.
  const [appleRealConnected, setAppleRealConnected] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep("matching");
      setMatches([]);
      setExportJob(null);
      setErrorMsg(null);
      return;
    }

    // Toujours Spotify par défaut ; Apple seulement si vraiment connecté.
    setProvider("spotify");
    fetch("/api/connections")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list: any[] = data?.connections || [];
        const apple = list.find((c) => c.provider === "apple_music");
        const isReal = !!apple && apple.isReal !== false;
        setAppleRealConnected(isReal);
        if (!isReal) setProvider("spotify");
      })
      .catch(() => setAppleRealConnected(false));

    startMatching();
  }, [isOpen, provider, resource.id]);

  const startMatching = async () => {
    setStep("matching");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview_match",
          resourceId: resource.id,
          targetProvider: provider,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error while searching for track matches");
      }

      const data = await res.json();
      const matchResults: TrackMatch[] = data.matches || [];
      setMatches(matchResults);

      const initialMap: Record<string, TrackMatch> = {};
      matchResults.forEach((m) => {
        initialMap[m.sourceMusicResourceId] = m;
      });
      setSelectedMatchMap(initialMap);
      setStep("review");
    } catch (err: any) {
      setErrorMsg(err.message);
      setStep("review");
    }
  };

  const handleSelectAlternative = (sourceId: string, alt: any) => {
    setSelectedMatchMap((prev) => ({
      ...prev,
      [sourceId]: {
        ...prev[sourceId],
        targetExternalId: alt.externalId,
        targetTitle: alt.title,
        targetArtist: alt.artist,
        targetAlbum: alt.album,
        targetDurationSeconds: alt.durationSeconds,
        targetCoverUrl: alt.coverUrl,
        targetVersionLabel: alt.versionLabel,
        confidenceScore: alt.confidenceScore,
        matchStatus: "manual",
      },
    }));
  };

  const handleExecuteExport = async () => {
    setStep("exporting");
    setErrorMsg(null);

    try {
      const selectedList = Object.values(selectedMatchMap);
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute_export",
          resourceId: resource.id,
          targetProvider: provider,
          playlistTitle: customTitle,
          selectedMatches: selectedList,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error during export.");
      }

      setExportJob(data.job);
      setStep("success");
    } catch (err: any) {
      setErrorMsg(err.message);
      setStep("review");
    }
  };

  if (!isOpen) return null;

  const autoCount = matches.filter((m) => m.confidenceScore >= 90).length;
  const confirmCount = matches.filter(
    (m) => m.confidenceScore >= 70 && m.confidenceScore < 90
  ).length;
  const notFoundCount = matches.filter((m) => m.confidenceScore < 70).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-black/20">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/20 text-brand-320">
              <Share2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Export to streaming service
              </h3>
              <p className="text-xs text-muted-foreground">
                Generate an external playlist with automated catalog matching
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Provider Switcher — Apple visible uniquement si vraiment connecté */}
        <div className="flex border-b border-border bg-black/20 p-2.5 gap-2">
          <button
            onClick={() => setProvider("spotify")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
              provider === "spotify"
                ? "bg-[#1DB954] text-black shadow"
                : "bg-white/5 text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>Spotify</span>
          </button>
          {appleRealConnected && (
            <button
              onClick={() => setProvider("apple_music")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
                provider === "apple_music"
                  ? "bg-[#FC3C44] text-white shadow"
                  : "bg-white/5 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Apple Music</span>
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {step === "matching" && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Analyzing candidate matches...
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Comparing titles, durations, and version tags with {provider === "spotify" ? "Spotify" : "Apple Music"}
                </p>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-center">
                  <span className="block text-base font-bold text-emerald-400">{autoCount}</span>
                  <span className="text-[10px] text-emerald-300">Automatic (≥90%)</span>
                </div>
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-2.5 text-center">
                  <span className="block text-base font-bold text-yellow-400">{confirmCount}</span>
                  <span className="text-[10px] text-yellow-300">Confirm (70-89%)</span>
                </div>
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-center">
                  <span className="block text-base font-bold text-rose-400">{notFoundCount}</span>
                  <span className="text-[10px] text-rose-300">Uncertain (&lt;70%)</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  External playlist name
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full rounded-lg border border-border bg-black/40 px-3 py-2 text-xs text-foreground focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground">
                  Review tracks ({matches.length})
                </h4>

                <div className="space-y-2">
                  {matches.map((match) => {
                    const currentSelected = selectedMatchMap[match.sourceMusicResourceId] || match;
                    const score = currentSelected.confidenceScore || 0;

                    return (
                      <div
                        key={match.id}
                        className="rounded-lg border border-border bg-card/60 p-3 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <img
                              src={
                                currentSelected.targetCoverUrl ||
                                match.sourceResource?.coverImageUrl ||
                                "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100"
                              }
                              alt=""
                              className="h-9 w-9 shrink-0 rounded object-cover"
                            />
                            <div className="overflow-hidden">
                              <p className="truncate text-xs font-bold text-foreground">
                                {currentSelected.targetTitle || match.sourceResource?.title}
                              </p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {currentSelected.targetArtist || match.sourceResource?.artistName} •{" "}
                                {formatTime(currentSelected.targetDurationSeconds)}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1">
                            {score >= 90 ? (
                              <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" />
                                {score}%
                              </span>
                            ) : score >= 70 ? (
                              <span className="flex items-center gap-1 rounded bg-yellow-500/20 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                                <AlertTriangle className="h-3 w-3" />
                                {score}%
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-400">
                                <XCircle className="h-3 w-3" />
                                {score}%
                              </span>
                            )}
                          </div>
                        </div>

                        {match.alternativeMatches && match.alternativeMatches.length > 0 && (
                          <div className="border-t border-border/40 pt-2 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-medium">
                              Available versions:
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  handleSelectAlternative(match.sourceMusicResourceId, {
                                    externalId: match.targetExternalId,
                                    title: match.targetTitle,
                                    artist: match.targetArtist,
                                    album: match.targetAlbum,
                                    durationSeconds: match.targetDurationSeconds,
                                    coverUrl: match.targetCoverUrl,
                                    versionLabel: match.targetVersionLabel,
                                    confidenceScore: match.confidenceScore,
                                  })
                                }
                                className={`flex items-center justify-between rounded px-2 py-1 text-[11px] text-left transition-colors ${
                                  currentSelected.targetExternalId === match.targetExternalId
                                    ? "bg-brand-500/20 border border-brand-500/40 text-foreground font-semibold"
                                    : "bg-white/5 hover:bg-white/10 text-muted-foreground"
                                }`}
                              >
                                <span className="truncate">
                                  {match.targetVersionLabel || "Main version"}
                                </span>
                                <span className="font-mono text-[9px]">
                                  {formatTime(match.targetDurationSeconds)}
                                </span>
                              </button>

                              {match.alternativeMatches.map((alt, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() =>
                                    handleSelectAlternative(match.sourceMusicResourceId, alt)
                                  }
                                  className={`flex items-center justify-between rounded px-2 py-1 text-[11px] text-left transition-colors ${
                                    currentSelected.targetExternalId === alt.externalId
                                      ? "bg-brand-500/20 border border-brand-500/40 text-foreground font-semibold"
                                      : "bg-white/5 hover:bg-white/10 text-muted-foreground"
                                  }`}
                                >
                                  <span className="truncate">{alt.versionLabel || alt.title}</span>
                                  <span className="font-mono text-[9px]">
                                    {formatTime(alt.durationSeconds)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === "exporting" && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Creating playlist on {provider === "spotify" ? "Spotify" : "Apple Music"}...
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Adding matched tracks
                </p>
              </div>
            </div>
          )}

          {step === "success" && exportJob && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 animate-in zoom-in-95">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-4 ring-emerald-500/10">
                <Check className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-foreground">Export completed</h4>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                  {exportJob.matchedItems} of {exportJob.totalItems} tracks were added to your {provider === "spotify" ? "Spotify" : "Apple Music"} playlist.
                </p>
              </div>

              {exportJob.targetPlaylistUrl && (
                <a
                  href={exportJob.targetPlaylistUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors"
                >
                  <span>Open in {provider === "spotify" ? "Spotify" : "Apple Music"}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border p-3.5 bg-card">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            Close
          </button>

          {step === "review" && (
            <button
              onClick={handleExecuteExport}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors"
            >
              <span>Confirm export ({matches.length} tracks)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
