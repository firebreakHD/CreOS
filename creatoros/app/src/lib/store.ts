import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { initialAssistantLayout, initialIntegrations, initialState, now, type CreatorState } from "@/lib/model";
import { readBrain } from "@/lib/brain";
import { migrateNextTasks } from "@/lib/next-task";
import { safeName } from "@/lib/storage-paths";

const storeFile = () => path.join(process.env.CREATOROS_DATA_DIR || path.join(process.cwd(), "data"), "creatoros.json");
export const dataDirectory = () => path.dirname(storeFile());
let writeQueue: Promise<unknown> = Promise.resolve();

function migrate(value: unknown): CreatorState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CreatorOS-Datensatz ist ungültig.");
  const state = value as Partial<CreatorState>;
  if (state.schemaVersion !== 1 || !Array.isArray(state.projects) || !Array.isArray(state.ideas) || !Array.isArray(state.sessions)) {
    throw new Error("Unbekannte CreatorOS-Datenversion. Die Quelldatei bleibt erhalten.");
  }
  const migrated = {
    ...state,
    schemaVersion: 1,
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : now(),
    activeProjectId: typeof state.activeProjectId === "string" ? state.activeProjectId : "",
    buildDay: typeof state.buildDay === "string" ? state.buildDay : "Donnerstag",
    brain: readBrain(state.brain),
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
    planning: Array.isArray(state.planning) ? state.planning : [],
    media: Array.isArray(state.media) ? state.media : [],
    integrations: { ai: { ...initialIntegrations().ai, ...state.integrations?.ai }, nas: { ...initialIntegrations().nas, ...state.integrations?.nas } },
    actionProposals: Array.isArray(state.actionProposals) ? state.actionProposals : [],
    assistantLayout: validateAssistantLayout(state.assistantLayout),
  } as CreatorState;
  for (const project of migrated.projects) {
    if (typeof project.storageFolder !== "string" || !project.storageFolder || /[\\/]/.test(project.storageFolder) || project.storageFolder === "." || project.storageFolder === "..") {
      project.storageFolder = safeName(project.title) + "_" + project.id.replace(/[^a-zA-Z0-9]/g, "").slice(-6);
    }
  }
  migrateNextTasks(migrated); return migrated;
}

export function validateAssistantLayout(value: unknown) {
  const initial = initialAssistantLayout();
  const input = value as Partial<typeof initial> | undefined;
  return { position: input && ["bottom-right","bottom-left","top-right","top-left"].includes(String(input.position)) ? input.position! : initial.position,
    width: input && Number.isInteger(input.width) && input.width! >= 320 && input.width! <= 800 ? input.width! : initial.width,
    height: input && Number.isInteger(input.height) && input.height! >= 360 && input.height! <= 900 ? input.height! : initial.height };
}

async function writeAtomic(state: CreatorState): Promise<void> {
  const file = storeFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: "utf8", flag: "wx" });
  await rename(temporary, file);
}

export async function readState(): Promise<CreatorState> {
  try {
    return migrate(JSON.parse(await readFile(storeFile(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const state = initialState();
    await writeAtomic(state);
    return state;
  }
}

export async function updateState<T>(update: (current: CreatorState) => T | Promise<T>): Promise<{ state: CreatorState; result: T }> {
  const work = writeQueue.then(async () => {
    const current = await readState();
    const result = await update(current);
    current.updatedAt = now();
    await writeAtomic(current);
    return { state: current, result };
  });
  writeQueue = work.then(() => undefined, () => undefined);
  return work;
}

export async function replaceState(next: unknown): Promise<CreatorState> {
  const valid = migrate(next);
  const work = writeQueue.then(async () => {
    valid.updatedAt = now();
    await writeAtomic(valid);
    return valid;
  });
  writeQueue = work.then(() => undefined, () => undefined);
  return work;
}

export function exportBackup(state: CreatorState) {
  return { format: "creatoros-backup", version: 1, exportedAt: now(), state };
}

export function validBackup(value: unknown): value is { format: string; version: number; state: CreatorState } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const backup = value as { format?: unknown; version?: unknown; state?: unknown };
  if (backup.format !== "creatoros-backup" || backup.version !== 1) return false;
  try {
    migrate(backup.state);
    return true;
  } catch {
    return false;
  }
}
