import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticAssets = path.join(root, ".next", "static");
const publicAssets = path.join(root, "public");

await mkdir(path.join(standalone, ".next"), { recursive: true });
await cp(staticAssets, path.join(standalone, ".next", "static"), { recursive: true, force: true });
await cp(publicAssets, path.join(standalone, "public"), { recursive: true, force: true });
