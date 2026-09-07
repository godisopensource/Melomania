"use client";

// src/components/player/AddToSpotifyButton.tsx
//
// Bouton du lecteur : "Add to Spotify playlist".
// - INVISIBLE si aucun compte Spotify réellement connecté (OAuth via
//   GET /api/connections -> provider spotify + isReal !== false).
// - Sinon : recherche le morceau en cours, propose les playlists existantes
//   ou la création d'une nouvelle, puis ajoute via POST /api/spotify/library.

import React, { useEffect, useState } from "react";
import { ListMusic, Loader2, CheckCircle2, AlertTriangle, Plus, X, ExternalLink } from "lucide-react";
import { usePlayerState } from "../providers/PlayerProvider";

interface SpotifyHit {
  uri: string;
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverImageUrl?: string;
  externalUrl: string;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  trackCount: number;
  externalUrl: string;
}

export function AddToSpotifyButton({ className = "" }: { className?: string }) {
  const { currentTrack } = usePlayerState();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<SpotifyHit | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string; url?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/connections");
        if (!res.ok) {
          if (!cancelled) setIsConnected(false);
          return;
        }
        const data = await res.json();
        const list: any[] = data.connections || [];
        const sp = list.find((c) => c.provider === "spotify");
        if (!cancelled) setIsConnected(!!sp && sp.isReal !== false);
      } catch {
        if (!cancelled) setIsConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isConnected) return null;
  if (!currentTrack) return null;

  const trackLabel = `${currentTrack.title} ${currentTrack.artistName || ""}`.trim();

  const openPanel = async () => {
    setOpen(true);
    setBusy(true);
    setStatus(null);
    setMatch(null);
    setPlaylists([]);
    try {
      const [searchRes, listRes] = await Promise.all([
        fetch("/api/spotify/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "search", term: trackLabel, limit: 5 }),
        }),
        fetch("/api/spotify/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "playlists" }),
        }),
      ]);
      const searchData = await searchRes.json().catch(() => ({}));
      if (!searchRes.ok) throw new Error(searchData?.error || "Spotify search failed.");
      const hits: SpotifyHit[] = searchData.results || [];
      setMatch(hits[0] || null);
      if (hits.length === 0) {
        setStatus({ kind: "err", text: "No match found on Spotify for this track." });
      }
      const listData = await listRes.json().catch(() => ({}));
      if (listRes.ok) setPlaylists(listData.playlists || []);
    } catch (e: any) {
      setStatus({ kind: "err", text: e?.message || "Spotify request failed." });
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!match) return;
    if (!selectedId && !newName.trim()) {
      setStatus({ kind: "err", text: "Choose a playlist or type a new playlist name." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/spotify/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          playlistId: selectedId || undefined,
          playlistName: selectedId ? undefined : newName.trim(),
          uris: [match.uri],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not add to playlist.");
      setStatus({
        kind: "ok",
        text: selectedId
          ? "Added to your Spotify playlist."
          : `Created “${data.playlistName || newName.trim()}” and added the track.`,
        url: data.playlistUrl,
      });
      setNewName("");
      try {
        const listRes = await fetch("/api/spotify/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "playlists" }),
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          setPlaylists(listData.playlists || []);
          if (data.playlistId) setSelectedId(data.playlistId);
        }
      } catch {}
    } catch (e: any) {
      setStatus({ kind: "err", text: e?.message || "Could not add to playlist." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={openPanel}
        className="melo-focus-ring flex items-center gap-1.5 rounded-lg border border-[#1DB954]/40 bg-[#1DB954]/15 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-[#1DB954]/25 transition-colors"
      >
        <ListMusic className="h-3.5 w-3.5 text-[#1DB954]" />
        <span>Add to Spotify playlist</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-label="Add to Spotify playlist"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border bg-black/20 p-3.5">
              <div className="flex items-center gap-2">
                <ListMusic className="h-4 w-4 text-[#1DB954]" />
                <h3 className="text-sm font-bold text-foreground">Add to Spotify playlist</h3>
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
              {busy && !match && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-[#1DB954]" />
                  <span>Searching Spotify for “{trackLabel}”…</span>
                </div>
              )}

              {match && (
                <div className="flex items-center gap-2.5 rounded-lg border border-border bg-white/5 p-2.5">
                  {match.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={match.coverImageUrl} alt="" className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-[#1DB954]/20 text-[#1DB954]">
                      <ListMusic className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">{match.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {match.artist}
                      {match.album ? ` · ${match.album}` : ""}
                    </p>
                  </div>
                </div>
              )}

              {playlists.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Your Spotify playlists
                  </label>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {playlists.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(p.id);
                          setNewName("");
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                          selectedId === p.id
                            ? "border border-[#1DB954]/50 bg-[#1DB954]/15 font-semibold text-foreground"
                            : "border border-transparent bg-white/5 text-muted-foreground hover:bg-white/10"
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="font-mono text-[10px]">{p.trackCount}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Or create a new playlist
                </label>
                <div className="flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (e.target.value.trim()) setSelectedId("");
                    }}
                    placeholder="My Melomania selection"
                    className="w-full rounded-lg border border-border bg-black/40 px-3 py-2 text-xs text-foreground focus:border-[#1DB954] focus:outline-none"
                  />
                </div>
              </div>

              {status && (
                <div
                  className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                    status.kind === "ok"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {status.kind === "ok" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  )}
                  <div className="space-y-1">
                    <span>{status.text}</span>
                    {status.url && (
                      <a
                        href={status.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-semibold underline"
                      >
                        <span>Open in Spotify</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-white/5 hover:text-foreground"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={busy || !match}
                  className="flex items-center gap-1.5 rounded-lg bg-[#1DB954] px-4 py-1.5 text-xs font-semibold text-black shadow hover:opacity-90 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Add track</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
