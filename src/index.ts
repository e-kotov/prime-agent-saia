// prime-agent-saia: SAIA model fixes for Prime Agent
//
// 1. Qwen system-role fix — rewrites developer role to system for SAIA
//    Qwen 3.5/3.6 models. Fixes HTTP 400 "Unexpected message role."
//
// 2. SAIA rate-limit display — reads x-ratelimit-remaining-* headers from
//    SAIA API responses and shows them in the footer.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STRICT_QWEN = /^qwen3[.:](?:5|6)/;
let saiaLimitsCache = "";

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-saia] v7 loaded");

  // Fix: rewrite developer role to system for SAIA Qwen models
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

  // Capture SAIA rate-limit headers
  pi.on("after_provider_response", (event, _ctx) => {
    const h = event.headers;
    if (!h) return;
    const get = (k) => typeof h.get === "function" ? h.get(k) : h[k];
    const minute = get("x-ratelimit-remaining-minute");
    const hour   = get("x-ratelimit-remaining-hour");
    if (!minute && !hour) return;
    saiaLimitsCache = [minute && minute + "/m", hour && hour + "/h"].filter(Boolean).join(" ");
  });

  // Custom footer: SAIA limits (left) + model + token counts (right)
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());
      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          let input = 0, output = 0;
          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message?.role === "assistant" && e.message?.usage) {
              input  += e.message.usage.input  || 0;
              output += e.message.usage.output || 0;
            }
          }
          const fmt = (n) => n < 1000 ? n : (n / 1000).toFixed(1) + "k";
          const model = ctx.model?.id || "";
          const modelShort = model.length > 30 ? model.slice(0, 27) + "..." : model;

          let left = "";
          if (saiaLimitsCache) {
            left = theme.fg("dim", "SAIA " + saiaLimitsCache + "  ");
          }
          const right = theme.fg("dim", modelShort + "  \u2191" + fmt(input) + " \u2193" + fmt(output));

          const leftLen = left.replace(/\x1b\[\d+m/g, "").length;
          const rightLen = right.replace(/\x1b\[\d+m/g, "").length;
          const pad = " ".repeat(Math.max(1, width - leftLen - rightLen));
          return [left + pad + right];
        },
      };
    });
  });
}
