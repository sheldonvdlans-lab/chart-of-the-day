import './style.css';
import { showChart } from './chart.ts';
import { BAND_EDGES, bandLabel, emoji, grade, pct, today, unseal } from './game.ts';
import { t } from './strings.ts';
import type { DailyPuzzle } from './types.ts';

const $ = (id: string) => document.getElementById(id)!;
const radio = (name: string, value: string | number, label: string) =>
  `<label><input type="radio" name="${name}" value="${value}" required><span>${label}</span></label>`;

async function start() {
  $('title').textContent = t.title;
  const date = today();
  const res = await fetch(`puzzles/${date}.json`).catch(() => null);
  if (!res?.ok) return void ($('panel').textContent = t.noPuzzle);
  const puzzle: DailyPuzzle = await res.json();
  const round = puzzle.rounds[0];
  const secret = unseal(round.secret, date + round.interval);
  const slots = round.candles.length + secret.future.length;

  $('round').textContent = t.round(1, puzzle.rounds.length, round.interval.toUpperCase());
  showChart($('chart'), round.candles, slots);
  $('panel').innerHTML = `<form>
    <p>${t.question}</p>
    <fieldset><legend>${t.direction}</legend>${radio('up', 1, t.up)}${radio('up', 0, t.down)}</fieldset>
    <fieldset><legend>${t.band}</legend>${[...BAND_EDGES, 0].map((_, band) => radio('band', band, bandLabel(band))).join('')}</fieldset>
    <button>${t.lockIn}</button>
  </form>`;
  $('panel').querySelector('form')!.onsubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    const move = secret.future[secret.future.length - 1][3];
    const result = grade({ up: form.get('up') === '1', band: Number(form.get('band')) }, move);
    showChart($('chart'), [...round.candles, ...secret.future], slots);
    $('panel').innerHTML = `<p class="result">${emoji(result)} ${t.closed(pct(move))} · ${t.points(result.points)}</p>`;
  };
}

start();
