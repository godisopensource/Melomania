"use client";

import React, { useState, useEffect, useRef } from "react";
import { User, MusicResource } from "@/types";
import { formatTime, parseTimeToSeconds } from "@/lib/utils";
import { User as UserIcon, Music, Disc, ListMusic, Clock, Tag as TagIcon } from "lucide-react";

const formatTimecode = (s: number) => formatTime(s);

interface MentionInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
  maxLength?: number;
  /** TrackNoteThread mode: expose un bouton d'insertion de timecode cliquable. */
  enableTimecodes?: boolean;
  currentTime?: number;
}

export function MentionInput({
  value,
  onChange,
  placeholder = "Write a note... Type @ to mention, # to tag",
  className = "",
  onKeyDown,
  autoFocus = false,
  maxLength,
  enableTimecodes = false,
  currentTime = 0,
}: MentionInputProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [trigger, setTrigger] = useState<"@" | "#" | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [tracks, setTracks] = useState<MusicResource[]>([]);
  const [playlists, setPlaylists] = useState<MusicResource[]>([]);
  const [topTags, setTopTags] = useState<{ tag: string; count: number }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!showMenu || trigger !== "@") return;

    const fetchMatches = async () => {
      try {
        const res = await fetch(`/api/music/search?q=${encodeURIComponent(mentionQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
          setTracks(data.tracks || []);
          setPlaylists(data.playlists || []);
        }
      } catch (err) {
        console.error("Mention search error:", err);
      }
    };

    fetchMatches();
  }, [mentionQuery, showMenu, trigger]);

  // #tags: top tags, filtered client-side (empty query = most used).
  useEffect(() => {
    if (!showMenu || trigger !== "#") return;
    let cancelled = false;
    const fetchTags = async () => {
      try {
        const res = await fetch(`/api/tags?limit=30`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setTopTags(data.tags || []);
        }
      } catch (err) {
        console.error("Tag search error:", err);
      }
    };
    fetchTags();
    return () => {
      cancelled = true;
    };
  }, [showMenu, trigger]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let text = e.target.value;
    let cursor = e.target.selectionStart ?? text.length;

    // Keyboard-first timecodes: typing "@5:50 " (or "@1:02:30 ") instantly
    // becomes the clickable "[5:50]" badge — no menu pick needed.
    const converted = text.replace(
      /(^|\s)@(\d{1,3}:[0-5]\d(?::[0-5]\d)?)(?=\s|$)/g,
      (m, pre: string, tc: string) => {
        const normalized = formatTime(parseTimeToSeconds(tc));
        cursor += `[${normalized}]`.length - `@${tc}`.length;
        return `${pre}[${normalized}]`;
      }
    );
    if (converted !== text) {
      text = converted;
      onChange(text);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(cursor, cursor);
      });
    } else {
      onChange(text);
    }

    const textBeforeCursor = text.slice(0, cursor);
    const lastAtPos = textBeforeCursor.lastIndexOf("@");
    const lastHashPos = textBeforeCursor.lastIndexOf("#");

    // Dual trigger: the closest of @ / # before the cursor wins.
    if (lastAtPos > lastHashPos) {
      const query = textBeforeCursor.slice(lastAtPos + 1);
      if (!query.includes(" ") && !query.includes("#") && query.length < 20) {
        setTrigger("@");
        setMentionQuery(query);
        setShowMenu(true);
        setSelectedIndex(0);
        return;
      }
    } else if (lastHashPos !== -1) {
      const query = textBeforeCursor.slice(lastHashPos + 1);
      if (!query.includes(" ") && !query.includes("@") && !query.includes("[") && query.length < 40) {
        setTrigger("#");
        setTagQuery(query);
        setShowMenu(true);
        setSelectedIndex(0);
        return;
      }
    }

    setShowMenu(false);
    setTrigger(null);
  };

  type MentionItem =
    | { label: string; value: string; type: "user" | "track" | "playlist" | "timecode" }
    | { label: string; value: string; type: "tag" };

  const handleSelectMention = (item: MentionItem) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);
    const textAfterCursor = value.slice(cursor);
    const triggerChar = item.type === "tag" ? "#" : "@";
    const lastPos = textBeforeCursor.lastIndexOf(triggerChar);

    if (lastPos !== -1) {
      // @1:32 inserts a clickable timecode badge [1:32], like the existing feature.
      // #tag inserts a clickable tag badge linking to the feed filter.
      const replacement =
        item.type === "timecode" ? `${item.value} ` : `${triggerChar}${item.value} `;
      const newText = textBeforeCursor.slice(0, lastPos) + replacement + textAfterCursor;
      onChange(newText);
      setShowMenu(false);
      setTrigger(null);

      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = lastPos + replacement.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 50);
    }
  };

  // @1:32 → clickable timecode badge (same rendering as [1:32]).
  const timecodeMatch =
    trigger === "@" ? mentionQuery.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/)
    : null;
  const timecodeOption = timecodeMatch
    ? [
        {
          id: "timecode",
          label: `Seek to ${formatTime(parseTimeToSeconds(mentionQuery))}`,
          sublabel: "Clickable timecode badge",
          value: `[${formatTime(parseTimeToSeconds(mentionQuery))}]`,
          type: "timecode" as const,
          avatar: undefined as string | undefined,
        },
      ]
    : [];

  const mentionOptions = [
    ...timecodeOption,
    ...users.map((u) => ({
      id: u.id,
      label: u.displayName,
      sublabel: `@${u.username}`,
      value: u.username,
      type: "user" as const,
      avatar: u.avatarUrl,
    })),
    ...tracks.map((t) => ({
      id: t.id,
      label: t.title,
      sublabel: t.artistName,
      value: t.title.replace(/\s+/g, "_"),
      type: "track" as const,
      avatar: t.coverImageUrl,
    })),
    ...playlists.map((p) => ({
      id: p.id,
      label: p.title,
      sublabel: "Playlist",
      value: p.title.replace(/\s+/g, "_"),
      type: "playlist" as const,
      avatar: p.coverImageUrl,
    })),
  ];

  // #tag options: filter top tags by query; offer free use when no exact match.
  const qLower = tagQuery.trim().toLowerCase().replace(/^#/, "");
  const matchingTags = topTags.filter((t) =>
    qLower ? t.tag.toLowerCase().includes(qLower) : true
  );
  const hasExactTag = qLower
    ? topTags.some((t) => t.tag.toLowerCase() === qLower)
    : true;
  const tagOptions = [
    ...(qLower && !hasExactTag
      ? [
          {
            id: `new_${qLower}`,
            label: `#${qLower}`,
            sublabel: "Use this tag",
            value: qLower,
            type: "tag" as const,
            avatar: undefined as string | undefined,
            count: undefined as number | undefined,
          },
        ]
      : []),
    ...matchingTags.slice(0, 8).map((t) => ({
      id: t.tag,
      label: `#${t.tag}`,
      sublabel: t.count === 1 ? "1 share" : `${t.count} shares`,
      value: t.tag,
      type: "tag" as const,
      avatar: undefined as string | undefined,
      count: t.count,
    })),
  ];

  const allOptions = trigger === "#" ? tagOptions : mentionOptions;

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMenu && allOptions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % allOptions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + allOptions.length) % allOptions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (allOptions[selectedIndex]) {
          handleSelectMention(allOptions[selectedIndex]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMenu(false);
        return;
      }
    }

    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextChange}
        onKeyDown={handleKeyDownInternal}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={maxLength}
        aria-label={placeholder}
        className={`w-full resize-none rounded-xl border border-border bg-black/40 p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${className}`}
        rows={3}
      />

      {enableTimecodes && (
        <button
          type="button"
          onClick={() => {
            const tag = `[${formatTimecode(currentTime)}] `;
            onChange(value ? `${value}${value.endsWith(" ") ? "" : " "}${tag}` : tag);
            setTimeout(() => textareaRef.current?.focus(), 30);
          }}
          className="melo-focus-ring absolute right-2 top-2 rounded-md border border-border bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-brand-320 hover:bg-white/10"
          title="Insert the current timecode (clickable once posted)"
        >
          +{formatTimecode(currentTime)}
        </button>
      )}

      {showMenu && allOptions.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-72 max-h-60 overflow-y-auto rounded-xl border border-border bg-popover/95 p-1.5 shadow-xl backdrop-blur-md z-50 animate-in fade-in">
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
            {trigger === "#" ? "Tags (#)" : "Mentions (@)"}
          </div>
          <div className="space-y-0.5">
            {allOptions.map((opt, idx) => (
              <button
                key={`${opt.type}_${opt.id}`}
                type="button"
                onClick={() => handleSelectMention(opt)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                  idx === selectedIndex ? "bg-brand-500 text-white" : "hover:bg-white/5 text-foreground"
                }`}
              >
                {opt.type === "timecode" ? (
                  <Clock className="h-4 w-4 shrink-0 text-brand-320" aria-hidden="true" />
                ) : opt.type === "tag" ? (
                  <TagIcon className="h-4 w-4 shrink-0 text-brand-320" aria-hidden="true" />
                ) : opt.avatar ? (
                  <img src={opt.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <Music className="h-4 w-4 text-brand-320" />
                )}
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate font-medium">{opt.label}</span>
                  <span className={`truncate text-[10px] ${idx === selectedIndex ? "text-white/80" : "text-muted-foreground"}`}>
                    {opt.sublabel}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
