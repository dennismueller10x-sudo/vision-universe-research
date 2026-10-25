# Vision Universe Technical – Fortschrittsbericht und Aufgabenliste

**Stand:** 25.10.2026 · V1 gemergt (PR #919, `f2012b0`) · Folgearbeit auf `claude/technical-world-v2` · Auftrag: „Vision Universe Technical – Autonomer Master-Entwicklungsauftrag V1“.
Dieses Dokument ist der Wiedereinstieg. Wer die Arbeit fortsetzt, liest zuerst Abschnitt 6 (offene Aufgaben) und Abschnitt 5 (Teststatus).

## 1. Ergebnis in einem Satz

`/technical/` ist eine eigene Produktwelt mit Startseite, Screener (UND/ODER, Tag/Woche/Monat, gespeicherte Suchstrategien) und Chart Studio (Kerzen, Indikator-Overlays, Trendlinien, Zonen, Formationen mit Zustand). Alle Zahlen kommen aus geprüften, kausalen Engines auf der kanonischen Kursreihe. Es gibt keine Demo-Werte und keinen Score.

## 2. Architektur-Audit (Phase 0) – Befunde

| Bereich | Befund | Folge für Technical |
|---|---|---|
| Kursdaten | Tiingo-EOD → R2/`.market-cache` (Actions). Im Repository liegen pro Titel nur 1 J. Tagesschlüsse (`discover-series`) und Wochenschlüsse (`discover-series-long`). Volles OHLCV pro Titel liefert nur die Materialisierung: `quant/data/product/technical-signals-v1` (270 Tagesbars, SPLIT_ADJUSTED, plus Vollhistorien-Features `featuresAtCutoff` und `chartSeries` SMA 20/50/200, RSI, ATR, rel. Volumen). | Chart Studio liest `technical-signals-v1/by-ticker/<T>.json.gz` (Release) bzw. die Scherbe. Es entsteht kein neues Pro-Titel-Artefakt. |
| `/api/history` | geparkt (`VU_MARKET_HISTORY_API_ENABLED`). | Nicht aktiviert (Produktionsänderung, nicht freigegeben). |
| Marketstack | nur Europa-Pilot. | Technical ist US-only wie Quant. |
| Corporate Actions | Split-Bereinigung über `return-series.js#splitFactors` bzw. `canonical-bars.js#fromPriceBars` in der Materialisierung (ADR-002). | Keine eigene Ableitung. Schlusskurse laufen über `published-close.js#roundClose`. |
| Technical-Engines | Umfangreich und kausal: `feature-store.js` (SMA, EMA, Wilder, RSI, ADX, MACD, rollierende Extreme), `pivot-engine.js` (ATR-ZigZag, Bestätigungsverzug), `market-structure.js` (HH/HL), `ti/levels.js` (S/R-Zonen), `ti/chart-patterns.js` (Doppeltop/-boden, SKS, Dreiecke, Rechteck, Flagge, Tasse mit Henkel), Elliott v2/v3. | Wiederverwendet. Neu sind nur fehlende Indikatoren und Formationen. |
| Duplikate | SMA ~14×, EMA 5×, ATR 5× (Supertrader: SMA der TR statt Wilder), ADX 2×, relatives Volumen 3 Definitionen, 52W-Hoch 4 Definitionen (siehe Architektur §5). Supertrader importiert `quant/engines/technical` nicht. | Technical rechnet ausschließlich über `feature-store.js` und `indicators.js`. Die Supertrader-Angleichung ist ein eigener PR (Gate A). |
| Screener | `/screener/` hat eine Filter-Engine (UND/ODER-Gruppen, URL-Zustand, localStorage-Strategien) und eine KI-Übersetzung (`workers/vu-ask`, Claude Haiku, Schema aus `screener/engine/fields.js`). Die Engine hängt am globalen `VUScreenerFields`. | Eigene kleine Engine **im selben Modell** (`technical-query.js`). Zusammenführung als Folgeaufgabe. |
| Navigation | `assets/site-navigation.js`: Menügruppen (Liste in `discover/tests/navigation-theme.test.mjs` festgeschrieben) und opt-in Dock (`VUNavigation.dock`). | Eigener Dock. Menüeintrag unter „Weitere Produkte“, weil eine eigene Gruppe den Discover-Test und damit das Discover-Gate berührt (Folge-PR). |
| UI-Schutz | `docs/quant-recovery/v51/ui-protection.json` sichert 237 Dateien bytegenau (Test `backtest-consolidation-boundary`). | Vier Einträge nachgezogen (`site-navigation.js`, `stock-navigator.js`, `stock-navigator.css`, `product-icons.svg`). Präzedenz: Commit `951657a48b`. Vom Owner am 25.10.2026 freigegeben, nach Prüfung: Die Diffs enthalten nur die Technical-Änderungen, alle 237 Hashes stimmen. |
| Auslieferung | `build-release.mjs#permitted` liefert `technical/` automatisch aus (ohne `tests/`). Die Passwortsperre gilt für jede HTML-Datei. | Keine Änderung am Release oder an der Sperre. |

## 3. Wiederverwendungsmatrix

| Fähigkeit | Wiederverwendet | Neu (Datei) |
|---|---|---|
| SMA, EMA, Wilder/RMA, True Range, RSI, ADX, rollierende Extreme, Streuung, Median-Volumenbasis | `feature-store.js` | – |
| WMA, Supertrend, Donchian-Kanal, Stochastik, CCI, Bollinger-/Keltner-Bänder, OBV, MFI, Volumenspitzen, MACD-Bündel, ROC % | Primitive aus `feature-store.js` | `quant/engines/technical/indicators.js` (Katalog: Definition, Parameter, Aufwärmphase) |
| Swing-Hochs/-Tiefs, HH/HL/LH/LL | `pivot-engine.js`, `market-structure.js` (Bundle) | – |
| Doppeltop/-boden, SKS, Dreiecke, Rechteck, Flagge, Tasse mit Henkel | `ti/chart-patterns.js` | Zustandsübersetzung in `formations.js` |
| Trendlinien, Kanäle, Keile, Wimpel, Range-/Widerstands-Ausbruch, Volatilitätskontraktion | – | `quant/engines/technical/formations.js` |
| Unterstützung/Widerstand | `ti/levels.js` | – |
| Kursreihe OHLCV + Vollhistorien-Features | `technical-signals-v1` (Materialisierung) | – |
| Wochen-/Monatsschlüsse | `discover-series-long` | Monatsaggregation in `screen-row.js` |
| Identität | `core/identity.js` | – |
| Schlusskursrundung | `published-close.js` | – |
| Filtermodell | Modell von `screener/engine/query.js` | `technical-query.js` (Feldkatalog, Validierung, Trichter, JSON-Schema) |
| Aktienwechsel zwischen Welten | `core/stock-context.js` + `assets/stock-navigator.js` | Produkt `technical` |
| Chart-Renderer | – (`st-chart.js` liegt hinter Gate A und kennt keine Zwei-Punkt-Linien und keinen Indikatorbereich) | `technical/ui/chart.js` (zeichnet nur) |

## 4. Umgesetzt (Phasen 1–6)

- **Phase 1 – Indikatoren:** `indicators.js` mit 18 Katalogeinträgen. Referenztests gegen naive Formeln auf realen AAPL-Daten, Gleichheit mit den Quant-Features, Kausalität, Determinismus, Lücken und ungültige Parameter.
- **Phase 2 – Chart Studio** (`#/chart/<T>`): Kerzen (Tag) oder Linie (5J/Max aus Wochenschlüssen); SMA 50/200 aus der Vollhistorie; EMA 20/50, Bollinger, MACD, Stochastik und RSI zuschaltbar; Trendlinien, Kanäle, Formationskanten, Ausbruchsmarker, S/R-Zonen; Volumen; Fadenkreuz; Vollbild; Befundkarten mit Regeln und Datenqualität; Niveaus; Erkennungshistorie „was war wann bekannt“.
- **Phase 3 – Formationen:** einheitliches Zustandsmodell Erkannt/Bestätigt/Invalidiert. Erkennungszeitpunkt = erster Tag, an dem die Formation mit dem damaligen Wissen sichtbar war. Tests mit vergifteter Zukunft und abgeschnittener Reihe.
- **Phase 4 – Screener:** `scripts/technical/world/build-screener.mjs` → `technical/data/screener-v1.json` (5.649 Titel, ~0,8 MB gz, 30 s). Filter für Chartmuster, Trend, Hochs (52 W, 200 W), Momentum, Volumen, Volatilität und relative Stärke ggü. SPY. UND/ODER, Zeitrahmen, Trichter mit Fehlwerten, gespeicherte Strategien (localStorage), Chartvorschau, Datenqualitätsflaggen. Sortiert wird nach einem offengelegten Feld oder nach erfüllten Bedingungen; es gibt **keinen Setup-Score**.
- **Phase 5 – KI-Vorbereitung:** `technical-query.js#jsonSchema()` (Structured-Output-Schema aus dem Katalog), `validate()` mit stabilen Fehlercodes, `describe()`. Kein Modellaufruf.
- **Phase 6 – Integration:** Dock, Menüeintrag, Navigator-Kachel „Technical“ in allen Welten mit Aktienkopf (Quant, Fundamental, Discover, Supertrader, Hedgefonds) über eine Core-Änderung. Die bisherige Kachel „Technik“ (Elliott-Chartbild) heißt jetzt „Chartbild“ und behält das bisherige Symbol (`chartbild`). Verfügbarkeitsnachweis in `scripts/core/stock-availability.mjs`. Registry-Eintrag `technicalWorld`.

## 5. Teststatus (lokal, 25.10.2026)

| Suite | Ergebnis |
|---|---|
| `node --test "core/tests/*.test.mjs"` | 238/238 |
| `node --test "quant/tests/*.test.mjs"` | alle grün (vor der Hash-Nachführung schlug genau `backtest-consolidation-boundary` an; danach grün) |
| `node --test technical/tests/*.test.mjs` | grün |
| Discover + Supertrader + Screener | 1.360/1.360 |
| Fundamental + Elliott | 51/51 |
| `node scripts/quality/check-test-isolation.mjs` | keine Produktionsdatei verändert |
| `node scripts/core/system-health.mjs` | „Technical (Produktwelt)“ OK |
| `node scripts/market/assert-public-data-hygiene.mjs` | grün |
| Browser (Playwright, 390 px, hell und dunkel) | alle 6 Ansichten ohne Seitenfehler, kein horizontales Scrollen, Ladezeit lokal 0,4–0,6 s |

Lokal erwartete 404: `technical-signals-v1/by-ticker/` und `/core/data/stock-availability/` entstehen nur im Release-Bau. Der Rückfall auf die Scherbe bzw. die neutrale Navigator-Anzeige greifen.

## 6. Offene Aufgaben (priorisiert)

1. ~~PR-Freigabe der UI-Schutzliste~~ erledigt (Owner-Freigabe 25.10.2026, 4 Hashes verifiziert).
2. **Eigene Menügruppe „Technical“** (Folge-PR, nur `assets/site-navigation.js` + `discover/tests/navigation-theme.test.mjs`, damit das Discover-Gate sauber bleibt).
3. **Supertrader-Angleichung** (eigener PR unter Gate A): Supertrader-ATR ist der einfache Mittelwert der TR, Technical nutzt Wilder. Ziel: Supertrader importiert `feature-store.js`/`indicators.js`. Ein Vorher/Nachher-Vergleich ist Pflicht, weil das ein Fachmodell ändert. Danach Technical-Befunde auf den Supertrader-Aktienseiten verlinken.
4. **EMA 200 exakt:** in Prüfung auf Branch `claude/technical-ema200` (Fachmodelländerung, kein automatischer Merge). Regel, Vorher/Nachher und Referenztests: [EMA200_MATERIALIZATION.md](EMA200_MATERIALIZATION.md). Offen danach: Screener-Feld `aboveEma200` und Wochen-EMA, je eigener PR.
5. **KI-Suche freischalten:** `technical-query.js#jsonSchema()` an `workers/vu-ask` anbinden (Deploy = Produktionsänderung, Kosten → Freigabe nötig).
6. **Zusammenführung mit `/screener/`:** Feldregister-Injektion in `screener/engine/engine.js`, danach eine Engine für beide.
7. **Evidenz:** Trefferquoten der Formationen über die bestehende Outcome-Schicht (`ti/outcomes.js`) messen. Erst dann wäre eine Rangfolge nach Evidenz begründbar.
8. ~~Release-Stempel~~ erledigt (V2): `technical` steht in `STAMP_ONLY`; jede in `technical/index.html` verlinkte Datei trägt `?v=<Hash>` (Test in `technical/tests`). Die bei Bedarf nachgeladenen Engines bleiben ungestempelt.
9. ~~Browser-QA in CI~~ erledigt (V2): `scripts/technical/world/browser-qa.mjs` läuft in `technical-ci.yml` (Chromium, 390/1280 px, hell/dunkel, 20 Prüfungen: Inhalte, Interaktionen, Seitenfehler, horizontales Scrollen, Dock). Gegenprobe: Ein defekter Chart-Renderer lässt genau die vier Chart-Studio-Prüfungen scheitern.
10. **Eigene Menügruppe** und weitere Änderungen an geschützten Dateien (`ui-protection.json`) brauchen je eine eigene Owner-Freigabe der Hashes.

## 7. Blockaden und Entscheidungen

- Keine neuen Anbieter, Dienste oder Modellaufrufe. Die Passwortsperre ist unverändert.
- Gates wurden nicht abgeschwächt. Die Isolationsgates von Discover, Supertrader und Company Intelligence werden von diesem PR nicht ausgelöst (keine Pfade unter `discover/**`, `supertrader/**`, `scripts/supertrader/**`).
- Der Ausbruch über Widerstand verlangt eine Zone mit mindestens zwei Swing-Kontakten. Ohne diese Regel meldeten 18 % des Universums einen „Ausbruch“, mit ihr 9 % (Stichtag 23.10.2026).

## 10. Verlauf

| Datum | Schritt |
|---|---|
| 25.10.2026 | PR #919 (V1) gemergt, nachdem alle Checks grün waren. Vercel ist kein Pflicht-Check (Tageslimit des Free-Tarifs). Der WebKit-Ausreißer in der Discover-QA bestand beim einen Wiederholungslauf. |
| 25.10.2026 | V2 begonnen: Release-Stempel, Browser-QA in CI. |

## 8. Fortsetzen

```bash
git checkout claude/technical-world-v1
node --test quant/tests/technical-indicators.test.mjs quant/tests/technical-formations.test.mjs quant/tests/technical-query.test.mjs technical/tests/*.test.mjs
node scripts/technical/world/build-screener.mjs            # Datensatz neu bauen (30 s)
python3 -m http.server 8765  # dann http://127.0.0.1:8765/technical/
```

## 9. Ressourcenbudget der Quant-Startseite (25.10.2026)

Vor PR #918 (Quant-Code in Pakete je Ansicht) riss PR #919 die Grenze der Quant-Startseite um 2.038 Bytes
(1.822.038 bei 1.820.000). Gemessener Zuwachs je Pfad: `site-navigation.js` +1.437, `product-icons.svg` +623,
`stock-navigator.js` +182. Der Owner gab eine gezielte Anhebung für `home` auf 1.823.000 frei.
Nach dem Merge von #918 misst die VU2-Browser-QA mit allen Technical-Änderungen **1.606.572 Bytes bei 23 Anfragen**
(lokal, gebautes Release, 390 und 1440 px, 8/8 Budgets, 96 Prüfungen ohne Befund). Die Anhebung wurde deshalb
**nicht** umgesetzt; die Grenze bleibt 1.820.000.
