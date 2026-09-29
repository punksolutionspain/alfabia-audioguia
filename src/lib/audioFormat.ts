import type { Translation } from '@/lib/types'

/** One-time detection — cached at module level to avoid repeated DOM creation */
let _oggSupported: boolean | null = null

/**
 * Whether this browser can play OGG/Opus.
 * Safari only can since iOS 18.4 — older iPhones need the MP3 fallback.
 */
export function supportsOgg(): boolean {
  if (_oggSupported !== null) return _oggSupported
  const audio = document.createElement('audio')
  _oggSupported = audio.canPlayType('audio/ogg; codecs=opus') !== ''
  return _oggSupported
}

/**
 * Pick the audio URL this browser can actually play: OGG when supported,
 * MP3 otherwise. The player and the offline download must agree on this,
 * otherwise the download caches files the player never requests.
 */
export function pickAudioUrl(
  urls: Pick<Translation, 'audioUrlOgg' | 'audioUrlMp3'>,
): string | null {
  if (supportsOgg() && urls.audioUrlOgg) return urls.audioUrlOgg
  return urls.audioUrlMp3
}
