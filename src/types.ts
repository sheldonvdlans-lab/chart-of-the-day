/** OHLC in % relative to the anchor: the close of the last visible candle. */
export type Candle = [o: number, h: number, l: number, c: number];
export type Interval = '1h' | '4h' | '1d';

/** The spoiler part of a round, stored obfuscated in the puzzle file. */
export interface Secret {
  symbol: string;
  start: number; // unix seconds of the first visible candle
  future: Candle[];
}

export interface Round {
  interval: Interval;
  candles: Candle[]; // visible candles only
  secret: string; // seal(Secret)
}

export interface DailyPuzzle {
  date: string; // UTC, YYYY-MM-DD
  n: number; // puzzle number, 1 = LAUNCH_DATE
  rounds: Round[];
}

export interface Guess {
  up: boolean;
  band: number; // index into the bands, see BAND_EDGES
}
