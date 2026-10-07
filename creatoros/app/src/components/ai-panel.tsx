"use client";
import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import type { CreatorState } from "@/lib/model";
import { appRequest } from "@/lib/client-api";

const actionNames: Record<string,string> = { createTask: "Aufgabe erstellen", updateTask: "Aufgabe bearbeiten", completeTask: "Aufgabe abschließen", createContent: "Content erstellen", updateContent: "Content bearbeiten", scheduleContent: "Veröffentlichung planen", createIdea: "Idee erstellen", attachMedia: "Medium zuordnen", detachMedia: "Zuordnung entfernen", uploadMedia: "Textdatei hochladen", createPlanning: "Planung erstellen", updatePlanning: "Planung ändern" };
export default function AiPanel({ data, projectId, onState }: { data: CreatorState; projectId: string | null; onState: (state: CreatorState) => void }) {
  const [question, setQuestion] = useState(""); const [answer, setAnswer] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const images = data.media.filter((media) => ["image/png","image/jpeg","image/webp","image/gif"].includes(media.mimeType) && media.fileSize <= 6 * 1024 * 1024 && (!projectId || media.links.some((link) => link.entityType === "project" ? link.entityId === projectId : data.tasks.some((task) => task.id === link.entityId && task.projectId === projectId))));
  const proposals = data.actionProposals.filter((proposal) => proposal.status === "pending" && Date.parse(proposal.expiresAt) > Date.now());
  const decide = async (proposalId: string, approve: boolean) => {
    setBusy(true); setError("");
    try { const result = await appRequest("/api/actions", { proposalId, approve }); onState(result.state); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Vorschlag konnte nicht übernommen werden."); }
    finally { setBusy(false); }
  };
  if (!data.integrations.ai.enabled) return null;
  return <section className="ai-panel"><div className="brain-card-heading"><Sparkles size={21}/><h2>Mit AI bearbeiten</h2></div><p>Deine Anfrage wird mit Brain, dem aktuellen Projektkontext und ausdrücklich ausgewählten Bildern an OpenAI gesendet. Änderungen folgen deinen Freigaben.</p>
    <form className="integration-form" onSubmit={async (event) => { event.preventDefault(); if (!question.trim() || busy) return; setBusy(true); setError(""); try { const result = await appRequest("/api/ai/chat", { question, projectId, imageIds: imageIds.filter((id) => images.some((image) => image.id === id)) }, 6 * 60 * 1000); onState(result.state); setAnswer(result.answer); if (result.warning) setError(result.warning); } catch (cause) { setError(cause instanceof Error ? cause.message : "AI-Anfrage fehlgeschlagen."); } finally { setBusy(false); } }}>
      <label>Wobei soll die AI helfen?<textarea rows={4} value={question} maxLength={4000} required onChange={(event) => setQuestion(event.target.value)} placeholder="z. B. Lege aus meinem nächsten Schritt zwei konkrete Aufgaben an."/></label>
      {images.length > 0 && <details className="integration-advanced"><summary>Bildreferenzen auswählen ({imageIds.length}/3)</summary><small>Nur angekreuzte Bilder werden übertragen. Maximal 6 MB pro Bild, zusammen 10 MB.</small><div className="permission-list">{images.map((image) => <label key={image.id}><input type="checkbox" checked={imageIds.includes(image.id)} disabled={busy || (!imageIds.includes(image.id) && imageIds.length >= 3)} onChange={(event) => setImageIds(event.target.checked ? [...imageIds,image.id] : imageIds.filter((id) => id !== image.id))}/>{image.displayName}</label>)}</div></details>}
      <button className="button-primary" disabled={busy || !question.trim()}><Sparkles size={17}/>{busy ? "Wird verarbeitet …" : "An AI senden"}</button>
    </form>
    {error && <p className="brain-error" role="alert">{error}</p>}{answer && <div className="ai-answer" role="status">{answer}</div>}
    {proposals.length > 0 && <div className="ai-proposals"><h3>Änderungen prüfen</h3>{proposals.map((proposal) => <article className="ai-proposal" key={proposal.id}><b>{actionNames[proposal.action.name] || proposal.action.name}</b><pre>{JSON.stringify(proposal.action.args,null,2)}</pre><div className="screen-action-group"><button className="button-primary" disabled={busy} onClick={() => void decide(proposal.id,true)}><Check size={17}/> Übernehmen</button><button className="button-ghost" disabled={busy} onClick={() => void decide(proposal.id,false)}><X size={17}/> Verwerfen</button></div></article>)}</div>}
  </section>;
}
