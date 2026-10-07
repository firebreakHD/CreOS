import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initialState } from "../src/lib/model.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(repo, ".test-data");

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function launch(dataDir) {
  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(repo, ".next", "standalone", "server.js")], {
    cwd: repo, windowsHide: true,
    env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port), CREATOROS_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  const url = "http://127.0.0.1:" + port;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error("Testserver beendet: " + logs);
    try { if ((await fetch(url + "/api/state")).ok) return { child, url }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error("Testserver startet nicht: " + logs);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await exited;
}

test("production APIs: Brain, manual flows, integrations, media, backup and restart persistence", async () => {
  await mkdir(dataRoot, { recursive: true });
  const dataDir = await mkdtemp(path.join(dataRoot, "brain-api-"));
  let running;
  try {
    for (const privateFolder of ["data", ".test-data", ".git", "tests", "creatoros"]) await assert.rejects(() => access(path.join(repo, ".next", "standalone", privateFolder)), { code: "ENOENT" }, "Standalone excludes " + privateFolder);
    const oldState = initialState();
    delete oldState.brain;
    for (const project of oldState.projects) delete project.nextTaskId;
    for (const field of ["tasks","planning","media","integrations","actionProposals"]) delete oldState[field];
    await writeFile(path.join(dataDir, "creatoros.json"), JSON.stringify(oldState));
    running = await launch(dataDir);
    const request = async (endpoint, body, expectedStatus = 200, method = "POST") => {
      const response = await fetch(running.url + endpoint, body === undefined ? {} : {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const payload = await response.json();
      assert.equal(response.status, expectedStatus, JSON.stringify(payload));
      return payload;
    };

    const migrated = await request("/api/state");
    assert.equal(migrated.brain.entries.length, 0);
    assert.equal(migrated.tasks.length, 1); assert.equal(migrated.media.length, 0);
    assert.equal(migrated.projects[0].nextTaskId,migrated.tasks[0].id);
    assert.equal(migrated.integrations.ai.enabled, false);
    if (process.env.CREATOROS_BRAIN_SAMPLE) {
      const sample = JSON.parse((await readFile(process.env.CREATOROS_BRAIN_SAMPLE, "utf8")).replace(/^\uFEFF/, ""));
      const samplePreview = await request("/api/brain", { action: "preview", document: sample });
      assert.equal(samplePreview.changes.length, 9);
      assert.ok(samplePreview.changes.some((change) => change.incoming.id === "/profile/execution_problem"));
      const sampleImport = await request("/api/brain", { action: "import", document: sample, selectedIds: samplePreview.changes.map((change) => change.incoming.id), expectedRevision: samplePreview.revision, source: "creatoros_brain_export_v1.json" });
      assert.equal(sampleImport.state.brain.entries.length, 9);
      const sampleContext = await request("/api/ai/context", { projectId: oldState.activeProjectId });
      assert.equal(sampleContext.context.brain.length, 9);
      assert.ok(sampleContext.context.brain.some((entry) => entry.id === "/projects/lego_october_comeback"));
      await request("/api/backup", { format: "creatoros-backup", version: 1, state: oldState });
    }
    const before = await readFile(path.join(dataDir, "creatoros.json"), "utf8");
    const document = { profile: { direction: "Ehrliche Creator-Projekte" }, tools: ["CapCut"], ai_instructions: ["Kleine nächste Handlung"] };
    const preview = await request("/api/brain", { action: "preview", document });
    assert.deepEqual(preview.changes.map((change) => change.status), ["new", "new", "new"]);
    assert.equal(await readFile(path.join(dataDir, "creatoros.json"), "utf8"), before);
    const imported = await request("/api/brain", { action: "import", document, selectedIds: ["/profile", "/tools"], expectedRevision: preview.revision, source: "test-v1.json" });
    assert.equal(imported.state.brain.revision, 1);
    assert.equal(imported.state.brain.entries.length, 2);
    assert.deepEqual(imported.state.projects.map(({ nextTaskId, ...project }) => project), oldState.projects);
    assert.equal(imported.state.projects[0].nextTaskId, imported.state.tasks[0].id);
    await request("/api/brain", { action: "import", document, selectedIds: ["/ai_instructions"], expectedRevision: 0 }, 409);
    assert.equal((await request("/api/state")).brain.entries.length, 2);

    const again = await request("/api/brain", { action: "preview", document });
    assert.deepEqual(again.changes.map((change) => change.status), ["unchanged", "unchanged", "new"]);
    const same = await request("/api/brain", { action: "import", document, selectedIds: ["/profile", "/tools"], expectedRevision: again.revision });
    assert.equal(same.state.brain.revision, 1);
    const updateDocument = { profile: { direction: "Aktualisiert" }, weekly_context: { build_day: "Donnerstag" } };
    const updatePreview = await request("/api/brain", { action: "preview", document: updateDocument });
    const merged = await request("/api/brain", { action: "import", document: updateDocument, selectedIds: ["/profile", "/weekly_context"], expectedRevision: updatePreview.revision });
    assert.equal(merged.state.brain.entries.length, 3);
    assert.deepEqual(merged.state.brain.entries.find((entry) => entry.id === "/tools").content, ["CapCut"]);
    await request("/api/brain", { action: "preview", document: { format: "creatoros-brain", version: 99, entries: [] } }, 400);
    const exported = await request("/api/brain?download=1");
    assert.equal(exported.format, "creatoros-brain");
    assert.equal(exported.entries.length, 3);
    const roundtrip = await request("/api/brain", { action: "preview", document: exported });
    assert.ok(roundtrip.changes.every((change) => change.status === "unchanged"));
    const context = await request("/api/ai/context", { projectId: oldState.activeProjectId, question: "Hilf mir beim Einstieg" });
    assert.equal(context.context.brain.length, 3);
    assert.equal(context.context.nextAction, oldState.projects[0].nextAction);
    assert.match(context.prompt, /Aktualisiert/);
    const project = await request("/api/projects", { title: "Pipeline-Test", pipeline: "recorded" }, 201);
    assert.equal(project.project.pipeline, "recorded");
    assert.equal(project.state.brain.entries.length, 3);
    const projectId = project.project.id;
    const action = (name, args) => request("/api/actions", { action: { name, args } });
    const createdTask = await action("createTask", { projectId, title: "Thumbnail vorbereiten" });
    const taskId = createdTask.result.value.id;
    const updatedTask = await action("updateTask", { id: taskId, description: "Referenz prüfen", dueAt: "2026-10-10T15:00:00Z", status: "doing" });
    assert.equal(updatedTask.state.tasks.find((task) => task.id === taskId).status, "doing");
    assert.equal((await action("completeTask", { id: taskId })).state.tasks.find((task) => task.id === taskId).status, "done");
    await request("/api/actions", { actor: "ai", action: { name: "createTask", args: { projectId, title: "Bypass" } } }, 403);
    await action("updateContent", { id: projectId, caption: "CreatorOS Launch", hooks: ["So beginnt es"], scripts: [{ id: "intro", title: "Intro", body: "Erster Satz", done: false }] });
    assert.equal((await action("scheduleContent", { id: projectId, platform: "YouTube", publishAt: "2026-10-11T12:00:00Z" })).state.projects[0].platform, "YouTube");
    const plan = await action("createPlanning", { title: "Schnitt", startsAt: "2026-10-09T18:00:00Z", projectId });
    assert.equal((await action("updatePlanning", { id: plan.result.value.id, title: "Schnitt und Export" })).state.planning[0].title, "Schnitt und Export");
    const idea = await request("/api/ideas", { id: "offline-stable", text: "Nächster Clip", projectId }, 201);
    await request("/api/ideas", { id: "offline-stable", text: "Nächster Clip", projectId }, 201);
    assert.equal((await request("/api/state")).ideas.filter((item) => item.id === idea.idea.id).length, 1);
    const converted = await request("/api/ideas", { id: idea.idea.id, convert: true }, 200, "PATCH");
    assert.ok(converted.state.projects.some((item) => item.id === converted.result.convertedProjectId));
    const session = await request("/api/sessions/start", { projectId, durationMinutes: 10 });
    assert.equal(session.session.projectId, projectId);
    assert.equal((await request("/api/sessions/pause", { paused: true })).session.isPaused, true);
    assert.equal((await request("/api/sessions/pause", { paused: false })).session.isPaused, false);
    assert.equal((await request("/api/sessions/extend", { minutes: 5 })).session.durationMinutes, 15);
    assert.equal((await request("/api/sessions/finish", { nextAction: "Export prüfen" })).project.nextAction, "Export prüfen");
    await request("/api/settings", { buildDay: "Freitag" }, 200, "PATCH");

    const upload = async (filename, body, expected = 201) => {
      const response = await fetch(running.url + "/api/media?" + new URLSearchParams({ entityType: "task", entityId: taskId, role: "reference" }), { method: "POST", headers: { "x-file-name": encodeURIComponent(filename), "x-file-size": String(Buffer.byteLength(body)) }, body });
      const result = await response.json(); assert.equal(response.status, expected, JSON.stringify(result)); return result;
    };
    const uploaded = await upload("Referenz v2.txt", "abcdef");
    const media = uploaded.media;
    assert.equal(media.storageProvider, "local"); assert.equal(media.links[0].entityId, taskId);
    assert.match(media.relativePath, /Pipeline-Test.+\/Aufgaben\/Referenzen\/Documents\/.*Referenz v2/);
    const file = await fetch(running.url + "/api/media/" + media.id + "/file", { headers: { Range: "bytes=1-3" } });
    assert.equal(file.status, 206); assert.equal(file.headers.get("content-range"), "bytes 1-3/6"); assert.equal(await file.text(), "bcd");
    await upload("../outside.txt", "abc", 400);
    await upload("script.html", "abc", 415);
    await action("attachMedia", { mediaId: media.id, entityType: "project", entityId: projectId, role: "asset" });
    await action("detachMedia", { mediaId: media.id, entityType: "task", entityId: taskId });
    assert.equal((await request("/api/media"))[0].links.length, 1);
    assert.equal(await (await fetch(running.url + "/api/media/" + media.id + "/file")).text(), "abcdef");
    const integrationView = await request("/api/integrations"); assert.equal(integrationView.ai.credentialStored, false);
    const aiConfig = { model: "gpt-6-luna", mode: "suggest", permissions: [], requireConfirmation: ["content.schedule"] };
    await request("/api/integrations", { kind: "ai", operation: "save", config: aiConfig });
    await request("/api/ai/chat", { question: "Hallo", projectId }, 409);
    assert.equal((await request("/api/integrations", { kind: "ai", operation: "test" })).status, "incomplete");
    await request("/api/integrations", { kind: "ai", operation: "save", config: { ...aiConfig, apiKey: "fixture-api-secret" } });
    assert.ok(!JSON.stringify(await request("/api/integrations")).includes("fixture-api-secret"));
    assert.ok(!(await readFile(path.join(dataDir, "integrations.vault.json"), "utf8")).includes("fixture-api-secret"));
    for (const endpoint of ["/api/actions","/api/integrations","/api/media","/api/backup","/api/projects","/api/brain","/api/ideas","/api/sessions/start"]) {
      const response = await fetch(running.url + endpoint, { method: "POST", headers: { Origin: "https://other.example", "Content-Type": "application/json" }, body: "{}" });
      assert.equal(response.status, 403, endpoint);
    }
    const enrichedContext = await request("/api/ai/context", { projectId });
    assert.match(enrichedContext.prompt, /Referenz v2.txt/); assert.match(enrichedContext.prompt, /Export prüfen/);
    const backup = await request("/api/backup");
    assert.equal(backup.state.brain.entries.length, 3);
    assert.equal(backup.state.media.length, 1); assert.equal(backup.state.tasks.length, 3);
    assert.ok(!JSON.stringify(backup).includes("fixture-api-secret"));
    await request("/api/backup", { format: "creatoros-backup", version: 1, state: oldState });
    assert.equal((await request("/api/state")).brain.entries.length, 0);
    await request("/api/backup", backup);
    assert.equal((await request("/manifest.webmanifest")).short_name, "CreatorOS");
    assert.equal((await fetch(running.url + "/service-worker.js")).status, 200);
    const html = await (await fetch(running.url)).text();
    const css = html.match(/href="([^"]+\.css)"/)?.[1];
    assert.ok(css, "Production HTML exposes stylesheet");
    assert.equal((await fetch(new URL(css, running.url))).status, 200);
    await stop(running.child);
    running = await launch(dataDir);
    const persisted = await request("/api/state");
    assert.equal(persisted.brain.entries.length, 3);
    assert.ok(persisted.projects.some((item) => item.title === "Pipeline-Test"));
    assert.equal(persisted.tasks.find((task) => task.id === taskId).status, "done"); assert.equal(persisted.media[0].id, media.id);
    assert.equal(persisted.planning[0].title, "Schnitt und Export"); assert.equal(persisted.buildDay, "Freitag");
    assert.equal((await request("/api/integrations")).ai.credentialStored, true);
    assert.equal(await (await fetch(running.url + "/api/media/" + media.id + "/file")).text(), "abcdef");
    await request("/api/integrations", { kind: "ai", operation: "disconnect" });
    assert.equal((await request("/api/integrations")).ai.credentialStored, false);
  } finally {
    if (running) await stop(running.child);
    if (path.dirname(dataDir) !== dataRoot) throw new Error("Unexpected test directory");
    await rm(dataDir, { recursive: true, force: true });
  }
});
