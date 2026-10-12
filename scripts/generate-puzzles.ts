// Builds the daily puzzles from public Binance klines (no API key).
// Deterministic: the same SEED, DATA_END and LAUNCH_DATE always produce the same files.
//
//   node scripts/generate-puzzles.ts            report + write public/puzzles/*.json
//   node scripts/generate-puzzles.ts --report   report only, write nothing
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { LAUNCH_DATE } from '../src/config.ts';
import { BAND_EDGES, bandOf, seal } from '../src/game.ts';
import type { Candle, DailyPuzzle, Interval } from '../src/types.ts';

const SEED = 20261012;
const DATA_END = Date.UTC(2026, 9, 1); // fixed, so re-fetching gives identical data
const DAYS = 365;
const SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'LINK', 'AVAX', 'LTC',
  'TRX', 'DOT', 'ATOM', 'ETC', 'XLM', 'BCH', 'UNI', 'NEAR', 'AAVE', 'FIL',
].map((s) => `${s}USDT`);
const INTERVALS: Record<Interval, number> = { '1h': 3600e3, '4h': 4 * 3600e3, '1d': 24 * 3600e3 };

const VISIBLE = 60;
const SIZE = VISIBLE + 10;
// Candles between window starts. Below SIZE windows overlap; keep it >= 30 so two
// puzzles never share hidden candles and never look like the same chart.
// 1D history is short (~2700 candles per symbol), so it needs the overlap.
const STRIDE: Record<Interval, number> = { '1h': 70, '4h': 70, '1d': 30 };
const BAND_WEIGHTS = [0.3, 0.3, 0.25, 0.15]; // share of puzzles per band, same order as BAND_EDGES
const MIN_MOVE = 0.5; // % — below this the direction is a coin flip
// Share of flattest charts to drop. Lower on 1D: 60 daily candles are rarely dead,
// and flat charts are where the scarce 0–2% outcomes come from.
const FLAT_QUANTILE: Record<Interval, number> = { '1h': 0.25, '4h': 0.25, '1d': 0.1 };
// 1D only: skip windows where a recognisable day (by high-low range: the symbol's own biggest
// days and BTC's biggest per year) falls in the hidden candles or just before them.
const FAMOUS_OWN = 5;
const FAMOUS_BTC_PER_YEAR = 3;
const FAMOUS_ZONE = 20; // last N candles of the window: 10 hidden + 10 visible
// Scheduling: minimum number of days between two puzzles that could spoil each other.
const SAME_PAIR_GAP = 90; // overlapping windows of the same pair (1D only, because of its stride)
const SAME_MOMENT_GAP = 30; // hidden candles overlap in calendar time, any pair or timeframe

const API = 'https://data-api.binance.vision/api/v3/klines';
const RAW_DIR = new URL('../data/raw/', import.meta.url);
const OUT_DIR = new URL('../public/puzzles/', import.meta.url);

type Kline = [t: number, o: number, h: number, l: number, c: number];
interface Win {
  symbol: string;
  k: Kline[];
  i: number;
  move: number; // % from anchor to the last hidden close
  range: number; // high-low of the visible part, relative to the anchor
  from: number; // calendar span in ms: [from, to), hidden part is [hiddenFrom, to)
  hiddenFrom: number;
  to: number;
}

