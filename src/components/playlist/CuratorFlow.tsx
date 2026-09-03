"use client";
import React, { useMemo, useState } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import { GapComment, MusicResource, PlaylistCategory } from "@/types";
import { TrackCoverCard } from "./TrackCoverCard";
import { CategoryContainer } from "./CategoryContainer";
import { GapCommentBubble } from "./GapCommentBubble";
import { GapCommentComposer } from "./GapCommentComposer";
import { GapStrip } from "./GapStrip";

interface CuratorFlowProps {
  tracks: MusicResource[];
  categories: PlaylistCategory[];
  gapComments: GapComment[];
  isOwner: boolean;
  playlistId: string;
  activeTrackId: string | null;
  isPlaying: boolean;
  selectedTrackId: string | null;
  hoveredTrackId: string | null;
  onSelect: (t: MusicResource) => void;
  onPlay: (t: MusicResource) => void;
  onHover: (id: string | null) => void;
  onAssign: (trackId: string, categoryId: string | null) => Promise<void>;
  onDeleteCategory: (categoryId: string) => Promise<void>;
  onGapsChanged: () => void;
}

const UNCATEGORIZED_COLOR = "#8A8F98";

interface Block {
  key: string;
  categoryId: string | null;
  tracks: MusicResource[];
}

/**
 * Chronological curator flow: one vertical stream in original order.
 * Consecutive tracks sharing a category form a stretchable container;
 * loose tracks gather in an "Unclassified" container with manual assignment.
 * Gap comments slip between tracks.
 */
