// src/lib/adapters/index.ts — point d'entrée des adaptateurs de services musicaux

import { MusicProvider } from "@/types";
import { MusicProviderAdapter } from "./types";
import { YouTubeAdapter } from "./youtube";
import { SpotifyAdapter } from "./spotify";
import { AppleMusicAdapter } from "./apple-music";
import { DeezerAdapter } from "./deezer";

export * from "./types";
export * from "./matcher";
export * from "./youtube";
export * from "./spotify";
export * from "./apple-music";
export * from "./deezer";

const youtubeAdapter = new YouTubeAdapter();
const spotifyAdapter = new SpotifyAdapter();
const appleMusicAdapter = new AppleMusicAdapter();
const deezerAdapter = new DeezerAdapter();

export function getMusicAdapter(provider: MusicProvider): MusicProviderAdapter {
  switch (provider) {
    case "youtube":
      return youtubeAdapter;
    case "spotify":
      return spotifyAdapter;
    case "apple_music":
      return appleMusicAdapter;
    case "deezer":
      return deezerAdapter;
    default:
      throw new Error(`Provider inconnu: ${provider}`);
  }
}
