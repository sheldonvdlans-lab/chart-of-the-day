import type { Guess, Interval, Save, Secret } from './types.ts';

export const INTERVAL_MS: Record<Interval, number> = { '1h': 3600e3, '4h': 4 * 3600e3, '1d': 24 * 3600e3 };

/** Upper edges (in %) of the move bands; the last band is open-ended. */
export const BAND_EDGES = [2, 5, 10];

export function bandOf(pct: number): number {
  const i = BAND_EDGES.findIndex((edge) => Math.abs(pct) < edge);
  return i < 0 ? BAND_EDGES.length : i;
}

export const bandLabel = (band: number) =>
  band < BAND_EDGES.length ? `${band ? BAND_EDGES[band - 1] : 0}–${BAND_EDGES[band]}%` : `>${BAND_EDGES[band - 1]}%`;

export const pct = (value: number, digits = 2) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;

/** Today's puzzle date (or `daysAhead` later): everyone switches at UTC midnight. */
export const today = (daysAhead = 0) => new Date(Date.now() + daysAhead * 864e5).toISOString().slice(0, 10);

export interface Grade {
  dir: boolean; // direction right
  off: number; // bands away from the real one
  points: number;
}

// Wrong direction scores nothing; right direction 50, plus 50 for the exact band or 25 for a neighbour.
export function grade(guess: Guess, move: number): Grade {
  const dir = guess.up === move > 0;
  const off = Math.abs(guess.band - bandOf(move));
  return { dir, off, points: dir ? 50 + (off === 0 ? 50 : off === 1 ? 25 : 0) : 0 };
}

export const emoji = (g: Grade) => (g.dir ? '🟩' : '🟥') + (!g.dir || g.off > 1 ? '⬛' : g.off ? '🟨' : '🟩');

const dayBefore = (date: string) => new Date(Date.parse(date) - 864e5).toISOString().slice(0, 10);

/** The streak as it stands on `date`: it is gone once a full day was skipped. */
export const liveStreak = (save: Save, date: string) =>
  save.lastDone === date || save.lastDone === dayBefore(date) ? save.streak : 0;

/** Books a finished day into the lifetime stats. Call once per day. */
export function recordDay(save: Save, date: string, grades: Grade[]) {
  save.streak = liveStreak(save, date) + 1;
  save.best = Math.max(save.best, save.streak);
  save.lastDone = date;
  save.played++;
  for (const g of grades) {
    save.points += g.points;
    if (g.dir) save.dirHits++;
  }
}

export function shareText(title: string, n: number, intervals: Interval[], grades: Grade[], streak: number, url: string) {
  const total = grades.reduce((sum, g) => sum + g.points, 0);
  return [
    `${title} #${n} — ${total}/${grades.length * 100}`,
    ...grades.map((g, r) => `${intervals[r].toUpperCase()} ${emoji(g)}`),
    `🔥 ${streak}`,
    url,
  ].join('\n');
}

// Obfuscation only, so opening a puzzle file doesn't spoil it. Not security.
const xor = (s: string, key: string) =>
  Array.from(s, (ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join('');

export const seal = (secret: Secret, key: string) => btoa(xor(JSON.stringify(secret), key));
export const unseal = (sealed: string, key: string): Secret => JSON.parse(xor(atob(sealed), key));
