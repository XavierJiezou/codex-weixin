import crypto from "node:crypto";

export type AccessDecision =
  | { allowed: true; message: string }
  | { allowed: false; code: string; message: string };

export type AccessControllerOptions = {
  allowedSenderIds?: string[];
  pairedSenderIds?: string[];
  codeFactory?: () => string;
};

export class AccessController {
  private readonly configuredAllowlist: Set<string>;
  private readonly pairedSenderIds: Set<string>;
  private readonly pendingCodes = new Map<string, string>();
  private readonly codeFactory: () => string;

  constructor(options: AccessControllerOptions = {}) {
    this.configuredAllowlist = new Set(options.allowedSenderIds ?? []);
    this.pairedSenderIds = new Set(options.pairedSenderIds ?? []);
    this.codeFactory = options.codeFactory ?? (() => crypto.randomInt(100000, 999999).toString());
  }

  isAllowed(senderId: string): boolean {
    return this.configuredAllowlist.has(senderId) || this.pairedSenderIds.has(senderId);
  }

  requireAccess(senderId: string): AccessDecision {
    if (this.isAllowed(senderId)) {
      return { allowed: true, message: "sender is allowed" };
    }

    const existing = [...this.pendingCodes.entries()].find(([, pendingSender]) => pendingSender === senderId)?.[0];
    const code = existing ?? this.codeFactory();
    this.pendingCodes.set(code, senderId);
    return {
      allowed: false,
      code,
      message: `Access denied. Pairing code: ${code}. Run: codex-weixin access pair ${code}`
    };
  }

  pair(code: string): string {
    const senderId = this.pendingCodes.get(code);
    if (!senderId) {
      throw new Error(`unknown or expired pairing code: ${code}`);
    }
    this.pendingCodes.delete(code);
    this.pairedSenderIds.add(senderId);
    return senderId;
  }

  allow(senderId: string): void {
    this.pairedSenderIds.add(senderId);
  }

  remove(senderId: string): void {
    this.pairedSenderIds.delete(senderId);
    this.configuredAllowlist.delete(senderId);
  }

  listPairedSenderIds(): string[] {
    return [...this.pairedSenderIds].sort();
  }
}

