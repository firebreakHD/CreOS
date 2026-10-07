import { NextResponse } from "next/server";
import { id, now, type Idea } from "@/lib/model";
import { updateState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Ungültige JSON-Daten." }, { status: 400 }); }
  const input = body as { id?: unknown; text?: unknown; projectId?: unknown };
  const text = typeof input?.text === "string" ? input.text.trim() : "";
  if (!text || text.length > 2000) return NextResponse.json({ error: "Eine Idee muss 1 bis 2.000 Zeichen lang sein." }, { status: 400 });
  const idea: Idea = { id: typeof input.id === "string" ? input.id : id(), text, projectId: typeof input.projectId === "string" ? input.projectId : null, createdAt: now() };
  const { state, result } = await updateState((current) => { const existing = current.ideas.find((item) => item.id === idea.id); if (existing) return existing; current.ideas.unshift(idea); return idea; });
  return NextResponse.json({ state, idea: result }, { status: 201 });
}

export async function PATCH(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Ungültige JSON-Daten." }, { status: 400 }); }
  const input = body as { id?: unknown; projectId?: unknown; convert?: unknown };
  const { state, result } = await updateState((current) => {
    const index = current.ideas.findIndex((idea) => idea.id === input?.id);
    if (index < 0) return null;
    if (input.convert === true) {
      const idea = current.ideas[index];
      const timestamp = now();
      const projectId = id();
      current.projects.unshift({ id: projectId, title: idea.text.slice(0, 80), summary: idea.text, status: "active", nextAction: "Einen ersten kleinen Schritt für diese Idee festlegen.", lastProgress: "Aus einer Idee gestartet", lastTouchedAt: timestamp, createdAt: timestamp, pipeline: "ideas", scripts: [], materials: [] });
      current.activeProjectId = projectId;
      current.ideas.splice(index, 1);
      return { convertedProjectId: projectId };
    }
    if (input.projectId === null || typeof input.projectId === "string") current.ideas[index].projectId = input.projectId;
    return { updated: true };
  });
  if (!result) return NextResponse.json({ error: "Idee nicht gefunden." }, { status: 404 });
  return NextResponse.json({ state, result });
}
