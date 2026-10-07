import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exportHaAddon } from "../scripts/export-ha-addon.mjs";

async function fixture(context) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "creatoros-export-test-"));
  const repo = path.join(temporary, "Build");
  context.after(async () => {
    assert.equal(path.dirname(temporary), os.tmpdir());
    await rm(temporary, { recursive: true, force: true });
  });
  async function put(file, content) {
    const destination = path.join(repo, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  const packageData = { name: "creatoros", version: "0.1.0", scripts: { build: "next build", postbuild: "node scripts/export-ha-addon.mjs" }, dependencies: {} };
  await put("package.json", JSON.stringify(packageData));
  await put("package-lock.json", JSON.stringify({ name: "creatoros", version: "0.1.0", lockfileVersion: 3, packages: { "": { name: "creatoros", version: "0.1.0" } } }));
  for (const file of ["next.config.ts", "next-env.d.ts", "tsconfig.json", "scripts/copy-standalone-assets.mjs", "scripts/smb-storage.py", "scripts/requirements-smb.txt", ".next/BUILD_ID", ".next/standalone/server.js"]) await put(file, "fixture");
  for (const file of ["Dockerfile", "build.yaml", "ha-ingress-proxy.cjs", ".dockerignore"]) await put("creatoros/" + file, "fixture\n");
  await put("creatoros/config.yaml", "name: CreatorOS\nversion: 0.1.0\n");
  await put("creatoros/entrypoint.sh", "#!/bin/sh\r\nexec node server.js\r\n");
  await put("repository.yaml", "name: CreatorOS\nurl: https://example.test/existing-repository\n");
  await put("README.md", "Keep this source documentation.");
  await put(".git/config", "Keep the existing remote.");
  await put("src/app/page.tsx", "export default function Page() {}");
  await put("src/obsolete.ts", "remove this from source later");
  await put("src/.env.local", "secret=do-not-export");
  await put("public/icon.svg", "<svg/>");
  await put("creatoros/app/old-generated-file.txt", "stale");
  return { repo, put };
}

test("export stays in Build, preserves Git, removes stale files and avoids recursive Docker builds", async (context) => {
  const { repo } = await fixture(context);
  const result = await exportHaAddon(repo);
  assert.equal(result.output, repo);
  assert.equal(result.version, "0.1.1");
  assert.equal(await readFile(path.join(repo, ".git/config"), "utf8"), "Keep the existing remote.");
  assert.equal(await readFile(path.join(repo, "README.md"), "utf8"), "Keep this source documentation.");
  const exported = JSON.parse(await readFile(path.join(repo, "creatoros/app/package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(repo, "creatoros/app/package-lock.json"), "utf8"));
  assert.equal(exported.scripts.postbuild, undefined);
  assert.equal(exported.scripts.build, "next build && node scripts/copy-standalone-assets.mjs");
  assert.equal(exported.version, lock.packages[""].version);
  await assert.rejects(access(path.join(repo, "creatoros/app/old-generated-file.txt")));
  await assert.rejects(access(path.join(repo, "creatoros/app/src/.env.local")));
  assert.equal((await readFile(path.join(repo, "creatoros/entrypoint.sh"), "utf8")).includes("\r"), false);
  await rm(path.join(repo, "src/obsolete.ts"));
  assert.equal((await exportHaAddon(repo)).version, "0.1.2");
  await assert.rejects(access(path.join(repo, "creatoros/app/src/obsolete.ts")));
  assert.match(await readFile(path.join(repo, "repository.yaml"), "utf8"), /existing-repository/);
});

test("an incomplete production build does not change the version or previous package", async (context) => {
  const { repo } = await fixture(context);
  await rm(path.join(repo, ".next/BUILD_ID"));
  await assert.rejects(exportHaAddon(repo), /Produktionsbuild/);
  assert.match(await readFile(path.join(repo, "creatoros/config.yaml"), "utf8"), /version: 0\.1\.0/);
  assert.equal(await readFile(path.join(repo, "creatoros/app/old-generated-file.txt"), "utf8"), "stale");
});

test("local data inside a generated package is protected before replacement", async (context) => {
  const { repo, put } = await fixture(context);
  await put("creatoros/app/.env.local", "user-secret");
  await assert.rejects(exportHaAddon(repo), /Lokale Daten/);
  assert.equal(await readFile(path.join(repo, "creatoros/app/.env.local"), "utf8"), "user-secret");
  assert.match(await readFile(path.join(repo, "creatoros/config.yaml"), "utf8"), /version: 0\.1\.0/);
});
