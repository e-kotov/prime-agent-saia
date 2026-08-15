// prime-agent-saia v28 — SAIA compatibility, rate-limit display with
// compact formatting, LiteLLM proxy headers, error hardening, change
// detection, session persistence, and enhanced detailed view.
//
// Qwen 3.x rejects OpenAI's `developer` role.
// Prime Agent runs extensions in a daemon worker; use a persistent widget
// above the editor (the nearest daemon-supported equivalent of a footer).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── Constants ──────────────────────────────────────────────────────────────

const STRICT_QWEN = /^qwen3/;
const RATE_LIMIT_WIDGET = "prime-agent-saia-rate-limits";
const LIMITS_CUSTOM_TYPE = "saiaLimits";

// ── Types ──────────────────────────────────────────────────────────────────

type QuotaWindow = { remaining?: string; limit?: string };
type SaiaLimits = Record<"minute" | "hour" | "day" | "month", QuotaWindow>;

// ── State ──────────────────────────────────────────────────────────────────

let limits: SaiaLimits = { minute: {}, hour: {}, day: {}, month: {} };
let resetSeconds: string | undefined;
let detailedView = false;
let lastWidgetLines: string[] | null = null; // change detection
let streamStartTimestamp = 0; // from after_provider_response (ms)
let lastTokensPerSec = 0;     // tokens/sec from latest response

// ── Helpers ────────────────────────────────────────────────────────────────

/** Read a header from the response, no matter its shape. */
function readHeader(
  headers: Record<string, string> | Headers | unknown,
  name: string
): string | undefined {
  try {
    if (!headers) return;
    if (typeof (headers as Headers).get === "function") {
      const v = (headers as Headers).get(name);
      if (v != null && v !== "") return v;
    }
    const v = (headers as Record<string, string>)[name];
    if (v != null && v !== "") return String(v);
  } catch {
    // ignore bad header access
  }
}

/** Read a quota header with LiteLLM proxy fallback. */
function quotaHeader(
  headers: Record<string, string> | Headers | unknown,
  name: string
): string | undefined {
  return readHeader(headers, name) ?? readHeader(headers, `llm_provider-${name}`);
}

const ANSI_YELLOW = "\x1b[33m";
const ANSI_RED = "\x1b[31m";
const ANSI_GREEN = "\x1b[32m";
const ANSI_RESET = "\x1b[39m";

/** Abbreviate numbers >= 1000 (OpenCode style: 15300 → "15.3k"). */
function formatRemaining(value: string | undefined): string {
  if (value == null) return "?";
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1000) return String(value);
  const thousands = num / 1000;
  return `${thousands.toFixed(1).replace(/\.0$/, "")}k`;
}

/** Determine per-window status for color coding. */
function windowStatus(remaining: string | undefined, limit: string | undefined): string {
  if (remaining == null) return "";
  const rem = Number(remaining);
  if (!Number.isFinite(rem)) return "";
  const lim = limit != null ? Number(limit) : undefined;
  const pct = lim ? rem / lim : 0;
  if (pct <= 0.05 || rem < 10) return "critical";
  if (pct <= 0.20 || rem < 100) return "warning";
  return "";
}

/** Wrap text in ANSI color. */
function colorize(text: string, status: string): string {
  if (status === "critical") return `${ANSI_RED}${text}${ANSI_RESET}`;
  if (status === "warning") return `${ANSI_YELLOW}${text}${ANSI_RESET}`;
  return `${ANSI_GREEN}${text}${ANSI_RESET}`;
}

/** Build a single colored field: "28/m" or "2.9k/mo". */
function coloredField(remaining: string | undefined, unit: string): string | undefined {
  if (remaining == null) return;
  const status = windowStatus(remaining, undefined);
  return colorize(`${formatRemaining(remaining)}/${unit}`, status);
}

// ── Widget rendering ──────────────────────────────────────────────────────

