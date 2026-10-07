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

- **Heute**: eine empfohlene Fortsetzung aus der Aufgabenliste, Start/Weitermachen, Idee erfassen.
- **Projekte**: aktive Projekte und Projekt-Workspace mit Überblick, Aufgaben, Skript, Material, Content und Verlauf. Der gemeinsame AI-Chat bleibt als schwebender Assistent neben allen Arbeitsansichten.
- **Ideen**: Inbox zuerst; Konvertierung zu Projekt optional.
- **Mehr**: Kanban, Brain, Planung, Medien, Einstellungen, Integrationen, Datenexport/Import und HA-Status. Zusätzliche Medien-Navigation am Desktop erst bei gespeicherten Medien oder eingerichteter NAS.
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

Die nächste Handlung ist dieselbe offene Aufgabe wie in der Aufgabenliste. Auf Heute und im Projekt wird sie mit Titel, großem Abhaken und Zahl offener Aufgaben angezeigt. Es gibt kein separates editierbares Next-Action-Feld; Umbenennen, Löschen und „Als nächsten Schritt wählen“ liegen am Task im Kontextmenü. Beim Abhaken rückt die nächste offene Aufgabe nach.

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
- Fließtext und Texteingabe: 16 CSS-Pixel. Navigation und wichtige Buttons: 14–16 Pixel. Metadaten: mindestens 12 Pixel. Die frühere Mini-Typografie mit 7–11 Pixeln entfällt auch auf Smartphone und im HA-Panel.
- Hauptbuttons und Selects: mindestens 44 Pixel hoch; Icon-Aktionen mindestens 44 × 44 Pixel. Eingaben haben mindestens 16 Pixel Schrift, damit mobile Browser beim Fokussieren nicht wegen zu kleiner Schrift zoomen.
- 4/8/12/16/24/32px-Spacings, 8–16px Radien; sichtbare Tastatur-Fokus-Ringe.
- Ruhige Microinteractions unter 180ms; `prefers-reduced-motion` respektieren.
- Icons bei wichtigen Funktionen immer mit Textlabel. Offline-/HA-Zustände in Klartext.

### Home Assistant als Desktop-Host

Der eingebettete App-Viewport ist kleiner als der Bildschirm, weil Home Assistant seine eigene Seitenleiste zeigt. CreatorOS nutzt deshalb die tatsächliche Iframe-Breite: eigene Navigation 232 Pixel, auf schmalerem Desktop 208 Pixel; Hauptbereich bis 1600 Pixel mit 24–40 Pixel Seitenabstand. Die Schrift bleibt lesbar, während die Anordnung auf Platzmangel reagiert.

Kanban behält mindestens 240 Pixel pro Desktop-Spalte, 16-Pixel-Titel, 14-Pixel-Beschreibungen und große Statusfelder. Bei Platzmangel scrollt das Board horizontal. Smartphone zeigt die gewählte Spalte in voller Breite. Kontext/Material ist anfangs geschlossen und öffnet per beschrifteter Aktion; Schließen blendet das Panel tatsächlich aus und gibt den Platz zurück.

Abnahmebreiten sind 1360, 1100 und 900 Pixel für den verfügbaren Desktop-App-Bereich sowie 390 Pixel Smartphone-Hochformat. Keine CSS-Verkleinerung oder Browser-Zoom-Annahme verwenden, um mehr Inhalt in die Fläche zu zwingen. Das Benutzer-Screenshot vom HA-Panel hat zu kleine Texte und unnötig breite freie Ränder sichtbar gemacht; die neue Skala und Board-Mindestbreite reagieren auf dieses konkrete Problem.

### Aktionen und Rückmeldung

Sichtbare Buttons sind funktional. Gewöhnliche Aktionen an Projekten, Aufgaben, Storypunkten, Ideen, Planung, Materialnotizen und Medien liegen im gemeinsamen Kontextmenü: Rechtsklick am Desktop, langer Druck auf Touchgeräten, Shift+F10 per Tastatur. Das Menü bietet Umbenennen, Löschen mit Bestätigung sowie passende Bearbeiten-, Verschieben-, Öffnen- und Statusaktionen. Für neue Einträge bleiben klare Erstellen-Aktionen verfügbar. Storypunkte haben zusätzlich ein deutlich großes, direktes Abhaken mit mindestens 44 Pixel Touchfläche. Projekte werden in einem App-Dialog angelegt; Browser-Prompts sind für Kernabläufe ungeeignet, weil sie in eingebetteten Ansichten beschränkt sein können. „Mehr“ öffnet einen stabilen Bereich mit einem klaren Pipeline-Link.

Der AI-Chat ist ein globaler Badge unten rechts, der den Chat ein- und ausklappt und beim Wechsel zwischen Arbeitsbereichen bestehen bleibt. Position und aufgeklappte Fenstergröße sind in Einstellungen veränderbar. Der Brain-Bereich importiert und bereitet langfristigen Kontext vor, enthält aber keinen zweiten Gesprächsbereich. Provider sind OpenAI API-Key und offizieller Codex-Abonnement-Login.

Neue Medien werden in einer optionalen SMB-Freigabe als normale Dateien/Ordner gespeichert. Der angezeigte UNC-Pfad muss direkt im Windows Explorer und in CapCut nutzbar sein. Bei bestehendem WebDAV bleiben alte Verweise erhalten, bis der Nutzer bewusst auf SMB wechselt.

