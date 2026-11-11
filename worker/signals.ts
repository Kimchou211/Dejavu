import type { Env, JsonRecord } from "./types";

export interface TelegramSignal {
  source: string;
  symbol: string;
  direction: string;
  timeframe?: string;
  entry?: number | null;
  entry_low?: number | null;
  entry_high?: number | null;
  stop_loss?: number | null;
  take_profit_1?: number | null;
  take_profit_2?: number | null;
  confidence?: number | null;
  grade?: string | null;
  status?: string | null;
  timestamp?: string | number | null;
}

const html = (value: unknown): string => String(value ?? "—")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function price(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
}

function entryText(signal: TelegramSignal): string {
  if (typeof signal.entry === "number" && Number.isFinite(signal.entry)) return price(signal.entry);
  const low = signal.entry_low, high = signal.entry_high;
  if (typeof low === "number" && Number.isFinite(low) && typeof high === "number" && Number.isFinite(high)) {
    return Math.abs(high - low) < 0.000001 ? price(low) : `${price(low)} – ${price(high)}`;
  }
  return "—";
}

function timeText(value: TelegramSignal["timestamp"]): string {
  const date = typeof value === "number" ? new Date(value) : value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Phnom_Penh", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

export function buildTelegramSignalMessage(signal: TelegramSignal): string {
  const direction = signal.direction.toUpperCase();
  const directionLabel = direction === "BUY" ? "🟢 BUY" : direction === "SELL" ? "🔴 SELL" : html(direction);
  const confidence = typeof signal.confidence === "number" && Number.isFinite(signal.confidence)
    ? `${Math.round(signal.confidence)}%` : "—";
  const grade = signal.grade ? ` · Grade ${html(signal.grade)}` : "";
  const status = signal.status ? `\nStatus: <code>${html(signal.status)}</code>` : "";
  return [
    `<b>JD ANALYSIS · ${html(signal.source)}</b>`,
    `Source: <b>${html(signal.source)}</b>`,
    `Symbol: <code>${html(signal.symbol)}</code>`,
    `Timeframe: <code>${html(signal.timeframe || "—")}</code>`,
    `Signal: <b>${directionLabel}</b> · Confidence: <b>${confidence}</b>${grade}`,
    `Entry: <code>${entryText(signal)}</code>`,
    `Stop Loss: <code>${price(signal.stop_loss)}</code>`,
    `Take Profit 1: <code>${price(signal.take_profit_1)}</code>`,
    `Take Profit 2: <code>${price(signal.take_profit_2)}</code>`,
    `Time: <code>${html(timeText(signal.timestamp))}</code>${status}`,
    "\n<i>Analysis signal only. Verify the live broker quote, spread and risk before entry.</i>",
  ].join("\n");
}

export async function sendTelegramSignal(
  env: Pick<Env, "TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHAT_ID">,
  signal: TelegramSignal,
): Promise<{ configured: boolean; sent: boolean; error?: string }> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return { configured: false, sent: false };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildTelegramSignalMessage(signal),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok || result.ok !== true) {
      const description = typeof result.description === "string" ? result.description : `Telegram API returned HTTP ${response.status}`;
      return { configured: true, sent: false, error: description.slice(0, 240) };
    }
    return { configured: true, sent: true };
  } catch (error) {
    return {
      configured: true,
      sent: false,
      error: error instanceof Error ? error.message.slice(0, 240) : "Telegram delivery failed.",
    };
  }
}
