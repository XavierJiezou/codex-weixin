export type WeixinRawMessage = {
  message_id?: string | number;
  from_user_id?: string;
  sender?: string;
  context_token?: string;
  item_list?: Array<Record<string, unknown>>;
  text?: string;
};

export type NormalizedWeixinMessage = {
  id: string;
  senderId: string;
  contextToken?: string;
  text: string;
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
  return {
    id: String(raw.message_id ?? `${senderId}:${Date.now()}`),
    senderId,
    contextToken: raw.context_token,
    text: textParts.join("\n").trim(),
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

