"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MicVocal } from "lucide-react";
import { usePlayer } from "../providers/PlayerProvider";
import { cn } from "@/lib/utils";

interface LyricLine {
  time: number;
  text: string;
}

interface SyncedLyricsProps {
  artist: string;
  title: string;
  album?: string;
  durationSeconds?: number;
  /** Bare mode for overlays: no card chrome, fills the parent. */
  overlay?: boolean;
}

function cleanArtist(a: string): string {
  return a
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\s*,\s*.*/g, "")
    .trim();
}

function cleanTitle(t: string): string {
  return t
    .replace(/\s*\(Official.*?\)/gi, "")
    .replace(/\s*\[Official.*?\]/gi, "")
    .replace(/\s*\(Official.*$/gi, "")
    .replace(/\s*\([^)]*(audio|video|clip|lyrics|visualizer)[^)]*\)/gi, "")
    .trim();
}

function parseLRC(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of raw.split("\n")) {
    const tags = [...row.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (tags.length === 0) continue;
    const text = row.replace(/\[(\d+):(\d+(?:\.\d+)?)\]/g, "").trim();
    if (!text) continue;
    for (const m of tags) {
      const time = Number(m[1]) * 60 + Number(m[2]);
      if (Number.isFinite(time)) lines.push({ time, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/**
 * Synchronized lyrics (LRCLIB, free, no key). Synced lines highlight
 * in real time; falls back to plain text when no timings exist.
 */
export function SyncedLyrics({ artist, title, album, durationSeconds, overlay = false }: SyncedLyricsProps) {
  const { currentTime } = usePlayer();
  const [lines, setLines] = useState<LyricLine[] | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Guard: without artist/title there is nothing to search — fail fast
      // instead of leaving the panel in a perpetual loading state.
      if (!artist?.trim() || !title?.trim()) {
        setLines(null);
        setPlain(null);
        setError("No lyrics found for this track.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setLines(null);
      setPlain(null);
      try {
        const artistVariants = [...new Set([cleanArtist(artist), artist.trim()])].filter(Boolean);
        const titleVariants = [...new Set([cleanTitle(title), title.trim()])].filter(Boolean);
        let synced: string | null = null;
        let plainText: string | null = null;

        const tryGet = async (a: string, t: string): Promise<boolean> => {
          const params = new URLSearchParams({
            artist_name: a,
            track_name: t,
            ...(album ? { album_name: album } : {}),
            ...(durationSeconds ? { duration: String(Math.round(durationSeconds)) } : {}),
          });
          try {
            const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
            if (!res.ok) return false;
            const data = await res.json();
            if (data.syncedLyrics || data.plainLyrics) {
              synced = data.syncedLyrics || null;
              plainText = data.plainLyrics || null;
              return true;
            }
          } catch {}
          return false;
        };

        const trySearch = async (a: string, t: string): Promise<boolean> => {
          try {
            const searchParams = new URLSearchParams({ track_name: t, artist_name: a });
            const res = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`);
            if (!res.ok) return false;
            const results = await res.json();
            const first = Array.isArray(results) ? results[0] : null;
            if (first && (first.syncedLyrics || first.plainLyrics)) {
              synced = first.syncedLyrics || null;
              plainText = first.plainLyrics || null;
              return true;
            }
          } catch {}
          return false;
        };

        let found = false;
        const findLyrics = async (): Promise<boolean> => {
          for (const a of artistVariants) {
            for (const t of titleVariants) {
              if (await tryGet(a, t)) return true;
            }
          }
          for (const a of artistVariants) {
            for (const t of titleVariants) {
              if (await trySearch(a, t)) return true;
            }
          }
          return false;
        };
        found = await findLyrics();
        if (!found) {
          console.warn(
            `[Lyrics] nothing found for "${artist}" — "${title}" (tried: ${artistVariants.join("|")} / ${titleVariants.join("|")})`
          );
        }
        if (cancelled) return;
        if (synced) {
          const parsed = parseLRC(synced);
          if (parsed.length > 0) setLines(parsed);
          else if (plainText) setPlain(plainText);
          else setError("No lyrics found for this track.");
        } else if (plainText) {
          setPlain(plainText);
        } else {
          setError("No lyrics found for this track.");
        }
      } catch {
        if (!cancelled) setError("Could not load lyrics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [artist, title, album, durationSeconds]);

  const activeIdx = useMemo(() => {
    if (!lines) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTime + 0.3) idx = i;
      else break;
    }
    return idx;
  }, [lines, currentTime]);

  useEffect(() => {
    if (activeIdx < 0) return;
    const container = scroller.current;
    const el = container?.querySelector<HTMLElement>(`[data-line="${activeIdx}"]`);
    if (container && el) {
      container.scrollTo({
        top: Math.max(0, el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2),
        behavior: "smooth",
      });
    }
  }, [activeIdx]);

  return (
    <div
      className={overlay ? "flex h-full flex-col" : "rounded-2xl border border-border bg-black/40 p-4"}
      aria-label={`Lyrics for ${title}`}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <MicVocal className="h-3.5 w-3.5 text-brand-410" aria-hidden="true" />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Lyrics
        </span>
        {lines && (
          <span className="ml-auto font-mono text-[10px] text-emerald-400">synced</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
          <span className="text-xs text-muted-foreground">Loading lyrics…</span>
        </div>
      ) : error ? (
        <p className="py-6 text-center text-xs text-muted-foreground" role="status">
          {error}
        </p>
      ) : lines ? (
        <div
          ref={scroller}
          className={cn("space-y-1.5 overflow-y-auto pr-1", overlay ? "min-h-0 flex-1" : "max-h-64")}
          aria-live="off"
        >
          {lines.map((l, i) => (
            <p
              key={i}
              data-line={i}
              className={cn(
                "rounded-md px-2 py-1 text-[13px] leading-relaxed transition-all",
                i === activeIdx
                  ? "bg-brand-500/15 font-bold text-foreground"
                  : i < activeIdx
                    ? "text-muted-foreground/70"
                    : "text-muted-foreground"
              )}
            >
              {l.text}
            </p>
          ))}
        </div>
      ) : plain ? (
        <div className={cn("overflow-y-auto pr-1", overlay && "min-h-0 flex-1")}>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">{plain}</p>
        </div>
      ) : null}

      {!overlay && (
        <p className="mt-2 text-right text-[10px] text-muted-foreground/60">Lyrics via LRCLIB</p>
      )}
    </div>
  );
}
