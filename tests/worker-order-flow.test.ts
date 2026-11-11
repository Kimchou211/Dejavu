import assert from "node:assert/strict";
import test from "node:test";
import { combineIctVerdict, scanIct, validateAiReview } from "../worker/ict-engine.ts";
import { buildFlowSeries, computeOrderFlow, splitVolume, volumeProfile } from "../worker/order-flow.ts";
import { mergeFlowIntoBars, parseBinanceKlines, parseYahooVolume } from "../worker/order-flow-feed.ts";
import type { FlowFeed } from "../worker/order-flow-feed.ts";

const start = Date.UTC(2026, 9, 27, 8);

function linear(points: Array<[number, number]>, wick = 0.3) {
  const rows: Array<[number, number, number, number, number]> = [];
  let previous = points[0][1];
  for (let p = 0; p < points.length - 1; p++) {
    const [i0, p0] = points[p], [i1, p1] = points[p + 1];
    for (let i = i0 + 1; i <= i1; i++) {
      const close = p0 + (p1 - p0) * (i - i0) / (i1 - i0);
      rows.push([i, previous, Math.max(previous, close) + wick, Math.min(previous, close) - wick, close]);
      previous = close;
    }
  }
  return rows;
}

type Row = [number, number, number, number, number];

function bearishRows(extraTail: Row[] = []): Row[] {
  const points: Array<[number, number]> = [[0, 4000], [12, 4009], [24, 4003], [36, 4010], [44, 4004], [51, 4009.5]];
  const rows: Row[] = [[0, 4000, 4000.3, 3999.7, 4000], ...linear(points)];
  rows.push([52, 4009.5, 4011, 4008.8, 4008], [53, 4008, 4008.2, 4002.2, 4002.5], [54, 4002.5, 4002.7, 3996.8, 3997], [55, 3997, 3997.5, 3993.8, 3994]);
  const tail = [3994.5, 3994.2, 3994.8, 3994.4, 3994.6, 3994.5, 3994.5, 3994.5, 3994.5, 3994.5];
  let previous = 3994;
  for (const [offset, close] of tail.entries()) {
    rows.push([56 + offset, previous, Math.max(previous, close) + 0.3, Math.min(previous, close) - 0.3, close]);
    previous = close;
  }
  return [...rows, ...extraTail];
}

function toBars(rows: Row[], volume?: (index: number) => [number, number]) {
  return rows.map(([i, open, high, low, close]) => {
    const bar: Record<string, number> = { timestamp_ms: start + i * 300_000, open, high, low, close };
    if (volume) {
      const [buy, sell] = volume(i);
      bar.buy_volume = buy; bar.sell_volume = sell; bar.volume = buy + sell;
    }
    return bar as { timestamp_ms: number; open: number; high: number; low: number; close: number };
  });
}

function legVolume(mode: "aligned" | "opposed") {
  return (i: number): [number, number] => {
    if (i === 52) return [260, 340];
    if (i >= 53 && i <= 55) return mode === "aligned" ? [60, 380] : [380, 60];
    if (i >= 56) return [55, 50];
    return [100, 100];
  };
}

test("splitVolume conserves volume and follows candle shape", () => {
  const up = splitVolume(100, 110, 99, 109.5, 1000), down = splitVolume(110, 111, 100, 100.5, 1000);
  assert.ok(Math.abs(up.buy + up.sell - 1000) < 1e-9);
  assert.ok(up.buy > 800 && down.sell > 800);
  assert.deepEqual(splitVolume(5, 5, 5, 5, 40), { buy: 20, sell: 20 });
  assert.deepEqual(splitVolume(1, 2, 0, 1, 0), { buy: 0, sell: 0 });
});

