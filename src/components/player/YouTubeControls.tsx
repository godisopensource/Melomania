"use client";

import React, { useState } from "react";
import { usePlayer } from "../providers/PlayerProvider";
import { formatTime } from "@/lib/utils";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  PlusCircle,
  SkipForward,
  SkipBack,
} from "lucide-react";
import { Comment } from "@/types";
import { cn } from "@/lib/utils";

interface YouTubeControlsProps {
  comments?: Comment[];
  onAddTimestampComment?: (timeSeconds: number) => void;
  /** Center the control cluster (now-playing card layout). */
  centered?: boolean;
  className?: string;
}

/** Timeline, timestamp markers and transport buttons (no iframe here). */
export function YouTubeControls({
  comments = [],
  onAddTimestampComment,
  centered = false,
  className = "",
}: YouTubeControlsProps) {
  const {
    isPlaying,
    currentTime,
    duration,
    volume,
    activeCommentTime,
    seekTo,
    togglePlay,
    pause,
    next,
    previous,
    queue,
    setVolume,
  } = usePlayer();

  const [isMuted, setIsMuted] = useState(false);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const timestampedComments = comments.filter(
    (c) => c.startTimeSeconds !== null && c.startTimeSeconds !== undefined
  );

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPercent = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSeconds = Math.round(clickPercent * duration);
    seekTo(targetSeconds);
  };

  return (
    <div className={cn(centered && "flex flex-col items-center", className)}>
      <div className={cn("space-y-1.5", centered ? "w-full" : "w-full")}>
        {/* Interactive Timeline bar (keyboard accessible) */}
        <div
          onClick={handleTimelineClick}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              seekTo(currentTime + 5);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              seekTo(currentTime - 5);
            } else if (e.key === "Home") {
              e.preventDefault();
              seekTo(0);
            } else if (e.key === "End") {
              e.preventDefault();
              seekTo(duration);
            }
          }}
          role="slider"
          tabIndex={0}
          aria-label={`Progress: ${formatTime(currentTime)} of ${formatTime(duration)}. Arrow keys to seek.`}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          className="group relative h-2.5 w-full cursor-pointer rounded-full bg-white/10 transition-all hover:h-3 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Timestamp Comment Markers */}
          {timestampedComments.map((comment) => {
            const markerPos =
              duration > 0 ? ((comment.startTimeSeconds || 0) / duration) * 100 : 0;
            const isActive =
              activeCommentTime !== null &&
              Math.abs((comment.startTimeSeconds || 0) - activeCommentTime) < 5;

            return (
              <button
                key={comment.id}
                onClick={(e) => {
                  e.stopPropagation();
                  seekTo(comment.startTimeSeconds || 0);
                }}
                title={`${formatTime(comment.startTimeSeconds)} - ${comment.author?.displayName}: ${comment.body}`}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-all hover:scale-125 ${
                  isActive
                    ? "h-3.5 w-3.5 bg-brand-320 ring-2 ring-brand-500 z-20"
                    : "h-2 w-2 bg-brand-140 ring-1 ring-black/80 z-10"
                }`}
                style={{ left: `${Math.min(99, Math.max(1, markerPos))}%` }}
              />
            );
          })}
        </div>

        <div className="flex w-full items-center justify-between text-xs text-muted-foreground font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center gap-3 pt-1",
          centered ? "justify-center" : "justify-between"
        )}
      >
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <button
              onClick={previous}
              className="melo-focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Previous track (original order)"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="melo-focus-ring flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white shadow hover:bg-brand-590 transition-colors"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          {queue.length > 0 && (
            <button
              onClick={next}
              className="melo-focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Next track (original order)"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            onClick={() => {
              if (isMuted) {
                setVolume(80);
                setIsMuted(false);
              } else {
                setVolume(0);
                setIsMuted(true);
              }
            }}
            aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
            className="melo-focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {onAddTimestampComment && (
          <button
            onClick={() => {
              pause();
              onAddTimestampComment(Math.floor(currentTime));
            }}
            className="melo-focus-ring flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-black/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/10 transition-colors"
          >
            <PlusCircle className="h-3.5 w-3.5 text-brand-410" />
            <span>Add note at {formatTime(currentTime)}</span>
          </button>
        )}
      </div>
    </div>
  );
}
