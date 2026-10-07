import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";
import { now } from "@/lib/model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let paused = true;
  try { paused = (await request.json()).paused !== false; } catch {}
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
  if (!result) return NextResponse.json({ error: "Es läuft gerade keine Session." }, { status: 409 });
  return NextResponse.json({ state, session: result });
}
