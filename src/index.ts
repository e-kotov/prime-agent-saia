// prime-agent-saia: SAIA model fixes for Prime Agent
//
// 1. Qwen system-message merger — merges multiple system message fragments
//    into one for Qwen 3.5/3.6 models on SAIA. Fixes HTTP 400
//    "Unexpected message role."
//
// 2. SAIA rate-limit display — reads x-ratelimit-remaining-* headers from
//    SAIA API responses and shows remaining requests via setStatus in the
//    footer status bar.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Matches Qwen 3.5.x and 3.6.x model IDs (the strict ones on SAIA).
const STRICT_QWEN = /^qwen3[.:](?:5|6)/;

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-saia] Extension loaded");

  // ── Qwen system-message merger ──────────────────────────────────────────
  pi.on("before_provider_request", (event, ctx) => {
    // ctx.model.provider is the provider name, NOT event.payload (raw API body).
    if (ctx.model?.provider !== "saia") return;
    const modelId = ctx.model?.id ?? event.payload?.model;
    if (!modelId || typeof modelId !== "string" || !STRICT_QWEN.test(modelId)) return;

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

  // ── Capture SAIA rate-limit headers & show via setStatus ────────────────
  pi.on("after_provider_response", (event, ctx) => {
    const h = event.headers;
    if (!h) return;

    const get = (k: string): string | null => {
      if (typeof (h as Headers).get === "function") return (h as Headers).get(k);
      const v = (h as Record<string, string>)[k];
      return v != null ? String(v) : null;
    };

    const minute = get("x-ratelimit-remaining-minute");
    const hour   = get("x-ratelimit-remaining-hour");
    if (minute === null && hour === null) return;

    const parts: string[] = [];
    if (minute !== null) parts.push(`${minute}/m`);
    if (hour   !== null) parts.push(`${hour}/h`);
    ctx.ui.setStatus("saia-limits", parts.join(" "));
  });
}
