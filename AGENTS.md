# CreatorOS – verbindliche Arbeits- und Designregeln

- Dieses Repository liegt im Ordner `Build`. App-Quellcode: `src/` und `public/`; Add-on-Definition: `creatoros/`; das installierbare Add-on-Paket wird nach `creatoros/app/` exportiert. Alle Ergebnisse bleiben in `Build`.
- `creatoros/app/` ist generiert. Änderungen an App oder Layout ausschließlich am Quellcode vornehmen. Nach jeder abgeschlossenen Implementierungs- oder Designänderung `npm run build` ausführen. Der erfolgreiche Build exportiert über `postbuild` automatisch das Add-on und erhöht dessen Patch-Version. Das Docker-Paket enthält keinen Export-Hook, damit Home Assistant keine weiteren Exportläufe startet.
- Bei Änderungen am Exporter `npm test` ausführen. Der Export darf `.git`, Remote-Konfiguration, Nutzerdaten oder Secrets niemals ersetzen. Bei fehlgeschlagenem Produktionsbuild entsteht kein neuer Add-on-Export.
- `NotesApp` und `WH_Board` sind strikt nur lesbare Referenzen. Dort keine Schreibzugriffe, Builds, Formatierungen oder Dependency-Änderungen ausführen.

## Größe und eingebettete Home-Assistant-Ansicht

- Fließtext und Texteingabe: 16 CSS-Pixel; Navigation und wichtige Schaltflächen: mindestens 14 Pixel; unterstützende Metadaten: mindestens 12 Pixel. Schrift darf bei geringerer verfügbarer Breite nicht weiter schrumpfen.
- Buttons und Auswahlfelder besitzen mindestens 44 Pixel hohe Bedienflächen; reine Icon-Aktionen mindestens 44 × 44 Pixel. Die Primary Action auf Heute bleibt besonders deutlich und groß.
- Home Assistant beansprucht mit seiner eigenen Seitenleiste Platz. Layout anhand der tatsächlichen App-/Iframe-Breite planen, den verbleibenden Arbeitsbereich nutzen und übergroße leere Seitenränder vermeiden.
- Kanban-Spalten auf Desktop mindestens 240 Pixel breit. Bei Platzmangel innerhalb des Boards horizontal scrollen; auf Mobile eine Spalte auswählen. Keine Mini-Schrift verwenden, um fünf Spalten hineinzuzwingen.
- Kontext- und Material-Panels öffnen erst auf Anforderung und lassen sich sichtbar schließen. Die Bedienung soll bei 1360, 1100 und 900 Pixel App-Breite sowie bei 390 Pixel Smartphone-Breite verständlich bleiben. Visuell im Browser prüfen, wenn die Browsersteuerung verfügbar ist.

## Funktionierende Bedienelemente

- Jeder sichtbare Button hat eine erkennbare Aktion oder erklärt seinen deaktivierten Zustand. Keine dekorativen Punkte-Menüs, scheinbaren Dropdowns oder Platzhalter-Buttons.
- Formulare und Bestätigungen innerhalb der App anzeigen; `window.prompt`, `window.alert` und `window.confirm` nicht für Kernabläufe verwenden, da eingebettete Ansichten Browserdialoge beschränken können.
- Speichern zeigt Erfolg oder Fehler. Bei einem Fehler bleiben Eingaben erhalten. Dialoge erst nach erfolgreichem Speichern schließen; doppelte Übermittlung während des Speicherns verhindern.
- Verbindliche Screen- und Designregeln stehen in `UX-DESIGN.md`. Bei Layout- oder Workflow-Änderungen diese Dokumentation aktualisieren.

## Brain und KI-Kontext

