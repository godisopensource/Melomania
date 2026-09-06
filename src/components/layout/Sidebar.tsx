"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import {
  Compass,
  Radio,
  ListMusic,
  PlusCircle,
  Link2,
  ShieldCheck,
  User,
  Flame,
  Music,
  LayoutGrid,
  Disc3,
  Tag as TagIcon,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [topTags, setTopTags] = useState<{ tag: string; count: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/tags?limit=12");
        if (res.ok) {
          const data = await res.json();
          setTopTags(data.tags || []);
        }
      } catch {}
    };
    load();
  }, [pathname]);

  const navItems = [
    { label: "Activity feed", href: "/", icon: Flame },
    { label: "New share", href: "/share", icon: PlusCircle, highlight: true },
    { label: "Playlists & selections", href: "/playlists", icon: ListMusic },
    { label: "Connected services", href: "/settings/services", icon: Link2 },
  ];

  const workspaceViews = [
    { label: "Emotional map", hint: "Curator view · mood & softness curves", href: "/playlists", icon: LayoutGrid },
    { label: "Vinyl crate", hint: "Vinyl view · original order", href: "/playlists", icon: Disc3 },
  ];

  if (user?.role === "admin") {
    navItems.push({ label: "Moderation", href: "/admin/moderation", icon: ShieldCheck });
  }

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col justify-between border-r border-border p-4 lg:flex bg-card/40">
      <div className="space-y-6">
        <div className="space-y-1">
          <span className="px-3 text-xs font-semibold text-muted-foreground">
            Menu
          </span>
          <nav className="mt-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    item.highlight
                      ? "bg-brand-500 text-white shadow hover:bg-brand-590"
                      : isActive
                      ? "bg-white/10 text-brand-320 border border-brand-500/20"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2">
          <span className="px-3 text-xs font-semibold text-muted-foreground">
            Playlist workspace
          </span>
          <div className="space-y-1 px-0">
            {workspaceViews.map((item) => {
              const Icon = item.icon;
              const isActive = pathname?.startsWith("/playlists");
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  title={item.hint}
                  className={`melo-focus-ring flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    isActive
                      ? "bg-white/10 text-brand-320 border border-brand-500/20"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <span className="px-3 text-xs font-semibold text-muted-foreground">
            Popular tags
          </span>
          {topTags.length === 0 ? (
            <p className="px-3 text-[11px] text-muted-foreground/70">
              No tags yet — add some when sharing.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 px-2">
              {topTags.map(({ tag, count }) => (
                <Link
                  key={tag}
                  href={`/tag/${encodeURIComponent(tag)}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-brand-500/40 hover:text-brand-320 transition-colors"
                >
                  <TagIcon className="h-3 w-3" aria-hidden="true" />
                  {tag}
                  <span className="font-mono text-[10px] opacity-70">{count}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {user && (
        <div className="rounded-xl border border-border bg-black/40 p-3">
          <div className="flex items-center gap-2.5">
            <img
              src={user.avatarUrl}
              alt=""
              className="h-8 w-8 rounded-md object-cover ring-1 ring-border"
            />
            <div className="truncate">
              <p className="text-xs font-bold text-foreground truncate">{user.displayName}</p>
              <p className="text-[11px] text-brand-320">@{user.username}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
