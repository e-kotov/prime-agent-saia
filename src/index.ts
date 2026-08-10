// prime-agent-saia: SAIA model fixes for Prime Agent
//
// 1. Qwen system-role fix — SAIA's vLLM for Qwen 3.5/3.6 does NOT support
//    the "developer" role. Prime Agent sends it for reasoning models because
//    compat.supportsDeveloperRole is true for SAIA. This extension rewrites
//    "developer" back to "system" for SAIA Qwen models, fixing HTTP 400
//    "Unexpected message role."
//
// 2. SAIA rate-limit display — reads x-ratelimit-remaining-* headers from
//    SAIA API responses and shows remaining requests via setStatus.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STRICT_QWEN = /^qwen3[.:](?:5|6)/;

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-saia] v5 loaded");

  // ── Fix: rewrite developer role → system for SAIA Qwen models ──────────
  pi.on("before_provider_request", (event, ctx) => {
    const provider = ctx.model?.provider;
    const modelId = ctx.model?.id ?? String(event.payload?.model ?? "");
    if (provider !== "saia" || !STRICT_QWEN.test(modelId)) return;

    const msgs = event.payload?.messages;
    if (!msgs || !Array.isArray(msgs)) return;

    // If the first message has role "developer", rewrite to "system"
    // This is what SAIA's vLLM for Qwen 3.5/3.6 expects.
    // Debug: log the roles before fix
    const roles = msgs.map(m => JSON.stringify(m.role)).join(", ");
    console.log("[prime-agent-saia] Qwen payload roles:", roles);

    let changed = false;
    for (const m of msgs) {
      if (m.role === "developer") {
        m.role = "system";
        changed = true;
      }
    }

    if (changed) {
      console.log("[prime-agent-saia] Rewrote developer -> system for", modelId);
    }
  });

  // ── Capture SAIA rate-limit headers & show via setStatus ────────────────
  pi.on("after_provider_response", (event, ctx) => {
    const h = event.headers;
    console.log("[prime-agent-saia] after_provider_response status=" + event.status + " headers=" + typeof h + " keys=" + (h ? Object.keys(h).join(",") : "null"));

    if (!h) return;
    const get = (k: string): string | null => {
      if (typeof (h as Headers).get === "function") return (h as Headers).get(k);
      const v = (h as Record<string, string>)[k];
      return v != null ? String(v) : null;
    };
    const minute = get("x-ratelimit-remaining-minute");
    const hour   = get("x-ratelimit-remaining-hour");
    console.log("[prime-agent-saia] headers minute=" + minute + " hour=" + hour);
    if (!minute && !hour) return;

    const text = [minute && minute + "/m", hour && hour + "/h"].filter(Boolean).join(" ");
    console.log("[prime-agent-saia] setting status to:", text);
    ctx.ui.setStatus("saia-limits", text);
  });
}
