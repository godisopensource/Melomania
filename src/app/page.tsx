"use client";
// src/app/page.tsx — Racine : page d'accueil (/)

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MusicShare } from "@/types";
import { ShareCard } from "@/components/music/ShareCard";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  Flame,
  PlusCircle,
  Compass,
  Headphones,
  Music,
  X,
} from "lucide-react";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="space-y-3">{[1, 2].map((i) => (<div key={i} className="h-48 w-full animate-pulse rounded-2xl border border-border bg-card/40" />))}</div>}>
      <HomeFeed />
    </Suspense>
  );
}

function HomeFeed() {
  const { user, openAuthModal } = useAuth();
  const searchParams = useSearchParams();
  const activeTag = searchParams.get("tag")?.trim().toLowerCase() || null;
  const [shares, setShares] = useState<MusicShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "tracks" | "playlists">("all");

  const fetchShares = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shares");
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
  }, []);

  const filteredShares = shares.filter((s) => {
    if (activeTab === "tracks" && s.resource?.type !== "track") return false;
    if (activeTab === "playlists" && s.resource?.type !== "playlist") return false;
    if (activeTag) {
      const tags = (s.tags || []).map((t) => t.toLowerCase().replace(/^#/, ""));
      if (!tags.includes(activeTag)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Editorial Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-card to-card p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 max-w-2xl space-y-3.5">
          {/*<div className="inline-flex items-center gap-2 rounded-md border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-320">
            <span>Social music sharing & annotations</span>
          </div>*/}

          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-foreground leading-tight">
            Share, annotate, and discuss music
          </h1>

          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Annotate precise musical moments at timecodes like{" "}
            <span className="font-mono text-brand-320 font-semibold">1:32</span>, exchange thoughts with friends, and export your selections to Spotify & Apple Music.
          </p>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <Link
              href="/share"
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>New share</span>
            </Link>

            <Link
              href="/playlists"
              className="flex items-center gap-2 rounded-lg border border-border bg-white/5 px-4 py-2 text-xs font-semibold text-foreground hover:bg-white/10 transition-colors"
            >
              <Compass className="h-3.5 w-3.5 text-brand-320" />
              <span>Explore playlists</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Feed Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-bold text-foreground">Recent music feed</h2>
          {activeTag && (
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2.5 py-1 text-[11px] font-semibold text-brand-320 hover:bg-brand-500/25"
            >
              #{activeTag}
              <X className="h-3 w-3" />
            </Link>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-black/40 p-1">
          <button
            onClick={() => setActiveTab("all")}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeTab === "all"
                ? "bg-brand-500 text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab("tracks")}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeTab === "tracks"
                ? "bg-brand-500 text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tracks
          </button>
          <button
            onClick={() => setActiveTab("playlists")}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeTab === "playlists"
                ? "bg-brand-500 text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Playlists
          </button>
        </div>
      </div>

      {/* Feed List */}
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-48 w-full animate-pulse rounded-2xl border border-border bg-card/40"
              />
            ))}
          </div>
        ) : filteredShares.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
            <Headphones className="h-8 w-8 text-muted-foreground/40 mb-2.5" />
            <h3 className="text-sm font-bold text-foreground">No shares yet</h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
              Paste a YouTube link for a track or playlist to start the first conversation.
            </p>
            <Link
              href="/share"
              className="mt-3.5 flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-brand-590"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Create first share</span>
            </Link>
          </div>
        ) : (
          filteredShares.map((share) => (
            <ShareCard
              key={share.id}
              share={share}
              onDeleted={(id) => setShares((prev) => prev.filter((s) => s.id !== id))}
            />
          ))
        )}
      </div>
    </div>
  );
}
