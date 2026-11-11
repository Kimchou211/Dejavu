/**
 * Volume sources for order flow. Failures here must never break a scan: callers treat any error as "no order flow".
 *
 *  BTCUSD -> Binance spot klines (BTCUSDT). Each kline carries taker-buy base volume, i.e. the real aggressor
 *            split, so delta/CVD are genuine. Falls back to the public data-api.binance.vision mirror.
 *  XAUUSD -> Yahoo Finance GC=F (COMEX gold futures). Real traded volume, but no aggressor split, so the split is
 *            estimated from candle shape (quality "futures_proxy"). Spot gold has no centralised volume.
 */

import type { FlowCandle, FlowQuality } from "./order-flow.ts";

export interface FlowVolumeBar {
  timestamp_ms: number;
  volume: number;
  buy_volume?: number;
  sell_volume?: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface FlowFeed {
  symbol: string;
  tf: string;
  source: string;
  quality: FlowQuality;
  bars: FlowVolumeBar[];
}

const INTERVALS: Record<string, { binance: string; yahoo: string; range: string; minutes: number; cache_seconds: number }> = {
  M1: { binance: "1m", yahoo: "1m", range: "5d", minutes: 1, cache_seconds: 30 },
  M5: { binance: "5m", yahoo: "5m", range: "5d", minutes: 5, cache_seconds: 45 },
  M15: { binance: "15m", yahoo: "15m", range: "1mo", minutes: 15, cache_seconds: 90 },
};

const CACHE = new Map<string, { at: number; feed: FlowFeed }>();

function finite(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "boolean" || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parse Binance /api/v3/klines rows: [openTime, o, h, l, c, vol, closeTime, quoteVol, trades, takerBuyBase, ...]. */
export function parseBinanceKlines(rows: unknown): FlowVolumeBar[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): FlowVolumeBar[] => {
    if (!Array.isArray(row)) return [];
    const ts = finite(row[0]), open = finite(row[1]), high = finite(row[2]), low = finite(row[3]), close = finite(row[4]);
    const volume = finite(row[5]), takerBuy = finite(row[9]);
    if (ts === null || open === null || high === null || low === null || close === null || volume === null || takerBuy === null) return [];
    if (high < low || volume < 0 || takerBuy < 0 || takerBuy > volume * 1.0001) return [];
    const buy = Math.min(takerBuy, volume);
    return [{ timestamp_ms: ts, open, high, low, close, volume, buy_volume: buy, sell_volume: volume - buy }];
  });
}

/** Parse a Yahoo Finance v8 chart payload into volume bars (no aggressor split). */
export function parseYahooVolume(payload: unknown): FlowVolumeBar[] {
  const result = (payload as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<Record<string, unknown>> } }> | null } })
    ?.chart?.result?.[0];
  if (!result) return [];
  const quote = result.indicators?.quote?.[0] || {};
  const stamps = result.timestamp || [];
  return stamps.flatMap((stamp, index): FlowVolumeBar[] => {
    const get = (field: string): number | null => {
      const values = quote[field];
      return Array.isArray(values) ? finite(values[index]) : null;
    };
    const open = get("open"), high = get("high"), low = get("low"), close = get("close"), volume = get("volume");
    if (open === null || high === null || low === null || close === null || high < low) return [];
    if (volume === null || volume <= 0) return [];
    return [{ timestamp_ms: stamp * 1000, open, high, low, close, volume }];
  });
}

async function fetchBinance(tf: string): Promise<FlowFeed> {
  const interval = INTERVALS[tf].binance;
  const errors: string[] = [];
  for (const host of ["https://api.binance.com", "https://data-api.binance.vision"]) {
    try {
      const url = new URL(`${host}/api/v3/klines`);
      url.searchParams.set("symbol", "BTCUSDT");
      url.searchParams.set("interval", interval);
      url.searchParams.set("limit", "500");
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bars = parseBinanceKlines(await response.json());
      if (bars.length < 30) throw new Error("too few klines");
      return { symbol: "BTCUSD", tf, source: `Binance taker flow · BTCUSDT${host.includes("vision") ? " (mirror)" : ""}`, quality: "real_trades", bars };
    } catch (error) {
      errors.push(`${host.replace("https://", "")}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Binance volume unavailable (${errors.join(" | ")})`);
}

async function fetchGoldFutures(tf: string): Promise<FlowFeed> {
  const options = INTERVALS[tf];
  const url = new URL("https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF");
  url.searchParams.set("range", options.range);
  url.searchParams.set("interval", options.yahoo);
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; JD-ANALYSIS/1.1)", Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Yahoo GC=F HTTP ${response.status}`);
  const bars = parseYahooVolume(await response.json());
  if (bars.length < 30) throw new Error("GC=F returned too few volume candles");
  return { symbol: "XAUUSD", tf, source: "COMEX GC=F futures volume (split estimated)", quality: "futures_proxy", bars };
}

export async function fetchFlowFeed(symbol: string, tf: string): Promise<FlowFeed> {
  if (!Object.hasOwn(INTERVALS, tf)) throw new Error(`Order flow does not support timeframe ${tf}`);
  const key = `${symbol}:${tf}`, cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < INTERVALS[tf].cache_seconds * 1000) return cached.feed;
  const feed = symbol === "BTCUSD" ? await fetchBinance(tf) : symbol === "XAUUSD" ? await fetchGoldFutures(tf) : null;
  if (!feed) throw new Error(`No order-flow source for ${symbol}`);
  CACHE.set(key, { at: Date.now(), feed });
  return feed;
}

/**
 * Attach volume fields to the price candles by timestamp (floored to the timeframe). Returns NEW objects; the cached
 * price feed is never mutated. Candles with no matching volume keep no volume fields and are ignored by the analytics.
 * For futures_proxy the split is computed from the FUTURES candle shape, because that is where the volume traded.
 */
export function mergeFlowIntoBars<T extends FlowCandle>(bars: T[], feed: FlowFeed): Array<T & Partial<FlowCandle>> {
  const step = INTERVALS[feed.tf].minutes * 60_000;
  const byTime = new Map<number, FlowVolumeBar>();
  for (const bar of feed.bars) byTime.set(Math.floor(bar.timestamp_ms / step) * step, bar);
  return bars.map((bar) => {
    const match = byTime.get(Math.floor(bar.timestamp_ms / step) * step);
    if (!match) return bar;
    const merged: Record<string, unknown> = { ...bar, volume: match.volume, flow_quality: feed.quality };
    if (match.buy_volume !== undefined && match.sell_volume !== undefined) {
      merged.buy_volume = match.buy_volume;
      merged.sell_volume = match.sell_volume;
    } else {
      // Pre-compute the split on the futures candle so the analytics do not use the spot candle's shape.
      const range = match.high - match.low;
      let share = 0.5;
      if (range > 0) {
        const closeLocation = (match.close - match.low) / range;
        const bodyShare = 0.5 + 0.5 * (match.close - match.open) / range;
        share = Math.min(1, Math.max(0, 0.6 * closeLocation + 0.4 * bodyShare));
      }
      merged.buy_volume = Math.round(match.volume * share * 100) / 100;
      merged.sell_volume = Math.round(match.volume * (1 - share) * 100) / 100;
      merged.flow_quality = "futures_proxy";
    }
    return merged as T & Partial<FlowCandle>;
  });
}
