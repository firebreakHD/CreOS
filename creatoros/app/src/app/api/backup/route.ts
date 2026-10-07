import { NextResponse } from "next/server";
import { exportBackup, readState, replaceState, validBackup } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const backup = exportBackup(await readState());
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="creatoros-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch { return NextResponse.json({ error: "Sicherung konnte nicht erstellt werden." }, { status: 500 }); }
}

export async function POST(request: Request) {
  let backup: unknown;
  try { backup = await request.json(); } catch { return NextResponse.json({ error: "Die Datei enthält kein gültiges JSON." }, { status: 400 }); }
  if (!validBackup(backup)) return NextResponse.json({ error: "Diese CreatorOS-Sicherung wird nicht unterstützt." }, { status: 400 });
  try { return NextResponse.json({ ok: true, state: await replaceState(backup.state) }); }
  catch { return NextResponse.json({ error: "Wiederherstellen ist fehlgeschlagen. Die vorhandenen Daten bleiben erhalten." }, { status: 500 }); }
}
