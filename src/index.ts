// prime-agent-saia: SAIA model fixes for Prime Agent
//
// Currently fixes Qwen 3.5 / 3.6 system-message merging.
// SAIA's vLLM deployments for Qwen3.5 and Qwen3.6 accept only ONE leading
// system message. Prime Agent may send multiple fragments (base system prompt,
// harness instructions, skill directives, etc.), which triggers HTTP 400
// "Unexpected message role."  This extension merges them into one.
//
// To install:  ln -sf "$PWD/index.ts" ~/.prime/agent/extensions/saia.ts
// Or symlink the whole dir:  ln -sfn "$PWD" ~/.prime/agent/extensions/saia

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Matches Qwen 3.5.x and 3.6.x model IDs (the strict ones on SAIA)
const STRICT_QWEN = /^qwen3[.:](?:5|6)/;

export default function (pi: ExtensionAPI) {
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
}
