"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { usePlayer } from "../providers/PlayerProvider";
import {
  Search,
  Bell,
  PlusCircle,
  User as UserIcon,
  LogOut,
  Settings,
  ShieldAlert,
  Share2,
} from "lucide-react";
import { Notification } from "@/types";

export function Navbar() {
  const router = useRouter();
  const { user, logout, openAuthModal } = useAuth();
  const { reset: resetPlayer } = usePlayer();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ users: any[]; tracks: any[]; playlists: any[] } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchNotifs = async () => {
      try {
        const res = await fetch("/api/notifications");
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      } catch (e) {}
    };
    fetchNotifs();
    const timer = setInterval(fetchNotifs, 30000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/music/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setSearchOpen(true);
        }
      } catch (e) {}
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const notifHref = (notif: Notification): string | null => {
    // Playlists always open in their dedicated workspace — never /share.
    const resource = (notif as any).musicResource;
    const resourceId = (notif as any).musicResourceId as string | undefined;
    const looksLikePlaylist =
      resource?.type === "playlist" ||
      resourceId?.startsWith("res_pl_") ||
      notif.message?.includes("Playlist:");
    if (looksLikePlaylist && resourceId) return `/playlists/${resourceId}`;
    if (notif.shareId) return `/share/${notif.shareId}`;
    return null;
  };

  const handleNotifClick = async (notif: Notification) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notif.id }),
      });
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - (notif.isRead ? 0 : 1)));
    } catch {}
    // Resolve the freshest target: a playlist invitation opens /playlists/:id
    // even if the notification payload wasn't hydrated with the resource type.
    if (notif.shareId) {
      try {
        const res = await fetch(`/api/shares/${notif.shareId}`);
        if (res.ok) {
          const data = await res.json();
          const resource = data.share?.resource;
          if (resource?.type === "playlist" && resource?.id) {
            setNotifOpen(false);
            router.push(`/playlists/${resource.id}`);
            return;
          }
        }
      } catch {}
    }
    const href = notifHref(notif);
    if (href) {
      setNotifOpen(false);
      router.push(href);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (e) {}
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/icon.png"
              alt="Melomania"
              className="h-8 w-8 rounded-lg object-contain transition-transform group-hover:scale-105"
            />
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              Melomania
            </span>
          </Link>
        </div>

        {/* Center: Search */}
        <div className="relative hidden md:block w-80">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search tracks, playlists, users..."
              className="w-full rounded-lg border border-border bg-black/30 py-2 pl-9 pr-3.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all"
            />
          </div>

          {searchOpen && searchResults && (
            <div className="absolute top-full mt-2 w-full max-h-80 overflow-y-auto rounded-xl border border-border bg-popover/95 p-3 shadow-xl backdrop-blur-md z-50 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 mb-1 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground">Results</span>
                <button
                  onClick={() => setSearchOpen(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>

              {searchResults.playlists?.length > 0 && (
                <div className="mb-3">
                  <span className="text-xs font-semibold text-brand-410">Playlists</span>
                  <div className="mt-1 space-y-1">
                    {searchResults.playlists.map((p: any) => (
                      <Link
                        key={p.id}
                        href={`/playlists/${p.id}`}
                        onClick={() => setSearchOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-white/5 text-xs text-foreground"
                      >
                        <img src={p.coverImageUrl} alt="" className="h-7 w-7 rounded object-cover" />
                        <div className="truncate">
                          <p className="font-semibold truncate">{p.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {p.trackCount ?? p.tracks?.length ?? 0} tracks
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.tracks?.length > 0 && (
                <div className="mb-3">
                  <span className="text-xs font-semibold text-brand-410">Tracks</span>
                  <div className="mt-1 space-y-1">
                    {searchResults.tracks.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2.5 rounded-lg p-1.5 text-xs text-foreground"
                      >
                        <img src={t.coverImageUrl} alt="" className="h-7 w-7 rounded object-cover" />
                        <div className="truncate">
                          <p className="font-semibold truncate">{t.title}</p>
                          <p className="text-[11px] text-muted-foreground">{t.artistName}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.users?.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-brand-320">Members</span>
                  <div className="mt-1 space-y-1">
                    {searchResults.users.map((u) => (
                      <Link
                        key={u.id}
                        href={`/profile/${u.username}`}
                        onClick={() => setSearchOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-white/5 text-xs text-foreground"
                      >
                        <img src={u.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                        <div className="truncate">
                          <p className="font-semibold truncate">{u.displayName}</p>
                          <p className="text-[11px] text-muted-foreground">@{u.username}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/share"
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New share</span>
          </Link>

          {user && (
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative rounded-lg border border-border bg-white/5 p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-popover/95 p-3 shadow-xl backdrop-blur-md z-50 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <span className="text-xs font-bold text-foreground">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs font-semibold text-brand-410 hover:underline"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="mt-2 max-h-64 overflow-y-auto space-y-1.5">
                    {notifications.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        No notifications
                      </p>
                    ) : (
                      notifications.slice(0, 8).map((notif) => {
                        const href = notifHref(notif);
                        return (
                          <button
                            key={notif.id}
                            onClick={() => handleNotifClick(notif)}
                            className={`w-full rounded-lg p-2.5 text-left text-xs transition-colors ${
                              notif.isRead ? "bg-white/5" : "bg-brand-500/10 border border-brand-500/20"
                            } ${href ? "hover:bg-white/10 cursor-pointer" : ""}`}
                          >
                            <p className="text-foreground font-medium">{notif.message}</p>
                            <span className="text-[10px] text-muted-foreground mt-1 block">
                              {new Date(notif.createdAt).toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {href ? " · open" : ""}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <Link
                    href="/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="mt-2 block rounded-lg bg-white/5 p-2 text-center text-xs font-semibold text-brand-410 hover:bg-white/10 hover:underline transition-colors"
                  >
                    View all recent notifications
                  </Link>
                </div>
              )}
            </div>
          )}

          {user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg border border-border bg-white/5 p-1 pr-2.5 hover:bg-white/10 transition-colors"
              >
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-md object-cover ring-1 ring-border"
                />
                <span className="hidden sm:inline text-xs font-semibold text-foreground">
                  {user.displayName}
                </span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-popover/95 p-2 shadow-xl backdrop-blur-md z-50 animate-in fade-in space-y-1">
                  <div className="px-2 py-1.5 border-b border-border mb-1">
                    <p className="text-xs font-bold text-foreground truncate">{user.displayName}</p>
                    <p className="text-[11px] text-muted-foreground">@{user.username}</p>
                  </div>

                  <Link
                    href={`/profile/${user.username}`}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg p-2 text-xs text-foreground hover:bg-white/5"
                  >
                    <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>My profile</span>
                  </Link>
                  <Link
                    href="/settings/services"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg p-2 text-xs text-foreground hover:bg-white/5"
                  >
                    <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Connected services</span>
                  </Link>
                  {user.role === "admin" && (
                    <Link
                      href="/admin/moderation"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg p-2 text-xs text-foreground hover:bg-white/5"
                    >
                      <ShieldAlert className="h-3.5 w-3.5 text-brand-410" />
                      <span>Moderation</span>
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      logout();
                      resetPlayer();
                      setUserMenuOpen(false);
                      router.push("/");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg p-2 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => openAuthModal("login")}
              className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
