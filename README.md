# CreatorOS

CreatorOS ist ein persönlicher Start- und Produktionsassistent: Er zeigt die vorbereitete nächste Handlung, hält spontane Ideen fest und macht den Wiedereinstieg in ein Projekt leicht. Ziel ist mehr Arbeit an den Projekten und weniger Pflege der App.

## Architektur

- Next.js App Router, React und TypeScript; eine responsive PWA für Desktop und Smartphone.
- Ein Node.js-API-Server ist die gemeinsame Datenquelle für alle Geräte.
- JSON-Zustand in `CREATOROS_DATA_DIR/creatoros.json`, atomar geschrieben. Home Assistant führt keine CreatorOS-Daten.
- Home Assistant Add-on unter `creatoros/`: HA Ingress, separates persistentes `/data`-Volume und optionale Supervisor-Ereignisse. App-Quellcode und Add-on-Paket bleiben gemeinsam in diesem `Build`-Repository.
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
npm run dev -- --port 3100
```

CreatorOS läuft mit diesem Aufruf lokal auf `http://localhost:3100`; Port 3000 ist im gemeinsamen Workspace durch die WG-App belegt. Daten werden im lokalen `data/`-Ordner angelegt. `data/`, Datenbanken, `.env`, Build-Ausgaben und Abhängigkeiten sind aus Git ausgeschlossen.

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

In HA unter **Einstellungen → Apps → Repositories** `https://github.com/firebreakHD/CreOS` eintragen, App installieren und optional `home_assistant_shared_secret` in den Add-on-Optionen setzen. Die URL ist bereits in `repository.yaml` eingetragen. Der genaue interne Netzwerkpfad und Add-on-Build müssen an der persönlichen HA-Instanz einmalig geprüft werden; auf diesem Rechner ist kein HA-Supervisor konfiguriert.

## Brain und KI-Kontext

**Desktop → Brain** oder **Mobile → Mehr → Brain & KI-Kontext** öffnet den langfristigen Kontext.

1. **Brain-Datei importieren**: strukturierte JSON-Datei auswählen (maximal 512 KB). Verschachtelte Bereiche und Listen bleiben erhalten.
2. In der Vorschau neue, geänderte und unveränderte Bereiche prüfen. Nur ausgewählte Bereiche werden übernommen. Fehlende Bereiche werden nicht gelöscht; geänderte Bereiche ersetzen den jeweiligen ausgewählten Bereich vollständig.
3. **Brain exportieren** erzeugt eine portable Datei im Format `creatoros-brain`, Version 1. Erneuter Import desselben Inhalts erzeugt keine Duplikate.
4. Im Brain-Bereich Projekt und Frage wählen. **Kontext vorbereiten** verbindet Brain, aktuellen Projektstand, Aufgaben, Medienreferenzen, Planung, nächste Aufgabe, die letzten fünf abgeschlossenen Sessions und den vorübergehenden Zustand.
5. Kontext kopieren oder als Text herunterladen. Das Vorbereiten sendet keine Daten an einen Anbieter. Gespräche und ausdrücklich ausgewählte Bildreferenzen laufen über den schwebenden Assistenten rechts unten.

Brain liegt mit den App-Daten im persistenten Datenordner und ist in der normalen App-Sicherung enthalten. Ältere Sicherungen ohne Brain erhalten beim Einlesen einen leeren Brain-Bereich. Ein Brain-Import verändert keine Projekte, Sessions oder Aufgaben.

Der bereitgestellte Export mit `export_type: "creatoros_brain"` und `schema_version: "1.0"` wird direkt unterstützt. Profil-Unterbereiche und einzelne Projektgeschichten werden getrennte Einträge; Formatangaben werden nicht als Inhalt übernommen. Die bereitgestellte Datei ergibt neun Bereiche. Weitere strukturierte JSON-Exporte und CreatorOS-eigene Exporte werden ebenfalls akzeptiert. Bei generischem JSON bildet jeder oberste Inhaltsbereich einen Eintrag; bei einem reinen `brain`-/`data`-/`content`-Wrapper dessen Inhaltsbereiche. Stabile Bereichsschlüssel bzw. exportierte IDs ermöglichen spätere Updates.

