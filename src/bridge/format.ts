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

type PromptPreviewItem =
  | Pick<Extract<PromptBufferItem, { kind: "text" }>, "kind" | "text">
  | Pick<Extract<PromptBufferItem, { kind: "file" | "image" | "video" | "audio" }>, "kind" | "label">;

export function buildPromptPreview(text: string, attachments: PromptPreviewItem[] = [], limit = 120): string | undefined {
  const labels: Record<Exclude<PromptPreviewItem["kind"], "text">, string> = {
    file: "文件",
    image: "图片",
    video: "视频",
    audio: "音频"
  };
  const parts = [text, ...attachments.map((attachment) => attachment.kind === "text"
    ? attachment.text
    : `${labels[attachment.kind]}：${attachment.label}`
  )];
  const preview = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!preview) return undefined;
  return preview.length > limit ? `${preview.slice(0, Math.max(1, limit - 1))}…` : preview;
}

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
