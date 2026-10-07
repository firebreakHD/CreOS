import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalStorageProvider, WebDavStorageProvider, validateNas } from "@/lib/storage";
import { readableMediaPath, safeRelativePath } from "@/lib/storage-paths";
import { initialState, initialIntegrations } from "../src/lib/model.ts";
import { configureIntegration, disconnectIntegration, integrationView, testIntegration } from "@/lib/integrations";
import { readSecret } from "@/lib/secrets";
import { readState, exportBackup } from "@/lib/store";

const stream = (value) => new Blob([value]).stream();
async function removeTemporary(directory) {
  if (path.dirname(directory) !== os.tmpdir()) throw new Error("Unexpected temporary directory");
  await rm(directory, { recursive: true, force: true });
}

test("local files stream, preserve readable names, support ranges and reject unsafe paths", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "creatoros-storage-"));
  try {
    const provider = new LocalStorageProvider(directory);
    const relative = readableMediaPath(initialState().projects[0], true, "Thumbnail v2.jpg", "image/jpeg", "a83fabcd-rest");
    assert.match(relative, /^Media\/Projects\/.+\/Tasks\/Images\/\d{4}-\d{2}-\d{2}_Thumbnail v2_a83fabcd\.jpg$/);
    await provider.storeFile(relative, stream("abcdef"), 6, "image/jpeg");
    assert.equal(await new Response((await provider.getFile(relative)).body).text(), "abcdef");
    const range = await provider.getFile(relative, "bytes=1-3");
    assert.equal(range.status, 206); assert.equal(range.contentRange, "bytes 1-3/6");
    assert.equal(await new Response(range.body).text(), "bcd");
    assert.equal(await new Response((await provider.getFile(relative, "bytes=-2")).body).text(), "ef");
    await assert.rejects(() => provider.getFile(relative, "bytes=9-10"), /nicht verfügbar/);
    await assert.rejects(() => provider.storeFile(relative, stream("other"), 5, "text/plain"), /existiert/);
    await assert.rejects(() => provider.storeFile("Media/short.txt", stream("abc"), 4, "text/plain"), /unvollständig/);
    await assert.rejects(() => provider.getFile("Media/short.txt"), /nicht verfügbar/);
    await Promise.all([provider.storeFile("Media/Parallel/one.txt", stream("1"), 1, "text/plain"), provider.storeFile("Media/Parallel/two.txt", stream("2"), 1, "text/plain")]);
    for (const unsafe of ["../escape.txt", "/absolute.txt", "C:/system.txt", "a/../../b", "a\\b", "a//b"]) {
      assert.throws(() => safeRelativePath(unsafe));
      await assert.rejects(() => provider.storeFile(unsafe, stream("x"), 1, "text/plain"));
    }
    await provider.moveFile(relative, "Media/Projects/Renamed/Images/Thumbnail-v3.jpg");
    assert.equal(await new Response((await provider.getFile("Media/Projects/Renamed/Images/Thumbnail-v3.jpg")).body).text(), "abcdef");
    await provider.deleteFile("Media/Projects/Renamed/Images/Thumbnail-v3.jpg");
    await assert.rejects(() => provider.getFile("Media/Projects/Renamed/Images/Thumbnail-v3.jpg"), /nicht verfügbar/);
  } finally { await removeTemporary(directory); }
});

