"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2, X } from "lucide-react";
import type { CreatorState, MaterialItem, Project } from "@/lib/model";
import { manualAction } from "@/lib/client-api";
export type MenuAction = { label: string; run: () => void | Promise<unknown>; danger?: boolean; disabled?: boolean };

export function ContextTarget({ children, label, actions }: { children: ReactNode; label: string; actions: MenuAction[] }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [error,setError] = useState("");
  const target = useRef<HTMLDivElement>(null); const menu = useRef<HTMLDivElement>(null); const hold = useRef<ReturnType<typeof setTimeout> | null>(null); const origin = useRef({ x: 0, y: 0 }); const suppressClick = useRef(false);
  const clear = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  useEffect(() => () => clear(), []);
  useEffect(() => {
    if (!point) return;
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const close = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setPoint(null); };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setPoint(null); target.current?.focus(); }
      if (["ArrowDown","ArrowUp","Home","End"].includes(event.key)) {
        event.preventDefault(); const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [])]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", keys); window.addEventListener("resize", close); document.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", keys); window.removeEventListener("resize", close); document.removeEventListener("scroll", close, true); };
  }, [point]);
  const editable = (element: EventTarget | null) => element instanceof Element && Boolean(element.closest('input:not([type="checkbox"]):not([type="range"]),textarea,[contenteditable=true]'));
  const open = (x: number, y: number) => setPoint({ x: Math.max(8, Math.min(x, window.innerWidth - 268)), y: Math.max(8, Math.min(y, window.innerHeight - Math.min(actions.length * 46 + 44, 420) - 8)) });
  return <div className="context-target" ref={target} tabIndex={0} aria-label={`${label} · Kontextmenü mit Rechtsklick, langem Drücken oder Umschalt+F10`} onContextMenu={(event) => { if (editable(event.target)) return; event.preventDefault(); event.stopPropagation(); clear(); open(event.clientX,event.clientY); }} onKeyDown={(event) => { if (editable(event.target)) return; if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); event.stopPropagation(); const rect = (target.current?.firstElementChild || target.current)?.getBoundingClientRect(); open(rect?.left || 8,rect?.top || 8); } }}
    onPointerDown={(event) => { if (event.pointerType !== "touch" || editable(event.target)) return; event.stopPropagation(); origin.current = { x: event.clientX,y: event.clientY }; clear(); hold.current = setTimeout(() => { suppressClick.current = true; open(origin.current.x,origin.current.y); }, 550); }} onPointerMove={(event) => { if (Math.abs(event.clientX-origin.current.x) + Math.abs(event.clientY-origin.current.y) > 12) clear(); }} onPointerUp={clear} onPointerCancel={clear} onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    {children}{error && <p className="brain-error" role="alert">{error}</p>}{point && createPortal(<div className="entity-context-menu" role="menu" aria-label={label} ref={menu} style={{ left: point.x,top: point.y }}><div className="entity-menu-title">{label}</div>{actions.map((action) => <button key={action.label} role="menuitem" disabled={action.disabled} className={action.danger ? "is-danger" : ""} onClick={() => { setPoint(null); setError(""); try { const result = action.run(); void Promise.resolve(result).catch((cause) => setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen.")); } catch (cause) { setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen."); } }}>{action.label}</button>)}</div>,document.body)}
  </div>;
}
export function EntityActions({ children, name, onRename, onDelete, deleteDescription, actions = [] }: { children: ReactNode; name: string; onRename?: (value: string) => Promise<unknown>; onDelete?: () => Promise<unknown>; deleteDescription?: string; actions?: MenuAction[] }) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null); const [value, setValue] = useState(name); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const field = useRef<HTMLInputElement>(null);
  useEffect(() => { if (dialog === "rename") { field.current?.focus(); field.current?.select(); } }, [dialog]);
  const show = (next: typeof dialog) => { setValue(name); setError(""); setDialog(next); };
  return <><ContextTarget label={name} actions={[...actions,...(onRename ? [{ label: "Umbenennen",run: () => show("rename") }] : []),...(onDelete ? [{ label: "Löschen …",danger: true,run: () => show("delete") }] : [])]}>{children}</ContextTarget>
    {dialog && createPortal(<div className="modal-backdrop" onKeyDown={(event) => { if (event.key === "Escape" && !busy) setDialog(null); }}><form className="dialog entity-dialog" role="dialog" aria-modal="true" aria-label={dialog === "rename" ? "Umbenennen" : "Löschen bestätigen"} onSubmit={async (event) => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); try { if (dialog === "rename") await onRename?.(value.trim()); else await onDelete?.(); setDialog(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Änderung fehlgeschlagen."); } finally { setBusy(false); } }}><div className="dialog-heading"><h2>{dialog === "rename" ? <><Pencil size={21}/> Umbenennen</> : <><Trash2 size={21}/> Löschen?</>}</h2><button type="button" className="icon-quiet" aria-label="Schließen" disabled={busy} onClick={() => setDialog(null)}><X size={20}/></button></div>{dialog === "rename" ? <label>Name<input ref={field} value={value} required maxLength={200} onChange={(event) => setValue(event.target.value)}/></label> : <><b>{name}</b><p>{deleteDescription || "Dieser Eintrag wird dauerhaft entfernt."}</p></>}{error && <p role="alert" className="brain-error">{error}</p>}<div className="screen-action-group"><button type="button" className="button-secondary" disabled={busy} onClick={() => setDialog(null)}>Abbrechen</button><button className={dialog === "delete" ? "button-danger" : "button-primary"} disabled={busy || (dialog === "rename" && !value.trim())}>{busy ? "Wird gespeichert …" : dialog === "rename" ? "Speichern" : "Dauerhaft löschen"}</button></div></form></div>,document.body)}
  </>;
}
export function ProjectActions({ project, onState, children, onDeleted, onOpen, onStart }: { project: Project; onState: (state: CreatorState) => void; children: ReactNode; onDeleted?: () => void; onOpen?: () => void; onStart?: () => void }) {
  const change = (fields: Record<string,unknown>) => manualAction({ name: "updateContent", args: { id: project.id,...fields } },onState);
  return <EntityActions name={project.title} onRename={(title) => change({ title })} onDelete={async () => { await manualAction({ name: "deleteContent",args: { id: project.id,confirm: true } },onState); onDeleted?.(); }} deleteDescription="Projekt, Story, Materialnotizen, Aufgaben, zugehörige Ideen und Planung löschen. Hochgeladene Dateien bleiben in Medien und können dort separat dauerhaft gelöscht werden. Abgeschlossene Sessions bleiben als Verlauf erhalten." actions={[...(onOpen ? [{ label: "Projekt öffnen",run: onOpen }] : []),...(onStart ? [{ label: "Session starten",run: onStart }] : []),{ label: project.status === "paused" ? "Projekt fortsetzen" : "Projekt pausieren",run: () => change({ status: project.status === "paused" ? "active" : "paused" }) },{ label: project.status === "complete" ? "Projekt wieder öffnen" : "Projekt abschließen",run: () => change({ status: project.status === "complete" ? "active" : "complete" }) },...Object.entries({ ideas: "Ideen",planned: "Geplant",recorded: "Aufgenommen",editing: "Schnitt",published: "Veröffentlicht" }).filter(([pipeline]) => pipeline !== project.pipeline).map(([pipeline,label]) => ({ label: "Verschieben → " + label,run: () => change({ pipeline }) }))]}>{children}</EntityActions>;
}
export function MaterialNote({ item, project, onState }: { item: MaterialItem; project: Project; onState: (state: CreatorState) => void }) {
  return <EntityActions name={item.name} onRename={(name) => manualAction({ name: "updateContent",args: { id: project.id,materials: project.materials.map((entry) => entry.id === item.id ? { ...entry,name } : entry) } },onState)} onDelete={() => manualAction({ name: "removeMaterial",args: { id: project.id,materialId: item.id } },onState)} deleteDescription="Diese Materialnotiz entfernen. Demo-Einträge sind Notizen und enthalten keine tatsächliche Mediendatei."><div className="material-mini"><div><b>{item.name}</b><small>{item.note}</small></div></div></EntityActions>;
}
