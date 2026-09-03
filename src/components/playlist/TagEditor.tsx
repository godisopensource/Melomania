"use client";
import React, { useState } from "react";
import { X, Plus, Tag as TagIcon } from "lucide-react";

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

/** Manual tag creation/selection only — no automatic tagging. */
export function TagEditor({ tags, onChange, disabled }: TagEditorProps) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const t = raw.trim().slice(0, 40);
    if (!t || tags.includes(t) || tags.length >= 20) return;
    onChange([...tags, t]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        Tags <span className="font-medium normal-case tracking-normal">(added manually)</span>
      </span>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Tags du morceau">
          {tags.map((t) => (
            <span
              key={t}
              role="listitem"
              className="group inline-flex items-center gap-1 rounded-full border border-border bg-white/5 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-foreground"
            >
              <TagIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              {t}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(tags.filter((x) => x !== t))}
                className="melo-focus-ring rounded-full p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-40"
                aria-label={`Remove tag ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No tags yet. Add them manually below.</p>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder="e.g. nocturnal, brass, 120bpm…"
          maxLength={40}
          className="melo-focus-ring w-full rounded-lg border border-border bg-black/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground disabled:opacity-50"
          aria-label="New tag"
        />
        <button
          type="button"
          disabled={disabled || !draft.trim()}
          onClick={() => add(draft)}
          className="melo-focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-590 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add
        </button>
      </div>
    </div>
  );
}
