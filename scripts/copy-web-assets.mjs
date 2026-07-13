import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "src", "web");
const target = path.join(root, "dist", "web");

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
fs.mkdirSync(path.join(target, "vendor"), { recursive: true });
fs.copyFileSync(
  path.join(root, "node_modules", "lucide", "dist", "umd", "lucide.min.js"),
  path.join(target, "vendor", "lucide.min.js")
);
fs.copyFileSync(
  path.join(root, "node_modules", "marked", "lib", "marked.umd.js"),
  path.join(target, "vendor", "marked.umd.js")
);
fs.copyFileSync(
  path.join(root, "node_modules", "dompurify", "dist", "purify.min.js"),
  path.join(target, "vendor", "purify.min.js")
);
