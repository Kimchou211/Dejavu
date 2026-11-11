/**
 * Order-flow analytics for the ICT engine. Pure functions, no network.
 *
 * DATA QUALITY (be honest about what the numbers mean):
 *  - real_trades  : the candle carries buy_volume / sell_volume (exchange taker-buy split, e.g. Binance klines).
 *                   Delta is the real aggressor imbalance. Full weight.
 *  - futures_proxy: volume comes from a related futures contract (e.g. GC=F for XAUUSD spot) and the buy/sell
 *                   split is ESTIMATED from candle shape. Directional hints only. Reduced weight.
 *  - ohlcv_proxy  : volume exists on the candle but the split is estimated from candle shape. Lowest weight.
 *  - none         : no usable volume. Order flow is switched off and adds 0 points.
 * Spot XAUUSD has no centralised volume, so true footprint/DOM/heat-map order flow is NOT possible for gold
 * with the current feeds. This module never pretends otherwise.
 */

export type FlowQuality = "real_trades" | "futures_proxy" | "ohlcv_proxy" | "none";

export const FLOW_WEIGHT: Record<FlowQuality, number> = {
  real_trades: 1,
  futures_proxy: 0.6,
  ohlcv_proxy: 0.45,
  none: 0,
};

export interface FlowCandle {
  timestamp_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  [key: string]: unknown;
}

export interface FlowSeries {
  vol: number[];
  buy: number[];
  sell: number[];
  delta: number[];
  ratio: number[];
  cvd: number[];
  has: boolean[];
  quality: FlowQuality;
}

export type Absorption = "BULLISH" | "BEARISH" | null;

export interface OrderFlowSnapshot {
  available: boolean;
  quality: FlowQuality;
  weight: number;
  source: string | null;
  note: string;
  bars_with_volume: number;
  bias: "BUYERS" | "SELLERS" | "BALANCED" | null;
  delta_ratio_5: number | null;
  delta_ratio_20: number | null;
  rvol_last: number | null;
  absorption_last: Absorption;
  vwap: number | null;
  price_vs_vwap: "ABOVE" | "BELOW" | "AT" | null;
  poc: number | null;
  vah: number | null;
  val: number | null;
  /** Last bars for the UI mini chart: delta as a fraction of volume (-1..1) and relative volume. */
  recent: Array<{ ts: number; delta_ratio: number; rvol: number }>;
}

export interface FlowItem { text: string; points: number }

export interface SetupFlow {
  available: boolean;
  quality: FlowQuality;
  adjustment: number;
  confirmation: "CONFIRMED" | "PENDING" | "AGAINST" | "UNAVAILABLE";
  items: FlowItem[];
}

export interface FlowSetupInput {
  direction: "bull" | "bear";
  sweep_i: number;
  sweep_confirm_i: number;
  event_i: number;
  zone: [number, number];
  entry: number;
  atr: number;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Estimate the aggressor split of one candle from its shape (close location + body direction).
 * This is a heuristic, used only when no exchange taker split exists.
 */
export function splitVolume(open: number, high: number, low: number, close: number, volume: number): { buy: number; sell: number } {
  if (!(volume > 0)) return { buy: 0, sell: 0 };
  const range = high - low;
  if (!(range > 0)) return { buy: volume / 2, sell: volume / 2 };
  const closeLocation = (close - low) / range;
  const bodyShare = 0.5 + 0.5 * (close - open) / range;
  const share = Math.min(1, Math.max(0, 0.6 * closeLocation + 0.4 * bodyShare));
  return { buy: volume * share, sell: volume * (1 - share) };
}

export function buildFlowSeries(bars: FlowCandle[]): FlowSeries {
  const n = bars.length;
  const vol = new Array<number>(n).fill(0), buy = new Array<number>(n).fill(0), sell = new Array<number>(n).fill(0);
  const delta = new Array<number>(n).fill(0), ratio = new Array<number>(n).fill(0), cvd = new Array<number>(n).fill(0);
  const has = new Array<boolean>(n).fill(false);
  const tags = { real_trades: 0, futures_proxy: 0, ohlcv_proxy: 0 };
  let running = 0;
  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const bv = num(bar.buy_volume), sv = num(bar.sell_volume), tv = num(bar.volume);
    let b = 0, s = 0, kind: keyof typeof tags | null = null;
    if (bv !== null && sv !== null && bv >= 0 && sv >= 0 && bv + sv > 0) {
      b = bv; s = sv;
      kind = bar.flow_quality === "futures_proxy" ? "futures_proxy" : bar.flow_quality === "ohlcv_proxy" ? "ohlcv_proxy" : "real_trades";
    } else if (tv !== null && tv > 0) {
      ({ buy: b, sell: s } = splitVolume(bar.open, bar.high, bar.low, bar.close, tv));
      kind = bar.flow_quality === "futures_proxy" ? "futures_proxy" : "ohlcv_proxy";
    }
    if (kind) {
      has[i] = true; buy[i] = b; sell[i] = s; vol[i] = b + s; delta[i] = b - s;
      ratio[i] = vol[i] > 0 ? delta[i] / vol[i] : 0;
      if (i >= n - 60) tags[kind]++;
    }
    running += delta[i];
    cvd[i] = running;
  }
  const withVolume = tags.real_trades + tags.futures_proxy + tags.ohlcv_proxy;
  let quality: FlowQuality = "none";
  if (withVolume >= Math.min(20, Math.ceil(0.5 * Math.min(60, n)))) {
    quality = tags.real_trades >= tags.futures_proxy && tags.real_trades >= tags.ohlcv_proxy ? "real_trades"
      : tags.futures_proxy >= tags.ohlcv_proxy ? "futures_proxy" : "ohlcv_proxy";
  }
  return { vol, buy, sell, delta, ratio, cvd, has, quality };
}

