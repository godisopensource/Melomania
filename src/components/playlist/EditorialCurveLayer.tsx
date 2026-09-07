"use client";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { EmotionalCriterion, MusicResource, PlaylistCategory } from "@/types";
import { catmullRomPath } from "@/lib/curves";

interface EditorialCurveLayerProps {
  /** All tracks, sorted by sourcePosition inside. */
  tracks: MusicResource[];
  categories: PlaylistCategory[];
  criteria: EmotionalCriterion[];
  /** Visibility per curve key: 'mood' | 'softness' | criterionId. */
  visible: Record<string, boolean>;
  hoveredTrackId: string | null;
  selectedTrackId: string | null;
  onPointHover: (id: string | null) => void;
  onPointSelect: (id: string) => void;
  /** Compact mode for the vinyl view header band. */
  compact?: boolean;
  /** Horizontal zoom multiplier (1 = fit the band width, > 1 scrolls). */
  zoom?: number;
}

const PAD_X = 24;
const TOP = 10;
const BOTTOM_PAD = 10;

interface CurveDef {
  key: string;
  color: string;
  offset: number;
  get: (t: MusicResource) => number | null | undefined;
}

/**
 * Emotional map: one continuous curve per criterion across the playlist.
 * X follows sourcePosition (track Nº), Y follows the manual score
 * (100 at the top). Tracks without a score default to 50.
 * Smoothed with Catmull–Rom interpolation.
 *
 * The layer measures its own box and draws in real pixels (1 unit = 1px),
 * so circles stay round and labels undistorted at any container size.
 * `zoom` widens the drawing surface horizontally; the band scrolls.
 *
 * Perf notes: the SVG can hold tracks × curves points — all geometry is
 * memoized, paths carry no per-frame SVG filters (drop-shadow on every
 * path forces a full-layer repaint on mobile GPUs), and points avoid CSS
 * transitions (each hover would otherwise restyle hundreds of nodes).
 */
function EditorialCurveLayerInner({
  tracks,
  categories,
  criteria,
  visible,
  hoveredTrackId,
  selectedTrackId,
  onPointHover,
  onPointSelect,
  compact,
  zoom = 1,
}: EditorialCurveLayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const w = Math.max(0, Math.round(r.width));
        const h = Math.max(0, Math.round(r.height));
        setVp((prev) => {
          if (prev && prev.w === w && prev.h === h) return prev;
          return { w, h };
        });
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  // Virtual drawing surface in real pixels: 1 SVG unit = 1 px, no stretching.
  const W = vp && vp.w > 0 ? Math.max(1, Math.round(vp.w * safeZoom)) : 0;
  const H = vp && vp.h > 0 ? Math.max(1, Math.round(vp.h)) : 0;
  const BAND = Math.max(1, H - TOP - BOTTOM_PAD);
  const ordered = useMemo(
    () => [...tracks].sort((a, b) => (a.sourcePosition ?? 0) - (b.sourcePosition ?? 0)),
    [tracks]
  );

  const defs: CurveDef[] = useMemo(
    () => [
      { key: "mood", color: "#e8b34b", offset: 0, get: (t) => t.moodScore },
      { key: "softness", color: "#5ec4b6", offset: 5, get: (t) => t.softnessScore },
      ...criteria.map((c, i) => ({
        key: c.id,
        color: c.color,
        offset: (i % 2 === 0 ? 1 : -1) * (Math.floor(i / 2) + 1) * 6,
        get: (t: MusicResource) => t.customScores?.[c.id],
      })),
    ],
    [criteria]
  );

  const activeDefs = useMemo(() => defs.filter((d) => visible[d.key] !== false), [defs, visible]);

  const catColorOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.color);
    return (track: MusicResource): string => {
      if (track.categoryId && map.has(track.categoryId)) return map.get(track.categoryId)!;
      return "#8A8F98";
    };
  }, [categories]);

  const curves = useMemo(() => {
    if (W <= 0 || H <= 0) return [];
    const xFor = (pos: number): number => {
      if (ordered.length <= 1) return W / 2;
      return PAD_X + (pos / Math.max(1, ordered.length - 1)) * (W - PAD_X * 2);
    };
    const yFor = (score: number | null | undefined): number => {
      const s = score === null || score === undefined ? 50 : Math.max(0, Math.min(100, score));
      return TOP + BAND - (s / 100) * BAND;
    };
    return activeDefs.map((def) => {
      const pts = ordered.map((t) => ({
        x: xFor(t.sourcePosition ?? 0),
        y: yFor(def.get(t)) + def.offset,
        trackId: t.id,
        sourcePosition: t.sourcePosition ?? 0,
        value: def.get(t) ?? null,
        ring: catColorOf(t),
      }));
      return { def, pts, path: catmullRomPath(pts) };
    });
  }, [activeDefs, ordered, catColorOf, W, H, BAND]);

  return (
    <div ref={wrapRef} className="h-full w-full overflow-x-auto overflow-y-hidden">
      {W > 0 && H > 0 ? (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Emotional curves across the playlist in original order"
        >
      <defs>
        {activeDefs.map((def) => (
          <linearGradient key={def.key} id={`melo-curve-${def.key}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={def.color} stopOpacity="0.55" />
            <stop offset="50%" stopColor={def.color} />
            <stop offset="100%" stopColor={def.color} stopOpacity="0.55" />
          </linearGradient>
        ))}
      </defs>

      {/* Baseline = original order */}
      <line x1={16} y1={H - 4} x2={W - 16} y2={H - 4} stroke="rgba(255,255,255,0.14)" strokeWidth={1.5} strokeDasharray="3 5" />

      {curves.map(({ def, path }) =>
        path ? (
          <path
            key={def.key}
            d={path}
            fill="none"
            stroke={`url(#melo-curve-${def.key})`}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ) : null
      )}

      <g>
        {curves.map(({ def, pts }) =>
          pts.map((p) => {
            const active = p.trackId === hoveredTrackId || p.trackId === selectedTrackId;
            const missing = p.value === null;
            return (
              <g key={`${def.key}-${p.trackId}`}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={active ? 10 : 7}
                  fill={missing ? "#0c0c0c" : def.color}
                  stroke={p.ring}
                  strokeWidth={active ? 2.5 : 1.5}
                  strokeDasharray={missing ? "2 2" : undefined}
                  opacity={missing ? 0.8 : 1}
                  className="cursor-pointer"
                  onMouseEnter={() => onPointHover(p.trackId)}
                  onMouseLeave={() => onPointHover(null)}
                  onFocus={() => onPointHover(p.trackId)}
                  onBlur={() => onPointHover(null)}
                  onClick={() => onPointSelect(p.trackId)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${def.key} of track number ${p.sourcePosition + 1}: ${p.value ?? "not rated yet, defaults to 50"}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPointSelect(p.trackId);
                    }
                  }}
                >
                  <title>{`Nº ${p.sourcePosition + 1} · ${def.key} ${p.value ?? "50 (default)"}`}</title>
                </circle>
                {def.key === "mood" && (!compact || active) && (
                  <text x={p.x} y={p.y - 13} textAnchor="middle" fontSize={11} fill="#e8b34b" fontFamily="monospace" opacity={active ? 1 : 0.6}>
                    {p.sourcePosition + 1}
                  </text>
                )}
              </g>
            );
          })
        )}
      </g>
        </svg>
      ) : null}
    </div>
  );
}

export const EditorialCurveLayer = memo(EditorialCurveLayerInner);
