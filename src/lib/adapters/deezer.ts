import { MusicProviderAdapter, TrackSearchInput, TrackSearchResult, ExternalTrack, ExternalPlaylist, CreatePlaylistInput, AddTracksResult } from "./types";

/**
 * Deezer Adapter stub - reserved for future versions as outlined in dev-instructions.md
 */
export class DeezerAdapter implements MusicProviderAdapter {
  provider = "deezer" as const;

  async searchTrack(input: TrackSearchInput): Promise<TrackSearchResult[]> {
    throw new Error("L'intégration Deezer sera disponible dans une prochaine version.");
  }

  async getTrack(externalId: string): Promise<ExternalTrack | null> {
    throw new Error("L'intégration Deezer sera disponible dans une prochaine version.");
  }

  async getPlaylist(externalId: string): Promise<ExternalPlaylist | null> {
    throw new Error("L'intégration Deezer sera disponible dans une prochaine version.");
  }

  async createPlaylist(input: CreatePlaylistInput): Promise<ExternalPlaylist> {
    throw new Error("L'intégration Deezer sera disponible dans une prochaine version.");
  }

  async addTracks(playlistId: string, trackIds: string[]): Promise<AddTracksResult> {
    throw new Error("L'intégration Deezer sera disponible dans une prochaine version.");
  }
}
