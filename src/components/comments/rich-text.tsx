"use client";
import React from "react";
import { parseTimeToSeconds } from "@/lib/utils";

/**
 * Rich comment text shared by every thread surface:
 * @user / @track mentions become chips and [m:ss] timecodes become
 * clickable seek badges — including opening notes.
 */
export function renderRichBody(
  text: string,
  onSeekTime: (secs: number) => void
): React.ReactNode[] {
  return text
    .split(/(@[a-zA-Z0-9_-]+|\[\d{1,3}:\d{2}(?::\d{2})?\])/g)
    .map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span
            key={i}
            className="inline-flex items-center rounded bg-brand-500/20 px-1.5 py-0.5 text-xs font-semibold text-brand-320"
          >
            {part}
          </span>
        );
      }
      const tc = part.match(/^\[(\d{1,3}:\d{2}(?::\d{2})?)\]$/);
      if (tc) {
        const secs = parseTimeToSeconds(tc[1]);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSeekTime(secs)}
            className="melo-focus-ring mx-0.5 inline-flex items-center rounded bg-brand-500/15 px-1.5 py-0.5 font-mono text-[11px] text-brand-320 hover:bg-brand-500/25"
            title={`Seek to ${tc[1]}`}
          >
            {tc[1]}
          </button>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
}
