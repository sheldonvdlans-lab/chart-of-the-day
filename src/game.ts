import type { Secret } from './types.ts';

/** Upper edges (in %) of the move bands; the last band is open-ended. */
export const BAND_EDGES = [2, 5, 10];

export function bandOf(pct: number): number {
  const i = BAND_EDGES.findIndex((edge) => Math.abs(pct) < edge);
  return i < 0 ? BAND_EDGES.length : i;
}

// Obfuscation only, so opening a puzzle file doesn't spoil it. Not security.
const xor = (s: string, key: string) =>
  Array.from(s, (ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join('');

export const seal = (secret: Secret, key: string) => btoa(xor(JSON.stringify(secret), key));
export const unseal = (sealed: string, key: string): Secret => JSON.parse(xor(atob(sealed), key));
