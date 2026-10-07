# CreatorOS

CreatorOS ist ein persönlicher Start- und Produktionsassistent: Er zeigt die vorbereitete nächste Handlung, hält spontane Ideen fest und macht den Wiedereinstieg in ein Projekt leicht. Ziel ist mehr Arbeit an den Projekten und weniger Pflege der App.

## Architektur

- Next.js App Router, React und TypeScript; eine responsive PWA für Desktop und Smartphone.
- Ein Node.js-API-Server ist die gemeinsame Datenquelle für alle Geräte.
- JSON-Zustand in `CREATOROS_DATA_DIR/creatoros.json`, atomar geschrieben. Home Assistant führt keine CreatorOS-Daten.
- Home Assistant Add-on unter `HA_Addon/creatoros`: HA Ingress, separates persistentes `/data`-Volume und optionale Supervisor-Ereignisse.
- Offline kann der App-Shell-Cache geöffnet und eine Idee lokal vorgemerkt werden. Die Idee wird mit stabiler ID beim Wiederverbinden synchronisiert.
- Home Assistant und AI sind optionale Integrationen; der CreatorOS-Kern läuft unabhängig.

## UX-Konzept

Siehe [UX-DESIGN.md](UX-DESIGN.md) für Desktop-/Mobile-Wireframes, Kernabläufe, Screen-Priorität, Research-Grundlage und die eigene UX-Kritik. Home priorisiert **Weitermachen → Next Action → 10 Minuten starten**. Quick Capture hat keine Pflicht-Metadaten. Fokus blendet globale Navigation aus. Build-Day-Hinweise sind standardmäßig keine Push-Mitteilungen.

## Technische Referenzanalyse

`NotesApp` und `WH_Board` wurden nur lesend untersucht. Ihre Farben, Layouts und Bedienmuster sind keine CreatorOS-Designreferenz.

| Bereich | NotesApp | WH_Board | CreatorOS-Entscheidung |
|---|---|---|---|
| Kanban | React-Boards, Karten und HTML5-DnD | Produktionsstatus/HA-PWA | Eigener Content-Flow; Statusauswahl funktioniert mobil und Drag-and-Drop zusätzlich am Desktop |
| Notes / Ideen | Vollwertiger Notizeditor, Links, Markdown | Kein entsprechendes Kernmodul | Kleine Ideen-Inbox; Capture speichert erst, Einordnung bleibt optional |
| Persistenz | SQLite in Electron-App | JSON-Datei atomar im persistenten Datenordner; zentrale Poll-Synchronisierung | Versionierter JSON-Store, atomare Schreibvorgänge, Backup/Restore, eine zentrale Instanz |
| PWA | Web-App-Manifest/Assets vorhanden | Next.js Manifest und Service Worker | Installierbare PWA mit Shell-Cache, Reconnect und offline vorgemerkten Ideen |
| HA Hosting | Keine passende HA-Hosting-Architektur | HA-Add-on mit Next standalone, Ingress-Proxy und `/data`-Mapping | Eigenes Add-on, eigene Ingress-Konfiguration und CreatorOS-Design |
| HA API | Keine CreatorOS-Integration | HA API im Admin-Cockpit; WG-Web-App ohne CreatorOS-ähnliche Events | Supervisor REST Events optional; `/api/home-assistant/status` und sekretgeschützte Aktions-API |
| Mobile | responsive Notes-/Board-Oberflächen | eigene Touchregeln, PWA | Separate Mobile-Navigation, Vollbild-Capture, einzelner Kanban-Status, Safe Areas |
| Deployment | Windows/Electron-Paketierung | manueller Add-on-Export und manuelle GitHub-Desktop-Synchronisierung dokumentiert | `Build/`-Export, HA Add-on, Datendateien außerhalb des Repositories |
| Git | Referenzkopie ohne gemeinsame Änderungen | Im inspizierten Workspace-Snapshot kein Git-Metadatenverzeichnis; README beschreibt separaten GitHub-Ordner | Eigenständiger Export unter `Build/`, für GitHub Desktop vorbereitet |

## Lokal entwickeln

Voraussetzung: Node.js 22 oder neuer.

```powershell
npm install
npm run dev
```

CreatorOS läuft lokal auf `http://localhost:3000`. Daten werden im lokalen `data/`-Ordner angelegt. `data/`, Datenbanken, `.env`, Build-Ausgaben und Abhängigkeiten sind aus Git ausgeschlossen.

## Konfiguration

`.env.example` dokumentiert Optionen. Kopiere sie bei lokaler HA-Verbindung nach `.env.local` und fülle Secrets ausschließlich dort aus.

| Variable | Zweck |
|---|---|
| `CREATOROS_DATA_DIR` | Speicherordner für `creatoros.json`; Standard `./data`, Add-on `/data` |
| `SUPERVISOR_TOKEN` | Vom HA Add-on bereitgestelltes Token für optionale Ereignisse an HA; kein manuelles Secret eintragen |
| `HOME_ASSISTANT_URL` / `HOME_ASSISTANT_TOKEN` | Optionale externe HA-Verbindung außerhalb des Add-ons |
| `HOME_ASSISTANT_SHARED_SECRET` | Optionales Bearer-Secret für eingehende HA-Aktionen; im Add-on in den App-Optionen setzen |

