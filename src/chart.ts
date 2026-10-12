import { CandlestickSeries, createChart, LineStyle } from 'lightweight-charts';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import { pct } from './game.ts';
import type { Candle } from './types.ts';

const UP = '#26a69a';
const DOWN = '#ef5350';
const MUTED = '#8b949e';
// The price axis is symmetric around the anchor so the framing never hints at a direction:
// it reaches as far as the candles stray from 0%, plus some headroom, and never less than MIN_REACH %.
const HEADROOM = 1.15;
const MIN_REACH = 3;

let chart: IChartApi | undefined;
let observer: ResizeObserver | undefined;

/**
 * Draws `candles` and leaves marked, empty slots to the right for `future`.
 * Returns a function that plays the future candles into those slots; `revealed` shows them right away.
 */
export function showChart(el: HTMLElement, candles: Candle[], future: Candle[], revealed = false) {
  const slots = candles.length + future.length;
  chart?.remove();
  el.replaceChildren();
  chart = createChart(el, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: MUTED, attributionLogo: true },
    grid: { vertLines: { visible: false }, horzLines: { color: '#1c222b' } },
    timeScale: { visible: false }, // the date would give the chart away
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
    crosshair: { vertLine: { labelVisible: false } },
    handleScroll: false, // leave touch gestures to the page
    handleScale: false,
    localization: { priceFormatter: (p: number) => pct(p, 1) },
  });
  // Fake, evenly spaced times: the real ones stay sealed and the time axis is hidden anyway.
  const time = (i: number) => (i * 86400) as UTCTimestamp;
  let shown = candles;

  const series = chart.addSeries(CandlestickSeries, {
    upColor: UP,
    downColor: DOWN,
    wickUpColor: UP,
    wickDownColor: DOWN,
    borderVisible: false,
    priceLineVisible: false, // replaced by `close` below, which is coloured by outcome instead of by candle
    lastValueVisible: false,
    autoscaleInfoProvider: () => {
      const reach = Math.max(MIN_REACH, HEADROOM * Math.max(...shown.flatMap((c) => [c[1], -c[2]])));
      return { priceRange: { minValue: -reach, maxValue: reach } };
    },
  });
  series.createPriceLine({ price: 0, color: MUTED, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
  const close = series.createPriceLine({ price: 0, lineStyle: LineStyle.Dashed, lineWidth: 1 });

  const draw = (candlesToShow: Candle[]) => {
    shown = candlesToShow;
    series.setData(
      Array.from({ length: slots }, (_, i) => {
        const c = shown[i];
        return c ? { time: time(i), open: c[0], high: c[1], low: c[2], close: c[3] } : { time: time(i) };
      }),
    );
    const last = shown[shown.length - 1][3];
    close.applyOptions({ price: last, color: last > 0 ? UP : last < 0 ? DOWN : MUTED });
    layout();
    relayout(); // the price axis may have changed width
  };

  // The chart has no vertical markers, so the future zone is a tinted box laid over it.
  const zone = el.appendChild(document.createElement('div'));
  zone.className = 'future';
  const mine = chart;
  const layout = () => {
    if (chart !== mine) return; // replaced by a newer chart in the meantime
    // Pin the view to all slots; by default the chart ends at the last real candle and keeps
    // its candle width when resized. With the view pinned, every slot is an equal share of the pane.
    mine.timeScale().setVisibleLogicalRange({ from: -0.5, to: slots - 0.5 });
    const slot = mine.paneSize().width / slots;
    zone.style.left = `${slot * candles.length}px`;
    zone.style.width = `${slot * future.length}px`;
  };
  // Next frame: the chart only knows its pane width (minus the price axis) after it has painted.
  const relayout = () => requestAnimationFrame(layout);
  observer?.disconnect();
  observer = new ResizeObserver(relayout);
  observer.observe(el);
  draw(revealed ? [...candles, ...future] : candles);

  return async () => {
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let n = instant ? future.length : 1; n <= future.length; n++) {
      draw([...candles, ...future.slice(0, n)]);
      if (n < future.length) await new Promise((done) => setTimeout(done, 250));
    }
  };
}
