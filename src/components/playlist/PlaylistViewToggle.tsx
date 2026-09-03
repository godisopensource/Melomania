"use client";
import React from "react";
import { LayoutGrid, Disc3 } from "lucide-react";
import { PlaylistViewMode } from "@/types";
import { cn } from "@/lib/utils";

interface PlaylistViewToggleProps {
  mode: PlaylistViewMode;
  onChange: (m: PlaylistViewMode) => void;
}

export function PlaylistViewToggle({ mode, onChange }: PlaylistViewToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Choose the playlist view"
      className="inline-flex rounded-xl border border-border bg-black/50 p-1 shadow-inner"
    >
      {(
        [
          { id: "curator", label: "Emotional map", hint: "Curator", Icon: LayoutGrid },
          { id: "vinyl", label: "Vinyl crate", hint: "Vinyl", Icon: Disc3 },
        ] as const
      ).map(({ id, label, hint, Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={mode === id}
          onClick={() => onChange(id)}
          className={cn(
            "melo-focus-ring inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all",
            mode === id
              ? "bg-brand-500 text-white shadow-[0_2px_16px_rgba(175,53,53,0.45)]"
              : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{hint}</span>
        </button>
      ))}
    </div>
  );
}
