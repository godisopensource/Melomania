// src/types/index.ts — définitions de types partagés

export type MusicResourceType = 'track' | 'playlist' | 'album' | 'artist';

export type MusicProvider = 'youtube' | 'spotify' | 'apple_music' | 'deezer';

export type ShareVisibility = 'private' | 'participants' | 'public';

export type MentionType = 'user' | 'track' | 'playlist' | 'album' | 'artist';

export type MatchStatus = 'automatic' | 'manual' | 'pending_confirmation' | 'rejected' | 'not_found';

export type ExportStatus = 'pending' | 'processing' | 'completed' | 'completed_with_warnings' | 'failed';

export type NotificationType =
  | 'comment_reply'
  | 'user_mention'
  | 'music_mention'
  | 'conversation_invitation'
  | 'share_like'
  | 'share_invitation'
  | 'export_completed'
  | 'export_warning'
  | 'import_error';

export type ReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'action_taken';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio?: string;
  isPublic: boolean;
  passwordHash?: string;
  role?: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface MusicResource {
  id: string;
  type: MusicResourceType;
  title: string;
  subtitle?: string;
  artistName: string;
  albumName?: string;
  durationSeconds: number;
  coverImageUrl: string;
  normalizedTitle: string;
  normalizedArtist: string;
  genres?: string[];
  trackCount?: number;
  tracks?: MusicResource[]; // For playlists/albums
  // ——— Melomania curation (non-destructive, optional for legacy data) ———
  /** Immutable original YouTube Music order. Never reordered locally. */
  sourcePosition?: number;
  /** Owning playlist resource id (for tracks imported via playlist). */
  playlistId?: string;
  /** Single primary category in this version. */
  categoryId?: string | null;
  /** Manually entered 0..100. Null = not rated yet. */
  moodScore?: number | null;
  /** Manually entered 0..100. 0 = very soft, 50 = mid, 100 = intense/abrasive. Null = not rated. */
  softnessScore?: number | null;
  /** Scores for custom emotional criteria (criterionId -> 0..100 or null). */
  customScores?: Record<string, number | null>;
  /** Manually created/selected tags. */
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistCategory {
  id: string;
  playlistId: string;
  name: string;
  description?: string;
  /** Hex color used for headers, dots, curve segments. */
  color: string;
  /** Display order of columns (does NOT affect sourcePosition). */
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrackEnrichment {
  resourceId: string;
  playlistId?: string;
  sourcePosition: number;
  categoryId?: string | null;
  moodScore?: number | null;
  softnessScore?: number | null;
  customScores?: Record<string, number | null>;
  tags?: string[];
  updatedAt: string;
}

/** Custom emotional criterion (beyond mood & softness), defined per playlist. */
export interface EmotionalCriterion {
  id: string;
  playlistId: string;
  name: string;
  minLabel: string;
  maxLabel: string;
  color: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** Immutable editorial root note: once published, never edited/deleted by its author. */
export interface TrackNote {
  id: string;
  trackId: string;
  playlistId?: string;
  authorId: string;
  author?: User;
  body: string;
  /** Null = initial editorial note (immutable). Set = reply in the thread. */
  parentNoteId?: string | null;
  startTimeSeconds?: number | null;
  endTimeSeconds?: number | null;
  attachedResourceId?: string | null;
  isInitial: boolean;
  isLocked: boolean;
  isEdited: boolean;
  deletedAt?: string | null;
  mentions?: Mention[];
  replies?: TrackNote[];
  createdAt: string;
  updatedAt: string;
}

export type PlaylistViewMode = 'curator' | 'vinyl';

/** Editorial comment: intro (-1, before Nº 1), between two consecutive tracks
 * (after `afterSourcePosition`), or conclusion (after the last track, i.e.
 * `afterSourcePosition === trackCount - 1`). */
export interface GapComment {
  id: string;
  playlistId: string;
  /** -1 = intro; otherwise sits after the track at this sourcePosition. */
  afterSourcePosition: number;
  authorId: string;
  author?: User;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CuratedPlaylist {
  playlist: MusicResource;
  categories: PlaylistCategory[];
  /** All tracks sorted by sourcePosition ascending (immutable order). */
  tracks: MusicResource[];
  uncategorized: MusicResource[];
}

export interface MusicSource {
  id: string;
  musicResourceId: string;
  provider: MusicProvider;
  externalId: string;
  externalUrl: string;
  sourceTitle: string;
  sourceArtist?: string;
  sourceAlbum?: string;
  sourceDurationSeconds?: number;
  sourceVersionLabel?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface MusicShare {
  id: string;
  authorId: string;
  author?: User;
  resourceId: string;
  resource?: MusicResource;
  sources?: MusicSource[];
  introductoryComment?: string;
  visibility: ShareVisibility;
  conversationId: string;
  likesCount?: number;
  /** User ids that liked this share (persisted). */
  likedByUserIds?: string[];
  /** Whether the current viewer liked it (computed server-side, never stored). */
  hasLiked?: boolean;
  /** Private shares: user ids explicitly invited (besides the author). */
  allowedUserIds?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationThread {
  id: string;
  createdById: string;
  createdBy?: User;
  title: string;
  visibility: ShareVisibility;
  shareId?: string;
  share?: MusicShare;
  participantsCount?: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationParticipant {
  id: string;
  conversationId: string;
  userId: string;
  user?: User;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface Mention {
  id: string;
  commentId: string;
  mentionType: MentionType;
  targetUserId?: string;
  targetUser?: User;
  targetMusicResourceId?: string;
  targetMusicResource?: MusicResource;
  startOffset: number;
  endOffset: number;
  rawText: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  conversationId: string;
  authorId: string;
  author?: User;
  parentCommentId?: string | null;
  body: string;
  startTimeSeconds?: number | null;
  endTimeSeconds?: number | null;
  attachedResourceId?: string | null;
  attachedResource?: MusicResource;
  isEdited: boolean;
  deletedAt?: string | null;
  mentions?: Mention[];
  reactions?: Record<string, string[]>; // emoji -> userIds
  replies?: Comment[];
  createdAt: string;
  updatedAt: string;
}

export interface ExternalConnection {
  id: string;
  userId: string;
  provider: 'spotify' | 'apple_music';
  providerAccountId: string;
  accountName?: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string;
  expiresAt?: string;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TrackMatch {
  id: string;
  sourceMusicResourceId: string;
  sourceResource?: MusicResource;
  targetProvider: 'spotify' | 'apple_music';
  targetExternalId: string;
  targetTitle: string;
  targetArtist: string;
  targetAlbum?: string;
  targetDurationSeconds: number;
  targetCoverUrl?: string;
  targetVersionLabel?: string;
  confidenceScore: number; // 0 - 100
  matchStatus: MatchStatus;
  matchedBy: 'automatic' | 'manual';
  alternativeMatches?: Array<{
    externalId: string;
    title: string;
    artist: string;
    album?: string;
    durationSeconds: number;
    coverUrl?: string;
    versionLabel?: string;
    confidenceScore: number;
  }>;
  createdAt: string;
}

export interface ExportJob {
  id: string;
  userId: string;
  sourcePlaylistId: string;
  sourcePlaylist?: MusicResource;
  targetProvider: 'spotify' | 'apple_music';
  targetPlaylistId?: string;
  targetPlaylistUrl?: string;
  status: ExportStatus;
  totalItems: number;
  processedItems: number;
  matchedItems: number;
  unmatchedItems: number;
  items: TrackMatch[];
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  actorId: string;
  actor?: User;
  type: NotificationType;
  conversationId?: string;
  commentId?: string;
  musicResourceId?: string;
  musicResource?: MusicResource;
  shareId?: string;
  isRead: boolean;
  message?: string;
  createdAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reporter?: User;
  targetType: 'comment' | 'share';
  targetId: string;
  reason: string;
  status: ReportStatus;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}
