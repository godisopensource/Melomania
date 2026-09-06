"use client";
import React, { useState } from "react";
import { Disc3, Hash, Tag as TagIcon, Clock3, ListMusic, Clapperboard, X, Mic } from "lucide-react";
import { MusicResource, PlaylistCategory, EmotionalCriterion } from "@/types";
import { formatTime } from "@/lib/utils";
import { moodLabel, softnessLabel } from "@/lib/curves";
import { usePlayer } from "../providers/PlayerProvider";
import { YouTubeVideo } from "../player/YouTubeVideo";
import { YouTubeControls } from "../player/YouTubeControls";
import { TrackNoteThread } from "./TrackNoteThread";
import { SyncedLyrics } from "./SyncedLyrics";
import { TrackCover } from "./TrackCover";

interface ActiveTrackPanelProps {
  track: MusicResource | null;
  playlistId?: string;
  categories?: PlaylistCategory[];
  criteria?: EmotionalCriterion[];
}

/**
 * Now Playing: one merged card (cover or clip on top, identity,
 * centered player below), then the track's editorial thread.
 * Opening the clip swaps the cover art for the video; closing it
 * returns to the cover while the audio keeps playing.
 */
export function ActiveTrackPanel({ track, playlistId, categories, criteria = [] }: ActiveTrackPanelProps) {
  const { currentTrack: playing, currentTime, duration, playTrack } = usePlayer();
  const [videoOpen, setVideoOpen] = useState(false);
  // Open by default so the "Loading lyrics…" state is visible right away.
  // (The fetch itself was previously blocked by the CSP: lrclib.net was
  // missing from connect-src — fixed in next.config.ts.)
  const [lyricsOpen, setLyricsOpen] = useState(true);

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center" role="status">
        <Disc3 className="mb-2 h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm font-bold text-foreground">Nothing playing</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Hover a cover (desktop) or tap one (mobile) to explore, then hit play.
        </p>
      </div>
    );
  }

  const category = categories?.find((c) => c.id === track.categoryId);

  const openClip = () => {
    setVideoOpen(true);
    setLyricsOpen(false);
    if (!playing || playing.id !== track.id) {
      playTrack(track);
    }
  };

  return (
    <div className="space-y-4" aria-label={`Now playing: ${track.title}`}>
      <div className="overflow-hidden rounded-2xl border border-border bg-black/50">
        {/* Media: cover art, or the clip when opened. The clip box never
            exceeds the card width — the YouTube embed fills 100% x 100%. */}
        <div className="relative w-full max-w-full overflow-hidden bg-white/5">
          <div
            className={videoOpen ? "w-full max-w-full" : "h-0 w-full overflow-hidden opacity-0"}
            aria-hidden={!videoOpen}
          >
            <YouTubeVideo showHeader={false} className="w-full max-w-full" />
          </div>
          {!videoOpen && (
            <div className="relative aspect-square w-full">
              {track.coverImageUrl ? (
                <TrackCover
                  src={track.coverImageUrl}
                  alt={`Cover art for ${track.title}`}
                  eager
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-4xl text-muted-foreground">
                  {track.title.slice(0, 2).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={openClip}
                className="melo-focus-ring absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11px] font-bold text-white backdrop-blur-sm hover:bg-brand-500"
              >
                <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
                Watch clip
              </button>
              <button
                type="button"
                onClick={() => setLyricsOpen(!lyricsOpen)}
                aria-expanded={lyricsOpen}
                aria-label={lyricsOpen ? "Hide lyrics" : "Show lyrics"}
                title={lyricsOpen ? "Hide lyrics" : "Show lyrics"}
                className="melo-focus-ring absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11px] font-bold text-white backdrop-blur-sm hover:bg-brand-500"
              >
                <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                {lyricsOpen ? "Hide lyrics" : "Lyrics"}
              </button>
              {lyricsOpen && (
                <div
                  className="absolute inset-0 z-10 isolate overflow-hidden rounded-2xl bg-black/60 backdrop-blur-md"
                  role="dialog"
                  aria-label={`Lyrics overlay for ${track.title}`}
                >
                  <div className="flex h-full flex-col p-3">
                    <div className="mb-1 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setLyricsOpen(false)}
                        aria-label="Close lyrics"
                        className="melo-focus-ring rounded-lg bg-black/60 p-1.5 text-white hover:bg-white/20"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="min-h-0 flex-1">
                      <SyncedLyrics
                        key={`${track.artistName}::${track.title}`}
                        overlay
                        artist={track.artistName}
                        title={track.title}
                        album={track.albumName}
                        durationSeconds={track.durationSeconds}
                      />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-white/50">Lyrics via LRCLIB</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 font-mono text-[11px] font-bold text-white">
            <Hash className="h-3 w-3" aria-hidden="true" />
            {(track.sourcePosition ?? 0) + 1}
          </span>
          {videoOpen && (
            <button
              type="button"
              onClick={() => setVideoOpen(false)}
              aria-label="Back to cover art (audio keeps playing)"
              className="melo-focus-ring absolute right-3 top-3 rounded-lg bg-black/70 p-1.5 text-white backdrop-blur-sm hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Identity */}
        <div className="space-y-1 p-4 pb-2">
          <h3 className="font-display text-xl font-bold leading-tight text-foreground">{track.title}</h3>
          <p className="text-sm text-muted-foreground">{track.artistName}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
            {track.albumName && (
              <span className="inline-flex items-center gap-1">
                <ListMusic className="h-3 w-3" aria-hidden="true" />
                {track.albumName}
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-mono">
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              {formatTime(currentTime)} / {formatTime(track.durationSeconds || duration)}
            </span>
            {category && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-semibold text-foreground"
                style={{ borderColor: `${category.color}66`, backgroundColor: `${category.color}14` }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} aria-hidden="true" />
                {category.name}
              </span>
            )}
          </div>
          {/* Manual scores: bare numbers in their metric colors, one line */}
          <div
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-2 font-mono text-lg font-bold"
            aria-label={`Scores: mood ${track.moodScore ?? "unrated"}, softness ${track.softnessScore ?? "unrated"}${criteria.map((c) => `, ${c.name} ${track.customScores?.[c.id] ?? "unrated"}`).join("")}`}
          >
            <span style={{ color: "#e8b34b" }} title={`Mood: ${track.moodScore ?? "—"} · ${moodLabel(track.moodScore ?? null)}`}>
              {track.moodScore ?? "—"}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground" aria-hidden="true">/</span>
            <span style={{ color: "#5ec4b6" }} title={`Softness: ${track.softnessScore ?? "—"} · ${softnessLabel(track.softnessScore ?? null)}`}>
              {track.softnessScore ?? "—"}
            </span>
            {criteria.map((c) => {
              const v = track.customScores?.[c.id] ?? null;
              return (
                <span key={c.id} className="inline-flex items-baseline gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground" aria-hidden="true">/</span>
                  <span style={{ color: c.color }} title={`${c.name}: ${v ?? "—"} · ${v === null ? "Not rated" : v <= 50 ? c.minLabel : c.maxLabel}`}>
                    {v ?? "—"}
                  </span>
                </span>
              );
            })}
          </div>
          {(track.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Track tags">
              {(track.tags ?? []).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <TagIcon className="h-3 w-3" aria-hidden="true" />
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Centered player */}
        <div className="border-t border-border/60 px-4 py-3">
          <YouTubeControls centered />
        </div>
      </div>

      {/* This track's editorial thread */}
      <div className="rounded-2xl border border-border bg-card/40 p-3">
        <TrackNoteThread track={track} />
      </div>
    </div>
  );
}
