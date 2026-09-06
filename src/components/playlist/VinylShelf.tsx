"use client";
import React, { useMemo, useState } from "react";
import { Loader2, Disc3, ZoomIn, ZoomOut } from "lucide-react";
import { GapComment, MusicResource, PlaylistCategory } from "@/types";
import { VinylRecordCard } from "./VinylRecordCard";
import { GapCommentBubble } from "./GapCommentBubble";
import { EdgeGapSection } from "./EdgeGapSection";
import { INTRO_GAP_POSITION } from "@/lib/gap-comments";

interface VinylShelfProps {
  tracks: MusicResource[];
  categories: PlaylistCategory[];
  gapComments: GapComment[];
  isOwner: boolean;
  activeTrackId: string | null;
  isPlaying: boolean;
  selectedTrackId: string | null;
  loading?: boolean;
  onSelect: (t: MusicResource) => void;
  onPlay: (t: MusicResource) => void;
  onGapsChanged: () => void;
}

const ZOOMS = [120, 148, 180, 216, 256];
const UNCATEGORIZED_COLOR = "#8A8F98";

interface Run {
  key: string;
  categoryId: string | null;
  tracks: MusicResource[];
}

/**
 * Vinyl crate: original order throughout, consecutive same-category
 * tracks grouped into labeled shelf sections. Gap comments sit between
 * sleeves with a speech icon (hover / tap to read). Zoomable.
 */
