"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { AuthModal } from "./AuthModal";
import { YouTubePlayer } from "../player/YouTubePlayer";
import { usePlayer } from "../providers/PlayerProvider";
import { Disc } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentTrack } = usePlayer();
  const pathname = usePathname();
  // The playlist space (Curator / Vinyl) owns its Now Playing panel,
  // so it gets the full width without the generic aside.
  const isPlaylistWorkspace = pathname?.startsWith("/playlists/") && pathname !== "/playlists";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-brand-500/30">
      <Navbar />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar />

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-36 lg:pb-8" id="main-content">
          {children}
        </main>

        {!isPlaylistWorkspace && (
          <aside
            className="sticky top-16 hidden h-[calc(100vh-4rem)] w-80 shrink-0 flex-col border-l border-border p-4 xl:flex bg-card/20 overflow-y-auto"
            aria-label="Lecture en cours"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Now playing
                </span>
              </div>

              <YouTubePlayer compact />

              {currentTrack ? (
                <div className="rounded-xl border border-border bg-black/40 p-3.5 space-y-2">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentTrack.coverImageUrl}
                      alt=""
                      className="h-10 w-10 rounded-md object-cover ring-1 ring-border"
                    />
                    <div className="overflow-hidden">
                      <p className="truncate text-xs font-bold text-foreground">
                        {currentTrack.title}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {currentTrack.artistName}
                      </p>
                    </div>
                  </div>

                  {currentTrack.genres && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {currentTrack.genres.map((g) => (
                        <span
                          key={g}
                          className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
                  <Disc className="h-6 w-6 mb-2 text-muted-foreground/40" />
                  <p className="text-xs font-semibold">No track selected</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    Click play on any post to start listening.
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <MobileNav />
      <AuthModal />
    </div>
  );
}
