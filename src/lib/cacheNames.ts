// Cache names shared by the service worker (src/sw.ts) and the page.
//
// Do NOT bump CACHE_VERSION lightly: the new names start empty and the old
// caches stay on the visitor's phone, so every downloaded audio is orphaned.

export const CACHE_VERSION = 'v1'

/**
 * Audio files. The service worker plays from this cache and the page downloads
 * into it, so each file is stored once.
 */
export const AUDIO_CACHE_NAME = `audio-files-${CACHE_VERSION}`
