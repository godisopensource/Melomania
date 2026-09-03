"use client";
// src/app/share/[id]/page.tsx — /share/:id : visualisation d'un partage

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MusicShare, ConversationThread, Comment, ConversationParticipant } from "@/types";
import { YouTubePlayer } from "@/components/player/YouTubePlayer";
import { CommentSection } from "@/components/comments/CommentSection";
import { ExportModal } from "@/components/export/ExportModal";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { formatTime, formatRelativeDate } from "@/lib/utils";
import {
  ArrowLeft,
  Share2,
  Users,
  MessageSquare,
  ExternalLink,
  ListMusic,
  Disc,
  Check,
} from "lucide-react";

export default function ShareDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { playTrack, currentTrack } = usePlayer();

  const [share, setShare] = useState<MusicShare | null>(null);
  const [thread, setThread] = useState<ConversationThread | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [participants, setParticipants] = useState<ConversationParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchShareData = async () => {
    try {
      const res = await fetch(`/api/shares/${id}`);
      if (res.ok) {
        const data = await res.json();
        setShare(data.share);
        setThread(data.thread);
        setComments(data.comments || []);
        setParticipants(data.participants || []);

        if (data.share?.resource) {
          playTrack(data.share.resource, 0, data.share.id);
        }
      }
    } catch (err) {
      console.error("Fetch share error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShareData();
  }, [id]);

  const handleCopyShareLink = () => {
    if (typeof window === "undefined") return;
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-32 rounded bg-card/60" />
        <div className="aspect-video w-full rounded-2xl bg-card/60" />
        <div className="h-48 w-full rounded-2xl bg-card/60" />
      </div>
    );
  }

  if (!share || !share.resource) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
        <h2 className="text-base font-bold text-foreground">Share not found</h2>
        <Link
          href="/"
          className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white"
        >
          Back to feed
        </Link>
      </div>
    );
  }

  const resource = share.resource;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to feed</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyShareLink}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/10 transition-colors"
          >
            {copiedLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Link copied</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                <span>Share link</span>
              </>
            )}
          </button>

          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-590 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            <span>Export to Spotify / Apple</span>
          </button>
        </div>
      </div>

      {/* Header Resource Card */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <img
            src={resource.coverImageUrl}
            alt={resource.title}
            className="h-24 w-24 shrink-0 rounded-xl object-cover ring-1 ring-border shadow"
          />

          <div className="flex-1 overflow-hidden space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-320">
                {resource.type === "playlist" ? <ListMusic className="h-3 w-3" /> : <Disc className="h-3 w-3" />}
                {resource.type === "playlist" ? "Playlist" : "Track"}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {formatTime(resource.durationSeconds)}
              </span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {resource.title}
            </h1>

            <p className="text-xs font-semibold text-muted-foreground">
              {resource.artistName} {resource.albumName ? `• ${resource.albumName}` : ""}
            </p>

            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <span>Shared by <span className="font-semibold text-foreground">@{share.author?.username}</span></span>
              <span>•</span>
              <span>{formatRelativeDate(share.createdAt)}</span>
            </div>
          </div>
        </div>

        {share.introductoryComment && (
          <div className="rounded-xl border border-border bg-black/40 p-3.5 text-xs text-foreground/95 italic border-l-2 border-l-brand-500">
            « {share.introductoryComment} »
          </div>
        )}
      </div>

      {/* Embedded YouTube Player */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted-foreground">
            Player & timestamp timeline
          </h2>
          <span className="text-xs text-brand-320">
            Click any marker or note to jump to that moment
          </span>
        </div>

        <YouTubePlayer comments={comments} />
      </div>

      {/* Notes & Discussion */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-brand-410" />
            <h2 className="text-sm font-bold text-foreground">
              Notes & conversation ({comments.length})
            </h2>
          </div>

          {participants.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex -space-x-1.5 overflow-hidden">
                {participants.map((p) => (
                  <img
                    key={p.id}
                    src={p.user?.avatarUrl || "/icon.png"}
                    alt=""
                    title={p.user?.displayName}
                    className="inline-block h-5 w-5 rounded-full ring-2 ring-background object-cover"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <CommentSection
          conversationId={share.conversationId}
          comments={comments}
          onCommentAdded={fetchShareData}
        />
      </div>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        resource={resource}
      />
    </div>
  );
}