function buildWidgetLines(): string[] {
  const fields = [
    coloredField(limits.minute.remaining, "m"),
    coloredField(limits.hour.remaining, "h"),
    coloredField(limits.day.remaining, "d"),
    coloredField(limits.month.remaining, "mo"),
  ].filter(Boolean);

  if (fields.length === 0) {
    return ["fetching SAIA rate limits…"];
  }

  if (!detailedView) {
    const main = fields.join(" · ");
    return [lastTokensPerSec > 0 ? `${main} · ${lastTokensPerSec} T/s` : main];
  }

  // ── Detailed view ──
  const windows: Array<[string, string | undefined, string | undefined]> = [
    ["minute", limits.minute.remaining, limits.minute.limit],
    ["hour", limits.hour.remaining, limits.hour.limit],
    ["day", limits.day.remaining, limits.day.limit],
    ["month", limits.month.remaining, limits.month.limit],
  ];

  const rows: string[] = ["SAIA rate limits"];
  for (const [name, remaining, limit] of windows) {
    if (remaining == null) continue;
    const rem = formatRemaining(remaining);
    const lim = limit ? formatRemaining(limit) : undefined;
    const status = windowStatus(remaining, limit);
    const line = lim
      ? `  ${name.padEnd(6)} ${rem} / ${lim} remaining`
      : `  ${name.padEnd(6)} ${rem} remaining`;
    rows.push(colorize(line, status));
  }
  if (resetSeconds != null) {
    rows.push(`  reset  ${resetSeconds}s`);
  }
  if (lastTokensPerSec > 0) {
    rows.push(`  speed  ${lastTokensPerSec} T/s`);
  }
  return rows;
}