test("no volume means order flow is off and the score is untouched", () => {
  const plain = scanIct({ M5: toBars(bearishRows()) }, "M5", "XAUUSD");
  assert.equal(plain.order_flow.available, false);
  assert.equal(plain.order_flow.quality, "none");
  assert.equal(plain.flow_confirmation, "UNAVAILABLE");
  const zeroVolume = toBars(bearishRows()).map(bar => ({ ...bar, volume: 0 }));
  const same = scanIct({ M5: zeroVolume }, "M5", "XAUUSD");
  assert.equal(same.confluence_score, plain.confluence_score);
  const disabled = scanIct({ M5: toBars(bearishRows(), legVolume("aligned")) }, "M5", "XAUUSD", { orderFlow: false });
  assert.equal(disabled.confluence_score, plain.confluence_score);
});

test("real aggressor flow that agrees with the sell setup scores higher than flow that opposes it", () => {
  const plain = scanIct({ M5: toBars(bearishRows()) }, "M5", "XAUUSD");
  const aligned = scanIct({ M5: toBars(bearishRows(), legVolume("aligned")) }, "M5", "XAUUSD");
  const opposed = scanIct({ M5: toBars(bearishRows(), legVolume("opposed")) }, "M5", "XAUUSD");
  assert.equal(aligned.order_flow.quality, "real_trades");
  assert.equal(aligned.direction, "SELL");
  assert.ok(aligned.confluence_score > opposed.confluence_score, `${aligned.confluence_score} vs ${opposed.confluence_score}`);
  assert.ok(aligned.confluence_score > plain.confluence_score);
  assert.ok(aligned.reasons.some(reason => reason.startsWith("Order flow:") && reason.includes("selling delta")));
  assert.ok(opposed.reasons.some(reason => reason.includes("opposes the setup")));
  const setup = aligned.setups[0];
  assert.ok(setup.flow && setup.flow.adjustment >= -15 && setup.flow.adjustment <= 15);
});

test("estimated flow is down-weighted compared with real aggressor flow", () => {
  const real = toBars(bearishRows(), legVolume("aligned"));
  const proxy = real.map(bar => ({ ...bar, flow_quality: "futures_proxy" }));
  const realScan = scanIct({ M5: real }, "M5", "XAUUSD");
  const proxyScan = scanIct({ M5: proxy }, "M5", "XAUUSD");
  assert.equal(proxyScan.order_flow.quality, "futures_proxy");
  assert.equal(proxyScan.order_flow.weight, 0.6);
  const plain = scanIct({ M5: toBars(bearishRows()) }, "M5", "XAUUSD").confluence_score;
  assert.ok(proxyScan.confluence_score - plain < realScan.confluence_score - plain);
  assert.ok(proxyScan.reasons.some(reason => reason.startsWith("Order flow (estimated):")));
});

test("zone reaction with sell delta confirms the entry; aggressive buying through the zone is flagged AGAINST", () => {
  const reaction: Row[] = [
    [66, 3994.5, 4003.5, 3994.3, 4003],
    [67, 4003, 4006.8, 4002.9, 4005.5],
    [68, 4005.5, 4006, 4001.5, 4002],
  ];
  const confirmedVolume = (i: number): [number, number] => (i >= 67 ? [40, 220] : legVolume("aligned")(i));
  const confirmed = scanIct({ M5: toBars(bearishRows(reaction), confirmedVolume) }, "M5", "XAUUSD");
  assert.equal(confirmed.flow_confirmation, "CONFIRMED");
  const push: Row[] = [
    [66, 3994.5, 4003.5, 3994.3, 4003],
    [67, 4003, 4006.8, 4002.9, 4006.5],
    [68, 4006.5, 4008.4, 4006.2, 4008.2],
  ];
  const againstVolume = (i: number): [number, number] => (i >= 67 ? [380, 40] : legVolume("aligned")(i));
  const against = scanIct({ M5: toBars(bearishRows(push), againstVolume) }, "M5", "XAUUSD");
  assert.equal(against.flow_confirmation, "AGAINST");
  assert.ok(against.confluence_score < confirmed.confluence_score);
});

