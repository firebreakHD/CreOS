# CreatorOS UX-Konzept

## Leitidee

CreatorOS ist ein persönlicher Start- und Produktionsassistent. Die Home-Ansicht beantwortet in wenigen Sekunden: **Muss ich heute etwas tun? Woran mache ich weiter? Was ist der kleinste konkrete Anfang?** Sie optimiert die Zeit bis zum tatsächlichen Arbeitsbeginn, nicht die Zeit in der App.

## A. User-Problem-Map

| Reibung | Produktantwort |
|---|---|
| Einstieg nach einer Pause kostet Erinnerung und Sucharbeit | Projekt, letzte Session und gespeicherte Next Action direkt im Heute-Screen zeigen; bei langer Pause neutral „Willkommen zurück“ |
| Ein großes Projekt fühlt sich schwer an | Next Action als konkrete, ausführbare Handlung; frei änderbares 10-Minuten-Minimum |
| Ideen entstehen mobil und gehen verloren | Text- und Spracheingabe mit Inbox als Default; Zuordnung optional |
| Informationen lenken vom Start ab | Bereiche und Details erst im passenden Arbeitskontext zeigen |
| Arbeit endet ohne klaren Wiedereinstieg | Session-Ende fragt nach der nächsten Handlung; Überspringen bleibt möglich |

## B. Behavior Flow

```text
CreatorOS öffnen → Heute zeigt Projekt + Next Action → Start (10-Minuten-Minimum)
    → Fokusmodus → Arbeit außerhalb der App → Fertig
    → Next Action festhalten → nächster Wiedereinstieg ist vorbereitet
```

Implementation Intentions werden als freiwilliger Wenn-Dann-Plan angeboten: „Wenn [Situation], dann öffne ich CreatorOS und [konkrete Handlung].“ Ein Plan wird nie zur Voraussetzung für eine Session.

## C. Information Architecture

- **Heute**: eine empfohlene Fortsetzung, Next Action, Start/Weitermachen, Idee erfassen.
- **Projekte**: aktive Projekte und Projekt-Workspace mit Überblick, Next Action, Skript, Material und Verlauf.
- **Ideen**: Inbox zuerst; Konvertierung zu Projekt optional.
- **Mehr**: Kanban, Einstellungen, Datenexport/Import und HA-Integrationsstatus.
- **Fokusmodus**: eigener, ablenkungsarmer Bildschirm ohne globale Navigation.

Desktop nutzt beschriftete Seitenleiste; Mobile nutzt eine feste Bottom-Navigation **Heute, Projekte, +, Ideen, Mehr**. Das Plus ist eine Aktion und öffnet Quick Capture, kein Navigationsziel.

## D. Screen Priority

| Screen | Primary | Secondary | Erst bei Bedarf |
|---|---|---|---|
| Heute | Weitermachen / Start | Anderes Projekt, Idee | Wochenübersicht, Verlauf |
| Quick Capture | Speichern | Sprache, Projekt optional | Tags, spätere Sortierung |
| Projekt | Next Action fortsetzen | Status, letzter Fortschritt | Skript, Material, Kanban |
| Skript | Abschnitt bearbeiten/hinzufügen | Kontext/Material öffnen | AI-Vorschlag |
| Kanban | Karte in Status bewegen | Karte öffnen | Filter und Spaltenpflege |
| Fokus | Timer + Next Action | Pause, fertig | sonstige Navigation |
| Session-Ende | Next Action speichern | Fertig ohne Änderung | Sessiondetails |
| Ideen-Inbox | Idee öffnen/Projekt daraus machen | Erfassen | Sortierung/Tags |
| Rückkehr | Letzte Next Action fortsetzen | anderes Projekt | Chronologie |

Buttons verwenden Primary, Secondary, Ghost und Destructive. Es gibt je Screen eine dominante Aktion. Warnungen und Streak-Druck entfallen.

## E. Mobile Flow

```text
Bottom-Tab „+“ → Vollbild-Capture → Text oder Sprache → „Speichern“ → Heute
Heute → große Next Action + „10 Minuten starten“ → Fokus → Fertig → Next Action
```

Capture hat ein Textfeld, eine sichtbare Spracheingabe und optionale Projektzuordnung. Kein Pflicht-Tag, Datum oder Kategorie. Sprachaufnahme nutzt Browser Speech Recognition, wenn vorhanden; Text bleibt immer verfügbar. Touchflächen sind mindestens 44 CSS-Pixel hoch angelegt; Safe Areas und Hochformat werden berücksichtigt. Projekt und Kanban sind mobil benutzbar, aber abschnittsweise/als einzelne Spalte aufgebaut.

## F. Desktop Flow

```text
Heute: Resume + Handlung → Projekt-Workspace → Skript/Material bei Bedarf öffnen
→ Session starten → extern produzieren → Session-Ende: neue Next Action speichern
```

Der Projekt-Workspace nutzt zunächst eine ruhige Hauptspalte. Kontextpanel für Material/Verlauf ist ein- und ausblendbar. Kanban zeigt mehrere Spalten mit HTML5-Drag-and-Drop. Fokusmodus blendet Sidebar, Projektwechsel und Analytics vollständig aus.

