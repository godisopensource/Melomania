"use client";
import React from "react";
import { Lock, Clock } from "lucide-react";
import { TrackNote } from "@/types";
import { formatTime, formatRelativeDate } from "@/lib/utils";
import { usePlayerState } from "../providers/PlayerProvider";
import { renderRichBody } from "../comments/rich-text";

interface ImmutableTrackNoteProps {
  note: TrackNote;
}

/** Opening editorial note: set in stone once published (no edit, no delete). */
export function ImmutableTrackNote({ note }: ImmutableTrackNoteProps) {
  const { seekTo } = usePlayerState();
  const hasTime = note.startTimeSeconds !== null && note.startTimeSeconds !== undefined;
  return (
    <article className="rounded-2xl border border-[#e8b34b]/30 bg-[#e8b34b]/[0.06] p-4" aria-label="Opening editorial note">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={note.author?.avatarUrl || "/icon.png"} alt="" className="h-8 w-8 rounded-md object-cover ring-1 ring-border" />
          <div>
            <p className="text-xs font-bold text-foreground">{note.author?.displayName || "Curator"}</p>
            <p className="text-[11px] text-muted-foreground">{formatRelativeDate(note.createdAt)} · opening note</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#e8b34b]/40 bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#e8b34b]">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Opening note
        </span>
      </div>
      {hasTime && (
        <button
          type="button"
          onClick={() => seekTo(note.startTimeSeconds || 0)}
          className="melo-focus-ring mt-2 inline-flex items-center gap-1 rounded bg-brand-500/15 px-2 py-0.5 font-mono text-xs text-brand-320 hover:bg-brand-500/25"
        >
          <Clock className="h-3 w-3" />
          {formatTime(note.startTimeSeconds)}
        </button>
      )}
      <p className="mt-2.5 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/95">{renderRichBody(note.body, seekTo)}</p>
      <p className="mt-2 border-t border-[#e8b34b]/20 pt-2 text-[11px] italic text-muted-foreground">
        This note opens the thread below.
      </p>
    </article>
  );
}
