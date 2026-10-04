# Statistik-Audit der Evidenzstudie (ti-evidence) — 03.10.2026

**Geltungsbereich:** `scripts/technical/ti-evidence.mjs` (Studie), `scripts/technical/lib/validation-stats.cjs` (neu: `twoWayBoot`, `bhAdjust`, `timeBlockOf`, `seedOf`), Ausgaben unter `quant/data/technical-intelligence/evidence/`.
**Nicht geändert:** Ausführungsregeln, Szenario-Regeln, Parameter, Schwellen, Gewichte (`outcomes.js` unverändert, `scenario.js`/Elliott-Engines nicht angefasst). Dieses Audit ändert ausschließlich **Inferenz und Messung**.

## 1. Was falsch war

| # | Befund | Folge |
|---|---|---|
| 1 | Lift-KI (Szenario-Trefferquote Zielzone 1 minus Baseline gleicher Geometrie) als Differenz zweier unabhängiger Anteile (Normalnäherung, `outcomes.js aggregate()`), Trefferquote mit Wilson-Intervall. Signale wurden als unabhängig behandelt. | Signale **desselben Titels** und **derselben Marktphase** sind korreliert. Die Intervalle waren 2–5× zu schmal; viele Segment-„Effekte" waren Artefakte. |
| 2 | Keine Behandlung der Querschnitts-Überlappung: Je Titel sind Signale nicht überlappend (`busyUntil`), aber hunderte Titel feuern in derselben Woche und teilen dasselbe 26-Wochen-Ergebnisfenster. | Effektive Stichprobe ≈ Zahl der Marktphasen, nicht Zahl der Signale. |
| 3 | Segmenttabellen (Template, Regime, Konfidenz, Volatilität, Sektor, Jahr, Elliott, …) ohne Mehrfachtest-Korrektur und ohne Kennzeichnung vorab registriert / explorativ. | „KI ohne 0" in einzelnen Zeilen wurde als Befund lesbar. |
| 4 | Die Studie rechnete mit der Engine-Voreinstellung (Elliott 2.x), das Produkt seit Mission III mit `PRODUCT_METHODOLOGY = { elliottEngine: "v3" }`. | Evidenz und Produkt beschrieben nicht dieselbe Methode (Elliott beeinflusst Zonen/Invalidation der Szenarien, auch bei Konfluenzgewicht 0). |
| 5 | Elliott-Studie zählt **alle** Erkennungen (auch je Titel überlappend), Fibonacci-Studie hatte gar kein KI. | Gleiches Unabhängigkeitsproblem, verschärft. |

## 2. Was geändert wurde

