import assert from "node:assert/strict";
import test from "node:test";
import { AURA_STYLES, normalizeStyle, scanAura } from "../worker/aura-engine.ts";
import type { AuraBar, AuraFeeds, AuraStyle } from "../worker/aura-engine.ts";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Synthetic gold-like M1 series with trending legs, spikes and mean reversion, then aggregated upward. */
function makeFeeds(seed: number, minutes = 3000): AuraFeeds {
  const r = rng(seed);
  const end = Date.UTC(2026, 10, 9, 11, 0); // Mon 9 Nov 2026 11:00 UTC, bar-aligned
  const m1: AuraBar[] = [];
  let price = 4050, drift = 0;
  for (let i = 0; i < minutes; i++) {
    if (i % 90 === 0) drift = (r() - 0.5) * 0.35;
    const vol = 0.35 + r() * 0.5 + (r() < 0.04 ? 2.5 : 0);
    const open = price;
    const close = open + drift + (r() - 0.5) * vol * 2;
    const high = Math.max(open, close) + r() * vol * (r() < 0.12 ? 3 : 1);
    const low = Math.min(open, close) - r() * vol * (r() < 0.12 ? 3 : 1);
    m1.push({ timestamp_ms: end - (minutes - i) * 60_000, open, high, low, close, volume: 0 });
    price = close;
  }
  const agg = (mins: number): AuraBar[] => {
    const step = mins * 60_000, out: AuraBar[] = [];
    for (const b of m1) {
      const t = Math.floor(b.timestamp_ms / step) * step, l = out[out.length - 1];
      if (l && l.timestamp_ms === t) { l.high = Math.max(l.high, b.high); l.low = Math.min(l.low, b.low); l.close = b.close; }
      else out.push({ ...b, timestamp_ms: t });
    }
    return out;
  };
  return { M1: m1.slice(-500), M5: agg(5), M15: agg(15), H1: agg(60), H4: agg(240), D1: agg(1440) };
}

test("styles normalise", () => {
  assert.equal(normalizeStyle("Shadow Pulse"), "shadow");
  assert.equal(normalizeStyle("normal"), "normal");
  assert.equal(normalizeStyle(null), "scalping");
  assert.equal(normalizeStyle("nonsense"), "scalping");
});

test("scan is deterministic and returns well-formed output for every style", () => {
  const feeds = makeFeeds(7);
  for (const style of Object.keys(AURA_STYLES) as AuraStyle[]) {
    const a = scanAura(feeds, style), b = scanAura(feeds, style);
    assert.deepEqual(a, b);
    assert.equal(a.entry_tf, "M1");
    assert.equal(a.mtf.length, 6);
    assert.ok(a.signals.length < 120, `${style} should not spam signals (${a.signals.length})`);
    for (const s of a.signals) {
      const sgn = s.dir === "BUY" ? 1 : -1;
      assert.ok(sgn * (s.price - s.sl) > 0, "stop on the wrong side");
      assert.ok(sgn * (s.tp1 - s.price) > 0 && sgn * (s.tp2 - s.tp1) > 0, "targets out of order");
      assert.ok(s.score >= AURA_STYLES[style].min_score && s.score <= 100);
      assert.ok(s.r1 > 0 && s.r2 > s.r1);
      assert.ok(s.triggers.length > 0 && s.reasons.length > 0);
      if (style === "shadow") assert.ok(s.triggers.includes("SWEEP"), "shadow pulse requires a sweep");
    }
    for (let i = 1; i < a.signals.length; i++) assert.ok(a.signals[i].ts > a.signals[i - 1].ts - 1);
  }
});

test("M1 scalping is tuned for faster entries without lowering its quality threshold", () => {
  const scalp = AURA_STYLES.scalping;
  assert.equal(scalp.risk_tf, "M1");
  assert.equal(scalp.fresh_bars, 2);
  assert.equal(scalp.cooldown, 3);
  assert.equal(scalp.expire_bars, 18);
  assert.ok(scalp.min_score >= 64, "scalping must keep a meaningful quality threshold");
  assert.ok(scalp.max_counter >= -30, "scalping should avoid strong counter-trend entries");
});

