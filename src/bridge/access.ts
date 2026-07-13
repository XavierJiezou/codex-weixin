export type AccessDecision =
  | { allowed: true; message: string }
  | { allowed: false; message: string };

export type AccessControllerOptions = {
  allowedSenderIds?: string[];
  pairedSenderIds?: string[];
};

export class AccessController {
  private readonly configuredAllowlist: Set<string>;
  private readonly pairedSenderIds: Set<string>;

  constructor(options: AccessControllerOptions = {}) {
    this.configuredAllowlist = new Set(options.allowedSenderIds ?? []);
    this.pairedSenderIds = new Set(options.pairedSenderIds ?? []);
  }

  isAllowed(senderId: string): boolean {
    return this.configuredAllowlist.has(senderId) || this.pairedSenderIds.has(senderId);
  }

  requireAccess(senderId: string): AccessDecision {
    if (this.isAllowed(senderId)) {
      return { allowed: true, message: "sender is allowed" };
    }

    return {
      allowed: false,
      message: `Access denied. Open the codex-weixin management page and allow sender: ${senderId}`
    };
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
