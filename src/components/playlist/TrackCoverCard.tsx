"use client";
import React, { memo, useCallback } from "react";
import { Play, Pause, Hash } from "lucide-react";
import { MusicResource } from "@/types";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { TrackCover } from "./TrackCover";

interface TrackCoverCardProps {
  track: MusicResource;
  categoryColor?: string;
  isActive: boolean;
  isPlaying: boolean;
  isHighlighted: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onHover: (id: string | null) => void;
}

/** Curator cover: original position badge, title/artist revealed on hover. Memoized for cheap hover updates. */
export const TrackCoverCard = memo(function TrackCoverCard({ track, categoryColor, isActive, isPlaying, isHighlighted, onSelect, onPlay, onHover }: TrackCoverCardProps) {
  const pos = track.sourcePosition ?? 0;
  return (
    <article
      data-track-id={track.id}
      data-active={isActive}
      onMouseEnter={() => onHover(track.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(track.id)}
      onBlur={() => onHover(null)}
      className={cn(
        "melo-crate-card group relative overflow-hidden rounded-xl border bg-black/50 transition-all duration-200",
        isActive
          ? "border-brand-500 shadow-[0_0_0_1px_#af3535,0_8px_32px_rgba(175,53,53,0.35)]"
          : isHighlighted
            ? "border-[#e8b34b]/60 shadow-[0_0_0_1px_rgba(232,179,75,0.5),0_8px_28px_rgba(0,0,0,0.5)]"
            : "border-border hover:border-white/20 hover:shadow-[0_8px_28px_rgba(0,0,0,0.5)]"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Open ${track.title} by ${track.artistName}, track ${pos + 1}`}
        className="melo-focus-ring block w-full text-left"
      >
        <div className="relative aspect-square w-full overflow-hidden bg-white/5">
          {track.coverImageUrl ? (
            <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.04]">
              <TrackCover
                src={track.coverImageUrl}
                alt={`Cover art for ${track.title}`}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-2xl text-muted-foreground">
              {track.title.slice(0, 2).toUpperCase()}
            </div>
          )}
          {/* Original position badge */}
          <span
            className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white backdrop-blur-sm"
            title={`Original playlist position: ${pos + 1}`}
          >
            <Hash className="h-3 w-3" aria-hidden="true" />
            {pos + 1}
          </span>
          {categoryColor && (
            <span
              className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-black/60"
              style={{ backgroundColor: categoryColor }}
              aria-hidden="true"
            />
          )}
          {/* Desktop hover overlay: title / artist */}
          <span className="absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2.5 pt-6 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <span className="block truncate text-xs font-bold text-white">{track.title}</span>
            <span className="block truncate text-[11px] text-white/70">{track.artistName}</span>
          </span>
        </div>
      </button>
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={onPlay}
          aria-label={isPlaying && isActive ? `Pause ${track.title}` : `Play ${track.title}`}
          className={cn(
            "melo-focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
            isActive ? "bg-brand-500 text-white" : "bg-white/10 text-foreground hover:bg-brand-500 hover:text-white"
          )}
        >
          {isPlaying && isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold leading-tight text-foreground">{track.title}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {formatTime(track.durationSeconds)}
            {track.moodScore !== null && track.moodScore !== undefined ? ` · H${track.moodScore}` : ""}
            {track.softnessScore !== null && track.softnessScore !== undefined ? ` · D${track.softnessScore}` : ""}
          </p>
        </div>
      </div>
    </article>
  );
});

/**
 * Per-track wrapper: builds the per-card closures inside a memoized
 * boundary, so hovering/selecting one card doesn't re-render siblings.
 * Parents pass their stable (track => void) handlers straight through.
 */
export const TrackCoverItem = memo(function TrackCoverItem({
  track,
  categoryColor,
  isActive,
  isPlaying,
  isHighlighted,
  onSelect,
  onPlay,
  onHover,
}: {
  track: MusicResource;
  categoryColor?: string;
  isActive: boolean;
  isPlaying: boolean;
  isHighlighted: boolean;
  onSelect: (t: MusicResource) => void;
  onPlay: (t: MusicResource) => void;
  onHover: (id: string | null) => void;
}) {
  const handleSelect = useCallback(() => onSelect(track), [onSelect, track]);
  const handlePlay = useCallback(() => onPlay(track), [onPlay, track]);
  return (
    <TrackCoverCard
      track={track}
      categoryColor={categoryColor}
      isActive={isActive}
      isPlaying={isPlaying}
      isHighlighted={isHighlighted}
      onSelect={handleSelect}
      onPlay={handlePlay}
      onHover={onHover}
    />
  );
});
