# Supertrader 5.0 – Full Strategy Advancement: Abschlussbericht

Stand: 22. Oktober 2026. Basis: `main` @ `f3afc8dc1` (nach #842, #844). Zweig: `claude/supertrader-5-lifecycle-engine-darvas`.
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
- **Snapshot**: Abschnitt „Snapshot-Lauf“ unten.

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

SNAPSHOT_RUN_PLACEHOLDER

## Geprüft, aber nicht weiterentwickelt (keine künstliche Arbeit)

- **Turtle S1/S2**: Die beiden quellenoffenen Regeln bleiben mehrdeutig, weil das Original schweigt (wörtlich geprüft). Die Korrelationslimits bleiben Research-Variante. Die Engine ist unverändert.
- **Minervini**: Es gibt keinen belegten Grund für Änderungen. Modellannahmen, Fingerabdrücke und Snapshot-Referenzen sind unverändert und per Test gesichert.
- **Kullamägi Episodic Pivot**: Entry (ORH), Katalysator und Frühvolumen bleiben DATA_BLOCKED. Eine Tagesbalken-Simulation wäre ein unzulässiger Ersatz.
- **Kullamägi Parabolic Short**: Entry, Stop (VWAP) und Borrow bleiben DATA_BLOCKED. Es gibt keine fiktive Short-Ausführung.

## Draft-PRs zur Freigabe

| PR | Inhalt | Zustand |
|---|---|---|
| PR_PLACEHOLDER | Gemeinsame Engine, Lifecycles Darvas, Kullamägi Breakout, Pocket Pivot, BGU, Weinstein, Holy-Grail-Variante, Matrix, Readiness, Runner, Workflow-Modus, Bericht | Draft, Tests grün, Reviews eingearbeitet |

Warum ein PR statt der empfohlenen sieben Pakete: Engine, Registry, Matrix, Validator, Readiness-Artefakt und Runner bilden eine technische Einheit. Jede Lifecycle-Ergänzung erzeugt dieselben generierten Artefakte neu (`STRATEGY-*.json`, Golden Record, Readiness-Dokumente). Getrennte PRs würden bei jedem Merge in Artefaktkonflikte laufen. Die Commits sind nach Arbeitspaketen gegliedert.

## Entscheidungen, die von Ihnen benötigt werden

1. **D-RAS97 – Holy-Grail-Quelle annehmen?**
   - Die PDF liegt auf lindaraschke.net (AIQ Opening Bell, August 1997, sha256 `693ce571…`). Sie nennt Buy-Stop über dem vorigen Balken und Stop am neuen Swing-Tief.
   - Die Box ist wahrscheinlich eine Zusammenfassung der Redaktion, also kein Text von Raschke selbst.
   - Bei Annahme würden RAS-SF-ENTRY und RAS-SF-STOP in einem eigenen PR von SOURCE_AMBIGUOUS auf SOURCE_DERIVED gehen.
2. **Referenz-Einstieg Kullamägi Breakout.**
   - Heute gilt der Schlusskurs des Ausbruchstags. Das ist das Vertrags-Timing und erlaubt KK-012 exakt, nutzt aber den finalen Schluss und das finale Tief (`CLOSE_DECISION_USES_FINAL_BAR`).
   - Die Alternative „nächste Eröffnung“ ist streng PIT, setzt KK-012 aber nicht wörtlich um.
   - Beide laufen. Zu entscheiden ist, welche als Referenz gelten soll.
3. **BGU-Volumenfenster.** Das Mittelungsfenster ist in #709 nicht belegt (SOURCE_AMBIGUOUS). Gemessen wird nur das 50-Sitzungen-Fenster des Screens. Bestätigen Sie das Fenster oder nennen Sie eine Quelle.
4. **Darvas-Größe und Intrabar-Annahme.** Die Referenz ist ein festes Gewicht von 10 % und pessimistisch, beides deklariert. Zu entscheiden ist, ob die Referenz so bleibt oder ob nur die Spannweite der Varianten berichtet werden soll.

Alles andere ist ohne Ihre Entscheidung abgeschlossen. Keine Variante ist aktiviert, und keine wurde nach Ergebnis gewählt.
