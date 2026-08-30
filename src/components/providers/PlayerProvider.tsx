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
  playTrack: (track: MusicResource, initialTime?: number, shareId?: string) => void;
  seekTo: (seconds: number) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  setVolume: (v: number) => void;
  setActiveCommentTime: (t: number | null) => void;
  playerRef: any;
  setPlayerInstance: (instance: any) => void;
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

  const playerInstanceRef = useRef<any>(null);

  const setPlayerInstance = (instance: any) => {
    playerInstanceRef.current = instance;
  };

  const playTrack = (track: MusicResource, initialTime: number = 0, shareId?: string) => {
    setCurrentTrack(track);
    if (shareId) setActiveShareId(shareId);
    setDuration(track.durationSeconds || 240);

    // Extract YouTube ID if present in cover or metadata or default mapping
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

    setYoutubeId(vidId);
    setCurrentTime(initialTime);
    setIsPlaying(true);

    if (playerInstanceRef.current && typeof playerInstanceRef.current.loadVideoById === "function") {
      playerInstanceRef.current.loadVideoById({
        videoId: vidId,
        startSeconds: initialTime,
      });
    }
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
        playTrack,
        seekTo,
        togglePlay,
        pause,
        resume,
        setVolume,
        setActiveCommentTime,
        playerRef: playerInstanceRef,
        setPlayerInstance,
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
