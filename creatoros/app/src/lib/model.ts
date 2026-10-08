import type { BrainStore } from "./brain";
import { migrateNextTasks } from "./next-task.ts";
import { safeName } from "./storage-paths.ts";
import { createId } from "./id.ts";

export type ScriptSection = { id: string; title: string; body: string; done: boolean };
export type MaterialItem = { id: string; name: string; note: string; kind: "video" | "audio" | "image" | "note" };
export type Task = { id: string; projectId: string; title: string; description: string; status: "open" | "doing" | "done"; dueAt: string | null; createdAt: string; updatedAt: string };
export type PlanningEntry = { id: string; title: string; startsAt: string; projectId: string | null; createdAt: string };
export type MediaRole = "asset" | "reference" | "raw" | "export" | "other";
export type MediaLink = { entityType: "project" | "task"; entityId: string; role: MediaRole };
export type MediaRecord = { id: string; originalFilename: string; displayName: string; mimeType: string; fileSize: number; storageProvider: "local" | "nas"; storageId: string; relativePath: string; createdAt: string; links: MediaLink[] };
export type AiPermission = "task.create" | "task.update" | "task.complete" | "task.delete" | "content.create" | "content.update" | "content.schedule" | "content.delete" | "media.upload" | "media.attach" | "media.manage" | "media.delete" | "media.browse" | "media.folders" | "planning.write" | "planning.delete" | "idea.create" | "idea.manage" | "idea.convert" | "material.manage" | "session.manage";
export type IntegrationStatus = "not_configured" | "connected" | "error" | "incomplete";
export type AiConfig = { enabled: boolean; provider: "openai" | "codex"; model: string; secretId: string; mode: "suggest" | "confirm" | "auto"; permissions: AiPermission[]; requireConfirmation: AiPermission[]; status: IntegrationStatus; message: string };
export type NasConfig = { enabled: boolean; name: string; host: string; port: number; protocol: "smb" | "webdav-https" | "webdav-http"; share?: string; domain?: string; encrypt?: boolean; baseFolder: string; username: string; secretId: string; storageId: string; status: IntegrationStatus; message: string };
export type Integrations = { ai: AiConfig; nas: NasConfig };
export type AssistantLayout = { position: "bottom-right" | "bottom-left" | "top-right" | "top-left"; width: number; height: number };
export const initialAssistantLayout = (): AssistantLayout => ({ position: "bottom-right", width: 420, height: 600 });
export type StructuredAction = { name: string; args: Record<string, unknown> };
export type ActionProposal = { id: string; action: StructuredAction; createdAt: string; expiresAt: string; status: "pending" | "executing" | "applied" | "rejected"; baseFingerprint: string };
export type Project = {
  id: string;
  title: string;
  summary: string;
  status: "active" | "paused" | "complete";
  nextAction: string;
  nextTaskId?: string;
  storageFolder?: string;
  lastProgress: string;
  lastTouchedAt: string;
  createdAt: string;
  pipeline: "ideas" | "planned" | "recorded" | "editing" | "published";
  scripts: ScriptSection[];
  materials: MaterialItem[];
  caption?: string;
  hooks?: string[];
  platform?: "Instagram" | "TikTok" | "YouTube" | "Other";
  publishAt?: string | null;
};
export type Idea = { id: string; text: string; projectId: string | null; createdAt: string; pending?: boolean };
export type Session = {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  minimumMinutes: number;
  nextActionAfter: string;
  elapsedSeconds: number;
  runSegmentStartedAt: string | null;
  isPaused: boolean;
};
export type CreatorState = {
  schemaVersion: number;
  updatedAt: string;
  activeProjectId: string;
  buildDay: string;
  projects: Project[];
  ideas: Idea[];
  sessions: Session[];
  brain: BrainStore;
  tasks: Task[];
  planning: PlanningEntry[];
  media: MediaRecord[];
  integrations: Integrations;
  actionProposals: ActionProposal[];
  assistantLayout: AssistantLayout;
};

export const id = () => createId();
export const now = () => new Date().toISOString();

export const initialIntegrations = (): Integrations => ({
  ai: { enabled: false, provider: "openai", model: "gpt-6-luna", secretId: "", mode: "suggest", permissions: [], requireConfirmation: ["content.schedule", "media.upload"], status: "not_configured", message: "" },
  nas: { enabled: false, name: "", host: "", port: 445, protocol: "smb", share: "", domain: "", encrypt: false, baseFolder: "CreatorOS", username: "", secretId: "", storageId: "", status: "not_configured", message: "" },
});

export function initialState(): CreatorState {
  const timestamp = now();
  const state: CreatorState = {
    schemaVersion: 1,
    updatedAt: timestamp,
    activeProjectId: "lego-october-comeback",
    buildDay: "Donnerstag",
    projects: [{
      id: "lego-october-comeback",
      title: "LEGO – Oktober Comeback",
      storageFolder: safeName("LEGO – Oktober Comeback") + "_" + "lego-october-comeback".replace(/[^a-zA-Z0-9]/g, "").slice(-6),
      summary: "Die Challenge mit altem Material zu Ende erzählen.",
      status: "active",
      nextAction: "Im alten Material die Stelle „bis Ende des Jahres“ finden und dort einen Marker setzen.",
      lastProgress: "Hard Cut vorbereitet",
      lastTouchedAt: timestamp,
      createdAt: timestamp,
      pipeline: "editing",
      scripts: [
        { id: id(), title: "Hook · 00:00–00:15", body: "Anfang des Jahres hatte ich eine Idee, die ich unbedingt fertig machen wollte.", done: true },
        { id: id(), title: "Altes Material · 00:15–00:40", body: "Kurz erklären, was die Challenge war und bis wohin ich gekommen bin.", done: false },
        { id: id(), title: "Cut zu heute · 00:40–00:55", body: "Tja … wir haben Oktober. Jetzt machen wir weiter.", done: false },
      ],
      materials: [
        { id: id(), name: "lego_intro.mp4", note: "Altes Intro · Einstieg", kind: "video" },
        { id: id(), name: "sortieren_01.mp4", note: "Sortiermaterial · Fundstelle suchen", kind: "video" },
        { id: id(), name: "voiceover_hook.wav", note: "Hook · Rohaufnahme", kind: "audio" },
      ],
    }],
    ideas: [
      { id: id(), text: "Setup-Tour: die Ecke, in der ich wirklich filme", projectId: null, createdAt: timestamp },
      { id: id(), text: "Was aus alten Projekten noch zu retten ist", projectId: "lego-october-comeback", createdAt: timestamp },
    ],
    sessions: [],
    brain: { entries: [], revision: 0, updatedAt: null },
    tasks: [], planning: [], media: [], integrations: initialIntegrations(), actionProposals: [], assistantLayout: initialAssistantLayout(),
  };
  migrateNextTasks(state); return state;
}
