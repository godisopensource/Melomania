"use client";

import React from "react";
import { YouTubeVideo } from "./YouTubeVideo";
import { YouTubeControls } from "./YouTubeControls";
import { Comment } from "@/types";

interface YouTubePlayerProps {
  comments?: Comment[];
  onAddTimestampComment?: (timeSeconds: number) => void;
  className?: string;
  compact?: boolean;
}

/**
 * Full player card: collapsible official video (audio only by default)
 * plus timeline, markers and transport controls.
 */
export function YouTubePlayer({
  comments = [],
  onAddTimestampComment,
  className = "",
  compact = false,
}: YouTubePlayerProps) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg ${className}`}
    >
      <YouTubeVideo />
      <div className="p-4 bg-card">
        <YouTubeControls comments={comments} onAddTimestampComment={onAddTimestampComment} />
      </div>
    </div>
  );
}
