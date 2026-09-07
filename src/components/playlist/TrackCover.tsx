"use client";
import React, { useEffect, useMemo, useState } from "react";

/** Best-effort quality chain for YouTube thumbnails: maxres → sd → hq. */
function upgradeChain(url?: string): string[] {
  if (!url) return [];
  const m = url.match(/^(https?:\/\/i\.ytimg\.com\/vi\/([^/]+)\/)([^?#]+)/);
  if (!m) return [url];
  const base = m[1];
  const chain = [`${base}maxresdefault.jpg`, `${base}sddefault.jpg`, `${base}hqdefault.jpg`];
  if (!chain.includes(url)) chain.push(url);
  return [...new Set(chain)];
}

function videoIdOf(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/i\.ytimg\.com\/vi\/([^/]+)\//);
  return m ? m[1] : null;
}

// Session cache: the best working resolution per video, probed once.
// Every remount / revisit / sibling card reuses it — no repeat 404s,
// no repeat full-size downloads for the same video.
const bestUrlCache = new Map<string, string>();

interface TrackCoverProps {
  src?: string;
  alt: string;
  className?: string;
  eager?: boolean;
}

/**
 * Cover art that always tries the best YouTube resolution first
 * (maxres 1280px) and steps down on error. Non-YouTube URLs pass through.
 * (Quality remains bounded by what YouTube exposes per video.)
 */
export function TrackCover({ src, alt, className = "", eager = false }: TrackCoverProps) {
  const chain = useMemo(() => {
    const full = upgradeChain(src);
    // Fast path: a previous probe already resolved this video.
    const vid = videoIdOf(src);
    if (vid && bestUrlCache.has(vid)) {
      const best = bestUrlCache.get(vid)!;
      // Keep the cached winner first, rest as fallback (order preserved).
      return [best, ...full.filter((u) => u !== best)];
    }
    return full;
  }, [src]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
  }, [src]);

  const vid = videoIdOf(src);

  if (chain.length === 0) return null;
  const current = chain[Math.min(step, chain.length - 1)];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      draggable={false}
      onLoad={() => {
        // Remember the winner: siblings / revisits skip probing entirely.
        if (vid && !bestUrlCache.has(vid)) bestUrlCache.set(vid, current);
      }}
      onError={() => setStep((s) => Math.min(s + 1, chain.length - 1))}
      className={className}
    />
  );
}
