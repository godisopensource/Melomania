"use client";
import React from "react";
import { Play, Pause } from "lucide-react";
import { MusicResource } from "@/types";
import { cn } from "@/lib/utils";
import { TrackCover } from "./TrackCover";

interface VinylRecordCardProps {
  track: MusicResource;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  /** Zoom width in px (overrides the default responsive sizes). */
  width?: number;
  /** Touch flip: shows the Play / Details overlay like desktop hover. */
  flipped?: boolean;
  onFlip?: () => void;
  onSelect: () => void;
  onPlay: () => void;
}

/**
 * Vinyl card: cover only by default (no title or artist shown).
 * Overlay on desktop hover / keyboard focus. On mobile, tap selects + opens the sheet.
 */
export function VinylRecordCard({ track, index, isActive, isPlaying, isSelected, width, flipped, onFlip, onSelect, onPlay }: VinylRecordCardProps) {
  const handleActivate = () => {
    // Touch devices have no hover: first tap flips the sleeve to reveal
    // Play / Details (same as desktop hover), Details opens the file.
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      if (!flipped && onFlip) {
        onFlip();
        return;
      }
    }
    onSelect();
  };
  return (
    <div
      className={`melo-vinyl-shelf group relative shrink-0 snap-start ${width ? "" : "w-36 sm:w-44"}`}
      style={{
        zIndex: isSelected || isActive ? 30 : 20 - Math.min(index % 20, 19),
        ...(width ? { width } : {}),
      }}
      data-track-id={track.id}
    >
      <div
        data-active={isActive || isSelected}
        className="melo-vinyl-card melo-focus-ring relative aspect-square overflow-hidden rounded-md bg-neutral-900 shadow-[-18px_24px_50px_rgba(0,0,0,0.65)] ring-1 ring-white/20"
        tabIndex={0}
        role="button"
        aria-label={`Vinyl ${index + 1}: ${track.title}, ${track.artistName}. Activate to see details.`}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
      >
        {track.coverImageUrl ? (
          <TrackCover
            src={track.coverImageUrl}
            alt=""
            className="h-full w-full select-none object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-800 font-display text-3xl text-neutral-500">
            {track.title.slice(0, 2).toUpperCase()}
          </div>
        )}
        {/* Vinyl sheen */}
        <span
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/50"
          aria-hidden="true"
        />
        {/* Left spine, stacked-sleeve feel */}
        <span className="melo-spine pointer-events-none absolute inset-y-0 left-0 w-[7px]" aria-hidden="true" />
        {/* Playing badge */}
        {isActive && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute h-full w-full animate-ping rounded-full bg-white opacity-70" />
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            {isPlaying ? "PLAY" : "PAUSE"}
          </span>
        )}
        {/* Desktop hover / keyboard-focus / touch-flip overlay: title, artist, actions */}
        <span className={cn(
          "absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/95 via-black/55 to-transparent p-3 transition-opacity duration-200",
          flipped ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100"
        )}>
          <span className="truncate text-xs font-bold text-white">{track.title}</span>
          <span className="truncate text-[11px] text-white/70">{track.artistName}</span>
          <span className="mt-1 flex gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onPlay}
              tabIndex={0}
              className="melo-focus-ring inline-flex items-center gap-1 rounded-md bg-brand-500 px-2 py-1 text-[11px] font-bold text-white hover:bg-brand-590"
              aria-label={isPlaying && isActive ? `Pause ${track.title}` : `Play ${track.title}`}
            >
              {isPlaying && isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {isPlaying && isActive ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={onSelect}
              tabIndex={0}
              className="melo-focus-ring rounded-md border border-white/25 bg-black/60 px-2 py-1 text-[11px] font-bold text-white hover:bg-white/20"
            >
              Details
            </button>
          </span>
        </span>
      </div>
      {/* Position label under the sleeve */}
      <p className={cn(
        "mt-2 text-center font-mono text-[10px] tracking-widest",
        isSelected || isActive ? "text-brand-320" : "text-muted-foreground/70"
      )} aria-label={`Track ${index + 1}`}>
        Nº {String(index + 1).padStart(2, "0")}
      </p>
    </div>
  );
}