async function klines(symbol: string, interval: Interval): Promise<Kline[]> {
  const file = new URL(`${symbol}_${interval}_${DATA_END}.json`, RAW_DIR);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const out: Kline[] = [];
  for (let from = 0; ; ) {
    const res = await fetch(`${API}?symbol=${symbol}&interval=${interval}&startTime=${from}&endTime=${DATA_END - 1}&limit=1000`);
    if (!res.ok) throw new Error(`Binance ${symbol} ${interval}: HTTP ${res.status}`);
    const rows = (await res.json()) as (string | number)[][];
    for (const r of rows) out.push([+r[0], +r[1], +r[2], +r[3], +r[4]]);
    if (rows.length < 1000) break;
    from = +rows[rows.length - 1][0] + 1;
  }
  writeFileSync(file, JSON.stringify(out));
  return out;
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const pct = (price: number, anchor: number) => Math.round((price / anchor - 1) * 1e4) / 100;
const cellOf = (move: number) => bandOf(move) * 2 + (move > 0 ? 0 : 1); // band × direction
const biggestDays = (k: Kline[], n: number) =>
  k.map((c) => [c[2] / c[3], c[0]]).sort((a, b) => b[0] - a[0]).slice(0, n).map((x) => x[1]);

// Puzzles needed per cell: the band weights, with a 50/50 direction split inside every band.
function cellNeeds(): number[] {
  const need = Array.from({ length: (BAND_EDGES.length + 1) * 2 }, () => 0);
  for (let d = 0; d < DAYS; d++) {
    let band = 0;
    for (let acc = BAND_WEIGHTS[0]; (d + 0.5) / DAYS > acc && band < BAND_EDGES.length; ) acc += BAND_WEIGHTS[++band];
    need[band * 2 + (d % 2)]++;
  }
  return need;
}

const samePairOverlap = (a: Win, b: Win) => a.k === b.k && Math.abs(a.i - b.i) < SIZE;

// Days two windows must be scheduled apart; 0 = unrelated, 1 = just not on the same day.
function minGap(a: Win, b: Win): number {
  if (samePairOverlap(a, b)) return SAME_PAIR_GAP;
  if (a.hiddenFrom < b.to && b.hiddenFrom < a.to) return SAME_MOMENT_GAP;
  return a.from < b.to && b.from < a.to ? 1 : 0;
}

const series = Object.fromEntries(
  await Promise.all(
    SYMBOLS.map(async (symbol) => {
      mkdirSync(RAW_DIR, { recursive: true });
      const byInterval = {} as Record<Interval, Kline[]>;
      for (const interval of Object.keys(INTERVALS) as Interval[]) byInterval[interval] = await klines(symbol, interval);
      return [symbol, byInterval] as const;
    }),
  ),
);

const btcFamous = Object.values(Object.groupBy(series.BTCUSDT['1d'], (c) => new Date(c[0]).getUTCFullYear())).flatMap((year) =>
  biggestDays(year!, FAMOUS_BTC_PER_YEAR),
);
const intervals = Object.keys(INTERVALS) as Interval[];
const need = cellNeeds();
const chosen: Win[] = []; // DAYS windows per interval, in `intervals` order
let short = false;

for (const [n, interval] of intervals.entries()) {
  const step = INTERVALS[interval];
  const drop = { gap: 0, famous: 0, tiny: 0, flat: 0 };
  let wins: Win[] = [];
  let grid = 0;

  for (const symbol of SYMBOLS) {
    const k = series[symbol][interval];
    const famous = interval === '1d' ? new Set([...btcFamous, ...biggestDays(k, FAMOUS_OWN)]) : null;
    // Start one window in: the first candles after a listing are erratic.
    for (let i = SIZE; i + SIZE <= k.length; i += STRIDE[interval], grid++) {
      const w = k.slice(i, i + SIZE);
      if (w[SIZE - 1][0] - w[0][0] !== (SIZE - 1) * step) drop.gap++;
      else if (famous && w.slice(-FAMOUS_ZONE).some((c) => famous.has(c[0]))) drop.famous++;
      else {
        const anchor = w[VISIBLE - 1][4];
        const move = pct(w[SIZE - 1][4], anchor);
        const vis = w.slice(0, VISIBLE);
        const range = (Math.max(...vis.map((c) => c[2])) - Math.min(...vis.map((c) => c[3]))) / anchor;
        if (Math.abs(move) < MIN_MOVE) drop.tiny++;
        else wins.push({ symbol, k, i, move, range, from: w[0][0], hiddenFrom: w[VISIBLE][0], to: w[SIZE - 1][0] + step });
      }
    }
  }
  const flatBelow = wins.map((w) => w.range).sort((a, b) => a - b)[Math.floor(wins.length * FLAT_QUANTILE[interval])];
  drop.flat = wins.length;
  wins = wins.filter((w) => w.range >= flatBelow);
  drop.flat -= wins.length;

  const rand = mulberry32(SEED + n);
  const pools = need.map((): Win[] => []);
  for (const w of shuffle(wins, rand)) pools[cellOf(w.move)].push(w);

  console.log(
    `\n${interval}: stride ${STRIDE[interval]} → ${grid} windows; dropped ${drop.gap} gap, ${drop.famous} famous day, ` +
      `${drop.tiny} move < ${MIN_MOVE}%, ${drop.flat} flat (range < ${(flatBelow * 100).toFixed(1)}%) → ${wins.length} usable, ${DAYS} needed`,
  );
  console.table(
    BAND_WEIGHTS.map((_, b) => {
      const label = b < BAND_EDGES.length ? `${b ? BAND_EDGES[b - 1] : 0}–${BAND_EDGES[b]}%` : `>${BAND_EDGES[b - 1]}%`;
      const cell = (c: number) => `${pools[c].length} / ${need[c]}${pools[c].length < need[c] ? '  ✗ SHORT' : ''}`;
      return { band: label, 'up (have / need)': cell(b * 2), 'down (have / need)': cell(b * 2 + 1) };
    }),
  );
  if (pools.some((pool, cell) => pool.length < need[cell])) {
    short = true;
    continue;
  }
  // Scarcest cells first; each prefers windows that don't overlap an already chosen window of the same pair.
  const sel: Win[] = [];
  for (const cell of [...pools.keys()].sort((a, b) => pools[a].length / need[a] - pools[b].length / need[b])) {
    const mine: Win[] = [];
    for (const w of pools[cell]) if (mine.length < need[cell] && !sel.some((s) => samePairOverlap(s, w))) sel.push(w), mine.push(w);
    for (const w of pools[cell]) if (mine.length < need[cell] && !mine.includes(w)) sel.push(w), mine.push(w);
  }
  chosen.push(...shuffle(sel, rand));
}

if (short) {
  console.error('\nPool too small: lower STRIDE (>= 30), add symbols, or change BAND_WEIGHTS. Nothing written.');
  process.exit(1);
}

// Schedule: window x of `chosen` is round x / DAYS on day[x]. Start from the shuffled order and
// swap days within a timeframe until no two related windows are closer than their minGap.
const day = chosen.map((_, x) => x % DAYS);
const related = chosen.map((a, x) => chosen.flatMap((b, y) => (x !== y && minGap(a, b) ? [[y, minGap(a, b)]] : [])));
const clashes = (x: number) => related[x].filter(([y, gap]) => Math.abs(day[x] - day[y]) < gap).length;
const swap = (x: number, y: number) => ([day[x], day[y]] = [day[y], day[x]]);
const rand = mulberry32(SEED + intervals.length);
for (let iter = 0; iter < 20000; iter++) {
  const bad = [...chosen.keys()].filter((x) => clashes(x));
  if (!bad.length) break;
  const x = bad[Math.floor(rand() * bad.length)];
  const first = x - (x % DAYS);
  const offset = Math.floor(rand() * DAYS);
  let best = x;
  let bestDelta = 1;
  for (let j = 0; j < DAYS; j++) {
    const y = first + ((offset + j) % DAYS);
    if (y === x) continue;
    const before = clashes(x) + clashes(y);
    swap(x, y);
    const delta = clashes(x) + clashes(y) - before;
    swap(x, y);
    if (delta < bestDelta) [best, bestDelta] = [y, delta];
  }
  swap(x, best); // sideways moves (delta 0) are allowed, they get the search off plateaus
}

// Report straight from the final days, independent of the search above.
const pairs = { samePair: [] as number[], sameMoment: [] as number[], sameDay: 0, tooClose: 0 };
for (let x = 0; x < chosen.length; x++) {
  for (let y = x + 1; y < chosen.length; y++) {
    const gap = minGap(chosen[x], chosen[y]);
    const apart = Math.abs(day[x] - day[y]);
    if (gap === SAME_PAIR_GAP) pairs.samePair.push(apart);
    if (gap === SAME_MOMENT_GAP) pairs.sameMoment.push(apart);
    if (gap === 1 && apart === 0) pairs.sameDay++;
    if (apart < gap) pairs.tooClose++;
  }
}
const closest = (apart: number[]) => (apart.length ? `closest ${Math.min(...apart)} days apart` : 'none');
console.log(`\nSchedule of ${chosen.length} rounds over ${DAYS} days:`);
console.log(`  same pair, overlapping windows: ${pairs.samePair.length} pairs, ${closest(pairs.samePair)} (min ${SAME_PAIR_GAP})`);
console.log(`  same market moment (hidden candles overlap): ${pairs.sameMoment.length} pairs, ${closest(pairs.sameMoment)} (min ${SAME_MOMENT_GAP})`);
console.log(`  rounds of one day overlapping in time: ${pairs.sameDay}`);
if (pairs.tooClose) {
  console.error(`\nNo valid schedule found: ${pairs.tooClose} pairs are too close together. Nothing written.`);
  process.exit(1);
}
if (process.argv.includes('--report')) process.exit(0);

const byDay: Win[][] = Array.from({ length: DAYS }, () => []);
chosen.forEach((w, x) => (byDay[day[x]][Math.floor(x / DAYS)] = w));

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
for (let d = 0; d < DAYS; d++) {
  const date = new Date(Date.parse(LAUNCH_DATE) + d * 864e5).toISOString().slice(0, 10);
  const puzzle: DailyPuzzle = {
    date,
    n: d + 1,
    rounds: intervals.map((interval, r) => {
      const { symbol, k, i } = byDay[d][r];
      const anchor = k[i + VISIBLE - 1][4];
      const candles = k.slice(i, i + SIZE).map((c): Candle => [pct(c[1], anchor), pct(c[2], anchor), pct(c[3], anchor), pct(c[4], anchor)]);
      const secret = { symbol, start: k[i][0] / 1000, future: candles.slice(VISIBLE) };
      return { interval, candles: candles.slice(0, VISIBLE), secret: seal(secret, date + interval) };
    }),
  };
  writeFileSync(new URL(`${date}.json`, OUT_DIR), JSON.stringify(puzzle));
}
console.log(`\nWrote ${DAYS} puzzles to public/puzzles/ (${LAUNCH_DATE} onwards).`);
