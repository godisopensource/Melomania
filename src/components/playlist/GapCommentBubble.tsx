"use client";
import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MessageSquareText, Megaphone, Flag, X, Trash2 } from "lucide-react";
import { GapComment } from "@/types";
import { formatRelativeDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { gapAriaLabel, gapEdgeDetail, gapShortLabel, isIntroGap, isOutroGap } from "@/lib/gap-comments";
import { usePlayer } from "../providers/PlayerProvider";
import { renderRichBody } from "../comments/rich-text";

interface GapCommentBubbleProps {
  gap: GapComment;
  isOwner: boolean;
  onDeleted: () => void;
  /** Current track count — lets the bubble tell intro / conclusion apart. */
  trackCount?: number;
}

/**
 * Comment slipped between two tracks (or as playlist intro / conclusion).
 * A speech bubble sits in the flow; hover shows a native preview, click
 * opens the full note in a dialog (portal — never clipped by the shelves).
 */
export function GapCommentBubble({ gap, isOwner, onDeleted, trackCount = 0 }: GapCommentBubbleProps) {
  const { seekTo } = usePlayer();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const preview = `${gap.body.slice(0, 140)}${gap.body.length > 140 ? "…" : ""}`;
  const intro = isIntroGap(gap);
  const outro = isOutroGap(gap, trackCount);
  const edge = intro || outro;
  const title = gapShortLabel(gap, trackCount);
  const detail = gapEdgeDetail(gap, trackCount);
  const Icon = intro ? Megaphone : outro ? Flag : MessageSquareText;

  const remove = async () => {
    if (!confirm("Delete this comment?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/playlists/${gap.playlistId}/gap-comments/${gap.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete.");
      setOpen(false);
      onDeleted();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={gapAriaLabel(gap, trackCount)}
        title={edge && detail ? `${title} · ${detail}` : `${title} · ${preview}`}
        className={cn(
          "melo-focus-ring flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full border shadow-lg transition-all",
          edge
            ? "border-[#e8b34b] bg-[#e8b34b]/25 text-[#e8b34b] hover:scale-110 hover:bg-[#e8b34b]/35"
            : "border-[#e8b34b]/50 bg-black/70 text-[#e8b34b] hover:scale-110 hover:bg-[#e8b34b]/20"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e8b34b]/30 bg-[#171310] p-4 shadow-2xl"
            aria-label={edge && detail ? `${title}, ${detail.toLowerCase()}` : title}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <Dialog.Title className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#e8b34b]">
                {edge && detail ? `${title} · ${detail}` : title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="melo-focus-ring rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Close comment"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/95">{renderRichBody(gap.body, seekTo)}</p>
            <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
              <span className="text-[11px] text-muted-foreground">
                {gap.author?.displayName || "Curator"} · {formatRelativeDate(gap.createdAt)}
              </span>
              {isOwner && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={deleting}
                  className="melo-focus-ring inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" />
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
