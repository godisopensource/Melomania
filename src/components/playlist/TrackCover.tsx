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
  const chain = useMemo(() => upgradeChain(src), [src]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
  }, [src]);

  if (chain.length === 0) return null;
  const current = chain[Math.min(step, chain.length - 1)];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      draggable={false}
      onError={() => setStep((s) => Math.min(s + 1, chain.length - 1))}
      className={className}
    />
  );
}
