"use client";
// src/app/share/[id]/page.tsx — /share/:id : visualisation d'un partage

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MusicShare, ConversationThread, Comment, ConversationParticipant, User } from "@/types";
import { YouTubePlayer } from "@/components/player/YouTubePlayer";
import { CommentSection } from "@/components/comments/CommentSection";
import { ExportModal } from "@/components/export/ExportModal";
import { SyncedLyrics } from "@/components/playlist/SyncedLyrics";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useAuth } from "@/components/providers/AuthProvider";
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
  Trash2,
  UserPlus,
  UserMinus,
  Eye,
  Lock,
  Loader2,
} from "lucide-react";

export default function ShareDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { playTrack, currentTrack } = usePlayer();
  const { user } = useAuth();

  const [share, setShare] = useState<MusicShare | null>(null);
  const [thread, setThread] = useState<ConversationThread | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [participants, setParticipants] = useState<ConversationParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [uninviteBusy, setUninviteBusy] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [allowedUsers, setAllowedUsers] = useState<User[]>([]);
  const [deleting, setDeleting] = useState(false);

  const isOwner = !!user && !!share && (user.id === share.authorId || user.role === "admin");

  const fetchShareData = async () => {
    try {
      const res = await fetch(`/api/shares/${id}`);
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        // Playlists live in their dedicated workspace: redirect legacy
        // /share/:id links (old notifications, bookmarks, copied links).
        if (data.share?.resource?.type === "playlist" && data.share.resource?.id) {
          router.replace(`/playlists/${data.share.resource.id}`);
          return;
        }
        setShare(data.share);
        setThread(data.thread);
        setComments(data.comments || []);
        setParticipants(data.participants || []);
        setAllowedUsers(data.allowedUsers || []);

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

  const handleDelete = async () => {
    if (!isOwner || deleting) return;
    if (!window.confirm("Delete this share? Its discussion will be removed too.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/shares/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      router.push("/");
    } catch {
      setDeleting(false);
    }
  };

  const patchSharing = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/shares/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Unable to update sharing.");
    setShare(data.share);
    await fetchShareData();
    return data;
  };

  const handleVisibility = async (visibility: "public" | "private") => {
    if (!share || shareBusy || share.visibility === visibility) return;
    setShareBusy(true);
    setShareFeedback(null);
    try {
      await patchSharing({ action: "set_visibility", visibility });
      setShareFeedback({
        kind: "info",
        text: visibility === "public" ? "This share is now public." : "This share is now private.",
      });
    } catch (err: any) {
      setShareFeedback({ kind: "error", text: err.message });
    } finally {
      setShareBusy(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim() || inviteBusy) return;
    setInviteBusy(true);
    setShareFeedback(null);
    try {
      const data = await patchSharing({ action: "invite", username: inviteUsername.trim() });
      setInviteUsername("");
      setShareFeedback({
        kind: "info",
        text: data.alreadyInvited ? "This user was already invited." : "Invitation sent.",
      });
    } catch (err: any) {
      setShareFeedback({ kind: "error", text: err.message });
    } finally {
      setInviteBusy(false);
    }
  };

  const handleUninvite = async (userId: string) => {
    if (uninviteBusy) return;
    setUninviteBusy(userId);
    setShareFeedback(null);
    try {
      await patchSharing({ action: "uninvite", userId });
      setShareFeedback({ kind: "info", text: "User removed from this share." });
    } catch (err: any) {
      setShareFeedback({ kind: "error", text: err.message });
    } finally {
      setUninviteBusy(null);
    }
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
        <h2 className="text-base font-bold text-foreground">
          {forbidden ? "This share is private" : "Share not found"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {forbidden
            ? "Only its author and invited users can see it."
            : "It may have been deleted."}
        </p>
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

          {isOwner && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {isOwner && share && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-brand-410" />
              <h2 className="text-xs font-bold text-foreground">Visibility & sharing</h2>
            </div>
            <span className="rounded border border-border bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {share.visibility === "public" ? "Public" : "Private"}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleVisibility("public")}
              disabled={shareBusy || share.visibility === "public"}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                share.visibility === "public"
                  ? "bg-brand-500 text-white shadow"
                  : "bg-white/5 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Public</span>
            </button>
            <button
              type="button"
              onClick={() => handleVisibility("private")}
              disabled={shareBusy || share.visibility === "private"}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                share.visibility === "private"
                  ? "bg-brand-500 text-white shadow"
                  : "bg-white/5 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Private</span>
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {share.visibility === "public"
              ? "Everyone can see this share. The invited list below is kept for later."
              : allowedUsers.length === 0
                ? "Only you can see this share — invite someone below."
                : "Only you and the invited users can see this share."}
          </p>

          {allowedUsers.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Shared with ({allowedUsers.length})
              </span>
              <div className="space-y-1">
                {allowedUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-black/40 px-2.5 py-1.5"
                  >
                    <img
                      src={u.avatarUrl || "/icon.png"}
                      alt=""
                      className="h-6 w-6 rounded-md object-cover ring-1 ring-border"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">{u.displayName}</p>
                      <p className="truncate text-[10px] text-muted-foreground">@{u.username}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUninvite(u.id)}
                      disabled={uninviteBusy === u.id}
                      title={`Remove @${u.username}`}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors disabled:opacity-50"
                    >
                      {uninviteBusy === u.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserMinus className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="text"
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              placeholder="@username"
              className="flex-1 rounded-lg border border-border bg-black/40 py-2 px-3 text-xs text-foreground focus:border-brand-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={inviteBusy || !inviteUsername.trim()}
              className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-590 disabled:opacity-50"
            >
              {inviteBusy ? "Inviting…" : "Invite"}
            </button>
          </form>
          {shareFeedback && (
            <p className={`text-[11px] ${shareFeedback.kind === "error" ? "text-destructive" : "text-emerald-400"}`}>
              {shareFeedback.text}
            </p>
          )}
        </div>
      )}

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

      {/* Lyrics — always mounted so loading progress is visible */}
      {resource.type === "track" && (
        <SyncedLyrics
          artist={resource.artistName}
          title={resource.title}
          album={resource.albumName}
          durationSeconds={resource.durationSeconds}
        />
      )}

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
