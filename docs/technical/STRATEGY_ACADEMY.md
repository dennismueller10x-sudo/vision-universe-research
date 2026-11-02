# Strategie-Akademie T-ACADEMY-1.0

Aktueller Qualitätsstand: [kritisches Audit CODEX 002](STRATEGY_ACADEMY_AUDIT_002.md). Die unten genannten ursprünglichen Prüfzahlen dokumentieren die Erstimplementierung; aktuelle Ergebnisse stehen im Auditbericht.

Stand: 02.11.2026. Umsetzung auf dem unveränderten Assistenten-Stand `46fca1f420087067cdfd25e0e62189a61cccc41d` aus PR #1245. Dieser war bei Arbeitsbeginn **offen, Draft, nicht gemergt**. Eigener Branch `feat/technical-academy-t-academy-1`, gestapelter PR gegen `claude/technical-assistant-t1-t3`. Kein Commit auf dessen Branch, kein Merge, keine Aktivierung außerhalb des normalen Technical-Frontends. Während der Umsetzung wurde #1245 auf `97b15816089c91e28c577c5c24c5f3a2e4c6f66b` weitergeführt. Dieser Stand wurde unverändert in den eigenen Akademie-Branch integriert; keine Änderung zurück auf den Assistenten-Branch. Nach dessen Merge den Akademie-PR auf main umstellen und erneut prüfen.

## Architektur und Nutzerweg

`/technical/#/akademie` → Lernpfad → `#/akademie/<lektion>` → Beispiel → Quiz → Praxisziel → freiwilliger Abschluss. `#/akademie/glossar` enthält das gemeinsame Glossar. Einstieg auf der Technical-Startseite und in den bestehenden Reitern. Keine globale Neugestaltung.

| Bestandteil | Vertrag |
|---|---|
| `technical/academy/content.json` | `schemaVersion: technical-academy-1.0.0`, `contentVersion: 1`; 8 Pfade mit je 4 IDs, 32 eigenständige Lektionen, 23 Glossarbegriffe und Praxiszielkatalog |
| Lektion | stabile ID, Pfad, Version, Frage, Lernziele, Grundlagen, schematische Visualisierung, konstruiertes Beispiel, Grenzen/Gegenbeispiel, Single-Choice mit zwei Antworten und Erklärung, Praxisaktion, Glossar- und Quellenreferenzen |
| `model.js` | ausschließlich lokale Fortschrittsdaten, Antwortvergleich und erlaubte interne Links; keine Engines, kein Kursabruf |
| `view.js` | DOM-Knoten und `textContent`; Inhaltsdatei einmal je Seitenlauf laden, Fehler mit Wiederholung; keine HTML-Ausführung |
| `academy.css` | vorhandene Hell-/Dunkel-Tokens, schmale Lesespalte, umbrochene Diagramme, 44-px-Ziele, native Formular- und Disclosure-Elemente |
| Inhaltsgate | `scripts/technical/world/academy-validate.cjs`, über `technical/tests/technical-academy.test.mjs`; prüft auch Quellenexistenz und Ziele gegen echte Router-/Assistent-/Vorlagenverträge |

Die Akademie berechnet keine Indikatoren, prüft keine Aktienkriterien selbst und schreibt keine Kursdaten. Praxislinks führen in die vorhandenen Oberflächen; dort gelten weiterhin deren Engines und Datenhinweise. Es gibt keinen neuen Backend-, Konto-, KI- oder Backtestingdienst.

### Praxisziele

- `#/chart`: Titel wählen; Kerzen, Niveaus, RSI, MACD, ATR, Bollinger, Erkennungshistorie oder Wochenansicht dort ansehen. Keine vorgewählte Aktie, keine künstliche historische Kursreihe.
- `#/vorlagen/establishedUptrend`: bestehende Acht-Kriterien-Vorlage, unveränderte Definition.
- `#/vorlagen`: vorhandene Dreiecksvorlagen auswählen.
- `#/assistent/{trendfolge,ausbruch,momentum,trendwende,ruhephase,niveaus,zeitrahmen,kombination}`: vorhandene Analyseziele, Kriterien und Screener-Übernahme.
- `#/screener`: bestehende Abfrage- und Speicherfunktion; ein Analysejournal wird nicht neu gebaut.

Jede Lektion enthält eine konkrete Arbeitsanweisung. Der Zustand der gewählten Analyse wird nicht als Lernkontrollergebnis ausgegeben. Das Quiz prüft Verständnis, nicht Marktperformance.

### Lokaler Fortschritt

