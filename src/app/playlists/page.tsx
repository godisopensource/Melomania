"use client";
// src/app/playlists/page.tsx — /playlists: playlist index (one compact card each)

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { MusicResource, MusicShare } from "@/types";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { ExportModal } from "@/components/export/ExportModal";
import { formatTime, formatRelativeDate } from "@/lib/utils";
import {
  ListMusic,
  Play,
  Pause,
  Share2,
  ExternalLink,
  PlusCircle,
  Check,
  LayoutGrid,
  ArrowRight,
} from "lucide-react";

export default function PlaylistsPage() {
  const { playQueue, currentTrack, isPlaying } = usePlayer();
  const [playlists, setPlaylists] = useState<MusicResource[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [createdAt, setCreatedAt] = useState<Record<string, string>>({});
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
          const pls = shares
            .filter((s) => s.resource?.type === "playlist")
            .map((s) => s.resource!)
            .filter(Boolean);
          setPlaylists(pls);
          const byResource: Record<string, string> = {};
          const dates: Record<string, string> = {};
          for (const s of shares) {
            if (s.resource?.type === "playlist" && s.author) {
              byResource[s.resource.id] = s.author.displayName;
              dates[s.resource.id] = s.createdAt;
            }
          }
          setAuthors(byResource);
          setCreatedAt(dates);
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
    const shareUrl = `${window.location.origin}/playlists/${pl.id}`;
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
            Open a playlist space to browse the vinyl crate or the curator map.
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 w-full animate-pulse rounded-2xl bg-card/60" />
          ))
        ) : playlists.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
            <ListMusic className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <h3 className="text-sm font-bold text-foreground">No playlists yet</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste a YouTube playlist link to start listening and annotating with friends.
            </p>
          </div>
        ) : (
          playlists.map((pl) => {
            const count = pl.trackCount || pl.tracks?.length || 0;
            const playingThis =
              currentTrack && pl.tracks?.some((t) => t.id === currentTrack.id);
            return (
              <article
                key={pl.id}
                id={pl.id}
                className="group flex gap-4 rounded-2xl border border-border bg-card p-4 shadow transition-colors hover:border-white/20"
              >
                <Link
                  href={`/playlists/${pl.id}`}
                  className="melo-focus-ring shrink-0"
                  aria-label={`Open ${pl.title}`}
                  tabIndex={-1}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pl.coverImageUrl}
                    alt=""
                    className="h-24 w-24 rounded-xl object-cover ring-1 ring-border shadow transition-transform group-hover:scale-[1.03]"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/playlists/${pl.id}`} className="melo-focus-ring min-w-0">
                    <h2 className="truncate text-base font-bold text-foreground hover:text-brand-320">
                      {pl.title}
                    </h2>
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Curated Playlist • {count} track{count === 1 ? "" : "s"} •{" "}
                    {formatTime(pl.durationSeconds)}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                    {authors[pl.id] ? `by ${authors[pl.id]}` : pl.artistName}
                    {createdAt[pl.id] ? ` · ${formatRelativeDate(createdAt[pl.id])}` : ""}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                    <Link
                      href={`/playlists/${pl.id}`}
                      className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-590 transition-colors"
                    >
                      <LayoutGrid className="h-3 w-3" aria-hidden="true" />
                      <span>Open space</span>
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      disabled={!pl.tracks || pl.tracks.length === 0}
                      onClick={() => {
                        if (!pl.tracks || pl.tracks.length === 0) return;
                        if (playingThis && isPlaying) return;
                        playQueue(pl.tracks, 0, pl.id);
                      }}
                      className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/10 transition-colors disabled:opacity-40"
                    >
                      {playingThis && isPlaying ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3 ml-0.5" />
                      )}
                      <span>Play all</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyLink(pl)}
                      className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/10 transition-colors"
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
                      type="button"
                      onClick={() => setSelectedForExport(pl)}
                      className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/10 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3 text-brand-410" />
                      <span>Export</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })
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
