import type { PromptBufferItem } from "./prompt-buffer.js";

const BRIDGE_ACTION_INSTRUCTIONS = [
  "WeChat bridge rule: when you need to send a local image or file to the user, do not use Markdown local file links.",
  "Use a fenced codex-weixin-actions JSON block instead, for example:",
  "```codex-weixin-actions",
  "{\"send\":[{\"type\":\"image\",\"path\":\"C:/absolute/path/image.png\"}]}",
  "```"
].join("\n");

export function buildPrompt(text: string, attachments: PromptBufferItem[] = []): string {
  const lines: string[] = [BRIDGE_ACTION_INSTRUCTIONS];
  if (text.trim()) {
    lines.push(text.trim());
  }
  for (const attachment of attachments) {
    if (attachment.kind === "text") {
      lines.push(attachment.text);
    } else {
      lines.push(`[WeChat ${attachment.kind}: ${attachment.label} saved to ${attachment.path}]`);
    }
  }
  return lines.join("\n\n").trim();
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