## PWA / Mobile

Auf einem HTTPS-Host oder `localhost` im Browser öffnen und **Zum Startbildschirm hinzufügen** verwenden. Quick Capture und die letzte App-Shell bleiben nach einem Verbindungsabbruch erreichbar; Ideen werden lokal vorgemerkt und beim Reconnect synchronisiert. Serverdaten und Fokus-Session benötigen zur Synchronisierung eine Verbindung zum CreatorOS-Host. Im HA-WebView steht die Add-on-Ansicht über Ingress bereit; für eine eigenständige PWA-Installation braucht das Smartphone eine sichere, direkt erreichbare CreatorOS-URL.

HA Add-on-Port `3000/tcp` bleibt standardmäßig deaktiviert. Wenn er eingeschaltet wird, ist der direkte Zugriff nicht durch die HA-Ingress-Anmeldung geschützt; nur im vertrauenswürdigen Heimnetz freigeben und über TLS/VPN absichern, falls er von außerhalb erreichbar sein soll.

## Home Assistant

Das Add-on stellt bereit:

- `creatoros_session_started`, `creatoros_session_finished` und `creatoros_session_extended` Events, wenn die Supervisor-API verfügbar ist.
- `GET /api/home-assistant/status` mit `build_day`, `session_active`, `current_project`, `next_action`, `session_elapsed` und `last_session`.
- `POST /api/home-assistant/actions` für `start`, `finish`, `extend`, `pause`, `resume`, `quick-note` und `build-mode`; Bearer-Secret erforderlich.

Beispiel für eine Automation:

```yaml
automation:
  - alias: CreatorOS – Build Session gestartet
    triggers:
      - trigger: event
        event_type: creatoros_session_started
    actions:
      - action: light.turn_on
        target:
          entity_id: light.office
```

Ein REST-Sensor kann `http://creatoros:3000/api/home-assistant/status` innerhalb des HA-Netzes abfragen. Geräteaktionen und Zeitpläne bleiben in Home Assistant. Keine CreatorOS-Ideen als HA-Helper-Datenbank duplizieren.

In HA unter **Einstellungen → Apps → Repositories** das später erstellte GitHub-Repository eintragen, App installieren und optional `home_assistant_shared_secret` in den Add-on-Optionen setzen. Nach dem Anlegen des GitHub-Repositories muss dessen URL in `repository.yaml` eingetragen werden. Der genaue interne Netzwerkpfad und Add-on-Build müssen an der persönlichen HA-Instanz einmalig geprüft werden; auf diesem Rechner ist kein HA-Supervisor konfiguriert.

## Build und Home-Assistant-Export

```powershell
npm run build
```

Der App-Build verwendet Next.js standalone. Dieser Ordner `Build/` ist die Repository-Wurzel für GitHub Desktop. Vor einem Add-on-Commit Quellcode in das Add-on-Paket kopieren:

```powershell
.\scripts\prepare-addon.ps1
```

Das Skript synchronisiert nur die App-Dateien nach `creatoros/app`; es lässt `.git`, lokale Daten und Abhängigkeiten in Ruhe. Home Assistant erwartet `repository.yaml` und `creatoros/config.yaml` direkt in dieser Repository-Wurzel.

## Daten, Backup, Update und Restore

- Produktionsdaten liegen außerhalb des App-Builds in `/data/creatoros.json`.
- **Mehr → Sicherung herunterladen** exportiert ein versioniertes JSON-Backup; Restore validiert Format und Schema und schreibt atomar.
- Für ein zusätzliches Host-Backup regelmäßig den persistenten HA-App-Ordner unter `/data` sichern und Restore nach Add-on-Neuinstallation über die UI ausführen.
- Schema-Änderungen bekommen eine neue `schemaVersion` und eine explizite Migration. Unbekannte Versionen werden abgelehnt, nicht überschrieben.
- Update: Quellcode ändern → UI-/API-Prüfung → `npm run build` → `scripts/prepare-addon.ps1` → GitHub Desktop Commit/Push → HA Add-on Repository aktualisieren → Add-on aktualisieren. `/data` bleibt als separates Volume erhalten.
- Ein neuer Quellcodebuild startet die App nicht ungefragt neu. Home Assistant zeigt die Add-on-Version als verfügbares Update an.

## GitHub Desktop

GitHub Desktop kann diesen Ordner als lokales Repository initialisieren und mit einem privaten GitHub-Repository verbinden. Wähle beim Erstellen eines Repositorys den Ordner `Build/` selbst aus. `repository.yaml` enthält bis dahin eine Platzhalter-URL; ersetze `OWNER` nach dem Anlegen des GitHub-Repositories durch deinen GitHub-Benutzernamen. Keine Secrets oder CreatorOS-Nutzerdaten committen.
