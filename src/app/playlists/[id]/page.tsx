// src/app/playlists/[id]/page.tsx — playlist space: Curator / Vinyl + Now Playing
import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PlaylistWorkspace } from "@/components/playlist/PlaylistWorkspace";

export default async function PlaylistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-4 animate-in fade-in">
      <Link
        href="/playlists"
        className="melo-focus-ring inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All playlists
      </Link>
      <PlaylistWorkspace playlistId={id} />
    </div>
  );
}
