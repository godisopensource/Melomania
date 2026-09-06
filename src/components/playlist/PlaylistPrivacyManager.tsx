"use client";
// PlaylistPrivacyManager — owner-only privacy + delete control, reused by
// /playlists (card) and /playlists/[id] (detail section).
//
// Privacy model (server: visibility public|private + allowedUserIds):
// - "private" → visibility=private, no guests
// - "shared"  → visibility=private, 1+ guests (allowedUserIds)
// - "public"  → visibility=public (guest list preserved server-side)

import React, { useState } from "react";
import { Lock, Users, Globe, Loader2, X, UserPlus, Trash2 } from "lucide-react";

export type PrivacyMode = "private" | "shared" | "public";

export interface AllowedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

interface PlaylistPrivacyManagerProps {
  shareId: string;
  initialVisibility: "public" | "private";
  initialAllowedUsers: AllowedUser[];
  playlistTitle?: string;
  onChanged?: (share: { visibility: string; allowedUserIds?: string[] }) => void;
  onGuestsChanged?: (guests: AllowedUser[]) => void;
  onDeleted?: () => void;
}

export function privacyModeOf(visibility: string, guestCount: number): PrivacyMode {
  if (visibility === "public") return "public";
  return guestCount > 0 ? "shared" : "private";
}

export function PlaylistPrivacyBadge({
  visibility,
  guestCount,
}: {
  visibility: string;
  guestCount: number;
}) {
  const mode = privacyModeOf(visibility, guestCount);
  if (mode === "public") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
        <Globe className="h-3 w-3" aria-hidden="true" />
        Public
      </span>
    );
  }
  if (mode === "shared") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
        <Users className="h-3 w-3" aria-hidden="true" />
        Shared · {guestCount}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      <Lock className="h-3 w-3" aria-hidden="true" />
      Private
    </span>
  );
}

const MODES: { key: PrivacyMode; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    key: "private",
    label: "Private",
    hint: "Only you",
    icon: <Lock className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  {
    key: "shared",
    label: "Shared",
    hint: "Guests you invite",
    icon: <Users className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  {
    key: "public",
    label: "Public",
    hint: "Everyone",
    icon: <Globe className="h-3.5 w-3.5" aria-hidden="true" />,
  },
];

export function PlaylistPrivacyManager({
  shareId,
  initialVisibility,
  initialAllowedUsers,
  playlistTitle,
  onChanged,
  onGuestsChanged,
  onDeleted,
}: PlaylistPrivacyManagerProps) {
  const [visibility, setVisibility] = useState(initialVisibility);
  const [allowedUsers, setAllowedUsers] = useState<AllowedUser[]>(initialAllowedUsers);
  const [inviteInput, setInviteInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const mode = privacyModeOf(visibility, allowedUsers.length);

  const patchShare = async (action: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/shares/${shareId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not update sharing.");
    return data.share;
  };

  const applyShare = (share: any) => {
    if (!share) return;
    setVisibility(share.visibility);
    onChanged?.(share);
  };

  const switchMode = async (next: PrivacyMode) => {
    if (busy || next === mode) return;
    setBusy(`mode:${next}`);
    setError(null);
    try {
      if (next === "public") {
        const share = await patchShare("set_visibility", { visibility: "public" });
        applyShare(share);
      } else if (next === "private") {
        // Pure private: visibility back to private + remove every guest.
        const share = await patchShare("set_visibility", { visibility: "private" });
        for (const g of allowedUsers) {
          try {
            await patchShare("uninvite", { userId: g.id });
          } catch {
            // Keep going — one guest failing must not block the others.
          }
        }
        setAllowedUsers([]);
        applyShare({ ...share, allowedUserIds: [] });
        onGuestsChanged?.([]);
      } else {
        // Shared = private visibility, guest list managed below.
        const share = await patchShare("set_visibility", { visibility: "private" });
        applyShare(share);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleInvite = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = inviteInput.trim().replace(/^@/, "");
    if (!clean || busy) return;
    setBusy("invite");
    setError(null);
    try {
      const share = await patchShare("invite", { username: clean });
      // Refresh the guest row from the server detail (user id + display name).
      const detail = await fetch(`/api/shares/${shareId}`).then((r) => r.json());
      if (detail?.allowedUsers) {
        setAllowedUsers(detail.allowedUsers);
        onGuestsChanged?.(detail.allowedUsers);
      }
      setInviteInput("");
      applyShare(share);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const handleUninvite = async (userId: string) => {
    if (busy) return;
    setBusy(`uninvite:${userId}`);
    setError(null);
    try {
      const share = await patchShare("uninvite", { userId });
      setAllowedUsers((prev) => {
        const next = prev.filter((u) => u.id !== userId);
        onGuestsChanged?.(next);
        return next;
      });
      applyShare(share);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/shares/${shareId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete.");
      onDeleted?.();
    } catch (e: any) {
      setError(e.message);
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Playlist privacy">
        {MODES.map((m) => {
          const active = mode === m.key;
          const loading = busy === `mode:${m.key}`;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!!busy}
              onClick={() => switchMode(m.key)}
              className={`melo-focus-ring flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-center transition-colors disabled:opacity-50 ${
                active
                  ? "border-brand-500/60 bg-brand-500/10 text-foreground"
                  : "border-border bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground"
              }`}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                m.icon
              )}
              <span className="text-[11px] font-bold">{m.label}</span>
              <span className="text-[9px] leading-tight opacity-70">{m.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Guest management (shared mode, or private-with-guests legacy) */}
      {(mode === "shared" || (mode === "private" && allowedUsers.length > 0)) && (
        <div className="space-y-2 rounded-xl border border-border bg-black/30 p-2.5">
          <form onSubmit={handleInvite} className="flex gap-1.5">
            <input
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="Invite @username…"
              maxLength={30}
              aria-label="Invite a user by username"
              className="melo-focus-ring min-w-0 flex-1 rounded-lg border border-border bg-black/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={busy === "invite" || !inviteInput.trim()}
              className="melo-focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-white/20 disabled:opacity-40"
            >
              {busy === "invite" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Invite
            </button>
          </form>
          {allowedUsers.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No guests yet — invite someone above to share privately.
            </p>
          ) : (
            <ul className="space-y-1">
              {allowedUsers.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {u.avatarUrl ? (
                    <img src={u.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-muted-foreground">
                      {(u.displayName || u.username || "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
                    {u.displayName}
                    <span className="ml-1 font-normal text-muted-foreground">@{u.username}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUninvite(u.id)}
                    disabled={busy === `uninvite:${u.id}`}
                    className="melo-focus-ring rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                    aria-label={`Remove @${u.username}`}
                    title={`Remove @${u.username}`}
                  >
                    {busy === `uninvite:${u.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-[11px] font-semibold text-destructive">
          {error}
        </p>
      )}

      {/* Delete */}
      <div className="border-t border-border/60 pt-2.5">
        {!confirmingDelete ? (
          <button
            type="button"
            onClick={handleDelete}
            className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[11px] font-bold text-destructive hover:bg-destructive/15"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete playlist
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="w-full text-[11px] text-muted-foreground">
              Delete {playlistTitle ? <strong>“{playlistTitle}”</strong> : "this playlist"}? The
              share and its discussion are removed. This cannot be undone.
            </p>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="melo-focus-ring inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-[11px] font-bold text-white hover:brightness-110 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="melo-focus-ring rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
