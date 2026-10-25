# Supertrader 7.0 – Ausführungs- und Validierungsprüfung ohne Kapitalmaßnahmen-Daten

Stand: 25. Oktober 2026. Basis `main` @ `7d5ef1097`. Zweig `claude/supertrader-7-execution-validation`.

Alle Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`. Nichts ist live, zertifiziert oder handelbar (`LIVE_NOT_APPROVED`). Es gibt keine Orders, keine Brokeranbindung, keine UI-Änderung und keine neuen Datenabrufe (EP/PS nur aus dem Cache, 0 Anfragen). Öffentlich sind nur Zählungen und Hashes. Die Kennzahlen bleiben versiegelt und wurden nicht gelesen; keine Variante wurde nach Ergebnis gewählt (E6).

Bereits erledigt und hier nicht neu gebaut: SF7-D1 bis D5 und die 13 Regressionstests aus #898 ([SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md](SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md), [SUPERTRADER_7_OPTIMISTIC_FIXES.md](SUPERTRADER_7_OPTIMISTIC_FIXES.md)). Minervini ist nicht Teil dieses Auftrags.

## 1. Ergebnis in Kürze

- **Kein Fehler in einer Referenz.** Die unabhängige Nachrechnung fand auf dem Snapshot **0 Verstöße**: in 59 Läufen der gemeinsamen Engine (41 sf5-Varianten, 6 SF7-Ausführungsvarianten, 2 neue Validierungsvarianten, dazu 10 EP-Läufe auf `CLEAN`).
- **PIT:** Für jede der 7 Referenzen wurden die Balken nach dem Stichtag 14.05.2021 verfälscht. Buchungen, Kurve, Einstiege, Ablehnungen und alle Signale und Orders bis einschließlich zum Stichtag sind identisch. Verglichen wurden 9,8 Mio. Signalauswertungen.
- **Referenzen hashgleich:**
  - sf5-Lauf 40228392651: **47 von 47** Varianten mit vollständig identischem öffentlichem Block gegenüber 40099831813.
  - KK-Cache-Lauf 40228395395: alle öffentlichen Blöcke identisch mit 40185748527 (EP, PS, E7-6-Erweiterung, `sf7Execution`).
- **Zwei Befunde mit Folgen für die Lesart der Ergebnisse** (keine Referenz geändert):
  - **SF7-V1 (LOW):** Weinstein-Trailing. Die Modellannahme sagt „Wochenhoch **am oder über** dem Hoch“, der Code verlangt „darüber“. Das ist jetzt als versionierte Lesart `EX7-WEIN-TRAIL-AT-OR-ABOVE` gemessen (Abschnitt 3).
  - **SF7-V2 (MEDIUM, offener Punkt aus 6.0/7.0 jetzt gezählt):** EP prüft den Stop am Einstiegstag nur gegen IEX-Minuten. Bei 180 von 222 über Nacht gehaltenen EP-Referenztrades liegt das konsolidierte Tagestief des Einstiegstags **unter** dem IEX-Stop (Abschnitt 4).
- **LOW aus §6 (6.0-Fingerabdrücke ohne `lifecycle-engine.mjs`) ist additiv gelöst:** Abdeckungsprüfung und zusätzlicher Fingerabdruck, kein gepinnter Hash verschoben (Abschnitt 5). Dabei gefunden: `engine/indicators.mjs` (`isoWeekKey`, Weinstein-Wochen) stand in keinem Fingerabdruck. Die Datei ist jetzt im sf5-Fingerabdruck.

## 2. Was geprüft wird (neu, `research/sf7-execution-checks.mjs`)

Die Prüfung rechnet jeden fertigen Lauf **unabhängig** gegen die Balken nach. Sie ruft keine Fill-, Größen- oder Buchungsfunktion der Engine auf.

| Bereich | Prüfung |
|---|---|
| Timing | Kein Fill vor dem Signal. Ein Schlusskurs-Einstieg liegt auf dem Signalbalken, alle anderen auf der **nächsten Sitzung** des Kalenders. Eine Next-Open-Ausführung liegt auf einer Sitzung nach ihrer Planung. |
| Fill | Jeder Fill liegt im Bereich seines Balkens. Je Basis gilt: Eröffnung = Open, Gap-Fill = Open ≥ Level, Berührung = Level (Open < Level ≤ High), Schluss = Close. Kein Einstieg am oder unter dem Stop. |
| Stop | Ein erreichter Stop wird nie übersprungen, auch nicht am Tag eines Teilverkaufs. Fill = min(Open, Stop), bei Gap also die Eröffnung und nie der Stop; die Gap-Bezeichnung passt dazu. Angehobene Stops sinken nie. Ein Stop am Einstiegsbalken wird ausgeführt; ein übergangener Same-Bar-Stop ist nur unter OPTIMISTIC zulässig. |
| Größe | Stückzahl = min(⌊Risiko bzw. Gewicht⌋, ⌊Gewichtsdeckel⌋, ⌊Kasse / Stückkosten⌋). Grundlage ist das Kapital des Vorabend-Schlusses und die Kasse im Moment des Fills (aus dem Ledger nachgespielt). Risiko und Gewicht liegen nie über ihrer Grenze. |
| Bücher | An **jeder Sitzung** gilt Kasse + Bestände × letzter Schluss = Kurve. Weiter: Kasse nie negativ, kein negativer oder überverkaufter Bestand, Gebühr = 1 bp, keine Dividende am Kauftag, nie mehr offene Positionen als erlaubt. Toleranz = Abstimmungsgrenze der Engine. |
| PIT | `corruptAfter` ersetzt alle Balken nach dem Stichtag durch fremde Werte (gleiche Daten, gleiche Felder). `decisionsThrough` und `signalsThrough` müssen bis zum Stichtag identisch sein; die Orders, die am Stichtag-Schluss scharfgestellt werden, gehören dazu. |
| Stabilität | Läufe ohne einen Titel (3 deterministisch gewählt: meiste Trades, dann sha256-Reihenfolge der IDs) und mit dem Start eine Sitzung später. Gezählt wird je Trade: unverändert / nur Stückzahl anders / Ausstieg anders / entfallen / neu. Nur Zählungen; die IDs bleiben versiegelt. |

**Gegenproben** (Test `SF7-VAL-CHECKER-DETECTS`): Jeder eingebaute Defekt wird gefunden, nämlich Einstieg vor dem Signal, falscher Eröffnungspreis, falsche Stückzahl, Stop-Gap zum Stop statt zur Eröffnung, übersprungener Stop, verfälschte Kurve, Fill außerhalb des Balkens, Dividende am Kauftag, fehlender Same-Bar-Stop, gesenkter Stop und unter PESSIMISTIC übergangener Stop.

Für die PIT-Prüfung erkennt eine Negativkontrolle einen Adapter, der 40 Sitzungen vorausschaut.

**Grenze:** Datensatzweite Ableitungen (`spyTR`, Gruppenproxies) werden nicht verfälscht. Keine Referenz liest sie.

## 3. Je Strategie

Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, research-v1. „Verstöße“ zählt über alle registrierten Varianten der Strategie. „Stabilität“ zeigt die Spannen über die drei Läufe ohne einen Titel; „unverändert“ heißt gleiche Stückzahl, gleicher Einstieg und gleicher Ausstieg.

| Strategie | Geprüft (REF) | Verstöße | PIT | Stabilität ohne 1 Titel: unverändert / nur Stückzahl / entfallen+neu | Start +1 Sitzung: unverändert / nur Stückzahl / entfallen+neu |
|---|---|---|---|---|---|
| Darvas | 19.556 Trades, 18.774 Same-Bar-Ausstiege, 535 Anhebungen | 0 | identisch | 16.318–19.536 / 18–3.088 / 1–300 | 11.072 / 8.347 / 330 |
| Kullamägi Breakout | 9.114 Trades, 4.009 Next-Open-Ausstiege, 2.525 Anhebungen | 0 | identisch | 2.709–6.976 / 1.514–4.925 / 1.230–2.916 | 2.899 / 4.810 / 2.851 |
| Pocket Pivot | 1.872 Trades, 51.477 gehaltene Sitzungen | 0 | identisch | 146–668 / 799–1.204 / 801–1.079 | 76 / 1.208 / 1.210 |
| BGU | 3.415 Trades, 1.403 Stop-Ausstiege | 0 | identisch | 450–2.191 / 879–2.095 / 780–1.835 | 495 / 2.057 / 1.736 |
| Weinstein Investor | 1.348 Trades, 454 Anhebungen | 0 | identisch | 242–387 / 837–986 / 193–210 | 39 / 1.144 / 417 |
| Weinstein Trader | 1.808 Trades, 485 Anhebungen | 0 | identisch | 156–751 / 796–1.133 / 619–1.096 | 98 / 1.129 / 1.223 |
| Holy Grail W-RAS97 | 4.025 Trades, 633 Same-Bar-Ausstiege | 0 | identisch | 1.351–2.518 / 1.030–1.873 / 946–1.594 | 397 / 2.486 / 2.330 |
| Episodic Pivot (CLEAN) | 611 Trades, 389 Stops am Einstiegstag (IEX) | 0 | lokal (Test) | – | – |
| Parabolic Short | lokal (Golden Case, PIT-Test) | – | lokal (Test) | – | – |
| Turtle S1/S2 | lokal (alle Lesarten, Ledger und PIT) | 0 | lokal (Test) | – | – |

Einordnung der Stabilität (nur Zählungen, keine Performanceaussage):
- In keinem Lauf ändert sich der **Ausstieg** eines Trades mit gleichem Einstieg (`changed` = 0). Die Exit-Logik hängt nur von der Kursreihe des Titels ab.
- Die Instabilität ist reiner Portfolio-Knock-on: Andere Stückzahlen entstehen über das Kapital, entfallene und neue Trades über Positionsgrenze und Kasse.
- Bei Pocket Pivot, Weinstein und KK verschiebt schon ein Titel oder eine Sitzung den Großteil der Trades. Das bestätigt E6 (geringe Trade-Stabilität) für die übrigen Strategien mit Zahlen.

Je Strategie:

- **Turtle S1/S2** (eigene Engine, gepinnt `89fbcf86…`, nicht geändert)
  - Geprüft für alle drei Lesarten von `entryBarOrder` sowie `failsafeExit` 10D/20D (S1):
    - Ledger gegen Balken, Bücher je Sitzung;
    - Einstieg = max(Eröffnung, Trigger) mit Trigger ≤ Hoch;
    - PIT durch Verfälschung (Buchungen, Kurve, Signale, Einheiten-Ausstiege bis zum Stichtag).
  - Befund: kein Fehler.
  - Tests: `SF7-VAL-TURTLE-LEDGER`, `SF7-VAL-TURTLE-PIT-CORRUPTION`.
  - Kein Snapshot-Lauf: Er hätte den gepinnten Runner ändern müssen. Die Golden Cases bestehen schon (GC-TUR-*).
- **Darvas**
  - Befund: kein Fehler.
  - Golden Case `SF7-GC-DARVAS`: 138 Stück = ⌊10.000 / 72,01⌋, Anhebung auf 72,29, PnL 16,7353.
- **Kullamägi Breakout**
  - Befund: kein Fehler.
  - Golden Case `SF7-GC-KK-BREAKOUT`: 806 = min(⌊500 / 0,6⌋ = 833, ⌊25.000 / 31⌋); 1/3 zu 32,8, Rest am Break-even 31; PnL 428,0989.
- **Pocket Pivot**
  - Befund: kein Fehler.
  - Golden Case `SF7-GC-POCKET-PIVOT`: 235 Stück; Schluss 43,9 < MA10 44,215 setzt 43,6; die Eröffnung 43,4 liegt darunter, also Gap-Ausstieg; PnL 177,5319.
- **BGU**
  - Befund: kein Fehler.
  - Golden Case `SF7-GC-BGU`: 649 Stück; Gap unter den Stop 37,6 wird zur **Eröffnung 37,2** ausgeführt; PnL −897,7423.
- **Weinstein Investor/Trader**
  - Befund SF7-V1 (LOW, Deklaration ≠ Code), siehe unten.
  - PIT-Hinweis: Ob eine Woche vollständig ist, erkennt der Code am Datum des nächsten Balkens. Das ist Kalenderwissen, die Werte des Balkens werden nicht gelesen. Bei einem fehlenden Freitagsbalken wird die Wochenentscheidung am Donnerstagsschluss getroffen und gilt ab derselben nächsten Sitzung. Das Ergebnis ist also gleichwertig; die Verfälschungsprüfung bestätigt es (identisch).
  - Golden Case `SF7-GC-WEINSTEIN-TRADER`: Buy-Stop 25,01, Stop 22,99, 399 Stück, Gap-Ausstieg 22,5, PnL −1.022,3422.
  - Golden Case `SF7-VAL-WEIN-TRAIL-GOLDEN`: gleiches Wochenhoch nach mehr als 8 % Korrektur.
- **Holy Grail W-RAS97**
  - Befund: kein Fehler.
  - Golden Case `SF7-GC-HOLY-GRAIL`: Buy-Stop 33,11, Gap-Fill 33,3, 750 Stück, Ausstieg nach neuem Hoch zu 38,8, PnL 4.065,5179.
- **Episodic Pivot**
  - Befund SF7-V2, siehe Abschnitt 4.
  - Golden Case `SF7-GC-EP`: 1.077 = min(⌊500 / 0,26⌋ = 1.923, ⌊25.000 / 23,21⌋), Ausstieg 27,1, PnL 4.129,9282, Diagnosefall Tagestief 22,5.
  - PIT-Test: `SF7-VAL-EP-PIT-CORRUPTION`.
- **Parabolic Short**
  - Befund: kein Fehler.
  - Golden Case `SF7-GC-PS`:
    - Short 26,79, Stop 27,51;
    - Ziel MA10 der Vortage 21,9187, Rendite 0,17983;
    - Gap über den Stop wird zur **Eröffnung 27,8** eingedeckt, Rendite −0,03994.
  - Test `SF7-VAL-PS-PIT`: Einstieg, Stop und Ziel hängen nicht von späteren Minuten oder Balken ab.
- **Intrabar-Reihenfolge:** Ein Ziel liegt in keiner sf5-Strategie auf demselben Balken wie ein Stop; KK-Teilverkauf und HG-Ausstieg laufen über die nächste Eröffnung. Einstieg gegen Stop entscheidet überall PESSIMISTIC. Bei Turtle kommt der Stop vor dem Kanalausstieg, bei PS der Stop vor dem Ziel. Konsistent, kein Fehler.

### SF7-V1 → Lesart `EX7-WEIN-TRAIL-AT-OR-ABOVE` (Variante `SF7-WEIN-TRAIL-AT-OR-ABOVE`)

- **Befund:** `MA-WEIN-TRAIL` erklärt: „a weekly high **at or above** that high raises the stop“. Der Code (`weinstein-lifecycle.mjs`) prüft `wk.high > st.peak`. Ein gleiches Wochenhoch setzt dort die Korrektur fort.
- **Umsetzung:** Opt-in-Flag `trailAtOrAbove` in `makeAdapter`, exportiert als `makeWeinsteinAdapter`. Die Referenzadapter haben kein Flag; Version, sf5-Register `0a1260e9…` und alle Referenz-Hashes bleiben unverändert. Register `sf7ValidationSha256 = d112eab5…`, vor dem Lauf gepinnt.
- **Vorher/Nachher** (Lauf 40228392651, nur Zählungen):

| Variante | Trades (REF) | unverändert | nur Stückzahl | Ausstieg anders | entfallen / neu | Stop-Anhebungen gegenüber REF |
|---|---|---|---|---|---|---|
| Investor | 1.294 (1.348) | 380 | 824 | 2 | 142 / 88 | −15 |
| Trader | 1.870 (1.808) | 917 | 617 | 2 | 272 / 334 | +30 |

- Direkt betroffen sind nur wenige Trades (je 2 mit anderem Ausstieg). Der Rest ist Knock-on. Die Referenz bleibt `>`. Welche Lesart gilt, ist eine Eigentümerentscheidung: Die Quelle („return near the prior high“) nennt keine Zahl.

## 4. SF7-V2: EP-Stop am Einstiegstag nur gegen IEX (MEDIUM, jetzt gezählt)

- **Diagnose:** `entryDayLowBelowStopKept` (KK-Runner 1.5.0, Block `ep.sf7Validation`, Day-Set `CLEAN`). Gezählt wird ein Einstiegstag, an dem das **konsolidierte Tagestief strikt unter** dem Stop liegt (Stop = Tagestief vor dem Fill aus offizieller Eröffnung und IEX-Minuten), ohne dass ein IEX-Stop am selben Tag fiel.
- **Zählungen:**
  - REF: **180** von 611 Trades; 389 Trades enden schon am Einstiegstag per IEX-Stop. Damit trifft es 180 von 222 über Nacht gehaltenen Trades.
  - Andere Varianten: ALT-ORH-5 189 / 403, ALT-NO-VOLUME-RULE 313 / 1.042, SF7-ALT-FILL-MINUTE-OPTIMISTIC-CERTAIN-RULE 182 / 606.
  - IEX-Preise außerhalb der Tagesspanne: Einstieg 1, Same-Day-Ausstieg 1 (REF).
- **Bedeutung:**
  - Ein Tagesbalken zeigt nicht, ob das tiefere konsolidierte Tief **vor** dem Fill lag (dann wäre der KK-034-Stop tiefer) oder **danach** (dann wäre der Stop gefallen).
  - Beide Fälle sind mit IEX-Daten nicht auflösbar. Die EP-Referenz ist deshalb bei bis zu 180 Trades möglicherweise optimistisch.
  - Behebung nur mit konsolidierten Minuten (Datenblocker, bekannt). Keine Referenz geändert, keine Variante gewählt.

## 5. Code-Fingerabdrücke (LOW aus §6), `research/sf7-code-coverage.mjs`

- **Befund:**
  - `validationCodeSha256` und `integrityCodeSha256` (6.0) decken nur ihre eigenen Dateien ab.
  - Die statisch **ausgeführte** Import-Hülle von `run-sf6-validation.mjs` bzw. `run-sf6-integrity.mjs` hat 33 Dateien außerhalb der eigenen Receipts, darunter `lifecycle-engine.mjs` und `minervini-execution.mjs`.
  - `engine/indicators.mjs` lag in **keinem** eingetragenen Fingerabdruck.
  - Nicht verfolgt werden `runner/run-research.mjs` und `run-sf3-research.mjs`: Sie sind nur für `codeSha256` bzw. `attachSecPit` importiert und selbst eingetragen. Ihre übrigen Importe (Verträge, Register, Korrelation, Breite) führen die Referenzen nicht aus.
- **Lösung additiv** (Test `SF7-VAL-CODE-COVERAGE`):
  1. Für alle fünf Runner (sf6-validation, sf6-integrity, sf5, sf4, kk) liegt jede ausgeführte Abhängigkeit in mindestens einem eingetragenen Fingerabdruck: AG-3-Engine, sf5, sf4, sf6, kk. Eine neue, nicht abgedeckte Abhängigkeit lässt den Test fehlschlagen.
  2. `lifecycle-engine.mjs` ist über den sf5-Fingerabdruck abgedeckt (gegen den eingetragenen Lauf geprüft), `minervini-execution.mjs` über den sf4-Fingerabdruck (gepinnt `c834b227…`).
  3. Ein zusätzlicher Fingerabdruck `sf6EngineFilesSha256` über beide Engine-Dateien ist gepinnt: `7edb24de…`. Das ist der Stand der 7.0-Identitätsläufe; beide Dateien sind seit `d1ea0179` bzw. `7bd28f69` unverändert.
  4. Unverschoben (im Test geprüft):
     - `integrityCodeSha256` = `7ca45bc9…` (sf6-run-facts);
     - SF6-PAPER-2027 1.1.0 `e623b336…`;
     - Turtle `89fbcf86…`, sf4 `c834b227…`;
     - sf5-Register `0a1260e9…`, SF7-Register `310cb075…`.
- **Bewusst verschoben** (neu eingetragen, Referenzen hashgleich): der sf5-Research-Fingerabdruck (`0726cac0…`, enthält jetzt `engine/indicators.mjs` und die Validierungsmodule) und der KK-Research-Fingerabdruck (`a1aa5b0b…`).

## 6. Läufe

| Lauf | Modus | Commit | Ergebnis |
|---|---|---|---|
| [40228392651](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40228392651) | `sf5-lifecycle` | `f60b3bb8` | Datensatz `EXACT`, Variantenregister unverändert. 47 / 47 Varianten identisch mit 40099831813. 0 Verstöße in 49 geprüften Läufen. PIT identisch für 7 / 7 Referenzen. Laufzeit 93 min. Neuer AUTHORITATIVE-Eintrag; 40099831813 wird `SUPERSEDED_BY_40228392651_SAME_REFERENCES`. |
| [40228395395](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40228395395) | `kk-intraday-cache` | `f60b3bb8` | **0 Anfragen.** candidates, intradayCoverage, sampling, extE7_6, ep (inkl. `sf7Execution`) und ps identisch mit 40185748527. Ebenso Minuten- und Basis-Cache sowie die EP- und PS-Register. Neuer AUTHORITATIVE-Eintrag; 40185748527 wird `SUPERSEDED_BY_40228395395_SAME_PUBLIC_RESULTS`. |

Die Artefakte `STRATEGY-SF5-LIFECYCLE.json`, `STRATEGY-KK-EP-PS-CHART.json` und `SUPERTRADER_5_LIFECYCLE_MATRIX.md` sind mit ihren Erzeugern neu gebaut. `STRATEGY-SF6-READINESS.json` und `STRATEGY-SF7-COMPLETION.json` sind unverändert.

## 7. Tests

Neu ist `scripts/supertrader/tests/sf-sf7-execution-validation.test.mjs` mit 20 Tests, dazu die Fixture `tests/fixtures/sf7-golden-scenarios.mjs`. Die Supertrader-Suite hat 810 / 810 grüne Tests, die Core-Tests 238 / 238; `check-test-isolation` und Gate A sind grün.

## 8. Verbleibend

| Schwere | Punkt |
|---|---|
| MEDIUM | SF7-V2: EP-Stop am Einstiegstag nur IEX (180 / 222 betroffen); lösbar nur mit konsolidierten Minuten |
| LOW | SF7-V1: Weinstein „am oder über“ gegen „darüber“; Eigentümerentscheidung, welche Lesart die Referenz wird (dann neue Referenzversion mit diesem Vorher/Nachher) |
| LOW | Terminal-Datum: Am letzten Handelstag eines delisteten Titels entsteht keine neue Position (Review SF5-C-L3). Das nutzt das bekannte Enddatum, betrifft nur Schlusskurs-Einstiege und keine Referenz. Unverändert. |
| LOW | Die 6.0-Receipts selbst bleiben ohne Engine-Datei. Abgedeckt nur über die anderen Fingerabdrücke und den Zusatz-Fingerabdruck. |
