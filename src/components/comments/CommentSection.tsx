"use client";

import React, { useState } from "react";
import { Comment, User } from "@/types";
import { useAuth } from "../providers/AuthProvider";
import { usePlayer } from "../providers/PlayerProvider";
import { MentionInput } from "./MentionInput";
import { formatTime, formatRelativeDate } from "@/lib/utils";
import {
  Clock,
  MessageSquare,
  CornerDownRight,
  Trash2,
  Flag,
  Send,
  X,
  Heart,
  Bookmark,
  Share2,
  Check,
} from "lucide-react";

interface CommentSectionProps {
  conversationId: string;
  comments: Comment[];
  onCommentAdded?: () => void;
  highlightedTime?: number | null;
}

export function CommentSection({
  conversationId,
  comments,
  onCommentAdded,
  highlightedTime,
}: CommentSectionProps) {
  const { user, openAuthModal } = useAuth();
  const { currentTime, seekTo, activeCommentTime } = usePlayer();

  const [newCommentText, setNewCommentText] = useState("");
  const [includeTimecode, setIncludeTimecode] = useState(false);
  const [customTimecode, setCustomTimecode] = useState(Math.floor(currentTime));
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedCommentId, setCopiedCommentId] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent, parentId: string | null = null) => {
    if (e) e.preventDefault();
    if (!user) {
      openAuthModal("login");
      return;
    }

    const textToSubmit = parentId ? replyText : newCommentText;
    if (!textToSubmit.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: textToSubmit.trim(),
          parentCommentId: parentId,
          startTimeSeconds: !parentId && includeTimecode ? customTimecode : null,
        }),
      });

      if (res.ok) {
        if (parentId) {
          setReplyText("");
          setReplyToId(null);
        } else {
          setNewCommentText("");
          setIncludeTimecode(false);
        }
        if (onCommentAdded) onCommentAdded();
      }
    } catch (err) {
      console.error("Comment submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleLike = async (commentId: string) => {
    if (!user) {
      openAuthModal("login");
      return;
    }
    try {
      await fetch(`/api/comments/${commentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji: "like" }),
      });
      if (onCommentAdded) onCommentAdded();
    } catch (err) {
      console.error("Reaction toggle error:", err);
    }
  };

  const handleShareCommentLink = (comment: Comment) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (comment.startTimeSeconds !== null && comment.startTimeSeconds !== undefined) {
      url.searchParams.set("t", String(comment.startTimeSeconds));
    }
    url.hash = `comment-${comment.id}`;
    navigator.clipboard.writeText(url.toString());
    setCopiedCommentId(comment.id);
    setTimeout(() => setCopiedCommentId(null), 2000);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    try {
      await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
      if (onCommentAdded) onCommentAdded();
    } catch (err) {
      console.error("Delete comment error:", err);
    }
  };

  const handleReportComment = async (commentId: string) => {
    const reason = prompt("Why do you want to report this comment?");
    if (!reason) return;
    try {
      await fetch("/api/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "comment",
          targetId: commentId,
          reason,
        }),
      });
      alert("Report submitted to moderation.");
    } catch (err) {
      console.error("Report error:", err);
    }
  };

  const renderCommentBody = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_-]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span
            key={i}
            className="inline-flex items-center rounded bg-brand-500/20 px-1.5 py-0.5 text-xs font-semibold text-brand-320"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const renderCommentItem = (item: Comment, isReply = false) => {
    const isTimestamped = item.startTimeSeconds !== null && item.startTimeSeconds !== undefined;
    const isTimeActive =
      isTimestamped &&
      activeCommentTime !== null &&
      Math.abs((item.startTimeSeconds || 0) - activeCommentTime) < 5;

    const likesList = item.reactions?.["like"] || [];
    const hasLiked = user ? likesList.includes(user.id) : false;

    return (
      <div
        id={`comment-${item.id}`}
        key={item.id}
        className={`group relative rounded-xl p-4 transition-all ${
          isReply ? "ml-6 mt-3 border-l-2 border-brand-500/30 bg-card/40" : "bg-card/75 border border-border"
        } ${isTimeActive ? "ring-2 ring-brand-500 bg-brand-500/5" : "hover:border-border/80"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={item.author?.avatarUrl || "/icon.png"}
              alt=""
              className="h-8 w-8 rounded-md object-cover ring-1 ring-border"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {item.author?.displayName || "User"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  @{item.author?.username || "user"}
                </span>
                <span className="text-[11px] text-muted-foreground/60">•</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatRelativeDate(item.createdAt)}
                </span>
              </div>

              {isTimestamped && (
                <button
                  onClick={() => seekTo(item.startTimeSeconds || 0)}
                  className="mt-1 flex items-center gap-1 rounded bg-brand-500/15 px-2 py-0.5 text-xs font-mono text-brand-320 hover:bg-brand-500/25 transition-colors"
                >
                  <Clock className="h-3 w-3" />
                  <span>{formatTime(item.startTimeSeconds)}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {user && (user.id === item.authorId || user.role === "admin") && (
              <button
                onClick={() => handleDeleteComment(item.id)}
                className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => handleReportComment(item.id)}
              className="rounded p-1 text-muted-foreground hover:text-brand-320 hover:bg-white/5 transition-colors"
              title="Report"
            >
              <Flag className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <p className="mt-2.5 text-xs text-foreground/90 leading-relaxed font-normal">
          {renderCommentBody(item.body)}
        </p>

        {/* Action buttons (Like, Share Link, Reply) */}
        <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleToggleLike(item.id)}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                hasLiked
                  ? "bg-brand-500/20 text-brand-320"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${hasLiked ? "fill-brand-500 text-brand-500" : ""}`} />
              <span>{likesList.length > 0 ? likesList.length : "Like"}</span>
            </button>

            <button
              onClick={() => handleShareCommentLink(item)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Copy note link"
            >
              {copiedCommentId === item.id ? (
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
          </div>

          {!isReply && (
            <button
              onClick={() => setReplyToId(replyToId === item.id ? null : item.id)}
              className="flex items-center gap-1 font-medium text-muted-foreground hover:text-brand-320 transition-colors"
            >
              <CornerDownRight className="h-3.5 w-3.5" />
              <span>Reply</span>
            </button>
          )}
        </div>

        {replyToId === item.id && (
          <div className="mt-3 rounded-xl border border-brand-500/30 bg-black/40 p-3 animate-in fade-in">
            <div className="flex items-center justify-between pb-2 text-xs text-muted-foreground">
              <span>Reply to @{item.author?.username}</span>
              <button onClick={() => setReplyToId(null)}>
                <X className="h-3.5 w-3.5 hover:text-foreground" />
              </button>
            </div>
            <MentionInput
              value={replyText}
              onChange={setReplyText}
              placeholder="Your reply..."
              autoFocus
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => handleSubmit(undefined, item.id)}
                disabled={submitting || !replyText.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-590 disabled:opacity-50"
              >
                <Send className="h-3 w-3" />
                <span>Send reply</span>
              </button>
            </div>
          </div>
        )}

        {item.replies && item.replies.length > 0 && (
          <div className="space-y-2 mt-2">
            {item.replies.map((reply) => renderCommentItem(reply, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-brand-410" />
            <span className="text-xs font-bold text-foreground">Add a note</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setIncludeTimecode(!includeTimecode);
              setCustomTimecode(Math.floor(currentTime));
            }}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              includeTimecode
                ? "bg-brand-500 text-white font-semibold shadow"
                : "border border-border bg-white/5 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>
              {includeTimecode ? `Pinned at ${formatTime(customTimecode)}` : "Anchor to current time"}
            </span>
          </button>
        </div>

        <form onSubmit={(e) => handleSubmit(e, null)} className="space-y-3">
          <MentionInput
            value={newCommentText}
            onChange={setNewCommentText}
            placeholder="Share your thoughts, use @ to mention someone or a track..."
          />

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground">
              Type <span className="font-mono text-brand-320">@</span> to autocomplete users or tracks
            </span>

            <button
              type="submit"
              disabled={submitting || !newCommentText.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Publish</span>
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
            <MessageSquare className="h-6 w-6 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-medium text-muted-foreground">
              No notes for this track yet
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Be the first to annotate this moment or share your impression.
            </p>
          </div>
        ) : (
          comments.map((c) => renderCommentItem(c))
        )}
      </div>
    </div>
  );
}