/** Volume of bar i relative to the average of up to `lookback` previous bars that have volume. 1 when unknown. */
export function relativeVolume(series: FlowSeries, i: number, lookback = 20): number {
  if (!series.has[i]) return 1;
  let sum = 0, count = 0;
  for (let j = i - 1; j >= 0 && count < lookback; j--) {
    if (series.has[j]) { sum += series.vol[j]; count++; }
  }
  if (count < 5 || sum <= 0) return 1;
  return series.vol[i] / (sum / count);
}

export function absorptionAt(bars: FlowCandle[], series: FlowSeries, i: number, atr: number): Absorption {
  if (i < 0 || i >= bars.length || !series.has[i] || !(atr > 0)) return null;
  const bar = bars[i], range = bar.high - bar.low;
  if (!(range > 0) || range > 0.7 * atr || relativeVolume(series, i) < 1.5) return null;
  const upper = (bar.high - Math.max(bar.open, bar.close)) / range;
  const lower = (Math.min(bar.open, bar.close) - bar.low) / range;
  const real = series.quality === "real_trades";
  if (upper >= 0.4 || (real && series.ratio[i] > 0.15 && bar.close < (bar.high + bar.low) / 2)) return "BEARISH";
  if (lower >= 0.4 || (real && series.ratio[i] < -0.15 && bar.close > (bar.high + bar.low) / 2)) return "BULLISH";
  return null;
}

/** Volume-weighted average price anchored at 00:00 UTC of the last bar's day. */
export function sessionVwap(bars: FlowCandle[], series: FlowSeries): number | null {
  if (!bars.length) return null;
  const last = new Date(bars[bars.length - 1].timestamp_ms);
  const anchor = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  let pv = 0, v = 0, count = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].timestamp_ms < anchor || !series.has[i]) continue;
    const typical = (bars[i].high + bars[i].low + bars[i].close) / 3;
    pv += typical * series.vol[i]; v += series.vol[i]; count++;
  }
  return count >= 3 && v > 0 ? pv / v : null;
}

/** Point of control and 70% value area from candle volume spread uniformly across each candle's range. */
export function volumeProfile(bars: FlowCandle[], series: FlowSeries, bucket: number, window = 120):
  { poc: number; vah: number; val: number } | null {
  if (!(bucket > 0)) return null;
  const start = Math.max(0, bars.length - window), hist = new Map<number, number>();
  let total = 0;
  for (let i = start; i < bars.length; i++) {
    if (!series.has[i]) continue;
    const lo = Math.floor(bars[i].low / bucket), hi = Math.floor(bars[i].high / bucket), span = hi - lo + 1;
    for (let k = lo; k <= hi; k++) hist.set(k, (hist.get(k) || 0) + series.vol[i] / span);
    total += series.vol[i];
  }
  if (!hist.size || total <= 0) return null;
  const keys = [...hist.keys()].sort((a, b) => a - b);
  let pocKey = keys[0];
  for (const key of keys) if ((hist.get(key) || 0) > (hist.get(pocKey) || 0)) pocKey = key;
  let lowKey = pocKey, highKey = pocKey, covered = hist.get(pocKey) || 0;
  while (covered < 0.7 * total) {
    const below = hist.get(lowKey - 1) || 0, above = hist.get(highKey + 1) || 0;
    if (below === 0 && above === 0) {
      if (lowKey <= keys[0] && highKey >= keys[keys.length - 1]) break;
      if (lowKey > keys[0]) lowKey--; else highKey++;
      continue;
    }
    if (above >= below) { highKey++; covered += above; } else { lowKey--; covered += below; }
  }
  const mid = (key: number) => (key + 0.5) * bucket;
  return { poc: round(mid(pocKey)), vah: round((highKey + 1) * bucket), val: round(lowKey * bucket) };
}

