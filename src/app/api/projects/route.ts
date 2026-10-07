import { rejectUntrustedRequest } from "@/lib/request-guard";
import { NextResponse } from "next/server";
import { readState } from "@/lib/store";
import { executeAction } from "@/lib/actions";
import { ActionError } from "@/lib/action-core";
import { configuredNas } from "@/lib/storage";
import { SmbStorageProvider } from "@/lib/smb-storage";
import { projectMediaFolders } from "@/lib/storage-paths";
import type { Project } from "@/lib/model";

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
    const project = result.value as Project;
    let folderNotice: string | undefined;
    if (state.integrations.nas.enabled && state.integrations.nas.protocol === "smb") {
      try {
        const provider = await configuredNas(state);
        if (!(provider instanceof SmbStorageProvider)) throw new Error("SMB-Dateibrowser ist nicht verfügbar.");
        await provider.ensureFolders(projectMediaFolders(project));
        folderNotice = "NAS-Projektordner mit Assets, Rohmaterial und Export wurde angelegt.";
      } catch {
        folderNotice = "Projekt wurde erstellt, aber die NAS-Ordnerstruktur konnte nicht angelegt werden. Du kannst es im Tab Material erneut versuchen.";
      }
    }
    return NextResponse.json({ state, project, folderNotice }, { status: 201 });
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
