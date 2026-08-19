/** Supported third-party embed providers for playlist modules. */
export type EmbedProvider = "spotify" | "youtube";

/** Parsed allowlisted embed reference. */
export interface ParsedEmbed {
  provider: EmbedProvider;
  embedUrl: string;
  title?: string;
}

const SPOTIFY_TRACK = /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/;
const SPOTIFY_ALBUM = /open\.spotify\.com\/album\/([a-zA-Z0-9]+)/;
const YOUTUBE_WATCH = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const YOUTUBE_EMBED = /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/;

/** Parse an allowlisted Spotify or YouTube URL into a sandboxed embed URL. */
export function parseAllowlistedEmbed(rawUrl: string): ParsedEmbed | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.replace(/^www\./, "");
  const href = url.href;

  const spotifyTrack = href.match(SPOTIFY_TRACK);
  if (spotifyTrack && host === "open.spotify.com") {
    return {
      provider: "spotify",
      embedUrl: `https://open.spotify.com/embed/track/${spotifyTrack[1]}`,
    };
  }
  const spotifyAlbum = href.match(SPOTIFY_ALBUM);
  if (spotifyAlbum && host === "open.spotify.com") {
    return {
      provider: "spotify",
      embedUrl: `https://open.spotify.com/embed/album/${spotifyAlbum[1]}`,
    };
  }

  const ytWatch = href.match(YOUTUBE_WATCH);
  if (ytWatch && (host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com")) {
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube.com/embed/${ytWatch[1]}`,
    };
  }
  const ytEmbed = href.match(YOUTUBE_EMBED);
  if (ytEmbed && host === "youtube.com") {
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube.com/embed/${ytEmbed[1]}`,
    };
  }

  return null;
}

/** Return true when a URL is an allowlisted embed source. */
export function isAllowlistedEmbedUrl(rawUrl: string): boolean {
  return parseAllowlistedEmbed(rawUrl) !== null;
}
