import type { Save } from './types.ts';

// Plain localStorage: also works in a Capacitor webview. Swap these two functions
// for @capacitor/preferences if the OS ever evicts it.
const KEY = 'chart-of-the-day';
const fresh = (): Save => ({ date: '', guesses: [], played: 0, points: 0, dirHits: 0, streak: 0, best: 0, lastDone: '' });

export function load(): Save {
  try {
    return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return fresh(); // storage blocked or corrupt: play without history
  }
}

export function store(save: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // storage blocked or full: the game still works, it just won't remember
  }
}
