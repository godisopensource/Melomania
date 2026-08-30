"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePlayer } from "../providers/PlayerProvider";
import { formatTime } from "@/lib/utils";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  PlusCircle,
  ExternalLink,
} from "lucide-react";
import { Comment } from "@/types";

interface YouTubePlayerProps {
  comments?: Comment[];
  onAddTimestampComment?: (timeSeconds: number) => void;
  className?: string;
  compact?: boolean;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}

export function YouTubePlayer({
  comments = [],
  onAddTimestampComment,
  className = "",
  compact = false,
}: YouTubePlayerProps) {
  const {
    currentTrack,
    youtubeId,
    isPlaying,
    currentTime,
    duration,
    volume,
    activeCommentTime,
    seekTo,
    togglePlay,
    pause,
    setVolume,
    setPlayerInstance,
  } = usePlayer();

  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isApiLoaded, setIsApiLoaded] = useState(false);

  const activeVideoId = youtubeId || "dX3k_QDnzHE";

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.YT && window.YT.Player) {
      setIsApiLoaded(true);
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      setIsApiLoaded(true);
    };
  }, []);

  useEffect(() => {
    if (!isApiLoaded || !iframeContainerRef.current) return;

    if (playerRef.current && typeof playerRef.current.destroy === "function") {
      try {
        playerRef.current.destroy();
      } catch (e) {}
    }

    const playerId = `yt-player-${Math.random().toString(36).substr(2, 6)}`;
    const placeholder = document.createElement("div");
    placeholder.id = playerId;
    iframeContainerRef.current.innerHTML = "";
    iframeContainerRef.current.appendChild(placeholder);

    try {
      playerRef.current = new window.YT.Player(playerId, {
        videoId: activeVideoId,
        playerVars: {
          autoplay: isPlaying ? 1 : 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            setPlayerInstance(event.target);
            event.target.setVolume(volume);
          },
        },
      });
    } catch (err) {
      console.warn("YouTube player init warning:", err);
    }

    return () => {
      if (playerRef.current && typeof playerRef.current.destroy === "function") {
        try {
          playerRef.current.destroy();
        } catch (e) {}
      }
    };
  }, [isApiLoaded, activeVideoId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
        try {
          const t = playerRef.current.getCurrentTime();
          if (typeof t === "number" && !isNaN(t)) {
            const state = playerRef.current.getPlayerState();
            if (state === 1) {
              seekTo(t);
            }
          }
        } catch (e) {}
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-black/20">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-brand-500" />
          <span className="text-xs font-semibold text-muted-foreground">
            Official player
          </span>
        </div>

        {activeVideoId && (
          <a
            href={`https://www.youtube.com/watch?v=${activeVideoId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Source <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Embedded IFrame Video Area */}
      <div className="relative aspect-video w-full bg-black/90">
        <div ref={iframeContainerRef} className="h-full w-full" />
      </div>

      {/* Timeline with Timestamp Annotation Markers */}
      <div className="p-4 space-y-3 bg-card">
        <div className="space-y-1.5">
          {/* Interactive Timeline bar */}
          <div
            onClick={handleTimelineClick}
            className="group relative h-2.5 w-full cursor-pointer rounded-full bg-white/10 transition-all hover:h-3"
          >
            {/* Progress Fill */}
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Timestamp Comment Markers */}
            {timestampedComments.map((comment) => {
              const markerPos =
                duration > 0
                  ? ((comment.startTimeSeconds || 0) / duration) * 100
                  : 0;
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

          {/* Time Displays */}
          <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white shadow hover:bg-brand-590 transition-colors"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>

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
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
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
              className="flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/10 transition-colors"
            >
              <PlusCircle className="h-3.5 w-3.5 text-brand-410" />
              <span>Add note at {formatTime(currentTime)}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
