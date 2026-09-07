"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { MusicResource } from "@/types";

interface PlayerState {
  currentTrack: MusicResource | null;
  youtubeId: string | null;
  isPlaying: boolean;
  volume: number;
  activeCommentTime: number | null;
  activeShareId: string | null;
  /** Play queue = active playlist order. */
  queue: MusicResource[];
  queueIndex: number;
  activePlaylistId: string | null;
  pausedAt: number | null;
}

interface PlayerActions {
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
  setPausedAt: (t: number | null) => void;
}

interface PlayerProgress {
  currentTime: number;
  duration: number;
}

interface PlayerContextType extends PlayerState, PlayerActions, PlayerProgress {}

// Split contexts: state/actions change rarely, progress ticks ~1Hz.
// Components that don't display time should use usePlayerState() so the
// 1Hz ticker never re-renders them (critical on mobile / old PCs).
const PlayerStateContext = createContext<(PlayerState & PlayerActions) | undefined>(
  undefined
);
const PlayerProgressContext = createContext<PlayerProgress | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<MusicResource | null>(null);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // Progress lives in its own state so ticking it doesn't recreate the
  // state context value (and thus doesn't re-render state-only consumers).
  const [progress, setProgress] = useState<PlayerProgress>({ currentTime: 0, duration: 240 });
  const [volume, setVolumeState] = useState(80);
  const [activeCommentTime, setActiveCommentTime] = useState<number | null>(null);
  const [activeShareId, setActiveShareId] = useState<string | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [queue, setQueue] = useState<MusicResource[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  const playerInstanceRef = useRef<any>(null);
  // Last applied progress — syncProgress is called ~1Hz from the YT poller;
  // skip setState when the whole second / duration didn't change.
  const lastProgressRef = useRef<{ t: number; d: number }>({ t: 0, d: 240 });

  const setPlayerInstance = useCallback((instance: any) => {
    playerInstanceRef.current = instance;
  }, []);

  const resolveYoutubeId = useCallback((track: MusicResource): string => {
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
  }, []);

  const loadIntoPlayer = useCallback((vidId: string, initialTime: number) => {
    if (playerInstanceRef.current && typeof playerInstanceRef.current.loadVideoById === "function") {
      playerInstanceRef.current.loadVideoById({
        videoId: vidId,
        startSeconds: initialTime,
      });
    }
  }, []);

  const playTrack = useCallback(
    (track: MusicResource, initialTime: number = 0, shareId?: string) => {
      setCurrentTrack(track);
      if (shareId) setActiveShareId(shareId);
      if (track.playlistId) setActivePlaylistId(track.playlistId);
      lastProgressRef.current = { t: initialTime, d: track.durationSeconds || 240 };
      setProgress({ currentTime: initialTime, duration: track.durationSeconds || 240 });

      const vidId = resolveYoutubeId(track);

      setYoutubeId(vidId);
      setIsPlaying(true);
      loadIntoPlayer(vidId, initialTime);
    },
    [loadIntoPlayer, resolveYoutubeId]
  );

  /** Plays a playlist in its original sourcePosition order. */
  const playQueue = useCallback(
    (tracks: MusicResource[], startIndex: number = 0, playlistId?: string) => {
      const ordered = [...tracks].sort((a, b) => (a.sourcePosition ?? 0) - (b.sourcePosition ?? 0));
      const idx = Math.max(0, Math.min(startIndex, ordered.length - 1));
      setQueue(ordered);
      setQueueIndex(idx);
      const first = ordered[idx];
      if (playlistId) setActivePlaylistId(playlistId);
      else if (first?.playlistId) setActivePlaylistId(first.playlistId);
      if (first) playTrack(first);
    },
    [playTrack]
  );

  const seekTo = useCallback(
    (seconds: number) => {
      const duration = lastProgressRef.current.d;
      const clamped = Math.max(0, Math.min(seconds, duration));
      lastProgressRef.current = { t: clamped, d: duration };
      setProgress({ currentTime: clamped, duration });
      setActiveCommentTime(clamped);

      if (playerInstanceRef.current && typeof playerInstanceRef.current.seekTo === "function") {
        playerInstanceRef.current.seekTo(clamped, true);
        playerInstanceRef.current.playVideo();
        setIsPlaying(true);
      }
    },
    []
  );

  // Mutable mirrors for O(1) access inside stable callbacks
  // (avoids re-creating next/previous on every queue change).
  const queueRef = useRef<MusicResource[]>([]);
  queueRef.current = queue;
  const queueIndexRef = useRef(-1);
  queueIndexRef.current = queueIndex;

  const next = useCallback(() => {
    const q = queueRef.current;
    const qi = queueIndexRef.current;
    if (q.length === 0 || qi < 0) return;
    const nxt = Math.min(qi + 1, q.length - 1);
    if (nxt === qi) return;
    setQueueIndex(nxt);
    playTrack(q[nxt]);
  }, [playTrack]);

  const previous = useCallback(() => {
    if (lastProgressRef.current.t > 3) {
      seekTo(0);
      return;
    }
    const q = queueRef.current;
    const qi = queueIndexRef.current;
    if (q.length === 0 || qi < 0) return;
    const prv = Math.max(qi - 1, 0);
    setQueueIndex(prv);
    playTrack(q[prv]);
  }, [playTrack, seekTo]);

  /** Passive progress (polling): never re-seeks the player. */
  const syncProgress = useCallback((seconds: number, totalSeconds?: number) => {
    if (typeof seconds !== "number" || isNaN(seconds) || seconds < 0) return;
    const prev = lastProgressRef.current;
    const t = Math.floor(seconds);
    const d =
      typeof totalSeconds === "number" && !isNaN(totalSeconds) && totalSeconds > 0
        ? Math.round(totalSeconds)
        : prev.d;
    // Skip renders when nothing visible changed (whole second + duration).
    if (t === Math.floor(prev.t) && d === prev.d) return;
    lastProgressRef.current = { t: seconds, d };
    setProgress({ currentTime: seconds, duration: d });
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => {
      if (p) {
        if (playerInstanceRef.current && typeof playerInstanceRef.current.pauseVideo === "function") {
          playerInstanceRef.current.pauseVideo();
        }
        return false;
      }
      if (playerInstanceRef.current && typeof playerInstanceRef.current.playVideo === "function") {
        playerInstanceRef.current.playVideo();
      }
      return true;
    });
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (playerInstanceRef.current && typeof playerInstanceRef.current.pauseVideo === "function") {
      playerInstanceRef.current.pauseVideo();
    }
  }, []);

  const resume = useCallback(() => {
    setIsPlaying(true);
    if (playerInstanceRef.current && typeof playerInstanceRef.current.playVideo === "function") {
      playerInstanceRef.current.playVideo();
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (playerInstanceRef.current && typeof playerInstanceRef.current.setVolume === "function") {
      playerInstanceRef.current.setVolume(v);
    }
  }, []);

  /** Full reset: silence, no track, 0:00, empty queue. */
  const reset = useCallback(() => {
    try {
      if (playerInstanceRef.current && typeof playerInstanceRef.current.pauseVideo === "function") {
        playerInstanceRef.current.pauseVideo();
      }
    } catch {}
    setIsPlaying(false);
    setCurrentTrack(null);
    setYoutubeId(null);
    lastProgressRef.current = { t: 0, d: 0 };
    setProgress({ currentTime: 0, duration: 0 });
    setVolumeState(80);
    setActiveCommentTime(null);
    setActiveShareId(null);
    setPausedAt(null);
    setQueue([]);
    setQueueIndex(-1);
    setActivePlaylistId(null);
  }, []);

  /** Queue mirrors live above (queueRef / queueIndexRef). */

  const stateValue = useMemo<PlayerState & PlayerActions>(
    () => ({
      currentTrack,
      youtubeId,
      isPlaying,
      volume,
      activeCommentTime,
      activeShareId,
      queue,
      queueIndex,
      activePlaylistId,
      pausedAt,
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
      setPausedAt,
    }),
    [
      currentTrack,
      youtubeId,
      isPlaying,
      volume,
      activeCommentTime,
      activeShareId,
      queue,
      queueIndex,
      activePlaylistId,
      pausedAt,
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
      setPlayerInstance,
    ]
  );

  const progressValue = useMemo<PlayerProgress>(
    () => progress,
    [progress]
  );

  return (
    <PlayerStateContext.Provider value={stateValue}>
      <PlayerProgressContext.Provider value={progressValue}>
        {children}
      </PlayerProgressContext.Provider>
    </PlayerStateContext.Provider>
  );
}

/** Rarely-changing player state + actions. Does NOT re-render on time ticks. */
export function usePlayerState() {
  const context = useContext(PlayerStateContext);
  if (!context) {
    throw new Error("usePlayerState must be used within a PlayerProvider");
  }
  return context;
}

/** High-frequency playback progress (ticks ~1Hz). Subscribe only where time is displayed. */
export function usePlayerProgress() {
  const context = useContext(PlayerProgressContext);
  if (!context) {
    throw new Error("usePlayerProgress must be used within a PlayerProvider");
  }
  return context;
}

export function usePlayer(): PlayerContextType {
  const state = usePlayerState();
  const progress = usePlayerProgress();
  return useMemo(() => ({ ...state, ...progress }), [state, progress]);
}
