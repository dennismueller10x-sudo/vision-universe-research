# Strategie-Akademie · visuelle Piloten

Stand: 03.11.2026. Implementierung auf eigenem Branch aus main. Zur visuellen Owner-Abnahme vorbereitet; dieser Auftrag veröffentlicht oder mergt keinen weiteren PR.

## Was sich ändert

Die Lektionen **Aufwärtstrends erkennen** (`trend-1`), **Breakout und Bestätigung** (`breakout-2`) und **RSI** (`momentum-2`) beginnen mit einem beschrifteten Chart-Lernbild. Drei Schaltflächen führen durch Beobachtung, Einordnung und Gegenbeispiel. Das Lernbild steht vor den Textblöcken; Grundlagen und Fachbegriffe lassen sich bei Bedarf aufklappen.

Das gemeinsame Muster lautet: **So sieht es im Chart aus → Lernziel → Was ist das? → Warum ist das wichtig? → Typischer Fehler / Gegenbeispiel → Lernkontrolle → Jetzt selbst ansehen.** Quellen sind aufklappbar, Grenzen sichtbar. Praxislinks öffnen den bestehenden Assistenten, Screener oder Chart Studio. Die bisherige Rücknavigation erhält Quiz-Auswahl, Abschluss und zusätzlich die gewählte Lernszenen-ID.

Die 29 weiteren Lektionen behalten ihre bisherige Darstellung. Die zentrale Academy bleibt derselbe Einstieg; kein zweiter Katalog, keine zweite Lernfortschrittsverwaltung.

## Fachliche Gegenprüfung

| Pilot | Gezeigte Unterscheidung | Bewusst eingehaltene Grenze / interne Quelle |
|---|---|---|
| Aufwärtstrend | Höhere Hochs/Tiefs; Kurs über SMA 200 bei sinkenden Hochs; einzelner Kurssprung | Einzelner Lagefilter beweist keinen stabilen Trend. Bestehende `technical/engine/templates.js`, `STRATEGY_TEMPLATES_PLAN.md`, auditiertes Beispiel und Quiz bleiben maßgeblich. |
| Breakout | Docht über der Begrenzung; Schluss darüber; anschließende Rückkehr | Keine neue Bestätigungsschwelle, Wartefrist oder Erfolgsaussage. Es entscheidet die bestehende typabhängige Regel; `FORMATION_VALIDATION.md` und Vorlagen unverändert. |
| RSI | Skala 0–100, übliche Zonen 70/30; länger hoher/niedriger RSI im jeweiligen Kurskontext | RSI 75 ist keine Wahrscheinlichkeit. Keine Umkehrpflicht oder Verwechslung mit relativer Stärke zu SPY. Wilder-Erklärung, bestehende Indikator-Engine und Fidelity-Fachquelle bleiben erhalten. |

Alle Kurse, Kerzen und Indikatorlinien sind **frei gezeichnete schematische Lehrbilder**, keine historischen Daten, keine errechneten Indikatoren und keine Setups mit behaupteter Erfolgsquote. Jede Grafik trägt diesen Hinweis und ein eigenes textliches Äquivalent (`title`/`desc`, dazu sichtbare Erklärung). Farbe allein transportiert keine Aussage: Beschriftungen, gestrichelte Referenzlinien und markierte Punkte ergänzen die Linien.

Ein Regressionstest prüft den SHA-256 des vollständigen bisherigen Inhaltsobjekts nach Entfernen der drei optionalen `presentation`-Felder: `543a2a4f9259cb11d6edfdb8535487f83deba469e77d2a43c706bf3739d32ff5`. Damit bleiben **alle 32 Fachtexte, Lernziele, Fragen/Antworten, Glossareinträge, Quellen, Praxisziele und Lektionsversionen** erhalten. Auch die 29 anderen Lektionen werden nicht redaktionell verändert. Keine Änderung an Indikatorformeln oder Strategieregeln.

## Wiederverwendung und Skalierung

