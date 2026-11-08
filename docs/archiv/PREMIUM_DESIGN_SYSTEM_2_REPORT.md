# Vision Universe – Premium Design System 2.0

Stand: 8. Oktober 2026. Die Landingpage war die verbindliche Referenz. Die Implementierung betrifft Darstellung, Navigation und dazugehörige Prüfungen.

## Verifizierte Ausgangsbasis

GitHub-Status selbst geprüft: #490, #494–#499 und #501 waren gemergt. #500 wurde nach eigenständigem Shell-Audit (260 Chromium-/156 WebKit-Prüfungen ohne Befund, Quant-Fehler identisch auf main) am 8. Oktober um 09:51 UTC regulär integriert. Eigene Feature-Branches, kein Cherry-Picking unfertiger Arbeiten, keine direkten Änderungen auf main und keine Überschreibung fremder Branches. Spätere bereits gemergte Arbeiten #503/#506 und automatisierte Datenupdates wurden auf Überschneidungen geprüft; keine Überschneidung mit den eigenen Produktdateien. Nach Wiederherstellung des CLI-Zugriffs wurden alle sieben finalen Design-Köpfe lokal gegen main zusammengeführt: null Konflikte, 29 geänderte Pfade und exakte Inhaltsgleichheit mit der geprüften gemeinsamen Preview. Keine fremden Änderungen werden zurückgesetzt.

## Designsystem und Komponenten

- Gemeinsame Light-/Dark-Tokens für Hintergrund, Flächen, Text, Linien und Vision-Universe-Lime; kontrollierte Abstände, moderne Typografie und subtile Lichtwirkung.
- Wiederverwendbare Hero-Struktur: Eyebrow, verständlicher Titel, Nutzenbeschreibung, Suche/Aktion, originales Produktbild und optionale Kurzwege. Opt-in-Klassen vermeiden globale Eingriffe in Tabellen und Charts.
- Originale HUD-Geometrien aus `scripts/home/hud-symbols.html` in `assets/product-icons.svg`. Originalgetreu wiederverwendet: Discover, Quant, Screener, Supertrader, Elliott Wave, Technische Analyse, Fundamentaldaten, Vorsorge (Umbrella) und Layers. Hedgefonds ergänzt die Familie um ein technisches Investorengruppen-Symbol. Keine generierten Rasterbilder, Emoji- oder Lucide-Ersatzicons.
- Größen: Hero 72px mobil/96px Desktop; Produktkarte 52/58px; Menü 36px; Dock 24px. Dunkle quadratische Icon-Fläche und Lime-Linien sorgen für Wiedererkennung.
- Bestehende Shared Shell und Floating Dock erhalten. Original-Geometrie im Dock inline; Menü-Sprite erst beim Öffnen laden. Keine neue UI-Bibliothek und keine zusätzlichen Bildversionen.

## Änderungen je Produkt

| Produkt | Umsetzung | Bewahrt |
|---|---|---|
| Discover | Radar-Icon, Premium-Spacings, lesbare Themes, Suche vor Kurzwegen; echte SVG-Suchsymbole | „Sieh den Markt mit anderen Augen.“, Augenmotiv, Such-/Discovery-Logik |
| Quant | Originales Chip-Icon, unterstützendes Netzwerk; „Jeden Tag sehen, was sich verändert.“ als verdichteter Titel | Vollständiger ursprünglicher Claim und Methodik unmittelbar unter prominenter Suche; Engines, Rankings, Charts |
| Screener | Originales Icon; „Deine Kriterien. Dein Aktienuniversum.“; „Filter hinzufügen“ vor Universumsbild | Alle Filter, Kriterien, simple/pro, gespeicherte Ansichten, Vergleiche |
| Vorsorge | Originales Umbrella-Icon; ruhiger, gemeinsamer Hero und Theme-Farben | „Plane deine Zukunft. Verstehe deine ETFs.“, Plan-/ETF-/Portfolio-Einstiege und Berechnungen |
| Supertrader | Originales Icon, klarere Methoden-/Signalaktionen, Evidenz- und Quellenzugänge | Risiko-/Evidenztexte wortgleich, Freshness, Regeln, Backtests und BNC-Lens-Geometrie |
| Hedgefonds | Technisches Investorengruppen-Icon, „Große Investoren. Klare Einblicke.“, neutrale Research-Farben | Investoren-/Fonds-/Aktiensuche, Porträts, 13F-Datenstände/Quellen, Holdings-Logik |