test("WebDAV uses authenticated ordinary files, lazy folders, ranges and move/delete", async () => {
  const files = new Map(); const folders = new Set(["/CreatorOS"]); const requests = [];
  const server = createServer(async (request, response) => {
    try {
      const target = decodeURIComponent(new URL(request.url, "http://fixture").pathname);
      requests.push({ method: request.method, target });
      if (request.headers.authorization !== "Basic " + Buffer.from("creator:fixture-password").toString("base64")) { response.writeHead(401).end(); return; }
      if (request.method === "PROPFIND") { assert.equal(request.headers.depth, "0"); response.writeHead(folders.has(target) ? 207 : 404).end(); return; }
      if (request.method === "MKCOL") { const exists = folders.has(target); folders.add(target); response.writeHead(exists ? 405 : 201).end(); return; }
      if (request.method === "PUT") {
        assert.equal(request.headers["if-none-match"], "*");
        if (files.has(target)) { response.writeHead(412).end(); return; }
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        const body = Buffer.concat(chunks); assert.equal(body.length, Number(request.headers["content-length"]));
        files.set(target, body); response.writeHead(201).end(); return;
      }
      if (request.method === "MOVE") {
        const destination = decodeURIComponent(new URL(request.headers.destination).pathname);
        assert.equal(request.headers.overwrite, "F"); files.set(destination, files.get(target)); files.delete(target); response.writeHead(201).end(); return;
      }
      if (request.method === "DELETE") { files.delete(target); response.writeHead(204).end(); return; }
      const file = files.get(target);
      if (!file) { response.writeHead(404).end(); return; }
      if (request.headers.range) { assert.equal(request.headers.range, "bytes=1-3"); response.writeHead(206, { "Content-Length": 3, "Content-Range": "bytes 1-3/6" }).end(file.subarray(1,4)); }
      else response.writeHead(200, { "Content-Length": file.length }).end(file);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const config = { ...initialIntegrations().nas, host: "127.0.0.1", port: server.address().port, protocol: "webdav-http", username: "creator", baseFolder: "/CreatorOS" };
  const provider = new WebDavStorageProvider(config, "fixture-password");
  try {
    await provider.test();
    assert.equal(requests.length, 1, "Connection test creates no folders");
    const relative = "Media/Projects/CreatorOS Launch/Images/2026-10-07_thumbnail_a83f.jpg";
    await provider.storeFile(relative, stream("abcdef"), 6, "image/jpeg");
    assert.ok(files.has("/CreatorOS/" + relative));
    assert.ok(![...folders].some((folder) => /Audio|Documents|Video/.test(folder)));
    const range = await provider.getFile(relative, "bytes=1-3"); assert.equal(range.status, 206);
    assert.equal(await new Response(range.body).text(), "bcd");
    await assert.rejects(() => provider.storeFile(relative, stream("abcdef"), 6, "image/jpeg"), /existiert/);
    await provider.moveFile(relative, "Media/Projects/CreatorOS Launch/Images/thumbnail-v2.jpg");
    assert.equal(await new Response((await provider.getFile("Media/Projects/CreatorOS Launch/Images/thumbnail-v2.jpg")).body).text(), "abcdef");
    await provider.deleteFile("Media/Projects/CreatorOS Launch/Images/thumbnail-v2.jpg");
    await assert.rejects(() => provider.getFile(relative), /nicht verfügbar/);
    await assert.rejects(() => new WebDavStorageProvider(config, "wrong").test(), /Anmeldung/);
    await assert.rejects(() => new WebDavStorageProvider({ ...config, baseFolder: "/missing" }, "fixture-password").test(), /Basisordner/);
    await assert.rejects(() => provider.storeFile("../outside.txt", stream("x"), 1, "text/plain"));
    assert.throws(() => validateNas(config), /gültigen NAS-Host/);
    assert.throws(() => validateNas({ ...config, host: "nas.local", baseFolder: "/share/../outside" }));
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test("integration configuration validates before storing secrets and reconnects the same storage", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "creatoros-integrations-"));
  const previous = process.env.CREATOROS_DATA_DIR; process.env.CREATOROS_DATA_DIR = directory;
  const originalFetch = globalThis.fetch;
  try {
    const aiConfig = { model: "gpt-6-luna", apiKey: "fixture-key", mode: "suggest", permissions: [], requireConfirmation: [] };
    await assert.rejects(() => configureIntegration("ai", { ...aiConfig, permissions: ["invalid"] }), /Berechtigungen/);
    await assert.rejects(() => readFile(path.join(directory, "integrations.vault.json")), { code: "ENOENT" });
    const saved = await configureIntegration("ai", aiConfig);
    const publicView = await integrationView(saved);
    assert.equal(publicView.ai.credentialStored, true);
    assert.equal(publicView.ai.secretId, undefined);
    assert.ok(!JSON.stringify(publicView).includes("fixture-key"));
    assert.ok(!JSON.stringify(exportBackup(saved)).includes("fixture-key"));
    globalThis.fetch = async (url, options) => { assert.equal(url, "https://api.openai.com/v1/models/gpt-6-luna"); assert.equal(options.headers.Authorization, "Bearer fixture-key"); return new Response("{}", { status: 200 }); };
    assert.equal((await testIntegration("ai")).status, "connected");
    await disconnectIntegration("ai"); assert.equal(await readSecret(saved.integrations.ai.secretId), null);
    const nasConfig = { name: "Wohnzimmer", host: "nas.local", port: 5006, protocol: "webdav-https", username: "creator", baseFolder: "/CreatorOS", password: "fixture-nas-secret" };
    const first = await configureIntegration("nas", nasConfig);
    await assert.rejects(() => configureIntegration("nas", { ...nasConfig, host: "other.local", password: "" }), /erneut eingeben/);
    assert.equal((await readState()).integrations.nas.host, "nas.local");
    await disconnectIntegration("nas");
    const reconnected = await configureIntegration("nas", { ...nasConfig, password: "new-fixture-secret" });
    assert.equal(reconnected.integrations.nas.storageId, first.integrations.nas.storageId);
    const vault = await readFile(path.join(directory, "integrations.vault.json"), "utf8");
    assert.ok(!vault.includes("fixture-nas-secret")); assert.ok(!vault.includes("new-fixture-secret"));
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.CREATOROS_DATA_DIR; else process.env.CREATOROS_DATA_DIR = previous;
    await removeTemporary(directory);
  }
});
