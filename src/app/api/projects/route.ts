import { NextResponse } from "next/server";
import { id, now, type Project } from "@/lib/model";
import { readState, updateState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json((await readState()).projects); }
  catch { return NextResponse.json({ error: "Projekte konnten nicht gelesen werden." }, { status: 500 }); }
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Ungültige JSON-Daten." }, { status: 400 }); }
  const input = body as { title?: unknown; summary?: unknown };
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 100) return NextResponse.json({ error: "Der Projektname muss 1 bis 100 Zeichen lang sein." }, { status: 400 });
  const timestamp = now();
  const project: Project = { id: id(), title, summary: typeof input.summary === "string" ? input.summary.slice(0, 500) : "", status: "active", nextAction: "Ersten kleinen nächsten Schritt festlegen.", lastProgress: "Projekt angelegt", lastTouchedAt: timestamp, createdAt: timestamp, pipeline: "ideas", scripts: [], materials: [] };
  const { state } = await updateState((current) => { current.projects.unshift(project); current.activeProjectId = project.id; });
  return NextResponse.json({ state, project }, { status: 201 });
}

export async function PATCH(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Ungültige JSON-Daten." }, { status: 400 }); }
  const input = body as { id?: unknown; nextAction?: unknown; title?: unknown; active?: unknown; lastProgress?: unknown; pipeline?: unknown; status?: unknown; scripts?: unknown; materials?: unknown };
  if (typeof input?.id !== "string") return NextResponse.json({ error: "Projekt fehlt." }, { status: 400 });
  const { state, result } = await updateState((current) => {
    const project = current.projects.find((item) => item.id === input.id);
    if (!project) return null;
    if (typeof input.nextAction === "string") project.nextAction = input.nextAction.trim().slice(0, 500);
    if (typeof input.title === "string" && input.title.trim()) project.title = input.title.trim().slice(0, 100);
    if (typeof input.lastProgress === "string") project.lastProgress = input.lastProgress.trim().slice(0, 300);
    if (typeof input.pipeline === "string" && ["ideas", "planned", "recorded", "editing", "published"].includes(input.pipeline)) project.pipeline = input.pipeline as Project["pipeline"];
    if (typeof input.status === "string" && ["active", "paused", "complete"].includes(input.status)) project.status = input.status as Project["status"];
    if (Array.isArray(input.scripts)) project.scripts = input.scripts.filter((item): item is Project["scripts"][number] => Boolean(item && typeof item === "object" && typeof (item as Project["scripts"][number]).id === "string" && typeof (item as Project["scripts"][number]).title === "string" && typeof (item as Project["scripts"][number]).body === "string")).slice(0, 100);
    if (Array.isArray(input.materials)) project.materials = input.materials.filter((item): item is Project["materials"][number] => Boolean(item && typeof item === "object" && typeof (item as Project["materials"][number]).id === "string" && typeof (item as Project["materials"][number]).name === "string")).slice(0, 500);
    project.lastTouchedAt = now();
    if (input.active === true) current.activeProjectId = project.id;
    return project;
  });
  if (!result) return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });
  return NextResponse.json({ state, project: result });
}