Repräsentative Unterseiten wurden visuell geprüft und risikoarm bei Abständen, Typografie, Chips, Buttons und Themes angepasst. Funktionale Karten, Tabellen, Charts und Berechnungen bleiben erhalten.

## Globales Menü

Sechs Hauptprodukte plus „Weitere Produkte“. Die Produktbezeichnung verlinkt direkt auf die Startseite; ein eigener nativer Button klappt echte Unterrouten auf. Standardmäßig geschlossen, nur eine Gruppe gleichzeitig offen, passende Untergruppe bei Deep Links automatisch offen. Aktive Route, ARIA-expanded/controls, sichtbarer Anfangsfokus, Tab/Escape und Fokusrückgabe funktionieren. Alle sichtbaren Menüziele mindestens 44 px; ein scrollender Menübereich mit Scroll-Lock, Dock inert während der Öffnung. Öffnung weiterhin über ☰ rechts im Dock.

Alle 30 bisherigen Ziel-URLs bleiben erreichbar. Quant-interner „Quant Screener“ und eigenständiger Screener bleiben getrennte Ziele. Filterlinks mit `f=` und `mode=pro` markieren den Builder korrekt; explizites `view=start` bleibt die Startseite. Legacy-Quant-Pfade, Hash-Routen, Reload und Back/Forward werden geprüft.

## Browser-, Funktions- und Red-Team-QA

Echte Before/After-Screenshots des Pages-Builds: sechs Produkte × fünf Breiten 390/430/768/1024/1440 × Light/Dark × Chromium/WebKit × zwei Stände = 240 Produktaufnahmen, ergänzt um 40 Menüaufnahmen und 20 aktualisierte Aufnahmen des aufgeklappten finalen Menüs (insgesamt 300 Screenshots). Die finale Hero-Matrix zeigt keine horizontalen Überläufe oder JavaScript-Fehler. Beide vollständigen lokalen Shell-Läufe bestanden jeweils 260 Prüfungen ohne Befund. Finale PR-CI erweitert die Matrix auf 270 Chromium- und 162 WebKit-Prüfungen; Quant auf Kopf a2433b205c28 besteht beide Matrizen mit null Befunden sowie 15/15 Shell-Tests. Finale Menü-Matrix: 20 Fälle über alle fünf Breiten und beide Themes/Engines, keine Überläufe, keine Ziele unter 44 px, Escape/Fokusrückgabe korrekt. Zusätzlicher unabhängiger Review: 36 Hero-Prüfungen, 24 Review-Aufnahmen.

WebKit mit iPhone 14-Profil bei schmalen Breiten bestanden. Dies ist WebKit-Engine-Emulation, keine Messung auf physischer iPhone-Hardware; Playwright liefert Safe-Area-Inset 0 und emuliert die Safari-Browserleiste nicht. Die bestehende CSS-Safe-Area-Unterstützung bleibt erhalten.

