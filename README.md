# Chart of the Day

A daily chart puzzle for traders, Wordle style. Everyone gets the same three charts each UTC day
(1H, 4H and 1D candles). The asset, the date and the price levels are hidden. You guess where the
price closes 10 candles later: direction plus a size band. Then the real candles play out.

Static site: no backend, no API keys, no network calls at runtime other than its own files.

## Run it

Needs Node 22.18 or newer.

```sh
npm install
npm run dev       # http://localhost:5173
npm test          # unit tests for scoring, streak, share text, obfuscation
npm run build     # type-check and build to dist/
npm run preview   # serve dist/, including the service worker
```

The service worker is only registered in a production build, so use `npm run preview` to test
installing and offline play.

## Rules

Each round is worth up to 100 points, 300 a day.

| | Points | Share |
|---|---|---|
| Direction wrong | 0 for the round | 🟥⬛ |
| Direction right | 50 | 🟩 + band |
| Band exact | +50 | 🟩 |
| Band one off | +25 | 🟨 |
| Band further off | +0 | ⬛ |

Bands are the same for every timeframe: 0–2%, 2–5%, 5–10%, >10%. The streak counts consecutive
UTC days on which you finished all three rounds.

## Puzzles

`public/puzzles/YYYY-MM-DD.json` holds one day. They are generated ahead of time and committed:

```sh
npm run generate               # print the pool report, then rewrite public/puzzles/
npm run generate -- --report   # report only
```

The script downloads klines from the public Binance market-data API (cached in `data/raw/`,
not committed) and is deterministic: the same `SEED`, `DATA_END` and `LAUNCH_DATE` give the same
files. It exits with an error and writes nothing if a band/direction pool is too small or no
valid schedule exists.

What it guarantees, all tunable at the top of `scripts/generate-puzzles.ts`:

- Each timeframe gets 30/30/25/15% of its puzzles in the four bands, half up and half down.
- No flat charts, no outcome under 0.5%, no gaps in the data, nothing from a pair's first 70 candles.
- 1D: no window with a famous day (BTC's three biggest days of each year, the pair's own five
  biggest) in the hidden candles or the ten before them.
- Scheduling: the three rounds of a day never overlap in calendar time; puzzles whose hidden
  candles overlap in calendar time are at least 30 days apart; overlapping windows of the same
  pair are avoided, and otherwise at least 90 days apart. The report prints the counts.

The symbol, start time and hidden candles are obfuscated in the JSON (XOR + base64) so opening a
file doesn't spoil it. That is not security: without a backend the answer is always in the client.

### Going live

1. Set `LAUNCH_DATE` in `src/config.ts` to the day puzzle #1 should appear.
2. `npm run generate` and commit `public/puzzles/`.
3. Push to `main`. `.github/workflows/deploy.yml` tests, builds and publishes `dist/` to GitHub
   Pages. One-time setup: in the repository's Settings → Pages, set Source to "GitHub Actions".
   On a free GitHub plan the repository has to be public for Pages.

Any other static host works too: `npm run build` and upload `dist/`. Paths are relative, so a
sub-path is fine.

There are 365 days of puzzles. Before they run out, raise `DAYS` (or move `DATA_END` forward for
fresh data) and regenerate; days that were already played keep their puzzle only if the seed,
`DATA_END` and the filters stay the same.

## Layout

```
scripts/generate-puzzles.ts   build-time puzzle generator
public/puzzles/               generated puzzles, one file per day
public/sw.js                  service worker: network first, cache as offline fallback
src/config.ts                 LAUNCH_DATE
src/game.ts                   pure logic: bands, scoring, streak, share text, obfuscation
src/chart.ts                  lightweight-charts wrapper and reveal animation
src/storage.ts                localStorage, guarded
src/strings.ts                all UI copy (add a language here)
src/main.ts                   screens and flow
```

## Offline and install

The site has a web manifest and a service worker. After the first online visit it is installable
and works offline, with today's puzzle and the next seven days cached.

## Native apps later

Nothing in `src/` depends on the browser beyond `fetch` of relative files, `localStorage`, the
share sheet and the clipboard, so Capacitor can wrap `dist/` as is. The service worker is skipped
inside Capacitor. Not set up or tested yet.

## Credits

Charts by [TradingView Lightweight Charts™](https://www.tradingview.com/), Copyright (с) 2025
TradingView, Inc., Apache 2.0. The attribution logo on the chart and the footer notice are
required by its licence; keep them. Market data comes from Binance's public klines API.
