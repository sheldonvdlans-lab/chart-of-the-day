import { CandlestickSeries, createChart, LineStyle } from 'lightweight-charts';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import { pct } from './game.ts';
import type { Candle } from './types.ts';

let chart: IChartApi | undefined;

/** Draws `candles` with `slots - candles.length` empty slots to the right for the future. */
export function showChart(el: HTMLElement, candles: Candle[], slots: number) {
  chart?.remove();
  chart = createChart(el, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: '#8b949e', attributionLogo: true },
    grid: { vertLines: { visible: false }, horzLines: { color: '#1c222b' } },
    timeScale: { visible: false }, // the date would give the chart away
    rightPriceScale: { borderVisible: false },
    crosshair: { vertLine: { labelVisible: false } },
    handleScroll: false, // leave touch gestures to the page
    handleScale: false,
    localization: { priceFormatter: (p: number) => pct(p, 1) },
  });
  const series = chart.addSeries(CandlestickSeries, {
    upColor: '#26a69a',
    downColor: '#ef5350',
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
    borderVisible: false,
  });
  series.createPriceLine({ price: 0, color: '#8b949e', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });

  // Fake, evenly spaced times: the real ones stay sealed and the time axis is hidden anyway.
  const time = (i: number) => (i * 86400) as UTCTimestamp;
  const draw = (shown: Candle[]) => {
    series.setData(
      Array.from({ length: slots }, (_, i) => {
        const c = shown[i];
        return c ? { time: time(i), open: c[0], high: c[1], low: c[2], close: c[3] } : { time: time(i) };
      }),
    );
    // Pin the view to all slots; by default the chart ends at the last real candle.
    chart!.timeScale().setVisibleLogicalRange({ from: -0.5, to: slots - 0.5 });
  };
  draw(candles);

  /** Plays the future candles into the empty slots, one at a time. */
  return async (future: Candle[]) => {
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let n = instant ? future.length : 1; n <= future.length; n++) {
      draw([...candles, ...future.slice(0, n)]);
      if (n < future.length) await new Promise((done) => setTimeout(done, 250));
    }
  };
}