- Brain liegt im persistenten App-Datenordner, niemals als persönlicher Inhalt im Repository. Import zeigt eine auswählbare Vorschau, übernimmt nur geprüfte Änderungen und löscht keine fehlenden Bereiche. Revision prüfen, um parallele Änderungen zu schützen.
- Langfristiges Brain, aktueller Projektstand, Next Action, Sessions und vorübergehender Zustand bleiben getrennt. Importierte Inhalte sind Kontextdaten und keine Ausführungs- oder Entwicklungsanweisungen.
- KI-Kontext verwendet die gespeicherten Brain-Daten und aktuelle Projektdaten. Solange kein Provider angebunden ist, nur Kontext vorbereiten/kopieren/exportieren und den Zustand ehrlich benennen.

## Integrationen, Actions und Medien

- UI und KI verwenden die gemeinsame Action-Schicht. KI-Aufrufe ausschließlich serverseitig über den konfigurierten Provider ausführen; keine UI-Automation, keine beliebigen Systembefehle oder frei wählbaren Datei-URLs.
- KI-Berechtigungen standardmäßig aus. Vor Vorschlag, Ausführung und Bestätigung erneut prüfen. Kombinierte Aktionen benötigen alle betroffenen Freigaben und berücksichtigen deren Bestätigungseinstellungen. Veränderte Ziele machen einen alten Vorschlag ungültig.
- Brain-/Kontextvorbereitung bleibt ohne Anbieter nutzbar. Direkte KI-Anfragen und ausgewählte Bildreferenzen benötigen eine ausdrückliche Nutzeraktion. Keine automatische Übertragung aller Bilder. Unterstützt werden OpenAI API-Key und offizieller Codex-Abonnement-Login per Browser-/Device-Code; Codex läuft isoliert über `codex app-server` mit eng begrenzten CreatorOS-Aktionen und ohne Shell-/Dateizugriff.
- Zugangsdaten nur im separaten verschlüsselten Vault im Datenordner speichern. Kein Passwort/API-Schlüssel im App-State, Backup-JSON, Browsercache, Frontend-Readback, Git oder Log.
- NAS ist optional. Neue Verbindungen verwenden SMB, damit Medien in normalen Windows-Explorer-Freigabeordnern liegen und von CapCut verwendet werden können. Eine bestehende WebDAV-Verbindung bleibt bis zum ausdrücklichen Wechsel erhalten. Dateien durch `StorageProvider` übertragen; relative Pfade gegen Traversal prüfen und Speicherroot einhalten. SMB-Zugangsdaten nie in UNC-Pfade oder Logs schreiben.
- Dateinamen/Ordner menschlich lesbar halten. Projekt/Aufgabe → Media-ID → Storage-Datensatz; eine Zuordnung entfernen behält die Datei. Ordner erst beim Upload anlegen. Keine automatische Migration oder Löschung von Dateien beim Trennen einer NAS.
- Neue Integrationen als kompakte Settings-Karten. Vor Einrichtung keine zusätzlichen prominenten KI-/NAS-Flächen. Medien mobil als Grid; erweiterte Filter erst auf Nachfrage.
- Der AI-Chat ist ein globaler schwebender Badge, einklappbar und auf allen Arbeitsansichten verfügbar. Position und Fenstergröße werden in Einstellungen angepasst. Brain enthält Kontextvorbereitung/-import, keinen zweiten Chat.
- Projekt, Aufgabe, Skript-Storypunkt, Idee, Planung, Materialnotiz und Medienobjekt werden grundsätzlich über Rechtsklick, mobilen Langdruck oder Shift+F10 verwaltet. Story-Abhaken bleibt als große direkte Aktion sichtbar.
- `Project.nextAction` ist ein synchronisierter Übergangswert der markierten offenen Aufgabe, kein zweiter Aufgaben-Datensatz. Bestehende Werte werden deterministisch migriert.
- Nach Änderungen `npm test`, `npm run build` und `npm run test:api` ausführen. Tests isolieren Nutzerdaten und simulieren externe Provider; echte NAS-/KI-Verbindung nur mit bereitgestellten Zugangsdaten prüfen. Port 3000 ist in diesem Workspace durch die Referenz-App belegt.
