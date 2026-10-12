import './style.css';
import { showChart } from './chart.ts';
import { BAND_EDGES, INTERVAL_MS, bandLabel, emoji, grade, liveStreak, pct, recordDay, shareText, today, unseal } from './game.ts';
import { load, store } from './storage.ts';
import { t } from './strings.ts';
import type { DailyPuzzle } from './types.ts';

const $ = (id: string) => document.getElementById(id)!;
const radio = (name: string, value: string | number, label: string) =>
  `<label><input type="radio" name="${name}" value="${value}" required><span>${label}</span></label>`;

let puzzle: DailyPuzzle;
const save = load();

/** Everything about round `r` that is only shown after the guess is locked in. */
function revealed(r: number) {
  const { interval, candles, secret } = puzzle.rounds[r];
  const { symbol, start, future } = unseal(secret, puzzle.date + interval);
  const move = future[future.length - 1][3];
  // The moment of the guess: where the hidden candles begin.
  const when = new Date(start * 1000 + candles.length * INTERVAL_MS[interval]).toLocaleString(t.locale, {
    dateStyle: 'medium',
    timeStyle: interval === '1d' ? undefined : 'short',
    timeZone: 'UTC',
  });
  return {
    future,
    move,
    grade: save.guesses[r] && grade(save.guesses[r], move),
    label: `${symbol.replace('USDT', '/USDT')} · ${when}${interval === '1d' ? '' : ' UTC'}`,
  };
}

function play(r: number) {
  const round = puzzle.rounds[r];
  const last = r === puzzle.rounds.length - 1;
  $('round').textContent = t.round(r + 1, puzzle.rounds.length, round.interval.toUpperCase());
  const reveal = showChart($('chart'), round.candles, round.candles.length + revealed(r).future.length);
  $('panel').innerHTML = `<form>
    <p>${t.question}</p>
    <fieldset><legend>${t.direction}</legend>${radio('up', 1, t.up)}${radio('up', 0, t.down)}</fieldset>
    <fieldset><legend>${t.band}</legend>${[...BAND_EDGES, 0].map((_, band) => radio('band', band, bandLabel(band))).join('')}</fieldset>
    <button>${t.lockIn}</button>
  </form>`;
  $('panel').querySelector('form')!.onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    const guess = (save.guesses[r] = { up: form.get('up') === '1', band: Number(form.get('band')) });
    if (last) recordDay(save, puzzle.date, puzzle.rounds.map((_, i) => revealed(i).grade));
    store(save);
    $('panel').innerHTML = `<p class="muted">${t.yourCall(guess.up ? t.up : t.down, bandLabel(guess.band))}</p>`;
    const { future, move, grade, label } = revealed(r);
    await reveal(future);
    $('panel').innerHTML += `<p class="result">${emoji(grade)} ${t.closed(pct(move))} · ${t.points(grade.points)}</p>
      <p class="muted">${label}</p>
      <button>${last ? t.seeResults : t.next}</button>`;
    $('panel').querySelector('button')!.onclick = () => (last ? results() : play(r + 1));
  };
}

function results(view = puzzle.rounds.length - 1) {
  const rounds = puzzle.rounds.map((_, r) => revealed(r));
  const total = rounds.reduce((sum, round) => sum + round.grade.points, 0);
  $('round').textContent = t.results(puzzle.n);
  const untilNext = 864e5 - (Date.now() % 864e5); // puzzles switch at UTC midnight
  const { candles } = puzzle.rounds[view];
  showChart($('chart'), [...candles, ...rounds[view].future], candles.length + rounds[view].future.length);
  $('panel').innerHTML = `<p class="score">${total}<small>/${rounds.length * 100}</small></p>
    ${rounds
      .map(
        ({ grade, move, label }, r) => `<button class="round" aria-pressed="${r === view}">
          <b>${puzzle.rounds[r].interval.toUpperCase()} ${emoji(grade)} ${t.points(grade.points)}</b>
          <span class="muted">${label} · ${pct(move)}</span>
        </button>`,
      )
      .join('')}
    <button id="share">${t.share}</button>
    <dl>${[
      [t.stats.streak, `🔥 ${liveStreak(save, puzzle.date)}`],
      [t.stats.best, save.best],
      [t.stats.played, save.played],
      [t.stats.average, Math.round(save.points / save.played)],
      [t.stats.direction, `${Math.round((100 * save.dirHits) / (save.played * rounds.length))}%`],
    ]
      .map(([name, value]) => `<div><dd>${value}</dd><dt>${name}</dt></div>`)
      .join('')}</dl>
    <p class="muted">${t.nextIn(Math.floor(untilNext / 3600e3), Math.floor((untilNext % 3600e3) / 60e3))}</p>`;
  $('panel')
    .querySelectorAll<HTMLElement>('.round')
    .forEach((button, r) => (button.onclick = () => results(r)));
  $('share').onclick = async () => {
    const text = shareText(
      t.title,
      puzzle.n,
      puzzle.rounds.map((round) => round.interval),
      rounds.map((round) => round.grade),
      liveStreak(save, puzzle.date),
      location.origin + location.pathname,
    );
    try {
      if (navigator.share) return await navigator.share({ text });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return; // share sheet dismissed
    }
    // No share sheet (desktop, webview): copy instead.
    await navigator.clipboard.writeText(text).then(
      () => ($('share').textContent = t.copied),
      () => {},
    );
  };
}

// The service worker caches whatever passes through it, but it wasn't there for this first
// page load. Once it is in control, re-request the app shell and the coming week of puzzles.
async function enableOffline() {
  // Dev server has no built files to cache; a Capacitor app ships its files in the bundle.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || 'Capacitor' in window) return;
  await navigator.serviceWorker.register('sw.js');
  if (!navigator.serviceWorker.controller) {
    await new Promise((done) => navigator.serviceWorker.addEventListener('controllerchange', done, { once: true }));
  }
  // Loaded files, plus what the <head> links to (manifest and icons are only fetched on demand).
  const shell = [
    ...performance.getEntriesByType('resource').map((entry) => entry.name),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[href]'), (link) => link.href),
  ].filter((url) => url.startsWith(location.origin));
  const week = Array.from({ length: 8 }, (_, i) => `puzzles/${today(i)}.json`);
  for (const url of ['./', ...shell, ...week]) fetch(url).catch(() => {});
}

async function start() {
  $('title').textContent = t.title;
  const res = await fetch(`puzzles/${today()}.json`).catch(() => null);
  if (!res?.ok) return void ($('panel').textContent = t.noPuzzle);
  puzzle = await res.json();
  if (save.date !== puzzle.date) Object.assign(save, { date: puzzle.date, guesses: [] });
  if (save.guesses.length < puzzle.rounds.length) play(save.guesses.length);
  else results();
}

start().then(enableOffline);
