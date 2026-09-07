"use client";
// src/app/tag/[tag]/page.tsx — /tag/:tag : everything associated with a tag
// (tagged shares, tagged tracks, texts mentioning #tag).

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { MusicShare } from "@/types";
import { ShareCard } from "@/components/music/ShareCard";
import { renderRichBody } from "@/components/comments/rich-text";
import { usePlayerState } from "@/components/providers/PlayerProvider";
import { formatRelativeDate } from "@/lib/utils";
import {
  Tag as TagIcon,
  ArrowLeft,
  MessageSquareText,
  Disc,
  ListMusic,
  CornerDownRight,
} from "lucide-react";

interface TagMention {
  kind: "shareIntro" | "comment" | "trackNote" | "gapComment";
  id: string;
  body: string;
  author?: { username?: string; displayName?: string; avatarUrl?: string } | null;
  createdAt: string;
  href: string;
  contextLabel: string;
}

interface TaggedTrack {
  id: string;
  type: string;
  title: string;
  artistName: string;
  coverImageUrl: string;
  href: string;
  contextLabel: string;
}

const KIND_LABEL: Record<TagMention["kind"], string> = {
  shareIntro: "Share intro",
  comment: "Discussion",
  trackNote: "Track note",
  gapComment: "Playlist note",
};

export default function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag: rawTag } = use(params);
  const tag = decodeURIComponent(rawTag).replace(/^#/, "").toLowerCase();
  const { seekTo } = usePlayerState();

  const [shares, setShares] = useState<MusicShare[]>([]);
  const [mentions, setMentions] = useState<TagMention[]>([]);
  const [tracks, setTracks] = useState<TaggedTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/tags/${encodeURIComponent(tag)}`);
        if (res.ok) {
          const data = await res.json();
          setShares(data.shares || []);
          setMentions(data.mentions || []);
          setTracks(data.tracks || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    if (tag) load();
  }, [tag]);

  const total = shares.length + mentions.length + tracks.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to feed
      </Link>

      <div className="rounded-3xl border border-border bg-card/75 p-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-320">
            <TagIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              #{tag}
            </h1>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Loading…"
                : total === 0
                  ? "Nothing here yet"
                  : `${shares.length} share${shares.length === 1 ? "" : "s"} · ${mentions.length} mention${mentions.length === 1 ? "" : "s"} · ${tracks.length} track${tracks.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 w-full animate-pulse rounded-2xl border border-border bg-card/40"
            />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
          <TagIcon className="h-8 w-8 text-muted-foreground/40 mb-2.5" />
          <h3 className="text-sm font-bold text-foreground">Nothing tagged #{tag} yet</h3>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
            Write #{tag} in any comment, note or intro — or add it as a share tag — and it
            will show up here.
          </p>
        </div>
      ) : (
        <>
          {shares.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-foreground">
                Shares tagged #{tag} ({shares.length})
              </h2>
              {shares.map((share) => (
                <ShareCard
                  key={share.id}
                  share={share}
                  onDeleted={(id) => setShares((prev) => prev.filter((s) => s.id !== id))}
                />
              ))}
            </section>
          )}

          {mentions.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-foreground">
                Mentioning #{tag} ({mentions.length})
              </h2>
              {mentions.map((m) => (
                <article
                  key={`${m.kind}-${m.id}`}
                  className="rounded-2xl border border-border bg-card/75 p-4 backdrop-blur-md"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={m.author?.avatarUrl || "/icon.png"}
                        alt=""
                        className="h-7 w-7 rounded-md object-cover ring-1 ring-border"
                      />
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {m.author?.displayName || "Member"}
                          {m.author?.username && (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              @{m.author.username}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {KIND_LABEL[m.kind]} · {m.contextLabel} ·{" "}
                          {formatRelativeDate(m.createdAt)}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-320">
                      <MessageSquareText className="h-3 w-3" />
                      {KIND_LABEL[m.kind]}
                    </span>
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-foreground/90">
                    {renderRichBody(m.body, seekTo)}
                  </p>
                  <div className="mt-2.5 border-t border-border/50 pt-2">
                    <Link
                      href={m.href}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-brand-320 transition-colors"
                    >
                      <CornerDownRight className="h-3 w-3" />
                      Open in context
                    </Link>
                  </div>
                </article>
              ))}
            </section>
          )}

          {tracks.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-foreground">
                Tracks tagged #{tag} ({tracks.length})
              </h2>
              <div className="grid grid-cols-1 gap-2">
                {tracks.map((t) => (
                  <Link
                    key={t.id}
                    href={t.href}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card/75 p-3 backdrop-blur-md transition-all hover:border-brand-500/30"
                  >
                    <img
                      src={t.coverImageUrl}
                      alt={t.title}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-foreground">{t.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {t.artistName}
                      </p>
                      <p className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                        {t.type === "playlist" ? (
                          <ListMusic className="h-3 w-3" />
                        ) : (
                          <Disc className="h-3 w-3" />
                        )}
                        {t.contextLabel}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