API: `POST /api/brain` mit `action: "preview"` oder `action: "import"`; Import verwendet ausgewählte IDs und die Revision der Vorschau. `GET /api/brain?download=1` exportiert das Brain. `POST /api/ai/context` mit `projectId` und `question` liefert strukturierten Kontext und den kopierbaren Prompt. Importierte Hinweise werden als Kontextdaten behandelt, niemals als ausführbare Anweisungen.

## Integrationen, AI und Medien

Einstieg: **Einstellungen / Mehr → Integrationen**. Nicht eingerichtete Integrationen bleiben kompakte Setup-Karten. Zustände: nicht eingerichtet, verbunden, Verbindungsfehler, Konfiguration unvollständig. Der manuelle Kern bleibt ohne Integrationen nutzbar.

### AI & Codex

1. Als Anbieter OpenAI API-Key oder Codex-Abonnement wählen. Der Codex-Login nutzt den offiziellen Browser-/Device-Code-Flow; die Anmeldung wird isoliert gespeichert und nicht aus vorhandenen Codex-Dateien importiert.
2. Freigaben und Modus wählen. Direkte Anfragen laufen im schwebenden CreatorOS-Assistenten rechts unten; Position und Fenstergröße lassen sich in Einstellungen anpassen. Brain dient dem Import und der Vorbereitung kopierbarer Kontextdaten.
3. Bildreferenzen bei Bedarf ausdrücklich auswählen (PNG/JPEG/WebP/GIF, maximal drei, einzeln 6 MB, zusammen 10 MB).
4. Vorschläge prüfen und übernehmen/verwerfen. Alle Berechtigungen sind anfangs ausgeschaltet. **Nur Vorschläge** und **Vor Änderungen bestätigen** verändern Einträge erst beim Übernehmen. **Automatisch** führt erlaubte Aktionen aus; zusätzliche Bestätigung lässt sich je Freigabe aktivieren. Vorschläge laufen nach einer Stunde ab. Berechtigungsentzug und zwischenzeitlich veränderte Ziele verhindern die Bestätigung.

