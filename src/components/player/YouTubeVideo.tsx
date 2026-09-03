"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePlayer } from "../providers/PlayerProvider";
import { ChevronDown, AudioLines, ExternalLink } from "lucide-react";
import { ensureYouTubeApi, useIsLeader } from "./player-leader";

interface YouTubeVideoProps {
  /** Hide the collapsible header (a parent provides its own toggle). */
  showHeader?: boolean;
  /** Controlled expanded state (uncontrolled by default, starts collapsed). */
  expanded?: boolean;
  onExpandedChange?: (v: boolean) => void;
  className?: string;
}

/**
 * The live YouTube embed. Only the current leader mounts an iframe;
 * followers render nothing audible. Collapsed = audio only (kept mounted,
 * hidden). Expanding reveals the clip.
 */
export function YouTubeVideo({
  showHeader = true,
  expanded: controlledExpanded,
  onExpandedChange,
  className = "",
}: YouTubeVideoProps) {
  const {
    youtubeId,
    isPlaying,
    currentTime,
    volume,
    seekTo,
    syncProgress,
    next,
    setPlayerInstance,
    pausedAt,
  } = usePlayer();

  const instanceId = useRef(`ytv-${Math.random().toString(36).slice(2, 8)}`);
  const isLeader = useIsLeader(instanceId.current);

  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;

  const setExpanded = (v: boolean) => {
    if (onExpandedChange) onExpandedChange(v);
    else setInternalExpanded(v);
  };

  const activeVideoId = youtubeId;

  // Latest known position, so a new leader resumes where the audio left off.
  const timeRef = useRef(currentTime);
  timeRef.current = currentTime;

  useEffect(() => {
    ensureYouTubeApi(() => setIsApiLoaded(true));
  }, []);

  useEffect(() => {
    if (!isLeader) {
      if (playerRef.current && typeof playerRef.current.destroy === "function") {
        try {
          playerRef.current.destroy();
        } catch (e) {}
        playerRef.current = null;
      }
      return;
    }
    if (!isApiLoaded || !iframeContainerRef.current || !activeVideoId) {
      if (!activeVideoId && playerRef.current && typeof playerRef.current.destroy === "function") {
        try {
          playerRef.current.destroy();
        } catch (e) {}
        playerRef.current = null;
      }
      return;
    }

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
            if (pausedAt !== null) {
              seekTo(pausedAt);
            } else if (timeRef.current > 2) {
              try {
                event.target.seekTo(Math.floor(timeRef.current), true);
              } catch (e) {}
            }
          },
          onStateChange: (event: any) => {
            // Playlist playback: when a track ends, move to the next one on its own.
            if (event?.data === window.YT?.PlayerState?.ENDED) {
              next();
            }
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
  }, [isApiLoaded, activeVideoId, pausedAt, isLeader]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isApiLoaded && isLeader && playerRef.current) {
      interval = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
          try {
            const t = playerRef.current.getCurrentTime();
            const d =
              typeof playerRef.current.getDuration === "function"
                ? playerRef.current.getDuration()
                : undefined;
            if (typeof t === "number" && !isNaN(t)) {
              // Passive progress: never re-seek here (avoids loops)
              syncProgress(t, d);
            }
          } catch (e) {}
        }
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isApiLoaded, isLeader, activeVideoId]);

  if (!isLeader) return null;

  if (!activeVideoId) {
    return (
      <div className={className}>
        {showHeader && (
          <div className="flex items-center gap-2 border-b border-border bg-black/20 px-4 py-2.5">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-white/20" aria-hidden="true" />
            <span className="text-xs font-semibold text-muted-foreground">Official player</span>
          </div>
        )}
        <p className="px-4 py-3 text-[11px] text-muted-foreground">Nothing queued yet.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {showHeader && (
        <div className="flex items-center justify-between border-b border-border bg-black/20">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="melo-focus-ring flex flex-1 items-center gap-2 px-4 py-2.5 text-left"
          >
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
            <span className="text-xs font-semibold text-muted-foreground">Official player</span>
            {!expanded && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                <AudioLines className="h-3 w-3" aria-hidden="true" />
                Audio only
              </span>
            )}
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          {activeVideoId && (
            <a
              href={`https://www.youtube.com/watch?v=${activeVideoId}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="melo-focus-ring mr-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* Collapsed = audio only (kept mounted, hidden). */}
      <div
        className={`relative w-full bg-black/90 ${expanded || !showHeader ? "" : "h-0 overflow-hidden opacity-0"} ${!showHeader ? "h-full" : expanded ? "aspect-video" : ""}`}
        aria-hidden={showHeader && !expanded}
      >
        <div ref={iframeContainerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
