"use client";

import React, { useState, useEffect, useRef } from "react";
import { User, MusicResource } from "@/types";
import { User as UserIcon, Music, Disc, ListMusic } from "lucide-react";

interface MentionInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
}

export function MentionInput({
  value,
  onChange,
  placeholder = "Write a note... Type @ to mention a user or a track",
  className = "",
  onKeyDown,
  autoFocus = false,
}: MentionInputProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [tracks, setTracks] = useState<MusicResource[]>([]);
  const [playlists, setPlaylists] = useState<MusicResource[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!showMenu) return;

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
  }, [mentionQuery, showMenu]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    onChange(text);

    const cursor = e.target.selectionStart;
    const textBeforeCursor = text.slice(0, cursor);
    const lastAtPos = textBeforeCursor.lastIndexOf("@");

    if (lastAtPos !== -1) {
      const query = textBeforeCursor.slice(lastAtPos + 1);
      if (!query.includes(" ") && query.length < 20) {
        setMentionQuery(query);
        setShowMenu(true);
        setSelectedIndex(0);
        return;
      }
    }

    setShowMenu(false);
  };

  const handleSelectMention = (item: { label: string; value: string; type: "user" | "track" | "playlist" }) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);
    const textAfterCursor = value.slice(cursor);
    const lastAtPos = textBeforeCursor.lastIndexOf("@");

    if (lastAtPos !== -1) {
      const replacement = `@${item.value} `;
      const newText = textBeforeCursor.slice(0, lastAtPos) + replacement + textAfterCursor;
      onChange(newText);
      setShowMenu(false);

      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = lastAtPos + replacement.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 50);
    }
  };

  const allOptions = [
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
        className={`w-full resize-none rounded-xl border border-border bg-black/40 p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${className}`}
        rows={3}
      />

      {showMenu && allOptions.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-72 max-h-60 overflow-y-auto rounded-xl border border-border bg-popover/95 p-1.5 shadow-xl backdrop-blur-md z-50 animate-in fade-in">
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
            Mentions (@)
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
                {opt.avatar ? (
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
