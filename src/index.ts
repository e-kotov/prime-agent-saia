// prime-agent-saia: SAIA model fixes for Prime Agent
//
// Fixes: (1) developer->system role for Qwen 3.5/3.6 on SAIA
//        (2) custom footer showing SAIA rate limits + tokens

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AssistantMessage } from "@earendil-works/pi-ai";

const STRICT_QWEN = /^qwen3[.:](?:5|6)/;
let saiaLimitsCache = "";
let activeTui: any = null;
let footerFactory: any = null;

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-saia] v18 loaded");

  // Fix developer -> system role for SAIA Qwen models
  pi.on("before_provider_request", (event, ctx) => {
    if (ctx.model?.provider !== "saia") return;
    const id = ctx.model?.id;
    if (typeof id !== "string" || !STRICT_QWEN.test(id)) return;
    const msgs = event.payload?.messages;
    if (!Array.isArray(msgs)) return;
    for (const m of msgs) {
      if (m.role === "developer") m.role = "system";
    }
  });

  // Capture SAIA rate-limit headers and re-render footer
  pi.on("after_provider_response", (event, _ctx) => {
    const h = event.headers;
    if (!h) return;
    const get = (k) => typeof h.get === "function" ? h.get(k) : h[k];
    const minute = get("x-ratelimit-remaining-minute");
    const hour   = get("x-ratelimit-remaining-hour");
    if (!minute && !hour) return;
    saiaLimitsCache = [minute && minute + "/m", hour && hour + "/h"].filter(Boolean).join(" ");
    console.log("[prime-agent-saia] rate limits: " + saiaLimitsCache);

    // Trigger footer re-render
    if (activeTui) {
      console.log("[prime-agent-saia] calling tui.requestRender()");
      activeTui.requestRender();
    }
  });

  // Set up custom footer on session start
  pi.on("session_start", async (_event, ctx) => {
    footerFactory = (tui: any, theme: any, footerData: any) => {
      activeTui = tui;
      console.log("[prime-agent-saia] footer created, activeTui captured");

      const unsub = footerData.onBranchChange(() => {
        tui.requestRender();
      });

      return {
        dispose: unsub,
        invalidate() {
          tui.requestRender();
        },
        render(width: number): string[] {
          let input = 0, output = 0;
          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message?.role === "assistant") {
              const m = e.message as AssistantMessage;
              input  += m.usage?.input  || 0;
              output += m.usage?.output || 0;
            }
          }
          const fmt = (n: number) => n < 1000 ? n : (n / 1000).toFixed(1) + "k";
          const model = ctx.model?.id || "";
          const modelShort = model.length > 30 ? model.slice(0, 27) + "..." : model;

          let left = "";
          if (saiaLimitsCache) {
            left = theme.fg("dim", "SAIA " + saiaLimitsCache + "  ");
          }
          const right = theme.fg("dim", modelShort + "  \u2191" + fmt(input) + " \u2193" + fmt(output));

          const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
          return [truncateToWidth(left + pad + right, width)];
        },
      };
    };

    ctx.ui.setFooter(footerFactory);
    console.log("[prime-agent-saia] custom footer set");
  });
}
