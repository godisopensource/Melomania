"use client";

import React, { memo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MusicShare } from "@/types";
import { usePlayerState } from "../providers/PlayerProvider";
import { useAuth } from "../providers/AuthProvider";
import { formatTime, formatRelativeDate } from "@/lib/utils";
import { ExportModal } from "../export/ExportModal";
import {
  Play,
  Pause,
  MessageSquare,
  Share2,
  Heart,
  ListMusic,
  Disc,
  Check,
  ExternalLink,
  Trash2,
  Loader2,
} from "lucide-react";

interface ShareCardProps {
  share: MusicShare;
  onDeleted?: (id: string) => void;
}

export const ShareCard = memo(function ShareCard({ share, onDeleted }: ShareCardProps) {
  const router = useRouter();
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayerState();
  const { user } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const [likes, setLikes] = useState(share.likesCount || 0);
  const [hasLiked, setHasLiked] = useState(!!share.hasLiked);
  const [likeBusy, setLikeBusy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = !!user && (user.id === share.authorId || user.role === "admin");

  const resource = share.resource;
  if (!resource) return null;

  const isCurrentPlaying = currentTrack?.id === resource.id && isPlaying;
  const isPlaylist = resource.type === "playlist";

  const handlePlayClick = () => {
    if (currentTrack?.id === resource.id) {
      togglePlay();
    } else {
      if (isPlaylist && resource.tracks && resource.tracks.length > 0) {
        playTrack(resource.tracks[0], 0, share.id);
      } else {
        playTrack(resource, 0, share.id);
      }
    }
  };

  const handleLikeToggle = async () => {
    if (!user) return;
    if (likeBusy) return;
    // Optimistic update, reconciled with the server (persisted likes).
    const prevLiked = hasLiked;
    const prevCount = likes;
    setHasLiked(!prevLiked);
    setLikes((p) => p + (prevLiked ? -1 : 1));
    setLikeBusy(true);
    try {
      const res = await fetch(`/api/shares/${share.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error("like failed");
      const data = await res.json();
      setLikes(data.share?.likesCount ?? prevCount + (prevLiked ? -1 : 1));
      setHasLiked(!!data.liked);
    } catch {
      setHasLiked(prevLiked);
      setLikes(prevCount);
    } finally {
      setLikeBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!isOwner || deleting) return;
    if (!window.confirm("Delete this share? Its discussion will be removed too.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/shares/${share.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      if (onDeleted) onDeleted(share.id);
      else router.refresh();
    } catch {
      setDeleting(false);
    }
  };

  const handleCopyShareLink = () => {
    if (typeof window === "undefined") return;
    // Playlists are shared via their workspace URL — never /share.
    const url = isPlaylist
      ? `${window.location.origin}/playlists/${resource.id}`
      : `${window.location.origin}/share/${share.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <>
      <article className="melo-feed-card group relative overflow-hidden rounded-2xl border border-border bg-card/75 p-5 backdrop-blur-md transition-all hover:border-border/80 hover:shadow-lg">
        {/* Author Header */}
        <div className="flex items-center justify-between gap-3 mb-3.5">
          <Link
            href={`/profile/${share.author?.username || "user"}`}
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
          >
            <img
              src={share.author?.avatarUrl || "/icon.png"}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-8 w-8 rounded-md object-cover ring-1 ring-border"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">
                  {share.author?.displayName}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  @{share.author?.username}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {formatRelativeDate(share.createdAt)}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <span className="rounded border border-border bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {share.visibility === "public" ? "Public" : "Private"}
            </span>
            {isOwner && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                title="Delete this share"
                className="rounded border border-border bg-white/5 p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors disabled:opacity-50"
              >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Intro Comment */}
        {share.introductoryComment && (
          <p className="mb-3.5 text-xs text-foreground/95 leading-relaxed font-normal">
            {share.introductoryComment}
          </p>
        )}

        {/* Music Resource Card */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-black/40 p-3 transition-all group-hover:border-brand-500/30">
          <div className="flex items-center gap-3.5">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-black/80">
              <img
                src={resource.coverImageUrl}
                alt={resource.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <button
                onClick={handlePlayClick}
                className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px] hover:bg-black/10 transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white shadow transition-transform hover:scale-105">
                  {isCurrentPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4 ml-0.5" />
                  )}
                </div>
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="flex items-center gap-1 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-320">
                  {isPlaylist ? <ListMusic className="h-3 w-3" /> : <Disc className="h-3 w-3" />}
                  {isPlaylist ? "Playlist" : "Track"}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {formatTime(resource.durationSeconds)}
                </span>
              </div>

              <Link
                href={isPlaylist ? `/playlists/${resource.id}` : `/share/${share.id}`}
                className="block truncate text-sm font-bold text-foreground hover:text-brand-320 transition-colors"
              >
                {resource.title}
              </Link>
              <p className="truncate text-xs text-muted-foreground mt-0.5">
                {resource.artistName} {resource.albumName ? `• ${resource.albumName}` : ""}
              </p>
            </div>
          </div>

          {/* Playlist preview items if playlist */}
          {isPlaylist && resource.tracks && (
            <div className="mt-3 border-t border-border/50 pt-2 space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground">
                Included tracks ({resource.tracks.length}):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-0.5">
                {resource.tracks.slice(0, 4).map((t, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 rounded bg-white/5 p-1 text-[11px] text-muted-foreground"
                  >
                    <span className="font-mono text-[10px] text-brand-320">{idx + 1}.</span>
                    <span className="truncate font-medium text-foreground">{t.title}</span>
                    <span className="truncate text-[10px] text-muted-foreground">• {t.artistName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        {share.tags && share.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {share.tags.map((tag) => (
              <Link
                key={tag}
                href={`/tag/${encodeURIComponent(tag.toLowerCase().replace(/^#/, ""))}`}
                className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-brand-500/20 hover:text-brand-320 transition-colors"
              >
                #{tag.replace(/^#/, "")}
              </Link>
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={handleLikeToggle}
              disabled={likeBusy}
              title={user ? (hasLiked ? "Unlike" : "Like") : "Sign in to like"}
              className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                hasLiked
                  ? "bg-brand-500/20 text-brand-320"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${hasLiked ? "fill-brand-500 text-brand-500" : ""}`} />
              <span>{likes}</span>
            </button>

            <Link
              href={isPlaylist ? `/playlists/${resource.id}` : `/share/${share.id}`}
              className="flex items-center gap-1.5 rounded bg-white/5 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{isPlaylist ? "Open playlist" : "Discussion & notes"}</span>
            </Link>

            <button
              onClick={handleCopyShareLink}
              className="flex items-center gap-1.5 rounded bg-white/5 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
              title={isPlaylist ? "Copy playlist link" : "Copy share link"}
            >
              {copiedLink ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  <span>{isPlaylist ? "Playlist link" : "Share link"}</span>
                </>
              )}
            </button>
          </div>

          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="h-3 w-3 text-brand-410" />
            <span>Export</span>
          </button>
        </div>
      </article>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        resource={resource}
      />
    </>
  );
});
