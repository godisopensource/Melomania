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
  createdAt: string;
  updatedAt: string;
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
