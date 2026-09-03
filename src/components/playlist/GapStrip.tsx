"use client";
import React, { useState } from "react";
import { Plus } from "lucide-react";
import { GapComment } from "@/types";
import { GapCommentBubble } from "./GapCommentBubble";
import { GapCommentComposer } from "./GapCommentComposer";

interface GapStripProps {
  gaps: GapComment[];
  isOwner: boolean;
  playlistId: string;
  /** Interior positions where a new comment may be slipped. */
  minPos: number;
  maxPos: number;
  composerAt: number | null;
  onComposerAt: (pos: number | null) => void;
  onPosted: () => void;
  onDeleted: () => void;
}

/** Comments living inside a category block (between two of its tracks). */
export function GapStrip({
  gaps,
  isOwner,
  playlistId,
  minPos,
  maxPos,
  composerAt,
  onComposerAt,
  onPosted,
  onDeleted,
}: GapStripProps) {
  const [pickPos, setPickPos] = useState<number>(minPos);
  const composerOpen = composerAt !== null && composerAt >= minPos && composerAt <= maxPos;

  if (gaps.length === 0 && !isOwner) return null;
  if (gaps.length === 0 && !composerOpen) {
    return (
      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => {
            setPickPos(minPos);
            onComposerAt(minPos);
          }}
          className="melo-focus-ring inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground opacity-60 hover:border-[#e8b34b]/60 hover:text-[#e8b34b] hover:opacity-100"
        >
          <Plus className="h-3 w-3" />
          Comment inside
        </button>
      </div>
    );
  }

  const options: number[] = [];
  for (let p = minPos; p <= maxPos; p++) options.push(p);

  return (
    <div className="space-y-2 rounded-xl bg-black/30 p-2">
      {gaps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {gaps.map((g) => (
            <GapCommentBubble key={g.id} gap={g} isOwner={isOwner} onDeleted={onDeleted} />
          ))}
        </div>
      )}
      {isOwner && !composerOpen && (
        <button
          type="button"
          onClick={() => {
            setPickPos(minPos);
            onComposerAt(minPos);
          }}
          className="melo-focus-ring inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground opacity-60 hover:border-[#e8b34b]/60 hover:text-[#e8b34b] hover:opacity-100"
        >
          <Plus className="h-3 w-3" />
          Comment inside
        </button>
      )}
      {isOwner && composerOpen && (
        <div className="space-y-2">
          {options.length > 1 && (
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Between
              <select
                value={composerAt}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPickPos(v);
                  onComposerAt(v);
                }}
                className="melo-focus-ring rounded-md border border-border bg-black/50 px-1.5 py-1 font-mono text-[11px] text-foreground"
              >
                {options.map((p) => (
                  <option key={p} value={p}>
                    Nº {p + 1} & {p + 2}
                  </option>
                ))}
              </select>
            </label>
          )}
          <GapCommentComposer
            playlistId={playlistId}
            afterSourcePosition={composerAt ?? pickPos}
            onPosted={onPosted}
            onCancel={() => onComposerAt(null)}
          />
        </div>
      )}
    </div>
  );
}
