"use client";

import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { MusicResource, MusicSource } from "@/types";
import { parseYouTubeUrl } from "@/lib/utils";

interface PlayerContextType {
  currentTrack: MusicResource | null;
  youtubeId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  activeCommentTime: number | null;
  activeShareId: string | null;
  /** Play queue = active playlist order. */
  queue: MusicResource[];
  queueIndex: number;
  activePlaylistId: string | null;
  playTrack: (track: MusicResource, initialTime?: number, shareId?: string) => void;
  /** Stops everything and clears the player (logout, no media, 0:00). */
  reset: () => void;
  /** Plays a whole playlist in its original order. */
  playQueue: (tracks: MusicResource[], startIndex?: number, playlistId?: string) => void;
  next: () => void;
  previous: () => void;
  seekTo: (seconds: number) => void;
  /** Passive progress update without re-seeking (YouTube polling). */
  syncProgress: (seconds: number, totalSeconds?: number) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  setVolume: (v: number) => void;
  setActiveCommentTime: (t: number | null) => void;
  playerRef: any;
  setPlayerInstance: (instance: any) => void;
  pausedAt: number | null;
  setPausedAt: (t: number | null) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<MusicResource | null>(null);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(240);
  const [volume, setVolumeState] = useState(80);
  const [activeCommentTime, setActiveCommentTime] = useState<number | null>(null);
  const [activeShareId, setActiveShareId] = useState<string | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [queue, setQueue] = useState<MusicResource[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  const playerInstanceRef = useRef<any>(null);

  const setPlayerInstance = (instance: any) => {
    playerInstanceRef.current = instance;
  };

  const resolveYoutubeId = (track: MusicResource): string => {
    let vidId = "dX3k_QDnzHE";
    if (track.coverImageUrl?.includes("vi/")) {
      const match = track.coverImageUrl.match(/vi\/([^\/]+)/);
      if (match) vidId = match[1];
    } else if (track.id.includes("midnight")) {
      vidId = "dX3k_QDnzHE";
    } else if (track.id.includes("lucky") || track.title.toLowerCase().includes("get lucky")) {
      vidId = "5qap5aO4i9A";
    } else if (track.id.includes("bohemian") || track.title.toLowerCase().includes("bohemian")) {
      vidId = "fJ9rUzIMcZQ";
    } else if (track.id.includes("nightcall") || track.title.toLowerCase().includes("nightcall")) {
      vidId = "MV_3Dpw-BRY";
    }
    return vidId;
  };

  const loadIntoPlayer = (vidId: string, initialTime: number) => {
    if (playerInstanceRef.current && typeof playerInstanceRef.current.loadVideoById === "function") {
      playerInstanceRef.current.loadVideoById({
        videoId: vidId,
        startSeconds: initialTime,
      });
    }
  };

  const playTrack = (track: MusicResource, initialTime: number = 0, shareId?: string) => {
    setCurrentTrack(track);
    if (shareId) setActiveShareId(shareId);
    if (track.playlistId) setActivePlaylistId(track.playlistId);
    setDuration(track.durationSeconds || 240);

    const vidId = resolveYoutubeId(track);

    setYoutubeId(vidId);
    setCurrentTime(initialTime);
    setIsPlaying(true);
    loadIntoPlayer(vidId, initialTime);
  };

  /** Plays a playlist in its original sourcePosition order. */
  const playQueue = (tracks: MusicResource[], startIndex: number = 0, playlistId?: string) => {
    const ordered = [...tracks].sort((a, b) => (a.sourcePosition ?? 0) - (b.sourcePosition ?? 0));
    const idx = Math.max(0, Math.min(startIndex, ordered.length - 1));
    setQueue(ordered);
    setQueueIndex(idx);
    const first = ordered[idx];
    if (playlistId) setActivePlaylistId(playlistId);
    else if (first?.playlistId) setActivePlaylistId(first.playlistId);
    if (first) playTrack(first);
  };

  const next = () => {
    if (queue.length === 0 || queueIndex < 0) return;
    const nxt = Math.min(queueIndex + 1, queue.length - 1);
    if (nxt === queueIndex) return;
    setQueueIndex(nxt);
    playTrack(queue[nxt]);
  };

  const previous = () => {
    if (queue.length === 0 || queueIndex < 0) return;
    // Back to the start when more than 3s have played, else previous track
    if (currentTime > 3) {
      seekTo(0);
      return;
    }
    const prv = Math.max(queueIndex - 1, 0);
    setQueueIndex(prv);
    playTrack(queue[prv]);
  };

  const seekTo = (seconds: number) => {
    const clamped = Math.max(0, Math.min(seconds, duration));
    setCurrentTime(clamped);
    setActiveCommentTime(clamped);

    if (playerInstanceRef.current && typeof playerInstanceRef.current.seekTo === "function") {
      playerInstanceRef.current.seekTo(clamped, true);
      playerInstanceRef.current.playVideo();
      setIsPlaying(true);
    }
  };

  /** Passive progress (polling): never re-seeks the player. */
  const syncProgress = (seconds: number, totalSeconds?: number) => {
    if (typeof seconds === "number" && !isNaN(seconds) && seconds >= 0) {
      setCurrentTime(seconds);
    }
    if (typeof totalSeconds === "number" && !isNaN(totalSeconds) && totalSeconds > 0) {
      setDuration(totalSeconds);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  };

  const pause = () => {
    setIsPlaying(false);
    if (playerInstanceRef.current && typeof playerInstanceRef.current.pauseVideo === "function") {
      playerInstanceRef.current.pauseVideo();
    }
  };

  const resume = () => {
    setIsPlaying(true);
    if (playerInstanceRef.current && typeof playerInstanceRef.current.playVideo === "function") {
      playerInstanceRef.current.playVideo();
    }
  };

  const setVolume = (v: number) => {
    setVolumeState(v);
    if (playerInstanceRef.current && typeof playerInstanceRef.current.setVolume === "function") {
      playerInstanceRef.current.setVolume(v);
    }
  };

  /** Full reset: silence, no track, 0:00, empty queue. */
  const reset = () => {
    try {
      if (playerInstanceRef.current && typeof playerInstanceRef.current.pauseVideo === "function") {
        playerInstanceRef.current.pauseVideo();
      }
    } catch {}
    setIsPlaying(false);
    setCurrentTrack(null);
    setYoutubeId(null);
    setCurrentTime(0);
    setDuration(0);
    setVolumeState(80);
    setActiveCommentTime(null);
    setActiveShareId(null);
    setPausedAt(null);
    setQueue([]);
    setQueueIndex(-1);
    setActivePlaylistId(null);
  };

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        youtubeId,
        isPlaying,
        currentTime,
        duration,
        volume,
        activeCommentTime,
        activeShareId,
        queue,
        queueIndex,
        activePlaylistId,
        playTrack,
        playQueue,
        next,
        previous,
        reset,
        seekTo,
        syncProgress,
        togglePlay,
        pause,
        resume,
        setVolume,
        setActiveCommentTime,
        playerRef: playerInstanceRef,
        setPlayerInstance,
        pausedAt,
        setPausedAt,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