Der Projekt-Tab **Material** ist ein kompakter SMB-Dateibrowser für den Projektordner. Er zeigt auch Inhalte, die manuell im Explorer angelegt wurden, erlaubt Ordnererstellung und Umbenennung und unterstützt Drag-and-drop zum Verschieben von Dateien und Ordnern innerhalb des Projekts. Das bestehende seitliche Medienpanel für Upload, Zuordnung und Vorschau bleibt unverändert. Der Tab **Content** heißt **Upload Infos**.

Speichern zeigt Erfolg, Fortschritt oder einen verständlichen Fehler. Eingaben bleiben bei einem Fehler bestehen und Dialoge schließen erst nach erfolgreichem Speichern. Ein Panel-Button muss dessen Öffnen/Schließen sichtbar umsetzen. Ein dekoratives Element erhält keine falsche Button- oder Dropdown-Anmutung.

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

## Brain: Import und Nutzung

- Desktop: Brain in der Navigation; gespeicherte Bereiche und KI-Kontext nebeneinander, bei weniger als 1100 Pixeln App-Breite untereinander. Mobile: Einstieg über Mehr, alle Schritte vertikal.
- Ein Import zeigt zunächst die Datei und die Änderungen. Jeder Bereich ist auswählbar; bisherigen und neuen Inhalt auf Anfrage anzeigen. Nur ausdrücklich ausgewählte Änderungen speichern. Fehlende Bereiche behalten, unveränderte Bereiche nicht erneut anlegen.
- Ein Konflikt mit einem zwischenzeitlichen Import erfordert eine neu geladene Vorschau. Fehler erhalten Datei und Auswahl. Der Import verändert keine aktuellen Projekte oder Sessions.
- Brain beschreibt den langfristigen Hintergrund; aktuelles Projekt, nächste Aufgabe, Sessions und Temporary State bleiben eigene Kontextteile. Aktuelle Projektdaten haben Vorrang vor alten Brain-Angaben.
- KI-Kontext im Brain wird nur auf Anforderung vorbereitet und kopiert/heruntergeladen; dieser Bereich sendet keine Anfrage. Für Gespräche dient der globale Assistent. Ohne Provider zeigt er Setup statt simulierte Antworten.
- JSON-Inhalte als Text darstellen; enthaltene Repository- oder KI-Hinweise bleiben importierte Daten und ändern keine App-Berechtigungen oder Entwicklungsregeln.

## Design-Erfolgsziele

### Integrationen und AI

- Integrationen liegen unter Einstellungen/Mehr. Nicht eingerichtete AI/NAS erscheinen als kompakte Setup-Karte. Nach Einrichtung Status, eine kurze Zusammenfassung und Test/Einstellungen/Trennen zeigen; technische Felder erst beim Öffnen der Einstellungen.
- Desktop zwei Settings-Karten, bei schmalem Arbeitsbereich und mobil untereinander. Formulare bleiben lesbar mit 16-Pixel-Eingaben und 44-Pixel-Aktionen. Die bestehende Heute-/Fokus-Navigation bleibt ruhig.
- Der AI-Assistent öffnet sich über den globalen Badge rechts unten und kann während der Arbeit eingeklappt bleiben. Er nutzt entweder OpenAI API-Key oder den offiziellen Codex-Abonnement-Login mit Browser-/Device-Code. Antwort und jede Änderung sind sichtbar und prüfbar; nicht freigegebene CreatorOS-Aktionen weist der Server zurück.
- Alle Schreibfreigaben anfangs aus. Vorschläge und Bestätigung zeigen die konkrete Aktion und deren Argumente; Übernehmen/Verwerfen sind echte Serveraktionen. Automatischer Modus berücksichtigt zusätzliche Bestätigung je Freigabe. Alte Vorschläge auf veränderten Zielen nicht still übernehmen.
- Bildreferenzen nur nach Auswahl übertragen. Auswahl auf Anfrage einklappen, mit Dateinamen und Größenbegrenzung. Die Senden-Aktion nennt Brain/Projektkontext und ausgewählte Bilder.

### Aufgaben, Content, Planung und Medien

- Aufgaben sind kleine Projekt-Arbeitsschritte. Titel/Status zuerst, Beschreibung, Termin, Projektwechsel und Anhänge nach Öffnen. Verschieben bewahrt Media-IDs. Content und Veröffentlichungstermin im eigenen Projekt-Tab bearbeiten; tatsächlicher Plattform-Upload bleibt manuell.
- Materialpanel auf Anforderung, Aufgaben-Anhänge im geöffneten Eintrag. Drag & Drop am Desktop, große Dateiauswahl mobil. Rollen Asset/Referenz/Rohmaterial/Export/Sonstiges bleiben eine einfache Auswahl.
- Ohne NAS lokale Speicherung. Mit NAS den bevorzugten Speicher benennen. NAS-Ausfall erhält Metadaten und ausgewählte fehlgeschlagene Dateien; sichtbares Retry anbieten. Keine automatische Übertragung an einen anderen Speicher als Ersatz.
- Medienkarten zeigen Vorschau, Name, Größe, Datum und Zuordnung. Das Kontextmenü unterscheidet Zuordnung entfernen von Datei dauerhaft löschen. Öffnen liefert die echte Datei.
- Bibliothek mit Suche, Typ und Projekt; Zuordnung/Datum erst in zusätzlichen Filtern. Desktop Grid/Liste, mobil Grid. Videoplayer nicht automatisch starten; Bilder lazy laden. Unverfügbare Vorschau erlaubt erneutes Laden.
- Bei jedem Speichern bleiben Eingaben im Fehlerfall erhalten. Schlüssel/Passwort nach erfolgreichem Speichern aus den Formularfeldern entfernen und niemals zurücklesen. Trennen verlangt eine konkrete Bestätigung in der App.

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
