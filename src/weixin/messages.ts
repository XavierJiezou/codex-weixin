export type WeixinRawMessage = {
  message_id?: string | number;
  from_user_id?: string;
  sender?: string;
  context_token?: string;
  item_list?: Array<Record<string, unknown>>;
  text?: string;
};

export type WeixinInboundAttachment = {
  kind: "image" | "file" | "video";
  label: string;
  item: Record<string, unknown>;
};

export type NormalizedWeixinMessage = {
  id: string;
  senderId: string;
  contextToken?: string;
  text: string;
  attachments: WeixinInboundAttachment[];
  raw: WeixinRawMessage;
};

export function normalizeWeixinMessage(raw: WeixinRawMessage): NormalizedWeixinMessage | undefined {
  const senderId = raw.from_user_id ?? raw.sender;
  if (!senderId) {
    return undefined;
  }
  const textParts: string[] = [];
  if (typeof raw.text === "string") {
    textParts.push(raw.text);
  }
  for (const item of raw.item_list ?? []) {
    const text = extractTextItem(item);
    if (text) {
      textParts.push(text);
    }
  }
  const attachments = extractAttachments(raw.item_list ?? []);
  return {
    id: String(raw.message_id ?? `${senderId}:${Date.now()}`),
    senderId,
    contextToken: raw.context_token,
    text: textParts.join("\n").trim(),
    attachments,
    raw
  };
}

export function extractTextItem(item: Record<string, unknown>): string | undefined {
  const direct = item.text;
  if (typeof direct === "string") {
    return direct;
  }
  const textItem = item.text_item;
  if (textItem && typeof textItem === "object" && typeof (textItem as { text?: unknown }).text === "string") {
    return (textItem as { text: string }).text;
  }
  return undefined;
}

export function extractAttachments(items: Array<Record<string, unknown>>): WeixinInboundAttachment[] {
  const attachments: WeixinInboundAttachment[] = [];
  for (const item of items) {
    const type = typeof item.type === "number" ? item.type : undefined;
    if (type === 2 && hasMedia(item.image_item)) {
      attachments.push({ kind: "image", label: "image", item });
      continue;
    }
    if (type === 4 && hasMedia(item.file_item)) {
      const fileItem = item.file_item as { file_name?: unknown };
      const label = typeof fileItem.file_name === "string" && fileItem.file_name.trim()
        ? fileItem.file_name.trim()
        : "file";
      attachments.push({ kind: "file", label, item });
      continue;
    }
    if (type === 5 && hasMedia(item.video_item)) {
      attachments.push({ kind: "video", label: "video.mp4", item });
    }
  }
  return attachments;
}

function hasMedia(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const media = (value as { media?: unknown }).media;
  if (!media || typeof media !== "object") {
    return false;
  }
  const candidate = media as { encrypt_query_param?: unknown; full_url?: unknown };
  return typeof candidate.encrypt_query_param === "string" || typeof candidate.full_url === "string";
}