## G. Notification-Strategie

- Standardmäßig keine CreatorOS-Push-Benachrichtigungen.
- Ein optionaler, vom Benutzer aktivierter Build-Day-Hinweis ist zulässig, wenn Zeit/Kontext wirklich passen.
- Keine Inaktivitäts-, Streak- oder Schuld-Nachrichten.
- Home Assistant Automationen bleiben optional und werden in Home Assistant konfiguriert; CreatorOS löst keine Geräteaktionen ohne explizite Konfiguration aus.

## H. Design System

- Navy/Graphit als Basis, geschichtete dunkle Flächen, Violett sparsam für die Primary Action; Mint für ruhigen Erfolgsstatus.
- Klare Sans-Serif-Hierarchie, konkrete Handlung als stärkster Text, Metadaten zurückhaltend.
- 4/8/12/16/24/32px-Spacings, 8–16px Radien; sichtbare Tastatur-Fokus-Ringe.
- Ruhige Microinteractions unter 180ms; `prefers-reduced-motion` respektieren.
- Icons bei wichtigen Funktionen immer mit Textlabel. Offline-/HA-Zustände in Klartext.

## I. Wireframes (Struktur, Desktop links / Mobile rechts)

### 1. Heute / Home

```text
DESKTOP                                  MOBILE
┌ CreatorOS ───── Heute / Projekte ┐    ┌ Heute       [ + Idee ] ┐
│ HEUTE · Build Day                │    │ HEUTE · Build Day      │
│ Weitermachen                     │    │ Weitermachen           │
│ LEGO – Oktober Comeback          │    │ LEGO · Comeback        │
│ Finde „bis Ende des Jahres“ ...  │    │ Finde die Schnittstelle│
│ [ 10 Minuten starten ]           │    │ [ 10 MIN STARTEN ]     │
│ Anderes Projekt wählen           │    │ Idee sprechen          │
│ Zuletzt: Marker gesetzt          │    │ Zuletzt weitergemacht  │
└ Navigation / Inbox / Mehr ───────┘    └ Heute Projekte + Ideen ┘
```

### 2. Quick Capture

```text
DESKTOP: kleines Command-Dialogfenster       MOBILE: Vollbild
┌ Was ist dir eingefallen?               ┐   ┌ Schließen           ┐
│ [ Textfeld, Enter speichert ]           │   │ Was ist dir gerade  │
│ [🎙 Sprechen]  Projekt (optional)      │   │ eingefallen?        │
│ [Speichern]                             │   │ [ großes Textfeld ] │
└─────────────────────────────────────────┘   │ [🎙 Sprechen]       │
                                              │ [Speichern]         │
                                              └─────────────────────┘
```

### 3. Projekt

```text
DESKTOP: Projektkopf + Handlung, Kontextpanel optional
┌ LEGO – Oktober Comeback ───── [Weitermachen] ┐
│ Nächste Handlung: Stelle … finden             │
│ Überblick | Skript | Material | Verlauf        │
│ [Arbeitsbereich / Abschnitt]  [Kontext zu]     │
└───────────────────────────────────────────────┘

MOBILE: Titel → Next Action → Start → Abschnitts-Tabs/vertikale Inhalte.
```

### 4. Script Builder

```text
DESKTOP: Gliederung links | gewählter Abschnitt Mitte | Kontext auf Wunsch rechts
MOBILE: ausgewählter Abschnitt im Vollbild; Abschnitte über Liste wechseln.
Primary Action: „Abschnitt hinzufügen“. AI bleibt ein explizit angefordertes Werkzeug.
```

### 5. Kanban

```text
DESKTOP: Ideen → Geplant → Aufgenommen → Schnitt → Fertig, mehrere Spalten sichtbar.
MOBILE: Statusauswahl oben; Karten einer Spalte als Liste, horizontal wechselbar.
Eine Karte ist über Statuslabel und Menü auch ohne Drag-and-Drop verschiebbar.
```

### 6. Fokusmodus

```text
DESKTOP + MOBILE (gleiches Ziel, adaptive Größe)
┌ CreatorOS                         Beenden ┐
│ LEGO – Oktober Comeback                    │
│ Finde die Stelle „bis Ende des Jahres“.    │
│                  09:32                     │
│              [Pause] [Fertig]              │
│       Minimum geschafft · +25 Min          │
└────────────────────────────────────────────┘
```

Timer startet standardmäßig mit 10 Minuten; nach Ablauf kann die Arbeit freiwillig weitergehen. Pause, Abbruch und Session-Ende sind jederzeit verfügbar.

### 7. Session-Ende

```text
┌ Session gespeichert · 18 Minuten ┐
│ Was ist beim nächsten Mal dran?   │
│ [konkrete Handlung]               │
│ [Next Action speichern]           │
│ Fertig ohne Änderung              │
└───────────────────────────────────┘
```

Mobile zeigt dasselbe vertikal mit einer gut erreichbaren Primary Action und optionalem Überspringen.

