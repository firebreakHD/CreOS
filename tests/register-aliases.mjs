import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(source, specifier.slice(2) + ".ts")).href, context);
  return nextResolve(specifier, context);
} });