export function VinylShelf({
  tracks,
  categories,
  gapComments,
  isOwner,
  activeTrackId,
  isPlaying,
  selectedTrackId,
  loading,
  onSelect,
  onPlay,
  onGapsChanged,
}: VinylShelfProps) {
  const [zoomIdx, setZoomIdx] = useState(2);
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const width = ZOOMS[zoomIdx];

  const ordered = useMemo(
    () => [...tracks].sort((a, b) => (a.sourcePosition ?? 0) - (b.sourcePosition ?? 0)),
    [tracks]
  );

  const runs: Run[] = useMemo(() => {
    const out: Run[] = [];
    let current: Run | null = null;
    for (const t of ordered) {
      const cat = t.categoryId ?? null;
      if (current && current.categoryId === cat) current.tracks.push(t);
      else {
        current = { key: `${cat ?? "uncat"}-${t.sourcePosition}`, categoryId: cat, tracks: [t] };
        out.push(current);
      }
    }
    return out;
  }, [ordered]);

  const gapsAt = (pos: number) => gapComments.filter((g) => g.afterSourcePosition === pos);
  const catOf = (id: string | null) => categories.find((c) => c.id === id) ?? null;
  const trackCount = ordered.length;
  const outroPos = Math.max(0, trackCount - 1);
  const introGaps = useMemo(
    () => gapComments.filter((g) => g.afterSourcePosition === INTRO_GAP_POSITION),
    [gapComments]
  );
  const outroGaps = useMemo(
    () => (trackCount > 0 ? gapComments.filter((g) => g.afterSourcePosition === outroPos) : []),
    [gapComments, outroPos, trackCount]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/40 p-16" role="status" aria-label="Loading the crate">
        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
        <span className="text-xs text-muted-foreground">Pressing vinyl…</span>
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
        <Disc3 className="mb-2 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-bold">Empty crate</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Import a YouTube Music playlist to fill the crate.</p>
      </div>
    );
  }

  return (
    <section aria-label={`Vinyl crate, ${ordered.length} records in original order`} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Original order · {ordered.length} records
        </p>
        <div className="flex items-center gap-1.5" role="group" aria-label="Crate zoom">
          <button
            type="button"
            onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
            disabled={zoomIdx === 0}
            className="melo-focus-ring rounded-lg border border-border bg-white/5 p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={0}
            max={ZOOMS.length - 1}
            step={1}
            value={zoomIdx}
            onChange={(e) => setZoomIdx(Number(e.target.value))}
            aria-label={`Sleeve size, ${Math.round((width / 180) * 100)} percent`}
            className="melo-range w-28"
          />
          <button
            type="button"
            onClick={() => setZoomIdx((i) => Math.min(ZOOMS.length - 1, i + 1))}
            disabled={zoomIdx === ZOOMS.length - 1}
            className="melo-focus-ring rounded-lg border border-border bg-white/5 p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="w-11 text-right font-mono text-[11px] text-muted-foreground" aria-hidden="true">
            {Math.round((width / 180) * 100)}%
          </span>
        </div>
      </div>

      {(introGaps.length > 0 || outroGaps.length > 0) && (
        <p className="sr-only">
          This playlist has {introGaps.length > 0 ? "an intro note" : "no intro note"}
          {outroGaps.length > 0 ? " and a conclusion note" : " and no conclusion note"}.
        </p>
      )}
      {introGaps.length > 0 && (
        <EdgeGapSection
          kind="intro"
          gaps={introGaps}
          trackCount={trackCount}
          isOwner={isOwner}
          playlistId=""
          allowCompose={false}
          onDeleted={onGapsChanged}
        />
      )}

      <div className="melo-grain space-y-5 overflow-hidden rounded-2xl border border-border bg-[#0d0b09] p-4 sm:p-6">
        {runs.map((run, ri) => {
          const category = catOf(run.categoryId);
          const color = category?.color ?? UNCATEGORIZED_COLOR;
          const start = run.tracks[0]?.sourcePosition ?? 0;
          const end = run.tracks[run.tracks.length - 1]?.sourcePosition ?? 0;
          const boundaryGaps = ri < runs.length - 1 ? gapsAt(end) : [];

          return (
            <div key={run.key}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="h-4 w-1 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  {category ? category.name : "Unclassified"}
                </h3>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Nº {start + 1}{end !== start ? `–${end + 1}` : ""}
                </span>
              </div>
              <div
                className="flex snap-x snap-mandatory items-stretch gap-5 overflow-x-auto pb-5 pt-2 sm:gap-7"
                tabIndex={0}
                role="list"
                aria-label={`${category ? category.name : "Unclassified"}, tracks ${start + 1} to ${end + 1}`}
              >
                {run.tracks.map((t) => {
                  const pos = t.sourcePosition ?? 0;
                  // Gaps strictly inside the run (boundary gaps render between sections).
                  const showGaps = pos !== end ? gapsAt(pos) : [];
                  return (
                    <React.Fragment key={t.id}>
                      <div role="listitem" aria-label={`${t.title}, track ${pos + 1}`}>
                        <VinylRecordCard
                          track={t}
                          index={pos}
                          width={width}
                          isActive={activeTrackId === t.id}
                          isPlaying={isPlaying}
                          isSelected={selectedTrackId === t.id}
                          flipped={flippedId === t.id}
                          onFlip={() => setFlippedId(flippedId === t.id ? null : t.id)}
                          onSelect={() => onSelect(t)}
                          onPlay={() => onPlay(t)}
                        />
                      </div>
                      {showGaps.length > 0 && (
                        <div className="flex items-center" aria-label={`Comments after track ${pos + 1}`}>
                          {showGaps.map((g) => (
                            <GapCommentBubble key={g.id} gap={g} isOwner={isOwner} trackCount={trackCount} onDeleted={onGapsChanged} />
                          ))}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
              {/* Shelf plank */}
              <div className="relative mt-1 h-3 rounded-sm bg-gradient-to-b from-[#3a2c22] to-[#171009] shadow-[0_-6px_18px_rgba(0,0,0,0.7)]" aria-hidden="true">
                <div className="absolute inset-x-4 top-0 h-px bg-white/20" />
              </div>
              {/* Comments sitting on the boundary between two sections */}
              {boundaryGaps.length > 0 && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <span className="h-px w-16 bg-white/10" aria-hidden="true" />
                  {boundaryGaps.map((g) => (
                    <GapCommentBubble key={g.id} gap={g} isOwner={isOwner} trackCount={trackCount} onDeleted={onGapsChanged} />
                  ))}
                  <span className="h-px w-16 bg-white/10" aria-hidden="true" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {outroGaps.length > 0 && (
        <EdgeGapSection
          kind="outro"
          gaps={outroGaps}
          trackCount={trackCount}
          isOwner={isOwner}
          playlistId=""
          allowCompose={false}
          onDeleted={onGapsChanged}
        />
      )}
    </section>
  );
}
