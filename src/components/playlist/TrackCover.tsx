"use client";
import React, { useEffect, useMemo, useState } from "react";

/**
 * Resolve the cheapest reliable YouTube thumbnail.
 * hqdefault (480x360) always exists and is plenty for sleeves / cards /
 * the Now Playing panel (all rendered <= 420px wide). maxres (1280px)
 * 404s on most videos and costs ~6x the bytes + decode time on mobile,
 * so it is never requested by default.
 */
function pickInitial(url?: string, eager?: boolean): string | null {
  if (!url) return null;
  const m = url.match(/^(https?:\/\/i\.ytimg\.com\/vi\/([^/]+)\/).*$/);
  if (!m) return url;
  const base = m[1];
  // Eager hero art: try sd (640px) first, fall back to hq on error.
  // Lazy art: hq directly — zero fallback requests in the common path.
  return eager ? `${base}sddefault.jpg` : `${base}hqdefault.jpg`;
}

function fallbackFor(current: string): string | null {
  const m = current.match(/^(https?:\/\/i\.ytimg\.com\/vi\/([^/]+)\/)([^?#]+)$/);
  if (!m) return null;
  const base = m[1];
  const file = m[3];
  if (file === "sddefault.jpg") return `${base}hqdefault.jpg`;
  if (file === "hqdefault.jpg") return `${base}mqdefault.jpg`;
  return null;
}

interface TrackCoverProps {
  src?: string;
  alt: string;
  className?: string;
  eager?: boolean;
}

/**
 * Cover art with bounded cost: at most 2 small requests (sd→hq for eager
 * heroes, single hq for everything else), lazy + async decode off-screen.
 */
export function TrackCover({ src, alt, className = "", eager = false }: TrackCoverProps) {
  const initial = useMemo(() => pickInitial(src, eager), [src, eager]);
  const [current, setCurrent] = useState<string | null>(initial);

  useEffect(() => {
    setCurrent(pickInitial(src, eager));
  }, [src, eager]);

  if (!current) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      draggable={false}
      onError={() => {
        setCurrent((prev) => {
          if (!prev) return prev;
          // Never loop back to the original oversized URL: only step down.
          const next = fallbackFor(prev);
          return next ?? prev;
        });
      }}
      className={className}
    />
  );
}
