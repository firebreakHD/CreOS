import { NextResponse } from "next/server";
import { uploadMedia } from "@/lib/media";
import { readState } from "@/lib/store";
import { StorageError } from "@/lib/storage";
import { ActionError } from "@/lib/action-core";
import { assertTrustedRequest } from "@/lib/request-guard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json((await readState()).media, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Medien konnten nicht gelesen werden." }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { assertTrustedRequest(request); return NextResponse.json(await uploadMedia(request), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof StorageError || error instanceof ActionError ? error.message : "Upload fehlgeschlagen. Bitte erneut versuchen." }, { status: error instanceof StorageError || error instanceof ActionError ? error.status : 400 }); }
}
