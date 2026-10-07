import { rejectUntrustedRequest } from "@/lib/request-guard";
import { NextResponse } from "next/server";
import { diffBrain, exportBrain, MAX_BRAIN_BYTES, mergeBrain, parseBrain } from "@/lib/brain";
import { readState, updateState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { brain } = await readState();
    if (new URL(request.url).searchParams.has("download")) return NextResponse.json(exportBrain(brain), {
      headers: { "Content-Disposition": 'attachment; filename="creatoros-brain.json"', "Cache-Control": "no-store" },
    });
    return NextResponse.json(brain, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Brain konnte nicht gelesen werden." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const untrusted = rejectUntrustedRequest(request); if (untrusted) return untrusted;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BRAIN_BYTES + 8192) return NextResponse.json({ error: "Brain-Datei ist zu groß (maximal 512 KB)." }, { status: 413 });
    const input = JSON.parse(raw) as { action?: unknown; document?: unknown; selectedIds?: unknown; expectedRevision?: unknown; source?: unknown };
    if (!input || !["preview", "import"].includes(String(input.action))) throw new Error("Unbekannte Brain-Aktion.");
    const incoming = parseBrain(input.document);
    if (input.action === "preview") {
      const { brain } = await readState();
      return NextResponse.json({ changes: diffBrain(brain, incoming), revision: brain.revision });
    }
    if (!Array.isArray(input.selectedIds) || !input.selectedIds.every((id) => typeof id === "string") || !Number.isSafeInteger(input.expectedRevision)) throw new Error("Importauswahl fehlt.");
    const { state, result } = await updateState((current) => {
      if (current.brain.revision !== input.expectedRevision) return false;
      current.brain = mergeBrain(current.brain, incoming, input.selectedIds as string[], typeof input.source === "string" ? input.source : "Brain-Import");
      return true;
    });
    if (!result) return NextResponse.json({ error: "Brain wurde inzwischen geändert. Vorschau neu laden und die Änderungen erneut prüfen." }, { status: 409 });
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? "Die Datei enthält kein gültiges JSON." : error instanceof Error ? error.message : "Brain-Import fehlgeschlagen." }, { status: 400 });
  }
}
