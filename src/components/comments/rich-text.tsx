"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { parseTimeToSeconds } from "@/lib/utils";

const MENTION_CHIP_CLASS =
  "inline-flex items-center rounded bg-brand-500/20 px-1.5 py-0.5 text-xs font-semibold text-brand-320";

/** Cache: username (lowercased) → true (links to a profile) / false (plain chip). */
const mentionUserCache = new Map<string, boolean>();

/**
 * @mention chip: links to /profile/:username when the name belongs to a
 * user, stays a plain chip otherwise (track / playlist mention).
 * Any non-404 response counts as "user exists" (private profiles 403).
 */
function UserMention({ username }: { username: string }) {
  const key = username.toLowerCase();
  const [isUser, setIsUser] = useState<boolean | null>(
    () => mentionUserCache.get(key) ?? null
  );

  useEffect(() => {
    if (mentionUserCache.has(key)) {
      setIsUser(mentionUserCache.get(key) ?? false);
      return;
    }
    let cancelled = false;
    fetch(`/api/users/${encodeURIComponent(key)}`)
      .then((res) => {
        const found = res.status !== 404;
        mentionUserCache.set(key, found);
        if (!cancelled) setIsUser(found);
      })
      .catch(() => {
        if (!cancelled) setIsUser(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (isUser) {
    return (
      <Link
        href={`/profile/${encodeURIComponent(key)}`}
        onClick={(e) => e.stopPropagation()}
        className={`${MENTION_CHIP_CLASS} melo-focus-ring hover:bg-brand-500/30 hover:underline`}
        title={`Open @${username}'s profile`}
      >
        @{username}
      </Link>
    );
  }
  return <span className={MENTION_CHIP_CLASS}>@{username}</span>;
}

/**
 * Rich comment text shared by every thread surface:
 * @user mentions become links to the profile (other @mentions stay plain
 * track/playlist chips), #tags become clickable tag badges (feed filter),
 * and [m:ss] timecodes become clickable seek badges — including opening notes.
 */
export function renderRichBody(
  text: string,
  onSeekTime: (secs: number) => void
): React.ReactNode[] {
  return text
    .split(/(@[a-zA-Z0-9_-]+|#[A-Za-zÀ-ÖØ-öø-ÿ0-9_-]+|\[\d{1,3}:\d{2}(?::\d{2})?\])/g)
    .map((part, i) => {
      if (part.startsWith("@")) {
        return <UserMention key={i} username={part.slice(1)} />;
      }
      if (part.startsWith("#")) {
        const tag = part.slice(1).toLowerCase();
        return (
          <Link
            key={i}
            href={`/tag/${encodeURIComponent(tag)}`}
            onClick={(e) => e.stopPropagation()}
            className="melo-focus-ring mx-px inline-flex items-center rounded bg-brand-500/20 px-1.5 py-0.5 text-xs font-semibold text-brand-320 hover:bg-brand-500/30 hover:underline"
            title={`Everything tagged “${tag}”`}
          >
            {part}
          </Link>
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
