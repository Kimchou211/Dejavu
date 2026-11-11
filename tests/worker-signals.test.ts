import assert from "node:assert/strict";
import test from "node:test";
import { buildTelegramSignalMessage, sendTelegramSignal } from "../worker/signals.ts";

test("Telegram alert contains the source label, side, entry and risk levels", () => {
  const message = buildTelegramSignalMessage({
    source: "ICT Terminal", symbol: "XAUUSD", timeframe: "M5", direction: "SELL",
    entry: 3988.5, stop_loss: 3996, take_profit_1: 3977.25, take_profit_2: 3969.75,
    confidence: 84, grade: "A", timestamp: Date.UTC(2026, 10, 9, 12, 0),
  });
  assert.match(message, /Source: <b>ICT Terminal<\/b>/);
  assert.match(message, /SELL/);
  assert.match(message, /3,988\.50/);
  assert.match(message, /3,996\.00/);
});

test("Telegram alert escapes source text and reports missing secrets without sending", async () => {
  const message = buildTelegramSignalMessage({ source: "<b>Untrusted</b>", symbol: "XAUUSD", direction: "BUY" });
  assert.match(message, /&lt;b&gt;Untrusted&lt;\/b&gt;/);
  const result = await sendTelegramSignal({}, { source: "Aura Scalper Indicator", symbol: "XAUUSD", direction: "BUY" });
  assert.deepEqual(result, { configured: false, sent: false });
});
