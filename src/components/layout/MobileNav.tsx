"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { Flame, PlusCircle, ListMusic, Link2, User } from "lucide-react";

export function MobileNav() {
  const pathname = usePathname();
  const { user, openAuthModal } = useAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-border bg-background/95 backdrop-blur-md px-2 lg:hidden">
      <Link
        href="/"
        className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
          pathname === "/" ? "text-brand-410" : "text-muted-foreground"
        }`}
      >
        <Flame className="h-4 w-4" />
        <span>Feed</span>
      </Link>

      <Link
        href="/playlists"
        className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
          pathname === "/playlists" ? "text-brand-410" : "text-muted-foreground"
        }`}
      >
        <ListMusic className="h-4 w-4" />
        <span>Playlists</span>
      </Link>

      <Link
        href="/share"
        className="flex -translate-y-2 flex-col items-center gap-1 text-[11px] font-medium text-white"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 shadow-md ring-4 ring-background">
          <PlusCircle className="h-5 w-5" />
        </div>
        <span className="text-foreground">Share</span>
      </Link>

      <Link
        href="/settings/services"
        className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
          pathname.includes("/settings") ? "text-brand-410" : "text-muted-foreground"
        }`}
      >
        <Link2 className="h-4 w-4" />
        <span>Services</span>
      </Link>

      {user ? (
        <Link
          href={`/profile/${user.username}`}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            pathname.includes("/profile") ? "text-brand-410" : "text-muted-foreground"
          }`}
        >
          <img src={user.avatarUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
          <span>Profile</span>
        </Link>
      ) : (
        <button
          onClick={() => openAuthModal("login")}
          className="flex flex-col items-center gap-1 text-[11px] font-medium text-muted-foreground"
        >
          <User className="h-4 w-4" />
          <span>Account</span>
        </button>
      )}
    </nav>
  );
}
