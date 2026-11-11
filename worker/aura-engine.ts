/**
 * Aura Scalper engine (v2.6).
 *
 * Deterministic, no AI, no look-ahead. M1 is the entry timeframe; M5/M15/H1/H4/D1 supply bias, zones and targets.
 * Every number it returns is computed from candles. "Early" here means: it arms a watch zone BEFORE price reacts,
 * and fires on the first M1 reaction (liquidity sweep + reclaim, or order-block rejection) rather than on a breakout.
 * It cannot predict the market, and the replay stats are in-sample on the fetched window, with no spread or slippage.
 */

export type AuraStyle = "normal" | "scalping" | "shadow";
export type AuraDir = "BUY" | "SELL";

export interface AuraBar {
  timestamp_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}
export type AuraFeeds = Record<string, AuraBar[] | undefined>;

export const AURA_TFS = ["M1", "M5", "M15", "H1", "H4", "D1"];
const TF_MS: Record<string, number> = { M1: 60_000, M5: 300_000, M15: 900_000, H1: 3_600_000, H4: 14_400_000, D1: 86_400_000 };
const TF_RANK: Record<string, number> = { M1: 0, M5: 1, M15: 2, H1: 3, H4: 4, D1: 5 };
const BIAS_WEIGHT: Record<string, number> = { M5: 1, M15: 1.5, H1: 2, H4: 1.5, D1: 1 };
const SWING_N: Record<string, number> = { M1: 3, M5: 3, M15: 3, H1: 2 };
const LIQ_POINTS: Record<string, number> = { M1: 0, M5: 4, M15: 8, H1: 12 };
const ATR_FLOOR: Record<string, number> = { XAUUSD: 0.05, BTCUSD: 4 };

export interface StyleParams {
  label: string;
  tag: string;
  min_score: number;
  cooldown: number;
  risk_mult: number;
  max_risk_mult: number;
  min_tp1_r: number;
  tp1_mult: number;
  tp2_mult: number;
  expire_bars: number;
  require_sweep: boolean;
  allow_momentum: boolean;
  max_counter: number; // most negative signed alignment tolerated (0 = must not be against bias)
  risk_tf: "M1" | "M5";
  fresh_bars: number;
}

export const AURA_STYLES: Record<AuraStyle, StyleParams> = {
  normal: { label: "Normal", tag: "BALANCED", min_score: 62, cooldown: 8, risk_mult: 1.0, max_risk_mult: 2.2, min_tp1_r: 1.0, tp1_mult: 1.0, tp2_mult: 2.5, expire_bars: 90, require_sweep: false, allow_momentum: true, max_counter: -35, risk_tf: "M5", fresh_bars: 3 },
  // Scalping is faster because it uses M1 ATR and a shorter M1/M5 execution loop,
  // not because the quality threshold is lowered. It still requires closed candles.
  scalping: { label: "Scalping M1", tag: "M1 FAST", min_score: 64, cooldown: 3, risk_mult: 0.9, max_risk_mult: 2.8, min_tp1_r: 1.0, tp1_mult: 1.0, tp2_mult: 1.7, expire_bars: 18, require_sweep: false, allow_momentum: true, max_counter: -25, risk_tf: "M1", fresh_bars: 2 },
  shadow: { label: "Shadow Pulse", tag: "SNIPER TRAP", min_score: 72, cooldown: 15, risk_mult: 0.8, max_risk_mult: 2.0, min_tp1_r: 1.2, tp1_mult: 1.2, tp2_mult: 3.0, expire_bars: 120, require_sweep: true, allow_momentum: false, max_counter: -10, risk_tf: "M5", fresh_bars: 3 },
};

export function normalizeStyle(value: string | null | undefined): AuraStyle {
  const v = (value || "scalping").toLowerCase().replace(/[\s_-]/g, "");
  if (v === "normal" || v === "balanced") return "normal";
  if (v === "shadow" || v === "shadowpulse" || v === "sniper") return "shadow";
  return "scalping";
}

/* ------------------------------------------------------------------ indicators */

function atrSeries(b: AuraBar[], period = 14): number[] {
  const tr: number[] = b.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close))));
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    sum += tr[i];
    if (i >= period) sum -= tr[i - period];
    out.push(sum / Math.min(i + 1, period));
  }
  return out;
}

