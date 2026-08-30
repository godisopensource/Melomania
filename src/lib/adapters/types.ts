import { MusicProvider } from "@/types";

export interface TrackSearchInput {
  query?: string;
  title: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
  limit?: number;
}

export interface TrackSearchResult {
  externalId: string;
  provider: MusicProvider;
  title: string;
  artist: string;
  album?: string;
  durationSeconds: number;
  coverImageUrl?: string;
  versionLabel?: string;
  externalUrl: string;
  confidenceScore?: number;
}

export interface ExternalTrack {
  externalId: string;
  provider: MusicProvider;
  title: string;
  artist: string;
  album?: string;
  durationSeconds: number;
  coverImageUrl?: string;
  externalUrl: string;
  rawMetadata?: Record<string, any>;
}

export interface ExternalPlaylist {
  externalId: string;
  provider: MusicProvider;
  title: string;
  description?: string;
  author?: string;
  coverImageUrl?: string;
  trackCount: number;
  tracks: ExternalTrack[];
  externalUrl: string;
}

export interface CreatePlaylistInput {
  userId: string;
  title: string;
  description?: string;
  isPublic?: boolean;
}

export interface AddTracksResult {
  playlistId: string;
  addedTrackIds: string[];
  failedTrackIds: string[];
  totalAdded: number;
  externalUrl?: string;
}

export interface MusicProviderAdapter {
  provider: MusicProvider;
  searchTrack(input: TrackSearchInput): Promise<TrackSearchResult[]>;
  getTrack(externalId: string): Promise<ExternalTrack | null>;
  getPlaylist(externalId: string): Promise<ExternalPlaylist | null>;
  createPlaylist(input: CreatePlaylistInput): Promise<ExternalPlaylist>;
  addTracks(playlistId: string, trackIds: string[]): Promise<AddTracksResult>;
}
