"use client";
import React, { useMemo } from "react";
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
}

const W = 1000;
const H = 150;
const TOP = 10;
const BAND = H - 20;

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
 */
export function EditorialCurveLayer({
  tracks,
  categories,
  criteria,
  visible,
  hoveredTrackId,
  selectedTrackId,
  onPointHover,
  onPointSelect,
  compact,
}: EditorialCurveLayerProps) {
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

  const activeDefs = defs.filter((d) => visible[d.key] !== false);

  const colorFor = (track: MusicResource): string =>
    categories.find((c) => c.id === track.categoryId)?.color ?? "#8A8F98";

  const xFor = (pos: number): number => {
    if (ordered.length <= 1) return W / 2;
    return 24 + (pos / Math.max(1, ordered.length - 1)) * (W - 48);
  };
  const yFor = (score: number | null | undefined): number => {
    const s = score === null || score === undefined ? 50 : Math.max(0, Math.min(100, score));
    return TOP + BAND - (s / 100) * BAND;
  };

  const curves = activeDefs.map((def) => {
    const pts = ordered.map((t) => ({
      x: xFor(t.sourcePosition ?? 0),
      y: yFor(def.get(t)) + def.offset,
      trackId: t.id,
      sourcePosition: t.sourcePosition ?? 0,
      value: def.get(t) ?? null,
      ring: colorFor(t),
    }));
    return { def, pts, path: catmullRomPath(pts) };
  });

  return (
    <svg
      className="block h-full w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
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
            vectorEffect="non-scaling-stroke"
            style={{ filter: `drop-shadow(0 0 6px ${def.color}66)` }}
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
                  className="cursor-pointer transition-all"
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
  );
}