const NO_FLOW = (note: string, source: string | null = null): OrderFlowSnapshot => ({
  available: false, quality: "none", weight: 0, source, note, bars_with_volume: 0, bias: null,
  delta_ratio_5: null, delta_ratio_20: null, rvol_last: null, absorption_last: null,
  vwap: null, price_vs_vwap: null, poc: null, vah: null, val: null, recent: [],
});

export function unavailableOrderFlow(note: string, source: string | null = null): OrderFlowSnapshot {
  return NO_FLOW(note, source);
}

function netRatio(series: FlowSeries, from: number, to: number): number {
  let d = 0, v = 0;
  for (let i = Math.max(0, from); i <= to && i < series.vol.length; i++) {
    if (!series.has[i]) continue;
    d += series.delta[i]; v += series.vol[i];
  }
  return v > 0 ? d / v : 0;
}

export function computeOrderFlow(bars: FlowCandle[], atr: number, source: string | null = null):
  { snapshot: OrderFlowSnapshot; series: FlowSeries } {
  const series = buildFlowSeries(bars);
  if (series.quality === "none") {
    return {
      series,
      snapshot: NO_FLOW("No usable volume on these candles; order flow is off and adds no points. Spot gold has no centralised volume — configure a futures volume feed.", source),
    };
  }
  const n = bars.length, price = bars[n - 1].close;
  const r5 = netRatio(series, n - 5, n - 1), r20 = netRatio(series, n - 20, n - 1);
  const blended = 0.6 * r5 + 0.4 * r20;
  const vwap = sessionVwap(bars, series);
  const profile = volumeProfile(bars, series, Math.max(0.25 * atr, 1e-6));
  const tolerance = Math.max(0.1 * atr, 1e-9);
  const notes: Record<FlowQuality, string> = {
    real_trades: "Real aggressor (taker buy/sell) volume from the exchange feed.",
    futures_proxy: "Volume from a related futures contract; buy/sell split is estimated from candle shape (directional hint only).",
    ohlcv_proxy: "Buy/sell split is estimated from candle shape (lowest confidence).",
    none: "",
  };
  const recent = [];
  for (let i = Math.max(0, n - 30); i < n; i++) {
    recent.push({ ts: bars[i].timestamp_ms, delta_ratio: round(series.ratio[i], 3), rvol: round(relativeVolume(series, i), 2) });
  }
  return {
    series,
    snapshot: {
      available: true, quality: series.quality, weight: FLOW_WEIGHT[series.quality], source,
      note: notes[series.quality],
      bars_with_volume: series.has.filter(Boolean).length,
      bias: blended > 0.1 ? "BUYERS" : blended < -0.1 ? "SELLERS" : "BALANCED",
      delta_ratio_5: round(r5, 3), delta_ratio_20: round(r20, 3),
      rvol_last: round(relativeVolume(series, n - 1), 2),
      absorption_last: absorptionAt(bars, series, n - 1, atr),
      vwap: vwap === null ? null : round(vwap),
      price_vs_vwap: vwap === null ? null : Math.abs(price - vwap) <= tolerance ? "AT" : price > vwap ? "ABOVE" : "BELOW",
      poc: profile?.poc ?? null, vah: profile?.vah ?? null, val: profile?.val ?? null,
      recent,
    },
  };
}

/**
 * Score how much the order flow supports (or contradicts) one engine setup.
 * Everything is relative to the setup direction; the result is capped at +/-15 and scaled by data quality.
 */