Schlüssel `vu-technical-academy-progress-v1`: `{schemaVersion:1, contentVersion:1, completed:[Lektions-IDs], revisions:{[Lektions-ID]:Lektionsversion}}`. Nur bekannte IDs, keine Dubletten, keine Quizantworten im dauerhaften Abschlussdatensatz, keine Ticker und keine Kontodaten. Eine andere Struktur- oder Inhaltsversion wird nicht still übernommen; für Version 1 beginnt die Anzeige dann ohne Abschlüsse. Bei inhaltlich relevanten Änderungen `contentVersion` erhöhen und diesen Reset dokumentieren. Jede Lektion hat zusätzlich eine redaktionelle Version. Seit Audit 002 wird ein Abschluss nur bei passender Lektionsrevision übernommen. Alte Datensätze ohne Revisionskarte gelten ausschließlich für unveränderte Lektionen mit Version 1; die anderen werden mit Hinweis erneut abgeschlossen.

Abschlüsse sind freiwillig, vom Quiz unabhängig und aufhebbar. Zurücksetzen verlangt eine lokale Bestätigung. Defektes JSON oder gesperrter Speicher führt nicht zum Absturz; fehlgeschlagenes Speichern wird ausdrücklich gemeldet. Kein Sync zwischen Geräten; Löschen der Browserdaten entfernt den Lernstand. Änderung in einem anderen Tab erscheint beim nächsten Öffnen der Ansicht.

Wiederaufnahme: `sessionStorage` unter `vu-technical-academy-session-v1` merkt in diesem Tab Lektions-ID, Inhalts-/Lektionsversion, ausgewählte Antwort, ob sie geprüft wurde und die Leseposition. Die Sitzung enthält keine Analysedaten und wird nicht synchronisiert. Bei gesperrtem Sitzungsspeicher funktioniert die Rückkehr im laufenden SPA über flüchtigen Speicher; ein Reload kann diesen Zustand dann nicht erhalten. Veraltete Sitzungsdaten werden verworfen. Der Rücklink erscheint auf den vorhandenen Technical-Praxisseiten und erfordert keinen Eingriff in deren Fachlogik.

## Fachliche Inhaltsprüfung

Selbstprüfung der redaktionellen Entwürfe gegen vorhandene interne Definitionen; **keine unabhängige externe Fachabnahme behauptet**. Alle Beispiele sind als konstruiert markiert, ohne reale Titel oder rückblickend erfundene Ergebnisse. Jede Lektion enthält eine explizite Grenze und ein realistisches Gegenbeispiel. Die folgenden Quellgruppen wurden abgeglichen:

| Pfad | geprüfte Aussagen | interne Referenzen |
|---|---|---|
| Chart und Marktstruktur | OHLC ohne Intrabar-Reihenfolge, Struktur und Zonen, Daten vor Interpretation | `TECHNICAL_LIBRARY.md`, bestehende Chart-/Methodikansicht in `technical/app.js` |
| Trendfolge | SMA-Fenster, RS vs. RSI, 8 bestehende Bedingungen | `technical/engine/templates.js` (establishedUptrend), `STRATEGY_TEMPLATES_PLAN.md`, `assistant.js` |
| Breakouts | erkannt/bestätigt/invalidiert getrennt, typabhängige Bestätigung, relatives Volumen mit Median 20 Tage | `FORMATION_VALIDATION.md`, `templates.js`, `assistant.js`; keine neue pauschale ATR-Schwelle |
| Momentum | Trend vs. Schwung, RSI-Zonen ohne Prognose, MACD-Linie vs. Histogramm | `quant/engines/technical/indicators.js` (RSI 14; MACD 12/26/9), `assistant.js` |
| Volatilität und Risiko | Spanne vs. Richtung, ATR in Kurseinheiten, Bollinger 20/2, Ausführungsrisiko | `indicators.js` (True Range/ATR, Bollinger), `TECHNICAL_LIBRARY.md`; Positionsrechnung ausdrücklich nur hypothetische Division ohne neue Rechnerfunktion |
| Trendwechsel | Unsicherheit, manuell benannte Divergenzpunkte, Musterform vs. Lesart | `CANDLESTICK_EVIDENCE.md`, `indicators.js`, `TECHNICAL_ASSISTANT.md` |
| Multi-Timeframe | abgeschlossene Perioden, keine Gleichsetzung Tages-/Wochenfenster, Grenzen langer Schlusslinien | `MULTI_TIMEFRAME.md`, `WEEKLY_FORMATIONS.md`, `TECHNICAL_ASSISTANT.md` |
| Analyseroutine | UND/ODER, UNKNOWN, Datenverdacht vs. bestätigt, reproduzierbare Notiz | `DATA_CONTRACT.md`, `assistant.js`, `TECHNICAL_ASSISTANT.md` |

Quellenlinks führen auf den unveränderlichen geprüften #1245-Commit bei GitHub, da `docs/` nicht über Pages ausgeliefert wird. Code und Tests gehen älterer Planungsprosa vor. Keine historische Performancezahl wurde in die Akademie übernommen. Die Trennung ist ausdrücklich: messbarer Zustand → Interpretation; ein Vorteil nach Kosten und außerhalb der Stichprobe ist dadurch nicht nachgewiesen. Die Sprachprüfung ist eine zusätzliche Sperre gegen offensichtliche Versprechen und ersetzt keine fachliche Prüfung.