test("forming M1 candle is ignored until its full minute has closed", () => {
  const feeds = makeFeeds(31, 900);
  const last = feeds.M1![feeds.M1!.length - 1];
  const asOf = last.timestamp_ms + 30_000; // halfway through the final M1 candle
  const withForming = scanAura(feeds, "scalping", "XAUUSD", 300, asOf);
  const withoutForming = scanAura({ ...feeds, M1: feeds.M1!.slice(0, -1) }, "scalping", "XAUUSD", 300, asOf);
  assert.deepEqual(withForming, withoutForming);
});

test("latest fully closed M1 candle is accepted", () => {
  const feeds = makeFeeds(32, 900);
  const last = feeds.M1![feeds.M1!.length - 1];
  const scan = scanAura(feeds, "scalping", "XAUUSD", 300, last.timestamp_ms + 60_000);
  assert.equal(scan.last_ts, last.timestamp_ms);
});

test("scalping waits when M5 confirmation data is unavailable", () => {
  const feeds = makeFeeds(33, 900);
  const scan = scanAura({ M1: feeds.M1, M15: feeds.M15, H1: feeds.H1 }, "scalping");
  assert.equal(scan.signals.length, 0);
  assert.equal(scan.state, "WAIT");
  assert.match(scan.state_note, /M5 context/i);
});

test("shadow pulse is more selective than scalping", () => {
  let scalp = 0, shadow = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const feeds = makeFeeds(seed);
    scalp += scanAura(feeds, "scalping").signals.length;
    shadow += scanAura(feeds, "shadow").signals.length;
  }
  assert.ok(shadow <= scalp, `shadow ${shadow} should be <= scalping ${scalp}`);
});

test("no look-ahead: truncating the future does not change earlier signals", () => {
  const full = makeFeeds(11);
  const cut = 40;
  const trimmed: AuraFeeds = { ...full, M1: full.M1!.slice(0, -cut) };
  const lastTs = trimmed.M1![trimmed.M1!.length - 1].timestamp_ms;
  const t = lastTs + 60_000;
  for (const tf of ["M5", "M15", "H1", "H4", "D1"]) {
    const ms = { M5: 300_000, M15: 900_000, H1: 3_600_000, H4: 14_400_000, D1: 86_400_000 }[tf] as number;
    trimmed[tf] = full[tf]!.filter((b) => b.timestamp_ms + ms <= t);
  }
  const a = scanAura(full, "scalping"), b = scanAura(trimmed, "scalping");
  const safe = lastTs - 6 * 60_000;
  const strip = (x: { signals: Array<{ id: string; score: number; sl: number; dir: string }> }) =>
    x.signals.filter((s) => Number(s.id.split("-")[0]) < safe).map((s) => `${s.id}:${s.score}:${s.sl}`);
  const fullIds = strip(a), cutIds = strip(b).filter((id) => Number(id.split("-")[0]) >= (full.M1![full.M1!.length - 300].timestamp_ms + 60 * 60_000));
  for (const id of cutIds) assert.ok(fullIds.includes(id), `signal ${id} changed when future bars were removed`);
});

test("missing higher timeframes degrade instead of failing", () => {
  const f = makeFeeds(3);
  const scan = scanAura({ M1: f.M1, M5: f.M5 }, "normal");
  assert.deepEqual(scan.frames_missing.sort(), ["D1", "H1", "H4", "M15"]);
  assert.ok(scan.mtf.some((x) => !x.available));
  assert.throws(() => scanAura({ M1: f.M1!.slice(0, 20) }, "normal"), /80 CLOSED M1/);
});

test("stats are consistent with signal outcomes", () => {
  const scan = scanAura(makeFeeds(21), "scalping");
  const wins = scan.signals.filter((s) => s.outcome === "TP1" || s.outcome === "TP2").length;
  const losses = scan.signals.filter((s) => s.outcome === "SL").length;
  assert.equal(scan.stats.wins, wins);
  assert.equal(scan.stats.losses, losses);
  if (wins + losses) assert.equal(scan.stats.win_rate, Math.round((wins / (wins + losses)) * 100));
});
