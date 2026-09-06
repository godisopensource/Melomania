"use client";
import React, { useState } from "react";
import { Send, Loader2, X } from "lucide-react";
import { INTRO_GAP_POSITION } from "@/lib/gap-comments";

interface GapCommentComposerProps {
  playlistId: string;
  afterSourcePosition: number;
  /** Current track count — lets the composer label intro / conclusion. */
  trackCount?: number;
  onPosted: () => void;
  onCancel: () => void;
}

/** Creator-only inline composer for a comment between two tracks, or as playlist intro / conclusion. */
export function GapCommentComposer({ playlistId, afterSourcePosition, trackCount = 0, onPosted, onCancel }: GapCommentComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intro = afterSourcePosition === INTRO_GAP_POSITION;
  const outro = trackCount > 0 && afterSourcePosition === trackCount - 1;
  const heading = intro
    ? "Intro · before Nº 1"
    : outro
      ? `Conclusion · after Nº ${trackCount}`
      : `Between Nº ${afterSourcePosition + 1} & ${afterSourcePosition + 2}`;
  const placeholder = intro
    ? "Introduce the playlist, set the scene…"
    : outro
      ? "Conclude, dedicate, open the next chapter…"
      : "A transition note, a story, a dedication…";
  const ariaLabel = intro
    ? "Add an intro comment before the first track"
    : outro
      ? `Add a conclusion comment after track ${trackCount}`
      : `Add a comment between tracks ${afterSourcePosition + 1} and ${afterSourcePosition + 2}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/gap-comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ afterSourcePosition, body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      onPosted();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="w-full rounded-xl border border-dashed border-[#e8b34b]/40 bg-[#e8b34b]/[0.05] p-3"
      aria-label={ariaLabel}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#e8b34b]">
          {heading}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="melo-focus-ring rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        maxLength={1000}
        rows={2}
        autoFocus
        className="melo-focus-ring w-full resize-none rounded-lg border border-border bg-black/50 p-2.5 text-xs text-foreground placeholder:text-muted-foreground"
      />
      {error && (
        <p role="alert" className="mt-1 text-[11px] text-destructive-foreground">
          {error}
        </p>
      )}
      <div className="mt-2 flex justify-end">
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-590 disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Post comment
        </button>
      </div>
    </form>
  );
}
