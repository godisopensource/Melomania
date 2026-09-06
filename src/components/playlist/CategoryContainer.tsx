"use client";
import React, { useState } from "react";
import { Minus, Trash2, Loader2 } from "lucide-react";
import { MusicResource, PlaylistCategory, GapComment } from "@/types";
import { TrackCoverCard } from "./TrackCoverCard";
import { GapStrip } from "./GapStrip";

interface CategoryContainerProps {
  category: PlaylistCategory;
  tracks: MusicResource[];
  activeTrackId: string | null;
  isPlaying: boolean;
  selectedTrackId: string | null;
  hoveredTrackId: string | null;
  isOwner: boolean;
  canExtendStart: boolean;
  canExtendEnd: boolean;
  /** Track right before the block (absorbed by "stretch start"). */
  prevTrackId: string | null;
  /** Track right after the block (absorbed by "stretch end"). */
  nextTrackId: string | null;
  /** Gap comments strictly inside this block. */
  gaps: GapComment[];
  playlistId: string;
  /** Current track count — lets bubbles tell intro / conclusion apart. */
  trackCount: number;
  composerAt: number | null;
  onComposerAt: (pos: number | null) => void;
  onGapsChanged: () => void;
  onSelect: (t: MusicResource) => void;
  onPlay: (t: MusicResource) => void;
  onHover: (id: string | null) => void;
  /** (trackId, categoryId | null) — rejects when chronology would break. */
  onAssign: (trackId: string, categoryId: string | null) => Promise<void>;
  onDeleteCategory: (categoryId: string) => Promise<void>;
}

/**
 * Stretchable category block: consecutive tracks live inside one container.
 * The creator stretches it over neighbours (+), releases edge tracks (−),
 * or deletes the block. Chronology is enforced server-side.
 */
export function CategoryContainer({
  category,
  tracks,
  activeTrackId,
  isPlaying,
  selectedTrackId,
  hoveredTrackId,
  isOwner,
  canExtendStart,
  canExtendEnd,
  prevTrackId,
  nextTrackId,
  gaps,
  playlistId,
  trackCount,
  composerAt,
  onComposerAt,
  onGapsChanged,
  onSelect,
  onPlay,
  onHover,
  onAssign,
  onDeleteCategory,
}: CategoryContainerProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const ordered = [...tracks].sort((a, b) => (a.sourcePosition ?? 0) - (b.sourcePosition ?? 0));
  const start = ordered[0]?.sourcePosition ?? 0;
  const end = ordered[ordered.length - 1]?.sourcePosition ?? 0;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-label={`Category ${category.name}, tracks ${start + 1} to ${end + 1}`}
      data-category-id={category.id}
      className="overflow-hidden rounded-2xl border bg-card/40"
      style={{ borderColor: `${category.color}44` }}
    >
      <div className="flex items-center gap-2 p-3 pb-2" style={{ background: `linear-gradient(90deg, ${category.color}22, transparent 70%)` }}>
        <span className="h-6 w-1.5 rounded-full" style={{ backgroundColor: category.color }} aria-hidden="true" />
        <h3 className="font-display min-w-0 flex-1 truncate text-lg font-bold text-foreground">{category.name}</h3>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Nº {start + 1}{end !== start ? `–${end + 1}` : ""} · {ordered.length}
        </span>
        {isOwner && (
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Stretch ${category.name}`}>
            <button
              type="button"
              disabled={!canExtendStart || busy !== null}
              onClick={() => {
                if (prevTrackId) run("ext-start", () => onAssign(prevTrackId, category.id));
              }}
              title="Stretch to include the previous track"
              aria-label={`Stretch ${category.name} to the previous track`}
              className="melo-focus-ring rounded-md border border-border bg-black/50 px-1.5 py-1 font-mono text-[11px] font-bold text-foreground hover:bg-white/10 disabled:opacity-30"
            >
              {busy === "ext-start" ? <Loader2 className="h-3 w-3 animate-spin" /> : "+◀"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                const first = ordered[0];
                if (first) run("rel-start", () => onAssign(first.id, null));
              }}
              title="Release the first track of this block"
              aria-label={`Release the first track of ${category.name}`}
              className="melo-focus-ring rounded-md border border-border bg-black/50 px-1.5 py-1 font-mono text-[11px] font-bold text-foreground hover:bg-white/10 disabled:opacity-30"
            >
              {busy === "rel-start" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Minus className="h-3 w-3" />}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                const last = ordered[ordered.length - 1];
                if (last) run("rel-end", () => onAssign(last.id, null));
              }}
              title="Release the last track of this block"
              aria-label={`Release the last track of ${category.name}`}
              className="melo-focus-ring rounded-md border border-border bg-black/50 px-1.5 py-1 font-mono text-[11px] font-bold text-foreground hover:bg-white/10 disabled:opacity-30"
            >
              {busy === "rel-end" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Minus className="h-3 w-3" />}
            </button>
            <button
              type="button"
              disabled={!canExtendEnd || busy !== null}
              onClick={() => {
                if (nextTrackId) run("ext-end", () => onAssign(nextTrackId, category.id));
              }}
              title="Stretch to include the next track"
              aria-label={`Stretch ${category.name} to the next track`}
              className="melo-focus-ring rounded-md border border-border bg-black/50 px-1.5 py-1 font-mono text-[11px] font-bold text-foreground hover:bg-white/10 disabled:opacity-30"
            >
              {busy === "ext-end" ? <Loader2 className="h-3 w-3 animate-spin" /> : "▶+"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (confirm(`Delete the category "${category.name}"? Its tracks become unclassified.`)) {
                  run("del", () => onDeleteCategory(category.id));
                }
              }}
              title={`Delete ${category.name}`}
              aria-label={`Delete category ${category.name}`}
              className="melo-focus-ring rounded-md border border-border bg-black/50 p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {category.description && (
        <p className="px-3 pb-1 text-[11px] text-muted-foreground">{category.description}</p>
      )}
      {(gaps.length > 0 || (isOwner && end > start)) && (
        <div className="px-3 pb-1">
          <GapStrip
            gaps={gaps}
            isOwner={isOwner}
            playlistId={playlistId}
            minPos={start}
            maxPos={Math.max(start, end - 1)}
            trackCount={trackCount}
            composerAt={composerAt}
            onComposerAt={onComposerAt}
            onPosted={() => {
              onComposerAt(null);
              onGapsChanged();
            }}
            onDeleted={onGapsChanged}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 p-3 pt-2 sm:grid-cols-3 lg:grid-cols-4">
        {ordered.map((t) => (
          <TrackCoverCard
            key={t.id}
            track={t}
            categoryColor={category.color}
            isActive={activeTrackId === t.id}
            isPlaying={isPlaying}
            isHighlighted={hoveredTrackId === t.id || selectedTrackId === t.id}
            onSelect={() => onSelect(t)}
            onPlay={() => onPlay(t)}
            onHover={onHover}
          />
        ))}
      </div>
    </section>
  );
}