export function CuratorFlow({
  tracks,
  categories,
  gapComments,
  isOwner,
  playlistId,
  activeTrackId,
  isPlaying,
  selectedTrackId,
  hoveredTrackId,
  onSelect,
  onPlay,
  onHover,
  onAssign,
  onDeleteCategory,
  onGapsChanged,
}: CuratorFlowProps) {
  const [error, setError] = useState<string | null>(null);
  const [composerAt, setComposerAt] = useState<number | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...tracks].sort((a, b) => (a.sourcePosition ?? 0) - (b.sourcePosition ?? 0)),
    [tracks]
  );

  const blocks: Block[] = useMemo(() => {
    const out: Block[] = [];
    let current: Block | null = null;
    for (const t of ordered) {
      const cat = t.categoryId ?? null;
      if (current && current.categoryId === cat) {
        current.tracks.push(t);
      } else {
        current = { key: `${cat ?? "uncat"}-${t.sourcePosition}`, categoryId: cat, tracks: [t] };
        out.push(current);
      }
    }
    return out;
  }, [ordered]);

  const gapsAt = (pos: number) => gapComments.filter((g) => g.afterSourcePosition === pos);
  const catOf = (id: string | null) => categories.find((c) => c.id === id) ?? null;

  const assign = async (trackId: string, categoryId: string | null) => {
    setError(null);
    setAssigning(trackId);
    try {
      await onAssign(trackId, categoryId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAssigning(null);
    }
  };

  const renderGapRow = (pos: number) => {
    const gaps = gapsAt(pos);
    if (gaps.length === 0 && !(isOwner && composerAt === pos)) {
      // Owner-only slim "+" to slip a comment between these tracks.
      if (!isOwner) return null;
      return (
        <div key={`gaprow-${pos}`} className="flex justify-center py-0.5">
          <button
            type="button"
            onClick={() => setComposerAt(pos)}
            title={`Add a comment between tracks ${pos + 1} and ${pos + 2}`}
            aria-label={`Add a comment between tracks ${pos + 1} and ${pos + 2}`}
            className="melo-focus-ring flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground opacity-40 hover:border-[#e8b34b]/60 hover:text-[#e8b34b] hover:opacity-100"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      );
    }
    return (
      <div key={`gaprow-${pos}`} className="flex flex-col items-center gap-2 py-1.5">
        <div className="flex items-center gap-2">
          {gaps.map((g) => (
            <GapCommentBubble key={g.id} gap={g} isOwner={isOwner} onDeleted={onGapsChanged} />
          ))}
          {isOwner && composerAt !== pos && (
            <button
              type="button"
              onClick={() => setComposerAt(pos)}
              title={`Add another comment between tracks ${pos + 1} and ${pos + 2}`}
              aria-label={`Add another comment between tracks ${pos + 1} and ${pos + 2}`}
              className="melo-focus-ring flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground opacity-40 hover:border-[#e8b34b]/60 hover:text-[#e8b34b] hover:opacity-100"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
        {isOwner && composerAt === pos && (
          <GapCommentComposer
            playlistId={playlistId}
            afterSourcePosition={pos}
            onPosted={() => {
              setComposerAt(null);
              onGapsChanged();
            }}
            onCancel={() => setComposerAt(null)}
          />
        )}
      </div>
    );
  };

  // Empty (staged) categories: created but stretched over nothing yet.
  const staged = categories.filter((c) => !ordered.some((t) => t.categoryId === c.id));

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="flex items-start gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          {error}
        </p>
      )}

      {staged.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Staged categories">
          {staged.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 text-xs text-muted-foreground" style={{ borderColor: `${c.color}66` }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
              {c.name} · empty — assign tracks from the flow below
              {isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete the category "${c.name}"?`)) {
                      onDeleteCategory(c.id).catch((e: any) => setError(e.message));
                    }
                  }}
                  className="melo-focus-ring rounded px-1 font-bold hover:text-destructive"
                  aria-label={`Delete category ${c.name}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {blocks.map((block, bi) => {
        const prevTrack = bi > 0 ? blocks[bi - 1].tracks[blocks[bi - 1].tracks.length - 1] : null;
        const isLastBlock = bi === blocks.length - 1;
        const lastPos = block.tracks[block.tracks.length - 1]?.sourcePosition ?? 0;
        const nextTrack = !isLastBlock
          ? ordered.find((t) => (t.sourcePosition ?? 0) === lastPos + 1) ?? null
          : null;
        const firstPos = block.tracks[0]?.sourcePosition ?? 0;
        const innerGaps = gapComments.filter(
          (g) => g.afterSourcePosition >= firstPos && g.afterSourcePosition < lastPos
        );
        const category = catOf(block.categoryId);

        return (
          <React.Fragment key={block.key}>
            {category ? (
              <CategoryContainer
                category={category}
                tracks={block.tracks}
                activeTrackId={activeTrackId}
                isPlaying={isPlaying}
                selectedTrackId={selectedTrackId}
                hoveredTrackId={hoveredTrackId}
                isOwner={isOwner}
                canExtendStart={!!prevTrack}
                canExtendEnd={!isLastBlock}
                prevTrackId={prevTrack?.id ?? null}
                nextTrackId={nextTrack?.id ?? null}
                gaps={innerGaps}
                playlistId={playlistId}
                composerAt={composerAt}
                onComposerAt={setComposerAt}
                onGapsChanged={onGapsChanged}
                onSelect={onSelect}
                onPlay={onPlay}
                onHover={onHover}
                onAssign={assign}
                onDeleteCategory={onDeleteCategory}
              />
            ) : (
              <section aria-label={`Unclassified tracks`} className="rounded-2xl border border-dashed border-border bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-6 w-1.5 rounded-full" style={{ backgroundColor: UNCATEGORIZED_COLOR }} aria-hidden="true" />
                  <h3 className="font-display text-lg font-bold text-foreground">Unclassified</h3>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {block.tracks.length} track{block.tracks.length > 1 ? "s" : ""}
                  </span>
                </div>
                {(innerGaps.length > 0 || (isOwner && block.tracks.length > 1)) && (
                  <div className="mb-2">
                    <GapStrip
                      gaps={innerGaps}
                      isOwner={isOwner}
                      playlistId={playlistId}
                      minPos={firstPos}
                      maxPos={Math.max(firstPos, lastPos - 1)}
                      composerAt={composerAt}
                      onComposerAt={setComposerAt}
                      onPosted={() => {
                        setComposerAt(null);
                        onGapsChanged();
                      }}
                      onDeleted={onGapsChanged}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {block.tracks.map((t) => (
                    <div key={t.id} className="space-y-1.5">
                      <TrackCoverCard
                        track={t}
                        categoryColor={UNCATEGORIZED_COLOR}
                        isActive={activeTrackId === t.id}
                        isPlaying={isPlaying}
                        isHighlighted={hoveredTrackId === t.id || selectedTrackId === t.id}
                        onSelect={() => onSelect(t)}
                        onPlay={() => onPlay(t)}
                        onHover={onHover}
                      />
                      {isOwner && (
                        <select
                          value=""
                          disabled={assigning === t.id}
                          onChange={(e) => {
                            if (e.target.value) assign(t.id, e.target.value);
                            e.target.value = "";
                          }}
                          aria-label={`Assign track ${((t.sourcePosition ?? 0) + 1)} to a category`}
                          className="melo-focus-ring w-full rounded-md border border-border bg-black/50 px-1.5 py-1 text-[11px] text-muted-foreground disabled:opacity-40"
                        >
                          <option value="">{assigning === t.id ? "Assigning…" : "Assign to…"}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!isLastBlock && renderGapRow(lastPos)}
          </React.Fragment>
        );
      })}
    </div>
  );
}
