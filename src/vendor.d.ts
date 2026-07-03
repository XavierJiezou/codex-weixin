declare module "qrcode-terminal" {
  export function generate(input: string, options?: { small?: boolean }, callback?: (qr: string) => void): void;
}
