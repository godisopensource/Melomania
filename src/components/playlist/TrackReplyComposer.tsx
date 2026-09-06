"use client";
import React, { useState } from "react";
import { Send, Loader2, Clock } from "lucide-react";
import { MentionInput } from "../comments/MentionInput";
import { usePlayer } from "../providers/PlayerProvider";
import { formatTime } from "@/lib/utils";

interface TrackReplyComposerProps {
  trackId: string;
  parentNoteId: string;
  onPosted: () => void;
}

/** Thread reply: @ mentions, #tags + timecodes supported. */
export function TrackReplyComposer({ trackId, parentNoteId, onPosted }: TrackReplyComposerProps) {
  const { currentTime } = usePlayer();
  const [body, setBody] = useState("");
  const [pinTime, setPinTime] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          parentNoteId,
          startTimeSeconds: pinTime ? Math.floor(currentTime) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send.");
      setBody("");
      setPinTime(false);
      onPosted();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-brand-500/25 bg-black/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-muted-foreground">Reply in this thread</span>
        <button
          type="button"
          onClick={() => setPinTime(!pinTime)}
          aria-pressed={pinTime}
          className={`melo-focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
            pinTime ? "bg-brand-500 text-white" : "border border-border bg-white/5 text-muted-foreground"
          }`}
        >
          <Clock className="h-3 w-3" />
          {pinTime ? `Pinned at ${formatTime(currentTime)}` : "Pin to current time"}
        </button>
      </div>
      <MentionInput value={body} onChange={setBody} placeholder="Reply… @ to mention, # to tag, @1:32 for a clickable timecode" />
      {error && (
        <p role="alert" className="text-[11px] text-destructive-foreground">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-590 disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Reply
        </button>
      </div>
    </form>
  );
}
