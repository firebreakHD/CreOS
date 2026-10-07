import { cp, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const scriptRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const addonFiles = ["config.yaml", "build.yaml", "Dockerfile", "entrypoint.sh", "ha-ingress-proxy.cjs", ".dockerignore"];
const appFiles = ["package.json", "package-lock.json", "next.config.ts", "next-env.d.ts", "tsconfig.json"];

async function exists(file) {
  try { await lstat(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

function assertChild(target, parent) {
  const relative = path.relative(parent, target);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Ungültiger generierter Zielpfad: " + target);
  }
}

async function assertPlainDirectory(directory) {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Kein regulärer Ausgabeordner: " + directory);
  const actual = await realpath(directory);
  const expected = path.resolve(directory);
  if (path.relative(actual, expected) !== "") throw new Error("Verknüpfte Ausgabeordner werden nicht ersetzt: " + directory);
}

async function replaceGeneratedDirectory(staging, destination, parent) {
  assertChild(staging, parent);
  assertChild(destination, parent);
  await assertPlainDirectory(parent);
  const backup = destination + ".previous-" + randomUUID();
  assertChild(backup, parent);
  const hadPrevious = await exists(destination);
  if (hadPrevious) {
    await assertPlainDirectory(destination);
    for (const base of [destination, path.join(destination, "app")]) {
      for (const name of [".git", "data", ".data", ".test-data", ".env", ".env.local"]) {
        if (await exists(path.join(base, name))) throw new Error("Lokale Daten im generierten Add-on-Ordner gefunden: " + path.join(base, name));
      }
    }
    await rename(destination, backup);
  }
  try {
    await rename(staging, destination);
  } catch (error) {
    if (hadPrevious) await rename(backup, destination);
    throw error;
  }
  if (hadPrevious) await rm(backup, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
}

function versionOf(config, filename) {
  const match = config.match(/^version:\s*["']?(\d+)\.(\d+)\.(\d+)["']?\s*$/m);
  if (!match) throw new Error("Keine gültige Add-on-Version in " + filename);
  return match.slice(1).map(Number);
}

async function copySource(source, destination) {
  await cp(source, destination, {
    recursive: true,
    filter: async (file) => {
      const name = path.basename(file);
      if ([".git", "node_modules", ".next", ".data", ".test-data"].includes(name) || name.startsWith(".env") || name.endsWith(".log")) return false;
      if ((await lstat(file)).isSymbolicLink()) throw new Error("Quellcode-Verknüpfung wird nicht exportiert: " + file);
      return true;
    },
  });
}

export async function exportHaAddon(repoRoot = scriptRepo) {
  const repo = await realpath(path.resolve(repoRoot));
  const template = path.join(repo, "creatoros");
  await assertPlainDirectory(template);

  for (const file of [...appFiles, "repository.yaml", "scripts/copy-standalone-assets.mjs", "scripts/smb-storage.py", "scripts/requirements-smb.txt", ".next/BUILD_ID", ".next/standalone/server.js"]) {
    if (!await exists(path.join(repo, file))) throw new Error("Pflichtdatei fehlt; zuerst einen erfolgreichen Produktionsbuild ausführen: " + file);
  }
  for (const file of addonFiles) {
    if (!await exists(path.join(template, file))) throw new Error("Add-on-Pflichtdatei fehlt: " + file);
  }
  const configFile = path.join(template, "config.yaml");
  const config = await readFile(configFile, "utf8");
  const current = versionOf(config, configFile);
  const version = [current[0], current[1], current[2] + 1].join(".");
  const nextConfig = config.replace(/^version:.*$/m, "version: " + version).replace(/\r\n/g, "\n");
  const appPackage = JSON.parse(await readFile(path.join(repo, "package.json"), "utf8"));
  const appLock = JSON.parse(await readFile(path.join(repo, "package-lock.json"), "utf8"));
  appPackage.version = version;
  appPackage.scripts = {
    build: "next build && node scripts/copy-standalone-assets.mjs",
    start: "node .next/standalone/server.js",
  };
  appLock.version = version;
  if (appLock.packages?.[""]) appLock.packages[""].version = version;

  const appStaging = path.join(template, ".app-staging-" + randomUUID());
  assertChild(appStaging, template);
  try {
    await mkdir(path.join(appStaging, "scripts"), { recursive: true });
    for (const file of appFiles.filter((name) => !["package.json", "package-lock.json"].includes(name))) {
      await cp(path.join(repo, file), path.join(appStaging, file));
    }
    await writeFile(path.join(appStaging, "package.json"), JSON.stringify(appPackage, null, 2) + "\n");
    await writeFile(path.join(appStaging, "package-lock.json"), JSON.stringify(appLock, null, 2) + "\n");
    await cp(path.join(repo, "scripts", "copy-standalone-assets.mjs"), path.join(appStaging, "scripts", "copy-standalone-assets.mjs"));
    for (const file of ["smb-storage.py","requirements-smb.txt"]) await cp(path.join(repo, "scripts", file), path.join(appStaging, "scripts", file));
    for (const folder of ["src", "public"]) await copySource(path.join(repo, folder), path.join(appStaging, folder));

    await replaceGeneratedDirectory(appStaging, path.join(template, "app"), template);
    await writeFile(configFile, nextConfig);
    const entrypoint = path.join(template, "entrypoint.sh");
    await writeFile(entrypoint, (await readFile(entrypoint, "utf8")).replace(/\r\n/g, "\n"));
    const attributesFile = path.join(repo, ".gitattributes");
    if (!await exists(attributesFile)) await writeFile(attributesFile, "* text=auto\n*.sh text eol=lf\n");
    return { version, output: repo };
  } finally {
    assertChild(appStaging, template);
    await rm(appStaging, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await exportHaAddon();
    console.log("CreatorOS Add-on " + result.version + " exportiert: " + result.output);
    console.log("GitHub Desktop: Build committen/pushen; Home Assistant baut das Container-Image.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
