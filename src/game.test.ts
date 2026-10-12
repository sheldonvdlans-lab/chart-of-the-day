import assert from 'node:assert/strict';
import test from 'node:test';
import { bandOf, emoji, grade, liveStreak, recordDay, seal, shareText, unseal } from './game.ts';

test('bandOf', () => {
  assert.deepEqual([0.5, -1.99, 2, -4.99, 5, 9.99, -10, 250].map(bandOf), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('seal round-trips and hides the symbol', () => {
  const secret = { symbol: 'BTCUSDT', start: 1583971200, future: [[0, 1.5, -2.25, -1]] as [number, number, number, number][] };
  const sealed = seal(secret, '2026-10-121d');
  assert.deepEqual(unseal(sealed, '2026-10-121d'), secret);
  assert.ok(!atob(sealed).includes('BTC'));
});

test('grade', () => {
  const g = (up: boolean, band: number, move: number) => { const r = grade({ up, band }, move); return `${r.points}${emoji(r)}`; };
  assert.equal(g(true, 1, 3), '100🟩🟩');
  assert.equal(g(true, 2, 3), '75🟩🟨');
  assert.equal(g(false, 3, -1), '50🟩⬛');
  assert.equal(g(false, 1, 3), '0🟥⬛'); // right band, wrong direction
});

test('streak and share text', () => {
  const save = { date: '', guesses: [], played: 0, points: 0, dirHits: 0, streak: 0, best: 0, lastDone: '' };
  const grades = [grade({ up: true, band: 1 }, 3), grade({ up: true, band: 0 }, 3), grade({ up: false, band: 1 }, 3)];
  recordDay(save, '2026-12-31', grades);
  recordDay(save, '2027-01-01', grades);
  assert.deepEqual([save.streak, save.best, save.played, save.points, save.dirHits], [2, 2, 2, 350, 4]);
  assert.equal(liveStreak(save, '2027-01-02'), 2); // yesterday still counts
  assert.equal(liveStreak(save, '2027-01-03'), 0); // skipped a day
  recordDay(save, '2027-01-03', grades);
  assert.deepEqual([save.streak, save.best], [1, 2]);
  assert.equal(
    shareText('Chart of the Day', 42, ['1h', '4h', '1d'], grades, 5, 'https://example.com/'),
    'Chart of the Day #42 — 175/300\n1H 🟩🟩\n4H 🟩🟨\n1D 🟥⬛\n🔥 5\nhttps://example.com/',
  );
});
