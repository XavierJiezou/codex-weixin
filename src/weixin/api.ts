import crypto from "node:crypto";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type WeixinApiClientOptions = {
  baseUrl: string;
  token: string;
  fetch?: FetchLike;
};

export class WeixinApiError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly ret?: number,
    public readonly errcode?: number
  ) {
    super(message);
    this.name = "WeixinApiError";
  }
}

export function isStaleContextError(error: unknown): boolean {
  return error instanceof WeixinApiError && error.endpoint === "sendmessage" && error.ret === -2;
}

export class WeixinApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: WeixinApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async getUpdates(syncKey?: string): Promise<unknown> {
    return this.post("ilink/bot/getupdates", {
      get_updates_buf: syncKey ?? "",
      base_info: { channel_version: "0.1.0" }
    });
  }

  async sendText(input: {
    toUserId: string;
    text: string;
    contextToken?: string;
  }): Promise<{ messageId: string }> {
    const clientId = crypto.randomUUID();
    const body = {
      msg: {
        from_user_id: "",
        to_user_id: input.toUserId,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        ...(input.contextToken ? { context_token: input.contextToken } : {}),
        item_list: [{ type: 1, text_item: { text: input.text } }]
      },
      base_info: { channel_version: "0.1.0" }
    };
    const response = await this.post("ilink/bot/sendmessage", body);
    return { messageId: String(response.message_id ?? response.msgid ?? clientId) };
  }

  async sendTyping(input: { toUserId: string; contextToken?: string; typing?: boolean }): Promise<void> {
    const config = await this.post("ilink/bot/getconfig", {
      ilink_user_id: input.toUserId,
      ...(input.contextToken ? { context_token: input.contextToken } : {}),
      base_info: { channel_version: "0.1.0" }
    });
    const typingTicket = typeof config.typing_ticket === "string" ? config.typing_ticket.trim() : "";
    if (!typingTicket) {
      throw new Error("getconfig response missing typing_ticket");
    }
    await this.post("ilink/bot/sendtyping", {
      ilink_user_id: input.toUserId,
      typing_ticket: typingTicket,
      status: input.typing === false ? 2 : 1,
      base_info: { channel_version: "0.1.0" }
    });
  }

  async getUploadUrl(input: {
    fileKey: string;
    mediaType: number;
    toUserId: string;
    rawSize: number;
    rawFileMd5: string;
    cipherSize: number;
    noNeedThumb?: boolean;
    aesKeyHex?: string;
  }): Promise<{ uploadParam?: string; uploadFullUrl?: string; fileKey?: string }> {
    const response = await this.post("ilink/bot/getuploadurl", {
      filekey: input.fileKey,
      media_type: input.mediaType,
      to_user_id: input.toUserId,
      rawsize: input.rawSize,
      rawfilemd5: input.rawFileMd5,
      filesize: input.cipherSize,
      ...(typeof input.noNeedThumb === "boolean" ? { no_need_thumb: input.noNeedThumb } : {}),
      ...(input.aesKeyHex ? { aeskey: input.aesKeyHex } : {}),
      base_info: { channel_version: "0.1.0" }
    });
    return {
      uploadParam: typeof response.upload_param === "string" ? response.upload_param : undefined,
      uploadFullUrl: typeof response.upload_full_url === "string" ? response.upload_full_url : undefined,
      fileKey: typeof response.filekey === "string" ? response.filekey : undefined
    };
  }

  async sendFileMessage(input: {
    toUserId: string;
    fileName: string;
    encryptQueryParam: string;
    aesKeyBase64: string;
    plainSize: number;
    contextToken?: string;
  }): Promise<{ messageId: string }> {
    const clientId = crypto.randomUUID();
    const response = await this.post("ilink/bot/sendmessage", {
      msg: {
        from_user_id: "",
        to_user_id: input.toUserId,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        ...(input.contextToken ? { context_token: input.contextToken } : {}),
        item_list: [{
          type: 4,
          file_item: {
            media: {
              encrypt_query_param: input.encryptQueryParam,
              aes_key: input.aesKeyBase64,
              encrypt_type: 1
            },
            file_name: input.fileName,
            len: String(input.plainSize)
          }
        }]
      },
      base_info: { channel_version: "0.1.0" }
    });
    return { messageId: String(response.message_id ?? response.msgid ?? clientId) };
  }

  async sendImageMessage(input: {
    toUserId: string;
    encryptQueryParam: string;
    aesKeyBase64: string;
    cipherSize: number;
    contextToken?: string;
  }): Promise<{ messageId: string }> {
    const clientId = crypto.randomUUID();
    const response = await this.post("ilink/bot/sendmessage", {
      msg: {
        from_user_id: "",
        to_user_id: input.toUserId,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        ...(input.contextToken ? { context_token: input.contextToken } : {}),
        item_list: [{
          type: 2,
          image_item: {
            media: {
              encrypt_query_param: input.encryptQueryParam,
              aes_key: input.aesKeyBase64,
              encrypt_type: 1
            },
            mid_size: input.cipherSize,
            hd_size: input.cipherSize
          }
        }]
      },
      base_info: { channel_version: "0.1.0" }
    });
    return { messageId: String(response.message_id ?? response.msgid ?? clientId) };
  }

  async sendVideoMessage(input: {
    toUserId: string;
    encryptQueryParam: string;
    aesKeyBase64: string;
    cipherSize: number;
    contextToken?: string;
  }): Promise<{ messageId: string }> {
    const clientId = crypto.randomUUID();
    const response = await this.post("ilink/bot/sendmessage", {
      msg: {
        from_user_id: "",
        to_user_id: input.toUserId,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        ...(input.contextToken ? { context_token: input.contextToken } : {}),
        item_list: [{
          type: 5,
          video_item: {
            media: {
              encrypt_query_param: input.encryptQueryParam,
              aes_key: input.aesKeyBase64,
              encrypt_type: 1
            },
            video_size: input.cipherSize
          }
        }]
      },
      base_info: { channel_version: "0.1.0" }
    });
    return { messageId: String(response.message_id ?? response.msgid ?? clientId) };
  }

  private async post(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${this.baseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        AuthorizationType: "ilink_bot_token",
        Authorization: `Bearer ${this.options.token}`
      },
      body: JSON.stringify(body)
    });

    const text = await response.text();
    if (!response.ok) {
      throw new WeixinApiError(`${endpoint} failed with HTTP ${response.status}: ${text}`, shortEndpoint(endpoint));
    }

    const parsed = text ? JSON.parse(text) as Record<string, unknown> : {};
    const ret = typeof parsed.ret === "number" ? parsed.ret : 0;
    const errcode = typeof parsed.errcode === "number" ? parsed.errcode : undefined;
    if (ret !== 0) {
      throw new WeixinApiError(
        `${shortEndpoint(endpoint)} failed: ret=${ret} errcode=${errcode ?? "undefined"} errmsg=${String(parsed.errmsg ?? "")}`,
        shortEndpoint(endpoint),
        ret,
        errcode
      );
    }
    return parsed;
  }
}

function shortEndpoint(endpoint: string): string {
  return endpoint.split("/").at(-1) ?? endpoint;
}