## Entwicklungs- und Prüfzyklen

- Architektur/Navigation: vollständiger Katalog, Lektionsformat und Glossar; als Pilotansichten Kerzenaufbau und Acht-Kriterien-Vorlage kontrolliert.
- Interaktion: Quiz, lokales Abschließen/Aufheben, Speichersperre, Praxislinks. Der erste Linkabgleich fand eine falsche Vorlagen-ID; gegen `TPL.get` korrigiert.
- Redaktion/Vollständigkeit: alle 32 Entwürfe, konkrete Lernziele, gemeinsames Glossar, Grenzen und Quellen. Umfang ursprünglich auf 250–450 Wörter geprüft; Audit 002 entfernt dafür erzeugte Wiederholungen. Aktuell 173–258 Wörter, Rahmen 120–450 plus alle Pflichtbausteine.
- Browserzyklus: ein zu breit angesetzter Testselektor zählte Überschriften der globalen Navigation mit. Auf `.ta h2` begrenzt; alle 32 Lektionen danach in allen sechs Ansichten geprüft. Keine Abschwächung eines bestehenden Gates.

### Reproduzierbare Prüfungen

```bash
node --test technical/tests/technical-academy.test.mjs
node --test 'technical/tests/*.test.mjs'
node --test 'core/tests/*.test.mjs'
node --test quant/tests/technical-*.test.mjs quant/tests/ti-*.test.mjs
node scripts/quality/check-test-isolation.mjs --suite 'technical/tests/*.test.mjs'
NODE_PATH=/tmp/tc-qa/node_modules node scripts/technical/world/academy-browser-qa.mjs --out /tmp/academy-qa
NODE_PATH=/tmp/tc-qa/node_modules node scripts/technical/world/browser-qa.mjs --out /tmp/technical-qa
```

Playwright 1.58.2 und seit Audit 002 Axe-Core 4.10.3, Chromium 145, Node 24.19.0 lokal (CI verwendet weiterhin Node 22). Die bestehende Technical-CI führt das neue Inhaltsgate über die Tests und die zusätzliche Browserprüfung aus. Screenshots und Berichte werden als CI-Artefakt gespeichert.

Akademie-Browser: **25/25 Prüfgruppen**, darunter **192 vollständige Lektionsaufrufe** (32 × 360/390/1280 × hell/dunkel), Katalog, Glossar, unbekannte ID, richtige/falsche Quizantwort, Tastaturabschluss, Reload-Persistenz, Praxisübergänge, Ladefehler/Wiederholen, gesperrter Speicher, HTML als harmloser Text, kein horizontaler Überlauf, keine Konsolen- oder Seitenfehler im regulären Nutzerweg. Bestehender Technical-Browser: **66/66**. Mobile Ansicht bei 390 px in hell und dunkel zusätzlich per Screenshot gesichtet. Dies ist mobile Browseremulation, kein Test auf physischem iPhone/Safari.

### Ergebnisse der Bestandstests

| Prüfung | Ergebnis |
|---|---|
| Akademie-Inhalte, Verträge, Sicherheit, Umfang, Speicher | 6/6 |
| vollständige Technical-Produktsuite (inkl. Akademie) | 73/73 |
| vollständige Core-Suite | 308/308 |
| Technical-/TI-Engines | 574/574 |
| Technical-Testisolation | keine Produktionsdatei verändert |
| Geschützte Pfade gegen aktuellen #1245-Stand | unverändert: `quant/engines`, `supertrader`, `technical/data`, `templates.js`, `assistant.js` |
| `git diff --check` | ohne Befund |

Anfängliche Fehler durch fehlende Dateien im Sparse-Checkout wurden durch Nachladen der Originaldateien behoben; keine Testschwelle oder Produktionsdatei geändert. Die Core-Suite ist nach vollständigem Bereitstellen ihrer Eingaben 308/308 grün. Nach Übernahme der neuen redaktionellen Assistentenänderungen sind auch die wiederholten Technical- (73/73) und Browserprüfungen (25/25 sowie 66/66) grün. Die 574 Engine-Tests und die Core-Prüfung betreffen unveränderte Dateien.

Maschinenlesbarer Prüfbeleg je Lektion und Quelltext-Hash: [content-review.json](academy-qa/content-review.json).

Details und Screenshots: [academy-qa/report.json](academy-qa/report.json), [bestehende Browserprüfung](academy-qa/existing-browser-report.json). Owner-Abnahme: [STRATEGY_ACADEMY_ABNAHME.md](STRATEGY_ACADEMY_ABNAHME.md).