OpenAI nutzt die Responses API mit strukturiertem Function Calling (`store: false`); API-Nutzung wird separat abgerechnet. Codex läuft über den offiziellen `codex app-server` mit isoliertem Login und eng begrenzten CreatorOS-Aktionen. Es werden weder Shell-/Dateiwerkzeuge freigegeben noch vorhandene Codex-Login-Dateien importiert. Siehe [offizielle OpenAI-Authentifizierung](https://learn.chatgpt.com/docs/auth), [Function Calling](https://developers.openai.com/api/docs/guides/function-calling) und [Bildreferenzen](https://developers.openai.com/api/docs/guides/images-vision).

| Gemeinsame Action | Funktion |
|---|---|
| `createTask`, `updateTask`, `completeTask` | Aufgaben erstellen, bearbeiten, terminieren, Status ändern, zwischen Projekten verschieben und abschließen |
| `createContent`, `updateContent`, `scheduleContent` | Projekte/Content, Titel, Beschreibung, Caption, Hooks, Next Action, Skript, Pipeline und Veröffentlichungstermin |
| `createIdea` | Ideen speichern |
| `attachMedia`, `detachMedia` | Bestehende Media-ID als Asset, Referenz, Rohmaterial, Export oder Sonstiges zuordnen / Zuordnung entfernen |
| `uploadMedia` | KI-erstellte TXT-/JSON-Datei mit menschlichem Namen in den bevorzugten Speicher übertragen; Upload- und Zuordnungsfreigabe erforderlich |
| `createPlanning`, `updatePlanning` | Planungseinträge erstellen und bearbeiten |

UI und AI verwenden dieselbe serverseitige Action-Schicht. `/api/actions` nimmt manuelle Aktionen und Vorschlagsentscheidungen entgegen; ein vom Client angegebener AI-Aktor wird abgelehnt. `/api/ai/chat` ruft den Provider auf und prüft jedes Tool erneut. Maximal acht Aktionen und vier Modellrunden pro Anfrage. Importierte Brain-Texte und Bilder sind Referenzdaten und können keine Freigaben setzen.

### NAS / Medienspeicher

1. Auf der NAS eine SMB-Freigabe und einen Benutzer mit Lese-/Schreibzugriff anlegen.
2. Host/IP, Freigabename, Benutzer, Passwort und optionalen Unterordner in CreatorOS speichern. Der angegebene Unterordner ist der direkte Medien-Root; der UNC-Pfad wird angezeigt und kann für CapCut kopiert werden.
3. **Verbindung testen** prüft Zugriff und Schreibbarkeit im Root. Beim Anlegen eines Projekts werden darin der Projektordner und `Assets`, `Rohmaterial` sowie `Export` erstellt, ohne vorhandene Inhalte zu löschen.
4. Im Projekt **Material** Dateien im Browser ansehen, Ordner ergänzen oder umbenennen und Inhalte im Projekt verschieben. Uploads werden entsprechend ihrer Medienrolle einsortiert. Bei NAS werden Dateien dort gespeichert; ohne NAS im lokalen Datenordner `media/`.

Der Storage-Provider unterstützt `storeFile`, `getFile`, `deleteFile`, `moveFile`, Verzeichnislisten und Ordnererstellung. SMB arbeitet im Add-on über den beschränkten Python-Helfer und die SMB-Bibliothek; Zugangsdaten gehen nicht an den Browser und erscheinen nicht in Explorer-Pfaden. Absolute Pfade und Traversal werden abgelehnt. Dateiübertragung: maximal 500 MB, erlaubte Bild-/Video-/Audio-/PDF-/Text-/Office-/ZIP-Typen, keine ausführbaren Dateien oder HTML/SVG. Office/ZIP werden nicht ausgeführt oder entpackt. Alte WebDAV-Datensätze bleiben für bestehende Speicherreferenzen unterstützt.

Beispielstruktur direkt unter dem konfigurierten Root:

```text
LEGO – Oktober Comeback_a83fab/
  Assets/
    Images/2026-10-07_thumbnail_f31c9e22.jpg
  Rohmaterial/
    Video/2026-10-07_challenge_349d1f2a.mp4
  Export/
  Aufgaben/
    Assets/Documents/2026-10-07_Skript-Entwurf_c4d82a61.txt
```

Ordner und ursprüngliche Dateinamen bleiben lesbar; kurze IDs vermeiden Kollisionen. Projekt und Content nutzen bereits dasselbe Datenmodell, deshalb entsteht kein zweiter paralleler Content-Speicher.

**Referenzen:** Projekt/Aufgabe → Media-ID → Storage-Datensatz mit Provider, Speicher-ID und relativem Pfad. Beziehungen bleiben bei Projekt-/Aufgabenänderungen erhalten. `moveFile` bereitet spätere Umbenennung vor; eine Dateiverschiebe-UI ist noch nicht vorhanden. Externe Umbenennungen auf der NAS müssen später am Storage-Datensatz angepasst werden und werden nicht automatisch erkannt.

**Medienübersicht:** Suche nach Datei und Zuordnung, Typ-/Projektfilter, zusätzliche Zuordnungs-/Datumsfilter, Desktop Grid/Liste, mobil Grid. Entfernen löst die Zuordnung und behält die Datei. Trennen einer NAS löscht keine Dateien/Metadaten. Beim Wiederverbinden desselben Protokolls/Hosts/Ports/Basisordners erhalten alte Referenzen wieder Zugriff. Ein anderer Speicher übernimmt alte Pfade nicht automatisch.

### Zugangsdaten und Backups

App-State enthält ausschließlich zufällige Credential-Verweise. API-Schlüssel und NAS-Passwort liegen AES-256-GCM-verschlüsselt in `CREATOROS_DATA_DIR/integrations.vault.json`; der zufällige Schlüssel liegt separat in `integrations.key`. Im Add-on beides unter `/data`. Der Server muss darauf zugreifen können; die Verschlüsselung schützt nicht gegen einen vollständig kompromittierten Host. Frontend, Logs und normale JSON-Sicherungen enthalten keine Passwörter oder API-Schlüssel.

Das JSON-Backup enthält Brain, Projekte, Aufgaben, Planung, Media-Metadaten und Konfiguration; keine Mediendateien und keinen Credential-Vault. Für vollständige Wiederherstellung den persistenten App-Datenordner privat sichern (einschließlich lokalem `media/`, Schlüssel und Vault) und NAS-Dateien mit normalen NAS-Backups sichern. Nach reinem JSON-Restore auf einem neuen Host Zugangsdaten erneut eingeben und denselben NAS-Endpunkt verwenden.

### Prüfung und aktuelle Grenzen

`npm test` prüft Export, Brain-Merge, Actions/Freigaben, verschlüsselte Credentials, Codex-Login-Grenzen, Next-Task-Migration und lokalen/simulierten SMB- sowie WebDAV-Speicher. Nach dem Produktionsbuild prüft `npm run test:api` mit isolierten Daten Brain-Import/Export/Konflikte, manuelle Projekte/Ideen/Sessions, Aufgaben/Content/Planung, Datei-Upload/Byte-Ranges/Zuordnung, Integrationszustände, Origin-Schutz, Backup/Restore und Neustart-Persistenz. Keine echten Provider- oder NAS-Anfragen in automatisierten Tests.

Noch nicht angebunden: automatische Veröffentlichung zu sozialen Plattformen, KI-Bild-/Videoerzeugung, Video-/Audioanalyse, NFS/S3/Cloud-Provider, Offline-Upload-Queue und automatische NAS-Dateisuche. Echte Codex-/NAS-/HA-Verbindung benötigt persönliche Anmeldung/Zugangsdaten; Container und visuelle HA-Ansicht müssen an der Instanz geprüft werden.

## Build und Home-Assistant-Export

```powershell
npm run build
```

Der App-Build verwendet Next.js standalone. Dieser Ordner `Build/` bleibt die bestehende Repository-Wurzel für GitHub Desktop. Jeder erfolgreiche `npm run build` ruft automatisch `postbuild` auf: Das Add-on-Paket in `creatoros/app/` wird mit dem aktuellen Quellcode ersetzt und die Patch-Version in `creatoros/config.yaml` erhöht. Git-Metadaten, Remote-URL und lokale Daten bleiben erhalten. Es wird kein weiterer Ausgabeordner angelegt.

Für denselben vollständigen Ablauf funktionieren auch:

```powershell
npm run build:ha
.\scripts\prepare-addon.ps1
```

Aus dem übergeordneten Projektordner funktionieren `npm run build`, `Erstelle-Addon-Build.ps1` und `HA_Addon/build.ps1`; sie bauen dasselbe Projekt in `Build`. Home Assistant erwartet `repository.yaml` und `creatoros/config.yaml` direkt in der Repository-Wurzel. Nach Commit/Push aktualisiert HA seine Repository-Liste und zeigt die höhere Version als Update. Das Container-Image wird beim Installieren/Aktualisieren von Home Assistant aus dem Dockerfile gebaut. Docker/HA-Supervisor sind auf dem Entwicklungsrechner nicht installiert, daher wird hier der Produktionsbuild geprüft und das vollständige Add-on-Quellpaket erzeugt.

Das Docker-Paket enthält bewusst keinen lokalen Export-Hook. Der Container-Build kompiliert die App einmal und löst keinen weiteren Paketexport aus. `npm test` prüft Versionsfortschritt, veraltete Dateien, den Erhalt der Git-Konfiguration und den Schutz lokaler Daten beim Export.

## Daten, Backup, Update und Restore

- Produktionsdaten liegen außerhalb des App-Builds in `/data/creatoros.json`.
- **Mehr → Sicherung herunterladen** exportiert ein versioniertes JSON-Backup; Restore validiert Format und Schema und schreibt atomar.
- Für ein zusätzliches Host-Backup regelmäßig den persistenten HA-App-Ordner unter `/data` sichern und Restore nach Add-on-Neuinstallation über die UI ausführen.
- Schema-Änderungen bekommen eine neue `schemaVersion` und eine explizite Migration. Unbekannte Versionen werden abgelehnt, nicht überschrieben.
- Update: Quellcode ändern → UI-/API-Prüfung → `npm run build` (inklusive automatischem Add-on-Export und Versionserhöhung) → GitHub Desktop Commit/Push → HA Add-on Repository aktualisieren → Add-on aktualisieren. `/data` bleibt als separates Volume erhalten.
- Ein neuer Quellcodebuild startet die App nicht ungefragt neu. Home Assistant zeigt die Add-on-Version als verfügbares Update an.

## GitHub Desktop

GitHub Desktop verwendet weiterhin diesen Ordner `Build/` mit dem bereits verbundenen Remote `https://github.com/firebreakHD/CreOS.git`. Nach einem Build die Änderungen dort prüfen, committen und pushen. Keine Secrets oder CreatorOS-Nutzerdaten committen.
