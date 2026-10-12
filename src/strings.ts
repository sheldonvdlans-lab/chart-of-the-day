// All UI copy lives here. For Dutch: add an `nl` object with the same keys and pick by navigator.language.
const en = {
  title: 'Chart of the Day',
  round: (n: number, total: number, interval: string) => `Round ${n}/${total} · ${interval} candles`,
  question: 'Where does the price close 10 candles from now?',
  direction: 'Direction',
  up: '▲ Up',
  down: '▼ Down',
  band: 'Size of the move',
  lockIn: 'Lock in',
  closed: (move: string) => `Closed ${move}`,
  points: (n: number) => `${n} pts`,
  noPuzzle: 'No chart today. Check back tomorrow.',
};

export const t = en;
