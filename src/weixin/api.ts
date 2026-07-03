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
    return this.post("ilink/bot/getupdates", syncKey ? { sync_key: syncKey } : {});
  }

  async sendText(input: {
    toUserId: string;
    text: string;
    contextToken?: string;
  }): Promise<{ messageId: string }> {
    const body = {
      to_user_id: input.toUserId,
      ...(input.contextToken ? { context_token: input.contextToken } : {}),
      item_list: [{ type: 1, text_item: { text: input.text } }]
    };
    const response = await this.post("ilink/bot/sendmessage", body);
    return { messageId: String(response.message_id ?? response.msgid ?? "") };
  }

  async sendTyping(input: { toUserId: string; contextToken?: string; typing?: boolean }): Promise<void> {
    await this.post("ilink/bot/sendtyping", {
      to_user_id: input.toUserId,
      typing: input.typing ?? true,
      ...(input.contextToken ? { context_token: input.contextToken } : {})
    });
  }

  async getUploadUrl(input: {
    toUserId: string;
    fileName: string;
    fileSize: number;
    contextToken?: string;
  }): Promise<{ uploadParam?: string; uploadFullUrl?: string; fileKey?: string }> {
    const response = await this.post("ilink/bot/getuploadurl", {
      to_user_id: input.toUserId,
      file_name: input.fileName,
      file_size: input.fileSize,
      ...(input.contextToken ? { context_token: input.contextToken } : {})
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
    size: number;
    contextToken?: string;
  }): Promise<{ messageId: string }> {
    const response = await this.post("ilink/bot/sendmessage", {
      to_user_id: input.toUserId,
      ...(input.contextToken ? { context_token: input.contextToken } : {}),
      item_list: [{
        type: 6,
        file_item: {
          file_name: input.fileName,
          len: String(input.size),
          media: {
            encrypt_query_param: input.encryptQueryParam,
            aes_key: input.aesKeyBase64
          }
        }
      }]
    });
    return { messageId: String(response.message_id ?? response.msgid ?? "") };
  }

  async sendImageMessage(input: {
    toUserId: string;
    encryptQueryParam: string;
    aesKeyBase64: string;
    size: number;
    contextToken?: string;
  }): Promise<{ messageId: string }> {
    const response = await this.post("ilink/bot/sendmessage", {
      to_user_id: input.toUserId,
      ...(input.contextToken ? { context_token: input.contextToken } : {}),
      item_list: [{
        type: 2,
        image_item: {
          media: {
            encrypt_query_param: input.encryptQueryParam,
            aes_key: input.aesKeyBase64
          },
          mid_size: input.size,
          hd_size: input.size
        }
      }]
    });
    return { messageId: String(response.message_id ?? response.msgid ?? "") };
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

