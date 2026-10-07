"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowRight, AudioLines, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Command, FileText, FolderOpen, Home, Inbox, LayoutGrid, Menu, MoreHorizontal, Pause, Play, Plus, RotateCcw, Settings2, Sparkles, Square, Timer, X } from "lucide-react";
import type { CreatorState, Idea, Project, ScriptSection, Session } from "@/lib/model";

type Screen = "today" | "projects" | "project" | "ideas" | "kanban" | "script" | "settings" | "focus" | "session-end";
type SpeechResult = { transcript: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<SpeechResult>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type BeforeInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const CACHE_KEY = "creatoros.last-known-state.v1";
const columns = [
  { id: "ideas", label: "Ideen" },
  { id: "planned", label: "Geplant" },
  { id: "recorded", label: "Aufgenommen" },
  { id: "editing", label: "Schnitt" },
  { id: "published", label: "Veröffentlicht" },
] as const;

function elapsedFor(session: Session) {
  return Math.max(0, session.elapsedSeconds + (session.isPaused || !session.runSegmentStartedAt ? 0 : (Date.now() - Date.parse(session.runSegmentStartedAt)) / 1000));
}

function formatTime(total: number) {
  const seconds = Math.max(0, Math.ceil(total));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function localDate(value: string) {
  return new Intl.DateTimeFormat("de-AT", { weekday: "long", day: "numeric", month: "long" }).format(new Date(value));
}

function activeSession(state: CreatorState | null) {
  return state?.sessions.find((session) => !session.endedAt) || null;
}

function currentProject(state: CreatorState | null, session?: Session | null) {
  if (!state) return null;
  return state.projects.find((project) => project.id === (session?.projectId || state.activeProjectId)) || state.projects.find((project) => project.status === "active") || null;
}

async function responseState(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Das hat gerade nicht geklappt.");
  return data;
}

export default function CreatorApp() {
  const [data, setData] = useState<CreatorState | null>(null);
  const stateRef = useRef<CreatorState | null>(null);
  const [screen, setScreen] = useState<Screen>("today");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [quickCapture, setQuickCapture] = useState(false);
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(true);
  const [clock, setClock] = useState(Date.now());
  const [mobileColumn, setMobileColumn] = useState("ideas");
  const [contextOpen, setContextOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPrompt | null>(null);
  const [haState, setHaState] = useState<"unknown" | "connected" | "unavailable">("unknown");
  const [sessionNext, setSessionNext] = useState("");
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = activeSession(data);
  const project = data?.projects.find((item) => item.id === selectedProjectId) || currentProject(data, session);
  const focusProject = currentProject(data, session);
  const pendingIdeas = useMemo(() => data?.ideas.filter((idea) => idea.pending) || [], [data]);

  const applyState = useCallback((next: CreatorState) => {
    const pending = stateRef.current?.ideas.filter((idea) => idea.pending) || [];
    const merged = { ...next, ideas: [...next.ideas, ...pending.filter((idea) => !next.ideas.some((saved) => saved.id === idea.id))] };
    stateRef.current = merged;
    setData(merged);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
    return merged;
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      const next = await responseState(response) as CreatorState;
      applyState(next);
      setOnline(true);
      return next;
    } catch {
      setOnline(false);
      return null;
    }
  }, [applyState]);

  useEffect(() => {
    try {
      const snapshot = localStorage.getItem(CACHE_KEY);
      if (snapshot) applyState(JSON.parse(snapshot) as CreatorState);
    } catch {}
    void refresh();
    const poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, 4000);
    const tick = window.setInterval(() => setClock(Date.now()), 1000);
    const onlineHandler = () => { setOnline(true); void refresh(); };
    const offlineHandler = () => setOnline(false);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    const promptHandler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPrompt); };
    window.addEventListener("beforeinstallprompt", promptHandler);
    const ingress = window.location.pathname.match(/^(\/api\/hassio_ingress\/[A-Za-z0-9_-]+)/)?.[1] || "";
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register(`${ingress}/service-worker.js`, { scope: `${ingress}/` }).catch(() => {});
    if (new URLSearchParams(window.location.search).get("mode") === "focus") setScreen("focus");
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("beforeinstallprompt", promptHandler);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [applyState, refresh]);

  useEffect(() => {
    const cached = data;
    if (!cached || !online || !pendingIdeas.length) return;
    let cancelled = false;
    void (async () => {
      for (const idea of pendingIdeas) {
        try {
          const response = await fetch("/api/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, text: idea.text, projectId: idea.projectId }) });
          const payload = await responseState(response) as { state: CreatorState };
          if (!cancelled) applyState(payload.state);
        } catch { setOnline(false); break; }
      }
    })();
    return () => { cancelled = true; };
  }, [applyState, data, online, pendingIdeas]);

  useEffect(() => {
    const loadHa = async () => {
      try {
        const response = await fetch("/api/home-assistant/status", { cache: "no-store", signal: AbortSignal.timeout(2500) });
        const status = await responseState(response) as { integration_configured?: boolean };
        setHaState(status.integration_configured ? "connected" : "unavailable");
      } catch { setHaState("unavailable"); }
    };
    if (screen === "settings") void loadHa();
  }, [screen]);

  const go = (next: Screen) => {
    setScreen(next);
    setQuickCapture(false);
    setContextOpen(false);
    if (next !== "focus" && next !== "session-end") history.replaceState(null, "", window.location.pathname);
    else history.replaceState(null, "", `${window.location.pathname}?mode=focus`);
  };

  const mutate = async (url: string, method: "POST" | "PATCH", body: unknown) => {
    setBusy(true);
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await responseState(response) as { state?: CreatorState; project?: Project; session?: Session; result?: { convertedProjectId?: string } };
      if (payload.state) applyState(payload.state);
      return payload;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Verbindung unterbrochen.");
      return null;
    } finally { setBusy(false); }
  };

  const startSession = async (projectId?: string) => {
    const result = await mutate("/api/sessions/start", "POST", { projectId: projectId || project?.id || data?.activeProjectId, durationMinutes: 10 });
    if (result) { go("focus"); notify("Session läuft. Der erste Schritt ist bereit."); }
  };

  const saveIdea = async (text: string, projectId?: string) => {
    const idea: Idea = { id: crypto.randomUUID(), text: text.trim(), projectId: projectId || null, createdAt: new Date().toISOString(), pending: !navigator.onLine };
    if (!idea.text) return;
    if (!navigator.onLine) {
      const next = stateRef.current;
      if (next) applyState({ ...next, ideas: [idea, ...next.ideas] });
      setOnline(false);
      notify("Offline gespeichert · wird beim Verbinden synchronisiert.");
      return;
    }
    const result = await mutate("/api/ideas", "POST", { id: idea.id, text: idea.text, projectId: idea.projectId });
    if (result) notify("Gespeichert.");
  };

  const updateProject = async (projectId: string, fields: Partial<Project> & { active?: boolean }) => {
    const result = await mutate("/api/projects", "PATCH", { id: projectId, ...fields });
    if (result) notify("Projekt aktualisiert.");
  };

  const createProject = async () => {
    const title = window.prompt("Wie soll dein Projekt heißen?");
    if (!title?.trim()) return;
    const result = await mutate("/api/projects", "POST", { title: title.trim() });
    if (result?.project) { setSelectedProjectId(result.project.id); go("project"); notify("Projekt ist bereit. Leg deinen ersten kleinen Schritt fest."); }
  };

  const finishSession = async (nextAction: string) => {
    const result = await mutate("/api/sessions/finish", "POST", { nextAction });
    if (result) { setSessionNext(""); go("today"); notify("Session gespeichert. Willkommen zurück, wann immer du weitermachst."); }
  };

  const setPause = async (paused: boolean) => {
    const result = await mutate("/api/sessions/pause", "POST", { paused });
    if (result) notify(paused ? "Session pausiert." : "Session läuft weiter.");
  };

  const extendSession = async () => {
    const result = await mutate("/api/sessions/extend", "POST", { minutes: 25 });
    if (result) { go("focus"); notify("25 Minuten hinzugefügt."); }
  };

  const nav = (target: Screen) => {
    if (target === "project") setSelectedProjectId(data?.activeProjectId || "");
    go(target);
  };

  if (!data) return <div className="boot-screen"><div className="brand-mark">▶</div><p>Dein nächster Schritt wird bereitgestellt …</p></div>;

  const onQuickCaptureSave = (text: string, projectId?: string) => { void saveIdea(text, projectId); setQuickCapture(false); };
  const headerLabel = ({ today: "Heute", projects: "Projekte", project: project?.title || "Projekt", ideas: "Ideen", kanban: "Content Pipeline", script: "Skript", settings: "Mehr", focus: "Fokus", "session-end": "Session abschließen" } as Record<Screen, string>)[screen];

  return <>
    {screen !== "focus" && screen !== "session-end" ? <div className="app-frame">
      <aside className="desktop-rail">
        <button className="brand-lockup" onClick={() => nav("today")} aria-label="CreatorOS · Heute"><span className="brand-symbol">▶</span><span>CreatorOS</span></button>
        <div className="workspace-label"><span className="workspace-dot">M</span><span>Marcel Studio</span><ChevronDown size={14}/></div>
        <nav className="primary-nav" aria-label="Hauptnavigation">
          <div className="nav-caption">DEIN NÄCHSTER SCHRITT</div>
          <NavButton icon={<Home/>} label="Heute" active={screen === "today"} onClick={() => nav("today")}/>
          <NavButton icon={<FolderOpen/>} label="Projekte" active={screen === "projects" || screen === "project" || screen === "script"} onClick={() => nav("projects")} count={data.projects.filter((item) => item.status === "active").length}/>
          <NavButton icon={<Inbox/>} label="Ideen-Inbox" active={screen === "ideas"} onClick={() => nav("ideas")} count={data.ideas.filter((idea) => !idea.pending).length}/>
          <div className="nav-caption nav-caption-spaced">PRODUZIEREN</div>
          <NavButton icon={<LayoutGrid/>} label="Content Pipeline" active={screen === "kanban"} onClick={() => nav("kanban")}/>
        </nav>
        <div className="rail-bottom">
          <button className="rail-secondary" onClick={() => nav("settings")}><Settings2 size={17}/>Einstellungen</button>
          <div className="rail-quiet"><span className={`connection-dot ${online ? "is-online" : "is-offline"}`}/>{online ? "Mit deinem Workspace verbunden" : "Offline · lokale Kopie"}</div>
          <button className="user-chip" onClick={() => nav("settings")}><span className="user-avatar">M</span><span><b>Marcel</b><small>Persönlicher Workspace</small></span><MoreHorizontal size={17}/></button>
        </div>
      </aside>
      <main className="main-shell">
        <header className="topbar"><div className="topbar-context"><span className="context-root">CreatorOS</span><ChevronRight size={14}/><b>{headerLabel}</b></div><div className="topbar-actions"><div className={`sync-status ${online ? "" : "offline"}`}><span className="connection-dot"/>{online ? "Synchronisiert" : "Offline"}</div>{installPrompt && <button className="install-button" onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); }}>Installieren</button>}<button className="top-quick" onClick={() => setQuickCapture(true)}><Plus size={16}/> Idee festhalten</button></div></header>
        <div className="screen-stage">
          {screen === "today" && <TodayScreen data={data} project={focusProject} session={session} clock={clock} busy={busy} onStart={() => void startSession()} onResume={() => session ? go("focus") : void startSession()} onChooseProject={(id) => void updateProject(id, { active: true })} onEditAction={(nextAction) => focusProject && void updateProject(focusProject.id, { nextAction })} onOpenProjects={() => nav("projects")} onCapture={() => setQuickCapture(true)} onIdeas={() => nav("ideas")} onProject={(id) => { setSelectedProjectId(id); nav("project"); }} />}
          {screen === "projects" && <ProjectsScreen data={data} onCreate={() => void createProject()} onOpen={(id) => { setSelectedProjectId(id); nav("project"); }} onStart={(id) => void startSession(id)} />}
          {screen === "project" && project && <ProjectScreen project={project} session={session} onBack={() => nav("projects")} onStart={() => void startSession(project.id)} onNextAction={(nextAction) => void updateProject(project.id, { nextAction })} onScript={() => nav("script")} onKanban={() => nav("kanban")} onContext={() => setContextOpen(!contextOpen)} contextOpen={contextOpen} onStatus={(pipeline) => void updateProject(project.id, { pipeline })} />}
          {screen === "ideas" && <IdeasScreen data={data} onCapture={() => setQuickCapture(true)} onConvert={(id) => void convertIdea(id)} onProject={(id) => { setSelectedProjectId(id); nav("project"); }} />}
          {screen === "kanban" && <KanbanScreen data={data} mobileColumn={mobileColumn} setMobileColumn={setMobileColumn} onMove={(id, pipeline) => void updateProject(id, { pipeline })} onOpen={(id) => { setSelectedProjectId(id); nav("project"); }} />}
          {screen === "script" && project && <ScriptScreen project={project} onBack={() => nav("project")} onSave={(scripts) => void updateProject(project.id, { scripts })} />}
          {screen === "settings" && <SettingsScreen data={data} online={online} haState={haState} onBuildDay={(day) => void saveBuildDay(day)} onRestore={(state) => applyState(state)} onNotify={notify} />}
        </div>
        <nav className="mobile-nav" aria-label="Mobile Navigation">
          <NavButton icon={<Home/>} label="Heute" active={screen === "today"} onClick={() => nav("today")}/>
          <NavButton icon={<FolderOpen/>} label="Projekte" active={screen === "projects" || screen === "project" || screen === "script"} onClick={() => nav("projects")}/>
          <button className="mobile-capture" aria-label="Idee festhalten" onClick={() => setQuickCapture(true)}><Plus size={24}/></button>
          <NavButton icon={<Inbox/>} label="Ideen" active={screen === "ideas"} onClick={() => nav("ideas")}/>
          <NavButton icon={<Menu/>} label="Mehr" active={screen === "kanban" || screen === "settings"} onClick={() => nav(screen === "settings" ? "kanban" : "settings")}/>
        </nav>
      </main>
    </div> : <div className="focus-shell">
      {screen === "focus" && focusProject && <FocusScreen project={focusProject} session={session} clock={clock} busy={busy} onPause={() => void setPause(!session?.isPaused)} onFinish={() => go("session-end")} onExtend={() => void extendSession()} onExit={() => go("today")}/>}
      {screen === "session-end" && focusProject && <SessionEndScreen project={focusProject} session={session} value={sessionNext} setValue={setSessionNext} busy={busy} onSave={() => void finishSession(sessionNext)} onSkip={() => void finishSession("")}/>}
    </div>}
    {quickCapture && <QuickCapture projects={data.projects} onClose={() => setQuickCapture(false)} onSave={onQuickCaptureSave} onNotify={notify}/>}
    <div className={`toast ${toast ? "toast-visible" : ""}`} role="status" aria-live="polite">{toast}</div>
  </>;

  async function convertIdea(ideaId: string) {
    const result = await mutate("/api/ideas", "PATCH", { id: ideaId, convert: true });
    if (result?.result?.convertedProjectId) { setSelectedProjectId(result.result.convertedProjectId); go("project"); notify("Deine Idee ist jetzt ein Projekt."); }
  }

  async function saveBuildDay(day: string) {
    const current = stateRef.current;
    if (!current) return;
    if (!navigator.onLine) { notify("Der Build-Tag kann offline nicht synchronisiert werden. Versuch es, sobald du wieder verbunden bist."); return; }
    const next = { ...current, buildDay: day };
    applyState(next);
    try {
      const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ buildDay: day }) });
      const payload = await responseState(response) as { state: CreatorState };
      applyState(payload.state);
      notify("Build-Tag gespeichert.");
    } catch { notify("Build-Tag lokal gespeichert · wird später synchronisiert."); }
  }
}

