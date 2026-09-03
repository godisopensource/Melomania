"use client";

import { useEffect, useReducer } from "react";

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

export function claimLeadership(id: string) {
  leaderStack = [...leaderStack.filter((x) => x !== id), id];
  emitLeaderChange();
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
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const listener = () => force();
    leaderListeners.add(listener);
    claimLeadership(id);
    return () => {
      leaderListeners.delete(listener);
      releaseLeadership(id);
    };
  }, [id]);
  return isLeaderId(id);
}

export function ensureYouTubeApi(onReady: () => void) {
  if (typeof window === "undefined") return;
  if (window.YT && window.YT.Player) {
    onReady();
    return;
  }
  if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
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
    onReady();
  };
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}
