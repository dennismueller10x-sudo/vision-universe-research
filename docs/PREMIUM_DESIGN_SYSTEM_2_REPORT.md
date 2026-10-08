# Vision Universe – Premium Design System 2.0

Stand: 8. Oktober 2026. Die Landingpage war die verbindliche Referenz. Die Implementierung betrifft Darstellung, Navigation und dazugehörige Prüfungen.

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

Echte Before/After-Screenshots des Pages-Builds: sechs Produkte × fünf Breiten 390/430/768/1024/1440 × Light/Dark × Chromium/WebKit × zwei Stände = 240 Produktaufnahmen, ergänzt um 40 Menüaufnahmen und 20 aktualisierte Aufnahmen des aufgeklappten finalen Menüs (insgesamt 300 Screenshots). Die finale Hero-Matrix zeigt keine horizontalen Überläufe oder JavaScript-Fehler. Beide vollständigen lokalen Shell-Läufe bestanden jeweils 260 Prüfungen ohne Befund. Finale Menü-Matrix: 20 Fälle über alle fünf Breiten und beide Themes/Engines, keine Überläufe, keine Ziele unter 44 px, Escape/Fokusrückgabe korrekt. Zusätzlicher unabhängiger Review: 36 Hero-Prüfungen, 24 Review-Aufnahmen.

WebKit mit iPhone 14-Profil bei schmalen Breiten bestanden. Dies ist WebKit-Engine-Emulation, keine Messung auf physischer iPhone-Hardware; Playwright liefert Safe-Area-Inset 0 und emuliert die Safari-Browserleiste nicht. Die bestehende CSS-Safe-Area-Unterstützung bleibt erhalten.

- Lokale gemeinsame Produktsuites:801 Tests, 796 bestanden, 5 übersprungen, 0 Fehler. Vorsorge142/142; Discover338 bestanden/4 übersprungen; Screener19 bestanden/1 übersprungen (lokal fehlendes gebautes Universum, im Release-Build vorhanden).
- Quant Browser:94 Prüfungen, 0 Befunde;82 Accessibility-Seiten, 0 Verstöße;8 Ressourcenbudgets bestanden.
- Supertrader:32 gezielte Unit-Prüfungen und 54 Browser-Prüfungen ohne neue Fehler.
- Gemeinsame Navigation:15 aussagekräftige Tests und Discover-Consolidation-Vertrag bestanden. Browser-Verträge prüfen jetzt exakte reale Ziele und die neue Accordion-Semantik, ohne Schwellenwerte zu senken.
- Unabhängiger Red Team Review:PASS. Gefundene und behobene Probleme: Tablet-Unterlinks42→44 px, initialer Menüfokus vor Sichtbarkeit, implizite Screener-Builder-Deep-Links.
- Finale Fokus-/Deep-Link-Reparaturen im minifizierten Delivery-Build ohne Source-Interception bestätigt.
- Erweiterte CI fand einen ungültig gemessenen Endpunkt bei automatisch nachladenden Screener-Treffern. Nach begrenztem Warmup erreicht die Prüfung nun das tatsächlich aktuell geladene Ende per synchronem Instant-Scroll und misst vor dem nächsten Observer-Append. Dieselbe Dock-Grenze bleibt erhalten; Restscrollweg und CSS-Scroll-Lock führen ausdrücklich zum Fehler. Kein Hochrechnen oder Kappen der Geometrie.
- Zusätzlich eine echte Desktop-Sidebar-Überdeckung behoben: CSS-Maxhöhe berücksichtigt Header, Dock, Safe Area und 16 px Abstand. Das letzte Filter-Bedienelement wird auf freien Abstand und tatsächlichen Klicktreffer geprüft. Filter und Treffer unverändert.
- Unabhängige Schlusskontrolle dieser Reparaturen: acht Normalfälle (Filter/Pro × 1024/1440 × Chromium/WebKit) bestanden; sechs Negativkontrollen erkennen fehlendes Body-Bottom-Padding, Scroll-Lock und wirkungsloses Scrollen korrekt. Evidenz: `scroll-clearance/` im Browser-Archiv.
- Vorher/Nachher-Funktionsergebnisse unverändert: NVDA-Suche, Buffett mit 299,3 Mrd. Holdings, Ackman-Suche in beiden Engines, ROIC>10% mit 460 Treffern/4.265 ohne Daten. Vorsorge-Ergebnis bei 550 € Sparrate identischer SHA256.

## Performance

