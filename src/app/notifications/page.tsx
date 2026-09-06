"use client";
// /notifications — full notification feed, reddit-style stack, most recent on top.

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { Notification } from "@/types";
import { formatRelativeDate } from "@/lib/utils";

function notifHref(notif: Notification): string | null {
  const resource = (notif as any).musicResource;
  const resourceId = (notif as any).musicResourceId as string | undefined;
  const looksLikePlaylist =
    resource?.type === "playlist" ||
    resourceId?.startsWith("res_pl_") ||
    notif.message?.includes("Playlist:");
  if (looksLikePlaylist && resourceId) return `/playlists/${resourceId}`;
  // Track notes on a shared playlist open the playlist workspace when the
  // track carries a playlistId (hydrated or raw).
  const playlistId =
    (resource as any)?.playlistId ||
    (notif as any).playlistId ||
    (resource?.type === "track" && (resource as any)?.playlistId
      ? (resource as any).playlistId
      : undefined);
  if (notif.type === "track_comment" && playlistId) return `/playlists/${playlistId}`;
  if (notif.shareId) return `/share/${notif.shareId}`;
  return null;
}

function typeLabel(type: Notification["type"]): string {
  switch (type) {
    case "share_invitation":
      return "share";
    case "share_like":
      return "like";
    case "share_comment":
      return "comment";
    case "track_comment":
      return "track note";
    case "comment_reply":
      return "reply";
    case "user_mention":
      return "mention";
    case "export_completed":
    case "export_warning":
      return "export";
    default:
      return type.replace(/_/g, " ");
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [marking, setMarking] = useState(false);

  const fetchNotifs = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifs();
    const timer = setInterval(fetchNotifs, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleOpen = async (notif: Notification) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notif.id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
    } catch {}
    if (notif.shareId) {
      try {
        const res = await fetch(`/api/shares/${notif.shareId}`);
        if (res.ok) {
          const data = await res.json();
          const resource = data.share?.resource;
          if (resource?.type === "playlist" && resource?.id) {
            router.push(`/playlists/${resource.id}`);
            return;
          }
        }
      } catch {}
    }
    const href = notifHref(notif);
    if (href) router.push(href);
  };

  const handleMarkAllRead = async () => {
    setMarking(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } finally {
      setMarking(false);
    }
  };

  const visible =
    filter === "unread" ? notifications.filter((n) => !n.isRead) : notifications;
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 animate-in fade-in pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-brand-500/15 p-2 text-brand-410">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Notifications
            </h1>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread · most recent first`
                : "You're all caught up · most recent first"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={marking}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5 text-brand-410" />
            Mark all as read
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
              filter === f
                ? "bg-brand-500 text-white"
                : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-border bg-white/5"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-white/[0.02] p-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-semibold text-foreground">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filter === "unread"
              ? "New comments, replies and mentions on your shared playlists will land here."
              : "When someone comments on a playlist you share, you'll be notified here."}
          </p>
          {filter === "unread" && (
            <button
              onClick={() => setFilter("all")}
              className="mt-4 text-xs font-semibold text-brand-410 hover:underline"
            >
              Show all notifications
            </button>
          )}
        </div>
      ) : (
        <ol className="overflow-hidden rounded-xl border border-border bg-white/[0.02] divide-y divide-border">
          {visible.map((notif) => {
            const href = notifHref(notif);
            const actor = (notif as any).actor;
            const resource = (notif as any).musicResource;
            return (
              <li key={notif.id}>
                <button
                  onClick={() => handleOpen(notif)}
                  className={`flex w-full items-start gap-3 p-3.5 text-left transition-colors hover:bg-white/5 ${
                    notif.isRead ? "" : "bg-brand-500/[0.07]"
                  }`}
                >
                  {!notif.isRead && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  )}
                  {notif.isRead && <span className="mt-1.5 h-2 w-2 shrink-0" />}
                  {actor?.avatarUrl ? (
                    <img
                      src={actor.avatarUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border"
                    />
                  ) : resource?.coverImageUrl ? (
                    <img
                      src={resource.coverImageUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-border"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-muted-foreground">
                      <Bell className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {typeLabel(notif.type)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatRelativeDate(notif.createdAt)}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm font-medium leading-snug text-foreground">
                      {notif.message || "New activity"}
                    </span>
                    {resource && (
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {resource.type === "playlist" ? "Playlist" : "Track"}
                        {" · "}
                        {resource.title}
                        {resource.artistName ? ` — ${resource.artistName}` : ""}
                      </span>
                    )}
                  </span>
                  {href && (
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <Link
        href="/"
        className="block text-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        Back to feed
      </Link>
    </div>
  );
}
