"use client";
// src/app/share/page.tsx — /share : formulaire de création de partage

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { MentionInput } from "@/components/comments/MentionInput";
import { formatTime, extractYouTubeTags } from "@/lib/utils";
import {
  Link2,
  Music,
  ListMusic,
  Eye,
  Lock,
  Send,
  Loader2,
  AlertCircle,
  Tag,
  CheckCircle2,
} from "lucide-react";

export default function NewSharePage() {
  const router = useRouter();
  const { user, openAuthModal } = useAuth();

  const [url, setUrl] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [introComment, setIntroComment] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [tagsInput, setTagsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presets = [
    {
      label: "Charlie (YouTube Music Playlist)",
      url: "https://music.youtube.com/playlist?list=PLcYJaHm-lMGA",
    },
    {
      label: "M83 — Midnight City",
      url: "https://www.youtube.com/watch?v=dX3k_QDnzHE",
    },
    {
      label: "Daft Punk — Get Lucky",
      url: "https://www.youtube.com/watch?v=5qap5aO4i9A",
    },
    {
      label: "Queen — Bohemian Rhapsody",
      url: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
    },
  ];

  useEffect(() => {
    if (!url.trim() || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
      setPreviewData(null);
      setTagsInput("");
      return;
    }

    const fetchPreview = async () => {
      setLoadingPreview(true);
      setError(null);
      try {
        const res = await fetch("/api/music/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Unable to load preview for this link.");
        }

        setPreviewData(data);
        // Auto-generate tags from YouTube metadata
        if (data.type === "track" && data.track) {
          const tags = extractYouTubeTags(data.track);
          setTagsInput(tags.join(", "));
        } else if (data.type === "playlist" && data.playlist) {
          const tags = extractYouTubeTags(undefined, data.playlist.title);
          setTagsInput(tags.join(", "));
        }
      } catch (err: any) {
        setError(err.message);
        setPreviewData(null);
        setTagsInput("");
      } finally {
        setLoadingPreview(false);
      }
    };

    const debounce = setTimeout(fetchPreview, 400);
    return () => clearTimeout(debounce);
  }, [url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal("login");
      return;
    }

    if (!url.trim()) {
      setError("Please paste a valid YouTube or YouTube Music link.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);

      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          introductoryComment: introComment.trim(),
          visibility,
          tags,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error while creating share.");
      }

      // Playlists open in their dedicated workspace (Curator / Vinyl views);
      // single tracks keep the legacy share page.
      if (data.playlistId) {
        router.push(`/playlists/${data.playlistId}`);
      } else if (data.share?.id) {
        router.push(`/share/${data.share.id}`);
      } else {
        throw new Error("Error while creating share: unexpected response.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          New music share
        </h1>
        <p className="text-xs text-muted-foreground">
          Import a track or playlist from YouTube to open an annotation conversation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              YouTube or YouTube Music URL
            </label>
            <div className="relative">
              <Link2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://music.youtube.com/playlist?list=... or https://www.youtube.com/watch?v=..."
                className="w-full rounded-lg border border-border bg-black/40 py-2.5 pl-10 pr-10 text-xs text-foreground focus:border-brand-500 focus:outline-none"
              />
              {loadingPreview && (
                <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-500" />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">
              Quick presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setUrl(p.url)}
                  className="rounded-md border border-border bg-white/5 px-2.5 py-1 text-xs text-muted-foreground hover:border-brand-500/40 hover:text-brand-320 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Live Preview Card */}
        {previewData && (
          <div className="rounded-2xl border border-brand-500/30 bg-card p-5 shadow space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-320">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Preview detected
              </span>
              <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                Source: YouTube
              </span>
            </div>

            {previewData.type === "track" && previewData.track && (
              <div className="flex items-center gap-4">
                <img
                  src={previewData.track.coverImageUrl}
                  alt=""
                  className="h-16 w-16 rounded-lg object-cover ring-1 ring-border shadow"
                />
                <div className="overflow-hidden space-y-0.5">
                  <span className="inline-flex items-center gap-1 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-320">
                    <Music className="h-3 w-3" />
                    Track
                  </span>
                  <h3 className="truncate text-sm font-bold text-foreground">
                    {previewData.track.title}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {previewData.track.artist}
                  </p>
                </div>
              </div>
            )}

            {previewData.type === "playlist" && previewData.playlist && (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <img
                    src={previewData.playlist.coverImageUrl}
                    alt=""
                    className="h-16 w-16 rounded-lg object-cover ring-1 ring-border shadow"
                  />
                  <div className="overflow-hidden space-y-0.5">
                    <span className="inline-flex items-center gap-1 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-320">
                      <ListMusic className="h-3 w-3" />
                      Playlist ({previewData.playlist.trackCount || previewData.playlist.tracks?.length || 0} tracks)
                    </span>
                    <h3 className="truncate text-sm font-bold text-foreground">
                      {previewData.playlist.title}
                    </h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {previewData.playlist.author}
                    </p>
                  </div>
                </div>

                <p className="pt-2 border-t border-border text-[11px] text-muted-foreground">
                  Playlists open as a single block in the playlist workspace (Curator / Vinyl views),
                  keeping the original YouTube Music order.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Intro Comment */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">
            Introductory note
          </label>
          <MentionInput
            value={introComment}
            onChange={setIntroComment}
            placeholder="Why are you sharing this track? Mention someone or a related track with @..."
          />
        </div>

        {/* Visibility & Tags */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Visibility
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  visibility === "public"
                    ? "bg-brand-500 text-white shadow"
                    : "bg-white/5 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Public</span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  visibility === "private"
                    ? "bg-brand-500 text-white shadow"
                    : "bg-white/5 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Private</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Tags (comma separated)
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="synthpop, groove, acoustic..."
                className="w-full rounded-lg border border-border bg-black/40 py-2 pl-9 pr-3 text-xs text-foreground focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !url.trim()}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Publishing share...</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              <span>Publish share</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
