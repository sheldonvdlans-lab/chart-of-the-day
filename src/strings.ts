// All UI copy lives here. For Dutch: add an `nl` object with the same keys and pick by navigator.language.
const en = {
  locale: 'en',
  title: 'Chart of the Day',
  round: (n: number, total: number, interval: string) => `Round ${n}/${total} · ${interval} candles`,
  question: 'Where does the price close 10 candles from now?',
  direction: 'Direction',
  up: '▲ Up',
  down: '▼ Down',
  band: 'Size of the move',
  lockIn: 'Lock in',
  yourCall: (direction: string, band: string) => `Your call: ${direction} ${band}`,
  closed: (move: string) => `Closed ${move}`,
  points: (n: number) => `${n} pts`,
  next: 'Next chart',
  seeResults: 'See results',
  results: (n: number) => `#${n} · Results`,
  share: 'Share',
  copied: 'Copied to clipboard',
  nextIn: (hours: number, minutes: number) => `Next chart in ${hours}h ${minutes}m`,
  stats: { played: 'Played', average: 'Avg score', direction: 'Direction right', streak: 'Streak', best: 'Best streak' },
  noPuzzle: 'No chart today. Check back tomorrow.',
};

export const t = en;
