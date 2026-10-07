"use client";

import { useRef, useState } from "react";
import { Brain, Check, Copy, Download, FileUp, RefreshCw, Sparkles, X } from "lucide-react";
import type { CreatorState } from "@/lib/model";
import { MAX_BRAIN_BYTES, type BrainChange, type BrainValue } from "@/lib/brain";

const display = (content: BrainValue) => typeof content === "string" ? content : JSON.stringify(content, null, 2);
const statusLabel = { new: "Neu", updated: "Geändert", unchanged: "Unverändert" };

async function requestJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Das hat gerade nicht geklappt.");
  return result;
}

export default function BrainScreen({ data, onState, onNotify }: { data: CreatorState; onState: (state: CreatorState) => void; onNotify: (message: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const [document, setDocument] = useState<unknown>(null);
  const [filename, setFilename] = useState("");
  const [changes, setChanges] = useState<BrainChange[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("Hilf mir, den nächsten kleinen Schritt an diesem Projekt zu finden.");
  const [projectId, setProjectId] = useState(data.activeProjectId);
  const [prompt, setPrompt] = useState("");
  const stale = Boolean(changes && revision !== data.brain.revision);

  const preview = async (value: unknown, name: string) => {
    setWorking(true); setError("");
    try {
      const result = await requestJson("/api/brain", { action: "preview", document: value }) as { changes: BrainChange[]; revision: number };
      setDocument(value); setFilename(name); setChanges(result.changes); setRevision(result.revision);
      setSelected(result.changes.filter((change) => change.status !== "unchanged").map((change) => change.incoming.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Vorschau konnte nicht gelesen werden."); }
    finally { setWorking(false); }
  };

  const chooseFile = async (file?: File) => {
    if (!file) return;
    setError("");
    if (file.size > MAX_BRAIN_BYTES) { setError("Die Brain-Datei darf höchstens 512 KB groß sein."); return; }
    try { await preview(JSON.parse((await file.text()).replace(/^\uFEFF/, "")), file.name); }
    catch { setError("Die Datei enthält kein gültiges JSON."); }
  };

  const apply = async () => {
    if (!changes || !selected.length || stale || working) return;
    setWorking(true); setError("");
    try {
      const result = await requestJson("/api/brain", { action: "import", document, selectedIds: selected, expectedRevision: revision, source: filename }) as { state: CreatorState };
      onState(result.state); setChanges(null); setDocument(null); setPrompt("");
      onNotify("Brain aktualisiert. Der Kontext ist für die KI bereit.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import fehlgeschlagen. Deine Auswahl bleibt erhalten."); }
    finally { setWorking(false); }
  };

  const prepareContext = async () => {
    setWorking(true); setError("");
    try {
      const result = await requestJson("/api/ai/context", { projectId, question }) as { prompt: string };
      setPrompt(result.prompt);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kontext konnte nicht vorbereitet werden."); }
    finally { setWorking(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); onNotify("KI-Kontext kopiert."); }
    catch { promptInput.current?.focus(); promptInput.current?.select(); onNotify("Der Browser erlaubt hier kein direktes Kopieren. Der Text ist zum Kopieren markiert."); }
  };

  const downloadContext = () => {
    const url = URL.createObjectURL(new Blob([prompt], { type: "text/plain;charset=utf-8" }));
    const link = window.document.createElement("a"); link.href = url; link.download = "creatoros-ki-kontext.txt"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="brain-screen">
    <div className="screen-heading"><div><div className="eyebrow">DEIN LANGFRISTIGER KONTEXT</div><h1>Brain</h1><p>Was dir wichtig ist, was schon funktioniert hat und wie du arbeiten möchtest.</p></div></div>
    <div className="brain-toolbar">
      <input ref={fileInput} type="file" accept=".json,application/json" className="visually-hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void chooseFile(file); }}/>
      <button className="button-primary" disabled={working} onClick={() => fileInput.current?.click()}><FileUp size={18}/> Brain-Datei importieren</button>
      <a className="button-secondary" href="/api/brain?download=1"><Download size={18}/> Brain exportieren</a>
      <span>{data.brain.entries.length} Bereiche gespeichert</span>
    </div>
    {error && <div className="brain-error" role="alert">{error}</div>}
    {changes && <article className="brain-import-preview">
      <div className="brain-preview-heading"><div><span className="action-label">IMPORTVORSCHAU</span><h2>{filename}</h2><p>{changes.filter((change) => change.status === "new").length} neu · {changes.filter((change) => change.status === "updated").length} geändert · {changes.filter((change) => change.status === "unchanged").length} unverändert</p></div><button className="icon-quiet" disabled={working} aria-label="Importvorschau schließen" onClick={() => { setChanges(null); setDocument(null); setError(""); }}><X size={20}/></button></div>
      <p>Wähle die Bereiche, die du übernehmen möchtest. Fehlende Bereiche bleiben gespeichert. Geänderte Bereiche ersetzen nur den ausgewählten bisherigen Inhalt.</p>
      {stale && <p className="brain-error">Brain wurde inzwischen geändert. Lade die Vorschau neu.</p>}
      <div className="brain-change-list">{changes.map((change) => <article className="brain-change" key={change.incoming.id}>
        <label className="brain-change-select"><input type="checkbox" checked={selected.includes(change.incoming.id)} disabled={working || change.status === "unchanged"} onChange={(event) => setSelected((current) => event.target.checked ? [...current, change.incoming.id] : current.filter((id) => id !== change.incoming.id))}/><b>{change.incoming.title}</b><span className={`brain-change-status ${change.status}`}>{statusLabel[change.status]}</span></label>
        <details><summary>Inhalt ansehen</summary><div className={`brain-diff ${change.previous ? "has-previous" : ""}`}>{change.previous && <div><span className="action-label">BISHER</span><pre>{display(change.previous.content)}</pre></div>}<div><span className="action-label">{change.status === "unchanged" ? "INHALT" : "AUS DER DATEI"}</span><pre>{display(change.incoming.content)}</pre></div></div></details>
      </article>)}</div>
      <div className="brain-preview-actions"><button className="button-secondary" disabled={working} onClick={() => void preview(document, filename)}><RefreshCw size={17}/> Vorschau neu laden</button><button className="button-primary" disabled={working || stale || !selected.length} onClick={() => void apply()}><Check size={18}/>{working ? "Wird verarbeitet …" : `${selected.length} Bereiche übernehmen`}</button></div>
    </article>}
    <div className="brain-workspace">
      <article className="brain-stored"><div className="brain-card-heading"><Brain size={20}/><h2>Gespeicherter Kontext</h2></div>
        {data.brain.entries.length ? data.brain.entries.map((entry) => <details className="brain-entry" key={entry.id}><summary>{entry.title}</summary><pre>{display(entry.content)}</pre><small>Quelle: {entry.source} · {new Date(entry.updatedAt).toLocaleDateString("de-AT")}</small></details>) : <div className="brain-empty"><p>Noch kein Brain importiert.</p><p>Lade deine strukturierte JSON-Datei. Vor dem Speichern siehst du alle Änderungen.</p></div>}
      </article>
      <article className="brain-ai"><div className="brain-card-heading"><Sparkles size={20}/><h2>Kontext vorbereiten</h2></div><p>Brain, Projekt, nächste Aufgabe und letzte Sessions zu einem kopierbaren Kontext bündeln. Der Arbeitschat bleibt im CreatorOS-Assistenten rechts unten.</p>
        <label htmlFor="brain-project">Projekt</label><select id="brain-project" value={projectId} onChange={(event) => { setProjectId(event.target.value); setPrompt(""); }}><option value="">Nur langfristiger Kontext</option>{data.projects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select>
        <label htmlFor="brain-question">Wobei soll die KI helfen?</label><textarea id="brain-question" value={question} maxLength={4000} rows={4} onChange={(event) => { setQuestion(event.target.value); setPrompt(""); }}/>
        <button className="button-secondary" disabled={working} onClick={() => void prepareContext()}><Sparkles size={18}/> KI-Kontext vorbereiten</button>
        {prompt && <div className="brain-prepared"><label htmlFor="brain-prompt">Vorbereiteter Kontext</label><textarea ref={promptInput} id="brain-prompt" readOnly value={prompt} rows={10}/><div className="brain-preview-actions"><button className="button-primary" onClick={() => void copy()}><Copy size={17}/> Kopieren</button><button className="button-secondary" onClick={downloadContext}><Download size={17}/> Als Text herunterladen</button></div><small>Hier wird nichts an einen KI-Anbieter gesendet. Du kannst den Text in deinen KI-Chat einfügen.</small></div>}
      </article>
    </div>
  </section>;
}
