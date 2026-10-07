import { NextResponse } from "next/server";
import { emitHomeAssistantEvent } from "@/lib/home-assistant";
import { updateState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let minutes = 25;
  try { const body = await request.json(); if (Number.isFinite(body.minutes)) minutes = Math.max(1, Math.min(60, Math.round(body.minutes))); } catch {}
  const { state, result } = await updateState((current) => {
    const session = current.sessions.find((item) => !item.endedAt);
    if (!session) return null;
    session.durationMinutes += minutes;
    return session;
  });
  if (!result) return NextResponse.json({ error: "Es läuft gerade keine Session." }, { status: 409 });
  void emitHomeAssistantEvent("creatoros_session_extended", { minutes, project_id: result.projectId });
  return NextResponse.json({ state, session: result });
}
