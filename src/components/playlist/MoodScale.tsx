"use client";
import React from "react";
import * as Slider from "@radix-ui/react-slider";
import { moodLabel } from "@/lib/curves";
import { cn } from "@/lib/utils";

interface MoodScaleProps {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  id?: string;
}

/** Controlled 0..100 scale: sombre/introspectif → lumineux/euphorique. Manual only. */
export function MoodScale({ value, onChange, disabled, id }: MoodScaleProps) {
  const v = value ?? 50;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id ?? "mood"} className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Mood <span className="text-[10px] font-medium normal-case tracking-normal">(manual)</span>
        </label>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold",
            value === null || value === undefined ? "bg-white/5 text-muted-foreground" : "bg-[#e8b34b]/15 text-[#e8b34b]"
          )}
          aria-live="polite"
        >
          {value === null || value === undefined ? "Not rated" : `${value} · ${moodLabel(value)}`}
        </span>
      </div>
      <Slider.Root
        id={id ?? "mood"}
        className="relative flex h-6 w-full touch-none select-none items-center"
        value={[v]}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onValueChange={([n]) => onChange(n)}
        aria-label="Mood score, 0 dark to 100 euphoric"
      >
        <Slider.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-gradient-to-r from-[#2b2140] via-[#5c4a3a] to-[#e8b34b]">
          <Slider.Range className="absolute h-full bg-white/10" />
        </Slider.Track>
        <Slider.Thumb
          className="melo-focus-ring block h-5 w-5 rounded-full border-2 border-[#e8b34b] bg-[#14100a] shadow-[0_0_12px_rgba(232,179,75,0.5)] disabled:opacity-40"
          aria-label="Curseur humeur"
        />
      </Slider.Root>
      <div className="flex justify-between text-[10px] font-medium text-muted-foreground" aria-hidden="true">
        <span>Dark / introspective · 0</span>
        <span>Bright / euphoric · 100</span>
      </div>
      {(value === null || value === undefined) && (
        <p className="text-[11px] text-muted-foreground">Move the slider to enter a value manually.</p>
      )}
    </div>
  );
}
