import { NextResponse } from "next/server";
import { id, now } from "@/lib/model";
import { emitHomeAssistantEvent } from "@/lib/home-assistant";
import { updateState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let projectId: string | undefined;
  let durationMinutes = 10;
  try { const body = await request.json(); if (typeof body.projectId === "string") projectId = body.projectId; if (Number.isFinite(body.durationMinutes)) durationMinutes = Math.max(1, Math.min(240, Math.round(body.durationMinutes))); } catch {}
  const { state, result } = await updateState((current) => {
    const active = current.sessions.find((session) => !session.endedAt);
    if (active) return active;
    const selectedId = projectId || current.activeProjectId;
    const project = current.projects.find((item) => item.id === selectedId);
    if (!project) return null;
    current.activeProjectId = project.id;
    project.lastTouchedAt = now();
    const startedAt = now();
    const session = { id: id(), projectId: project.id, startedAt, endedAt: null, durationMinutes, minimumMinutes: 10, nextActionAfter: "", elapsedSeconds: 0, runSegmentStartedAt: startedAt, isPaused: false };
    current.sessions.unshift(session);
    return session;
  });
  if (!result) return NextResponse.json({ error: "Wähle zuerst ein aktives Projekt." }, { status: 400 });
  const project = state.projects.find((item) => item.id === result.projectId)!;
  void emitHomeAssistantEvent("creatoros_session_started", { project_id: project.id, project: project.title, next_action: project.nextAction, minimum_minutes: result.minimumMinutes });
  return NextResponse.json({ state, session: result });
}
