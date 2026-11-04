# Strategie-Akademie · vollständiger visueller Rollout

Alle **32 Lektionen mit 96 Szenen** verwenden denselben visuellen Lernrahmen. Der Owner hat Konzept, Integration von #1269, vollständigen Rollout und reguläre Veröffentlichung ausdrücklich freigegeben. Eine weitere Pilot- oder Abnahmephase ist nicht erforderlich.

#1269 wurde nach erfolgreichen Checks regulär als `f29b140bc918fe9435986ea29d0d1bc60b3ec04d` gemergt. Seine reguläre Veröffentlichung [41582905258](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/41582905258) und authentifizierte Live-QA [41583910579](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/41583910579) sind erfolgreich. Dieses Dokument beschreibt den anschließenden vollständigen Rollout; dessen exakte Merge-, Veröffentlichungs- und Live-QA-Nachweise werden am zugehörigen PR nach Abschluss festgehalten.

## Fertiger Umfang

| Pfad | Eigene Lernbilder |
|---|---|
| Chart und Marktstruktur | OHLC und mögliche Bewegungsreihenfolgen, Hoch-/Tieffolgen, Reaktionszonen und Kurslücken, Lesereihenfolge und alter Datenstand |
| Trendfolge | Marktstruktur gegenüber Linienfilter, SMA-Prinzip und getrennte Lagefilter, RS gegenüber absoluter Veränderung, acht Kriterien und 21-Tage-Vergleich |
| Breakouts | Dreieckstypen, Docht gegenüber Schlusskurs und vorhandener Bestätigungsregel, relativer Volumenvergleich, Bestätigung und späterer Rücklauf |
| Momentum | Gleiche Zeitabschnitte mit anderem Zuwachs, RSI-Skala und anhaltend hohe/niedrige Zonen, MACD/Signal/Histogramm, Filterkombinationen |
| Volatilität und Risiko | Gleicher Endpunkt mit anderer Schwankung, True Range gegenüber ATR, Bänder und offene Ausweitungsrichtung, Bildungsrechnung und Ausführungsgrenzen |
| Trendwechsel | Strukturgegenbefund und Rücknahme, Divergenz an gleichen Zeitpunkten, ähnliche Kerzenform bei anderem Kontext, widersprüchliche/fehlende Indikatorwerte |
| Multi-Timeframe | Tag/Woche/Monat, laufende gegenüber abgeschlossenen Perioden, verschiedene Lagezustände, Kerzen gegenüber langen Schlusslinien und überlappende Daten |
| Eigene Analyseroutine | Ziel vor Trefferliste, UND/ODER-Mengen, Historie/Aufwärmphase/Datenverdacht, nachvollziehbare Notiz und spätere andere Treffer |

Die drei freigegebenen Piloten bleiben erhalten. Die übrigen 29 Lektionen haben jeweils eigene Szenen. Kursgrafiken wurden nicht durch Austauschen der Beschriftung vervielfältigt. Gemeinsame Karten, Linien, Kerzen, Punkte und Vergleichsrahmen bleiben bewusst wiederverwendbare Komponenten.

## Darstellung und Verträge

Der Chart beziehungsweise das passende Lernbild steht früh in der Lektion. Die drei Schaltflächen schalten Beobachtung, Vergleich und Gegenbeispiel um. Sichtbarer Befund und Bedeutung werden getrennt erklärt. Kurze Einführung, Zweck, typischer Fehler und Grenzen bleiben sichtbar; ausführliche Grundlagen, Begriffe und Quellen sind aufklappbar. Quiz und freiwilliger Abschluss bleiben dieselben Funktionen.

Die bestehenden Praxisziele sind unverändert. Zusätzliche Links benennen den tatsächlich geöffneten Einstieg; für Chart-Lektionen führt „Analyse-Assistent öffnen“ zur vorhandenen Zielauswahl. Ein Rückweg erhält Antwort, gewähltes Lernbild und lokalen Abschluss. Es gibt keine Positionsgrößenfunktion, keine automatische Divergenzerkennung und keinen neuen Filterparser.

Schwarz/Weiß und neutrale Grautöne tragen die Diagramme. Neongrün markiert Auswahl, Vergleich oder den betrachteten Bereich. Gestrichelte Linien, Beschriftungen und Punkte tragen die Bedeutung zusätzlich; Farbe allein genügt nicht. Keine neuen Animationen oder externen Schrift-/Bilddienste.

Eine Inhaltsquelle bleibt `technical/academy/content.json`. Die 29 zusätzlichen optionalen `presentation`-Objekte enthalten jeweils drei feste Zeichnungen. `visuals.js` rendert ausschließlich begrenzte, erlaubte SVG-Primitiven und Text. Es erhält keine Marktdaten und ruft keine Berechnungsengine auf. Unbekannte Zeichenbefehle, fremde Attribute, unpassende Themen und beschädigte Szenen fallen auf die vorhandene Ansicht zurück.