function NavButton({ icon, label, active, onClick, count }: { icon: ReactNode; label: string; active: boolean; onClick: () => void; count?: number }) {
  return <button className={`nav-link ${active ? "nav-link-active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}><span className="nav-icon">{icon}</span><span>{label}</span>{typeof count === "number" && <span className="nav-count">{count}</span>}</button>;
}

function ScreenHeading({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="screen-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action}</div>;
}

function TodayScreen({ data, project, session, clock, busy, onStart, onResume, onChooseProject, onEditAction, onOpenProjects, onCapture, onIdeas, onProject }: { data: CreatorState; project: Project | null; session: Session | null; clock: number; busy: boolean; onStart: () => void; onResume: () => void; onChooseProject: (id: string) => void; onEditAction: (action: string) => void; onOpenProjects: () => void; onCapture: () => void; onIdeas: () => void; onProject: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project?.nextAction || "");
  const [chooseOpen, setChooseOpen] = useState(false);
  useEffect(() => { setDraft(project?.nextAction || ""); setEditing(false); }, [project?.id, project?.nextAction]);
  const lastSession = data.sessions.find((item) => item.endedAt);
  const longPause = project && clock - Date.parse(project.lastTouchedAt) > 21 * 24 * 60 * 60 * 1000;
  const today = new Date(clock).toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" });
  const isBuildDay = new Date(clock).toLocaleDateString("de-AT", { weekday: "long" }).toLocaleLowerCase("de") === data.buildDay.toLocaleLowerCase("de");
  return <section className="today-screen">
    <ScreenHeading eyebrow={`${isBuildDay ? "DEIN BUILD DAY" : "HEUTE"} · ${today}`} title={longPause ? "Willkommen zurück." : session ? "Du bist schon mittendrin." : "Woran machst du weiter?"} detail={longPause ? "Hier hast du aufgehört. Dein nächster Schritt liegt bereit." : isBuildDay ? "Dein nächster Schritt ist vorbereitet." : "Ein kleiner Anfang reicht für heute."} action={<button className="quiet-action" onClick={onCapture}><Plus size={16}/> Idee festhalten</button>}/>
    {project ? <div className="today-layout"><article className="resume-card">
      <div className="resume-overline"><span className="project-mark">{project.title.slice(0, 1).toUpperCase()}</span><span>{project.title}</span><span className="resume-separator">·</span><span className="resume-stage">{columns.find((column) => column.id === project.pipeline)?.label || "In Arbeit"}</span>{longPause && <span className="return-pill">Zuletzt geöffnet</span>}</div>
      <div className="action-block"><span className="action-label">DEIN NÄCHSTER SCHRITT</span>{editing ? <textarea className="action-editor" value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus aria-label="Nächsten Schritt bearbeiten"/> : <h2>{project.nextAction || "Lege einen kleinen nächsten Schritt fest."}</h2>}
        <div className="action-tools">{editing ? <><button className="button-primary" onClick={() => { onEditAction(draft); setEditing(false); }}>Speichern</button><button className="button-ghost" onClick={() => { setDraft(project.nextAction); setEditing(false); }}>Abbrechen</button></> : <button className="text-action" onClick={() => setEditing(true)}>Nächsten Schritt ändern</button>}</div>
      </div>
      <div className="resume-last"><Clock3 size={15}/><span>{session ? "Session läuft seit" : "Zuletzt weitergemacht"} {session ? formatTime(elapsedFor(session)) : lastSession?.endedAt ? localDate(lastSession.endedAt) : "Hier geht es weiter."}</span>{project.lastProgress && <><span className="bullet-separator">·</span><span>{project.lastProgress}</span></>}</div>
      <div className="resume-controls"><button className="start-button" onClick={session ? onResume : onStart} disabled={busy}><Play size={17} fill="currentColor"/>{session ? "WEITERMACHEN" : "10 MINUTEN STARTEN"}<ArrowRight size={17}/></button><button className="project-switch" onClick={() => setChooseOpen(!chooseOpen)}>Anderes Projekt wählen <ChevronDown size={15}/></button></div>
      {chooseOpen && <div className="project-picker">{data.projects.filter((item) => item.status === "active").map((item) => <button key={item.id} onClick={() => { onChooseProject(item.id); onProject(item.id); setChooseOpen(false); }}><span>{item.title}</span>{item.id === project.id && <Check size={16}/>}</button>)}</div>}
      <p className="minimum-note"><span className="minimum-ring">10</span><span><b>10-Minuten-Minimum</b><small>Danach entscheidest du, ob du weiterarbeitest.</small></span></p>
    </article>
    <aside className="today-side"><div className="quiet-context"><span className="context-icon"><Sparkles size={16}/></span><div><b>Dein Einstieg ist vorbereitet</b><p>Beim letzten Mal hast du „{project.lastProgress || "hier"}“ gemacht. Die nächste Handlung ist schon notiert.</p></div></div><button className="recent-project" onClick={onOpenProjects}><span className="recent-label">ZULETZT GEÖFFNET</span><span className="recent-title">{project.title}</span><span className="recent-meta">{project.summary || "Dein Projekt-Workspace"}<ChevronRight size={16}/></span></button><button className="subtle-link" onClick={onOpenProjects}>Alle Projekte ansehen <ArrowRight size={14}/></button>
      {data.ideas.length > 0 && <button className="inbox-peek" onClick={onIdeas}><span><Inbox size={16}/>{data.ideas.length} Ideen warten in deiner Inbox</span><ChevronRight size={15}/></button>}
    </aside></div> : <div className="empty-action"><div className="empty-icon"><Sparkles size={22}/></div><h2>Was würdest du gern anfangen?</h2><p>Erstelle ein Projekt mit einem ersten kleinen Schritt. Du kannst Details später ergänzen.</p><button className="start-button" onClick={onOpenProjects}><Plus size={17}/> ERSTES PROJEKT ANLEGEN</button></div>}
  </section>;
}

function ProjectsScreen({ data, onCreate, onOpen, onStart }: { data: CreatorState; onCreate: () => void; onOpen: (id: string) => void; onStart: (id: string) => void }) {
  const active = data.projects.filter((project) => project.status === "active");
  const paused = data.projects.filter((project) => project.status === "paused");
  return <section><ScreenHeading eyebrow="DEIN ARBEITSRAUM" title="Projekte" detail="Wähle ein Projekt oder mach mit dem zuletzt aktiven weiter." action={<button className="button-secondary" onClick={onCreate}><Plus size={16}/> Projekt anlegen</button>}/>
    <div className="project-list-full">{active.map((project, index) => <article className={`project-row ${index === 0 ? "project-row-active" : ""}`} key={project.id}><button className="project-row-main" onClick={() => onOpen(project.id)}><span className="project-row-mark">{project.title.slice(0, 1)}</span><span className="project-row-copy"><b>{project.title}</b><small>{project.nextAction}</small><span className="project-row-meta">{columns.find((column) => column.id === project.pipeline)?.label} · {project.lastProgress || "Noch kein Fortschritt notiert"}</span></span><ChevronRight size={17}/></button><button className="project-row-start" onClick={() => onStart(project.id)}><Play size={15} fill="currentColor"/> Starten</button></article>)}
    {paused.length > 0 && <><div className="subsection-title">PAUSIERT</div>{paused.map((project) => <button className="project-row paused-row" key={project.id} onClick={() => onOpen(project.id)}><span className="project-row-mark">{project.title.slice(0, 1)}</span><span className="project-row-copy"><b>{project.title}</b><small>{project.nextAction}</small></span><ChevronRight size={17}/></button>)}</>}
    {active.length === 0 && paused.length === 0 && <div className="empty-state"><FolderOpen size={22}/><b>Noch kein Projekt hier.</b><span>Starte mit dem kleinsten Schritt, den du schon kennst.</span><button className="button-primary" onClick={onCreate}>Projekt anlegen</button></div>}</div>
  </section>;
}

function ProjectScreen({ project, session, onBack, onStart, onNextAction, onScript, onKanban, onContext, contextOpen, onStatus }: { project: Project; session: Session | null; onBack: () => void; onStart: () => void; onNextAction: (value: string) => void; onScript: () => void; onKanban: () => void; onContext: () => void; contextOpen: boolean; onStatus: (pipeline: Project["pipeline"]) => void }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(project.nextAction);
  useEffect(() => { setDraft(project.nextAction); }, [project.id, project.nextAction]);
  return <section className="project-workspace"><button className="back-link" onClick={onBack}><ArrowLeft size={15}/> Projekte</button><div className="project-title-block"><div><div className="eyebrow">PROJEKT · {columns.find((column) => column.id === project.pipeline)?.label}</div><h1>{project.title}</h1><p>{project.summary}</p></div><button className="button-primary" onClick={onStart}><Play size={16} fill="currentColor"/>{session ? "Session fortsetzen" : "10 Minuten starten"}</button></div>
    <div className="project-tabs"><button className="project-tab active">Überblick</button><button className="project-tab" onClick={onScript}><FileText size={15}/> Skript</button><button className="project-tab" onClick={onContext}><BookOpen size={15}/> Material <span>{project.materials.length}</span></button><button className="project-tab" onClick={onKanban}><LayoutGrid size={15}/> Pipeline</button></div>
    <div className="project-content-grid"><div className="project-content-main"><article className="next-action-panel"><div className="panel-title"><span className="action-label">NÄCHSTE HANDLUNG</span><button className="icon-quiet" aria-label="Bearbeiten" onClick={() => setEdit(!edit)}><Settings2 size={16}/></button></div>{edit ? <><textarea className="action-editor" value={draft} onChange={(event) => setDraft(event.target.value)}/><button className="button-primary compact" onClick={() => { onNextAction(draft); setEdit(false); }}>Speichern</button></> : <h2>{project.nextAction}</h2>}<div className="panel-actions"><button className="button-primary" onClick={onStart}><Play size={15} fill="currentColor"/> Weitermachen</button><button className="button-ghost" onClick={() => { setDraft(project.nextAction); setEdit(true); }}>Nächsten Schritt ändern</button></div></article>
      <div className="project-summary-grid"><article className="detail-card"><span className="detail-icon"><FileText size={17}/></span><b>{project.scripts.length} Skript-Abschnitte</b><small>{project.scripts.filter((script) => script.done).length} abgeschlossen</small><button onClick={onScript}>Skript öffnen <ArrowRight size={13}/></button></article><article className="detail-card"><span className="detail-icon"><FolderOpen size={17}/></span><b>{project.materials.length} Materialdateien</b><small>Für dieses Projekt gesammelt</small><button onClick={onContext}>Material ansehen <ArrowRight size={13}/></button></article></div>
      <article className="last-progress-card"><span className="action-label">ZULETZT WEITERGEMACHT</span><p>{project.lastProgress || "Für diesen Abschnitt gibt es noch keinen gespeicherten Fortschritt."}</p><small>Dein Wiedereinstieg bleibt hier notiert.</small></article></div>
      <aside className={`project-context ${contextOpen ? "context-open" : ""}`}><div className="context-heading"><div><span className="action-label">KONTEXT</span><h3>Damit du nicht suchen musst</h3></div><button className="icon-quiet" onClick={onContext} aria-label="Kontext schließen"><X size={16}/></button></div><div className="context-field"><label>Pipeline-Status</label><select value={project.pipeline} onChange={(event) => onStatus(event.target.value as Project["pipeline"])}>{columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></div><div className="context-field"><label>Was du zuletzt gemacht hast</label><p>{project.lastProgress || "Noch nichts notiert."}</p></div><div className="context-field"><label>Dein Material</label>{project.materials.length ? project.materials.map((item) => <div className="material-mini" key={item.id}><span><FileText size={14}/></span><div><b>{item.name}</b><small>{item.note}</small></div></div>) : <p>Material kann später ergänzt werden.</p>}</div></aside>
    </div></section>;
}

function IdeasScreen({ data, onCapture, onConvert, onProject }: { data: CreatorState; onCapture: () => void; onConvert: (id: string) => void; onProject: (id: string) => void }) {
  const linked = (id: string | null) => id ? data.projects.find((project) => project.id === id) : null;
  return <section><ScreenHeading eyebrow="IDEEN-INBOX" title="Hier musst du noch nichts sortieren." detail="Halt die Idee einfach fest. Einordnen kannst du sie später." action={<button className="button-primary" onClick={onCapture}><Plus size={16}/> Idee festhalten</button>}/>
    <div className="idea-inbox">{data.ideas.length ? data.ideas.map((idea) => <article className="idea-card" key={idea.id}><div className="idea-card-top"><span className="idea-origin">{idea.pending ? "LOKAL · WARTET AUF SYNC" : "IDEA INBOX"}</span><time>{new Intl.DateTimeFormat("de-AT", { day: "numeric", month: "short" }).format(new Date(idea.createdAt))}</time></div><p>{idea.text}</p><div className="idea-card-actions">{linked(idea.projectId) ? <button className="button-ghost" onClick={() => onProject(idea.projectId!)}>{linked(idea.projectId)?.title}<ArrowRight size={13}/></button> : <span className="idea-unassigned">Noch keinem Projekt zugeordnet</span>}<button className="text-action" onClick={() => onConvert(idea.id)}>Als Projekt starten <ArrowRight size={14}/></button></div></article>) : <div className="empty-state"><Inbox size={22}/><b>Noch keine Ideen.</b><span>Wenn dir etwas einfällt, wirf es einfach hier rein. Sortieren kannst du später.</span><button className="button-primary" onClick={onCapture}><Plus size={15}/> Idee festhalten</button></div>}</div>
  </section>;
}

function KanbanScreen({ data, mobileColumn, setMobileColumn, onMove, onOpen }: { data: CreatorState; mobileColumn: string; setMobileColumn: (id: string) => void; onMove: (projectId: string, column: Project["pipeline"]) => void; onOpen: (id: string) => void }) {
  const [dragging, setDragging] = useState("");
  const shownColumns = columns;
  return <section><ScreenHeading eyebrow="PRODUKTIONSÜBERSICHT" title="Content Pipeline" detail="Dein Produktionsfluss. Auf dem Handy eine Spalte nach der anderen."/>
    <div className="mobile-column-select"><label htmlFor="pipeline-column">Spalte ansehen</label><select id="pipeline-column" value={mobileColumn} onChange={(event) => setMobileColumn(event.target.value)}>{columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select><ChevronDown size={16}/></div>
    <div className="kanban-board">{shownColumns.map((column) => { const cards = data.projects.filter((item) => item.pipeline === column.id && item.status === "active"); return <section className={`kanban-column ${column.id === mobileColumn ? "mobile-column-active" : ""} ${dragging ? "column-drop-ready" : ""}`} key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id) onMove(id, column.id); setDragging(""); }}><div className="kanban-column-header"><span className={`kanban-dot ${column.id}`}/><b>{column.label}</b><span>{cards.length}</span><button aria-label={`Optionen für ${column.label}`}><MoreHorizontal size={15}/></button></div>{cards.map((card) => <article className={`kanban-card ${dragging === card.id ? "card-dragging" : ""}`} key={card.id} draggable onDragStart={(event) => { event.dataTransfer.setData("text/plain", card.id); setDragging(card.id); }} onDragEnd={() => setDragging("")}><button className="kanban-open" onClick={() => onOpen(card.id)}><span className="kanban-card-label">{column.label.toLocaleUpperCase("de")}</span><b>{card.title}</b><small>{card.nextAction}</small><span className="kanban-card-bottom"><span>{card.scripts.length} Script-Abschnitte</span><ChevronRight size={14}/></span></button><label className="move-card">Verschieben <select aria-label={`${card.title} verschieben`} value={card.pipeline} onChange={(event) => onMove(card.id, event.target.value as Project["pipeline"])}>{columns.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></article>)}{cards.length === 0 && <div className="column-empty">Noch nichts hier.</div>}</section>; })}</div>
  </section>;
}

function ScriptScreen({ project, onBack, onSave }: { project: Project; onBack: () => void; onSave: (scripts: ScriptSection[]) => void }) {
  const [selected, setSelected] = useState(project.scripts[0]?.id || "");
  const [draft, setDraft] = useState<ScriptSection[]>(project.scripts);
  const [contextOpen, setContextOpen] = useState(false);
  const current = draft.find((item) => item.id === selected) || draft[0];
  useEffect(() => { setDraft(project.scripts); setSelected(project.scripts[0]?.id || ""); }, [project.id]);
  const update = (id: string, fields: Partial<ScriptSection>) => setDraft((items) => items.map((item) => item.id === id ? { ...item, ...fields } : item));
  const add = () => { const section = { id: crypto.randomUUID(), title: `Neuer Abschnitt ${draft.length + 1}`, body: "", done: false }; setDraft((items) => [...items, section]); setSelected(section.id); };
  return <section><button className="back-link" onClick={onBack}><ArrowLeft size={15}/> {project.title}</button><ScreenHeading eyebrow="PROJEKT · SKRIPT" title="Gedanken, bereit für die Kamera." detail="Arbeite an einem Abschnitt. Der Rest bleibt aus dem Weg." action={<div className="screen-action-group"><button className="button-secondary" onClick={() => setContextOpen(!contextOpen)}><BookOpen size={15}/> Material</button><button className="button-primary" onClick={() => { onSave(draft); }}><Check size={15}/> Änderungen speichern</button></div>}/>
    <div className="script-workspace"><aside className="script-outline"><div className="script-outline-head"><span className="action-label">STORY-STRUKTUR</span><span>{draft.filter((item) => item.done).length}/{draft.length}</span></div>{draft.map((item, index) => <button className={`script-section ${item.id === current?.id ? "script-section-active" : ""}`} key={item.id} onClick={() => setSelected(item.id)}><span className={`section-number ${item.done ? "section-done" : ""}`}>{item.done ? <Check size={13}/> : String(index + 1).padStart(2, "0")}</span><span><b>{item.title}</b><small>{item.done ? "Fertig" : "Noch offen"}</small></span></button>)}<button className="add-section" onClick={add}><Plus size={15}/> Abschnitt hinzufügen</button></aside>
      <article className="script-editor">{current ? <><div className="script-edit-top"><label className="action-label" htmlFor="script-title">ABSCHNITT</label><label className="script-done-toggle"><input type="checkbox" checked={current.done} onChange={(event) => update(current.id, { done: event.target.checked })}/> Fertig</label></div><input id="script-title" className="script-title-input" value={current.title} onChange={(event) => update(current.id, { title: event.target.value })}/><textarea className="script-body-input" value={current.body} onChange={(event) => update(current.id, { body: event.target.value })} placeholder="Was soll hier passieren? Stichpunkte reichen."/><div className="script-context-hint"><CircleHelp size={15}/> Erst die Idee festhalten. Formulieren kannst du später.</div></> : <div className="empty-script"><BookOpen size={23}/><b>Noch keine Abschnitte.</b><span>Mach den ersten Gedanken greifbar.</span><button className="button-primary" onClick={add}><Plus size={14}/> Ersten Abschnitt anlegen</button></div>}</article>
      <aside className={`script-context ${contextOpen ? "context-open" : ""}`}><div className="context-heading"><div><span className="action-label">KONTEXT</span><h3>Material für diesen Abschnitt</h3></div><button className="icon-quiet" onClick={() => setContextOpen(!contextOpen)} aria-label="Kontext schließen"><X size={16}/></button></div>{project.materials.map((item) => <div className="material-mini" key={item.id}><span><FileText size={14}/></span><div><b>{item.name}</b><small>{item.note}</small></div></div>)}<button className="text-action" onClick={() => setContextOpen(!contextOpen)}><Plus size={14}/> Material auswählen</button></aside></div>
      <div className="script-mobile-save"><button className="button-primary" onClick={() => onSave(draft)}><Check size={15}/> Änderungen speichern</button></div>
    </section>;
}

function FocusScreen({ project, session, clock: _clock, busy, onPause, onFinish, onExtend, onExit }: { project: Project; session: Session | null; clock: number; busy: boolean; onPause: () => void; onFinish: () => void; onExtend: () => void; onExit: () => void }) {
  const elapsed = session ? elapsedFor(session) : 0;
  const remaining = session ? Math.max(0, session.durationMinutes * 60 - elapsed) : 0;
  const ratio = session ? Math.min(1, elapsed / (session.durationMinutes * 60)) : 0;
  const minimumMet = elapsed >= (session?.minimumMinutes || 10) * 60;
  return <main className="focus-view"><div className="focus-top"><button className="focus-brand" onClick={onExit}><span className="brand-symbol">▶</span> CreatorOS</button><button className="focus-exit" onClick={onExit}><X size={15}/> Fokus verlassen</button></div><section className="focus-center"><div className="eyebrow"><span className="connection-dot is-online"/>{session?.isPaused ? "SESSION PAUSIERT" : "DEIN FOKUS"}</div><p className="focus-project">{project.title}</p><h1>{project.nextAction}</h1><div className="focus-clock" style={{ "--progress": `${ratio * 100}%` } as CSSProperties}><div className="focus-clock-inner"><strong>{formatTime(remaining)}</strong><span>{session?.isPaused ? "Pausiert" : minimumMet ? "Minimum geschafft" : "10-Minuten-Minimum"}</span></div></div><div className="focus-buttons"><button className="focus-button-main" onClick={onPause} disabled={busy}>{session?.isPaused ? <Play size={17} fill="currentColor"/> : <Pause size={17} fill="currentColor"/>}{session?.isPaused ? "Weiter" : "Pause"}</button><button className="focus-button-done" onClick={onFinish} disabled={busy}><Square size={15} fill="currentColor"/> Fertig</button></div>{minimumMet && <div className="minimum-reached"><span><Check size={16}/></span><div><b>Minimum geschafft.</b><small>Du hast angefangen. Das zählt.</small></div><button onClick={onFinish}>Für heute fertig</button><button onClick={onExtend}>+25 Minuten</button></div>}<div className="focus-session-meta"><span>{project.lastProgress ? `Zuletzt: ${project.lastProgress}` : "Du kannst jederzeit aufhören oder weitermachen."}</span><span>{session ? `${Math.floor(elapsed / 60)} Min. gearbeitet` : ""}</span></div></section><div className="focus-bottom"><span>Nur diese Aufgabe. Kein anderer Bereich wird dich hier stören.</span><button onClick={onExit}>Session läuft im Hintergrund weiter</button></div></main>;
}

function SessionEndScreen({ project, session, value, setValue, busy, onSave, onSkip }: { project: Project; session: Session | null; value: string; setValue: (value: string) => void; busy: boolean; onSave: () => void; onSkip: () => void }) {
  return <main className="session-end-view"><div className="session-end-brand"><span className="brand-symbol">▶</span> CreatorOS</div><section className="session-end-card"><span className="session-check"><Check size={20}/></span><div className="eyebrow">SESSION ABSCHLIESSEN</div><h1>{project.title}</h1><p className="end-duration"><Clock3 size={15}/>{session ? `${Math.max(1, Math.floor(elapsedFor(session) / 60))} Minuten Fokus` : "Dein Schritt für heute ist getan."}</p><label htmlFor="next-after">Was ist beim nächsten Mal dran?</label><textarea id="next-after" value={value} onChange={(event) => setValue(event.target.value)} placeholder="z. B. Den Cut nach der Fundstelle setzen"/><button className="button-primary end-save" onClick={onSave} disabled={busy}><Check size={16}/> Nächsten Schritt speichern</button><button className="text-action end-skip" onClick={onSkip} disabled={busy}>Fertig ohne Änderung</button></section><p className="end-soft-note">Du hast die Arbeit ein Stück weitergebracht. Hier wartet dein Wiedereinstieg.</p></main>;
}

function QuickCapture({ projects, onClose, onSave, onNotify }: { projects: Project[]; onClose: () => void; onSave: (text: string, projectId?: string) => void; onNotify: (message: string) => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [projectId, setProjectId] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  useEffect(() => { input.current?.focus(); return () => recognition.current?.stop(); }, []);
  const speak = () => {
    const browser = window as unknown as { SpeechRecognition?: new() => SpeechRecognitionLike; webkitSpeechRecognition?: new() => SpeechRecognitionLike };
    const SpeechRecognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!SpeechRecognition) { onNotify("Spracheingabe ist in diesem Browser nicht verfügbar. Du kannst die Idee eintippen."); return; }
    const instance = new SpeechRecognition();
    instance.lang = "de-AT";
    instance.interimResults = false;
    instance.onresult = (event) => { const phrase = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" "); setText((current) => `${current}${current ? " " : ""}${phrase}`); };
    instance.onerror = () => { setListening(false); onNotify("Die Spracheingabe konnte nicht gestartet werden."); };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    setListening(true);
    try { instance.start(); } catch { setListening(false); onNotify("Die Mikrofonfreigabe ist noch nicht verfügbar."); }
  };
  const submit = () => { if (!text.trim()) { input.current?.focus(); return; } onSave(text.trim(), projectId || undefined); setText(""); };
  return <div className="capture-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="capture-dialog" role="dialog" aria-modal="true" aria-labelledby="capture-title"><div className="capture-top"><div><div className="eyebrow">SCHNELL FESTHALTEN</div><h2 id="capture-title">Was ist dir gerade eingefallen?</h2></div><button className="capture-close" onClick={onClose} aria-label="Schließen"><X size={19}/></button></div><textarea ref={input} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit(); if (event.key === "Escape") onClose(); }} placeholder="Ein Satz reicht. Sortieren kannst du später." rows={4}/><div className="capture-options"><button className={`voice-button ${listening ? "voice-listening" : ""}`} onClick={speak}><AudioLines size={16}/>{listening ? "Höre zu …" : "Sprechen"}</button><label className="capture-project"><span>Projekt (optional)</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Später entscheiden</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label></div><div className="capture-footer"><span>Landet in deiner Ideen-Inbox</span><button className="button-primary capture-save" onClick={submit} disabled={!text.trim()}><Check size={16}/> Speichern</button></div></section></div>;
}

function SettingsScreen({ data, online, haState, onBuildDay, onRestore, onNotify }: { data: CreatorState; online: boolean; haState: string; onBuildDay: (day: string) => void; onRestore: (state: CreatorState) => void; onNotify: (message: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const restore = async (file?: File) => {
    if (!file) return;
    try {
      const response = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
      const result = await responseState(response) as { state: CreatorState };
      onRestore(result.state);
      onNotify("Deine CreatorOS-Sicherung ist wiederhergestellt.");
    } catch (error) { onNotify(error instanceof Error ? error.message : "Die Sicherung konnte nicht gelesen werden."); }
    if (fileInput.current) fileInput.current.value = "";
  };
  return <section><ScreenHeading eyebrow="DEIN WORKSPACE" title="Mehr Ruhe, weniger Pflege." detail="CreatorOS bleibt einfach und gehört dir."/>
    <div className="settings-list"><article className="settings-card"><div className="settings-card-icon"><Clock3 size={17}/></div><div className="settings-copy"><b>Dein Build Day</b><small>CreatorOS zeigt dir dann deinen vorbereiteten nächsten Schritt.</small></div><select value={data.buildDay} onChange={(event) => onBuildDay(event.target.value)}>{["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"].map((day) => <option key={day}>{day}</option>)}</select></article>
      <article className="settings-card"><div className="settings-card-icon"><ArrowDownLeft size={17}/></div><div className="settings-copy"><b>Deine Daten</b><small>Projekte, Ideen und Sessions liegen gemeinsam im CreatorOS-Datenordner.</small></div><a className="button-secondary" href="/api/backup"><FileText size={15}/> Sicherung herunterladen</a></article>
      <article className="settings-card"><div className="settings-card-icon"><RotateCcw size={17}/></div><div className="settings-copy"><b>Sicherung wiederherstellen</b><small>Eine CreatorOS-JSON-Sicherung zurückspielen.</small></div><input ref={fileInput} type="file" accept="application/json,.json" className="visually-hidden" onChange={(event) => void restore(event.target.files?.[0])}/><button className="button-secondary" onClick={() => fileInput.current?.click()}>Datei wählen</button></article>
      <article className="settings-card"><div className="settings-card-icon"><Sparkles size={17}/></div><div className="settings-copy"><b>Home Assistant</b><small>{haState === "connected" ? "CreatorOS kann HA-Ereignisse auslösen." : "Optional · CreatorOS funktioniert auch ohne Home Assistant."}</small></div><span className={`service-status ${haState === "connected" ? "service-ready" : ""}`}><i/>{haState === "connected" ? "Verbunden" : online ? "Nicht eingerichtet" : "Offline"}</span></article>
      <article className="integration-explainer"><b>Build startet da, wo du arbeitest.</b><p>Home Assistant kann mit `creatoros_session_started` auf eine Session reagieren. Geräte und Automationen bleiben in Home Assistant konfiguriert. CreatorOS speichert seine Daten getrennt davon.</p></article>
    </div>
  </section>;
}
