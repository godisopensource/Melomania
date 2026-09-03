"use client";
import React, { useState } from "react";
import { Loader2, Check, AlertTriangle } from "lucide-react";
import { MusicResource, PlaylistCategory, EmotionalCriterion } from "@/types";
import { MoodScale } from "./MoodScale";
import { SoftnessScale } from "./SoftnessScale";
import { CriterionScale } from "./CriterionScale";
import { TagEditor } from "./TagEditor";

interface TrackMetadataEditorProps {
  track: MusicResource;
  categories: PlaylistCategory[];
  criteria: EmotionalCriterion[];
  playlistId: string;
  onSaved: (t: MusicResource) => void;
}

/** Fully manual editing: primary category, 0..100 scores, tags. Nothing automatic. */
export function TrackMetadataEditor({ track, categories, criteria, playlistId, onSaved }: TrackMetadataEditorProps) {
  const [categoryId, setCategoryId] = useState<string | null>(track.categoryId ?? null);
  const [mood, setMood] = useState<number | null>(track.moodScore ?? null);
  const [soft, setSoft] = useState<number | null>(track.softnessScore ?? null);
  const [custom, setCustom] = useState<Record<string, number | null>>(track.customScores ?? {});
  const [tags, setTags] = useState<string[]>(track.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    (categoryId ?? null) !== (track.categoryId ?? null) ||
    (mood ?? null) !== (track.moodScore ?? null) ||
    (soft ?? null) !== (track.softnessScore ?? null) ||
    JSON.stringify(custom) !== JSON.stringify(track.customScores ?? {}) ||
    JSON.stringify(tags) !== JSON.stringify(track.tags ?? []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks/${track.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, moodScore: mood, softnessScore: soft, customScores: custom, tags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setSaved(true);
      onSaved(data.track);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-4 rounded-2xl border border-border bg-black/40 p-4"
      aria-label={`Metadata for ${track.title}`}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-bold text-foreground">Track card</h4>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Track #{(track.sourcePosition ?? 0) + 1}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`cat-${track.id}`} className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Primary category <span className="font-medium normal-case tracking-normal">(one only, manual)</span>
        </label>
        <select
          id={`cat-${track.id}`}
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value === "" ? null : e.target.value)}
          className="melo-focus-ring w-full rounded-lg border border-border bg-black/50 px-2.5 py-2 text-xs text-foreground disabled:opacity-50"
          disabled={saving}
        >
          <option value="">— Unclassified —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <MoodScale value={mood} onChange={setMood} disabled={saving} id={`mood-${track.id}`} />
      <SoftnessScale value={soft} onChange={setSoft} disabled={saving} id={`soft-${track.id}`} />
      {criteria.map((c) => (
        <CriterionScale
          key={c.id}
          title={c.name}
          minLabel={c.minLabel}
          maxLabel={c.maxLabel}
          color={c.color}
          value={custom[c.id] ?? null}
          onChange={(v) => setCustom((prev) => ({ ...prev, [c.id]: v }))}
          disabled={saving}
          id={`crit-${c.id}-${track.id}`}
        />
      ))}
      <TagEditor tags={tags} onChange={setTags} disabled={saving} />

      {error && (
        <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <span className="text-[11px] text-muted-foreground" aria-live="polite">
          {dirty ? "Unsaved changes." : "Nothing pending."}
        </span>
        <button
          type="submit"
          disabled={saving || !dirty}
          className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-brand-590 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </form>
  );
}