- Lokale gemeinsame Produktsuites: 801 Tests, 796 bestanden, 5 übersprungen, 0 Fehler. Vorsorge 142/142; Discover 338 bestanden/4 übersprungen; Screener 19 bestanden/1 übersprungen (lokal fehlendes gebautes Universum, im Release-Build vorhanden).
- Quant Browser: 94 Prüfungen, 0 Befunde; 82 Accessibility-Seiten, 0 Verstöße; 8 Ressourcenbudgets bestanden.
- Supertrader: 32 gezielte Unit-Prüfungen und 54 Browser-Prüfungen ohne neue Fehler.
- Gemeinsame Navigation:15 aussagekräftige Tests und Discover-Consolidation-Vertrag bestanden. Browser-Verträge prüfen jetzt exakte reale Ziele und die neue Accordion-Semantik, ohne Schwellenwerte zu senken.
- Unabhängiger Red Team Review:PASS. Gefundene und behobene Probleme: Tablet-Unterlinks42→44 px, initialer Menüfokus vor Sichtbarkeit, implizite Screener-Builder-Deep-Links.
- Finale Fokus-/Deep-Link-Reparaturen im minifizierten Delivery-Build ohne Source-Interception bestätigt.
- Erweiterte CI fand einen ungültig gemessenen Endpunkt bei automatisch nachladenden Screener-Treffern. Nach begrenztem Warmup erreicht die Prüfung nun das tatsächlich aktuell geladene Ende per synchronem Instant-Scroll und misst vor dem nächsten Observer-Append. Dieselbe Dock-Grenze bleibt erhalten; Restscrollweg und CSS-Scroll-Lock führen ausdrücklich zum Fehler. Kein Hochrechnen oder Kappen der Geometrie.
- Zusätzlich eine echte Desktop-Sidebar-Überdeckung behoben: CSS-Maxhöhe berücksichtigt Header, Dock, Safe Area und 16 px Abstand. Das letzte Filter-Bedienelement wird auf freien Abstand und tatsächlichen Klicktreffer geprüft. Filter und Treffer unverändert.
- Unabhängige Schlusskontrolle dieser Reparaturen: acht Normalfälle (Filter/Pro × 1024/1440 × Chromium/WebKit) bestanden; sechs Negativkontrollen erkennen fehlendes Body-Bottom-Padding, Scroll-Lock und wirkungsloses Scrollen korrekt. Evidenz: `scroll-clearance/` im Browser-Archiv. Beide fokussierten vollständigen Browserabläufe bestehen zusätzlich jeweils 36 Prüfungen ohne Befund.
- Zusätzliche exakte Callback-Kontrollen: Discover-Feed bei 390/1440 px besteht in beiden Engines mit eigenem Scrollbereich; künstliches Body-Scroll-Lock bei echtem Dokument-Scrollweg scheitert in beiden Engines wie erwartet (6/6 erwartete Ergebnisse). HTML-Lock bleibt immer ein Fehler.
- Red Team Nachreview: echter Mausklick auf den letzten Reset-Button in Chromium/WebKit bei 1024/1440 px bestanden. Treffer ändern sich erwartungsgemäß von 460 auf 5.700. Die alte CSS-Höhe reproduziert die Dock-Überdeckung; mit der Reparatur bleiben 16 px frei.
- Vorher/Nachher-Funktionsergebnisse unverändert: NVDA-Suche, Buffett mit 299,3 Mrd. Holdings, Ackman-Suche in beiden Engines, ROIC>10% mit 460 Treffern/4.265 ohne Daten. Vorsorge-Ergebnis bei 550 € Sparrate identischer SHA256.

## Performance

Keine Budgets abgeschwächt. Acht originale Quant-Budgets bestanden. Finaler Quant-PR-CI: Aktienseite bei 390/1440 px 5.600.986 dekodierte Bytes und 42 Requests; Grenzen 5.700.000 Bytes/45 Requests. Quant-Screener Desktop: 6.489.334Bytes/30 Requests, Grenze30. Quant-Home mobil:1.703.689Bytes/21 Requests; Desktop im finalen PR-CI: 1.706.075 Bytes/22; Byte-Limit 1.820.000. Lokale kombinierte Preview: 1.704.990 Bytes/22. Menü-Sprite verzögert, Dock-Geometrie inline. SVG-Sprite 5.245 Bytes. Keine zusätzliche globale Sprite-Anfrage auf schweren Aktienseiten.

## Prüfung der integrierten Main-Fassung

Zusätzlicher unveränderter Quant-Browserlauf auf Main `246028f81f71`: 94 Prüfungen ohne Befund, 82 axe-Seiten ohne Verstöße und 8/8 originale Ressourcenbudgets bestanden. Alle 638 neuen automatisierten Logo-/Chartdateien im Pages-Artifact nachweislich byte-identisch; kein Datenstand durch den Designauftrag zurückgesetzt. Main-Messung: Stock 5.600.986Bytes/42 Requests; Home 1440 px1.706.075/22,390 px1.704.774/21; Quant-Screener 1440 px6.490.419/30,390 px6.487.970/28; Profi 6.458.836/20. Evidenz:`integrated-main-quant/`.

