// prime-agent-saia: SAIA model fixes for Prime Agent
//
// 1. Qwen system-role fix — rewrites developer role to system for SAIA
//    Qwen 3.5/3.6 models. Fixes HTTP 400 "Unexpected message role."
//
// 2. SAIA rate-limit display — reads x-ratelimit-remaining-* headers from
//    SAIA API responses and shows them in the footer next to token stats.

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const STRICT_QWEN = /^qwen3[.:](?:5|6)/;
let saiaLimitsCache = "";

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-saia] v6 loaded");

  // ── Fix: rewrite developer role to system for SAIA Qwen models --------
  pi.on("before_provider_request", (event, ctx) => {
    const provider = ctx.model?.provider;
    const modelId = ctx.model?.id ?? String(event.payload?.model ?? "");
    if (provider !== "saia" || !STRICT_QWEN.test(modelId)) return;
    const msgs = event.payload?.messages;
    if (!msgs || !Array.isArray(msgs)) return;
    for (const m of msgs) {
      if (m.role === "developer") m.role = "system";
    }
  });

  // ── Capture SAIA rate-limit headers -----------------------------------
  pi.on("after_provider_response", (event, _ctx) => {
    const h = event.headers;
    if (!h) return;
    const get = (k) => typeof h.get === "function" ? h.get(k) : h[k];
    const minute = get("x-ratelimit-remaining-minute");
    const hour   = get("x-ratelimit-remaining-hour");
    if (!minute && !hour) return;
    saiaLimitsCache = [minute && minute + "/m", hour && hour + "/h"].filter(Boolean).join(" ");
  });

  // ── Custom footer: SAIA limits (left) + token stats (right) -----------
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          // Token/cost stats (same as default footer)
          let input = 0, output = 0, cost = 0;
          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message.role === "assistant") {
              const m = e.message as AssistantMessage;
              input  += m.usage.input;
              output += m.usage.output;
              cost   += m.usage.cost.total;
            }
          }
          const fmt = (n) => (n < 1000 ? n : (n / 1000).toFixed(1) + "k");

          // Left: SAIA limits if available
          let left = "";
          if (saiaLimitsCache) {
            left = theme.fg("dim", "SAIA " + saiaLimitsCache + " ");
          }
          // Right: model + tokens + cost
          const right = theme.fg(
            "dim",
            (ctx.model?.id || "no-model") +
              "  ↑" + fmt(input) + " ↓" + fmt(output) +
              " $" + cost.toFixed(3)
          );

          const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
          return [truncateToWidth(left + pad + right, width)];
        },
      };
    });
  });
}
