"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { MusicResource, MusicShare } from "@/types";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { ExportModal } from "@/components/export/ExportModal";
import { formatTime } from "@/lib/utils";
import {
  ListMusic,
  Play,
  Share2,
  ExternalLink,
  PlusCircle,
  Check,
} from "lucide-react";

export default function PlaylistsPage() {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const [playlists, setPlaylists] = useState<MusicResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedForExport, setSelectedForExport] = useState<MusicResource | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlaylists = async () => {
      try {
        const res = await fetch("/api/shares");
        if (res.ok) {
          const data = await res.json();
          const shares: MusicShare[] = data.shares || [];
          const pls: MusicResource[] = shares
            .filter((s) => s.resource?.type === "playlist")
            .map((s) => s.resource!)
            .filter(Boolean);
          setPlaylists(pls);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchPlaylists();
  }, []);

  const handleCopyLink = (pl: MusicResource) => {
    if (typeof window === "undefined") return;
    const shareUrl = `${window.location.origin}/playlists#${pl.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedId(pl.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ListMusic className="h-6 w-6 text-brand-500" />
            Playlists & selections
          </h1>
          <p className="text-xs text-muted-foreground">
            Explore community playlists and export them to Spotify and Apple Music.
          </p>
        </div>

        <Link
          href="/share"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          <span>Share a playlist</span>
        </Link>
      </div>

      <div className="space-y-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-40 w-full animate-pulse rounded-2xl bg-card/60" />
            ))}
          </div>
        ) : playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
            <ListMusic className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <h3 className="text-sm font-bold text-foreground">No playlists yet</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste a YouTube playlist link to start listening and annotating with friends.
            </p>
          </div>
        ) : (
          playlists.map((pl) => (
            <div
              key={pl.id}
              id={pl.id}
              className="rounded-2xl border border-border bg-card p-5 shadow space-y-4"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src={pl.coverImageUrl}
                    alt=""
                    className="h-16 w-16 rounded-xl object-cover ring-1 ring-border shadow"
                  />
                  <div>
                    <h2 className="text-base font-bold text-foreground">{pl.title}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pl.artistName} • {pl.trackCount || pl.tracks?.length || 0} tracks •{" "}
                      {formatTime(pl.durationSeconds)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (pl.tracks && pl.tracks[0]) playTrack(pl.tracks[0]);
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-590 transition-colors"
                  >
                    <Play className="h-3 w-3 ml-0.5" />
                    <span>Play all</span>
                  </button>

                  <button
                    onClick={() => handleCopyLink(pl)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/10 transition-colors"
                    title="Copy playlist link"
                  >
                    {copiedId === pl.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="h-3.5 w-3.5" />
                        <span>Share link</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setSelectedForExport(pl)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/10 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3 text-brand-410" />
                    <span>Export</span>
                  </button>
                </div>
              </div>

              {pl.tracks && pl.tracks.length > 0 && (
                <div className="rounded-xl border border-border/50 bg-black/40 p-2.5 space-y-1">
                  {pl.tracks.map((track, idx) => (
                    <div
                      key={track.id}
                      className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-white/5 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <span className="font-mono text-xs text-muted-foreground w-4">
                          {idx + 1}
                        </span>
                        <button
                          onClick={() => playTrack(track)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand-500/20 text-brand-320 group-hover:bg-brand-500 group-hover:text-white transition-colors"
                        >
                          <Play className="h-3 w-3 ml-0.5" />
                        </button>
                        <div className="overflow-hidden">
                          <p className="truncate text-xs font-bold text-foreground">
                            {track.title}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {track.artistName}
                          </p>
                        </div>
                      </div>

                      <span className="font-mono text-xs text-muted-foreground shrink-0">
                        {formatTime(track.durationSeconds)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {selectedForExport && (
        <ExportModal
          isOpen={true}
          onClose={() => setSelectedForExport(null)}
          resource={selectedForExport}
        />
      )}
    </div>
  );
}
