"use client";
// src/app/profile/[username]/page.tsx — /profile/:username : public user profile

import React, { useState, useEffect, use, useRef } from "react";
import Link from "next/link";
import { User, MusicShare, Comment } from "@/types";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatTime, formatRelativeDate } from "@/lib/utils";
import {
  Calendar,
  Music,
  ArrowLeft,
  Flame,
  MessageSquareText,
  ListMusic,
  Clock,
  Loader2,
  Pencil,
  Camera,
} from "lucide-react";

interface RecentComment extends Comment {
  context: {
    threadTitle: string;
    shareId: string | null;
    resourceId: string | null;
    resourceTitle: string | null;
    resourceType: string | null;
  } | null;
}

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const { user: sessionUser, refresh } = useAuth();

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [isSelf, setIsSelf] = useState(false);
  const [userShares, setUserShares] = useState<MusicShare[]>([]);
  const [recentComments, setRecentComments] = useState<RecentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setProfileUser(data.user || null);
          setIsSelf(!!data.isSelf);
          setUserShares(data.shares || []);
          setRecentComments(data.recentComments || []);
          if (data.user) {
            setEditDisplayName(data.user.displayName || "");
            setEditBio(data.user.bio || "");
            setEditAvatarUrl(data.user.avatarUrl || "");
          }
          if (!data.user) setNotFound(true);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  const handleAvatarFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSaveError("Please choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setSaveError("Image must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setEditAvatarUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileUser || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(profileUser.username)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editDisplayName.trim(),
          bio: editBio.trim(),
          avatarUrl: editAvatarUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save profile.");
      setProfileUser(data.user);
      setEditing(false);
      await refresh();
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const renderBody = (text: string) =>
    text.split(/(@[a-zA-Z0-9_-]+|\[\d{1,3}:\d{2}(?::\d{2})?\])/g).map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span key={i} className="inline-flex items-center rounded bg-brand-500/20 px-1.5 py-0.5 text-xs font-semibold text-brand-320">
            {part}
          </span>
        );
      }
      const tc = part.match(/^\[(\d{1,3}:\d{2}(?::\d{2})?)\]$/);
      if (tc) {
        return (
          <span key={i} className="mx-0.5 inline-flex items-center rounded bg-brand-500/15 px-1.5 py-0.5 font-mono text-[11px] text-brand-320">
            {tc[1]}
          </span>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });

  const contextHref = (c: RecentComment): string | null => {
    if (!c.context) return null;
    if (c.context.resourceType === "playlist" && c.context.resourceId) {
      return `/playlists/${c.context.resourceId}`;
    }
    if (c.context.shareId) return `/share/${c.context.shareId}`;
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16" role="status" aria-label="Loading profile">
        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
        <span className="text-xs text-muted-foreground">Loading profile…</span>
      </div>
    );
  }

  if (notFound || !profileUser) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <h2 className="text-lg font-bold text-foreground">User not found</h2>
        <Link
          href="/"
          className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white"
        >
          Back to the activity feed
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back</span>
      </Link>

      {/* User Header Profile Card */}
      <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-primary/10 via-card/90 to-black/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profileUser?.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"}
            alt=""
            className="h-24 w-24 rounded-full object-cover ring-4 ring-primary/40 shadow-xl"
          />

          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl font-black text-foreground">{profileUser?.displayName}</h1>
              {isSelf && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/5 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                  Edit profile
                </button>
              )}
            </div>
            <p className="text-xs font-semibold text-primary font-mono">@{profileUser?.username}</p>
            {profileUser?.bio && !editing && (
              <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                {profileUser.bio}
              </p>
            )}

            {isSelf && editing && (
              <form onSubmit={handleSave} className="rounded-2xl border border-border bg-black/40 p-4 space-y-3 text-left">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">Display name</label>
                  <input
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    maxLength={40}
                    className="w-full rounded-lg border border-border bg-black/40 py-2 px-3 text-xs text-foreground focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">Bio (max 300)</label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    maxLength={300}
                    rows={3}
                    placeholder="Tell us about your music taste…"
                    className="w-full rounded-lg border border-border bg-black/40 py-2 px-3 text-xs text-foreground focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">Profile picture</label>
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {editAvatarUrl && <img src={editAvatarUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-border" />}
                    <input
                      value={editAvatarUrl.startsWith("data:") ? "" : editAvatarUrl}
                      onChange={(e) => setEditAvatarUrl(e.target.value)}
                      placeholder="https://…"
                      className="flex-1 rounded-lg border border-border bg-black/40 py-2 px-3 text-xs text-foreground focus:border-brand-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/5 px-2.5 py-2 text-[11px] font-semibold text-foreground hover:bg-white/10"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Upload
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleAvatarFile(e.target.files?.[0])}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">Paste an image URL or upload a file (under 2MB).</p>
                </div>
                {saveError && <p className="text-[11px] text-destructive">{saveError}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-590 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setEditDisplayName(profileUser?.displayName || "");
                      setEditBio(profileUser?.bio || "");
                      setEditAvatarUrl(profileUser?.avatarUrl || "");
                      setSaveError(null);
                    }}
                    className="rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-muted-foreground pt-2">
              <span className="flex items-center gap-1.5">
                <Music className="h-3.5 w-3.5 text-primary" />
                <span className="font-bold text-foreground">{userShares.length}</span> shares
              </span>
              <span className="flex items-center gap-1.5">
                <MessageSquareText className="h-3.5 w-3.5 text-accent" />
                <span className="font-bold text-foreground">{recentComments.length}</span> recent comments
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-accent" />
                Member since {new Date(profileUser?.createdAt || Date.now()).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent comments */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-primary" />
          Latest comments
        </h2>
        {recentComments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-muted-foreground">
            No comments yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentComments.map((c) => {
              const href = contextHref(c);
              const body = (
                <>
                  <p className="text-xs leading-relaxed text-foreground/90">{renderBody(c.body)}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {formatRelativeDate(c.createdAt)}
                    </span>
                    {c.startTimeSeconds !== null && c.startTimeSeconds !== undefined && (
                      <span className="font-mono text-brand-320">@{formatTime(c.startTimeSeconds)}</span>
                    )}
                    {c.context?.resourceTitle && (
                      <span className="truncate">
                        on <span className="font-semibold text-foreground/80">{c.context.resourceTitle}</span>
                      </span>
                    )}
                  </div>
                </>
              );
              return href ? (
                <Link
                  key={c.id}
                  href={href}
                  className="melo-focus-ring block rounded-2xl border border-border bg-card/60 p-4 transition-colors hover:border-white/20"
                >
                  {body}
                </Link>
              ) : (
                <div key={c.id} className="rounded-2xl border border-border bg-card/60 p-4">
                  {body}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* User's Shares Feed */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          {profileUser?.displayName}&apos;s shares ({userShares.length})
        </h2>

        {userShares.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-muted-foreground">
            This user hasn&apos;t shared anything yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {userShares.map((share) => {
              const r = share.resource;
              if (!r) return null;
              const href =
                r.type === "playlist" ? `/playlists/${r.id}` : `/share/${share.id}`;
              return (
                <Link
                  key={share.id}
                  href={href}
                  className="melo-focus-ring flex gap-3 rounded-2xl border border-border bg-card/60 p-3 transition-colors hover:border-white/20"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.coverImageUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-border"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">{r.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{r.artistName}</p>
                    <p className="mt-1 inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {r.type === "playlist" ? (
                        <ListMusic className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Music className="h-3 w-3" aria-hidden="true" />
                      )}
                      {r.type === "playlist"
                        ? `${r.trackCount || r.tracks?.length || 0} tracks`
                        : "Track"}
                      {" · "}
                      {formatRelativeDate(share.createdAt)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