export function evaluateSetupFlow(bars: FlowCandle[], series: FlowSeries, input: FlowSetupInput): SetupFlow {
  if (series.quality === "none") return { available: false, quality: "none", adjustment: 0, confirmation: "UNAVAILABLE", items: [] };
  const { direction, sweep_i, sweep_confirm_i, event_i, zone, entry, atr } = input;
  const n = bars.length, sign = direction === "bull" ? 1 : -1;
  const items: FlowItem[] = [];
  const add = (text: string, points: number) => items.push({ text, points });
  const wanted = direction === "bull" ? "BULLISH" : "BEARISH";

  // A. The liquidity sweep: did real participation drive the stop-run, and did flow fail to confirm the new extreme?
  const sweepEnd = Math.min(n - 1, Math.max(sweep_i, sweep_confirm_i));
  let maxRvol = 1, absorbed = false;
  for (let i = sweep_i; i <= sweepEnd; i++) {
    maxRvol = Math.max(maxRvol, relativeVolume(series, i));
    if (absorptionAt(bars, series, i, atr) === wanted) absorbed = true;
  }
  if (maxRvol >= 1.5) add(`Sweep ran on ${maxRvol.toFixed(1)}x relative volume (genuine stop-run, not a thin drift)`, 4);
  const priorFrom = Math.max(0, sweep_i - 30);
  if (sweep_i > priorFrom) {
    let priorExtreme = series.cvd[priorFrom];
    for (let i = priorFrom; i < sweep_i; i++) priorExtreme = direction === "bear" ? Math.max(priorExtreme, series.cvd[i]) : Math.min(priorExtreme, series.cvd[i]);
    const diverged = direction === "bear" ? series.cvd[sweepEnd] < priorExtreme : series.cvd[sweepEnd] > priorExtreme;
    if (diverged) add(`CVD did not confirm the ${direction === "bear" ? "sweep high" : "sweep low"} (${direction === "bear" ? "bearish" : "bullish"} delta divergence)`, 4);
  }
  if (absorbed) add(`${direction === "bear" ? "Sellers" : "Buyers"} absorbed the sweep (high volume, small range, rejection wick)`, 3);

  // B. Displacement leg from the sweep to the structure break: net flow should agree with the setup.
  const leg = netRatio(series, sweep_i + 1, event_i);
  const legAligned = leg * sign;
  if (legAligned >= 0.25) add(`Strong ${direction === "bear" ? "selling" : "buying"} delta through the MSS leg (${Math.abs(leg * 100).toFixed(0)}% of volume)`, 7);
  else if (legAligned >= 0.1) add(`${direction === "bear" ? "Selling" : "Buying"} delta supports the MSS leg (${Math.abs(leg * 100).toFixed(0)}% of volume)`, 4);
  else if (legAligned <= -0.1) add(`Net flow through the MSS leg opposes the setup (${Math.abs(leg * 100).toFixed(0)}% of volume)`, -6);

  // C. The pull-back so far: healthy retracements are lighter and not aggressively opposed.
  if (n - 1 >= event_i + 2) {
    const legBars = [], retBars = [];
    for (let i = sweep_i + 1; i <= event_i; i++) if (series.has[i]) legBars.push(series.vol[i]);
    for (let i = event_i + 1; i < n; i++) if (series.has[i]) retBars.push(series.vol[i]);
    if (legBars.length && retBars.length) {
      const legAvg = legBars.reduce((a, b) => a + b, 0) / legBars.length;
      const retAvg = retBars.reduce((a, b) => a + b, 0) / retBars.length;
      const retRatio = netRatio(series, event_i + 1, n - 1) * sign;
      if (legAvg > 0 && retAvg / legAvg >= 1.3 && retRatio <= -0.2) add("Pull-back is on heavy opposing flow (reversal risk, not a simple retrace)", -8);
      else if (legAvg > 0 && retAvg / legAvg <= 0.8) add("Pull-back is on lighter volume than the displacement (profit-taking, not reversal)", 3);
    }
  }

  // D. Reaction at the entry zone.
  const [zoneLow, zoneHigh] = zone;
  let touched = false;
  for (let i = Math.max(event_i + 1, n - 3); i < n; i++) if (bars[i].low <= zoneHigh && bars[i].high >= zoneLow) touched = true;
  let confirmation: SetupFlow["confirmation"] = "PENDING";
  if (touched) {
    const last = bars[n - 1], r2 = netRatio(series, n - 2, n - 1) * sign;
    const rejectedSide = direction === "bear" ? last.close <= zoneHigh : last.close >= zoneLow;
    const reacted = absorptionAt(bars, series, n - 1, atr) === wanted || absorptionAt(bars, series, n - 2, atr) === wanted;
    if ((r2 >= 0.1 || reacted) && rejectedSide) {
      confirmation = "CONFIRMED";
      add(reacted ? "Absorption at the entry zone (high volume, price refuses to continue)" : `Delta flipped ${direction === "bear" ? "to sellers" : "to buyers"} at the entry zone`, 6);
    } else if (r2 <= -0.25 && relativeVolume(series, n - 1) >= 1.3) {
      confirmation = "AGAINST";
      add("Aggressive opposing flow at the entry zone (do not fade it)", -8);
    }
  }

  // E. Location versus session VWAP.
  const vwap = sessionVwap(bars, series);
  if (vwap !== null && Math.abs(entry - vwap) > 0.05 * atr) {
    const favourable = direction === "bear" ? entry > vwap : entry < vwap;
    add(`Entry zone is ${entry > vwap ? "above" : "below"} session VWAP`, favourable ? 3 : -2);
  }

  const raw = items.reduce((sum, item) => sum + item.points, 0);
  const weight = FLOW_WEIGHT[series.quality];
  const adjustment = Math.round(Math.max(-15, Math.min(15, raw)) * weight);
  return { available: true, quality: series.quality, adjustment, confirmation, items };
}
