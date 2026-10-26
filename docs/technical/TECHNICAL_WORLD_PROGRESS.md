# Vision Universe Technical – Fortschrittsbericht und Aufgabenliste

**Stand:** 25.10.2026 · V1 (PR #919, `f2012b0`) und V2 (PR #923, `74a49d0`) gemergt · Menügruppe PR #925 · V3 gemergt (PR #929, `9787b1a`) · Auftrag: „Vision Universe Technical – Autonomer Master-Entwicklungsauftrag V1“.
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
- **V3 – Indikatoren 1.1:** sechs neue Katalogeinträge (Parabolic SAR, Ichimoku-Wolke ohne die nicht kausale Chikou-Linie, VWMA, Williams %R, Aroon, Chaikin Money Flow), je mit naiver Referenz auf AAPL-Daten und, für SAR und Aroon, einem von Hand gerechneten Beispiel (`quant/tests/technical-indicators-ext.test.mjs`). Neue Screener-Felder: `psarUp`, `aboveCloud`, `aroonOsc`, `williamsR`, `cmf20`.
- **V3 – Formationen 1.1:** Kurslücke nach oben/unten (Lücke ≥ 0,5 ATR, mit Volumen zusätzlich ≥ 1,5-faches relatives Volumen; bestätigt nach drei Schlüssen jenseits der Lückenkante, invalidiert beim Schluss in die Lücke). Ein Sprung mit Split-Signatur (Faktor nahe n oder 1/n) oder mit einem Faktor außerhalb 0,2 bis 5 gilt als Datenverdacht und wird nicht als Lücke gemeldet: nicht nachgezogene Splits und Abspaltungen (vgl. DQ-PX-3, 303 Titel mit Sprüngen über 60 %) wären sonst falsche Lücken. Test an der realen AAPL-Lücke vom 03.05.2024 und an einer konstruierten Reihe.
- **V3 – Suche in Worten** (`quant/engines/technical/query-text.js`): deterministischer Parser deutscher Fachbegriffe, Kennzahl-Vergleiche, „und/oder“-Gruppen, Formationslisten, Zeitrahmen und eine kanonische Schreibweise. Er gibt dieselbe validierte Abfrage aus wie die Klickfilter, meldet Nicht-Erkanntes, statt zu raten, und `contract()` beschreibt den späteren Modellaufruf (Status „vorbereitet, nicht aktiv“). Rundreise-Test über alle Felder und Zeitrahmen. Im Screener: Eingabe mit Live-Vorschau, Adresse `#/screener?q=…`, speicherbar.
- **V3 – Chart Studio:** Schichten im Kurs (zusätzlich Keltner, Donchian, Ichimoku, Supertrend, Parabolic SAR, VWMA) und ein Unterfenster aus elf Indikatoren (RSI, MACD, Stochastik, ADX, ATR, CCI, Williams %R, Aroon, MFI, OBV, CMF). Formationsfokus `#/chart/<T>?f=<id>`: nur diese Formation, Fenster ab ihrem ersten Punkt, teilbare Adresse.
- **V3 – Vorher/Nachher Datensatz:** Neubau mit dem Erzeuger. Die 55 bestehenden Spalten sind bitgleich; die Formationslisten unterscheiden sich ausschließlich um die neuen Lücken; alle bisherigen Formationszählungen in `meta.json` sind unverändert.
- **D – Performance:** Startseite und Chart Studio laden einen schlanken Index (`technical/data/index-v1.json`: Kürzel, Namen, Treffer je Vorlage; 174 KB, 60 KB gzip) statt des vollen Datensatzes (3,8 MB, 822 KB gzip). Erzeuger und Browser-Rückfall nutzen dieselbe Funktion `model.js#homeIndex`. Messung bei 390 px, CPU ×4, 9 Mbit/s, ohne Kompression:

  | Ansicht | vorher | nachher | Daten vorher → nachher |
  |---|---|---|---|
  | Start | 4,7 s | 0,8 s | 4,0 → 0,47 MB |
  | Chart Studio | 5,4 s | 2,1 s | 4,9 → 1,35 MB |
  | Screener | 4,3 s | 4,5 s | unverändert (braucht den Datensatz) |

  Das `preload` des vollen Datensatzes entfällt.
- **D – Mobile:** Die Browser-QA prüft zusätzlich 360 px (48 Prüfungen). Kein horizontaler Überlauf in allen sechs Ansichten. Die Beispiel-Links der Suche haben jetzt 44 px Zielhöhe.
- **D – Datenqualität:** Neue Zeilenspalte `suspectJumpAt`: jüngster Schlusssprung der letzten 60 Bars mit Split-Signatur oder einem Faktor außerhalb 0,2 bis 5; am Stichtag 23.10.2026 betrifft das 56 Titel. Der Screener zeigt „Kurssprung prüfen“, das Chart Studio nennt die Tage unter „Datenqualität und Herkunft“, `meta.json` zählt `counts.suspectJump60`. Ursache sind nicht nachgezogene Splits und Abspaltungen in der Quelle (vgl. DQ-PX-3); Technical korrigiert nichts selbst (ADR-002).
- **E3a – Historische Evidenz der Formationen** (`scripts/technical/world/formation-evidence.mjs` → `technical/data/formation-evidence.json`, Teil des Erzeugerlaufs, +100 s):
  - Jede Formation zählt einmal, am ersten Tag, an dem sie mit den damaligen Daten sichtbar war (`analyzeAt` an jedem Bar).
  - Gemessen wird 20 Handelstage danach: bestätigt, invalidiert, entfallen (nicht mehr geführt ohne festgehaltenen Ausgang) oder offen. Dazu die richtungsbereinigte Rendite gegenüber dem Mittel aller Titel am selben Tag.
  - Ausgewiesen ab n ≥ 100; „belastbar“ nur nach Bonferroni über alle Typen.
  - Stand 23.10.2026: 91.891 Erkennungen, 5.649 Titel, Erkennungen 25.02. bis 25.09.2026.
  - Belastbar sind nur drei Typen:

    | Typ | Rendite ggü. Querschnitt nach 20 Tagen | n |
    |---|---|---|
    | Bullische Flagge | +2,3 % ± 1,0 | 1.198 |
    | Fallender Keil | −2,9 % ± 1,3 (gegen die Lehrbuchrichtung) | 1.940 |
    | Lücke nach oben | −0,5 % ± 0,3 | 9.804 |

  - Alle anderen sind nicht belastbar. Das betrifft ein einziges Marktjahr und ist keine Prognose.
  - Anzeige: Methodik (Tabelle) und Befundkarten („Historisch“).
- **E3 – Befunde für die Formationsmodelle** (Fachmodell, eigener PR zur Entscheidung):
  - Bestandsformationen werden nie invalidiert, sondern verschwinden (entfallen 45 bis 95 %).
  - Kanäle und Keile sind beim ersten Sichtbarwerden meist schon bestätigt (58 bis 93 %), die Erkennung kommt also spät.
  - Flaggen werden praktisch nie bestätigt.
  - Ursachen und Korrektur (`technical-formations-1.2.0`, Zweig `claude/technical-formations-lifecycle`, nicht gemergt): [FORMATIONS_LIFECYCLE.md](FORMATIONS_LIFECYCLE.md).
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
2. ~~Eigene Menügruppe „Technical“~~ PR #925 (Owner-Freigabe 25.10.2026, Hash von `site-navigation.js` nachgezogen).
3. ~~Supertrader-Angleichung~~ ATR-Teil erledigt: PR #928 (Wilder als Standard, veröffentlichte Werte bytegleich). Offen: Technical-Befunde auf den Supertrader-Aktienseiten verlinken (eigener PR unter Gate A).
4. ~~EMA 200 exakt~~ PR #927 gemergt (`ema-settled-1.1.0`). Offen: Screener-Feld `aboveEma200`/`distEma200`, sobald der nächtliche Materialisierungslauf EMA-Werte geliefert hat; danach Wochen-EMA.
5. **KI-Suche freischalten:** technisch vorbereitet (V3: Parser, Schema, Validierung, Oberfläche, `query-text.js#contract()`). Offen ist nur der Modellaufruf über `workers/vu-ask`; das ist ein Deploy mit Kosten und braucht eine eigene Freigabe.
6. ~~Zusammenführung mit `/screener/`~~ erster Schritt PR #936: `/screener/` übernimmt 16 Technical-Spalten (Indikatoren und Formationen) aus `technical/data/screener-v1.json`; eine Quelle, keine zweite Rechnung. Offen: eine gemeinsame Abfrage-Engine für beide Oberflächen.
7. ~~Evidenz~~ PR #934: `technical/data/formation-evidence.json` (Definition, Stichprobe, Bonferroni). PR #938 (Fachmodell, `formations` 1.2.0, vollständiger Lebenszyklus, Owner-Freigabe 26.10.2026), siehe [FORMATIONS_LIFECYCLE.md](FORMATIONS_LIFECYCLE.md).
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
| 25.10.2026 | PR #923 (V2) gemergt (`74a49d0`), nachdem alle Pflichtprüfungen grün waren. Vercel (Tageslimit) ist kein Pflicht-Check. |
| 25.10.2026 | PR #925 gemergt (`6a1396a`): eigene Menügruppe „Technical“ nach Fundamental. Geschützter Hash nur für `site-navigation.js` nachgezogen. Shell-Tests, Discover-Navigationstest und Shell-Browser-QA wurden angepasst. Alle Pflichtprüfungen grün; `frontend` nach einer Wiederholung des bekannten WebKit-Ausreißers. |
| 25.10.2026 | PR #929 (V3) gemergt (`9787b1a`), nachdem alle Pflichtprüfungen grün waren; Vercel (Tageslimit) ist kein Pflicht-Check. Wirkung: neue Indikatoren, Kurslücken, Suche in Worten und Chart-Studio-Schichten sind auf `main`; bestehende Datensatzspalten bitgleich. |
| 25.10.2026 | PR #932 (D) gemergt (`51aa903`): Index für Start und Chart Studio, 360-px-QA, Kurssprung-Verdacht. |
| 25.10.2026 | PR #928 gemergt (`bc7f6e5`, Owner-Freigabe): Supertrader-ATR standardmäßig Wilder. Vor dem Merge gegen den aktuellen `main` geprüft: `build.mjs --out` bytegleich (1.537 Dateien), Supertrader-Tests 790/791 (1 übersprungen), Gate A OK. |
| 25.10.2026 | PR #927 gemergt (`7d5ef10`, Owner-Freigabe nach Prüfung der Aufwärmregel): exakte EMA 20/50/200 mit kursbezogener Fehlerschranke. Pflicht-CI grün, Vercel (Tageslimit) kein Pflicht-Check. |
| 25.10.2026 | PR #933 gemergt (`f4790e3`): Filter-Baukasten (Felder je Zeitrahmen, UND/ODER-Gruppen) und gespeicherte Strategien mit Umbenennen, Export und Import. CI grün, Technical-Browser-QA 54/54. |
| 25.10.2026 | PR #934 gemergt (`61b5b15`): historische Formations-Evidenz mit Methodik-Tabelle. CI grün. |
| 25.10.2026 | PR #936 gemergt (`426e287`): Technical-Spalten im `/screener/` (ATR erstmals verfügbar). Keine Screener-Funktion entfernt; Screener-Browser-QA und Shell-QA grün. |
| 25.10.2026 | PR #938 eröffnet (Entwurf, Fachmodell): Formations-Lebenszyklus. Kein automatischer Merge. |
| 26.10.2026 | PR #943 gemergt (`7e19699`): Filter „Kurs über EMA 200“ und „Abstand zur EMA 200“ (Technical, Wortsuche, `/screener/`). Werte erscheinen mit dem ersten Materialisierungslauf nach #927. |
| 26.10.2026 | PR #938: Owner-Freigabe mit Vorgaben (Keile „bei Erkennung ausgebrochen“, Dreieck-Ausbruch mit Richtung und Tag, vorläufige Vier-Punkt-Kanäle, Filter „offen“). Umsetzung und Auswirkungen: FORMATIONS_LIFECYCLE.md Abschnitt 9. |
| 25.10.2026 | PR #927: Owner-Prüfung der EMA-Aufwärmregel; Korrektur auf eine kursbezogene Fehlerschranke (`ema-settled-1.1.0`), siehe EMA200_MATERIALIZATION.md. |
| 25.10.2026 | Fachmodell-PRs ohne automatischen Merge: #927 (exakte EMA 20/50/200 in der Materialisierung), #928 (Supertrader-ATR auf Wilder, ohne Wirkung auf veröffentlichte Zahlen). Beide CI grün, Entscheidung beim Owner. |
| 25.10.2026 | V3 auf `claude/technical-v3`: Indikatoren 1.1, Kurslücken, Suche in Worten, Chart-Studio-Schichten, Formationsfokus; Technical-Browser-QA 32 Prüfungen (dazu Menü, Suche, Fokus). |

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
