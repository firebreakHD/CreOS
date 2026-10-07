import { NextResponse } from "next/server";
import { buildAiContext } from "@/lib/brain";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { projectId?: unknown; question?: unknown };
    if (!input || (input.question !== undefined && (typeof input.question !== "string" || input.question.length > 4000))) {
      return NextResponse.json({ error: "Bitte eine Anfrage mit höchstens 4000 Zeichen eingeben." }, { status: 400 });
    }
    const state = await readState();
    const projectId = typeof input.projectId === "string" && input.projectId ? input.projectId : null;
    if (projectId && !state.projects.some((project) => project.id === projectId)) return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });
    return NextResponse.json(buildAiContext(state, projectId, typeof input.question === "string" ? input.question : ""), { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "KI-Kontext konnte nicht vorbereitet werden." }, { status: 400 }); }
}
