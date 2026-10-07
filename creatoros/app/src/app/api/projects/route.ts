import { rejectUntrustedRequest } from "@/lib/request-guard";
import { NextResponse } from "next/server";
import { readState } from "@/lib/store";
import { executeAction } from "@/lib/actions";
import { ActionError } from "@/lib/action-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json((await readState()).projects); }
  catch { return NextResponse.json({ error: "Projekte konnten nicht gelesen werden." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const untrusted = rejectUntrustedRequest(request); if (untrusted) return untrusted;
  try {
    const args = await request.json();
    const { state, result } = await executeAction({ name: "createContent", args });
    return NextResponse.json({ state, project: result.value }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  const untrusted = rejectUntrustedRequest(request); if (untrusted) return untrusted;
  try {
    const args = await request.json();
    const { state, result } = await executeAction({ name: "updateContent", args });
    return NextResponse.json({ state, project: result.value });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof ActionError ? error.message : "Projekt konnte nicht gespeichert werden." }, { status: error instanceof ActionError ? error.status : 400 });
}