function emaSeries(values: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) out.push(i === 0 ? values[0] : values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function rsiSeries(closes: number[], n = 14): number[] {
  const out: number[] = closes.map(() => 50);
  if (closes.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

interface Swing { idx: number; price: number; confirm: number; kind: "H" | "L" }

function swingsOf(b: AuraBar[], n: number): Swing[] {
  const out: Swing[] = [];
  for (let i = n; i < b.length - n; i++) {
    let hi = true, lo = true;
    for (let k = 1; k <= n; k++) {
      if (!(b[i].high > b[i - k].high && b[i].high >= b[i + k].high)) hi = false;
      if (!(b[i].low < b[i - k].low && b[i].low <= b[i + k].low)) lo = false;
    }
    if (hi) out.push({ idx: i, price: b[i].high, confirm: i + n, kind: "H" });
    if (lo) out.push({ idx: i, price: b[i].low, confirm: i + n, kind: "L" });
  }
  return out;
}

/* ------------------------------------------------------------------ per-timeframe context */

interface Ctx {
  tf: string;
  ms: number;
  bars: AuraBar[];
  atr: number[];
  ema9: number[];
  ema20: number[];
  ema50: number[];
  rsi: number[];
  swings: Swing[];
}

function buildCtx(tf: string, bars: AuraBar[]): Ctx {
  const closes = bars.map((x) => x.close);
  return {
    tf, ms: TF_MS[tf], bars, atr: atrSeries(bars), ema9: emaSeries(closes, 9), ema20: emaSeries(closes, 20), ema50: emaSeries(closes, 50),
    rsi: rsiSeries(closes), swings: swingsOf(bars, SWING_N[tf] ?? 2),
  };
}

/** Index of the last bar that is fully CLOSED at time t (bar open + tf length <= t); -1 if none. */
function closedIdx(c: Ctx, t: number): number {
  let lo = 0, hi = c.bars.length - 1, ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (c.bars[m].timestamp_ms + c.ms <= t) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans;
}

export interface TfBias {
  tf: string;
  available: boolean;
  score: number; // -3..3
  bias: "BULL" | "BEAR" | "NEUTRAL";
  ema_trend: "UP" | "DOWN" | "FLAT";
  structure: string;
  rsi: number | null;
  price: number | null;
}

function biasAt(c: Ctx, idx: number): TfBias {
  if (idx < 5) return { tf: c.tf, available: false, score: 0, bias: "NEUTRAL", ema_trend: "FLAT", structure: "n/a", rsi: null, price: null };
  const close = c.bars[idx].close;
  const trend = c.ema20[idx] > c.ema50[idx] ? 1 : c.ema20[idx] < c.ema50[idx] ? -1 : 0;
  const side = close > c.ema50[idx] ? 1 : close < c.ema50[idx] ? -1 : 0;
  const known = c.swings.filter((s) => s.confirm <= idx);
  const highs = known.filter((s) => s.kind === "H").slice(-2);
  const lows = known.filter((s) => s.kind === "L").slice(-2);
  let struct = 0;
  let label = "RANGE";
  if (highs.length === 2 && lows.length === 2) {
    if (highs[1].price > highs[0].price && lows[1].price > lows[0].price) { struct = 1; label = "HH/HL"; }
    else if (highs[1].price < highs[0].price && lows[1].price < lows[0].price) { struct = -1; label = "LH/LL"; }
  }
  if (highs.length && close > highs[highs.length - 1].price) label += " · BOS↑";
  else if (lows.length && close < lows[lows.length - 1].price) label += " · BOS↓";
  const score = trend + side + struct;
  return {
    tf: c.tf, available: true, score, bias: score >= 2 ? "BULL" : score <= -2 ? "BEAR" : "NEUTRAL",
    ema_trend: trend > 0 ? "UP" : trend < 0 ? "DOWN" : "FLAT", structure: label, rsi: Math.round(c.rsi[idx] * 10) / 10, price: close,
  };
}

/** Weighted multi-timeframe alignment, -100 (all bearish) .. +100 (all bullish), as of time t. */
function alignmentAt(ctxs: Record<string, Ctx | undefined>, t: number, style: AuraStyle = "normal"): { value: number; frames: TfBias[] } {
  let sum = 0, weight = 0;
  const frames: TfBias[] = [];
  // M1 scalping reacts primarily to M5/M15; H1 is context and slower frames are light filters.
  const weights = style === "scalping" ? { M5: 2, M15: 1.8, H1: 1.2, H4: 0.5, D1: 0.25 } : BIAS_WEIGHT;
  for (const tf of ["M5", "M15", "H1", "H4", "D1"]) {
    const c = ctxs[tf];
    if (!c) { frames.push({ tf, available: false, score: 0, bias: "NEUTRAL", ema_trend: "FLAT", structure: "n/a", rsi: null, price: null }); continue; }
    const idx = closedIdx(c, t);
    const b = biasAt(c, idx);
    frames.push(b);
    if (!b.available) continue;
    sum += weights[tf] * (b.score / 3);
    weight += weights[tf];
  }
  return { value: weight ? Math.round((sum / weight) * 100) : 0, frames };
}

/* ------------------------------------------------------------------ zones (order blocks) and liquidity */

export interface AuraZone {
  tf: string;
  dir: AuraDir; // BUY = bullish OB (demand), SELL = bearish OB (supply)
  lo: number;
  hi: number;
  ob_ms: number;
  start_ms: number; // active once the candle AFTER the displacement has closed (its FVG is then known: no look-ahead)
  end_ms: number; // closed beyond the far side (mitigated); Infinity while still active
  strength: number;
  big: boolean;
  label: string;
}

function findZones(c: Ctx, fromIdx: number): AuraZone[] {
  const b = c.bars, zones: AuraZone[] = [], seen = new Set<number>();
  for (let i = Math.max(10, fromIdx); i < b.length; i++) {
    const a = c.atr[i - 1];
    const range = b[i].high - b[i].low, body = Math.abs(b[i].close - b[i].open);
    if (a <= 0 || range < 1.6 * a || body < 0.6 * range) continue;
    const bull = b[i].close > b[i].open;
    let ref = bull ? -Infinity : Infinity;
    for (let k = Math.max(0, i - 8); k < i; k++) ref = bull ? Math.max(ref, b[k].high) : Math.min(ref, b[k].low);
    if (bull ? b[i].close <= ref : b[i].close >= ref) continue;
    let ob = -1;
    for (let k = i - 1; k >= Math.max(0, i - 5); k--) {
      if (bull ? b[k].close < b[k].open : b[k].close > b[k].open) { ob = k; break; }
    }
    if (ob < 0 || seen.has(ob)) continue;
    seen.add(ob);
    let lo = b[ob].low, hi = b[ob].high;
    if (hi - lo > 3 * a) { lo = Math.min(b[ob].open, b[ob].close); hi = Math.max(b[ob].open, b[ob].close); }
    const fvg = i + 1 < b.length && (bull ? b[i + 1].low > b[i - 1].high : b[i + 1].high < b[i - 1].low);
    const impulse = range / a;
    const rank = TF_RANK[c.tf] ?? 0;
    const strength = Math.min(40, impulse * 10) + (fvg ? 10 : 0) + rank * 6;
    const big = impulse >= 2 && (fvg || rank >= 1);
    let end = Infinity;
    for (let m = i + 1; m < b.length; m++) {
      if (bull ? b[m].close < lo : b[m].close > hi) { end = b[m].timestamp_ms + c.ms; break; }
    }
    zones.push({
      tf: c.tf, dir: bull ? "BUY" : "SELL", lo, hi, ob_ms: b[ob].timestamp_ms, start_ms: (i + 1 < b.length ? b[i + 1].timestamp_ms : b[i].timestamp_ms) + c.ms, end_ms: end,
      strength: Math.round(strength), big, label: `${big ? "Big " : ""}OB${bull ? "+" : "−"}`,
    });
  }
  return zones;
}

interface Liq { tf: string; kind: "H" | "L"; price: number; formed_ms: number; swept_ms: number }

function findLiquidity(c: Ctx, m1: AuraBar[]): Liq[] {
  const out: Liq[] = [];
  for (const s of c.swings) {
    const formed = c.bars[s.confirm].timestamp_ms + c.ms;
    let swept = Infinity;
    for (let j = 0; j < m1.length; j++) {
      if (m1[j].timestamp_ms < formed) continue;
      if (s.kind === "H" ? m1[j].high > s.price : m1[j].low < s.price) { swept = m1[j].timestamp_ms; break; }
    }
    out.push({ tf: c.tf, kind: s.kind, price: s.price, formed_ms: formed, swept_ms: swept });
  }
  return out;
}

/* ------------------------------------------------------------------ result types */

export type AuraOutcome = "TP1" | "TP2" | "SL" | "OPEN" | "EXPIRED";

export interface AuraSignal {
  id: string;
  ts: number; // M1 candle open time
  dir: AuraDir;
  price: number;
  score: number;
  grade: "A" | "B" | "C";
  aura: boolean;
  triggers: string[];
  reasons: string[];
  sl: number;
  tp1: number;
  tp2: number;
  r1: number;
  r2: number;
  risk: number;
  zone: { tf: string; lo: number; hi: number; label: string } | null;
  sweep: { tf: string; price: number } | null;
  alignment: number;
  session: string;
  outcome: AuraOutcome;
  outcome_ts: number | null;
}

export interface AuraMarker { ts: number; price: number; side: "high" | "low"; tf: string }

export interface AuraScan {
  symbol: string;
  style: AuraStyle;
  style_label: string;
  style_tag: string;
  entry_tf: "M1";
  price: number;
  last_ts: number;
  atr_m1: number;
  atr_m5: number | null;
  aura_line: { value: number; diff: number; basis: string } | null;
  alignment: number;
  bias: "BULL" | "BEAR" | "MIXED";
  mtf: TfBias[];
  state: "SIGNAL" | "WATCH" | "WAIT";
  state_note: string;
  watch: { dir: AuraDir; lo: number; hi: number; tf: string; label: string; distance: number } | null;
  zones: AuraZone[];
  levels: Array<{ tf: string; kind: "H" | "L"; price: number }>;
  signals: AuraSignal[];
  markers: AuraMarker[];
  latest: AuraSignal | null;
  stats: { total: number; wins: number; losses: number; open: number; win_rate: number | null; total_r: number; note: string };
  session: string;
  frames_available: string[];
  frames_missing: string[];
}

/* ------------------------------------------------------------------ helpers */

function sessionName(ts: number): { name: string; points: number } {
  const h = new Date(ts).getUTCHours() + new Date(ts).getUTCMinutes() / 60;
  if (h >= 7 && h < 10) return { name: "LONDON_KZ", points: 4 };
  if (h >= 12.5 && h < 16) return { name: "NY_KZ", points: 4 };
  if (h >= 0 && h < 6) return { name: "ASIA", points: -2 };
  return { name: "OFF_HOURS", points: 0 };
}

function pressure(b: AuraBar[], j: number): number {
  let num = 0, den = 0;
  for (let k = Math.max(0, j - 4); k <= j; k++) {
    const r = b[k].high - b[k].low;
    if (r <= 0) continue;
    num += ((b[k].close - b[k].low) - (b[k].high - b[k].close));
    den += r;
  }
  return den > 0 ? num / den : 0;
}

function round(v: number, symbol: string): number {
  const d = symbol === "BTCUSD" ? 1 : 2;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function simulate(sig: AuraSignal, m1: AuraBar[], startIdx: number, expire: number): void {
  const buy = sig.dir === "BUY";
  let tp1Hit = false;
  for (let k = startIdx; k < m1.length && k <= startIdx + expire; k++) {
    const bar = m1[k];
    const slHit = buy ? bar.low <= sig.sl : bar.high >= sig.sl;
    const beHit = buy ? bar.low <= sig.price : bar.high >= sig.price;
    const t1 = buy ? bar.high >= sig.tp1 : bar.low <= sig.tp1;
    const t2 = buy ? bar.high >= sig.tp2 : bar.low <= sig.tp2;
    if (!tp1Hit) {
      if (slHit) { sig.outcome = "SL"; sig.outcome_ts = bar.timestamp_ms; return; } // same-candle conflict = loss (pessimistic)
      if (t1) { tp1Hit = true; sig.outcome = "TP1"; sig.outcome_ts = bar.timestamp_ms; if (t2) { sig.outcome = "TP2"; return; } }
    } else {
      if (t2) { sig.outcome = "TP2"; sig.outcome_ts = bar.timestamp_ms; return; }
      if (beHit) return; // price came back to entry after TP1: keep TP1
    }
  }
  if (!tp1Hit) sig.outcome = startIdx + expire >= m1.length ? "OPEN" : "EXPIRED";
}

/* ------------------------------------------------------------------ main scan */

export function scanAura(feeds: AuraFeeds, styleInput: AuraStyle, symbolInput = "XAUUSD", visible = 300, asOfMs = Date.now()): AuraScan {
  const symbol = symbolInput.toUpperCase();
  const style = AURA_STYLES[styleInput];
  // Providers commonly include the currently-forming candle. Never use it for a signal,
  // indicator state, zone or backtest; only use bars whose full timeframe has elapsed.
  const closedFeeds: AuraFeeds = {};
  for (const tf of AURA_TFS) {
    const bars = feeds[tf];
    if (bars) closedFeeds[tf] = bars.filter((bar) => bar.timestamp_ms + TF_MS[tf] <= asOfMs);
  }
  const m1 = closedFeeds.M1;
  if (!m1 || m1.length < 80) throw new Error("Aura needs at least 80 CLOSED M1 candles.");

  const ctxs: Record<string, Ctx | undefined> = {};
  for (const tf of AURA_TFS) {
    const bars = closedFeeds[tf];
    if (bars && bars.length >= (tf === "M1" ? 80 : 30)) ctxs[tf] = buildCtx(tf, bars);
  }
  const c1 = ctxs.M1 as Ctx;
  const n = m1.length;
  const start = Math.max(60, n - visible);
  const first = m1[Math.max(0, n - visible - 120)].timestamp_ms;

  // zones + liquidity from every execution-relevant timeframe
  const zones: AuraZone[] = [];
  const liqs: Liq[] = [];
  for (const tf of ["M1", "M5", "M15", "H1"]) {
    const c = ctxs[tf];
    if (!c) continue;
    const from = tf === "M1" ? Math.max(10, n - visible - 120) : Math.max(10, c.bars.findIndex((x) => x.timestamp_ms >= first - 40 * c.ms));
    zones.push(...findZones(c, Math.max(10, from)));
    liqs.push(...findLiquidity(c, m1));
  }

  const floor = ATR_FLOOR[symbol] ?? 0.05;
  const signals: AuraSignal[] = [];
  const markers: AuraMarker[] = [];
  const markerSeen = new Set<string>();
  const lastIdx: Record<AuraDir, number> = { BUY: -999, SELL: -999 };
  const c5 = ctxs.M5, c15 = ctxs.M15;

  for (let j = start; j < n; j++) {
    // A fast scalp without a usable M5 context is not a valid setup: wait rather than guess.
    if (styleInput === "scalping" && !c5) break;
    const bar = m1[j], prev = m1[j - 1];
    const t = bar.timestamp_ms + 60_000;
    const atr1 = c1.atr[j];
    if (atr1 < floor) continue;
    const range = bar.high - bar.low;
    if (range <= 0) continue;

    for (const dir of ["BUY", "SELL"] as AuraDir[]) {
      const buy = dir === "BUY", sgn = buy ? 1 : -1;
      const bodyUp = buy ? bar.close > bar.open : bar.close < bar.open;
      if (!bodyUp) continue;

      // --- trigger 1: liquidity sweep + reclaim (the "stop hunt")
      let sweep: Liq | null = null, pierce = j;
      for (const L of liqs) {
        if (L.kind !== (buy ? "L" : "H") || L.formed_ms > bar.timestamp_ms) continue;
        if (L.swept_ms !== bar.timestamp_ms && L.swept_ms !== prev.timestamp_ms) continue;
        const reclaimed = buy ? bar.close > L.price : bar.close < L.price;
        if (!reclaimed || Math.abs(bar.close - L.price) > 1.5 * atr1) continue;
        const p = L.swept_ms === bar.timestamp_ms ? j : j - 1;
        const pb = m1[p];
        const depth = buy ? L.price - pb.low : pb.high - L.price;
        const wick = buy ? Math.min(pb.open, pb.close) - pb.low : pb.high - Math.max(pb.open, pb.close);
        if (depth < 0.05 * atr1 || wick < 0.3 * (pb.high - pb.low)) continue;
        if (!sweep || (TF_RANK[L.tf] ?? 0) > (TF_RANK[sweep.tf] ?? 0)) { sweep = L; pierce = p; }
      }
      if (sweep) {
        const key = `${pierce}:${dir}`;
        if (!markerSeen.has(key)) {
          markerSeen.add(key);
          markers.push({ ts: m1[pierce].timestamp_ms, price: buy ? m1[pierce].low : m1[pierce].high, side: buy ? "low" : "high", tf: sweep.tf });
        }
      }

      // --- trigger 2: rejection from an active order block of the same direction
      let zone: AuraZone | null = null;
      const lowerWick = buy ? Math.min(bar.open, bar.close) - bar.low : bar.high - Math.max(bar.open, bar.close);
      for (const z of zones) {
        if (z.dir !== dir || z.start_ms > bar.timestamp_ms || z.end_ms <= t) continue;
        const inside = buy ? bar.low <= z.hi && bar.low >= z.lo - 0.35 * atr1 : bar.high >= z.lo && bar.high <= z.hi + 0.35 * atr1;
        if (!inside || lowerWick < 0.3 * range) continue;
        if (!zone || z.strength > zone.strength) zone = z;
      }

      // --- trigger 3: displacement continuation (fast styles only)
      let momentum = false;
      if (style.allow_momentum && j > 9) {
        const body = Math.abs(bar.close - bar.open);
        if (range >= 1.5 * c1.atr[j - 1] && body >= 0.6 * range) {
          let ref = buy ? -Infinity : Infinity;
          for (let k = j - 8; k < j; k++) ref = buy ? Math.max(ref, m1[k].high) : Math.min(ref, m1[k].low);
          momentum = buy ? bar.close > ref : bar.close < ref;
        }
      }

      if (!sweep && !zone && !momentum) continue;
      if (style.require_sweep && !sweep) continue;
      if (j - lastIdx[dir] < style.cooldown) continue;
      if (j - lastIdx[buy ? "SELL" : "BUY"] < 2) continue;

      const align = alignmentAt(ctxs, t, styleInput);
      const signed = align.value * sgn;
      if (signed < style.max_counter) continue;
      if (momentum && !sweep && !zone && signed < 15) continue;

      // M1 scalping confirmation: fast/slow EMA alignment, EMA9 slope, a decisive close,
      // supportive recent candle pressure, and no extreme chase candle. A liquidity sweep
      // may be an early reversal, so it can qualify while EMA9 is crossing EMA20.
      const p = pressure(m1, j) * sgn;
      const closePosition = (bar.close - bar.low) / range;
      const bodyRatio = Math.abs(bar.close - bar.open) / range;
      const emaFast = c1.ema9[j], emaSlow = c1.ema20[j];
      const emaSlopeUp = j >= 2 && c1.ema9[j] >= c1.ema9[j - 2];
      const emaSlopeDown = j >= 2 && c1.ema9[j] <= c1.ema9[j - 2];
      const microTrend = buy
        ? bar.close >= emaFast && (emaFast > emaSlow || (!!sweep && emaSlopeUp)) && emaSlopeUp
        : bar.close <= emaFast && (emaFast < emaSlow || (!!sweep && emaSlopeDown)) && emaSlopeDown;
      const scalpConfirmed = microTrend
        && (buy ? closePosition >= 0.60 : closePosition <= 0.40)
        && bodyRatio >= 0.42
        && p >= 0.08
        && (buy ? c1.rsi[j] <= 78 : c1.rsi[j] >= 22)
        && range <= 2.8 * atr1
        && (sweep ? signed >= -25 : signed >= 5);
      if (styleInput === "scalping" && !scalpConfirmed) continue;

      // --- score
      const reasons: string[] = [], triggers: string[] = [];
      let score = 0;
      if (sweep) {
        score += 35 + (LIQ_POINTS[sweep.tf] ?? 0);
        triggers.push("SWEEP");
        reasons.push(`Swept ${sweep.tf} ${buy ? "sell-side" : "buy-side"} liquidity at ${round(sweep.price, symbol)} and reclaimed it`);
      }
      if (zone) {
        score += (sweep ? 10 : 30) + Math.min(10, zone.strength / 8) + (zone.big ? 3 : 0);
        triggers.push("OB");
        reasons.push(`Rejected ${zone.tf} ${zone.label} zone ${round(zone.lo, symbol)}–${round(zone.hi, symbol)}`);
      }
      if (momentum) {
        score += sweep || zone ? 4 : 22;
        triggers.push("DISPLACEMENT");
        reasons.push("Displacement candle broke the last 8-bar extreme");
      }
      score += Math.round(signed * 0.25);
      reasons.push(`HTF alignment ${align.value > 0 ? "+" : ""}${align.value} (${signed >= 25 ? "with" : signed <= -25 ? "against" : "neutral to"} the ${buy ? "buy" : "sell"})`);
      if (styleInput === "scalping") {
        score += 8;
        reasons.push(`M1 quick confirmation: EMA9/EMA20 structure, EMA9 slope, ${Math.round(closePosition * 100)}% candle close and pressure aligned`);
      }
      if (p > 0.4) { score += 8; reasons.push("Strong buying/selling pressure in the signal direction (volume-free delta proxy)"); }
      else if (p > 0.15) score += 4;
      const rsi = c1.rsi[j];
      if (buy ? rsi < 32 : rsi > 68) { score += 4; reasons.push(`M1 RSI ${Math.round(rsi)} stretched in favour of the reversal`); }
      else if (buy ? rsi > 75 : rsi < 25) score -= 4;
      if (c15) {
        const ci = closedIdx(c15, t);
        if (ci >= 20) {
          let hi = -Infinity, lo = Infinity;
          for (let k = Math.max(0, ci - 47); k <= ci; k++) { hi = Math.max(hi, c15.bars[k].high); lo = Math.min(lo, c15.bars[k].low); }
          const pos = hi > lo ? (bar.close - lo) / (hi - lo) : 0.5;
          if (buy ? pos < 0.4 : pos > 0.6) { score += 5; reasons.push(`Price in M15 ${buy ? "discount" : "premium"} (${Math.round(pos * 100)}% of range)`); }
          else if (buy ? pos > 0.7 : pos < 0.3) score -= 5;
        }
      }
      const sess = sessionName(t);
      score += sess.points;
      if (sess.points > 0) reasons.push(`${sess.name === "LONDON_KZ" ? "London" : "New York"} kill zone`);
      score = Math.max(0, Math.min(100, Math.round(score)));
      if (score < style.min_score) continue;

      // --- trade plan
      const atr5 = c5 ? c5.atr[Math.max(0, closedIdx(c5, t))] : atr1 * 2.2;
      const riskAtr = style.risk_tf === "M1" ? atr1 : atr5;
      if (!Number.isFinite(riskAtr) || riskAtr <= 0) continue;
      const entry = bar.close;
      const pb = m1[pierce];
      const structural = buy
        ? Math.min(sweep ? Math.min(pb.low, bar.low) : bar.low, zone ? zone.lo : Infinity) - 0.25 * atr1
        : Math.max(sweep ? Math.max(pb.high, bar.high) : bar.high, zone ? zone.hi : -Infinity) + 0.25 * atr1;
      let risk = Math.abs(entry - structural);
      const minRisk = style.risk_mult * riskAtr, maxRisk = style.max_risk_mult * riskAtr;
      if (risk > maxRisk) continue; // structure too wide for this style: skip rather than distort the stop
      let sl = structural;
      if (risk < minRisk) { risk = minRisk; sl = buy ? entry - risk : entry + risk; }

      const targets: number[] = [];
      for (const L of liqs) {
        if (L.tf === "M1" || L.formed_ms > bar.timestamp_ms || L.swept_ms <= bar.timestamp_ms) continue;
        if (buy ? L.kind === "H" && L.price > entry : L.kind === "L" && L.price < entry) targets.push(L.price);
      }
      for (const z of zones) {
        if (z.dir === dir || z.start_ms > bar.timestamp_ms || z.end_ms <= t) continue;
        if (buy ? z.lo > entry : z.hi < entry) targets.push(buy ? z.lo : z.hi);
      }
      targets.sort((a, b) => (buy ? a - b : b - a));
      const rOf = (price: number) => Math.abs(price - entry) / risk;
      const near = targets.find((x) => rOf(x) >= style.min_tp1_r);
      let tp1 = near !== undefined && rOf(near) <= 2.2 ? near : entry + sgn * style.tp1_mult * risk;
      const far = targets.find((x) => rOf(x) >= rOf(tp1) + 0.6 && rOf(x) <= 5);
      let tp2 = far !== undefined ? far : entry + sgn * style.tp2_mult * risk;
      if (rOf(tp2) < rOf(tp1) + 0.5) tp2 = entry + sgn * (rOf(tp1) + 0.8) * risk;
      tp1 = round(tp1, symbol); tp2 = round(tp2, symbol); sl = round(sl, symbol);

      const aura = score >= 80 && signed >= 50;
      const sig: AuraSignal = {
        id: `${bar.timestamp_ms}-${dir}`, ts: bar.timestamp_ms, dir, price: round(entry, symbol), score,
        grade: score >= 80 ? "A" : score >= 65 ? "B" : "C", aura, triggers, reasons, sl, tp1, tp2,
        r1: Math.round(rOf(tp1) * 100) / 100, r2: Math.round(rOf(tp2) * 100) / 100, risk: round(risk, symbol),
        zone: zone ? { tf: zone.tf, lo: round(zone.lo, symbol), hi: round(zone.hi, symbol), label: zone.label } : null,
        sweep: sweep ? { tf: sweep.tf, price: round(sweep.price, symbol) } : null,
        alignment: align.value, session: sess.name, outcome: "OPEN", outcome_ts: null,
      };
      simulate(sig, m1, j + 1, style.expire_bars);
      signals.push(sig);
      lastIdx[dir] = j;
    }
  }

  /* ---- current context */
  const last = m1[n - 1];
  const tNow = last.timestamp_ms + 60_000;
  const align = alignmentAt(ctxs, tNow, styleInput);
  const m1Frame = biasAt(c1, n - 1);
  const mtf: TfBias[] = [m1Frame, ...align.frames];
  const bias: AuraScan["bias"] = align.value >= 25 ? "BULL" : align.value <= -25 ? "BEAR" : "MIXED";
  const atr5Now = c5 ? c5.atr[Math.max(0, closedIdx(c5, tNow))] : null;

  const h1 = ctxs.H1;
  let auraLine: AuraScan["aura_line"] = null;
  if (h1) {
    const v = h1.ema50[h1.bars.length - 1];
    auraLine = { value: round(v, symbol), diff: round(last.close - v, symbol), basis: "H1 EMA50" };
  } else {
    const v = emaSeries(m1.map((x) => x.close), 200)[n - 1];
    auraLine = { value: round(v, symbol), diff: round(last.close - v, symbol), basis: "M1 EMA200" };
  }

  const activeZones = zones.filter((z) => z.end_ms === Infinity).sort((a, b) => Math.abs((a.lo + a.hi) / 2 - last.close) - Math.abs((b.lo + b.hi) / 2 - last.close));
  const keptZones = activeZones.filter((z) => z.tf !== "M1" || z.strength >= 25).slice(0, 8);

  const latest = signals.length ? signals[signals.length - 1] : null;
  let state: AuraScan["state"] = "WAIT", note = styleInput === "scalping"
    ? "Scanning completed M1 candles for a confirmed setup; M5/M15 provide direction and context."
    : "No reaction yet. Waiting for price to reach a zone or sweep a level.";
  let watch: AuraScan["watch"] = null;
  if (styleInput === "scalping" && !c5) {
    note = "Scalping is paused: a closed M5 context is required before an M1 entry can be confirmed.";
  } else if (latest && (n - 1 - m1.findIndex((x) => x.timestamp_ms === latest.ts)) <= style.fresh_bars && (latest.outcome === "OPEN" || latest.outcome === "TP1")) {
    state = "SIGNAL"; note = `${latest.dir} fired on the last ${Math.max(1, n - m1.findIndex((x) => x.timestamp_ms === latest.ts))} M1 candle(s). Do not chase if price has moved more than 0.5R.`;
  } else {
    const reach = 0.8 * (atr5Now ?? c1.atr[n - 1] * 2.2);
    for (const z of activeZones) {
      if (z.tf === "M1" && z.strength < 25) continue;
      const signed = (z.dir === "BUY" ? 1 : -1) * align.value;
      if (signed < (styleInput === "scalping" ? -20 : 10)) continue;
      const dist = z.dir === "BUY" ? last.close - z.hi : z.lo - last.close;
      const inside = last.close >= z.lo && last.close <= z.hi;
      if (inside || (dist > 0 && dist <= reach)) {
        watch = { dir: z.dir, lo: round(z.lo, symbol), hi: round(z.hi, symbol), tf: z.tf, label: z.label, distance: inside ? 0 : round(dist, symbol) };
        break;
      }
    }
    if (watch) { state = "WATCH"; note = `ARMED: price is ${watch.distance === 0 ? "inside" : `${watch.distance} away from`} a ${watch.tf} ${watch.label} aligned with the ${watch.dir === "BUY" ? "bullish" : "bearish"} bias. Waiting for an M1 rejection or sweep.`; }
  }

  const scored = signals.filter((s) => s.outcome === "TP1" || s.outcome === "TP2" || s.outcome === "SL");
  const wins = scored.filter((s) => s.outcome !== "SL").length;
  const totalR = scored.reduce((acc, s) => acc + (s.outcome === "SL" ? -1 : s.outcome === "TP1" ? s.r1 : s.r2), 0);
  const frames_available = AURA_TFS.filter((tf) => ctxs[tf]);

  return {
    symbol, style: styleInput, style_label: style.label, style_tag: style.tag, entry_tf: "M1", price: round(last.close, symbol),
    last_ts: last.timestamp_ms, atr_m1: round(c1.atr[n - 1], symbol), atr_m5: atr5Now === null ? null : round(atr5Now, symbol),
    aura_line: auraLine, alignment: align.value, bias, mtf, state, state_note: note, watch,
    zones: keptZones, levels: liqs.filter((L) => L.swept_ms === Infinity && L.tf !== "M1").sort((a, b) => Math.abs(a.price - last.close) - Math.abs(b.price - last.close)).slice(0, 8).map((L) => ({ tf: L.tf, kind: L.kind, price: round(L.price, symbol) })),
    signals, markers, latest,
    stats: {
      total: signals.length, wins, losses: scored.length - wins, open: signals.filter((s) => s.outcome === "OPEN").length,
      win_rate: scored.length ? Math.round((wins / scored.length) * 100) : null, total_r: Math.round(totalR * 100) / 100,
      note: "In-sample replay on the fetched candles. No spread, slippage or news. Small samples mislead; verify live before trusting.",
    },
    session: sessionName(tNow).name, frames_available, frames_missing: AURA_TFS.filter((tf) => !ctxs[tf]),
  };
}
