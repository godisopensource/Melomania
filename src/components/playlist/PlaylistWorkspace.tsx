"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertTriangle,
  Plus,
  X,
  Play,
  ListMusic,
  Inbox,
  ChevronUp,
  Lock,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Settings2,
} from "lucide-react";
import { GapComment, MusicResource, PlaylistCategory, PlaylistViewMode, EmotionalCriterion } from "@/types";
import { usePlayer } from "../providers/PlayerProvider";
import { YouTubePlayer } from "../player/YouTubePlayer";
import { PlaylistViewToggle } from "./PlaylistViewToggle";
import {
  PlaylistPrivacyManager,
  PlaylistPrivacyBadge,
  AllowedUser,
} from "./PlaylistPrivacyManager";
import { CurveLegend, CurveLegendItem } from "./CurveLegend";
import { EditorialCurveLayer } from "./EditorialCurveLayer";
import { CuratorFlow } from "./CuratorFlow";
import { VinylShelf } from "./VinylShelf";
import { ActiveTrackPanel } from "./ActiveTrackPanel";
import { TrackMetadataEditor } from "./TrackMetadataEditor";
import { TrackNoteThread } from "./TrackNoteThread";
import { formatTime } from "@/lib/utils";

interface PlaylistWorkspaceProps {
  playlistId: string;
}

// Emotional map zoom levels (width multipliers), shared by curator + vinyl bands.
const MAP_ZOOMS = [1, 1.5, 2, 3, 4];

