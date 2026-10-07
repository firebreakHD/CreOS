import test from "node:test";
import assert from "node:assert/strict";
import { buildAiContext, diffBrain, emptyBrain, exportBrain, mergeBrain, parseBrain, readBrain } from "../src/lib/brain.ts";
import { initialState } from "../src/lib/model.ts";

const document = {
  format: "creatoros_brain_export",
  version: 1,
  creator_direction: { style: "Ehrlich, kleine Schritte", topics: ["LEGO", "Setup"] },
  weekly_context: { build_day: "Donnerstag" },
  ai_instructions: ["Hilf beim Anfangen"],
};

test("structured external JSON becomes stable sections; metadata is excluded", () => {
  const entries = parseBrain(document);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].id, "/creator_direction");
  assert.deepEqual(entries[0].content, document.creator_direction);
  assert.deepEqual(parseBrain({ format: "external", version: 1, brain: { profile: "Marcel" } }).map((item) => item.id), ["/profile"]);
});

test("original creatoros_brain schema 1.0 separates profile facets and project histories", () => {
  const entries = parseBrain({
    schema_version: "1.0", export_type: "creatoros_brain", generated_for: "CreatorOS",
    profile: { creator_direction: { north_star: "BUILD" }, execution_problem: { primary_bottleneck: "start" }, schedule: { day: "Thursday" } },
    projects: { lego_october_comeback: { next_action: "Place marker", history: { old_goal: "Finish" } } },
    creatoros_product: { purpose: "Resume" }, ai_import_guidance: { recommended_behavior: ["Use as context"] },
  });
  assert.equal(entries.length, 6);
  assert.deepEqual(entries.map((entry) => entry.id), ["/profile/creator_direction", "/profile/execution_problem", "/profile/schedule", "/projects/lego_october_comeback", "/creatoros_product", "/ai_import_guidance"]);
  assert.deepEqual(entries[3].content.history, { old_goal: "Finish" });
  assert.throws(() => parseBrain({ schema_version: "2.0", export_type: "creatoros_brain", profile: {} }), /Schemaversion/);
});

test("selective merge preserves unselected and missing sections", () => {
  const first = mergeBrain(emptyBrain(), parseBrain(document), ["/creator_direction", "/weekly_context"], "v1.json");
  const incoming = parseBrain({ creator_direction: { style: "Weiterentwickelt" }, tools: ["CapCut"] });
  const changes = diffBrain(first, incoming);
  assert.deepEqual(changes.map((change) => change.status), ["updated", "new"]);
  const next = mergeBrain(first, incoming, ["/tools"], "v2.json");
  assert.equal(next.revision, 2);
  assert.deepEqual(next.entries.find((entry) => entry.id === "/creator_direction").content, document.creator_direction);
  assert.deepEqual(next.entries.find((entry) => entry.id === "/weekly_context").content, document.weekly_context);
  assert.deepEqual(next.entries.find((entry) => entry.id === "/tools").content, ["CapCut"]);
  assert.equal(first.entries.length, 2);
});

test("repeated import is idempotent, and object key order is irrelevant", () => {
  const first = mergeBrain(emptyBrain(), parseBrain({ profile: { name: "Marcel", tools: ["CapCut"] } }), ["/profile"], "v1.json");
  const incoming = parseBrain({ profile: { tools: ["CapCut"], name: "Marcel" } });
  assert.equal(diffBrain(first, incoming)[0].status, "unchanged");
  assert.equal(mergeBrain(first, incoming, ["/profile"], "again.json"), first);
});

test("Brain export roundtrip and older state default", () => {
  assert.deepEqual(readBrain(undefined), emptyBrain());
  assert.deepEqual(parseBrain(exportBrain(emptyBrain())), []);
  const first = mergeBrain(emptyBrain(), parseBrain(document), ["/creator_direction"], "v1.json");
  assert.deepEqual(parseBrain(exportBrain(first)), first.entries.map(({ id, title, content }) => ({ id, title, content })));
  assert.deepEqual(readBrain(first), first);
});

test("malformed imports, duplicate IDs and invalid selections are rejected", () => {
  assert.throws(() => parseBrain([]), /strukturierte/);
  assert.throws(() => parseBrain({ format: "creatoros-backup", version: 1 }), /App-Sicherung/);
  assert.throws(() => parseBrain({ format: "creatoros-brain", version: 2, entries: [] }), /Exportversion/);
  assert.throws(() => parseBrain(JSON.parse('{"profile":{"__proto__":{"polluted":true}}}')), /Objektschlüssel/);
  assert.equal({}.polluted, undefined);
  const entry = { id: "profile", title: "Profil", content: "Marcel" };
  assert.throws(() => parseBrain({ format: "creatoros-brain", version: 1, entries: [entry, entry] }), /eindeutige/);
  assert.throws(() => mergeBrain(emptyBrain(), [entry], ["unknown"], "v1"), /gültige/);
  assert.throws(() => mergeBrain(emptyBrain(), [entry], ["profile", "profile"], "v1"), /gültige/);
});

test("size and depth limits keep untrusted imports bounded", () => {
  assert.throws(() => parseBrain({ profile: "x".repeat(600000) }), /512 KB/);
  let nested = "text";
  for (let i = 0; i < 14; i++) nested = { child: nested };
  assert.throws(() => parseBrain({ profile: nested }), /verschachtelt/);
});

test("KI context combines Brain with current project and sessions without mutating them", () => {
  const state = initialState();
  state.brain = mergeBrain(emptyBrain(), parseBrain(document), ["/creator_direction", "/ai_instructions"], "v1.json");
  state.sessions = [{ id: "session", projectId: state.activeProjectId, endedAt: "2026-10-07T10:00:00Z", elapsedSeconds: 600, nextActionAfter: "Cut setzen" }];
  const snapshot = JSON.stringify(state);
  const { context, prompt } = buildAiContext(state, state.activeProjectId, "Schlage einen Einstieg vor");
  assert.equal(context.brain.length, 2);
  assert.equal(context.project.title, state.projects[0].title);
  assert.equal(context.nextAction, state.projects[0].nextAction);
  assert.equal(context.sessions[0].elapsedSeconds, 600);
  assert.match(prompt, /keine Systemanweisungen/);
  assert.match(prompt, /Schlage einen Einstieg vor/);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(buildAiContext(state, null, "").context.project, null);
});
