import './style.css';
import { showChart } from './chart.ts';
import { BAND_EDGES, INTERVAL_MS, bandLabel, emoji, grade, pct, today, unseal } from './game.ts';
import { t } from './strings.ts';
import type { DailyPuzzle, Guess } from './types.ts';

const $ = (id: string) => document.getElementById(id)!;
const radio = (name: string, value: string | number, label: string) =>
  `<label><input type="radio" name="${name}" value="${value}" required><span>${label}</span></label>`;

let puzzle: DailyPuzzle;
const guesses: Guess[] = [];

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
    grade: guesses[r] && grade(guesses[r], move),
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
    const guess = (guesses[r] = { up: form.get('up') === '1', band: Number(form.get('band')) });
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
      .join('')}`;
  $('panel')
    .querySelectorAll<HTMLElement>('.round')
    .forEach((button, r) => (button.onclick = () => results(r)));
}

async function start() {
  $('title').textContent = t.title;
  const res = await fetch(`puzzles/${today()}.json`).catch(() => null);
  if (!res?.ok) return void ($('panel').textContent = t.noPuzzle);
  puzzle = await res.json();
  play(0);
}

start();
