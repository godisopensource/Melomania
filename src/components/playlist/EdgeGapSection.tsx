"use client";
import React from "react";
import { Flag, Megaphone, Plus } from "lucide-react";
import { GapComment } from "@/types";
import { INTRO_GAP_POSITION } from "@/lib/gap-comments";
import { GapCommentBubble } from "./GapCommentBubble";
import { GapCommentComposer } from "./GapCommentComposer";

interface EdgeGapSectionProps {
  kind: "intro" | "outro";
  gaps: GapComment[];
  trackCount: number;
  isOwner: boolean;
  playlistId: string;
  /** When false (vinyl view) the section only displays existing notes. */
  allowCompose?: boolean;
  composerOpen?: boolean;
  onOpenComposer?: () => void;
  onCloseComposer?: () => void;
  onPosted?: () => void;
  onDeleted?: () => void;
}

/**
 * Playlist intro (before Nº 1) or conclusion (after Nº N).
 * Same bubble + composer primitives as interior comments, wrapped in a
 * dashed gold frame so the playlist edges read as editorial slots.
 */
export function EdgeGapSection({
  kind,
  gaps,
  trackCount,
  isOwner,
  playlistId,
  allowCompose = true,
  composerOpen = false,
  onOpenComposer,
  onCloseComposer,
  onPosted,
  onDeleted,
}: EdgeGapSectionProps) {
  const intro = kind === "intro";
  const Icon = intro ? Megaphone : Flag;
  const title = intro ? "Intro" : "Conclusion";
  const detail = intro ? "Before Nº 1" : `After Nº ${trackCount}`;
  const position = intro ? INTRO_GAP_POSITION : Math.max(0, trackCount - 1);

  if (gaps.length === 0 && (!isOwner || !allowCompose)) return null;

  return (
    <div
      className="rounded-xl border border-dashed border-[#e8b34b]/30 bg-[#e8b34b]/[0.04] p-2.5"
      aria-label={gaps.length > 0 ? `Playlist ${title.toLowerCase()}` : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#e8b34b]">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {title}
          <span className="normal-case tracking-normal text-[#e8b34b]/70">· {detail}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {gaps.map((g) => (
            <GapCommentBubble
              key={g.id}
              gap={g}
              isOwner={isOwner}
              trackCount={trackCount}
              onDeleted={onDeleted ?? (() => {})}
            />
          ))}
        </span>
        {isOwner && allowCompose && !composerOpen && gaps.length > 0 && (
          <button
            type="button"
            onClick={onOpenComposer}
            aria-label={intro ? "Add an intro comment" : "Add a conclusion comment"}
            title={intro ? "Add an intro comment" : "Add a conclusion comment"}
            className="melo-focus-ring flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground opacity-60 hover:border-[#e8b34b]/60 hover:text-[#e8b34b] hover:opacity-100"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {isOwner && allowCompose && !composerOpen && gaps.length === 0 && (
        <button
          type="button"
          onClick={onOpenComposer}
          className="melo-focus-ring mt-1.5 inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground opacity-70 hover:border-[#e8b34b]/60 hover:text-[#e8b34b] hover:opacity-100"
        >
          <Plus className="h-3 w-3" />
          {intro ? "Add intro" : "Add conclusion"}
        </button>
      )}
      {isOwner && allowCompose && composerOpen && (
        <div className="mt-2">
          <GapCommentComposer
            playlistId={playlistId}
            afterSourcePosition={position}
            trackCount={trackCount}
            onPosted={onPosted ?? (() => {})}
            onCancel={onCloseComposer ?? (() => {})}
          />
        </div>
      )}
    </div>
  );
}
