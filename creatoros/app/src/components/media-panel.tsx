"use client";
import { useRef, useState } from "react";
import { Download, File, Grid2X2, List, Plus, RefreshCw, Upload, X } from "lucide-react";
import type { CreatorState, MediaRecord, MediaRole } from "@/lib/model";
import { mediaUrl } from "@/lib/storage-paths";
import { manualAction } from "@/lib/client-api";

const roleLabels: Record<MediaRole, string> = { asset: "Asset", reference: "Referenz", raw: "Rohmaterial", export: "Export", other: "Sonstiges" };
const sizeLabel = (size: number) => size >= 1024 * 1024 ? (size / (1024 * 1024)).toFixed(1) + " MB" : Math.ceil(size / 1024) + " KB";

export function MediaPanel({ data, entityType = "project", entityId, onState, compact = false }: { data: CreatorState; entityType?: "project" | "task"; entityId: string; onState: (state: CreatorState) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [role, setRole] = useState<MediaRole>("asset");
  const [existing, setExisting] = useState("");
  const linked = data.media.filter((media) => media.links.some((link) => link.entityType === entityType && link.entityId === entityId));
  const available = data.media.filter((media) => !linked.some((item) => item.id === media.id));

  const upload = async (files: File[]) => {
    if (!files.length || working) return;
    setWorking(true); setError(""); setRetryFiles([]);
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      try {
        const params = new URLSearchParams({ entityType, entityId, role });
        const response = await fetch("/api/media?" + params, { method: "POST", body: file, headers: { "x-file-name": encodeURIComponent(file.name), "x-file-size": String(file.size), "Content-Type": file.type || "application/octet-stream" }, signal: AbortSignal.timeout(15 * 60 * 1000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Datei konnte nicht gespeichert werden.");
        onState(result.state);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload fehlgeschlagen."); setRetryFiles(files.slice(index)); break; }
    }
    setWorking(false);
  };
  const attach = async () => {
    if (!existing || working) return; setWorking(true); setError("");
    try { await manualAction({ name: "attachMedia", args: { mediaId: existing, entityType, entityId, role } }, onState); setExisting(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Zuordnung fehlgeschlagen."); }
    finally { setWorking(false); }
  };
  const detach = async (mediaId: string) => {
    setError(""); try { await manualAction({ name: "detachMedia", args: { mediaId, entityType, entityId } }, onState); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Zuordnung konnte nicht entfernt werden."); }
  };
  return <section className={`media-panel ${compact ? "media-panel-compact" : ""}`}>
    <div className="media-upload" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); }}>
      <Upload size={22}/><b>{working ? "Dateien werden gespeichert …" : "Dateien hier ablegen"}</b><span>{data.integrations.nas.enabled ? "Speicher: " + (data.integrations.nas.name || "NAS") : "Speicher: CreatorOS-Datenordner"}</span>
      <input ref={input} className="visually-hidden" type="file" multiple onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; void upload(files); }}/>
      <div className="media-upload-controls"><label>Typ<select value={role} onChange={(event) => setRole(event.target.value as MediaRole)} disabled={working}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button-secondary" disabled={working} onClick={() => input.current?.click()}>Dateien wählen</button></div>
      <small>Bilder, Video, Audio, PDF, Text, Office & ZIP · bis 500 MB pro Datei</small>
    </div>
    {error && <div className="brain-error" role="alert">{error}{retryFiles.length > 0 && <button className="button-secondary" disabled={working} onClick={() => void upload(retryFiles)}><RefreshCw size={16}/> Erneut versuchen</button>}</div>}
    {available.length > 0 && <div className="existing-media"><label>Vorhandenes Medium<select value={existing} onChange={(event) => setExisting(event.target.value)}><option value="">Auswählen …</option>{available.map((media) => <option key={media.id} value={media.id}>{media.displayName}</option>)}</select></label><button className="button-secondary" disabled={!existing || working} onClick={() => void attach()}><Plus size={17}/> Zuordnen</button></div>}
    <div className="media-grid">{linked.map((media) => <MediaCard key={media.id} media={media} role={media.links.find((link) => link.entityType === entityType && link.entityId === entityId)?.role} onDetach={() => void detach(media.id)}/>)}</div>
    {!linked.length && <p className="media-empty">Noch keine Dateien zugeordnet. Bestehende Materialnotizen bleiben erhalten.</p>}
  </section>;
}

export function MediaCard({ media, role, onDetach, linkedLabels }: { media: MediaRecord; role?: MediaRole; onDetach?: () => void; linkedLabels?: string[] }) {
  const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  const url = mediaUrl(media) + "?preview=" + attempt;
  return <article className="media-card">
    <div className="media-preview">{failed ? <div><File size={26}/><span>Momentan nicht verfügbar</span><button className="button-ghost" onClick={() => { setFailed(false); setAttempt(attempt + 1); }}><RefreshCw size={16}/> Erneut laden</button></div> : media.mimeType.startsWith("image/") ? <img src={url} alt={media.displayName} loading="lazy" onError={() => setFailed(true)}/> : media.mimeType.startsWith("video/") ? <video src={url} controls preload="metadata" onError={() => setFailed(true)}/> : media.mimeType.startsWith("audio/") ? <audio src={url} controls preload="metadata" onError={() => setFailed(true)}/> : <File size={30}/>}</div>
    <div className="media-card-copy"><b>{media.displayName}</b><small>{sizeLabel(media.fileSize)} · {role ? roleLabels[role] : media.storageProvider === "nas" ? "NAS" : "Lokal"}</small><small>{new Date(media.createdAt).toLocaleDateString("de-AT")}</small>{linkedLabels && <small>{linkedLabels.length ? linkedLabels.join(" · ") : "Ohne Zuordnung"}</small>}</div>
    <div className="media-card-actions"><a className="button-ghost" href={mediaUrl(media)} target="_blank" rel="noopener noreferrer"><Download size={16}/> Öffnen</a>{onDetach && <button className="icon-quiet" aria-label="Zuordnung entfernen; Datei behalten" title="Zuordnung entfernen; Datei bleibt in der Medienübersicht" onClick={onDetach}><X size={17}/></button>}</div>
  </article>;
}

export function MediaLibrary({ data }: { data: CreatorState }) {
  const [search, setSearch] = useState(""); const [type, setType] = useState(""); const [projectId, setProjectId] = useState(""); const [list, setList] = useState(false);
  const [linkedType, setLinkedType] = useState(""); const [since, setSince] = useState("");
  const labels = (media: MediaRecord) => media.links.map((link) => link.entityType === "project" ? "Projekt: " + (data.projects.find((item) => item.id === link.entityId)?.title || "Nicht verfügbar") : "Aufgabe: " + (data.tasks.find((item) => item.id === link.entityId)?.title || "Nicht verfügbar"));
  const filtered = data.media.filter((media) => [media.displayName,...labels(media)].join(" ").toLocaleLowerCase("de").includes(search.toLocaleLowerCase("de")) && (!type || media.mimeType.startsWith(type) || (type === "application/" && media.mimeType.startsWith("text/"))) && (!projectId || media.links.some((link) => link.entityType === "project" ? link.entityId === projectId : data.tasks.some((task) => task.id === link.entityId && task.projectId === projectId))) && (!linkedType || (linkedType === "unlinked" ? !media.links.length : media.links.some((link) => link.entityType === linkedType))) && (!since || media.createdAt.slice(0,10) >= since));
  return <section><div className="screen-heading"><div><div className="eyebrow">DEINE DATEIEN</div><h1>Medien</h1><p>Assets, Referenzen und Rohmaterial. Neue Dateien lädst du direkt im Projekt oder in einer Aufgabe hoch.</p></div></div>
    <div className="media-filters"><input aria-label="Medien suchen" placeholder="Dateiname suchen …" value={search} onChange={(event) => setSearch(event.target.value)}/><select aria-label="Dateityp" value={type} onChange={(event) => setType(event.target.value)}><option value="">Alle Dateitypen</option><option value="image/">Bilder</option><option value="video/">Video</option><option value="audio/">Audio</option><option value="application/">Dokumente</option></select><select aria-label="Projekt" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Alle Projekte</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><div className="media-view-toggle"><button className="icon-quiet" aria-label="Grid" aria-pressed={!list} onClick={() => setList(false)}><Grid2X2 size={20}/></button><button className="icon-quiet" aria-label="Liste" aria-pressed={list} onClick={() => setList(true)}><List size={20}/></button></div></div>
    <details className="integration-advanced"><summary>Zuordnung & Datum filtern</summary><div className="media-filters"><select aria-label="Verknüpfte Einträge" value={linkedType} onChange={(event) => setLinkedType(event.target.value)}><option value="">Alle Zuordnungen</option><option value="project">Projekte / Content</option><option value="task">Aufgaben</option><option value="unlinked">Ohne Zuordnung</option></select><label className="media-date-filter">Ab Datum<input type="date" value={since} onChange={(event) => setSince(event.target.value)}/></label></div></details>
    <div className={`media-grid media-library-grid ${list ? "media-list" : ""}`}>{filtered.slice(0,100).map((media) => <MediaCard key={media.id} media={media} linkedLabels={labels(media)}/>)}</div>{!filtered.length && <p className="media-empty">Keine passenden Medien vorhanden.</p>}{filtered.length > 100 && <p>Suche eingrenzen: angezeigt werden die ersten 100 Dateien.</p>}
  </section>;
}
