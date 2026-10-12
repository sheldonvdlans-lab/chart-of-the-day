import assert from 'node:assert/strict';
import test from 'node:test';
import { bandOf, seal, unseal } from './game.ts';

test('bandOf', () => {
  assert.deepEqual([0.5, -1.99, 2, -4.99, 5, 9.99, -10, 250].map(bandOf), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('seal round-trips and hides the symbol', () => {
  const secret = { symbol: 'BTCUSDT', start: 1583971200, future: [[0, 1.5, -2.25, -1]] as [number, number, number, number][] };
  const sealed = seal(secret, '2026-10-121d');
  assert.deepEqual(unseal(sealed, '2026-10-121d'), secret);
  assert.ok(!atob(sealed).includes('BTC'));
});