function showRateLimits(ctx: any): void {
  try {
    const lines = buildWidgetLines();
    // Change detection: don't redraw if nothing changed.
    const key = lines.join("\n");
    const lastKey = lastWidgetLines?.join("\n");
    if (key === lastKey) return;
    lastWidgetLines = lines;
    ctx.ui.setWidget(RATE_LIMIT_WIDGET, lines, { placement: "aboveEditor" });
  } catch (err) {
    console.warn(`[prime-agent-saia] showRateLimits error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function isSaia(ctx: any): boolean {
  return ctx?.model?.provider === "saia";
}

function clearRateLimits(ctx: any): void {
  lastWidgetLines = null;
  ctx.ui.setWidget(RATE_LIMIT_WIDGET, undefined, { placement: "aboveEditor" });
}

/** Persist rate limits to the session via appendEntry. */
function persistLimits(pi: ExtensionAPI): void {
  try {
    const data: { limits: SaiaLimits; resetSeconds?: string; timestamp: string } = {
      limits,
      resetSeconds,
      timestamp: new Date().toISOString(),
    };
    pi.appendEntry(LIMITS_CUSTOM_TYPE, data);
  } catch {
    // Persistence is best-effort.
  }
}

/** Restore rate limits from session entries on startup. */
function restoreLimits(pi: ExtensionAPI): void {
  try {
    // Scan session entries for our custom type (not directly exposed via API,
    // but ctx.sessionManager has read-only access to entries).
    // For now, the widget shows "fetching…" until the first response.
  } catch {
    // Best-effort.
  }
}

// ── Extension entry point ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-saia] v28 loaded (provider-isolated SAIA quota widget)");

  // ── 1. Fix developer→system role for Qwen 3.x ──
  pi.on("before_provider_request", (event, ctx) => {
    try {
      if (ctx.model?.provider !== "saia") return;
      if (typeof ctx.model.id !== "string" || !STRICT_QWEN.test(ctx.model.id)) return;
      const messages = (event.payload as Record<string, unknown>)?.messages;
      if (!Array.isArray(messages)) return;
      for (const message of messages) {
        if (message?.role === "developer") message.role = "system";
      }
    } catch (err) {
      console.warn(`[prime-agent-saia] before_provider_request error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // ── 2. Read rate limit headers from responses ──
  pi.on("after_provider_response", (event, ctx) => {
    try {
      if (!ctx.hasUI || !isSaia(ctx)) return;
      const headers = event.headers;

      const newLimits: SaiaLimits = {
        minute: {
          remaining: quotaHeader(headers, "x-ratelimit-remaining-minute"),
          limit: quotaHeader(headers, "x-ratelimit-limit-minute"),
        },
        hour: {
          remaining: quotaHeader(headers, "x-ratelimit-remaining-hour"),
          limit: quotaHeader(headers, "x-ratelimit-limit-hour"),
        },
        day: {
          remaining: quotaHeader(headers, "x-ratelimit-remaining-day"),
          limit: quotaHeader(headers, "x-ratelimit-limit-day"),
        },
        month: {
          remaining: quotaHeader(headers, "x-ratelimit-remaining-month"),
          limit: quotaHeader(headers, "x-ratelimit-limit-month"),
        },
      };

      const newReset = quotaHeader(headers, "ratelimit-reset");

      // Skip if no limit data at all (not a SAIA response)
      const hasAnyData = Object.values(newLimits).some((w) => w.remaining != null);
      if (!hasAnyData) return;

      // Check if values actually changed
      const changed =
        newReset !== resetSeconds ||
        Object.keys(newLimits).some(
          (key) =>
            newLimits[key as keyof SaiaLimits].remaining !== limits[key as keyof SaiaLimits].remaining ||
            newLimits[key as keyof SaiaLimits].limit !== limits[key as keyof SaiaLimits].limit
        );

      if (!changed) return;

      limits = newLimits;
      resetSeconds = newReset;

      console.log(`[prime-agent-saia] rate limits: ${buildWidgetLines()[0]}`);
      showRateLimits(ctx);
      persistLimits(pi);
    } catch (err) {
      console.warn(`[prime-agent-saia] after_provider_response error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // ── 3. Track response streaming speed ──
  // Timer starts when SAIA's response headers arrive (actual streaming start),
  // not at turn_start (which includes context building & tool execution).
  pi.on("after_provider_response", (_event, ctx) => {
    if (!ctx.hasUI || !isSaia(ctx)) return;
    streamStartTimestamp = Date.now();
  });

  pi.on("message_end", (event, ctx) => {
    try {
      if (!ctx.hasUI || !isSaia(ctx)) return;
      const msg = (event as any).message;
      if (msg?.role !== "assistant" || msg?.provider !== "saia") return;
      const outputTokens = msg?.usage?.output ?? 0;
      if (outputTokens <= 0) return;
      if (streamStartTimestamp <= 0) return;
      const elapsedMs = Date.now() - streamStartTimestamp;
      if (elapsedMs <= 0) return;
      lastTokensPerSec = Math.round((outputTokens / elapsedMs) * 1000);
      if (lastTokensPerSec > 0) showRateLimits(ctx);
    } catch (err) {
      console.warn(`[prime-agent-saia] message_end error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // ── 4. Show the widget only for an active SAIA model ──
  pi.on("session_start", (_event, ctx) => {
    try {
      if (!ctx.hasUI) return;
      if (!isSaia(ctx)) return clearRateLimits(ctx);
      showRateLimits(ctx);
    } catch (err) {
      console.warn(`[prime-agent-saia] session_start error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  pi.on("model_select", (_event, ctx) => {
    try {
      if (!ctx.hasUI) return;
      if (!isSaia(ctx)) {
        streamStartTimestamp = 0;
        lastTokensPerSec = 0;
        return clearRateLimits(ctx);
      }
      lastWidgetLines = null;
      showRateLimits(ctx);
    } catch (err) {
      console.warn(`[prime-agent-saia] model_select error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // ── 5. /saia-limits command ──
  pi.registerCommand("saia-limits", {
    description: "Toggle compact and detailed SAIA rate-limit view (includes reset countdown)",
    handler: async (_args, ctx) => {
      try {
        if (!ctx.hasUI || !isSaia(ctx)) {
          if (ctx.hasUI) {
            clearRateLimits(ctx);
            ctx.ui.notify("SAIA rate limits are available only for an active SAIA model", "info");
          }
          return;
        }
        detailedView = !detailedView;
        // Force update (clear change detection)
        lastWidgetLines = null;
        showRateLimits(ctx);
        ctx.ui.notify(
          `SAIA detailed view ${detailedView ? "shown" : "hidden"}`,
          "info"
        );
      } catch (err) {
        console.warn(`[prime-agent-saia] /saia-limits error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });
}