test("pull-back levels are ordered, inside the zone and expose retrace depth", () => {
  const scan = scanIct({ M5: toBars(bearishRows()) }, "M5", "XAUUSD");
  const plan = scan.plan!, pb = scan.pullback!;
  assert.equal(scan.direction, "SELL");
  assert.equal(pb.direction, "retrace_up");
  assert.equal(pb.state, "WAITING");
  // ICT signal entry is now the latest candle close; pullback prices remain a separate reference.
  assert.equal(plan.entry, scan.price);
  assert.equal(plan.entry_low, plan.entry);
  assert.equal(plan.entry_high, plan.entry);
  assert.equal(pb.invalidation, plan.stop);
  assert.ok(pb.first_touch.price < pb.optimal.price && pb.optimal.price < pb.deep.price && pb.deep.price < pb.invalidation);
  assert.ok(pb.first_touch.depth_pct! < pb.optimal.depth_pct! && pb.optimal.depth_pct! < pb.deep.depth_pct!);
  assert.ok(Math.abs(pb.distance - (pb.first_touch.price - scan.price)) < 0.011);
  assert.ok(pb.optimal.depth_pct! >= 62 && pb.optimal.depth_pct! <= 79);
  assert.ok(scan.reasons.some(reason => reason.includes("OTE 62-79%")));
  assert.match(pb.summary, /reference only/i);
  assert.match(pb.summary, /does not wait/i);
});

test("level table carries VWAP/POC/value area/leg end so the AI validator accepts them", () => {
  const scan = scanIct({ M5: toBars(bearishRows(), legVolume("aligned")) }, "M5", "XAUUSD");
  for (const key of ["VWAP", "POC", "VAH", "VAL", "LEG_END"]) assert.ok(scan.level_table[key], `missing ${key}`);
  assert.ok(scan.level_table.VAL.price <= scan.level_table.POC.price && scan.level_table.POC.price <= scan.level_table.VAH.price);
  const review = {
    ok: true, direction: "SELL", verdict: "APPROVE", selected_setup: "S1", confidence: 70,
    referenced_levels: ["VWAP", "POC", "ENTRY"],
    narrative: `Pull-back to ${scan.pullback!.first_touch.price} with delta ratio 0.35 and 2.1x relative volume.`,
  };
  assert.equal(validateAiReview(review, scan).accepted, true);
});

test("a counter-trend setup is penalised against the same setup with neutral HTF bias", () => {
  const rising = linear([[0, 3900], [10, 3920], [20, 3908], [30, 3940], [40, 3925], [50, 3960], [60, 3945], [70, 3985], [80, 3968], [90, 4010]], 0.4);
  const htf = rising.map(([i, open, high, low, close]) => ({ timestamp_ms: start - 90 * 3_600_000 + i * 3_600_000, open, high, low, close }));
  const m15 = rising.map(([i, open, high, low, close]) => ({ timestamp_ms: start - 90 * 900_000 + i * 900_000, open, high, low, close }));
  const neutral = scanIct({ M5: toBars(bearishRows()) }, "M5", "XAUUSD");
  const counter = scanIct({ H1: htf, M15: m15, M5: toBars(bearishRows()) }, "M5", "XAUUSD");
  assert.equal(counter.bias.label, "BULLISH");
  const sellNeutral = neutral.setups.find(setup => setup.action === "SELL")!;
  const sellCounter = counter.setups.find(setup => setup.action === "SELL")!;
  assert.ok(sellNeutral && sellCounter);
  assert.ok(sellCounter.reasons.some(reason => reason.startsWith("Counter-trend")));
  assert.ok(sellCounter.score <= sellNeutral.score - 15, `${sellCounter.score} vs ${sellNeutral.score}`);
  // The sell setup is counter-trend, so it must no longer be selected as the tradable plan on its own merit.
  assert.notEqual(counter.direction === "SELL" && counter.selected === sellCounter.id && sellCounter.score >= 60, true);
});

test("CONFLICT note names the engine's real direction", () => {
  const scan = scanIct({ M5: toBars(bearishRows()) }, "M5", "XAUUSD");
  assert.equal(scan.direction, "SELL");
  const review = { ok: true, verdict: "APPROVE", direction: "BUY", confidence: 80 };
  const verdict = combineIctVerdict(scan, review, { accepted: true, issues: [] }, true);
  assert.equal(verdict.verdict_status, "CONFLICT");
  assert.equal(verdict.final_direction, "WAIT");
  assert.ok(verdict.verdict_notes.some(note => note.includes("engine says SELL")));
});

