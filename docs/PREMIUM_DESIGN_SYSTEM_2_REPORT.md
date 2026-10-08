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

Sechs Hauptprodukte plus „Weitere Produkte“. Die Produktbezeichnung verlinkt direkt auf die Startseite; ein eigener nativer Button klappt echte Unterrouten auf. Standardmäßig geschlossen, nur eine Gruppe gleichzeitig offen, passende Untergruppe bei Deep Links automatisch offen. Aktive Route, ARIA-expanded/controls, sichtbarer Anfangsfokus, Tab/Escape und Fokusrückgabe funktionieren. Alle sichtbaren Menüziele mindestens44px; ein scrollender Menübereich mit Scroll-Lock, Dock inert während der Öffnung. Öffnung weiterhin über ☰ rechts im Dock.

Alle30 bisherigen Ziel-URLs bleiben erreichbar. Quant-interner „Quant Screener“ und eigenständiger Screener bleiben getrennte Ziele. Filterlinks mit `f=` und `mode=pro` markieren den Builder korrekt; explizites `view=start` bleibt die Startseite. Legacy-Quant-Pfade, Hash-Routen, Reload und Back/Forward werden geprüft.

## Browser-, Funktions- und Red-Team-QA

Echte Before/After-Screenshots des Pages-Builds: sechs Produkte × fünf Breiten390/430/768/1024/1440 × Light/Dark × Chromium/WebKit × zwei Stände =240 Produktaufnahmen, ergänzt um40 Menüaufnahmen. Die finale Hero-Matrix zeigt keine horizontalen Überläufe oder JavaScript-Fehler. Zusätzlicher unabhängiger Review:36 Hero-Prüfungen,24 Review-Aufnahmen.

WebKit mit iPhone14-Profil bei schmalen Breiten bestanden. Dies ist WebKit-Engine-Emulation, keine Messung auf physischer iPhone-Hardware; Playwright liefert Safe-Area-Inset0 und emuliert die Safari-Browserleiste nicht. Die bestehende CSS-Safe-Area-Unterstützung bleibt erhalten.

- Lokale gemeinsame Produktsuites:801 Tests,796 bestanden,5 übersprungen,0 Fehler. Vorsorge142/142; Discover338 bestanden/4 übersprungen; Screener19 bestanden/1 übersprungen (lokal fehlendes gebautes Universum, im Release-Build vorhanden).
- Quant Browser:94 Prüfungen,0 Befunde;82 Accessibility-Seiten,0 Verstöße;8 Ressourcenbudgets bestanden.
- Supertrader:32 gezielte Unit-Prüfungen und54 Browser-Prüfungen ohne neue Fehler.
- Gemeinsame Navigation:15 aussagekräftige Tests und Discover-Consolidation-Vertrag bestanden. Browser-Verträge prüfen jetzt exakte reale Ziele und die neue Accordion-Semantik, ohne Schwellenwerte zu senken.
- Unabhängiger Red Team Review:PASS. Gefundene und behobene Probleme: Tablet-Unterlinks42→44px, initialer Menüfokus vor Sichtbarkeit, implizite Screener-Builder-Deep-Links.
- Finale Fokus-/Deep-Link-Reparaturen im minifizierten Delivery-Build ohne Source-Interception bestätigt.
- Vorher/Nachher-Funktionsergebnisse unverändert: NVDA-Suche, Buffett299,3Mrd. Holdings, Ackman-Suche in beiden Engines, ROIC>10% mit460 Treffern/4265 ohne Daten. Vorsorge-Ergebnis bei550€ Sparrate identischer SHA256.

## Performance

Keine Budgets abgeschwächt. Acht originale Quant-Budgets bestanden. Aktienseite390/1440:5.599.901 dekodierte Bytes,42 Requests; Grenzen5.700.000/45. Quant-Screener Desktop:6.489.334Bytes/30 Requests, Grenze30. Quant-Home mobil:1.703.689Bytes/21 Requests; Desktop:1.704.990Bytes/22; Byte-Limit1.820.000. Menü-Sprite verzögert, Dock-Geometrie inline. SVG-Sprite5.245Bytes. Keine zusätzliche globale Sprite-Anfrage auf schweren Aktienseiten.

## Bekannte Baseline-Fehler

Die fünf Quant-Fehler sind unabhängig auf main belegt und durch diesen Designauftrag unverändert:

1. CTR18 JPM:CONFLICT_CANONICAL_WINS statt MATCH.
2. Golden Five:JPM NO_ADJUSTMENT_AT_ALL:1.
3. Total-Return-Verifikationsskript scheitert an bestehenden Daten.
4. Dessen Unverändertheitsprüfung scheitert ebenfalls.
5. AL-2 erwartet die einmalige Elliott-Migrationsmarkierung SUPPRESSED; der spätere saubere Datenlauf liefert korrekt NONE. Dies ist ein veralteter Fixture-Vertrag.

#508 CI:2502 Tests/2497 bestanden/5 bekannte Fehler; reparierter Screener-Grenztest bestanden. Foundation-Nachlauf:2522/2517/5, ausschließlich dieselben Baseline-Fehler. Diese roten Checks werden ausdrücklich nicht als grün ausgewiesen. Business-/Datenkorrekturen bleiben außerhalb dieses visuellen Auftrags.

## Evidenz

Lokaler Evidenzordner:`/workspace/scratch/premium-evidence/`. Dateischema:`{before|final}/{chromium|webkit}/{produkt}-{breite}-{light|dark}.png`. Ressourcen:`performance/final.json`. Quant-Prüfungen:`final-quant/`. Unabhängige Review-Aufnahmen:`/tmp/red-final-review/`.

Die temporäre lokale Ausführungsumgebung war während der Auslieferung nicht erreichbar. Bereits erzeugte Aufnahmen und Resultate sind dadurch nicht erneut verpackt worden; GitHub-CI speichert zusätzliche Browser-Evidenz als Actions-Artefakte. Der gesamte produktive Code war zuvor auf eigenen GitHub-Branches gesichert.

## PR- und Integrationsstatus

Shared Shell: #490, #494–#499 und #501 vor Implementierung als integriert verifiziert. #500 nach unabhängiger Baseline-/Browserprüfung integriert. #508 (semantischer Screener-Vertrag) integriert.

| PR | Bereich | Status |
|---|---|---|
| [#507](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/507) | Designsystem, Original-Icons, Accordion, QA-Verträge | CI läuft |
| [#511](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/511) | discover | CI läuft; bis zur Foundation-Integration darauf gestapelt |
| [#512](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/512) | quant | CI läuft; bis zur Foundation-Integration darauf gestapelt |
| [#513](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/513) | vorsorge | CI läuft; bis zur Foundation-Integration darauf gestapelt |
| [#514](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/514) | screener | CI läuft; bis zur Foundation-Integration darauf gestapelt |
| [#515](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/515) | supertrader | CI läuft; bis zur Foundation-Integration darauf gestapelt |
| [#516](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/516) | hedgefonds | CI läuft; bis zur Foundation-Integration darauf gestapelt |

Deployment wurde in diesem Zwischenstand nicht behauptet. Die finale Integration und das tatsächliche Pages-Deployment werden nach abgeschlossenen Prüfungen ergänzt.
