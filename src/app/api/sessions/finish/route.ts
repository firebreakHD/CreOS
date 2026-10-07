import { NextResponse } from "next/server";
import { emitHomeAssistantEvent } from "@/lib/home-assistant";
import { now } from "@/lib/model";
import { updateState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let nextAction = "";
  try { const body = await request.json(); if (typeof body.nextAction === "string") nextAction = body.nextAction.trim().slice(0, 500); } catch {}
  const endedAt = now();
  const { state, result } = await updateState((current) => {
    const session = current.sessions.find((item) => !item.endedAt);
    if (!session) return null;
    session.endedAt = endedAt;
    const elapsed = Math.max(1, Math.round((session.elapsedSeconds + (session.isPaused || !session.runSegmentStartedAt ? 0 : Math.max(0, (Date.parse(endedAt) - Date.parse(session.runSegmentStartedAt)) / 1000))) / 60));
    session.durationMinutes = elapsed;
    session.nextActionAfter = nextAction;
    const project = current.projects.find((item) => item.id === session.projectId);
    if (project) {
      project.lastTouchedAt = endedAt;
      if (nextAction) { project.nextAction = nextAction; project.lastProgress = "Session abgeschlossen"; }
    }
    return { session, project };
  });
  if (!result) return NextResponse.json({ error: "Es läuft gerade keine Session." }, { status: 409 });
  void emitHomeAssistantEvent("creatoros_session_finished", { project: result.project?.title || "", elapsed_minutes: result.session.durationMinutes, next_action: nextAction });
  return NextResponse.json({ state, ...result });
}
