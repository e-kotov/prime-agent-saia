// prime-agent-saia: SAIA model fixes for Prime Agent
//
// 1. Qwen system-message merger — merges multiple system message fragments
//    into one for Qwen 3.5/3.6 models on SAIA. Fixes HTTP 400
//    "Unexpected message role."
//
// 2. SAIA rate-limit display — reads x-ratelimit-remaining-* headers from
//    SAIA API responses and shows remaining requests in the footer status
//    bar, to the left of the token/cost display.

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Matches Qwen 3.5.x and 3.6.x model IDs (the strict ones on SAIA).
const STRICT_QWEN = /^qwen3[.:](?:5|6)/;

// ---------------------------------------------------------------------------
// Rate-limit state (persists across turns in memory)
// ---------------------------------------------------------------------------

interface SaiaLimits {
  minute: string | null;
  hour: string | null;
  day: string | null;
  month: string | null;
  updatedAt: string;
}

let lastLimits: SaiaLimits | null = null;

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // ── Qwen system-message merger ──────────────────────────────────────────
  pi.on("before_provider_request", (event, _ctx) => {
    if (event.payload?.provider !== "saia") return;
    const modelId: string | undefined = event.payload?.model;
    if (!modelId || !STRICT_QWEN.test(modelId)) return;

    const messages = event.payload?.messages;
    if (!messages || !Array.isArray(messages)) return;

    const systemMsgs = messages.filter((m) => m.role === "system");
    if (systemMsgs.length <= 1) return;

    const merged = systemMsgs.map((m) => m.content ?? "").join("\n\n");
    event.payload = {
      ...event.payload,
      messages: [
        { role: "system", content: merged },
        ...messages.filter((m) => m.role !== "system"),
      ],
    };
  });

  // ── Capture SAIA rate-limit headers from responses ──────────────────────
  pi.on("after_provider_response", (event, _ctx) => {
    const h = event.headers;
    if (!h) return;

    // Helper: safely read a header from a Headers instance or a plain object
    const get = (k: string): string | null => {
      if (typeof (h as Headers).get === "function") return (h as Headers).get(k);
      const v = (h as Record<string, string>)[k];
      return v != null ? String(v) : null;
    };

    const minute = get("x-ratelimit-remaining-minute");
    const hour   = get("x-ratelimit-remaining-hour");
    const day    = get("x-ratelimit-remaining-day");
    const month  = get("x-ratelimit-remaining-month");

    // Skip if no SAIA rate-limit headers present
    if (minute === null && hour === null && day === null && month === null) return;

    lastLimits = { minute, hour, day, month, updatedAt: new Date().toISOString() };
  });

  // ── Custom footer: SAIA limits (left) + token stats (right) ────────────
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          // Token stats (same as default footer)
          let input = 0, output = 0, cost = 0;
          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message.role === "assistant") {
              const m = e.message as AssistantMessage;
              input  += m.usage.input;
              output += m.usage.output;
              cost   += m.usage.cost.total;
            }
          }

          const fmt = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`);

          // SAIA limits on the left
          let left = "";
          if (lastLimits) {
            const parts: string[] = [];
            if (lastLimits.minute !== null) parts.push(`${lastLimits.minute}/m`);
            if (lastLimits.hour   !== null) parts.push(`${lastLimits.hour}/h`);
            left = theme.fg("dim", `SAIA ${parts.join(" ") } `);
          }

          // Token stats on the right (model name + input/output/cost)
          const right = theme.fg("dim", `${ctx.model?.id || "no-model"}  ↑${fmt(input)} ↓${fmt(output)} $${cost.toFixed(3)}`);

          const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
          return [truncateToWidth(left + pad + right, width)];
        },
      };
    });
  });
}
