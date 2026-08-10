// prime-agent-saia: Qwen system-message merger + rate-limit display
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STRICT_QWEN = /^qwen3[.:](?:5|6)/;

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-saia] v4 loaded");

  // Log ALL before_provider_request events regardless of provider
  pi.on("before_provider_request", (event, ctx) => {
    const provider = ctx.model?.provider ?? "UNDEFINED";
    const modelId = ctx.model?.id ?? "UNDEFINED";
    const pk = event.payload ? Object.keys(event.payload).join(",") : "NO-PAYLOAD";
    console.log(
      "[prime-agent-saia] onPayload provider=" + provider +
      " model=" + modelId +
      " keys=" + pk
    );

    // Only process SAIA Qwen
    if (provider !== "saia") return;
    const qwenModel = modelId ?? String(event.payload?.model ?? "");
    if (!STRICT_QWEN.test(qwenModel)) return;

    // Merge system messages
    const msgs = event.payload?.messages;
    if (!msgs || !Array.isArray(msgs)) return;
    const sysMsgs = msgs.filter(m => m.role === "system");
    console.log("[prime-agent-saia] Qwen system messages:", sysMsgs.length);

    if (sysMsgs.length <= 1) return;
    const merged = sysMsgs.map(m => m.content ?? "").join("\n\n");
    event.payload = {
      ...event.payload,
      messages: [
        { role: "system", content: merged },
        ...msgs.filter(m => m.role !== "system"),
      ],
    };
    console.log("[prime-agent-saia] MERGED " + sysMsgs.length + " system messages");
  });

  // Log context events too
  pi.on("context", (event, ctx) => {
    console.log(
      "[prime-agent-saia] context provider=" + (ctx.model?.provider ?? "UNDEF") +
      " model=" + (ctx.model?.id ?? "UNDEF") +
      " msgs=" + event.messages.length
    );
  });

  // Rate-limit display
  pi.on("after_provider_response", (event, ctx) => {
    console.log("[prime-agent-saia] onResponse status=" + event.status);
    const h = event.headers;
    if (!h) return;
    const get = (k) => typeof h.get === "function" ? h.get(k) : h[k];
    const minute = get("x-ratelimit-remaining-minute");
    const hour = get("x-ratelimit-remaining-hour");
    if (!minute && !hour) return;
    ctx.ui.setStatus("saia-limits", [minute && minute + "/m", hour && hour + "/h"].filter(Boolean).join(" "));
  });
}