### 8. Ideen-Inbox

```text
DESKTOP: links Capture + Inbox-Liste, Idee im Detail beim Öffnen.
MOBILE: Ideenliste; + öffnet sofort das leere Capture; Zuordnung erst nach Speicherung.
Empty state: „Noch keine Ideen. Halte sie hier einfach fest.“
```

### 9. Rückkehr nach Abwesenheit

```text
┌ Willkommen zurück                   ┐
│ Zuletzt: LEGO – Oktober Comeback    │
│ Nächster Schritt: Hard Cut nach …  │
│ [Weitermachen]                      │
│ Anderes Projekt wählen              │
└────────────────────────────────────┘
```

Kein überfälliger Zähler, kein Aktivitätsvorwurf, kein erzwungenes Planen.

## Evidence → Entscheidung

| Evidence / principle | Produktentscheidung |
|---|---|
| Implementation intentions: Meta-Analyse über 94 unabhängige Tests fand einen positiven mittleren bis großen Effekt auf Zielerreichung; das ist kein Versprechen für jeden Einzelnen. | Freiwilliger, konkreter Wenn-Dann-Plan und vorbereitete Next Action; Ziel/Situation/Handlung explizit statt bloß „mehr Content machen“. |
| Recognition over recall: relevante letzte Inhalte und Aufgaben sichtbar zu machen hilft beim Wiederaufnehmen. | Home zeigt letzte Session, Projekt und Next Action, ohne die Person dazu zu bringen, alte Notizen zu suchen. |
| Progressive disclosure: sekundäre/seltene Funktionen erst auf Nachfrage zeigen. | Heute zeigt primär eine Fortsetzung; Script, Material, AI und Analytics bleiben in ihrem Arbeitskontext. |
| Feldexperiment (N=247) zu Kommunikationsbenachrichtigungen: Reduzierte Unterbrechungen verbesserten die untersuchten Leistungs- und Belastungsmaße; Übertragbarkeit auf CreatorOS ist begrenzt. | Push standardmäßig aus; keine Motivations- oder Inaktivitätsserie. |
| Apple nennt 44pt als Touch-Ziel-Empfehlung; WCAG 2.2 AA Mindestgröße 24 CSS px mit Ausnahmen. | Mobile Kernaktionen verwenden größere 44px-Flächen; dies liegt über WCAG-Minimum und unterstützt Einhandbedienung. |

## UX-Selbstkritik vor Implementierung

- Der vorige Entwurf machte Projekte, Fortschritt, Pipeline und Timer gleichzeitig prominent. Das konkurriert mit dem Einstieg. Für die neue Home-Ansicht bleiben eine Next Action und ein Start-Button dominant.
- Eine einzelne vorgeschlagene Fortsetzung darf nicht wie eine Zuweisung wirken. „Anderes Projekt wählen“ und Next-Action-Bearbeitung bleiben sichtbar, aber sekundär.
- Ein Countdown kann Druck auslösen. Fokus beginnt mit einem kleinen, veränderbaren Minimum; nach dessen Ablauf wird nicht „Scheitern“ signalisiert.
- Gesprochene Ideen funktionieren nicht browserübergreifend gleich. Spracheingabe ist progressive Enhancement; die Tastatureingabe bleibt immer verfügbar.
- Der Home-Screen kann den Bedarf des Nutzers nicht zuverlässig aus seinem Kalender/Zuhause erkennen. „Build Day“ wird zunächst manuell/regelbasiert konfiguriert, nicht aus einer erfundenen Kontext-Erkennung abgeleitet.

## Design-Erfolgsziele

- Heute → Session: eine Hauptentscheidung, direkter Start.
- Quick Capture: Text tippen oder diktieren, einmal speichern; optionale Angaben bleiben optional.
- Resume: letzte Next Action ohne Projekt-Suche sichtbar.
- Fokusmodus: keine ablenkende App-Navigation.
- Nach drei Wochen Pause: neutrale Rückkehr und direkte Fortsetzung.

Das sind überprüfbare Designziele, keine Forschungsergebnisse oder garantierten Nutzungsmetriken.

## Quellen

- Gollwitzer & Sheeran, 2006, *Implementation Intentions and Goal Achievement: A Meta-Analysis of Effects and Processes*, Advances in Experimental Social Psychology 38, 69–119: https://doi.org/10.1016/S0065-2601(06)38002-1
- Nielsen Norman Group, *Progressive Disclosure*: https://www.nngroup.com/articles/progressive-disclosure/
- Nielsen Norman Group, *Memory Recognition and Recall in User Interfaces* (2024): https://www.nngroup.com/articles/recognition-and-recall/
- Baethge, Deci & Dettmers, 2023, *Effects of task interruptions caused by notifications...*, Journal of Occupational Health: https://pmc.ncbi.nlm.nih.gov/articles/PMC10244611/
- Apple Human Interface Guidelines, *UI Design Dos and Don’ts*: https://developer.apple.com/design/tips/
- W3C, WCAG 2.2, Success Criterion 2.5.8 Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
