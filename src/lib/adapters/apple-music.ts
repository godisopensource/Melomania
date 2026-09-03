import { MusicProviderAdapter, TrackSearchInput, TrackSearchResult, ExternalTrack, ExternalPlaylist, CreatePlaylistInput, AddTracksResult } from "./types";
import { extractVersionLabel } from "../utils";

export class AppleMusicAdapter implements MusicProviderAdapter {
  provider = "apple_music" as const;

  async searchTrack(input: TrackSearchInput): Promise<TrackSearchResult[]> {
    const query = input.query || `${input.title} ${input.artist || ""}`.trim();
    const normTitle = input.title || "Track";
    const normArtist = input.artist || "Artist";
    const baseDuration = input.durationSeconds || 230;

    return [
      {
        externalId: `am_${Math.abs(query.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0))}`,
        provider: "apple_music",
        title: normTitle,
        artist: normArtist,
        album: `${normTitle} - Apple Digital Master`,
        durationSeconds: baseDuration,
        coverImageUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80",
        versionLabel: "Lossless Audio Master",
        externalUrl: `https://music.apple.com/fr/album/${normTitle.toLowerCase().replace(/\s+/g, "-")}/123456789`,
      },
      {
        externalId: `am_remix_${Math.abs(query.length * 54321)}`,
        provider: "apple_music",
        title: `${normTitle} (Club Remix)`,
        artist: normArtist,
        album: `Remixes EP`,
        durationSeconds: baseDuration + 30,
        coverImageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&auto=format&fit=crop&q=80",
        versionLabel: "Remix",
        externalUrl: `https://music.apple.com/fr/album/club-remix/987654321`,
      },
    ];
  }

  async getTrack(externalId: string): Promise<ExternalTrack | null> {
    return {
      externalId,
      provider: "apple_music",
      title: "Apple Music Track",
      artist: "Apple Music Artist",
      durationSeconds: 210,
      coverImageUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80",
      externalUrl: `https://music.apple.com/track/${externalId}`,
    };
  }

  async getPlaylist(externalId: string): Promise<ExternalPlaylist | null> {
    return {
      externalId,
      provider: "apple_music",
      title: "Apple Music Exported Playlist",
      trackCount: 0,
      tracks: [],
      externalUrl: `https://music.apple.com/playlist/${externalId}`,
    };
  }

  async createPlaylist(input: CreatePlaylistInput): Promise<ExternalPlaylist> {
    const playlistId = `am_pl_${Date.now()}`;
    return {
      externalId: playlistId,
      provider: "apple_music",
      title: input.title,
      description: input.description || "Exported from Melomania",
      author: "Melomania User",
      coverImageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
      trackCount: 0,
      tracks: [],
      externalUrl: `https://music.apple.com/playlist/${playlistId}`,
    };
  }

  async addTracks(playlistId: string, trackIds: string[]): Promise<AddTracksResult> {
    return {
      playlistId,
      addedTrackIds: trackIds,
      failedTrackIds: [],
      totalAdded: trackIds.length,
      externalUrl: `https://music.apple.com/playlist/${playlistId}`,
    };
  }
}
