import { readState } from "@/lib/store";
import { StorageError, storageProvider } from "@/lib/storage";
import { FILE_TYPES } from "@/lib/media";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const state = await readState(); const media = state.media.find((item) => item.id === id);
    if (!media) return NextResponse.json({ error: "Medium nicht gefunden." }, { status: 404 });
    const range = request.headers.get("range") || undefined;
    if (range && !/^bytes=\d*-\d*$/.test(range)) throw new StorageError("Dateibereich ist ungültig.", 416);
    const file = await (await storageProvider(state, media)).getFile(media.relativePath, range);
    const type = Object.values(FILE_TYPES).includes(media.mimeType) ? media.mimeType : "application/octet-stream";
    const inline = /^(image\/(jpeg|png|webp|gif|avif)|video\/|audio\/)/.test(type);
    const headers: Record<string, string> = {
      "Content-Type": type, "Content-Disposition": (inline ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(media.originalFilename),
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Accept-Ranges": "bytes",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    };
    if (file.length > 0) headers["Content-Length"] = String(file.length);
    if (file.contentRange) headers["Content-Range"] = file.contentRange;
    return new Response(file.body, { status: file.status, headers });
  } catch (error) { return NextResponse.json({ error: error instanceof StorageError ? error.message : "Datei ist momentan nicht verfügbar." }, { status: error instanceof StorageError ? error.status : 503 }); }
}
