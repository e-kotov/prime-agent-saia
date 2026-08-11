// prime-agent-saia: SAIA compatibility and rate-limit display for Prime Agent.
// Qwen 3.5/3.6 rejects OpenAI's `developer` role.  Prime Agent normally runs
// extensions in a daemon worker, where custom footer components are not
// transported to the terminal client; use a persistent widget above the editor
// instead (the nearest daemon-supported equivalent of a footer).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STRICT_QWEN = /^qwen3[.:](?:5|6)/;
const RATE_LIMIT_WIDGET = "prime-agent-saia-rate-limits";
let saiaLimitsCache = "awaiting first SAIA response";

function readHeader(headers: any, name: string): string | undefined {
  const value = typeof headers?.get === "function" ? headers.get(name) : headers?.[name];
  return value == null || value === "" ? undefined : String(value);
}

function rateLimitLine(): string {
  return `SAIA rate limits: ${saiaLimitsCache}`;
}

function showRateLimits(ctx: any): void {
  // Array widgets are forwarded from daemon workers to the interactive client.
  // Custom footer components are intentionally a no-op in daemon/RPC mode.
  ctx.ui.setWidget(RATE_LIMIT_WIDGET, [rateLimitLine()], { placement: "aboveEditor" });
}

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-saia] v21 loaded (daemon-safe rate-limit widget)");

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
    const minute = readHeader(event.headers, "x-ratelimit-remaining-minute");
    const hour = readHeader(event.headers, "x-ratelimit-remaining-hour");
    if (!minute && !hour) return;

    saiaLimitsCache = [
      minute && `${minute}/min`,
      hour && `${hour}/hour`,
    ].filter(Boolean).join("  ");
    console.log(`[prime-agent-saia] rate limits: ${saiaLimitsCache}`);
    showRateLimits(ctx);
  });

  pi.on("session_start", (_event, ctx) => {
    showRateLimits(ctx);
    console.log("[prime-agent-saia] rate-limit widget set");
  });

  pi.registerCommand("saia-limits", {
    description: "Show the latest SAIA rate limits above the editor",
    handler: async (_args, ctx) => {
      showRateLimits(ctx);
      ctx.ui.notify(rateLimitLine(), "info");
    },
  });
}
