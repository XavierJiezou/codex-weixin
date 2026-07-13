import type { PromptBufferItem } from "./prompt-buffer.js";

const BRIDGE_ACTION_INSTRUCTIONS = [
  "WeChat bridge rule: when you need to send a local image, video, or file to the user, do not use Markdown local file links.",
  "When a WeChat attachment line includes a local path, inspect the saved local attachment with available tools before answering.",
  "Use a fenced codex-weixin-actions JSON block instead, for example:",
  "```codex-weixin-actions",
  "{\"send\":[{\"type\":\"image\",\"path\":\"C:/absolute/path/image.png\"},{\"type\":\"video\",\"path\":\"C:/absolute/path/video.mp4\"}]}",
  "```"
].join("\n");
const LEGACY_BRIDGE_ACTION_INSTRUCTIONS = BRIDGE_ACTION_INSTRUCTIONS
  .replaceAll("codex-weixin-actions", "codex-weixin-server-actions");

export function buildPrompt(
  text: string,
  attachments: PromptBufferItem[] = [],
  attachmentSource: "WeChat" | "Web" = "WeChat"
): string {
  const lines: string[] = [BRIDGE_ACTION_INSTRUCTIONS];
  if (text.trim()) {
    lines.push(text.trim());
  }
  for (const attachment of attachments) {
    if (attachment.kind === "text") {
      lines.push(attachment.text);
    } else {
      lines.push(`[${attachmentSource} ${attachment.kind}: ${attachment.label} saved to ${attachment.path}]\nInspect the saved local attachment before answering.`);
    }
  }
  return lines.join("\n\n").trim();
}

export type PromptAttachment = {
  source: "WeChat" | "Web";
  kind: "file" | "image" | "video" | "audio";
  label: string;
  path: string;
};

export function parsePrompt(text: string): { text: string; attachments: PromptAttachment[] } {
  let normalized = text.trim();
  for (const instructions of [BRIDGE_ACTION_INSTRUCTIONS, LEGACY_BRIDGE_ACTION_INSTRUCTIONS]) {
    if (normalized.startsWith(instructions)) {
      normalized = normalized.slice(instructions.length).trim();
      break;
    }
  }
  const attachments: PromptAttachment[] = [];
  const visibleText = normalized.replace(
    /^\[(WeChat|Web) (file|image|video|audio): (.+) saved to (.+)]\nInspect the saved local attachment before answering\.$/gm,
    (_match, source: PromptAttachment["source"], kind: PromptAttachment["kind"], label: string, filePath: string) => {
      attachments.push({ source, kind, label, path: filePath });
      return "";
    }
  ).replace(/\n{3,}/g, "\n\n").trim();
  return { text: visibleText, attachments };
}

export function stripBridgeInstructions(text: string): string {
  return parsePrompt(text).text;
}

export function chunkText(text: string, limit = 1800): string[] {
  const normalized = text || "(empty reply)";
  if (normalized.length <= limit) {
    return [normalized];
  }
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    let end = Math.min(cursor + limit, normalized.length);
    const newline = normalized.lastIndexOf("\n", end);
    if (newline > cursor + Math.floor(limit * 0.5)) {
      end = newline;
    }
    chunks.push(normalized.slice(cursor, end).trim());
    cursor = end;
  }
  return chunks.filter(Boolean);
}
