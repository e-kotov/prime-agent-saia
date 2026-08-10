// prime-agent-saia: Qwen system-message merger + rate-limit display
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STRICT_QWEN = /^qwen3[.:](?:5|6)/;

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-saia] v3 loaded");

  // Log context event structure for debugging
  pi.on("context", (event, ctx) => {
    if (ctx.model?.provider !== "saia") return;
    console.log("[prime-agent-saia] context for", ctx.model?.id);

    // Print the roles of all messages to understand the format
    const roles = event.messages.map(m => JSON.stringify(m.role)).join(", ");
    console.log("[prime-agent-saia] roles:", roles.substring(0, 500));
  });

  // Log the before_provider_request payload structure
  pi.on("before_provider_request", (event, ctx) => {
    if (ctx.model?.provider !== "saia") return;
    const keys = event.payload ? Object.keys(event.payload).join(", ") : "NO PAYLOAD";
    console.log("[prime-agent-saia] before_provider_request payload keys:", keys);
    console.log("[prime-agent-saia] model =", JSON.stringify(event.payload?.model));
    if (event.payload?.messages) {
      const msgRoles = event.payload.messages.map(m => m.role).join(", ");
      console.log("[prime-agent-saia] message roles:", msgRoles);
    }
  });

  // Rate-limit display
  pi.on("after_provider_response", (event, ctx) => {
    const h = event.headers;
    if (!h) return;
    const get = (k) => typeof h.get === "function" ? h.get(k) : h[k];
    const minute = get("x-ratelimit-remaining-minute");
    const hour = get("x-ratelimit-remaining-hour");
    if (!minute && !hour) return;
    const parts = [];
    if (minute) parts.push(minute + "/m");
    if (hour) parts.push(hour + "/h");
    ctx.ui.setStatus("saia-limits", parts.join(" "));
  });
}
