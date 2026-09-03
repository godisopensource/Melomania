"use client";
import React from "react";
import * as Slider from "@radix-ui/react-slider";
import { softnessLabel } from "@/lib/curves";
import { cn } from "@/lib/utils";

interface SoftnessScaleProps {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  id?: string;
}

/** Controlled 0..100: 0 very soft, 50 in the middle, 100 very intense/harsh. Manual only. */
export function SoftnessScale({ value, onChange, disabled, id }: SoftnessScaleProps) {
  const v = value ?? 50;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id ?? "softness"} className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Softness / harshness <span className="text-[10px] font-medium normal-case tracking-normal">(manual)</span>
        </label>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold",
            value === null || value === undefined ? "bg-white/5 text-muted-foreground" : "bg-[#5ec4b6]/15 text-[#5ec4b6]"
          )}
          aria-live="polite"
        >
          {value === null || value === undefined ? "Not rated" : `${value} · ${softnessLabel(value)}`}
        </span>
      </div>
      <Slider.Root
        id={id ?? "softness"}
        className="relative flex h-6 w-full touch-none select-none items-center"
        value={[v]}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onValueChange={([n]) => onChange(n)}
        aria-label="Softness score, 0 very soft to 100 harsh"
      >
        <Slider.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-gradient-to-r from-[#bfe6e0] via-[#6b8f8a] to-[#3d2b2b]">
          <Slider.Range className="absolute h-full bg-white/10" />
        </Slider.Track>
        <Slider.Thumb
          className="melo-focus-ring block h-5 w-5 rounded-full border-2 border-[#5ec4b6] bg-[#0a1414] shadow-[0_0_12px_rgba(94,196,182,0.5)] disabled:opacity-40"
          aria-label="Curseur douceur"
        />
      </Slider.Root>
      <div className="flex justify-between text-[10px] font-medium text-muted-foreground" aria-hidden="true">
        <span>Very soft · 0</span>
        <span>In the middle · 50</span>
        <span>Harsh · 100</span>
      </div>
    </div>
  );
}
