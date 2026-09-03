"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareText, Clock, CornerDownRight, Trash2, Send } from "lucide-react";
import { TrackNote, MusicResource } from "@/types";
import { useAuth } from "../providers/AuthProvider";
import { usePlayer } from "../providers/PlayerProvider";
import { MentionInput } from "../comments/MentionInput";
import { formatTime, formatRelativeDate } from "@/lib/utils";
import { renderRichBody } from "../comments/rich-text";
import { ImmutableTrackNote } from "./ImmutableTrackNote";
import { TrackReplyComposer } from "./TrackReplyComposer";

interface TrackNoteThreadProps {
  track: MusicResource;
}

/**
 * Track discussion thread: one opening note + replies
 * (user/track mentions, timecodes). Adapts CommentSection/MentionInput.
 */
export function TrackNoteThread({ track }: TrackNoteThreadProps) {
  const { user, openAuthModal } = useAuth();
  const { seekTo, activeCommentTime, currentTime } = usePlayer();
  const [notes, setNotes] = useState<TrackNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  // Spotlight: a timecoded reply surfaces with an animation while its moment plays.
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const prevSpotRef = useRef<string | null>(null);
  const spotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${track.id}/notes`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load.");
      setNotes(data.notes || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [track.id]);

  useEffect(() => {
    setDraft("");
    setReplyOpenFor(null);
    fetchNotes();
  }, [fetchNotes]);

  const initial = notes.find((n) => n.isInitial) ?? null;
  const replies = notes.flatMap((n) => (n.isInitial ? n.replies ?? [] : [n]));

  useEffect(() => {
    const timed = replies.filter(
      (r) =>
        r.startTimeSeconds !== null &&
        r.startTimeSeconds !== undefined &&
        Math.abs((r.startTimeSeconds || 0) - currentTime) < 6
    );
    timed.sort(
      (a, b) =>
        Math.abs((a.startTimeSeconds || 0) - currentTime) -
        Math.abs((b.startTimeSeconds || 0) - currentTime)
    );
    const nearest = timed[0]?.id ?? null;
    if (nearest && nearest !== prevSpotRef.current) {
      prevSpotRef.current = nearest;
      setSpotlightId(nearest);
      document
        .getElementById(`trackreply-${nearest}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (spotTimerRef.current) clearTimeout(spotTimerRef.current);
      spotTimerRef.current = setTimeout(() => {
        setSpotlightId((cur) => (cur === nearest ? null : cur));
      }, 6500);
    } else if (!nearest && prevSpotRef.current) {
      const prev = prevSpotRef.current;
      const stillThere = notes
        .flatMap((n) => (n.isInitial ? n.replies ?? [] : [n]))
        .some(
          (r) =>
            r.id === prev &&
            r.startTimeSeconds !== null &&
            r.startTimeSeconds !== undefined &&
            Math.abs((r.startTimeSeconds || 0) - currentTime) < 6
        );
      if (!stillThere) {
        prevSpotRef.current = null;
        setSpotlightId(null);
      }
    }
    // NOTE: no cleanup clearing the timer here — the effect re-runs every
    // second and must not cancel the 6.5s spotlight window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime]);

  // Clear any pending spotlight timer on unmount / track change.
  useEffect(() => {
    return () => {
      if (spotTimerRef.current) clearTimeout(spotTimerRef.current);
    };
  }, [track.id]);

  const publishInitial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal("login");
      return;
    }
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/tracks/${track.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not publish.");
      setDraft("");
      await fetchNotes();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const deleteReply = async (id: string) => {
    if (!confirm("Delete this reply?")) return;
    try {
      const res = await fetch(`/api/tracks/notes/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete.");
      await fetchNotes();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const renderBody = (text: string) => renderRichBody(text, seekTo);

  return (
    <section aria-label={`Discussion thread for ${track.title}`} className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-brand-410" aria-hidden="true" />
        <h4 className="text-xs font-bold text-foreground">Editorial thread</h4>
        <span className="font-mono text-[10px] text-muted-foreground">#{ (track.sourcePosition ?? 0) + 1}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border p-6" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
          <span className="text-xs text-muted-foreground">Loading thread…</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground" role="alert">
          {error}
          <button type="button" onClick={fetchNotes} className="ml-2 font-bold underline">
            Retry
          </button>
        </div>
      ) : (
        <>
          {initial ? (
            <ImmutableTrackNote note={initial} />
          ) : (
            <form onSubmit={publishInitial} className="space-y-2 rounded-2xl border border-dashed border-border p-4">
              <p className="text-xs font-bold text-foreground">Add the opening editorial note</p>
              <p className="text-[11px] text-muted-foreground">
                One opening note per track. Once published it stays as is — no edits, no deletion.
              </p>
              <MentionInput value={draft} onChange={setDraft} placeholder="Your take on this track… @ to mention someone" />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-590 disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Publish the note
                </button>
              </div>
            </form>
          )}

          {/* Replies */}
          <div className="space-y-2">
            {replies.map((r) => {
                const isActive =
                  r.startTimeSeconds !== null &&
                  r.startTimeSeconds !== undefined &&
                  activeCommentTime !== null &&
                  Math.abs((r.startTimeSeconds || 0) - activeCommentTime) < 5;
                return (
                  <article
                    key={r.id}
                    id={`trackreply-${r.id}`}
                    className={`rounded-xl border p-3 transition-colors ${spotlightId === r.id ? "melo-spotlight border-brand-500 bg-brand-500/5" : isActive ? "border-brand-500 bg-brand-500/5 ring-1 ring-brand-500" : "border-border bg-card/60"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.author?.avatarUrl || "/icon.png"} alt="" className="h-7 w-7 rounded-md object-cover ring-1 ring-border" />
                        <div>
                          <p className="text-[11px] font-bold text-foreground">
                            {r.author?.displayName || "Member"} <span className="font-normal text-muted-foreground">· {formatRelativeDate(r.createdAt)}</span>
                          </p>
                          {r.startTimeSeconds !== null && r.startTimeSeconds !== undefined && (
                            <button
                              type="button"
                              onClick={() => seekTo(r.startTimeSeconds || 0)}
                              className="melo-focus-ring mt-0.5 inline-flex items-center gap-1 rounded bg-brand-500/15 px-1.5 py-px font-mono text-[11px] text-brand-320 hover:bg-brand-500/25"
                            >
                              <Clock className="h-3 w-3" />
                              {formatTime(r.startTimeSeconds)}
                            </button>
                          )}
                        </div>
                      </div>
                      {user && (user.id === r.authorId || user.role === "admin") && (
                        <button
                          type="button"
                          onClick={() => deleteReply(r.id)}
                          className="melo-focus-ring rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Delete this reply"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-foreground/90">{renderBody(r.body)}</p>
                    <div className="mt-2 flex justify-end border-t border-border/50 pt-1.5">
                      <button
                        type="button"
                        onClick={() => setReplyOpenFor(replyOpenFor === r.id ? null : r.id)}
                        className="melo-focus-ring inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-brand-320"
                      >
                        <CornerDownRight className="h-3 w-3" />
                        Reply
                      </button>
                    </div>
                    {replyOpenFor === r.id && initial && (
                      <div className="mt-2">
                        <TrackReplyComposer trackId={track.id} parentNoteId={initial.id} onPosted={() => { setReplyOpenFor(null); fetchNotes(); }} />
                      </div>
                    )}
                  </article>
                );
              })}
          </div>

          {initial && (
            <TrackReplyComposer trackId={track.id} parentNoteId={initial.id} onPosted={fetchNotes} />
          )}
          <p className="text-[10px] text-muted-foreground">
            Tip: while listening, pin a reply to the current time ({formatTime(currentTime)}).
          </p>
        </>
      )}
    </section>
  );
}