Alle Fachtexte, Lernziele, Quizfragen/Antworten, Glossareinträge, Quellen, Praxisziele und Lektionsversionen bleiben erhalten. Ein Regressionstest entfernt nur `presentation` und prüft das gesamte bisherige Inhaltsobjekt gegen SHA-256 `543a2a4f9259cb11d6edfdb8535487f83deba469e77d2a43c706bf3739d32ff5`. Bestehende Abschlüsse bleiben gültig; es wird kein künstlicher Versionswechsel erzwungen.

## Fachliche Gegenprüfung

[Prüfprotokoll aller 32 Lektionen und 96 Szenen](academy-rollout-qa/visual-review.json). Die Prüfung verbindet vorhandene interne Quellen, Sichtprüfung und separate numerische/semantische Regressionen. Sie ist keine behauptete externe Zertifizierung.

Besonders geprüft: OHLC-Werte und Reihenfolgegrenze; relatives Volumen 150/100 = 1,5 mit Vergleich ohne aktuellen Tag; MACD −2 und Signal −3 ergeben Histogramm +1 bei MACD unter null; True Range 6 gegenüber Tageshoch-Tief-Spanne 2, nicht ATR 6; SMA-3-Lehrmittel 102; RS +5 Prozentpunkte trotz absolutem Verlust; A innerhalb beider UND-Mengen; vorhandene SMA-200/40/10-Zuordnung; keine erfundenen langen Wochenhochs/-tiefs.

Die Lehrbilder sind eindeutig **konstruiert**. Beispielzahlen erklären vorhandene Begriffe; sie sind keine historischen Marktbeobachtungen. Bestätigung, Beschreibung und späterer Erfolg bleiben getrennt. Es werden keine neuen Indikatorformeln, Strategieregeln, Erfolgsquoten oder Prognosen behauptet.

## Abschließende QA und Veröffentlichung

Die Browserprüfung erfasst alle 32 Lektionen und alle 96 Szenen bei 360/390/1280 Pixeln, jeweils hell/dunkel: 192 vollständige Lektionskombinationen und 576 Szenenprüfungen. Dazu gehören Axe-A/AA, Diagrammgrenzen, Tastatur, mindestens 44 px große Touch-Ziele, doppelte HTML-Textgröße, richtige und falsche Quizantworten, Abschluss nach Reload, Praxiswechsel einschließlich Zusatzlinks und Rücknavigation mit Antwort/Lernbild. Die bisherige Technical-QA und 18 vollständigen Assistent → Screener → Chart-Nutzerreisen bleiben enthalten.

Die konkreten abgeschlossenen lokalen Ergebnisse, Screenshots und Quellenprüfungen werden zusammen mit diesem Dokument im Ordner `academy-rollout-qa/` gesichert. Der authentifizierte Live-Lauf prüft nach der regulären Auslieferung dieselbe vollständige Matrix; dabei muss der veröffentlichte Inhalt mit der geprüften Fassung übereinstimmen. Synthetische Fehler-/Speicherinjektionen und das künstliche Kaltstartprofil werden lokal geprüft, nicht auf der Produktionswebsite injiziert.

Physisches iPhone und Safari werden nicht als getestet behauptet: Die mobile QA nutzt Chromium-Browseremulation. Quant, Supertrader, Security Master, Kursdaten und Zertifizierungsgates bleiben unverändert. Keine neue Backend-, Konten-, Daten- oder kostenpflichtige Dienstinfrastruktur.


## Bestandene lokale Abschlussprüfungen

| Prüfung | Ergebnis |
|---|---|
| Technical und zentrale Academy-Engine | 103/103 |
| Core | 308/308 |
| Inhalts-/Audit-/Visual-Regressionsfälle (in 103 enthalten) | 26/26 |
| Vollständige Academy-Browserprüfung | 84/84 |
| Bestehende Technical-Browserprüfung | 66/66 |
| Lektions-/Viewport-/Themekombinationen | 192/192 |
| Szenen und Axe-Prüfungen | 576/576 |
| Quiz, Abschluss und Praxis-Rückkehr | 192/192 |
| Vollständige Assistent-/Screener-/Chart-Nutzerreisen | 18/18 |
| Produktionsdaten-Isolation, Hero-Synchronität und Schutzpfade | ohne Befund |

[Maschinenlesbare Ergebnisse](academy-rollout-qa/results.json), [vollständiger Browserbericht](academy-rollout-qa/report.json), [Screenshots aller 32 Lektionen und Desktop-Vergleiche](academy-rollout-qa/SCREENSHOTS.md). Die Screenshots dokumentieren diesen integrierten Teststand; die tatsächlichen Produktionsnachweise folgen im finalen PR-Status nach der autorisierten Veröffentlichung.
