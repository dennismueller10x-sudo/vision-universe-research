# Supertrader 5.0 – Full Strategy Advancement: Abschlussbericht

Stand: 22. Oktober 2026, Gesamtabschluss 23. Oktober 2026. Basis: `main` @ `f3afc8dc1` (nach #842, #844); #849 gemergt als `91c2fc87c`. Abschluss-Zweig: `claude/supertrader-5-closeout`.
Research Snapshot: `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`. Abrechnung: `research-v1`.

Alle historischen Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`. Keine Strategie ist live oder handelbar. Es gibt keine Orders, keine Brokeranbindung und keine Performanceaussage. Die Kennzahlen jedes Laufs liegen versiegelt; öffentlich sind nur Zählungen.

Maschinenlesbar und generiert:
- `scripts/supertrader/source-faithful/artifacts/STRATEGY-SF5-LIFECYCLE.json`: Matrix, Validierung, Modellannahmen, Varianten und Readiness je Lifecycle.
- [SUPERTRADER_5_LIFECYCLE_MATRIX.md](SUPERTRADER_5_LIFECYCLE_MATRIX.md): Source-to-Execution-Matrix, alle Zeilen.
- [SUPERTRADER_3_STRATEGY_READINESS.md](SUPERTRADER_3_STRATEGY_READINESS.md): die abgenommenen sechs Readiness-Dimensionen je Kandidat. Die Messklassen sind unverändert.

## Kurzfassung

- **Eine gemeinsame Research-Engine** (`research/lifecycle-engine.mjs`) führt Signal → Order → Fill → Stop → Management → Exit → research-v1-Abrechnung strategieneutral aus.
  - Jede Methode liefert einen eigenen Adapter mit eigener Quellentreue.
  - Die Engine trägt keine Methodenregel.
  - Die Plattform-Portfolio-Policy (Startkapital, Kosten, 20 Positionen, Gewichtsdeckel 25 %, neutrale Fill-Reihenfolge) ist von allen Originalregeln getrennt. Ihre Zahlen sind identisch mit der Minervini-Policy aus 4.0, damit Methoden vergleichbar bleiben.
- **Sieben neue Trade-Lifecycles** laufen auf dieser Engine:
  - Darvas Box (C03);
  - Kullamägi Common Breakout (C08);
  - Pocket Pivot (C11) und Buyable Gap-Up (C12);
  - Weinstein Investor (C04) und Trader (C05), beide **mit Datenausnahme**;
  - Holy Grail (C13) als **Research-Variante aus einer neu geprüften Quelle**, deren Annahme Sie entscheiden.
- **Fünf Lifecycles haben alle neun operativen Phasen ausführbar:** Darvas, Kullamägi Breakout, Buyable Gap-Up, Weinstein Investor und Weinstein Trader. Pocket Pivot und Holy Grail fehlt je eine Phase, und zwar aus Quellengründen:
  - Pocket Pivot hat keinen Initialstop, weil die Quelle keinen nennt.
  - Holy Grail hat kein Positionsmanagement, weil „trail stops as profits grow“ ohne Mechanik ist.
- **Jeder Lauf ist eine Modellstudie, kein Strategie-Backtest.** Jede Methode enthält mindestens eine manuelle Quellenentscheidung (Auswahl, Kontext oder Größe), die die Simulation durch eine deklarierte Annahme ersetzt.
- **Keine Statusaufwertung:**
  - Kein Vertragsregelstatus wurde geändert. Die Verträge sind nur um `researchEvidence` ergänzt.
  - Die Messklassen der 13 Kandidaten sind unverändert: 2 FULL_DIAGNOSTIC / 1 COMPONENT / 7 SCREEN / 3 NOT_MEASURABLE.
  - Live bleibt überall `LIVE_NOT_APPROVED`.
- **Abgenommene Referenzen sind unverändert und testgesichert:**
  - Turtle-Engine-Fingerabdruck (AG-3) `ae2a51ed86ae…`;
  - Minervini-Research-Code `b1d81fb8b67a…`;
  - Minervini-Varianten-Fingerabdruck `f13ea35016c5…`.

## Was gebaut wurde

| Baustein | Datei | Zweck |
|---|---|---|
| Gemeinsame Engine | `research/lifecycle-engine.mjs` | Order-Typen BUY_STOP / ON_OPEN / ON_CLOSE, Schutzstufen (Stop und strikter Auslöser), Next-Open-Exit, Teilverkauf, Größe (RISK / WEIGHT, Quelldeckel ≤ Plattformdeckel), research-v1 (Dividende, Stale-Grenze, Delisting, Ledger-Abstimmung) |
| Darvas | `research/darvas-lifecycle.mjs` | unveränderte Boxmaschine, Buy-Stop am Boxdeckel, Stop-Anhebung unter jede neue Box |
| Kullamägi Breakout | `research/kk-breakout-lifecycle.mjs` | Setup-Stellvertreter, Einstieg zum Schlusskurs, KK-012 exakt über `breakoutStopCheck`, Teilverkauf, MA10-Trail |
| Pocket Pivot / BGU | `research/moka-lifecycle.mjs` | Einstieg zur nächsten Eröffnung (PIT), Sell-Guide 10DMA/50DMA in beiden Lesarten, BGU-Stop am Gap-Tagestief |
| Weinstein | `research/weinstein-lifecycle.mjs` | Wochen-Setups identisch mit den Screens, Buy-Stop für die Folgewoche, WEIN-VOL5, Trailing mit gedruckten Schwellen |
| Holy Grail (Variante) | `research/holy-grail-lifecycle.mjs` | Quelle W-RAS97, Vertragsstatus unverändert |
| Registry, Matrix, Validator | `research/sf5-lifecycles.mjs`, `research/sf5-lifecycle-matrix.mjs` | Varianten-Fingerabdruck, 10 Phasen × Zeilen; Validator verbietet jede Aufwertung |
| Readiness-Artefakt | `completion/build-sf5-lifecycle.mjs` | sechs Dimensionen je Lifecycle; in `rebuild-all.mjs` eingebunden |
| Snapshot-Runner | `research/run-sf5-lifecycle.mjs`, Workflow-Modus `sf5-lifecycle(-smoke)` | alle vorregistrierten Varianten, Referenz zweimal (Determinismus), öffentlich nur Zählungen |

Wiederverwendet aus 2.0–4.0 (unverändert):
- alle Methoden-Screens (`methods/*.mjs`);
- `minervini-execution.mjs#fillRank` und `#lifecycleMetrics`;
- `validation/accounting-contract.mjs`;
- `runner/metrics.mjs`;
- das Research-Universum #705.

## Übersicht aller 13 Strategien

Legende:
- **Source Fidelity**: Regelstatus des Vertrags (exakt / abgeleitet / manuell / Daten / mehrdeutig).
- **LC**: Supertrader-5.0-Lifecycle.
- **ME** = MECHANICAL; **MA** = Modellannahme; **MR** = manuelle Prüfung.

| # | Strategie | Source Fidelity | Setup | Entry | Stop | Position Management | Exit | Data Coverage | Backtest Readiness | Manual Review | Live |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 | Turtle S1 | 7/13/0/2/2 | ME | ME | ME | ME (Pyramide) | ME; Failsafe-Exit mehrdeutig | Korrelation DATA_BLOCKED | FULL_DIAGNOSTIC mit Datenausnahme (unverändert) | 0 | nicht freigegeben |
| C02 | Turtle S2 | 7/12/0/2/0 | ME | ME | ME | ME | ME | Korrelation DATA_BLOCKED | FULL_DIAGNOSTIC mit Datenausnahme (unverändert) | 0 | nicht freigegeben |
| C03 | Darvas Box | 3/10/6/0/1 | ME (Box, ATH in verfügbarer Historie); Auswahl MR→MA | ME (Buy-Stop) | ME (Stop unter Deckel) | ME (Anhebung unter neue Box) | ME (nur Stop) | vollständig (ATH nur ab 2015) | **neu: MODEL_LIFECYCLE_STUDY**; Vertragsklasse COMPONENT | 4 Zeilen, 2 ersetzt | nicht freigegeben |
| C04 | Weinstein Investor | 1/5/9/2/0 | ME (Basis, MA-Gate); Stage MR→MA | ME (Buy-Stop Folgewoche) | Vorschlag MR→MA | MR→MA (8-%-Trailing) | VOL5 MR→MA; Stage 3/4 MR | Gruppe, Markt DATA_BLOCKED | **neu: MODEL_LIFECYCLE_STUDY_WITH_DATA_EXCEPTION**; Vertragsklasse SCREEN | 9 Zeilen, 5 ersetzt | nicht freigegeben |
| C05 | Weinstein Trader | 1/5/8/2/0 | ME (Fortsetzung, MA steigend) | ME | Vorschlag MR→MA | MR→MA (7-%-Trailing) | VOL5 MR→MA; früher Ausstieg MR | Gruppe, Markt DATA_BLOCKED | **neu: MODEL_LIFECYCLE_STUDY_WITH_DATA_EXCEPTION**; Vertragsklasse SCREEN | 9 Zeilen, 5 ersetzt | nicht freigegeben |
| C06 | Minervini SEPA/VCP | 0/9/7/1/0 (nur Übersetzung) | 4.0 | 4.0 | 4.0 | 4.0 | 4.0 | RS-Rating DATA_BLOCKED | MODEL_LIFECYCLE_STUDY (4.0, unverändert) | 14 Zeilen | nicht freigegeben |
| C07 | Minervini Power Play | 0/5/4/0/0 (nur Übersetzung) | 4.0 | 4.0 | 4.0 | 4.0 | 4.0 | vollständig | MODEL_LIFECYCLE_STUDY (4.0, unverändert) | 10 Zeilen | nicht freigegeben |
| C08 | Kullamägi Breakout | 4/1/6/1/0 | MR→MA (Stellvertreter) | Tagesvariante MA; ORH DATA_BLOCKED | **exakt (KK-012)** | MR→MA (Teilverkauf, Break-even) | MR→MA (MA10-Trail); Stop-Market exakt | ORH-Intraday DATA_BLOCKED | **neu: MODEL_LIFECYCLE_STUDY**; Vertragsklasse SCREEN | 6 Zeilen, 3 ersetzt | nicht freigegeben |
| C09 | Kullamägi Episodic Pivot | 4/1/3/3/1 | Gap-Evidenz | DATA_BLOCKED | exakt (KK-034), aber ohne Entry nicht anwendbar | – | mehrdeutig | Katalysator, Frühvolumen, ORH fehlen | NOT_MEASURABLE (unverändert) | 2 | nicht freigegeben |
| C10 | Kullamägi Parabolic Short | 3/0/4/3/0 | Evidenz | DATA_BLOCKED | DATA_BLOCKED | – | MR | Borrow, Intraday, VWAP fehlen | NOT_MEASURABLE (unverändert) | 4 | nicht freigegeben |
| C11 | Pocket Pivot | 1/3/5/0/1 | ME (Volumensignatur); Kontext MR→MA | MA (nächste Eröffnung); Intraday DATA_BLOCKED | **kein Stop in der Quelle** (SOURCE_BLOCKED) | MR→MA (Sell-Guide) | MA (Verletzung, beide Lesarten) | Intraday-Volumen fehlt | **neu: MODEL_LIFECYCLE_STUDY** (8/9 Phasen); Vertragsklasse SCREEN | 5 Zeilen, 3 ersetzt | nicht freigegeben |
| C12 | Buyable Gap-Up | 2/2/6/0/2 | ME (Gap ≥ 0,75 ATR40); Volumenfenster MA | MA (nächste Eröffnung) | MR→MA (Gap-Tagestief) | MR→MA (Sell-Guide) | MA | Intraday-Volumen, Megacap-PIT fehlen | **neu: MODEL_LIFECYCLE_STUDY**; Vertragsklasse SCREEN | 7 Zeilen, 4 ersetzt | nicht freigegeben |
| C13 | Raschke Holy Grail | 2/2/2/0/3 | ME (ADX, EMA-Berührung) | **Variante W-RAS97** (Entscheidung offen) | **Variante W-RAS97** | SOURCE_BLOCKED | MR→MA (neues Hoch) | Intraday fehlt | Vertrag NOT_MEASURABLE (unverändert); **Research-Variante** MODEL_LIFECYCLE_STUDY_RESEARCH_VARIANT | 3 Zeilen | nicht freigegeben |

## Antworten auf die Fragen des Auftrags

### Welche Strategien haben jetzt einen vollständigen mechanischen Lifecycle?

Ein vollständiger mechanischer Lifecycle heißt hier: alle neun operativen Phasen ausführbar, wenn auch teils unter deklarierten Modellannahmen.

- Minervini SEPA/VCP und Power Play (seit 4.0).
- **Neu:**
  - Darvas Box;
  - Kullamägi Breakout;
  - Buyable Gap-Up;
  - Weinstein Investor und Weinstein Trader, beide mit Datenausnahme.
- Turtle S1 und S2 (Engine seit 2.0).

Neu, aber nicht vollständig:
- **Pocket Pivot**: 8/9 Phasen. Es gibt keinen Initialstop, weil die Quelle keinen nennt und keiner erfunden wird.
- **Holy Grail**, Research-Variante: 8/9 Phasen. Es gibt kein Trailing, weil die Quelle keine Mechanik nennt.

### Welche davon sind nur Modellstudien?

Alle außer Turtle:
- Darvas, Kullamägi Breakout, Pocket Pivot, BGU und Minervini sind `MODEL_LIFECYCLE_STUDY`.
- Weinstein ist `MODEL_LIFECYCLE_STUDY_WITH_DATA_EXCEPTION`.
- Holy Grail ist `MODEL_LIFECYCLE_STUDY_RESEARCH_VARIANT`.

Der Grund ist bei allen derselbe: Die Quellen lassen Auswahl, Kontext oder Größe ausdrücklich beim Händler. Die Simulation ersetzt diese Entscheidungen durch benannte Annahmen (`MA-*-MANUAL-SUBSTITUTE` und weitere).

### Welche vollständigen diagnostischen Backtests sind zulässig?

Nur **Turtle S1 und S2** (`FULL_DIAGNOSTIC_STRATEGY_BACKTEST`, unverändert). Auch dort gilt die Datenausnahme für die Korrelationslimits.

Es wurde **kein neuer Strategie-Backtest** zugelassen. Die Kennzeichnung folgt der implementierten Methode, nicht dem Umfang der Ergebnisse.

### Welche Strategien wurden konkret weiterentwickelt?

- **Darvas**: vom Komponentenstudien-Signal zum Portfolio-Lifecycle mit Größe, Kapitalgrenze, Re-Entry und Abrechnung.
  - Golden Case: ohne Kosten und Kapitalgrenze ist der Lauf **trade-genau identisch** mit der abgenommenen `darvasComponentTrades`.
  - Geprüft auf 6 Zufallsreihen und 5 Treppenreihen, mit Stop-Anhebungen und mehrtägigen Trades.
- **Kullamägi Breakout**: KK-012 wird jetzt im Lifecycle ausgeführt (zu weiter Stop = Ablehnung, nie enger). Hinzu kommen Teilverkauf, Break-even, MA10-Trail und KK-001.
- **Pocket Pivot / BGU**:
  - Sell-Guide als Exit, je Balken identisch mit `sellGuideEvidence`.
  - Beide Lesarten der MA-Verletzung sind vorregistriert.
  - BGU-Stop am Gap-Tagestief.
- **Weinstein**:
  - Wochen-Setups sind setup-genau identisch mit `investorScreen` / `traderScreen`.
  - WEIN-VOL5 ist umgesetzt (HARD).
  - Trailing mit den gedruckten Schwellen 8–10 % (Investor) und 7 % (Trader).
  - Keine „jeder Schluss unter MA30“-Regel und kein fester Prozentstop.
- **Holy Grail**: Research-Variante aus der neu geprüften Quelle W-RAS97.
- **Turtle, Minervini, Kullamägi EP / Parabolic Short**: geprüft, nicht künstlich erweitert (siehe unten).

### Welche Daten- und Quellenlücken bleiben?

| Lücke | Strategien | Art |
|---|---|---|
| Intraday-Historie (ORH, ORL, projiziertes Volumen, VWAP, Intraday-Zeitebenen) | KK Breakout (ORH), EP, Parabolic Short, Pocket Pivot, BGU, Holy Grail | DATA_BLOCKED |
| Katalysator-, News-, Schätzungs- und Guidance-Historie | EP, Minervini-Fundamentals | DATA_BLOCKED |
| Borrow, Locates und Gebühren historisch | Parabolic Short, alle Short-Seiten | DATA_BLOCKED |
| PIT-Branchengruppen-Stage, NYSE-Breite | Weinstein | DATA_BLOCKED (SIC-Stellvertreter hebt nicht auf) |
| PIT-Korrelationsgruppen | Turtle | DATA_BLOCKED (Research-Variante bleibt) |
| IBD-RS-Rating | Minervini SEPA | DATA_BLOCKED |
| Listing-Historie vor 2015 (Allzeithoch) | Darvas | Teildaten; als MA-DAR-ATH-AVAILABLE-HISTORY deklariert |
| Pocket-Pivot-Stop, Holy-Grail-Trailing, Holy-Grail-Größe | C11, C13 | SOURCE_BLOCKED |
| Turtle: offener hypothetischer Breakout, Failsafe-Exit | C01 | SOURCE_AMBIGUOUS. Das Original „The Original Turtle Trading Rules“, S. 19 und 26, schweigt zu beiden Punkten (wörtlich geprüft). |
| Minervini: englischer Wortlaut | C06, C07 | Keine frei zugängliche Primärquelle des Autors gefunden: minervini.com ist eine Verkaufsseite, alte Blog-URLs liefern 404. Bleibt `REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION`. |
| Nicht deklarierte Reverse-Splits (V4-D1) | alle | offen geerbt → alles `DIAGNOSTIC_NOT_CERTIFIED` |

### Welche Ergebnisse sind reproduziert?

- **Synthetisch**:
  - Determinismus jeder Referenz (zweifacher Lauf mit identischem Ledger).
  - Präfix-PIT-Test für jeden Lifecycle: Entscheidungen vor einem Schnitt hängen nicht von späteren Balken ab. Zusätzlich hat das Code-Review alle Varianten mit 3 % fehlenden und 1 % synthetischen Balken geprüft.
  - Ledger-Abstimmung in jedem Lauf.
- **Snapshot**: maßgeblicher Lauf 39770019164 (Abschnitt „Snapshot-Lauf“). Datensatz `EXACT`, aktueller Research-Code, alle Varianten abgestimmt, Referenzen deterministisch.

### Welche Golden Cases und Tests wurden bestanden?

- Supertrader-Testsuite: **594 bestanden, 0 fehlgeschlagen**, 1 übersprungen (vorbestehend).
- Neu sind **36 Tests** in vier Dateien:
  - `sf-sf5-darvas-lifecycle`: 11;
  - `sf-sf5-kk-moka-lifecycle`: 14;
  - `sf-sf5-weinstein-lifecycle`: 6;
  - `sf-sf5-lifecycle-runner`: 5.
- Katalogisierte Golden Cases: **116/116 PASS** (`STRATEGY-GOLDEN-CASE-RESULTS.json`).
- Core-Tests: 212/212. Testisolation und Gate A (nur Supertrader-Pfade) sind sauber.
- Wichtigste neue Golden Cases:
  - `GC-SF5-DAR-EQUIV-COMPONENT` / `-EQUIV-RAISES`: identisch mit der abgenommenen Darvas-Komponentenstudie.
  - `GC-SF5-WEIN-SCREEN-EQUIV`: identisch mit den Weinstein-Screens.
  - `GC-SF5-MOKA-GUIDE-EQUIV`: identisch mit `sellGuideEvidence`.
  - `GC-SF5-KK-WIDE-STOP-REJECT` (KK-012).
  - `GC-SF5-WEIN-VOL5`.
  - `GC-SF5-MOKA-USED-VIOLATION`: Regressionstest zum Review-Befund.
  - `SF5-ENGINE-PIT-ALL-ADAPTERS`.

### Unabhängige Reviews

Zwei unabhängige Reviews haben nur den Code gesehen, nicht die Schlussfolgerungen dieses Berichts. Alle Befunde sind behoben, mit Regressionstests, wo sinnvoll. Offen sind **keine HIGH- und keine CRITICAL-Befunde**.

| Review | CRITICAL | HIGH | MEDIUM | LOW | Wichtigster Befund |
|---|---|---|---|---|---|
| Quellentreue | 0 | 1 | 8 | 8 | **H1**: WEIN-VOL5 fehlte beim Trader, obwohl der Vertrag die Regel als gemeinsame Regel führt. Behoben: Referenz mit VOL5, Alternative ohne. |
| Code / PIT / Accounting | 0 | 0 | 2 | 5 | **M1**: Eine verbrauchte 10DMA-Verletzung konnte nach einem Wechsel der Führungslinie erneut auslösen. Behoben, Regressionstest ohne Fix rot und mit Fix grün. **M2**: Der Darvas-Äquivalenztest prüfte keine Stop-Anhebungen. Ergänzt. |

Eine bewusst offen gelassene Einordnung aus dem Code-Review: Bei Darvas liegt der Stop einen Cent unter dem Trigger. Ein intraday ausgelöster Kauf mit einem Tief unter dem Stop am selben Tag ist auf Tagesbalken mehrdeutig. Die Referenz ist pessimistisch, wie in der Vertragsableitung von DAR-SF-STOP-INIT. Ein großer Teil der Darvas-Referenztrades misst daher die Intrabar-Annahme. Die Variante `ALT-INTRABAR-OPTIMISTIC` ist vorregistriert und zeigt die Spannweite.

## Snapshot-Lauf

Maßgeblicher Lauf seit dem Abschluss-PR: [39903861586](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39903861586), Commit `76d391a7e`, Workflow-Modus `sf5-lifecycle` (23.10.2026).

- **Datensatz:** wieder `EXACT` (`3ea6443de70c…`), derselbe wie unten.
- **Fingerabdrücke:**
  - Research-Code `1a8c6823f635…` ist identisch mit dem aktuellen Code.
  - Engine (AG-3) `ae2a51ed86ae…` ist unverändert.
  - Varianten-Fingerabdruck `f7b0d0812bf1…` wurde vor dem Lauf festgeschrieben.
  - Die SIC-Historie der Repository-Daten ist vollständig gehasht (`54d638c742a8…`, 5.758 CIKs).
- **Prüfungen:**
  - Alle 41 Varianten sind abgestimmt (Ledger-Replay, Endbestand PASS).
  - Jede Referenz ist deterministisch.
  - **Alle 7 Referenzen sind trade-genau gleich wie im Vorlauf 39770019164**: Trades, geschlossen, offen und Ausstiegsgründe.
  - Alle 39 früheren Varianten haben dieselben Trade-Zahlen.
  - Neu sind nur die zwei Weinstein-Varianten `ALT-SIC3-GROUP-PROXY`.
- **Kennzahlen:** versiegelt (Ablage `20261023T062300Z`).

| Weinstein-Variante `ALT-SIC3-GROUP-PROXY` | Investor | Trader |
|---|---|---|
| Trades (REF zum Vergleich) | 1.366 (1.348) | 1.773 (1.808) |
| vorbereitete Wochen-Setups | 1.259.819 | 1.199.500 |
| davon Gruppe bekannt / unbekannte Mitgliedschaft / zu wenige Mitglieder / zu kurze Historie | 72 % / 20 % / 5 % / 3 % | 70 % / 22 % / 5 % / 3 % |
| davon Gruppe unter fallender MA30w (gesperrt) | 105.182 (8,3 %) | 103.890 (8,7 %) |
| Sperrprüfungen `GROUP_PROXY_BELOW_FALLING_MA30W` (je Sitzung der Orderwoche gezählt) | 502.510 | 497.906 |

Was die Zählungen zeigen (keine Performanceaussage): Bei etwa jedem zwölften Setup verhindert der Gruppenfilter den Kauf. Die Zahl der Trades ändert sich trotzdem kaum (Investor +1 %, Trader −2 %), weil das Kapital an die Grenze von 20 Positionen gebunden ist: Frei gebliebene Plätze und das Kapital aus WEIN-VOL5-Verkäufen nutzen andere Setups. Für jedes fünfte Setup ist die Gruppe unbekannt; dort filtert die Variante nicht. Die Variante bleibt eine Research-Referenz und ist keine Regel.

Vorlauf [39770019164](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39770019164), Commit `6a484c59c` (jetzt `SUPERSEDED_BY_39903861586_SAME_REFERENCES`; die folgenden Zahlen gelten unverändert):

- **Datensatz:** `sts1-134d…`, 9.211 Segmente und 2.701 Sitzungen. Die Prüfung gibt `EXACT` (`3ea6443de70c…`), denselben Datensatz wie der maßgebliche Minervini-Lauf aus 4.0.
- **Fingerabdrücke:**
  - Research-Code `4ae0fe32544f…` (Stand #849; durch die SIC3-Variante abgelöst).
  - Engine (AG-3) `ae2a51ed86ae…` ist unverändert.
  - Varianten-Fingerabdruck `947eedb5eb11…` wurde vor dem Lauf festgeschrieben.
- **Prüfungen:** Alle 39 Varianten der 7 Lifecycles sind abgestimmt (Ledger-Replay, Endbestand PASS). Jede Referenz lief zweimal mit identischem Ergebnis.
- **Kennzahlen:** versiegelt auf `claude/supertrader-validation-results` (Ablage `20261022T121558Z`). Öffentlich sind nur Zählungen; eingetragen in `completion/build-sf5-lifecycle.mjs#SF5_SNAPSHOT_RUNS`.

| Lifecycle | REF-Trades (geschlossen / offen am Datenende) | häufigste Ausstiegsgründe der Referenz | Trades je Variante |
|---|---|---|---|
| Darvas | 19.556 (19.555 / 1) | Stop am Einstiegstag angenommen 17.002; sicher 1.772; Initialstop 432; angehobener Stop 321 | ALT-BOTTOM-AFTER-TOP-CONFIRMED 15.385; ALT-INTRABAR-OPTIMISTIC 7.515; Gewicht 5 % 21.965; Gewicht 20 % 14.924; Risiko 1 % 13.773 |
| Kullamägi Breakout | 6.601 (6.588 / 13) | Initialstop 4.008; Break-even-Stop 1.356; MA10-Trail 1.185 | Konsolidierung 20: 6.335; ohne MA: 7.015; nächste Eröffnung: 9.114; Teilverkauf Tag 5 / ½: 6.374; MA20-Trail: 5.797; ohne Teilverkauf: 5.396; Trail ab Einstieg: 6.583; Risiko 0,25 %: 8.445; Risiko 1 %: 5.573 |
| Pocket Pivot | 1.872 (1.852 / 20) | 50DMA-Verletzung 1.636; 10DMA-Verletzung 182 | ohne Kontext 2.510; Lesart nächster Tag 1.851; Gewicht 5 % 1.901; Gewicht 20 % 1.827 |
| Buyable Gap-Up | 3.415 (3.398 / 17) | Gap-Tagestief 1.403; Gap-Tagestief am Einstiegstag (sicher) 1.202; 50DMA 553; 10DMA 190 | ohne Kontext 4.334; Lesart nächster Tag 3.632; Risiko 0,5 % 3.763; Risiko 2 % 3.290 |
| Weinstein Investor | 1.348 (1.328 / 20) | WEIN-VOL5 1.038; Trailing-Stop 142; Initialstop 124 | ohne VOL5 311; Trailing 10 % 1.184; Risikoleitlinie 15 % 2.252; volle Position 1.230 |
| Weinstein Trader | 1.808 (1.789 / 19) | WEIN-VOL5 1.175; Initialstop 326; Trailing-Stop 217 | ohne VOL5 515; Risikoleitlinie 15 % 2.580 |
| Holy Grail (Variante W-RAS97) | 4.025 (4.006 / 19) | Initialstop 2.014; neues Hoch 1.318; Stop am Einstiegstag 633 | Balken vor Berührung 4.098; optimistisch 3.624; ADX am Impulshoch 2.164; nur erste Berührung 4.881 |

Was die Zählungen zeigen (keine Performanceaussage, die Kennzahlen bleiben versiegelt):

- **Darvas misst vor allem die Intrabar-Annahme.**
  - 87 % der Referenztrades enden am Einstiegstag mit einem angenommenen Stop.
  - Der Stop liegt einen Cent unter dem Trigger. Mit der optimistischen Lesart halbiert sich die Zahl der Trades (7.515), weil Positionen länger gehalten werden.
  - Tagesbalken können diese Frage nicht entscheiden. Sie braucht Intraday-Daten oder Ihre Festlegung (Entscheidung 4).
- **Weinstein wird von WEIN-VOL5 geprägt.**
  - Die meisten Ausbrüche erfüllen keine der drei gedruckten Volumenalternativen (jeweils mindestens das Doppelte). Sie werden bei der ersten Stärke verkauft, und das frei werdende Kapital erzeugt weitere Einstiege.
  - Ohne VOL5 bleibt das Buch mit 20 Positionen fast dauerhaft voll (311 bzw. 515 Trades).
  - Die Regel ist in #709 HARD. Ihre Operationalisierung („erste kleine Stärke“ = erster höherer Schluss) ist Modellannahme MA-WEIN-VOL5-STRENGTH.
- **Pocket Pivot ist kapazitätsgebunden.**
  - Ohne Preisstop werden Positionen nur über den Sell-Guide geschlossen. Die 20 Plätze sind fast immer belegt.
  - Welche Signale gehandelt werden, entscheidet damit die neutrale Fill-Reihenfolge, nicht die Methode.
  - Das ist eine Folge der Quellenlücke (kein Stop), kein Fehler. Es macht die Modellstudie aber wenig aussagekräftig.
- **Kullamägi:**
  - KK-012 lehnte 59.730 Ausbrüche wegen zu weiten Stops ab. Ein engerer Ersatzstop wurde nie gesetzt.
  - 81 % der geschlossenen Trades enden am Initial- oder Break-even-Stop.


## Geprüft, aber nicht weiterentwickelt (keine künstliche Arbeit)

- **Turtle S1/S2**: Die beiden quellenoffenen Regeln bleiben mehrdeutig, weil das Original schweigt (wörtlich geprüft). Die Korrelationslimits bleiben Research-Variante. Die Engine ist unverändert.
- **Minervini**: Es gibt keinen belegten Grund für Änderungen. Modellannahmen, Fingerabdrücke und Snapshot-Referenzen sind unverändert und per Test gesichert.
- **Kullamägi Episodic Pivot**: Entry (ORH), Katalysator und Frühvolumen bleiben DATA_BLOCKED. Eine Tagesbalken-Simulation wäre ein unzulässiger Ersatz.
- **Kullamägi Parabolic Short**: Entry, Stop (VWAP) und Borrow bleiben DATA_BLOCKED. Es gibt keine fiktive Short-Ausführung.

## Gesamtabschluss: Soll-Ist-Abgleich mit dem Masterauftrag

Stand: 23. Oktober 2026, nach dem Merge von #849 (`main` @ `91c2fc87c`). Geprüft wurden der Code auf `main` und die tatsächlichen Laufergebnisse. Es gab keine neue Forschungs- oder Datenkampagne.

### Arbeitspakete des Auftrags (§ 8)

| Paket | Inhalt laut Auftrag | Stand | Wo |
|---|---|---|---|
| A | gemeinsame Execution- und Accounting-Komponenten | erledigt: `research/lifecycle-engine.mjs` | #849 (gemergt) |
| B | Darvas Trade Lifecycle | erledigt | #849 |
| C | Kullamägi Common Breakout | erledigt | #849 |
| D | Pocket Pivot / Buyable Gap-Up | erledigt; Pocket Pivot 8/9 Phasen (die Quelle nennt keinen Stop) | #849 |
| E | Turtle / Weinstein / Minervini, belegbare Ergänzungen | Weinstein-Lifecycle in #849. **Neu:** freigegebene SIC3-Gruppenreferenz als Research-Variante (dieser Abschluss-PR). Turtle und Minervini sind geprüft; es gibt keine belegte Änderung, die Referenzen sind unverändert. | #849, Abschluss-PR |
| F | daten- und quellenblockierte Strategien | Holy Grail als Research-Variante in #849. Episodic Pivot und Parabolic Short sind geprüft und bleiben blockiert. | #849 |
| G | Gesamtdiagnostik, Readiness, Abschlussbericht | Bericht in #849; Gesamtabschluss in diesem Abschnitt | #849, Abschluss-PR |

### Neu im Abschluss-PR: Weinstein-Variante `ALT-SIC3-GROUP-PROXY`

- **Grundlage:** Ihre Entscheidung vom 21.10.2026 ([SUPERTRADER_3_WEINSTEIN_INDUSTRY_STRENGTH.md](SUPERTRADER_3_WEINSTEIN_INDUSTRY_STRENGTH.md), Abschnitt 7). `SIC3-EW-MIN5-400D-WIDE` darf als klar gekennzeichnete Research-Referenz verwendet werden.
- **Lücke:** Der 5.0-Lifecycle hat diese Referenz bisher nicht genutzt. Die Komponente aus 3.0 (`research/industry-strength.mjs`) war fertig, aber im Lifecycle nicht angebunden.
- **Umsetzung:** eine zusätzliche vorregistrierte Variante für Investor und Trader.
  - Ein Buy-Stop entfällt, wenn das SIC3-Gruppenchart in der abgeschlossenen Woche vor der Orderwoche **unter einer fallenden MA30w** schloss. Diese Lesart ähnelt Stage 4 und nutzt dieselbe MA30w wie das Gate der Aktie; es gibt keine neue Schwelle.
  - Eine unbekannte Mitgliedschaft, zu wenige Mitglieder oder zu kurze Historie blockieren nie.
- **Unverändert:**
  - die Referenz (setup- und trade-genau, Test);
  - `WEIN-SF-GROUP` bleibt `DATA_BLOCKED`;
  - das Label `…WITH_DATA_EXCEPTION`;
  - die Gruppen-Stage bleibt die Entscheidung des Reviewers (`WEIN-RG-GROUP`).
- **Prüfung:**
  - Ein PIT-Test mit veränderten Folgekursen und ein PIT-Test mit einer SIC-Änderung nach dem Entscheidungsschluss. Beide schlagen bei einem eingebauten Vorgriff an (Mutationsprobe).
  - Fail-closed ohne Gruppenindex.
  - Unabhängiges Review: 0 CRITICAL, 0 HIGH. Ein MEDIUM- und fünf LOW-Befunde sind behoben.
- **Snapshot-Lauf** 39903861586: Alle Referenzen sind trade-genau unverändert. Die Variante sperrt 8,3 % (Investor) bzw. 8,7 % (Trader) der Wochen-Setups; Einzelheiten im Abschnitt „Snapshot-Lauf“.

### Konsolidierte Readiness aller 13 Strategien

Legende:
- **Stufe** = höchste tatsächlich erreichte Research-Fähigkeit.
- **Phasen** = ausführbare operative Lifecycle-Phasen von 9.
- **Sperre:** D = Daten, Q = Primärquelle, E = Owner-Entscheidung.
- Live ist überall `LIVE_NOT_APPROVED`. Keine Strategie ist handelbar, zertifiziert oder originalgetreu vollständig.

| # | Strategie | Vertragsmessklasse (unverändert) | Stufe | Phasen | maßgeblicher Lauf | verbleibende Sperren |
|---|---|---|---|---|---|---|
| C01 | Turtle S1 | FULL_DIAGNOSTIC | vollständiger diagnostischer Strategie-Backtest **mit Datenausnahme** | 9/9 (eigene Engine) | Referenzläufe `CURRENT_ENGINE` | D: PIT-Korrelationsgruppen (Limits nur als Research-Variante aus 3.0). Q: offener hypothetischer Breakout und Failsafe-Exit (Original schweigt). |
| C02 | Turtle S2 | FULL_DIAGNOSTIC | wie S1 | 9/9 | wie S1 | D: PIT-Korrelationsgruppen |
| C03 | Darvas Box | COMPONENT | Modellstudie (`MODEL_LIFECYCLE_STUDY`) | 9/9 | sf5 | Q: Auswahl und Größe manuell (Modellannahme). D: Allzeithoch nur ab 2015. E: Größe / Intrabar (Entscheidung 4). |
| C04 | Weinstein Investor | SCREEN | Modellstudie mit Datenausnahme, dazu SIC3-Research-Variante | 9/9 | sf5 | D: PIT-Gruppen-Stage, NYSE-Breite. Q: Stage, Volumenurteil, RS und Overhead manuell. |
| C05 | Weinstein Trader | SCREEN | wie C04 | 9/9 | sf5 | wie C04 |
| C06 | Minervini SEPA/VCP | SCREEN | Modellstudie (4.0) | 9/9 | sf4 39746264325 | D: IBD-RS-Rating, Fundamentals- und Schätzungshistorie. Q: englischer Wortlaut nicht frei verfügbar. |
| C07 | Minervini Power Play | SCREEN | Modellstudie (4.0) | 9/9 | sf4 39746264325 | Q: englischer Wortlaut nicht frei verfügbar |
| C08 | Kullamägi Breakout | SCREEN | Modellstudie (KK-012 exakt) | 9/9 | sf5 | D: Opening-Range-High intraday. Q: Setup und Größe manuell. E: Referenz-Einstieg (Entscheidung 2). |
| C09 | Kullamägi Episodic Pivot | NOT_MEASURABLE | Komponenten (Gap-Evidenz, KK-034-Stop) | – | – | D: Katalysator-/News-Historie, Frühvolumen, Opening-Range-High |
| C10 | Kullamägi Parabolic Short | NOT_MEASURABLE | Komponenten (Evidenz) | – | – | D: Borrow/Locates historisch, Intraday, VWAP |
| C11 | Pocket Pivot | SCREEN | Modellstudie, unvollständig | 8/9 | sf5 | Q: kein Initialstop in der Quelle. D: Intraday-Volumen. |
| C12 | Buyable Gap-Up | SCREEN | Modellstudie | 9/9 | sf5 | D: Intraday-Volumen, Megacap-PIT. E: Volumenfenster (Entscheidung 3). |
| C13 | Raschke Holy Grail | NOT_MEASURABLE | Research-Variante W-RAS97, unvollständig | 8/9 | sf5 | E: Quelle D-RAS97 (Entscheidung 1). Q: Trailing ohne Mechanik. D: Intraday. |

Zusammengefasst:
- **Vollständiger diagnostischer Strategie-Backtest:** nur Turtle S1/S2, mit Datenausnahme.
- **Vollständige mechanische Modellstudie (9/9):** Darvas, Kullamägi Breakout, Buyable Gap-Up, Weinstein Investor/Trader, Minervini SEPA und Power Play.
- **Unvollständige Modellstudie (8/9):** Pocket Pivot (ohne Stop) und Holy Grail (Variante, ohne Trailing).
- **Nur Komponenten:** Episodic Pivot und Parabolic Short.
- **Nur Screens:** Keine Strategie ist mehr reiner Screen. Die Vertragsmessklasse bleibt trotzdem wie abgenommen, denn eine Modellstudie hebt sie nicht an.

### Geprüfte Restpunkte ohne Umsetzung (mit Begründung)

| Kandidat | Entscheidung | Grund |
|---|---|---|
| Weinstein-Marktfilter über die Universums-Breite (`buildMarketBreadth`) | nicht umgesetzt | Ihre Entscheidung vom 21.10.: die Universums-Breite hebt `WEIN-SF-MARKET` nie auf. Die Quelle nennt keine Schwelle, eine Variante bräuchte eine erfundene. |
| Kapitalgewichteter Gruppenindex | nicht umgesetzt | Im Snapshot `DATA_BLOCKED`. Ihre Entscheidung: kein neuer Capture. |
| Darvas „stärkste Aktie“ über die Branchenführung (`industryLeadership`) | nicht umgesetzt | Darvas nennt kein Fenster und keine Rangregel; eine Auswahlregel wäre erfunden. Die Auswahl bleibt manuell (Modellannahme). |
| Turtle-Korrelationslimits im Referenzlauf | nicht umgesetzt | Bleiben Research-Variante (Auftrag § 3B). Sie sind in 3.0 vorher/nachher gemessen. Die Engine (AG-3) bleibt unverändert. |
| Minervini | nicht umgesetzt | Es gibt keinen belegten Grund. Die Fingerabdrücke und Snapshot-Referenzen sind per Test gesichert. |
| Episodic Pivot / Parabolic Short über Tagesbalken | nicht umgesetzt | Der Auftrag schließt unzulässige Daily-Bar-Simulationen und fiktive Short-Ausführungen ausdrücklich aus. |
| Pocket-Pivot-Stop, Holy-Grail-Trailing | nicht umgesetzt | Sie fehlen in der Quelle, ein Ersatz wäre erfunden. |

**Ergebnis:** Nach dem Abschluss-PR bleibt **keine** klar beauftragte und technisch lösbare Implementierung offen. Jede verbleibende Einschränkung ist eine Daten- oder Quellensperre oder eine der vier Owner-Entscheidungen unten.

## Draft-PRs zur Freigabe

| PR | Inhalt | Zustand |
|---|---|---|
| [#849](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/849) | gemeinsame Engine; Lifecycles Darvas, Kullamägi Breakout, Pocket Pivot, BGU, Weinstein und Holy-Grail-Variante; Matrix, Readiness, Runner, Bericht | **gemergt** am 23.10.2026 (`91c2fc87c`); `main`-CI grün |
| Abschluss-PR (`claude/supertrader-5-closeout`) | Weinstein-Variante `ALT-SIC3-GROUP-PROXY`, neuer maßgeblicher Snapshot-Lauf, Gesamtabschluss | Draft, Freigabe offen |

## Entscheidungen, die von Ihnen benötigt werden

1. **D-RAS97 – Holy-Grail-Quelle annehmen?**
   - Die PDF liegt auf lindaraschke.net (AIQ Opening Bell, August 1997, sha256 `693ce571…`). Sie nennt Buy-Stop über dem vorigen Balken und Stop am neuen Swing-Tief.
   - Die Box ist wahrscheinlich eine Zusammenfassung der Redaktion, also kein Text von Raschke selbst.
   - Bei Annahme würden RAS-SF-ENTRY und RAS-SF-STOP in einem eigenen PR von SOURCE_AMBIGUOUS auf SOURCE_DERIVED gehen.
2. **Referenz-Einstieg Kullamägi Breakout.**
   - **Entschieden am 23.10.2026:** Research-Referenz ist jetzt die nächste Eröffnung. Bis dahin galt der Schlusskurs des Ausbruchstags; er ist das Vertrags-Timing und erlaubt KK-012 exakt, nutzt aber den finalen Schluss und das finale Tief (`CLOSE_DECISION_USES_FINAL_BAR`). Er läuft als Variante `ALT-ENTRY-BREAKOUT-DAY-CLOSE` weiter.
   - Die Alternative „nächste Eröffnung“ ist streng PIT, setzt KK-012 aber nicht wörtlich um.
   - Beide laufen. Zu entscheiden ist, welche als Referenz gelten soll.
3. **BGU-Volumenfenster.** Das Mittelungsfenster ist in #709 nicht belegt (SOURCE_AMBIGUOUS). Gemessen wird nur das 50-Sitzungen-Fenster des Screens. Bestätigen Sie das Fenster oder nennen Sie eine Quelle.
4. **Darvas-Größe und Intrabar-Annahme.** Die Referenz ist ein festes Gewicht von 10 % und pessimistisch, beides deklariert. Zu entscheiden ist, ob die Referenz so bleibt oder ob nur die Spannweite der Varianten berichtet werden soll.

Alles andere ist ohne Ihre Entscheidung abgeschlossen. Keine Variante ist aktiviert, und keine wurde nach Ergebnis gewählt.
