// prime-agent-saia: SAIA model fixes for Prime Agent
// Fixes: (1) developer->system role for Qwen 3.5/3.6 on SAIA
//        (2) shows SAIA rate-limit headers in footer status bar

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STRICT_QWEN = /^qwen3[.:](?:5|6)/;

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-saia] v8 loaded");

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

  // Capture SAIA rate-limit headers and show via setStatus
  pi.on("after_provider_response", (event, ctx) => {
    const h = event.headers;
    if (!h) return;
    const get = (k) => typeof h.get === "function" ? h.get(k) : h[k];
    const minute = get("x-ratelimit-remaining-minute");
    const hour   = get("x-ratelimit-remaining-hour");
    if (!minute && !hour) return;
    const text = [minute && minute + "/m", hour && hour + "/h"].filter(Boolean).join(" ");
    ctx.ui.setStatus("saia", text);
  });
}