test("volume profile finds the busiest price and a value area around it", () => {
  const rows: Row[] = [];
  for (let i = 0; i < 40; i++) rows.push([i, 100, 101, 99, 100]);
  for (let i = 40; i < 60; i++) rows.push([i, 110, 111, 109, 110]);
  const bars = toBars(rows, (i) => (i < 40 ? [300, 300] : [50, 50]));
  const profile = volumeProfile(bars, buildFlowSeries(bars), 1)!;
  assert.ok(Math.abs(profile.poc - 100) <= 1.01);
  assert.ok(profile.val <= profile.poc && profile.poc <= profile.vah);
});

test("computeOrderFlow reports bias and keeps raw volumes out of the snapshot", () => {
  const bars = toBars(bearishRows(), legVolume("aligned"));
  const { snapshot } = computeOrderFlow(bars, 1.8, "test");
  assert.equal(snapshot.available, true);
  assert.ok(snapshot.recent.length === 30 && snapshot.recent.every(item => Math.abs(item.delta_ratio) <= 1));
  assert.equal(Object.keys(snapshot).some(key => /^(volume|cvd|delta)$/.test(key)), false);
});

test("Binance kline parser keeps the real taker split and drops malformed rows", () => {
  const rows = [
    [1793100000000, "90000", "90100", "89950", "90050", "10.5", 1793100299999, "945000", 120, "7.0", "630000", "0"],
    [1793100300000, "90050", "90060", "89900", "89910", "8", 1793100599999, "720000", 90, "9", "810000", "0"],
    [1793100600000, "abc", "1", "1", "1", "1", 0, "0", 0, "0.5", "0", "0"],
    "bad",
  ];
  const parsed = parseBinanceKlines(rows);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].buy_volume, 7);
  assert.ok(Math.abs(parsed[0].sell_volume! - 3.5) < 1e-9);
  assert.deepEqual(parseBinanceKlines({ not: "an array" }), []);
});

test("Yahoo parser skips candles without volume", () => {
  const payload = { chart: { result: [{ timestamp: [1793100000, 1793100300, 1793100600], indicators: { quote: [{
    open: [4000, 4001, 4002], high: [4002, 4003, 4004], low: [3999, 4000, 4001], close: [4001, 4002, 4003], volume: [1200, 0, null],
  }] } }] } };
  const parsed = parseYahooVolume(payload);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].volume, 1200);
  assert.deepEqual(parseYahooVolume({}), []);
});

test("mergeFlowIntoBars aligns by timestamp, never mutates the cached candles and labels futures volume as an estimate", () => {
  const price = toBars(bearishRows().slice(0, 8));
  const snapshot = JSON.stringify(price);
  const feed: FlowFeed = {
    symbol: "XAUUSD", tf: "M5", source: "GC=F", quality: "futures_proxy",
    bars: [
      { timestamp_ms: price[2].timestamp_ms + 7_000, open: 4000, high: 4002, low: 3999, close: 4001.8, volume: 500 },
      { timestamp_ms: price[3].timestamp_ms, open: 4001, high: 4002, low: 3999, close: 3999.2, volume: 800 },
    ],
  };
  const merged = mergeFlowIntoBars(price, feed);
  assert.equal(JSON.stringify(price), snapshot);
  assert.equal(merged[0].volume, undefined);
  assert.equal(merged[2].volume, 500);
  assert.equal(merged[2].flow_quality, "futures_proxy");
  assert.ok(Number(merged[2].buy_volume) > Number(merged[2].sell_volume));
  assert.ok(Number(merged[3].sell_volume) > Number(merged[3].buy_volume));
  const series = buildFlowSeries(Array.from({ length: 70 }, (_, i) => ({ ...price[i % 8], timestamp_ms: start + i * 300_000, volume: 100, buy_volume: 60, sell_volume: 40, flow_quality: "futures_proxy" })));
  assert.equal(series.quality, "futures_proxy");
});