Keine Budgets abgeschwächt. Acht originale Quant-Budgets bestanden. Finaler Quant-PR-CI: Aktienseite bei 390/1440 px 5.600.986 dekodierte Bytes und 42 Requests; Grenzen 5.700.000 Bytes/45 Requests. Quant-Screener Desktop:6.489.334Bytes/30 Requests, Grenze30. Quant-Home mobil:1.703.689Bytes/21 Requests; Desktop im finalen PR-CI: 1.706.075 Bytes/22; Byte-Limit 1.820.000. Lokale kombinierte Preview: 1.704.990 Bytes/22. Menü-Sprite verzögert, Dock-Geometrie inline. SVG-Sprite 5.245 Bytes. Keine zusätzliche globale Sprite-Anfrage auf schweren Aktienseiten.

## Bekannte Baseline-Fehler

Supertrader-CI: 223 eigene Tests bestanden; Discover-Regression 338 bestanden/4 übersprungen. Der anschließende Quant-Regressionsschritt stoppt an denselben fünf Baseline-Fehlern, sodass die spätere Browserstufe dieses Workflows nicht erreicht wird. Die separate lokale Supertrader-Browserprüfung und die produktübergreifenden Shell-Läufe liefern die Browser-Evidenz.


Die fünf Quant-Fehler sind unabhängig auf main belegt und durch diesen Designauftrag unverändert:

1. CTR18 JPM:CONFLICT_CANONICAL_WINS statt MATCH.
2. Golden Five:JPM NO_ADJUSTMENT_AT_ALL:1.
3. Total-Return-Verifikationsskript scheitert an bestehenden Daten.
4. Dessen Unverändertheitsprüfung scheitert ebenfalls.
5. AL-2 erwartet die einmalige Elliott-Migrationsmarkierung SUPPRESSED; der spätere saubere Datenlauf liefert korrekt NONE. Dies ist ein veralteter Fixture-Vertrag.

#508 CI:2502 Tests/2497 bestanden/5 bekannte Fehler; reparierter Screener-Grenztest bestanden. Foundation-Nachlauf:2522/2517/5, ausschließlich dieselben Baseline-Fehler. Diese roten Checks werden ausdrücklich nicht als grün ausgewiesen. Business-/Datenkorrekturen bleiben außerhalb dieses visuellen Auftrags.

## Evidenz

GitHub-CI-Artefakte (echte Browseraufnahmen und Resultate):

- [Discover nach Umsetzung – Chromium und WebKit](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37764215429/artifacts/11544570571)
- [Quant nach Umsetzung – Desktop/Mobile, Accessibility, Budgets](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37763652203/artifacts/11543329900)


Lokaler Evidenzordner:`/workspace/scratch/premium-evidence/`. Dateischema:`{before|final}/{chromium|webkit}/{produkt}-{breite}-{light|dark}.png`. Ressourcen:`performance/final.json`. Quant-Prüfungen:`final-quant/`. Unabhängige Review-Aufnahmen:`/tmp/red-final-review/`.

Die lokale Ausführungsumgebung war zwischenzeitlich nicht erreichbar und wurde anschließend wieder nutzbar. Alle vorherigen Aufnahmen blieben erhalten; das finale aufgeklappte Menü wurde danach in beiden Engines erneut aufgenommen. Lokale interaktive Galerie: `/workspace/scratch/premium-evidence/gallery.html`. Vollständiges Browser-Archiv mit Galerie und relativen PNG-Dateien: `/workspace/scratch/premium-browser-evidence.zip` (ca. 64 MB; entpacken und `gallery.html` öffnen). GitHub-CI speichert zusätzliche Browser-Evidenz als Actions-Artefakte. CLI-GitHub-Zugriff war mit HTTP 503 blockiert; die normale PR-Auslieferung erfolgte über den verbundenen GitHub-Connector.

## PR- und Integrationsstatus

Shared Shell: #490, #494–#499 und #501 vor Implementierung als integriert verifiziert. #500 nach unabhängiger Baseline-/Browserprüfung integriert. #508 (semantischer Screener-Vertrag) integriert.

Foundation #507 und Produkt-PRs #511–#516: Nach erfolgreicher unabhängiger Clearance-Reparatur vollständige CI erneut laufend. Jeder Produkt-PR verändert ausschließlich seine vorgesehenen UI-Pfade. Die Foundation enthält zusätzlich eine minimale gemeinsame Dock-Kompatibilitätskorrektur der bestehenden Screener-Sidebar.

Dokumentation #517. Tatsächliche Merge- und Pages-Stände werden nach Abschluss ergänzt. Vercel meldet aktuell „Deployment rate limited — retry in 24 hours.“; dies ist ein separater externer Preview-Status und kein bestandener Deploy-Nachweis.