Es bleibt eine Inhaltsdatei: `technical/academy/content.json`. Optionale `presentation`-Objekte enthalten kurze Einstiegstexte und drei Szenen mit `label`, `title`, `observed`, `meaning`, `description`. `presentation.version` ist 1. `visuals.js` zeichnet ausschließlich fest vorgegebene SVG-Geometrie für die passenden Szenen. Es erhält keine Kursdaten, lädt keine Engines und führt keinen Inhalt als Markup aus.

`view.js` verwendet dieselben Quiz-, Abschluss-, Glossar- und Praxisfunktionen für beide Darstellungen. Fehlt das optionale Objekt oder ist es unbrauchbar, wird die bisherige Lektionsansicht angezeigt. Die Inhalts-/Lektionsversionen bleiben unverändert, weil der auditierte Lernstoff unverändert ist; vorhandene Abschlüsse müssen nicht wiederholt werden. Szenen werden nur übernommen, wenn ihre ID zur betreffenden Lektion gehört.

Nach Abnahme der drei Piloten kann das Muster lektionenweise wachsen:

| Lerninhalt | Wiederverwendbares Muster | Je Lektion fachlich zu liefern |
|---|---|---|
| Chartstruktur, Trendfolge, Trendwechsel | Markierte Punkte/Referenzlinien, Beobachtung und Einordnung | Eigenes passendes Lehrbild und Gegenbeispiel; keine Kopie desselben Verlaufs in alle Lektionen |
| Breakouts | Begrenzung und Kerzen, Zustand gegenüber späterem Verlauf | Formationstyp und tatsächlich bestehende Regel; keine pauschale Ausbruchsschwelle |
| Momentum, Volatilität | Kurs plus klar getrenntes Indikator-Unterfenster | Eigene MACD-/ATR-/Bollinger-Skizzen mit richtigen Einheiten und Grenzen; kein RSI-Diagramm umbenennen |
| Multi-Timeframe | Vergleichsrahmen mit einheitlichen Beschriftungen | Drei explizite Zeitfenster; abgeschlossene Kerzen und vorhandene Datenbegrenzungen |
| Analyseroutine | Dieselben Karten, Quiz und Praxisübergänge | Passendes Beispiel einer dokumentierten Analyse statt eines beliebigen Charts |

Dabei werden lediglich Präsentationstyp und Inhalt ergänzt. Es entstehen weder neue Indikatorberechnungen noch eine zusätzliche Chart-Engine. Das bestehende `technical/ui/chart.js` bleibt die produktive Analyse; die Lernbilder erklären einzelne Gedanken mit ausdrücklich konstruierten Szenen.

## Prüfungen und Nachweise

Die automatisierte QA prüft alle 32 Lektionen weiter und ergänzt die drei Piloten bei **360, 390 und 1280 px, jeweils hell/dunkel**: alle neun Szenen, Tastatur/Enter, ausgewählter Zustand, Diagrammbeschreibungen, unveränderte Quizantworten und Praxis-Rückkehr einschließlich Szenenwiederaufnahme. Hinzu kommen Axe-A/AA-Prüfungen je Szene, mindestens 44 px große Touch-Ziele, doppelte HTML-Textgröße, fehlerhafte Präsentationen und als Text behandeltes Markup.

Die konkreten abgeschlossenen Ergebnisse stehen in [academy-visual-qa/results.json](academy-visual-qa/results.json), der vollständige Browserbericht in [academy-visual-qa/report.json](academy-visual-qa/report.json). Die Screenshot-Matrix und kurze Owner-Prüfliste stehen in [STRATEGY_ACADEMY_VISUAL_ABNAHME.md](STRATEGY_ACADEMY_VISUAL_ABNAHME.md).

Die Screenshots zeigen die lokale, integrierte Testfassung dieses Branches. Die bisherige Academy bleibt live; diese Pilotüberarbeitung ist noch nicht veröffentlicht. Chromium mit mobilen Viewports, **kein physisches iPhone und kein Safari-Test**. Automatische Axe-Prüfungen sind keine vollständige manuelle WCAG-Zertifizierung.
