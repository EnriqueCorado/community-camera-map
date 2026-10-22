// Choosing a speech voice that runs on the device. Voices the browser reports
// as remote (localService false) send the text to a server, so they're never
// used. Apple lists joke voices as ordinary ones; those are skipped too.
// (The static pages' client.js applies the same rules in plain JS.)

const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical|Pipe Organ)\b/i;

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

/** The best on-device voice for `lang` ("en", "es"), or null. US voices first. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: string): V | null {
  const ok = voices.filter((v) => v.localService && v.lang.toLowerCase().startsWith(lang) && !NOVELTY.test(v.name));
  const score = (v: V) => (/-US$/i.test(v.lang) ? 2 : 0) + (v.default ? 1 : 0);
  return [...ok].sort((a, b) => score(b) - score(a))[0] ?? null;
}
