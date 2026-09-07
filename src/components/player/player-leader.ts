"use client";

import { useEffect, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Leader registry: several player cards can be mounted at once (side panel,
// sheets, audio host) but only ONE may own a live iframe. The rest render a
// lightweight placeholder driven by the shared player state.
// This guarantees a single audible stream — no overlapping playback.
// ---------------------------------------------------------------------------
let leaderStack: string[] = [];
const leaderListeners = new Set<() => void>();

function emitLeaderChange() {
  leaderListeners.forEach((l) => l());
}

function subscribeLeader(listener: () => void) {
  leaderListeners.add(listener);
  return () => {
    leaderListeners.delete(listener);
  };
}

function getLeaderSnapshot(): string | null {
  return leaderStack.length > 0 ? leaderStack[leaderStack.length - 1] : null;
}

export function claimLeadership(id: string) {
  if (leaderStack[leaderStack.length - 1] !== id) {
    leaderStack = [...leaderStack.filter((x) => x !== id), id];
    emitLeaderChange();
  }
}

export function releaseLeadership(id: string) {
  if (leaderStack.includes(id)) {
    leaderStack = leaderStack.filter((x) => x !== id);
    emitLeaderChange();
  }
}

export function isLeaderId(id: string): boolean {
  return leaderStack[leaderStack.length - 1] === id;
}

export function useIsLeader(id: string): boolean {
  const leader = useSyncExternalStore(subscribeLeader, getLeaderSnapshot, getLeaderSnapshot);
  useEffect(() => {
    claimLeadership(id);
    return () => {
      releaseLeadership(id);
    };
  }, [id]);
  return leader === id;
}

// Shared promise: concurrent callers (side panel, sheets, audio host) all
// await the same load instead of each overwriting onYouTubeIframeAPIReady.
let apiPromise: Promise<void> | null = null;

function loadApiScript(): Promise<void> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") {
        try {
          prev();
        } catch {}
      }
      resolve();
    };
    // Safety: never hang forever if the API fails to load/call back.
    setTimeout(() => resolve(), 15000);
  });
  return apiPromise;
}

export function ensureYouTubeApi(onReady: () => void) {
  loadApiScript().then(() => {
    onReady();
  });
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}