export function PlaylistWorkspace({ playlistId }: PlaylistWorkspaceProps) {
  const router = useRouter();
  const { currentTrack, isPlaying, playQueue, pause, resume } = usePlayer();
  const [mode, setMode] = useState<PlaylistViewMode>("curator");
  const [playlist, setPlaylist] = useState<MusicResource | null>(null);
  const [categories, setCategories] = useState<PlaylistCategory[]>([]);
  const [criteria, setCriteria] = useState<EmotionalCriterion[]>([]);
  const [tracks, setTracks] = useState<MusicResource[]>([]);
  const [gapComments, setGapComments] = useState<GapComment[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [share, setShare] = useState<{ id: string; visibility: "public" | "private"; allowedUserIds: string[] } | null>(null);
  const [shareGuests, setShareGuests] = useState<AllowedUser[]>([]);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [visibleCurves, setVisibleCurves] = useState<Record<string, boolean>>({
    mood: true,
    softness: true,
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

  const [newCat, setNewCat] = useState("");
  const [creatingCat, setCreatingCat] = useState(false);
  const [showCritForm, setShowCritForm] = useState(false);
  const [critName, setCritName] = useState("");
  const [critMin, setCritMin] = useState("");
  const [critMax, setCritMax] = useState("");
  const [creatingCrit, setCreatingCrit] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ kind: "ok" | "info" | "error"; text: string } | null>(null);

  // Emotional map zoom: multiplies the band width, the band scrolls past 100%.
  const [mapZoomIdx, setMapZoomIdx] = useState(0);

  // Desktop shows the side panel; mobile/tablet use a 1px audio host + sheets.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const fetchAll = useCallback(
    async (quiet = false) => {
      if (!quiet) {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetch(`/api/playlists/${playlistId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Playlist not found.");
        setPlaylist(data.playlist);
        setCategories(data.categories || []);
        setCriteria(data.criteria || []);
        setTracks(data.tracks || []);
        setGapComments(data.gapComments || []);
        setIsOwner(!!data.isOwner);
        setShare(data.share ?? null);
        setShareGuests(data.allowedUsers || []);
        // New curves default to visible; keep existing toggles.
        setVisibleCurves((prev) => {
          const next = { ...prev };
          for (const c of data.criteria || []) {
            if (!(c.id in next)) next[c.id] = true;
          }
          return next;
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [playlistId]
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Vinyl is the only view for visitors; the curator view belongs to the creator.
  useEffect(() => {
    if (!loading && !isOwner) setMode("vinyl");
  }, [loading, isOwner]);

  const orderedTracks = useMemo(
    () => [...tracks].sort((a, b) => (a.sourcePosition ?? 0) - (b.sourcePosition ?? 0)),
    [tracks]
  );

  const selected = useMemo(
    () => tracks.find((t) => t.id === selectedId) ?? null,
    [tracks, selectedId]
  );
  const activeId = currentTrack?.id ?? null;
  const panelTrack = selected ?? tracks.find((t) => t.id === activeId) ?? currentTrack;

  // Follow playlist playback in the side panel, unless the user pinned another track.
  const lastActiveRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeId && activeId !== lastActiveRef.current) {
      if (!selectedId || selectedId === lastActiveRef.current) setSelectedId(activeId);
      lastActiveRef.current = activeId;
    }
  }, [activeId, selectedId]);

  const moodCount = tracks.filter((t) => t.moodScore !== null && t.moodScore !== undefined).length;
  const softCount = tracks.filter((t) => t.softnessScore !== null && t.softnessScore !== undefined).length;

  const legendItems: CurveLegendItem[] = useMemo(
    () => [
      { key: "mood", label: "Mood", color: "#e8b34b", count: moodCount, visible: visibleCurves.mood !== false },
      { key: "softness", label: "Softness / harshness", color: "#5ec4b6", count: softCount, visible: visibleCurves.softness !== false },
      ...criteria.map((c) => ({
        key: c.id,
        label: c.name,
        color: c.color,
        count: tracks.filter((t) => t.customScores?.[c.id] !== null && t.customScores?.[c.id] !== undefined).length,
        visible: visibleCurves[c.id] !== false,
      })),
    ],
    [criteria, moodCount, softCount, tracks, visibleCurves]
  );

  const toggleCurve = (key: string) =>
    setVisibleCurves((prev) => ({ ...prev, [key]: !(prev[key] !== false) }));

  const anyCurveVisible = legendItems.some((i) => i.visible);

  const handlePlay = (t: MusicResource) => {
    if (activeId === t.id && isPlaying) {
      pause();
      return;
    }
    if (activeId === t.id) {
      resume();
      return;
    }
    const idx = orderedTracks.findIndex((x) => x.id === t.id);
    // Queue the whole playlist in original order: playback continues on its own.
    playQueue(orderedTracks, Math.max(0, idx), playlistId);
  };

  const handleSelect = (t: MusicResource) => {
    setSelectedId(t.id);
    // Desktop curator shows the file in the side panel; otherwise open the sheet.
    const isDesktopCurator =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1280px)").matches &&
      mode === "curator" &&
      isOwner;
    if (!isDesktopCurator) setSheetOpen(true);
  };

  const assignTrack = async (trackId: string, categoryId: string | null) => {
    const res = await fetch(`/api/playlists/${playlistId}/tracks/${trackId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not update.");
    await fetchAll(true);
  };

  const deleteCategory = async (categoryId: string) => {
    const res = await fetch(`/api/playlists/${playlistId}/categories/${categoryId}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not delete.");
    await fetchAll(true);
  };

  const createCriterion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!critName.trim() || !critMin.trim() || !critMax.trim() || creatingCrit) return;
    setCreatingCrit(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/criteria`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: critName.trim(), minLabel: critMin.trim(), maxLabel: critMax.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create.");
      setCriteria((prev) => [...prev, data.criterion]);
      setVisibleCurves((prev) => ({ ...prev, [data.criterion.id]: true }));
      setCritName("");
      setCritMin("");
      setCritMax("");
      setShowCritForm(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreatingCrit(false);
    }
  };

  const deleteCriterion = async (criterionId: string) => {
    if (!confirm("Delete this criterion and all its scores?")) return;
    try {
      const res = await fetch(`/api/playlists/${playlistId}/criteria/${criterionId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete.");
      setCriteria((prev) => prev.filter((c) => c.id !== criterionId));
      await fetchAll(true);
    } catch (e: any) {
      setError(e.message);
    }
  };
  // Non-destructive resync from YouTube Music: new tracks are appended,
  // existing curation (scores, categories, notes) is never touched.
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed.");
      await fetchAll(true);
      const parts: string[] = [];
      if (data.addedCount > 0)
        parts.push(`+${data.addedCount} new track${data.addedCount > 1 ? "s" : ""} added`);
      if (data.reorderApplied)
        parts.push("order updated to match YouTube");
      if (Array.isArray(data.reorderSkipped) && data.reorderSkipped.length > 0) {
        const names = data.reorderSkipped
          .map((s: any) => `“${s.categoryName}” (${s.trackTitles.join(", ")})`)
          .join("; ");
        parts.push(
          `YouTube order changed but NOT applied — it would split categor${data.reorderSkipped.length > 1 ? "ies" : "y"} ${names}. Fix the categories, then sync again.`
        );
      }
      if (data.updatedCount > 0)
        parts.push(`${data.updatedCount} metadata refresh${data.updatedCount > 1 ? "es" : ""}`);
      if (data.removedFromSourceCount > 0)
        parts.push(
          `${data.removedFromSourceCount} no longer on YouTube (kept, nothing deleted)`
        );
      const blocked = Array.isArray(data.reorderSkipped) && data.reorderSkipped.length > 0;
      setSyncMsg({
        kind: blocked ? "error" : data.addedCount > 0 || data.reorderApplied ? "ok" : "info",
        text:
          parts.length > 0
            ? parts.join(" · ")
            : "Already up to date — nothing new on YouTube.",
      });
    } catch (e: any) {
      setSyncMsg({ kind: "error", text: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const createCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newCat.trim() || creatingCat) return;
    setCreatingCat(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCat.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create.");
      setCategories((prev) => [...prev, data.category]);
      setNewCat("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreatingCat(false);
    }
  };

  const renderCurveBand = (compact: boolean) => (
    <div className="melo-paper-line overflow-hidden rounded-2xl border border-border bg-black/60">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Emotional map ·{" "}
          {legendItems
            .filter((i) => i.visible)
            .map((i, idx) => (
              <span key={i.key}>
                {idx > 0 && " · "}
                <span style={{ color: i.color }}>{i.label.toLowerCase()}</span>
              </span>
            ))}
        </p>
        <div className="flex items-center gap-3">
          <p className="hidden font-mono text-[10px] text-muted-foreground sm:block">original order Nº</p>
          <div className="flex items-center gap-1.5" role="group" aria-label="Emotional map zoom">
            <button
              type="button"
              onClick={() => setMapZoomIdx((i) => Math.max(0, i - 1))}
              disabled={mapZoomIdx === 0}
              className="melo-focus-ring rounded-lg border border-border bg-white/5 p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Zoom out of the emotional map"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <input
              type="range"
              min={0}
              max={MAP_ZOOMS.length - 1}
              step={1}
              value={mapZoomIdx}
              onChange={(e) => setMapZoomIdx(Number(e.target.value))}
              aria-label={`Emotional map zoom, ${Math.round(MAP_ZOOMS[mapZoomIdx] * 100)} percent`}
              className="melo-range w-20 sm:w-24"
            />
            <button
              type="button"
              onClick={() => setMapZoomIdx((i) => Math.min(MAP_ZOOMS.length - 1, i + 1))}
              disabled={mapZoomIdx === MAP_ZOOMS.length - 1}
              className="melo-focus-ring rounded-lg border border-border bg-white/5 p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Zoom in on the emotional map"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <span className="w-10 text-right font-mono text-[10px] text-muted-foreground" aria-hidden="true">
              {Math.round(MAP_ZOOMS[mapZoomIdx] * 100)}%
            </span>
          </div>
        </div>
      </div>
      <div className="relative h-[150px] px-2 pb-1">
        {anyCurveVisible ? (
          <EditorialCurveLayer
            tracks={orderedTracks}
            categories={categories}
            criteria={criteria}
            visible={visibleCurves}
            hoveredTrackId={hoveredId}
            selectedTrackId={selectedId}
            onPointHover={setHoveredId}
            onPointSelect={(id) => {
              const t = tracks.find((x) => x.id === id);
              if (t) handleSelect(t);
            }}
            compact={compact}
            zoom={MAP_ZOOMS[mapZoomIdx]}
          />
        ) : (
          <p className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            Enable a curve above to see the emotional map.
          </p>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading playlist">
        <div className="h-10 w-64 animate-pulse rounded-xl bg-card" />
        <div className="h-36 w-full animate-pulse rounded-2xl bg-card/60" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-card/60" />
          ))}
        </div>
        <p className="sr-only">Loading playlist…</p>
      </div>
    );
  }

  if (error && !playlist) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/40 bg-destructive/5 p-12 text-center" role="alert">
        <AlertTriangle className="mb-2 h-8 w-8 text-destructive" />
        <h2 className="font-display text-xl font-bold">Could not load this playlist</h2>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => fetchAll()}
          className="melo-focus-ring mt-4 rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-590"
        >
          Retry
        </button>
      </div>
    );
  }

  if (playlist && tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center" role="status">
        <Inbox className="mb-2 h-8 w-8 text-muted-foreground/40" />
        <h2 className="font-display text-xl font-bold">Empty playlist</h2>
        <p className="mt-1 text-sm text-muted-foreground">No tracks imported yet.</p>
      </div>
    );
  }

  return (
    <div className="melo-grain -m-4 min-h-full p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      {/* Editorial header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand-320">
            <span>
              Playlist · {tracks.length} tracks
            </span>
            {share && (
              <PlaylistPrivacyBadge
                visibility={share.visibility}
                guestCount={shareGuests.length}
              />
            )}
          </p>
          <h1 className="font-display mt-1 truncate text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {playlist?.title}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {formatTime(playlist?.durationSeconds)} total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && share && (
            <button
              type="button"
              onClick={() => setShowPrivacy((v) => !v)}
              aria-expanded={showPrivacy}
              title="Change who can see this playlist, invite guests, or delete it"
              className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-2 text-[11px] font-bold text-muted-foreground hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              {showPrivacy ? "Close privacy" : "Privacy"}
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              title="Fetch new tracks and order from YouTube Music without touching your scores, categories or notes"
              className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-2 text-[11px] font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {syncing ? "Syncing…" : "Sync with YouTube"}
            </button>
          )}
          {isOwner ? (
            <PlaylistViewToggle mode={mode} onChange={setMode} />
          ) : (
            <p className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-2 text-[11px] text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Curator view reserved for the playlist creator
            </p>
          )}
        </div>
      </div>

      {isOwner && share && showPrivacy && (
        <section
          aria-label="Playlist privacy and sharing"
          className="max-w-xl rounded-2xl border border-border bg-card/50 p-4"
        >
          <h2 className="mb-1 text-sm font-bold text-foreground">Privacy & sharing</h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Private = only you. Shared = private + guests you invite. Public = everyone.
          </p>
          <PlaylistPrivacyManager
            shareId={share.id}
            initialVisibility={share.visibility}
            initialAllowedUsers={shareGuests}
            playlistTitle={playlist?.title}
            onChanged={(updated) => {
              setShare((prev) =>
                prev
                  ? {
                      ...prev,
                      visibility: updated.visibility as "public" | "private",
                      allowedUserIds: updated.allowedUserIds ?? prev.allowedUserIds,
                    }
                  : prev
              );
              if (updated.allowedUserIds && updated.allowedUserIds.length === 0) {
                setShareGuests([]);
              }
            }}
            onGuestsChanged={(guests) => {
              setShareGuests(guests);
              setShare((prev) =>
                prev ? { ...prev, allowedUserIds: guests.map((g) => g.id) } : prev
              );
            }}
            onDeleted={() => router.push("/playlists")}
          />
        </section>
      )}

      {syncMsg && (
        <p
          role="status"
          className={`rounded-xl border px-3 py-2 text-xs ${
            syncMsg.kind === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : syncMsg.kind === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-border bg-white/5 text-muted-foreground"
          }`}
        >
          {syncMsg.text}
        </p>
      )}

      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {mode === "curator" && isOwner ? (
            <section aria-label="Curator view, emotional map" className="space-y-3">
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card/50 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CurveLegend items={legendItems} onToggle={toggleCurve} />
                  <form onSubmit={createCategory} className="flex gap-1.5">
                    <input
                      value={newCat}
                      onChange={(e) => setNewCat(e.target.value)}
                      placeholder="New category…"
                      maxLength={60}
                      aria-label="New category name"
                      className="melo-focus-ring w-44 rounded-lg border border-border bg-black/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      type="submit"
                      disabled={creatingCat || !newCat.trim()}
                      className="melo-focus-ring inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-white/20 disabled:opacity-40"
                    >
                      {creatingCat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">Category</span>
                    </button>
                  </form>
                </div>
                <div className="flex flex-col gap-2 border-t border-border/60 pt-2">
                  {!showCritForm ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCritForm(true)}
                        className="melo-focus-ring inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:border-white/25 hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        New emotional criterion
                      </button>
                      {criteria.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
                          style={{ borderColor: `${c.color}66`, color: c.color }}
                          title={`${c.minLabel} (0) → ${c.maxLabel} (100)`}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
                          {c.name}
                          <button
                            type="button"
                            onClick={() => deleteCriterion(c.id)}
                            className="melo-focus-ring rounded px-0.5 font-bold opacity-60 hover:text-destructive hover:opacity-100"
                            aria-label={`Delete criterion ${c.name}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <form onSubmit={createCriterion} className="flex flex-col gap-2 rounded-xl bg-black/30 p-2.5 sm:flex-row sm:items-end">
                      <label className="flex-1 space-y-1 text-[11px] font-semibold text-muted-foreground">
                        Criterion name
                        <input
                          value={critName}
                          onChange={(e) => setCritName(e.target.value)}
                          placeholder="e.g. Energy"
                          maxLength={40}
                          className="melo-focus-ring w-full rounded-lg border border-border bg-black/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
                        />
                      </label>
                      <label className="flex-1 space-y-1 text-[11px] font-semibold text-muted-foreground">
                        Low end (0)
                        <input
                          value={critMin}
                          onChange={(e) => setCritMin(e.target.value)}
                          placeholder="e.g. Calm"
                          maxLength={40}
                          className="melo-focus-ring w-full rounded-lg border border-border bg-black/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
                        />
                      </label>
                      <label className="flex-1 space-y-1 text-[11px] font-semibold text-muted-foreground">
                        High end (100)
                        <input
                          value={critMax}
                          onChange={(e) => setCritMax(e.target.value)}
                          placeholder="e.g. Frantic"
                          maxLength={40}
                          className="melo-focus-ring w-full rounded-lg border border-border bg-black/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
                        />
                      </label>
                      <div className="flex gap-1.5">
                        <button
                          type="submit"
                          disabled={creatingCrit || !critName.trim() || !critMin.trim() || !critMax.trim()}
                          className="melo-focus-ring inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-590 disabled:opacity-40"
                        >
                          {creatingCrit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCritForm(false)}
                          className="melo-focus-ring rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>

              {renderCurveBand(false)}

              <CuratorFlow
                tracks={orderedTracks}
                categories={categories}
                gapComments={gapComments}
                isOwner={isOwner}
                playlistId={playlistId}
                activeTrackId={activeId}
                isPlaying={isPlaying}
                selectedTrackId={selectedId}
                hoveredTrackId={hoveredId}
                onSelect={handleSelect}
                onPlay={handlePlay}
                onHover={setHoveredId}
                onAssign={assignTrack}
                onDeleteCategory={deleteCategory}
                onGapsChanged={() => fetchAll(true)}
              />
              <p className="text-[11px] text-muted-foreground">
                On desktop, hover a point or a cover to highlight the track. Categories always group
                consecutive tracks — stretch a block to grow it.
              </p>
            </section>
          ) : (
            <section aria-label="Vinyl crate view" className="space-y-4">
              <div className="flex flex-col gap-2">
                <CurveLegend items={legendItems} onToggle={toggleCurve} />
                {renderCurveBand(true)}
              </div>

              <VinylShelf
                tracks={orderedTracks}
                categories={categories}
                gapComments={gapComments}
                isOwner={isOwner}
                activeTrackId={activeId}
                isPlaying={isPlaying}
                selectedTrackId={selectedId}
                onSelect={handleSelect}
                onPlay={handlePlay}
                onGapsChanged={() => fetchAll(true)}
              />
            </section>
          )}
        </div>

        {/* Desktop side panel: now playing sits right of the crate / curator flow.
            Not mounted on smaller screens (a 1px audio host takes over instead). */}
        {isDesktop && (
          <aside className="hidden min-w-0 xl:block" aria-label="Now playing panel">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-4 overflow-y-auto rounded-2xl border border-border bg-card/30 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Now playing</p>
            <ActiveTrackPanel track={panelTrack as MusicResource | null} categories={categories} criteria={criteria} />
            {mode === "curator" && isOwner && selected && (
              <div className="border-t border-border pt-3">
                <TrackMetadataEditor
                  key={selected.id}
                  track={selected}
                  categories={categories}
                  criteria={criteria}
                  playlistId={playlistId}
                  onSaved={() => fetchAll(true)}
                />
              </div>
            )}
          </div>
          </aside>
        )}

        {/* 1px audio host for smaller screens: owns the single stream when
            no sheet is open (visually hidden but mounted, never display:none). */}
        {!isDesktop && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed bottom-0 left-0 h-px w-px overflow-hidden opacity-0"
          >
            <YouTubePlayer compact />
          </div>
        )}
      </div>

      {/* Persistent mobile mini-player */}
      {(currentTrack || selected) && (
        <div
          onClick={() => setNowPlayingOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setNowPlayingOpen(true);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Open now playing"
          className="melo-focus-ring fixed inset-x-3 bottom-20 z-30 flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-[#141010]/95 p-2.5 text-left shadow-2xl backdrop-blur-md xl:hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={(currentTrack ?? selected)?.coverImageUrl} alt="" className="h-10 w-10 rounded-lg object-cover ring-1 ring-border" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-foreground">{(currentTrack ?? selected)?.title}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{(currentTrack ?? selected)?.artistName}</span>
          </span>
          <button
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={(e) => {
              e.stopPropagation();
              const t = currentTrack ?? selected;
              if (t) handlePlay(t);
            }}
            className="melo-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white"
          >
            {isPlaying ? (
              <span className="flex gap-0.5" aria-hidden="true">
                <span className="h-3 w-0.5 rounded bg-white" />
                <span className="h-3 w-0.5 rounded bg-white" />
              </span>
            ) : (
              <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {/* Mobile / vinyl sheet: track file */}
      <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-[#121010] p-4 pb-10 sm:inset-x-auto sm:right-0 sm:top-0 sm:h-full sm:w-[420px] sm:rounded-none sm:border-l"
            aria-label={selected ? `File for ${selected.title}` : "Track file"}
          >
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-white/20 sm:hidden" aria-hidden="true" />
            <div className="mb-3 flex items-center justify-between">
              <Dialog.Title className="font-display text-lg font-bold text-foreground">
                Track file
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="melo-focus-ring rounded-lg border border-border bg-white/5 p-2 text-muted-foreground hover:text-foreground" aria-label="Close file">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            {selected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selected.coverImageUrl} alt={`Cover art for ${selected.title}`} className="h-16 w-16 rounded-xl object-cover ring-1 ring-border" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{selected.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{selected.artistName}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      #{(selected.sourcePosition ?? 0) + 1} · {formatTime(selected.durationSeconds)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handlePlay(selected)}
                  className="melo-focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-bold text-white hover:bg-brand-590"
                >
                  <Play className="h-4 w-4" />
                  {activeId === selected.id && isPlaying ? "Playing — tap to pause" : "Play this track"}
                </button>
                {mode === "curator" && isOwner && (
                  <TrackMetadataEditor
                    key={selected.id}
                    track={selected}
                    categories={categories}
                    criteria={criteria}
                    playlistId={playlistId}
                    onSaved={() => fetchAll(true)}
                  />
                )}
                <TrackNoteThread track={selected} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Select a track to see its file.</p>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Mobile full now playing sheet */}
      <Dialog.Root open={nowPlayingOpen} onOpenChange={setNowPlayingOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-border bg-[#121010] p-4 pb-12"
            aria-label="Now playing, full view"
          >
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-white/20" aria-hidden="true" />
            <div className="mb-3 flex items-center justify-between">
              <Dialog.Title className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Now playing
              </Dialog.Title>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[11px] text-muted-foreground">
                  <ListMusic className="h-3 w-3" />
                  {tracks.length} tracks
                </span>
                <Dialog.Close asChild>
                  <button type="button" className="melo-focus-ring rounded-lg border border-border bg-white/5 p-2 text-muted-foreground hover:text-foreground" aria-label="Close player">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>
            <ActiveTrackPanel track={(currentTrack ?? selected) as MusicResource | null} categories={categories} criteria={criteria} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
