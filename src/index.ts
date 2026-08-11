// prime-agent-saia: SAIA compatibility and rate-limit display for Prime Agent.
// Qwen 3.5/3.6 rejects OpenAI's `developer` role.  Prime Agent normally runs
// extensions in a daemon worker, where custom footer components are not
// transported to the terminal client; use a persistent widget above the editor
// instead (the nearest daemon-supported equivalent of a footer).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STRICT_QWEN = /^qwen3[.:](?:5|6)/;
const RATE_LIMIT_WIDGET = "prime-agent-saia-rate-limits";
type QuotaWindow = { remaining?: string; limit?: string };
let saiaLimits: Record<"minute" | "hour" | "day" | "month", QuotaWindow> = {
  minute: {}, hour: {}, day: {}, month: {},
};
let resetSeconds: string | undefined;
let detailedView = false;

function readHeader(headers: any, name: string): string | undefined {
  const value = typeof headers?.get === "function" ? headers.get(name) : headers?.[name];
  return value == null || value === "" ? undefined : String(value);
}

function formatRatio(window: QuotaWindow, suffix: string): string | undefined {
  if (!window.remaining) return undefined;
  return window.limit ? `${window.remaining}/${window.limit}${suffix}` : `${window.remaining}${suffix}`;
}

function rateLimitLine(): string {
  const ratios = [
    formatRatio(saiaLimits.minute, "m"),
    formatRatio(saiaLimits.hour, "h"),
    formatRatio(saiaLimits.day, "d"),
    formatRatio(saiaLimits.month, "mo"),
  ].filter(Boolean);
  return ratios.length > 0 ? `SAIA  ${ratios.join(" · ")}` : "SAIA  fetching rate limits…";
}

function rateLimitLines(): string[] {
  if (!detailedView) return [rateLimitLine()];
  const windows: Array<[string, QuotaWindow]> = [
    ["Minute", saiaLimits.minute],
    ["Hour", saiaLimits.hour],
    ["Day", saiaLimits.day],
    ["Month", saiaLimits.month],
  ];
  const rows = windows.flatMap(([name, quota]) => {
    if (!quota.remaining) return [];
    return [`  ${name.padEnd(6)} ${quota.remaining}${quota.limit ? ` / ${quota.limit}` : ""} requests remaining`];
  });
  return ["SAIA rate limits", ...rows, ...(resetSeconds ? [`  Reset  ${resetSeconds} s`] : [])];
}

function showRateLimits(ctx: any): void {
  // Array widgets are forwarded from daemon workers to the interactive client.
  // Custom footer components are intentionally a no-op in daemon/RPC mode.
  ctx.ui.setWidget(RATE_LIMIT_WIDGET, rateLimitLines(), { placement: "aboveEditor" });
}

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-saia] v26 loaded (compact SAIA quota widget)");

  // SAIA's Qwen 3.5/3.6 endpoint does not accept the OpenAI `developer` role.
  pi.on("before_provider_request", (event, ctx) => {
    if (ctx.model?.provider !== "saia") return;
    if (typeof ctx.model.id !== "string" || !STRICT_QWEN.test(ctx.model.id)) return;
    const messages = event.payload?.messages;
    if (!Array.isArray(messages)) return;
    for (const message of messages) {
      if (message?.role === "developer") message.role = "system";
    }
  });

  pi.on("after_provider_response", (event, ctx) => {
    saiaLimits = {
      minute: {
        remaining: readHeader(event.headers, "x-ratelimit-remaining-minute"),
        limit: readHeader(event.headers, "x-ratelimit-limit-minute"),
      },
      hour: {
        remaining: readHeader(event.headers, "x-ratelimit-remaining-hour"),
        limit: readHeader(event.headers, "x-ratelimit-limit-hour"),
      },
      day: {
        remaining: readHeader(event.headers, "x-ratelimit-remaining-day"),
        limit: readHeader(event.headers, "x-ratelimit-limit-day"),
      },
      month: {
        remaining: readHeader(event.headers, "x-ratelimit-remaining-month"),
        limit: readHeader(event.headers, "x-ratelimit-limit-month"),
      },
    };
    resetSeconds = readHeader(event.headers, "ratelimit-reset");
    if (!Object.values(saiaLimits).some((window) => window.remaining)) return;

    console.log(`[prime-agent-saia] rate limits: ${rateLimitLine()}`);
    showRateLimits(ctx);
  });

  pi.on("session_start", (_event, ctx) => {
    showRateLimits(ctx);
    console.log("[prime-agent-saia] rate-limit widget set");
  });

  pi.registerCommand("saia-limits", {
    description: "Toggle compact and detailed SAIA rate-limit views",
    handler: async (_args, ctx) => {
      detailedView = !detailedView;
      showRateLimits(ctx);
      ctx.ui.notify(`SAIA detailed view ${detailedView ? "shown" : "hidden"}`, "info");
    },
  });
}