Ein Main-Nachlauf meldete Discover-WebKit „First-screen“ mit 5.450 ms > 5.000 ms. Unabhängiger Review bestätigte einen vorhandenen Messfehler: Der Timer zählte zusätzlich Settings-Navigation, Theme-Wechsel und Reload. Separater QA-PR #518 verschiebt den wortgleichen Check unmittelbar hinter den ersten Home-Aufruf. Kein Timer-Reset auf einer warmen Seite, keine Änderung der 5.000-ms-Schwelle, Purpose-/Geometrie- oder Theme-Prüfungen. Echte negative Browserkontrolle mit verzögerter erster HTML-Antwort: Chromium5.906 ms / WebKit 6.061 ms scheitern korrekt; normale Erstladung767/783 ms besteht. Source-Callback exakt extrahiert, keine Fixture-Daten. Der vollständige korrigierte lokale WebKit-Lauf besteht 37/37 Checks, Erstladung1.041 ms. CI von QA-PR #518: Chromium 201/201 und WebKit 37/37 bestanden; WebKit-Erstladung 1.175 ms. Evidenz: `corrected-discover-entry/`.

## Bekannte Baseline-Fehler

Supertrader-CI: 223 eigene Tests bestanden; Discover-Regression 338 bestanden/4 übersprungen. Der anschließende Quant-Regressionsschritt stoppt an denselben fünf Baseline-Fehlern, sodass die spätere Browserstufe dieses Workflows nicht erreicht wird. Die separate lokale Supertrader-Browserprüfung und die produktübergreifenden Shell-Läufe liefern die Browser-Evidenz.


Die fünf Quant-Fehler sind unabhängig auf main belegt und durch diesen Designauftrag unverändert:

1. CTR18 JPM: CONFLICT_CANONICAL_WINS statt MATCH.
2. Golden Five: JPM NO_ADJUSTMENT_AT_ALL:1.
3. Total-Return-Verifikationsskript scheitert an bestehenden Daten.
4. Dessen Unverändertheitsprüfung scheitert ebenfalls.
5. AL-2 erwartet die einmalige Elliott-Migrationsmarkierung SUPPRESSED; der spätere saubere Datenlauf liefert korrekt NONE. Dies ist ein veralteter Fixture-Vertrag.

#508 CI: 2502 Tests/2497 bestanden/5 bekannte Fehler; reparierter Screener-Grenztest bestanden. Foundation-Nachlauf:2522/2517/5, ausschließlich dieselben Baseline-Fehler. Diese roten Checks werden ausdrücklich nicht als grün ausgewiesen. Business-/Datenkorrekturen bleiben außerhalb dieses visuellen Auftrags.

## Evidenz

GitHub-CI-Artefakte (echte Browseraufnahmen und Resultate):

- [Discover QA-Korrektur – komplette Chromium-/WebKit-Evidenz](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37775490919/artifacts/11549543181)
- [Discover nach Umsetzung – Chromium und WebKit](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37770079838/artifacts/11547546938)
- [Finale Quant-Shell – 270 Chromium-/162 WebKit-Prüfungen](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37770085771/artifacts/11547548953)
- [Quant nach Umsetzung – Desktop/Mobile, Accessibility, Budgets](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37770085732/artifacts/11548250885)


Lokaler Evidenzordner:`/workspace/scratch/premium-evidence/`. Dateischema:`{before|final}/{chromium|webkit}/{produkt}-{breite}-{light|dark}.png`. Ressourcen:`performance/final.json`. Quant-Prüfungen:`final-quant/`. Unabhängige Review-Aufnahmen:`/tmp/red-final-review/`.

Die lokale Ausführungsumgebung war zwischenzeitlich nicht erreichbar und wurde anschließend wieder nutzbar. Alle vorherigen Aufnahmen blieben erhalten; das finale aufgeklappte Menü wurde danach in beiden Engines erneut aufgenommen. Lokale interaktive Galerie: `/workspace/scratch/premium-evidence/gallery.html`. Vollständiges Browser-Archiv mit Galerie und relativen PNG-Dateien: `/workspace/scratch/premium-browser-evidence.zip` (Größe gemäß finalem Archiv; entpacken und `gallery.html` öffnen). GitHub-CI speichert zusätzliche Browser-Evidenz als Actions-Artefakte. CLI-GitHub-Zugriff war mit HTTP 503 blockiert; die normale PR-Auslieferung erfolgte über den verbundenen GitHub-Connector.


## Integration und Deployment

