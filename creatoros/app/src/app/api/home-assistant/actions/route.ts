import { NextResponse } from "next/server";
import { id, now } from "@/lib/model";
import { emitHomeAssistantEvent } from "@/lib/home-assistant";
import { updateState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.HOME_ASSISTANT_SHARED_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Ungültige JSON-Daten." }, { status: 400 }); }
  const input = body as { action?: unknown; text?: unknown; minutes?: unknown };
  if (input?.action === "quick-note") {
    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (!text || text.length > 2000) return NextResponse.json({ error: "Notiz fehlt oder ist zu lang." }, { status: 400 });
    const { state, result } = await updateState((current) => {
      const idea = { id: id(), text, projectId: null, createdAt: now() };
      current.ideas.unshift(idea);
      return idea;
    });
    void emitHomeAssistantEvent("creatoros_idea_captured", { text });
    return NextResponse.json({ ok: true, state, idea: result }, { status: 201 });
  }
  if (input?.action === "start") {
    const { state, result } = await updateState((current) => {
      const active = current.sessions.find((session) => !session.endedAt);
      if (active) return active;
      const project = current.projects.find((item) => item.id === current.activeProjectId && item.status === "active");
      if (!project) return null;
      const startedAt = now();
      const session = { id: id(), projectId: project.id, startedAt, endedAt: null, durationMinutes: 10, minimumMinutes: 10, nextActionAfter: "", elapsedSeconds: 0, runSegmentStartedAt: startedAt, isPaused: false };
      current.sessions.unshift(session);
      project.lastTouchedAt = now();
      return session;
    });
    if (!result) return NextResponse.json({ error: "Kein aktives Projekt ausgewählt." }, { status: 409 });
    return NextResponse.json({ ok: true, state, session: result });
  }
  if (input?.action === "finish") {
    const endedAt = now();
    const { state, result } = await updateState((current) => {
      const session = current.sessions.find((item) => !item.endedAt);
      if (!session) return null;
      session.endedAt = endedAt;
      session.durationMinutes = Math.max(1, Math.round((session.elapsedSeconds + (session.isPaused || !session.runSegmentStartedAt ? 0 : Math.max(0, (Date.parse(endedAt) - Date.parse(session.runSegmentStartedAt)) / 1000))) / 60));
      const project = current.projects.find((item) => item.id === session.projectId);
      if (project) project.lastTouchedAt = endedAt;
      return session;
    });
    if (!result) return NextResponse.json({ error: "Es läuft keine Session." }, { status: 409 });
    return NextResponse.json({ ok: true, state, session: result });
  }
  if (input?.action === "extend") {
    const minutes = Number.isFinite(input.minutes) ? Math.max(1, Math.min(60, Math.round(Number(input.minutes)))) : 25;
    const { state, result } = await updateState((current) => {
      const session = current.sessions.find((item) => !item.endedAt);
      if (!session) return null;
      session.durationMinutes += minutes;
      return session;
    });
    if (!result) return NextResponse.json({ error: "Es läuft keine Session." }, { status: 409 });
    return NextResponse.json({ ok: true, state, session: result });
  }
  if (input?.action === "pause" || input?.action === "resume") {
    const paused = input.action === "pause";
    const { state, result } = await updateState((current) => {
      const session = current.sessions.find((item) => !item.endedAt);
      if (!session) return null;
      if (paused && !session.isPaused) {
        session.elapsedSeconds += session.runSegmentStartedAt ? Math.max(0, (Date.now() - Date.parse(session.runSegmentStartedAt)) / 1000) : 0;
        session.runSegmentStartedAt = null;
        session.isPaused = true;
      } else if (!paused && session.isPaused) {
        session.runSegmentStartedAt = now();
        session.isPaused = false;
      }
      return session;
    });
    if (!result) return NextResponse.json({ error: "Es läuft keine Session." }, { status: 409 });
    return NextResponse.json({ ok: true, state, session: result });
  }
  if (input?.action === "build-mode") {
    void emitHomeAssistantEvent("creatoros_build_mode_opened", { at: now() });
    return NextResponse.json({ ok: true, focus_url: "/?mode=focus" });
  }
  return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
}
