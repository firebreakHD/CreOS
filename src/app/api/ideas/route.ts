import { rejectUntrustedRequest } from "@/lib/request-guard";
import { NextResponse } from "next/server";
import { executeAction } from "@/lib/actions";
import { ActionError, applyAction } from "@/lib/action-core";
import type { Project } from "@/lib/model";
import { updateState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const untrusted = rejectUntrustedRequest(request); if (untrusted) return untrusted;
  try {
    const { state, result } = await executeAction({ name: "createIdea", args: await request.json() });
    return NextResponse.json({ state, idea: result.value }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof ActionError ? error.message : "Idee konnte nicht gespeichert werden." }, { status: error instanceof ActionError ? error.status : 400 }); }
}

export async function PATCH(request: Request) {
  const untrusted = rejectUntrustedRequest(request); if (untrusted) return untrusted;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Ungültige JSON-Daten." }, { status: 400 }); }
  const input = body as { id?: unknown; projectId?: unknown; convert?: unknown };
  const { state, result } = await updateState((current) => {
    const index = current.ideas.findIndex((idea) => idea.id === input?.id);
    if (index < 0) return null;
    if (input.convert === true) {
      const idea = current.ideas[index];
      const project = applyAction(current, { name: "createContent", args: { title: idea.text.slice(0, 80), summary: idea.text.slice(0, 500), pipeline: "ideas" } }) as Project;
      const projectId = project.id;
      project.lastProgress = "Aus einer Idee gestartet";
      current.ideas.splice(index, 1);
      return { convertedProjectId: projectId };
    }
    if (input.projectId === null || typeof input.projectId === "string") current.ideas[index].projectId = input.projectId;
    return { updated: true };
  });
  if (!result) return NextResponse.json({ error: "Idee nicht gefunden." }, { status: 404 });
  return NextResponse.json({ state, result });
}
