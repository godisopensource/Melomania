"use client";
import React from "react";
import * as Slider from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface CriterionScaleProps {
  title: string;
  minLabel: string;
  maxLabel: string;
  color: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  id?: string;
}

/** Generic manual 0..100 scale with named ends. Tracks without a score default to 50. */
export function CriterionScale({ title, minLabel, maxLabel, color, value, onChange, disabled, id }: CriterionScaleProps) {
  const v = value ?? 50;
  const sliderId = id ?? `criterion-${title}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={sliderId} className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {title} <span className="text-[10px] font-medium normal-case tracking-normal">(manual)</span>
        </label>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold",
            value === null || value === undefined
              ? "bg-white/5 text-muted-foreground"
              : "text-foreground"
          )}
          style={
            value === null || value === undefined
              ? undefined
              : { backgroundColor: `${color}22`, color }
          }
          aria-live="polite"
        >
          {value === null || value === undefined ? "Not rated" : `${value}`}
        </span>
      </div>
      <Slider.Root
        id={sliderId}
        className="relative flex h-6 w-full touch-none select-none items-center"
        value={[v]}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onValueChange={([n]) => onChange(n)}
        aria-label={`${title}, ${minLabel} 0 to ${maxLabel} 100`}
      >
        <Slider.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-white/10">
          <Slider.Range className="absolute h-full" style={{ backgroundColor: `${color}55` }} />
        </Slider.Track>
        <Slider.Thumb
          className="melo-focus-ring block h-5 w-5 rounded-full border-2 bg-[#14100a] disabled:opacity-40"
          style={{ borderColor: color, boxShadow: `0 0 12px ${color}88` }}
          aria-label={`${title} slider`}
        />
      </Slider.Root>
      <div className="flex justify-between text-[10px] font-medium text-muted-foreground" aria-hidden="true">
        <span>{minLabel} · 0</span>
        <span>{maxLabel} · 100</span>
      </div>
    </div>
  );
}