Alle sieben Design-PRs und die isolierte QA-Korrektur sind regulär gemergt. Die Foundation wurde mit erhaltener Abstammung integriert; die sechs Produkt-PRs danach gegen main neu ausgerichtet und mit ihren isolierten Diffs gemergt. Keine Repository-Protection umgangen, keine Schwellenwerte gesenkt.

| Bereich | PR | Status | Merge-SHA |
|---|---|---|---|
| Designsystem, Icons und Global Menu | [#507](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/507) | Gemergt | `76993b287dfc` |
| Discover | [#511](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/511) | Gemergt | `57f03c86abdf` |
| Quant | [#512](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/512) | Gemergt | `f2564ba3a288` |
| Vorsorge | [#513](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/513) | Gemergt | `48e58d00b55d` |
| Screener | [#514](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/514) | Gemergt | `82a1377b6c7f` |
| SuperTrader | [#515](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/515) | Gemergt | `dcf9990d714a` |
| Hedgefonds | [#516](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/516) | Gemergt | `246028f81f71` |
| Präzise Discover-Erstladeprüfung | [#518](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/518) | Gemergt | `8345d5b7e0db` |

Voraussetzungen #500 und #508 ebenfalls gemergt. Dieser Bericht wird separat über [#517](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/517) geliefert.

Unabhängige finale Design-PR-CI: 38 Läufe abgeschlossen, 34 grün, vier ausschließlich mit den fünf bewiesenen Quant-Baselinefehlern. Alle sieben Shell-Läufe bestehen 15/15 Tests, 270 Chromium- und 162 WebKit-Prüfungen ohne Befund (insgesamt 3.024 Browserprüfungen). QA-Korrektur #518: alle vier Gates grün, Chromium 201/201 und WebKit 37/37, CI-Erstladung 1.175 ms.

Zusätzlicher Main-Abschluss auf `246028f81f71d29ea9ee9a64d0d173277404389c`: [Shell-Lauf 37774135851](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37774135851) grün, 15/15 Tests, 270 Chromium und 162 WebKit ohne Befund. Alle 29 eigenen Dateien waren nach Integration exakt gleich zur gemeinsam geprüften Preview. Aktuelle Logo-/Chart-Daten sind erhalten; Quant-Budgets auch mit diesen Daten bestanden.

**GitHub Pages: ausgeliefert und überprüft.** [Pages-Lauf 37774135859](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37774135859) vollständig grün: Package, Deploy und nachgelagerte Live-Akzeptanz für den vollständigen UI-SHA `246028f81f71`. Öffentliche Produktion: https://research.visionuniverse.de/. Release-Manifest `release-delivery.json`: PASS. Neun öffentliche Dateien (SVG-Sprite, Shell-JS/CSS und alle sechs Produkt-CSS) bytegenau identisch mit dem geprüften Pages-Artifact; Evidenz `production-verification.json`.

Die nachfolgende QA-Korrektur ist ebenfalls ausgeliefert: tatsächlicher Source-SHA `8345d5b7e0db39a456d58ab40b9ad5c924ad7d90`, [Pages-Lauf 37776438895](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37776438895) Package/Deploy erfolgreich, öffentliches Manifest PASS. Diese Änderung betrifft ausschließlich den Testablauf, die UI-Dateien bleiben identisch. Discover-Main-Nachlauf nach der Korrektur ebenfalls grün: Lauf 37776438984, Chromium 201/201, WebKit 37/37, Erstladung 843 ms.

**Vercel-Preview:** weiterhin „Deployment rate limited — retry in 24 hours.“ Kein Vercel-Deployment behauptet; dies blockiert die verifizierte GitHub-Pages-Auslieferung nicht.

## Verbleibende tatsächliche Punkte

- Die fünf Quant-Baselinefehler bleiben rot und dokumentiert. Keine Daten-, Engine- oder Pipelinekorrektur im visuellen Auftrag.
- Vercel-Preview durch Anbieter-Quota blockiert.
- Physisches iPhone/Safari wurde nicht getestet; WebKit/iPhone-Profil bestanden, Safe-Area-Inset in der Emulation 0.
- Keine bekannte neue kritische UI-Regression. Unabhängige Red-Team-Befunde und die beiden QA-Messfehler sind behoben.

Stand der Belege: 8. Oktober 2026, 12:31 UTC. Die zugehörigen CI- und Main-/Deployment-Audits sind im lokalen Browser-Archiv enthalten.
