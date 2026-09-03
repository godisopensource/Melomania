"use client";
import React from "react";
import { PlaylistCategory } from "@/types";

interface CategoryHeaderProps {
  category: PlaylistCategory;
  count: number;
  index: number;
}

export function CategoryHeader({ category, count, index }: CategoryHeaderProps) {
  return (
    <header className="space-y-1.5 border-b-2 pb-3" style={{ borderColor: `${category.color}55` }}>
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md font-mono text-[11px] font-bold text-black"
          style={{ backgroundColor: category.color }}
          aria-hidden="true"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="font-display text-lg font-bold leading-tight tracking-tight text-foreground">
          {category.name}
        </h3>
      </div>
      {category.description && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{category.description}</p>
      )}
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {count} track{count > 1 ? "s" : ""}
      </p>
    </header>
  );
}
