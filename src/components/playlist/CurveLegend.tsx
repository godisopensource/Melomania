"use client";
import React from "react";
import { cn } from "@/lib/utils";

export interface CurveLegendItem {
  key: string;
  label: string;
  color: string;
  count: number;
  visible: boolean;
}

interface CurveLegendProps {
  items: CurveLegendItem[];
  onToggle: (key: string) => void;
}

export function CurveLegend({ items, onToggle }: CurveLegendProps) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2" aria-label="Emotional curve legend">
      <legend className="sr-only">Toggle each curve on or off</legend>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onToggle(item.key)}
          aria-pressed={item.visible}
          className={cn(
            "melo-focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-all",
            item.visible
              ? "text-foreground"
              : "border-border bg-white/[0.03] text-muted-foreground opacity-60"
          )}
          style={
            item.visible
              ? { borderColor: `${item.color}88`, backgroundColor: `${item.color}1f`, color: item.color }
              : undefined
          }
        >
          <span
            className="inline-block h-1.5 w-6 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          {item.label}
          <span className="font-mono font-medium opacity-70">{item.count}</span>
        </button>
      ))}
    </fieldset>
  );
}
