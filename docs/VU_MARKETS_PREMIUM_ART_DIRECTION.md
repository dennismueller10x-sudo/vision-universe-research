# VISION UNIVERSE® MÄRKTE — PREMIUM CONSUMER EXPERIENCE
## Art-Direction-Report

Stand 2026-09-25. Umsetzung auf Markets 3.0 (siehe `VU_MARKETS_3_CONSUMER_INTELLIGENCE.md`). Merge: PR #220, Commit `e9d6977c` auf `main`. Produktion: `research.visionuniverse.de/discover/#/maerkte`.

---

## 1. Ausgangslage

Markets 3.0 (PR #216–#218) hatte die Markteinordnung bereits vollständig und korrekt gebaut: Hero, fünf Dimensionen, Vorher/Jetzt, Verlauf, Marktbreite, Cross Asset, Markt jetzt, Detailseiten — deterministisch, ohne Score, ohne Prognose. Der Auftrag für diesen Report war ausdrücklich **kein Neubau**: Die Analyse-Logik, die Datenwahrheit und alle DOM-Verträge (Testsuite) sollten unverändert bleiben. Ziel war ausschließlich die **Inszenierung** — dieselben Werte, hochwertiger und eigenständiger dargestellt, orientiert an mitgelieferten Referenzbildern (Gauges, Szenario-Panels, große Diagramme), ohne deren Inhalte, Scores oder Wahrscheinlichkeiten zu übernehmen.

## 2. Designproblem

Vor dieser Änderung bestand die Seite überwiegend aus flachen, gleichartigen Flächen: eine horizontale Balkenreihe als Stufenanzeige, Textkarten, eine einfache Linien-/Bandgrafik für den Verlauf. Funktional korrekt, aber visuell ohne Dramaturgie — kein Element, das die zentrale Aussage („Wie ist das Marktumfeld – und warum?") in den ersten fünf Sekunden trägt, und kein durchgängiger Rhythmus beim Scrollen.

## 3. Art Direction

Leitidee: **ein Premium-Finanzmedium, kein Dashboard.** Dunkler, kinoartiger Hero und Verlauf als redaktionelle „Bühnen"; dazwischen helle, dichte Instrumentenflächen (fünf Dimensionen, Marktbreite) und redaktionelle Listen ohne Kartenrahmen (Warum, Worauf es ankommt). Farbe trägt ausschließlich Bedeutung: Grün/Rot/Gold für die bestehende Zustandslogik, Blau für Kontext, **Lila neu eingeführt für „Intelligence/Szenario/Regime"** (Sektionskicker der analytischen Abschnitte, Base-Case-Akzent). Keine neue Farbsemantik für Kurs- oder Renditebewegungen.

## 4. Design System (Ergänzungen)

- `--m3-purple` (Intelligence/Szenario), `--m3-glass`/`--m3-glass-line` (Glasflächen), je mit hell/dunkel-Variante.
- Lokale Token-Umdefinition für „immer dunkle" Flächen (Hero, Verlauf, Detail-Chart): `--v2-bg/-ink/-muted/-line/-panel` und `--discover-up/-down` werden innerhalb der Fläche auf die im Projekt bereits etablierten Dunkel-Varianten gesetzt (z. B. `#3fd07f`/`#f0675c` aus `discover.css`) — unabhängig vom hell/dunkel-Modus der Seite, nach demselben Muster wie der bestehende Hero.
- Asset-bewusste Akzentfarbe über das **bereits vorhandene** `data-asset-class`-Attribut (keine neue Datenquelle): ETF/Index Blau, Krypto Lila, Edelmetalle Gold, Energie Orange, Renditen/Zinsen Neutralgrau, FX Grün — auf Übersichtskarten und Detailseiten, ersetzt nirgends die Gewinn-/Verlust- oder Renditefarbe.

## 5. Hero / Market Regime Visual

Neu: ein **radialer SVG-Gauge** (Bogen, fünf Segmente, Nadel, Geisterpunkt für die vorherige Bewertung) neben dem bestehenden Stufenspektrum — rein dekorativ (`aria-hidden`), gespeist aus genau denselben Werten (`environment.level`, vorherige Stufe), die auch das Spektrum zeigt. Keine neue Zahl, keine zusätzliche Präzision. Das Spektrum bleibt als kompakte, barrierefreie Legende darunter erhalten (`role="img"`, vollständiges `aria-label`).

## 6. Szenarien (Bullish/Base/Bearish)

„Was würde das Bild verändern?" ist jetzt ein **Drei-Karten-Bild**: links die Bedingungen, die das Umfeld positiver machen würden, mittig eine neue **Base-Case-Karte** (identische Daten wie der Hero: aktuelle Stufe, Aussage), rechts die Bedingungen für ein negativeres Bild. Ausschließlich aus `p.changes`/`p.environment` — echten Schwellen und Messwerten (z. B. „DIA 2,9 % bis über beide Linien") — keine Wahrscheinlichkeit erfunden, wie im Auftrag verlangt. Getestet: weiterhin genau zwei `.dx-m3-aendern-spalte`-Elemente (die Base-Case-Karte trägt eine eigene Klasse und zählt nicht mit).

## 7. Fünf Dimensionen

Struktur unverändert (ein Instrument, fünf Zeilen, echte Schwellen). Vertiefte Optik: kräftigere Zonenfarben, Tiefenschatten auf der Spur, Farbverlauf auf den Rollen-Icons. Keine neue Kennzahl pro Zeile — bewusst kein Mini-Gauge je Dimension, um keine Präzision vorzutäuschen, die die Methodik nicht liefert.

## 8. Pulse History (Verlauf)

Wird zu einer **dunklen „Kino"-Fläche** — unabhängig vom hell/dunkel-Modus der Seite, größerer Chart, kräftigere Zustandsbalken, sichtbarerer „Jetzt"-Punkt. Bricht bewusst den Rhythmus zwischen den hellen Flächen davor (Fünf Dimensionen) und danach (Marktbreite).

## 9. Vorher → Jetzt

Redaktionelle Typografie an der Kernaussage („Größte Veränderung"): größer, mehr Gewicht. Struktur, Texte und Testverträge unverändert.

## 10. Markt jetzt (Geschichten)

Aus Randlinie wird eine echte Karte (Glasfläche, farbiger Innenakzent je Richtung). Gleiche Daten, gleiche Bündelungslogik (`VUMarketPulse.marketNowStories`).

## 11. Cross Asset / Konstellation

Neu: eine **Radar-Konstellation** (SVG, dekorativ) neben der bestehenden, verlinkten Balkenliste. Fester Winkel je Anlageklasse (kein Layout-Zufall), Abstand vom Zentrum = Betrag der Monatsbewegung im Vielfachen des Typischen — dieselben Werte wie die Balken, nur als Bild statt als Zeilen. Keine Kausalität behauptet (Text und Testverträge unverändert: „Beschrieben wird, was sich gleichzeitig bewegt – nicht, warum").

## 12. Marktbreite

Status-Zeile wird zur hervorgehobenen Glasfläche, Balken kräftiger. `NOT_CURRENT`-Kennzeichnung unverändert sichtbar und getestet.

## 13. Detailseiten

Chart-Bereich wird zur selben dunklen „Kino"-Fläche wie der Verlauf, dazu ein asset-bewusster Akzentstrich auf Kopf- und Chartbereich. „Wie steht dieser Markt?", 52-Wochen-Spanne, Fakten und „Rolle im Marktumfeld" unverändert in Struktur und Text.

## 14. Mobile (320/390/1440)

Alle Flächen fluid (`clamp()`, `minmax()`-Raster). Geprüft: kein horizontaler Querlauf bei 320/390/1440 px auf `#/maerkte`, `#/maerkte/QQQ`, `#/maerkte/BTCUSD`. Zehn aufeinanderfolgende mobile Bildschirme (390 px, mit echtem Scroll) zeigen durchgehend wechselnde Flächentypen — dunkler Hero, helles Instrument, redaktionelle Liste, Szenario-Karten, dunkles Kino, helle Balken — keine reine Kartenwand.

## 15. Motion

Neu: sanftes Einblenden der Abschnitte beim Scrollen (`IntersectionObserver`, Funktion `beleben()` in `market-intelligence.js`, aufgerufen von `markets.js` und `market-detail.js`). Fail-safe: ohne `IntersectionObserver`-Unterstützung wird sofort alles sichtbar geschaltet; bei `prefers-reduced-motion: reduce` ist die Anfangs-Unsichtbarkeit per CSS von vornherein deaktiviert. Verifiziert durch echtes Scrollen (nicht nur „erster Bildschirm"): alle Abschnitte erreichen `is-sichtbar`/`opacity:1`.

## 16. Accessibility

axe-core (wcag2a/aa, wcag21a/aa) gegen `#/maerkte` hell+dunkel, `#/maerkte/QQQ` hell, `#/maerkte/US10Y` dunkel, jeweils nach vollständigem Scroll (damit vom Motion-System eingeblendete Inhalte mitgeprüft werden): **keine neuen Befunde.**

Während der eigenen QA gefunden und **noch in diesem Auftrag behoben**: Die neue dunkle Detail-Chart-Fläche ließ `--discover-up` (Performance-Text) auf 3,56:1 Kontrast fallen (WCAG AA verlangt 4,5:1). Lokal auf den im Projekt bereits etablierten hellen Dunkel-Ton (`#3fd07f`/`#f0675c`, aus `discover.css`) gesetzt — anschließend 0 Befunde.

**Vor-bestehend, nicht Teil dieser Änderung:** `--v2-muted` erreicht bei 11–11,5 px-Beschriftungen (Schwellen-Marken der Fünf-Dimensionen-Skala, EURUSD-Kartentext) 4,43:1 statt 4,5:1 — bestätigt unverändert seit Commit `2e7409888` (vor dieser Änderung). Sitesweiter Token, betrifft mehr als nur Märkte — gehört dem Owner (§17).

## 17. Performance

+2 KB gz `market-intelligence.js` (13,1 statt 11 KB gz), +1,3 KB gz `markets.css` — kein neuer Netzwerk-Request, keine neue Realtime-Subscription, keine neue Chart-Bibliothek. Die Radial-Gauge und die Cross-Asset-Konstellation sind reines SVG, on-the-fly aus bereits geladenen Artefaktdaten gezeichnet.

## 18. Browser-QA

CI-Lauf auf PR #220 (Commit `d33e3e66`), Job „Discover Frontend Quality Gates":

| Engine | Prüfungen | Ergebnis |
|---|---|---|
| Chromium (`browser-qa.mjs`) | 186 | **186/186 PASS**, 97 Screenshots |
| WebKit (`browser-qa.mjs --engine webkit`) | 33 | **33/33 PASS**, 10 Screenshots (u. a. `390-dark-webkit`) |

WebKit stand lokal in dieser Sitzung nicht zur Verfügung (nur Chromium vorinstalliert); der CI-Lauf ist der maßgebliche Nachweis. CSS-seitig wurden ausschließlich bereits im Projekt produktiv erprobte Techniken verwendet (`color-mix()`, `backdrop-filter`, per CSS gesetzte SVG-Geometrie) — keine neue Browser-Abhängigkeit.

## 19. Screenshots (lokale Evidenz dieser Sitzung)

Chromium, 320/390/1440 px, hell und dunkel, u. a.: Hero/Regime-Gauge, Fünf Dimensionen, Vorher/Jetzt, Szenarien, Pulse History, Marktbreite, Cross-Asset-Konstellation, Markt-jetzt-Geschichten, Detailseiten QQQ/BTCUSD/XAUUSD/US10Y — sowie ein zehnteiliger mobiler Scroll-Rhythmus-Lauf. Keine Konsolenfehler, kein horizontaler Querlauf. (Lokale Sitzungsartefakte, nicht Teil des Repositories — die CI-Screenshots unter „Preserve screenshot and test evidence" auf dem PR sind die dauerhafte Evidenz.)

## 20. Produktions-Nachweis

- PR #220 gemergt (squash) nach `main`, Commit `e9d6977c83bbdb5a261797cd084992ffdb29fd50`.
- Workflow „Quant 2.0 Production Pages", Lauf #803 (`36166054076`): Job `package` inkl. Schritt **„Production smoke over the built release" → SUCCESS** (109 s, gegen den gebauten Auslieferungsstand); Job `deploy` (GitHub Pages) → **SUCCESS**.
- Direkter Live-Abruf von `research.visionuniverse.de` aus dieser Sitzung war durch die Netzwerk-Egress-Policy der Sandbox blockiert (dieselbe Einschränkung wie zuvor bei der Vercel-Preview-URL) — kein Produktfehler, eine Umgebungsgrenze dieser Sitzung. Der CI-eigene Produktions-Smoke-Test ist der maßgebliche, automatisierte Nachweis.
- Realtime-Nachweis bei offener US-Börse (QQQ/SPY/DIA „Live") wurde in dieser Sitzung **nicht** erneut geführt — marktzeitabhängig und außerhalb des Umfangs dieses rein visuellen Auftrags; der bestehende Mechanismus (`LiveHub`, VU-Live-Worker) wurde nicht verändert.

## 21. Geänderte Dateien

| Datei | Änderung |
|---|---|
| `discover/ui/market-intelligence.js` | Regime-Gauge (`regimeGauge`), Base-Case-Karte (`basisKarte`), Cross-Asset-Konstellation (`konstellation`), Scroll-Reveal (`beleben`) |
| `discover/ui/markets.js` | `dx-m3-reveal`-Kennzeichnung der Abschnitte, Aufruf von `beleben()` |
| `discover/ui/market-detail.js` | dieselbe Reveal-Kennzeichnung/-Aufruf auf der Detailseite |
| `discover/markets.css` | vollständige Art-Direction-Ergänzung (Gauge, Szenario-Karten, Konstellation, Kino-Flächen, Motion, Typografie) |

**Nicht geändert:** `quant/engines/multi-asset/market-pulse.js`, alle `quant/config/*.json`, alle Core-Artefakte, `discover/ui/microchart.js`, `discover/ui/live-hub.js` — kein neuer Zustand, keine neue Berechnung, keine neue Datenquelle, kein neuer Score.

## 22. Backend-Änderungen

**Null.** Keine neue Pipeline, kein neuer Provider, keine neue Datenbank, kein neuer Worker, keine neue Bridge, kein neuer Scheduler. Alle 273 Discover-Tests (inklusive der Tests, die Providerlogik und Zustandsberechnung im Frontend explizit verbieten) blieben unverändert grün.

## 23. Verbleibende Owner-Entscheidungen

1. **`--v2-muted`-Kontrast** (§16): ein sitesweiter Token unter der WCAG-AA-Schwelle bei sehr kleiner Schrift — betrifft mehr als Märkte, sollte zentral entschieden werden.
2. **Live-Realtime-Nachweis bei offener US-Börse**: sollte bei nächster Gelegenheit während der regulären US-Sitzung nachgezogen werden (unverändertes System, kein neues Risiko).
3. **Weitere Vertiefung** (optional, nicht Teil des Zielzustands dieser Stufe): eine globale Typografie-Überarbeitung über Märkte hinaus, weitere Motion-Choreografie (z. B. gestaffeltes Einblenden einzelner Karten statt nur ganzer Abschnitte) — bewusst nicht umgesetzt, um den Auftrag auf den Märkte-Bereich und auf reine Inszenierung zu begrenzen.
4. **Sektoren, Macro Regime**: unverändert außerhalb des Umfangs (siehe `VU_MARKETS_3_CONSUMER_INTELLIGENCE.md` §31).

## 24. Zielzustand

| Zielzustand | Stand |
|---|---|
| BAM_EFFECT / AI_GENERIC_LOOK entfernt | PASS (Gauge, Konstellation, Kino-Flächen statt Kartenwand) |
| MARKET_REGIME_VISUAL, GAUGE_SYSTEM, SCENARIO_EXPERIENCE, PULSE_HISTORY | PASS |
| MOBILE / WEBKIT / A11Y | PASS (CI: 219/219 Browser-QA, axe ohne neue Befunde) |
| DATA_TRUTH / NO_NEW_SCORE / BACKEND_CHANGES = 0 | PASS |
| PRODUCTION_DEPLOYMENT | PASS (Pages-Lauf #803 grün, eigener Smoke grün) |
| Externer Live-Abruf aus dieser Sitzung | BLOCKED (Sandbox-Netzwerkrichtlinie, kein Produktfehler) |
| CRITICAL_BLOCKERS | 0 |