1. **Zweiweg-Cluster-Bootstrap** (`validation-stats.cjs → twoWayBoot`), B = 1.000, deterministischer Seed je Tabellenzeile (FNV-1a von „Tabelle|Zeile"):
   * `SYMBOL` — Titel mit Zurücklegen (Zeit fest),
   * `TIME` — Kalenderquartale des Signaldatums mit Zurücklegen (Titel fest),
   * `TWO_WAY` — Cameron-Gelbach-Miller (2011): se² = se²_Titel + se²_Quartal − se²_Zelle (Zelle = Titel × Quartal), Intervall ± 1,96 se,
   * zusätzlich ausgewiesen, nicht maßgeblich: `pigeonhole` (Titel und Quartale gleichzeitig ziehen; zählt das Zellrauschen mehrfach, konservative Sensitivität) und `iidCell`.
   * **Berichtet wird das breiteste** der Intervalle SYMBOL / TIME / TWO_WAY (`ciCluster.*.by`). Ein Schema zählt nur mit ≥ 10 Clustern in seiner Dimension; sonst bleibt das KI `null` (`insufficientClusters`).
   * p-Werte zweiseitig aus der Normalnäherung mit der Bootstrap-Standardabweichung des maßgeblichen Schemas (H0: Lift = 0; Richtung: Quote = 50 %; Fibonacci: Verhältnis = 1).
2. **Felder (Namen stabil):** Die Felder, die Produkt und Methodikseite lesen, tragen jetzt das Cluster-Intervall:
   `t1Ci`, `liftCiLow`, `liftCiHigh` (alle Szenario-Tabellen inkl. `setups`, die `scenario.js overallConfidence()` und `ti-product.mjs evidenceBadge()` über `confidence.empirical` lesen; `byPeriod.TEST` für `page-chartbild.js method()`), `confirmCi`/`liftCiLow`/neu `liftCiHigh` (Elliott-Studie), `ci` (Richtungs-Ablation, gelesen von `derive-method-evidence.mjs`), neu `ratioCi` (Fibonacci).
   Die früheren Werte bleiben erhalten: `t1CiWilson`, `liftCiLowNormal`, `liftCiHighNormal`, `confirmCiWilson`, `ciWilson`. Volle Details je Zeile in `ciCluster`.
3. **Mehrfachtests:** Benjamini-Hochberg (FDR 5 %) je Tabelle (`qBH`, `significantBH`) und zusätzlich gepoolt über alle explorativen Lift-Vergleiche (`qBHPooled`). Jede Zeile trägt `registration`; Übersicht in `inference.tables`.
4. **Messabgleich Engine:** Die Studie nutzt jetzt `PRODUCT_METHODOLOGY` aus `ti-product.mjs` (Elliott 3.x, Konfluenzgewicht 0) für `analyzeAt` und die Elliott-Studie. Das ist **keine Methodenänderung**, sondern die Messung der Methode, die das Produkt tatsächlich zeigt. Einschränkung: ohne das Persistenz-Replay des Produkts (jeder Erkennungszeitpunkt zustandslos). Engine-Stand im Bericht: `engine.scenario`, `engine.methodology`, SHA-256 der Engine-Dateien bei Laufbeginn (`engine.files`).
5. **Survivorship-Eingang:** `--delisted <datei>` liest das private Wochenbündel aus `build-survivorship-control.mjs --bundle-out` (Format wie `build-signal-backtest.mjs`). Delistete Reihen gehen in das Hauptergebnis ein, `survivorshipSensitivity` weist „nur Überlebende" und „nur delistet" getrennt aus; die Fallliste (`cases-*.json.gz`) enthält keine delisteten Reihen (runner-privat). Lokal: `universe.survivorship = SURVIVORS_ONLY`.
6. **Laufzeit/Reproduzierbarkeit:** Worker-Threads mit dynamischer Warteschlange (größte Reihen zuerst) statt statischer Aufteilung; Elliott-Ergebnis je Erkennungsbar wird zwischen Szenario- und Elliott-Studie wiederverwendet (identische Eingaben). Records werden vor der Auswertung nach Titel/Datum sortiert → Ergebnis unabhängig von der Thread-Verteilung. `--records` sichert die Rohstichprobe, `--from-records` wertet sie ohne Engine-Lauf neu aus (für Sensitivitäten, `--time-block`).

## 3. Überlappung und Wahl des Zeitblocks

* **Je Titel:** bestätigt nicht überlappend. Das nächste Signal eines Titels wird erst nach dem Ausstieg des vorherigen (`busyUntil = exitIndex`) bzw. nach Ablauf des Einstiegsfensters ohne Fill gezählt. Die Elliott-Studie zählt dagegen jede erste Erkennung einer Zählung — dort überlappen Fenster je Titel; das fängt der Titel-Cluster auf.
* **Querschnitt:** Signale verschiedener Titel in derselben Woche teilen dasselbe Marktfenster (Einstieg ≤ 8 Wochen + Horizont 26 Wochen ≈ 34 Wochen; täglich 20 + 126 Handelstage). Diese Abhängigkeit wird über den **Zeit-Cluster** erfasst.
* **Warum Kalenderquartal:** Monatsblöcke wären fast nie unabhängig (benachbarte Monate teilen > 80 % des Ergebnisfensters); Jahresblöcke ergeben im TEST-Zeitraum nur 8 Cluster (zu wenige für einen Bootstrap). Das Quartal ist der Kompromiss; benachbarte Quartale überlappen weiterhin (Restabhängigkeit, siehe §6). Sensitivität für den TEST-Lift (Wochenstudie, gleiche Records, Engine 2.x-Stichprobe):

| Zeitblock | Blöcke TEST | Titel-KI | Zeit-KI | Zweiweg-KI | maßgeblich |
|---|---|---|---|---|---|
| Monat | 93 | −0,82 … +0,16 | −1,71 … +0,77 | −1,63 … +0,91 | TWO_WAY |
| **Quartal** | **31** | −0,82 … +0,16 | **−1,81 … +1,20** | −1,84 … +1,13 | **TIME** |
| Halbjahr | 16 | −0,82 … +0,16 | −1,51 … +0,87 | −1,59 … +0,87 | TWO_WAY |
| Jahr | 8 | −0,82 … +0,16 | (−1,58 … +0,99, < 10 Cluster) | (−1,66 … +0,94) | SYMBOL |

(Pp.; Normal-KI alt: −0,86 … +0,15.) Das Quartal liefert das breiteste Intervall; die Aussage (kein Vorteil) ist gegen die Blocklänge robust.

## 4. Alt gegen neu — Wochenstudie

### 4a. Nur Inferenz (gleiche Records, Engine 2.x, Szenario 1.0) — isoliert die Wirkung der Clusterung

| Größe | n | Lift (Pp.) | KI alt (Normal) | **KI neu (Cluster)** | Schema | q (BH, Zeitraum-Familie) |
|---|---|---|---|---|---|---|
| Gesamt | 110.631 | +0,12 | −0,21 … +0,44 | **−0,77 … +1,00** | TWO_WAY | – |
| TRAIN | 44.062 | +1,22 | **+0,70 … +1,74** | **−0,05 … +2,45** | TIME | 0,16 |
| VALIDATION | 20.025 | −1,22 | **−2,00 … −0,45** | **−2,99 … +0,55** | TWO_WAY | 0,26 |
| **TEST (vorab registriert)** | 46.544 | −0,36 | −0,86 … +0,15 | **−1,93 … +1,20** | TIME | 0,64 |
| CONTINUATION · bearish | 22.270 | +1,34 | **+0,62 … +2,05** | −1,13 … +4,08 | TIME | 0,99 |
| CONTINUATION · bullish | 29.867 | −0,09 | −0,73 … +0,56 | −2,24 … +2,32 | TIME | 0,99 |
| PULLBACK · bearish | 20.467 | +0,01 | −0,72 … +0,74 | −2,27 … +2,72 | TIME | 0,99 |
| PULLBACK · bullish | 34.607 | −0,33 | −0,91 … +0,26 | −2,28 … +1,62 | TWO_WAY | 0,99 |
| BREAKOUT_RETEST · bullish | 2.235 | −1,23 | −3,58 … +1,12 | −4,06 … +1,60 | TWO_WAY | 0,99 |
| BREAKOUT_RETEST · bearish | 1.185 | −0,32 | −3,44 … +2,80 | −4,04 … +3,40 | TWO_WAY | 0,99 |

Die Cluster-Intervalle sind beim TEST-Lift **3,1× breiter**, beim Gesamtwert 2,7×.

### 4b. Neue Produktmessung (Engine 3.x laut PRODUCT_METHODOLOGY, Szenario `ti-scenario-1.1.0` / `elliott-3.2.2`)

Datei `quant/data/technical-intelligence/evidence/evidence-1W.json` (neu). „Alt" = bis 03.10.2026 veröffentlichter Bericht (Engine 2.x, Szenario 1.0, Normal-KI).

| Größe | n alt | Lift alt | KI alt (Normal) | n neu | Lift neu | KI neu Normal (Vergleich) | **KI neu Cluster (Produktfeld)** | Schema | q (BH) |
|---|---|---|---|---|---|---|---|---|---|
| Gesamt | 110.631 | +0,12 | −0,21 … +0,44 | 109.389 | +0,22 | −0,11 … +0,55 | **−0,62 … +1,06** | TWO_WAY | – |
| TRAIN | 44.062 | +1,22 | +0,70 … +1,74 | 43.535 | +1,29 | +0,77 … +1,81 | **+0,07 … +2,51** | TWO_WAY | 0,12 |
| VALIDATION | 20.025 | −1,22 | −2,00 … −0,45 | 19.835 | −0,88 | −1,66 … −0,10 | **−2,63 … +0,87** | TWO_WAY | 0,49 |
| **TEST (vorab registriert)** | 46.544 | −0,36 | −0,86 … +0,15 | 46.019 | −0,32 | −0,82 … +0,19 | **−1,73 … +1,09** | TWO_WAY | 0,66 |
| CONTINUATION · bearish | 22.270 | +1,34 | +0,62 … +2,05 | 24.586 | +1,22 | +0,54 … +1,90 | **−1,29 … +3,73** | TWO_WAY | 0,96 |
| CONTINUATION · bullish | 29.867 | −0,09 | −0,73 … +0,56 | 34.291 | +0,25 | −0,34 … +0,85 | **−1,99 … +2,50** | TWO_WAY | 0,96 |
| PULLBACK · bearish | 20.467 | +0,01 | −0,72 … +0,74 | 17.740 | −0,07 | −0,85 … +0,72 | **−2,50 … +2,37** | TWO_WAY | 0,96 |
| PULLBACK · bullish | 34.607 | −0,33 | −0,91 … +0,26 | 29.338 | −0,47 | −1,10 … +0,17 | **−2,45 … +1,80** | TIME | 0,96 |
| BREAKOUT_RETEST · bullish | 2.235 | −1,23 | −3,58 … +1,12 | 2.254 | −0,41 | −2,76 … +1,93 | **−3,11 … +2,29** | TWO_WAY | 0,96 |
| BREAKOUT_RETEST · bearish | 1.185 | −0,32 | −3,44 … +2,80 | 1.180 | +1,02 | −2,11 … +4,16 | **−2,70 … +4,74** | TWO_WAY | 0,96 |

Trefferquote Zielzone 1 im TEST: 35,38 % (Wilson 34,95–35,82 → Cluster **33,31–37,45**), Baseline 35,70 %.
TEST je Template (`byTemplateTest`, explorativ): alle sechs Cluster-KIs schließen 0 ein (z. B. CONTINUATION · bearish +1,41, Normal +0,41 … +2,41 → Cluster −2,90 … +5,71; PULLBACK · bullish −1,04, Normal −2,07 … −0,02 → Cluster −4,59 … +2,62), q = 0,91.

**Elliott-Studie unter Engine 3.x:** Die 3.x-Engine führt kaum noch unvollständige Impulse in Welle 3 (IMPULSE_W3_AFTER_W2 n = 3, vorher 14.160; W5 n = 993, vorher 18.896) — Folge der Musterwahl in 3.x (u. a. WXY), keine Änderung dieser Studie. Die verbleibenden Setups liegen weiterhin **unter** dem Zufall: Flat C −4,2 Pp. (Cluster −5,5 … −2,8), Zigzag C −4,3 (−5,7 … −2,9), Impuls W5 −17,0 (−21,5 … −12,6); W3 hat zu wenige Cluster (KI `null`).

**Tagesstudie (Golden 5, `evidence-1D-golden.json`):** TEST-Lift +2,47 Pp. (n = 162), Normal −6,30 … +11,24 → Cluster (nur Zeit-Schema; 5 Titel < 10 Cluster) **−6,41 … +11,63**; alt +1,62 (−7,05 … +10,28). Gesamt +0,15, Cluster −8,34 … +8,59.

## 5. Mehrfachtests und Kennzeichnung

| Kennzeichnung | Was | Korrektur |
|---|---|---|
| PREREGISTERED | Lift gegen Baseline gleicher Geometrie im TEST-Zeitraum (Hauptgröße, BACKTEST_METHODOLOGY §3); Kalibrierungs-Gate | keine (eine Hauptgröße); q in der Zeitraum-Familie zusätzlich ausgewiesen |
| PREREGISTERED_PRODUCT_LOOKUP | Setup-Zellen Template × Richtung × Agreement (Produkt-Nachschlagegröße), gepoolt über alle Zeiträume — **kein Holdout** | BH je Tabelle |
| DESCRIPTIVE | Gesamt, TRAIN, VALIDATION | BH in der Zeitraum-Familie |
| EXPLORATORY | Template, Template im TEST, Konfidenz, Agreement, Marktregime, Volatilität, Sektor, Jahr, Elliott-Rolle/Klarheit/Einstiegsform, Alignment, bedingte Lifts, Richtungs-Ablation, Elliott- und Fibonacci-Studie | BH je Tabelle + gepoolt |

**Welche früheren Aussagen kippen** (Wochenstudie, gleiche Records; „früher" = Normal-KI ohne 0):

* **Zeiträume:** TRAIN +1,2 Pp. und VALIDATION −1,2 Pp. waren „signifikant" — mit Cluster-KI nicht mehr. Der Vorzeichenwechsel zwischen den Zeiträumen ist mit Rauschen vereinbar.
* **Templates:** CONTINUATION · bearish (+1,3 Pp.) war die einzige Template-Zeile mit KI > 0 — jetzt −1,1 … +4,1, q = 0,99.
* **Setup-Zellen (Produkt):** 5 von 18 Zellen hatten ein KI ohne 0 — drei positiv (`1W|CONTINUATION|BEARISH|HIGH` +1,7, `…|MODERATE` +1,5, `1W|PULLBACK|BEARISH|HIGH` +1,7 Pp.), zwei negativ (`1W|PULLBACK|BEARISH|LOW` −2,6, `…|MODERATE` −1,5) — **keine** übersteht Cluster-KI und BH. Folge im Produkt (nach Neubau): Für die drei positiven Zellen vergibt `evidenceBadge()` nicht mehr „Experimentell"; da ihr Lift ≤ 2 Pp. ist und die KI-Untergrenze jetzt ≤ 0 liegt, greift in `overallConfidence()` die bestehende Regel `NO_HISTORICAL_EDGE` → Konfidenz LOW (statt bisher möglich HIGH). Die Regel selbst ist unverändert; geändert ist nur das gemessene Intervall.
* **Marktregime, Volatilität, Elliott-Einstiegsform, Sektor:** von 11 früher „signifikanten" Zeilen bleiben nach BH je Tabelle 2 (Volatilität EXTREME +2,2 Pp., q = 0,013; Sektor H +2,2 Pp., q = 0,038) — beide explorativ, nicht vorab registriert.
* **Jahre:** 13 von 34 Jahren bleiben nach BH von 0 verschieden — mit wechselndem Vorzeichen. Das ist Marktphasen-Heterogenität, kein stabiler Vorteil.
* **Richtungs-Ablation (Holdout ab 2019):** Mit Wilson-KI lag TREND (51,97 %, KI 51,62–52,32) über „immer long" (KI bis 50,66) → `derive-method-evidence.mjs` vergab TREND/CONFLUENCE „SUPPORTED". Mit Cluster-KI (Produktmessung 3.x): TREND 50,43–53,50, CONFLUENCE 50,25–53,43, „immer long" 45,89–54,68 — das Kriterium „KI-Untergrenze > Obergrenze von immer long" ist **nicht mehr erfüllt**. Nach dem nächsten Lauf von `derive-method-evidence.mjs` fallen TREND und CONFLUENCE auf NOT_ESTABLISHED. Nach BH (19 Regeln) ist keine Richtungsregel bei 5 % FDR von 50 % verschieden (kleinstes q = 0,054).
* **Elliott-Studie:** alle vier Setups bleiben **negativ** gegen den Zufall (z. B. W3 nach W2 −11,6 Pp., KI −13,2 … −9,9; unter 3.x siehe 4b) — die Aussage „Lehrbuch-Erwartung trifft nicht häufiger ein als Zufall" wird durch die Clusterung nicht schwächer.
* **Fibonacci:** 50 % zeigt eine kleine Häufung (Verhältnis 1,05, KI 1,02–1,08, q = 0,008), 38,2 %/78,6 % leicht darunter (q = 0,057). Explorativ; die Produktaussage „keine nennenswerte Häufung" bleibt sachlich richtig, sollte aber nicht „exakt 1" suggerieren.
* **Gesamt/TEST:** unverändert „kein Vorteil belegt" — nur das Intervall ist ehrlicher.

**BH-Ergebnis der neuen Produktmessung (Woche, FDR 5 % je Tabelle):** In den Tabellen Zeitraum, Setup-Zellen (18), Template, Template im TEST, Konfidenz, Agreement, Marktregime, Elliott-Rolle/Klarheit/Einstiegsform, Alignment, bedingte Lifts (16) und Richtungs-Ablation (19) ist **keine** Zeile signifikant. Signifikant bleiben nur: Volatilität EXTREME (+2,2 Pp., q = 0,023), Sektor H (+2,3 Pp., q = 0,016), 13 von 34 Einzeljahren (beide Vorzeichen), alle Elliott-Setup-Zeilen (negativ: Lehrbuch-Erwartung seltener als Zufall) und Fibonacci 50 % (Verhältnis 1,05, q = 0,008). Alle sind explorativ. Setup-Zellen mit früher KI > 0 unter 3.x: `CONTINUATION|BEARISH|HIGH` (+1,6, Cluster −1,2 … +4,4), `CONTINUATION|BULLISH|MODERATE` (+1,6, −1,4 … +4,7), `PULLBACK|BEARISH|HIGH` (+1,7, −1,0 … +4,4) — keine hält.

## 6. Verbleibende Grenzen

* **Survivorship (BLOCKED lokal):** Lokal nur heute gelistete Titel (`SURVIVORS_ONLY`). Der Eingang `--delisted` ist gebaut, aber das Bündel existiert nur im CI-Runner (R2, privat) und deckt Delistings erst ab 2015 ab; der Workflow `technical-intelligence-evidence.yml` ruft die Wochenstudie bisher nicht mit `--delisted` auf (Datei außerhalb dieses Auftrags). Delistete Reihen, die vor Ziel/Invalidation/Zeitablauf enden, fallen als OPEN/NO_DATA heraus (Zensierung).
* **Heutige Indexzugehörigkeit / Sektor:** Sektor- und Universumszuordnung stammen aus der heutigen Taxonomie (Look-ahead in `bySector`; Universum = heute gelistete Titel).
* **TEST-Zeitraum mehrfach angesehen:** ab 2019 jetzt zum **vierten** Mal gerechnet (Erstlauf, Messfehler-Korrektur, Elliott-Gewicht 0, dieser Messabgleich auf Engine 3.x mit Szenario 1.1.0). Er ist kein unberührter Holdout mehr; jede Aussage aus ihm ist bestenfalls „bestätigend unter Vorbehalt". Da keine Regel nach Ansicht dieses Laufs geändert wird, entsteht kein neues Tuning — aber auch keine neue Unabhängigkeit.
* **Engine-Stand:** Die neue Messung nutzt Szenario `ti-scenario-1.1.0` / `elliott-3.2.2` (Mission IV, zeitgleich vom Koordinator geändert: Kursniveaus nur positiv/plausibel, Measured Move proportional). Abweichungen zwischen 4a und 4b mischen Engine- und Szenario-Änderung; 4a isoliert die reine Inferenzwirkung.
* **Ohne Persistenz-Replay:** Das Produkt hält eine Elliott-Lesart über die Zeit (Hysterese); die Studie rechnet jeden Zeitpunkt zustandslos.
* **Restabhängigkeit:** Benachbarte Quartale teilen Ergebnisfenster; der Zeit-Bootstrap mit 31 TEST-Quartalen bleibt eher zu optimistisch. Zeilen mit < 10 Clustern (z. B. einzelne Jahre im Zeit-Schema, Tagesstudie mit 5 Titeln im Titel-Schema) erhalten nur das verbleibende Schema oder `null`.
* **Tagesstudie (Golden 5):** 5 Titel → Titel-Cluster unbrauchbar, nur Zeit-Cluster; Aussagen sind Illustration, keine Evidenz.
* **Produkt-Daten nicht neu gebaut:** `quant/data/technical-intelligence/v3/*` (Shards, evidence-summary) und `quant/methodology/technical-method-evidence.json` wurden nicht neu erzeugt (außerhalb dieses Auftrags). Bis zum Neubau zeigt das Produkt noch die alten Intervalle; `verify-technical-intelligence.mjs` meldet bis dahin erwartbaren Drift bei Konfidenzstufen.

## 7. Laufzeiten

| Lauf | Simulation | Bootstrap | Gesamt | Bemerkung |
|---|---|---|---|---|
| Woche, alt (Engine 2.x, 4 Worker statisch), Bericht 02.10. | – | – | 1.273 s | ohne Cluster-Bootstrap |
| Woche, Engine 2.x, neue Inferenz (2 Worker, Maschine stark ausgelastet) | 1.383 s | 522 s | 1.915 s | Vergleichsrechnung 4a |
| Teilmenge 60 Titel, Engine 2.x / 3.x (4 Worker statisch) | 13 s / 164 s | – | – | 3.x ≈ 12× teurer |
| **Woche, Produktmessung (3.x, Szenario 1.1.0, 4 Worker dynamisch)** | **5.616 s (94 min)** | **510 s** | **6.130 s (102 min)** | Last durch parallele Sitzungen (Load 5–17) |
| Tag, Golden 5 (3.x) | 65 s | 2 s | 67 s | |

Hochrechnung aus der Teilmenge: ≈ 25.000 CPU-s → bei 4 freien Kernen ≈ 105 min; die dynamische Warteschlange und die Wiederverwendung des Elliott-Ergebnisses (−28 % CPU) bringen den Lauf auf ≈ 90–100 min. Weitere Beschleunigung nur mit mehr Kernen (CI: `--workers` entsprechend setzen).

## 8. Reproduktion

```bash
node scripts/technical/ti-evidence.mjs --mode weekly --workers 4 [--records /tmp/w.rec.gz]   # Produktmessung
node scripts/technical/ti-evidence.mjs --mode daily --workers 4                             # Golden 5
node scripts/technical/ti-evidence.mjs --mode weekly --from-records /tmp/w.rec.gz --time-block MONTH --out /tmp/sens   # Sensitivität
node scripts/technical/ti-evidence.mjs --mode weekly --delisted "$RUNNER_TEMP/delisted-weekly.json"   # nur im CI-Runner
```


## Nachtrag Mission IV (Endstand, ti-scenario-1.2.1, elliott-3.2.2)

Wochenstudie neu gerechnet nach den Szenario-Korrekturen (Plausibilitätsgrenzen, tote Reihen, Elliott formt nur bei Anwendbarkeit ≥ MITTEL):

| Zeitraum | n | Lift gegen vorab registrierte Baseline (Cluster-KI) | Sensitivität: Baseline aus ±104 Wochen um das Signal (Cluster-KI) |
|---|---|---|---|
| TEST (vorab registriert) | 46.509 | −0,36 pp (−1,81 … +1,09) | −2,73 pp (−4,31 … −1,14) |
| TRAIN | 43.844 | +1,36 pp (+0,10 … +2,61) | −2,16 pp (−3,40 … −0,92) |
| VALIDATION | 19.767 | −1,11 pp (−2,66 … +0,43) | −2,09 pp (−3,82 … −0,36) |
| gesamt | 110.120 | +0,19 pp (−0,65 … +1,03) | −2,39 pp (−3,26 … −1,51) |

Die zeitraumgleiche Baseline (KL 6c) ist **nicht vorab registriert** und wird nur berichtet (eigener Zufallsstrom, die registrierte Baseline bleibt bitgleich). Sie zeigt: Zufallseinstiege gleicher Geometrie aus derselben Marktphase erreichen Zielzone 1 öfter (37,7 % im TEST) als die Szenarien (34,95 %). Mögliche Erklärungen: Die Szenarien entstehen bevorzugt in Phasen, in denen die nahe Zukunft ungünstiger ist (Konditionierung), oder die Szenario-Geometrie ist schlechter als zufällig. Beides spricht gegen jede Vorteilsbehauptung.
