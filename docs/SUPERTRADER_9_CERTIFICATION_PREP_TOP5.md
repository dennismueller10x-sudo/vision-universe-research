# Supertrader 9 – Zertifizierungsvorbereitung der fünf zuerst prüfbaren Methoden

Stand: 31.10.2026. Grundlage: die Zertifizierungsmatrix `docs/SUPERTRADER_9_CERTIFICATION_READINESS.md` (PR #1148, Stand 30.10.2026). Reihenfolge nach der Matrix: **C02 Turtle S2, C01 Turtle S1, C08 Kullamägi Breakout, C12 Buyable Gap-Up, C03 Darvas**.

**Was diese Arbeit ist**
- Methodische Vorbereitung: Blocker auflisten, nach Lösungsweg klassifizieren, abbauen, was ohne Security-Master-Wechsel und ohne private Daten geht, und die übrigen Prüfungen mit Abnahmekriterien vorregistrieren.
- Keine Zertifizierung. Keine Methode ist aufgewertet.

**Was sie nicht ist**
- Keine Regel und kein Parameter der 13 Methoden ist geändert.
- Kein Code unter `methods/`, `research/`, `product/` oder `contracts/` ist geändert. Die Fingerabdrücke von SF6-PAPER-2027 (`89fbcf86…`, `c834b227…`, `0a1260e9…`) bleiben gültig.
- Keine Optimierung, kein Workflow, keine generierten Daten.
- `VALIDATED_TRADE_SIGNAL` bleibt für alle 13 gesperrt.
- Kein Security Master, kein Quant-Pfad.

**Neue Dateien**

| Datei | Inhalt |
|---|---|
| `scripts/supertrader/source-faithful/certification/CERT-PREP-TOP5-PLAN.json` | maschinenlesbarer, vorregistrierter Prüfplan: Blocker mit Klasse und Fundstelle, Parameter-Quellenabgleich, Datenanforderungen, Ausführungsannahmen, Studien mit Abnahmekriterien, Befunde |
| `scripts/supertrader/source-faithful/certification/cert-prep-top5.mjs` | Plan-Prüfung und reproduzierbares Prüfprotokoll (`--out <dir>`, optional `--run-tests`) |
| `scripts/supertrader/tests/sf-cert-prep-top5.test.mjs` | 23 Regeltreue-Tests mit synthetischen Balken (`CP-*`) und 5 Plan-Tests (`CP-PLAN-*`) |

**Prüfprotokoll erzeugen**

```bash
node scripts/supertrader/source-faithful/certification/cert-prep-top5.mjs --out /tmp/cert-prep             # Plan gegen Code und Quellen
node scripts/supertrader/source-faithful/certification/cert-prep-top5.mjs --run-tests --out /tmp/cert-prep # zusätzlich die gelisteten Tests (TAP)
```

- Das Protokoll hat keinen Zeitstempel und ist deterministisch.
- Ohne `--out` geht es nur auf stdout und wird nie in ein committetes Artefakt geschrieben.
- Lokaler Lauf am 31.10.2026: Plan gültig, 0 Abweichungen.
- Geprüft wurden 52 Vertragsregeln mit Status, 37 Parameter gegen Code und #709-Wortlaut, 82 #709-Belege (alle `original_wording_checked`) und 80 Testverweise.
- Mit `--run-tests`: C02 17/17, C01 13/13, C08 15/15, C12 14/14, C03 16/16 PASS. Damit ist die Abnahme `PS-*-CONFORMANCE` erfüllt.

---

## 0. Klassen und Regeln

| Klasse | Bedeutung |
|---|---|
| **a** | lösbar ohne Security-Master-Wechsel und ohne private Daten (Code, Tests, Doku in der Supertrader-Welt) |
| **b** | braucht den neuen Security Master (#1143 / #1163, andere Sitzung, hier nicht angefasst) |
| **c** | braucht private V13- oder Delisting-Daten |
| **d** | braucht eine Owner- oder Quellenentscheidung; dazu zählen auch Lizenzdaten, die Aktivierung von SF6-PAPER-2027 und der Zeitablauf |

**Regeln für die Abnahmekriterien**
- Jedes Kriterium trägt einen `metricKind` aus INTEGRITY, COUNT, SOURCE, DATA_COVERAGE, DISTRIBUTION_REPORT_ONLY oder DECISION_RECORD.
- PERFORMANCE ist verboten. Die Plan-Prüfung weist zusätzlich jede Formulierung wie „Sharpe ≥ …“ oder „Rendite > …“ zurück (Test `CP-PLAN-DETECTS`).
- Der Plan ist über seinen sha256 gepinnt (`CP-PLAN-PREREGISTERED`). Eine Änderung braucht einen eigenen, begründeten Commit.
- Ein Kriterium wird nie nach einem Ergebnis angepasst.
- Entscheidungen der Klasse d werden datiert, **bevor** eine versiegelte Kennzahl geöffnet wird.

## 1. Querschnittsblocker (alle fünf)

| ID | Kriterium | Klasse | Inhalt | schließt |
|---|---|---|---|---|
| X-CC5 | CC-5 | d | 83 referenzexponierte DQ-K5-Sitzungen sind ungeklärt; EDGAR und Tiingo bestätigen keine; CC5-e konstruktionsbedingt, CC5-f nicht gerechnet (Matrix §0.4) | lizenzierte CA-Quelle (E7-1), Daten-PR, Snapshot-Generation 3 |
| X-CC8 | CC-8 | d | SF6-PAPER-2027 nicht aktiv, Aufbewahrung offen (Matrix §0.6) | Owner-Aktivierung vor dem 01.01.2027 und 250 Sitzungen |
| X-SURV | Daten | c (+d) | Delistings vor 2009 fehlen, keine Delisting-Renditen; V13 nur privat (Matrix §0.5) | Snapshot-Generation mit V13-Reihen |
| X-PIT-MASTER | Daten | b | Produkt-Stammdaten nicht zeitpunktgenau (Querschnitt 4) | neuer Security Master |
| X-LEDGER | CC-1 | a | `source-ledger.json` ohne Morales/Kacher-Quellen (Matrix §0.8) | eigener PR; berührt den Legacy-Build, deshalb nicht hier |

## 2. Methoden: Blocker vorher → nachher

Status nachher:
- **DONE**: in dieser Arbeit abgebaut.
- **PREPARED_***: Verfahren und Abnahme vorregistriert; die Entscheidung bzw. der Lauf steht aus.
- **OPEN**: unverändert offen, der Weg ist benannt.
- **OPEN_SEPARATE_PR**: Klasse a, gehört aber in einen eigenen PR, weil er Produktausgabe, Vertragsfingerabdruck oder den Legacy-Build ändert.

### C02 Turtle S2 (Priorität 1)

CC erfüllt: 1, 2, 3, 6, 7. Offen: 4, 5, 8.

| Blocker | Fundstelle | Klasse | vorher | nachher |
|---|---|---|---|---|
| C02-CC4 PIT-Korrelationsgruppen (`TUR-SF-LIMIT-CORR` DATA_BLOCKED) | Matrix C02, Querschnitt 5 | d | offen | offen; Studie PS-C02-CC4-GROUPS mit Abnahme vorregistriert |
| C02-CC5 14 K5 / 38 K3 ungeklärt | Matrix C02 Corporate Actions | d | offen | offen (X-CC5); Abnahme PS-C02-CC5: 0 ungeklärte K5, alle K3 klassifiziert |
| C02-CC8 Paper nicht aktiv | Matrix C02 OOS | d | offen | offen (X-CC8) |
| C02-SAMPLE etwa 52 Trades/Jahr | Matrix C02 statistische Grenze | d (+a) | offen | Zählung vorregistriert. Eine Mindestzahl würde SF6-PAPER-2027 ändern und ist deshalb eine Owner-Frage **vor** dem 01.01.2027 |
| C02-SURV Survivorship | Matrix C01/C02 | c | offen | offen (X-SURV) |
| C02-PRODUCT-PLAN `TURTLE_ENTRY_IS_INTRADAY_ON_ASOF_NOT_MODELLED_FOR_NEXT_SESSION` | `product/detectors.mjs` | a | offen | OPEN_SEPARATE_PR: Der ruhende Buy-Stop der nächsten Sitzung ist aus den Balken bis zum Stichtag bekannt. Die Modellierung ändert aber die Produktausgabe |
| C02-RULE-CONFORMANCE Grenzfälle ungetestet | Abgleich mit TUR-S2ENT / -S2EX / -STOP | a | offen | **DONE**: CP-TUR-S2-WINDOW-55, -TRIGGER-ONE-TICK, -NO-SKIP-NO-FAILSAFE, -EXIT-WINDOW-20, CP-TUR-STOP-2N-PRIOR-CLOSE-N, CP-TUR-COSTS-REFERENCE |

**Abgleich Code ↔ W-TUR**
- Alle 16 Zahlen sind über den #709-Paraphrasetext gegen `PARAMS` geprüft: 55/20 Tage, N mit /20, 2 N, 0,5 N, 4/6/10/12 Units, 1 %, 10 %/20 %.
- Zwei davon sind als Konvention gekennzeichnet: ein Tick = 0,01 roh, Rang über 63 Sitzungen.
- Keine Abweichung gefunden.

### C01 Turtle S1 (Priorität 2)

CC erfüllt: 2, 3, 6, 7. Offen: 1, 4, 5, 8.

| Blocker | Fundstelle | Klasse | vorher | nachher |
|---|---|---|---|---|
| C01-CC1 zwei SOURCE_AMBIGUOUS-Regeln (`TUR-SF-S1-OPEN-BREAKOUT`, `TUR-SF-FAILSAFE-EXIT`) | Matrix C01 | d (+a) | offen | PREPARED_DECISION_PROCEDURE: Owner entscheidet mit der W-TUR-Stelle (gedruckt S. 19), datiert vor jedem Öffnen der Kennzahlen; beide Lesarten bleiben gerechnet (PS-C01-READINGS) |
| C01-CC4 | wie C02 | d | offen | offen |
| C01-CC5 16 K5 / 40 K3 ungeklärt, Stabilität 16 % | Matrix C01 | d | offen | offen; Stabilität nur als Verteilung berichtet (PS-C01-STABILITY) |
| C01-CC8 | Matrix C01 | d | offen | offen |
| C01-SURV | Matrix C01 | c | offen | offen |
| C01-PRODUCT-PLAN | `product/detectors.mjs` | a | offen | OPEN_SEPARATE_PR |
| C01-RULE-CONFORMANCE 20/10/55 an der Grenze | Abgleich TUR-S1ENT / -S1EX / -FAILSAFE | a | offen | **DONE**: CP-TUR-S1-WINDOWS; dazu zählt CP-TUR-STOP-2N-PRIOR-CLOSE-N |

**Abgleich:** 6 S1-Zahlen geprüft (20, 10, 55, 2 N, 10-Tage-Filterausstieg, 20-Tage-Filterausbruch). Keine Abweichung.

### C08 Kullamägi Breakout (Priorität 3)

CC erfüllt: 1, 2, 4, 6, 7. Offen: 3, 5, 8.

| Blocker | Fundstelle | Klasse | vorher | nachher |
|---|---|---|---|---|
| C08-CC3 7 Ermessensfragen, das Setup ist Modellkonvention | Matrix C08 | d (+a) | offen | OPEN_PROXY_PINNED: Die Proxy-Grenzen sind jetzt mit Tests festgeschrieben, die Owner-Frage ist vorregistriert (PS-C08-SETUP-PROXY) |
| C08-CC5 27 K5 / 94 K3 ungeklärt | Matrix C08 | d | offen | offen |
| C08-CC8 | Matrix C08 | d | offen | offen |
| C08-XS-SURV Querschnittsmomentum survivorship-sensitiv | Matrix C08 Daten | c | offen | offen; Zählung der Querschnittsgröße vorregistriert (PS-C08-XS-COVERAGE, braucht einen Snapshot-Lauf, hier nicht ausgelöst) |
| C08-MOMENTUM-SPLIT Referenz ohne Momentum-Auswahl, Produkt mit P98-Interpretation (O-6) | `research/kk-breakout-lifecycle.mjs`, `product/detectors.mjs` | d | nicht in der Matrix | **neu dokumentiert**; die Owner-Frage ist, welche Auswahl die Zertifizierungsreferenz ist |
| C08-COSTS −44 % Trades bei COST-50 | Matrix C08 | a | offen | PREPARED_REPORT_ONLY: alle vier Stufen berichtet, keine wird nachträglich gewählt |
| C08-RULE-CONFORMANCE | Abgleich KK-006..009, KK-012 | a | offen | **DONE**: CP-KK-SETUP-PRIOR-MOVE-BOUND, -SETUP-LEVEL, -SETUP-MA-RISING, -STOP-ADR-BOUNDARY, -NEXT-OPEN-PLANNED-LOSS, -STOP-MARKET-AND-CAP |
| C08-ORH ORH-Einstieg DATA_BLOCKED | `contracts/kullamagi.mjs` | d | offen, nicht essenziell | unverändert |

**Abgleich Code ↔ W-KK3 / W-KKFAQ**
- Geprüft sind ADR20 und die 30-%-Grenze (Quellenzahlen).
- Dazu sechs Proxy-Grenzen aus gedruckten Spannen, gekennzeichnet als `MODEL_BOUND_FROM_SOURCE_RANGE`: 30 %, 63 Sitzungen, 10 Sitzungen, 3 Tage, MA10, 0,5 % Risiko.
- Keine Abweichung. Befund F-KK-ADR-DENOMINATOR siehe §3.

### C12 Buyable Gap-Up (Priorität 4)

CC erfüllt: 2, 4, 6, 7. Offen: 1, 3, 5, 8.

| Blocker | Fundstelle | Klasse | vorher | nachher |
|---|---|---|---|---|
| C12-CC1-VOLWINDOW (50 Sitzungen als Owner-Konvention) | Matrix C12 | d | offen | offen. Eine neue Fenstervariante bräuchte eine Registry-Änderung, und `sf5VariantRegistrySha256` ist in SF6-PAPER-2027 gepinnt; deshalb ist hier bewusst keine angelegt |
| C12-CC1-VIOLATION (MOKA-C2) | Matrix C12 | d | offen | offen; Zählung je Lesart vorregistriert (PS-C12-READINGS) |
| C12-CC3 8 Ermessensfragen | Matrix C12 | d | offen | offen |
| C12-CC5 14 K5 / 68 K3 ungeklärt; Gaps liegen nahe an Splits | Matrix C12 | d | offen | offen; Zählung der Signale auf DQ-markierten Sitzungen vorregistriert (PS-C12-CA-PROXIMITY, Snapshot-Lauf nicht ausgelöst) |
| C12-CC8 | Matrix C12 | d | offen | offen |
| C12-MEGACAP PIT-Marktkapitalisierung | Matrix C12 Daten | b (+d) | offen | offen |
| C12-LEDGER kein Ledger-Eintrag | Matrix C12 Quellen | a | offen | OPEN_SEPARATE_PR (X-LEDGER) |
| C12-RULE-CONFORMANCE | Abgleich MOKA12-004 / MOKA24-VOL | a | offen | **DONE**: CP-BGU-GAP-EXACT, -GAP-MEASURE, -ATR-SIMPLE-MEAN, -VOLUME-WINDOW-50, -STOP-AT-GAP-DAY-LOW |

**Abgleich Code ↔ W-MOKA12 / W-MOKAV24**
- Geprüft sind 0,75 × ATR40, 150 % und 7 Wochen; das 50-Sitzungen-Fenster ist als `OWNER_CONVENTION` geführt.
- Die Messgröße (Eröffnung minus Vortagesschluss, einfache ATR ohne Gap-Tag) ist als Ableitung des Vertrags (`MOKA-SF-BGU-GAP-MEASURE`) jetzt an der Grenze getestet.
- Keine Abweichung.

### C03 Darvas (Priorität 5)

CC erfüllt: 2, 4, 6, 7. Offen: 1, 3, 5, 8.

| Blocker | Fundstelle | Klasse | vorher | nachher |
|---|---|---|---|---|
| C03-CC1 Bodensuch-Beginn SOURCE_AMBIGUOUS, Ledger DISPUTED | Matrix C03 | d | offen | offen; Entscheidungsverfahren vorregistriert (PS-C03-BOTTOM-START) |
| C03-CC3 8 Ermessensfragen, von der Quelle verlangt | Matrix C03 | d | offen | OPEN_STRUCTURAL; die Messklasse bleibt MECHANICAL_COMPONENT_STUDY |
| C03-CC5 15 K5 / 30 K3 | Matrix C03 | d | offen | offen |
| C03-CC8 | Matrix C03 | d | offen | offen |
| C03-ATH Allzeithoch nur in verfügbarer Historie, im Produkt gesperrt (O-7) | Matrix C03 Daten | b (+d) | offen | offen; Abdeckungszählung vorregistriert (PS-C03-ATH-COVERAGE) |
| C03-COSTS −62 % Trades bei COST-50 | Matrix C03 | a | offen | PREPARED_REPORT_ONLY |
| C03-ENTRY-BAR SF7-D1 nur als Variante | Matrix C03 | a | offen | PREPARED_REPORT_ONLY: Die Referenz bleibt pessimistisch, die Spannweite wird berichtet |
| C03-RULE-CONFORMANCE | Abgleich DAR-Q1, DAR-Q5..Q7 | a | offen | **DONE**: CP-DAR-STOP-NEVER-INSIDE-NEW-BOX, -THREE-DAYS-CONSECUTIVE, -SAME-BAR-BREAKOUT-AND-FAIL |

**Abgleich:** Geprüft sind die drei Tage (DAR-Q1, Quellenzahl). „Ein Bruchteil“ = ein Roh-Cent ist als Konvention gekennzeichnet. Befunde F-DAR-* siehe §3.

### Zusammenfassung vorher → nachher

| Methode | Blocker gesamt | a | b | c | d | davon in dieser Arbeit DONE | vorbereitet (PREPARED_*) |
|---|---|---|---|---|---|---|---|
| C02 | 7 | 2 | 0 | 1 | 4 | 1 | 1 |
| C01 | 7 | 2 | 0 | 1 | 4 | 1 | 1 |
| C08 | 8 | 2 | 0 | 1 | 5 | 1 | 1 (+ C08-CC3 Proxy festgeschrieben) |
| C12 | 8 | 2 | 1 | 0 | 5 | 1 | 0 |
| C03 | 8 | 3 | 1 | 0 | 4 | 1 | 2 |

**Einordnung**
- Die offenen CC-Blocker der fünf Methoden sind ausnahmslos b, c oder d.
- In Klasse a bleiben zwei Punkte für eigene PRs: den Produktplan für Turtle und die Ledger-Einträge.
- Kein CC-Kriterium ist durch diese Arbeit erfüllt. Abgebaut sind Prüf- und Belegschulden, die vor einer Zertifizierung ohnehin fällig wären.

## 3. Befunde (keine Fachmodelländerung)

Ein Implementierungsfehler gegenüber den zitierten Quellen wurde **nicht** gefunden. Alle 23 neuen Grenzfalltests liefen gegen den unveränderten Code grün. Deshalb gibt es keinen getrennten Draft-PR für eine Fachmodelländerung.

Festgehalten sind vier Dokumentationsbefunde (`findings` im Plan, alle `modelChange: false`):

| ID | Methode | Art | Befund | Vorschlag |
|---|---|---|---|---|
| F-TUR-ADD-UNIT-N | C01, C02 | Dokulücke | Ein Add wird mit N der Vorsitzung des Add-Balkens dimensioniert; Abstand und Stops nutzen das Einstiegs-N. `TUR-SF-ADD` nennt nur Abstand und Stops. Das widerspricht W-TUR nicht. | Ableitungstext im Vertrag ergänzen. Das ändert den Vertragsfingerabdruck, daher eigener PR |
| F-KK-ADR-DENOMINATOR | C08 | Dokulücke | ADR20 misst relativ zum Tief (KK-031), der Stopabstand relativ zum Einstieg. KK-012 nennt keinen Nenner. | als Ableitung benennen, keine Änderung ohne Owner |
| F-DAR-SAME-BAR-ORDER | C03 | Dokulücke | Ein Balken über dem Trigger und unter dem Boden gilt als Ausbruch und wird am Einstiegsbalken pessimistisch ausgestoppt. Test `CP-DAR-SAME-BAR-BREAKOUT-AND-FAIL` hält das fest. | in MA-DAR-INTRABAR-ORDER nennen |
| F-DAR-Q7-READING | C03 | Lesart | „Stop nie in der Box“ (DAR-Q7) wird als „nicht in der neuen Box“ gelesen; der Initialstop liegt in der Spanne der alten Box (folgt DAR-Q5). | als Lesart dokumentieren, für CC-1 dem Owner vorlegen |

## 4. Datenanforderungen je Methode

Maschinenlesbar steht das im Plan, Feld `dataRequirements`. Kurzfassung:

| Methode | aus dem Snapshot | fehlt (Klasse) |
|---|---|---|
| C02/C01 | Tages-OHLC ≥ 76 Balken, Rohschluss, Dividenden | Listing-Enden vollständig (c), CA-Faktoren (d), PIT-Korrelationsgruppen (d) |
| C08 | Tages-OHLC ≥ 127 Balken | Querschnitt inklusive inaktiver Listings (c), CA-Faktoren (d), konsolidierte Minuten für ORH (d, nicht essenziell) |
| C12 | Tages-OHLCV ≥ 52 Balken | CA-Faktoren (d; bei Gaps zwingend), PIT-Marktkapitalisierung (b), Intraday-Volumen (d, nicht modelliert) |
| C03 | Tages-OHLC split-adjustiert, Prüfdaten DAR-Q12 | Tageshochs ab Listing-Beginn und Listing-Beginn (b), CA-Faktoren (d) |

## 5. Ausführungsannahmen (explizit, keine Quellenregel außer wo genannt)

**Gemeinsam**
- Kosten: 10 bps Slippage je Seite und 1 bp Kommission; Stufen 0/10/20/50 (+0/1/2/5).
- Plattformgrenzen: 25 % Gewicht, 20 Positionen, nur Kasse (`CP-EXEC-COSTS-AND-POLICY`).
- Buy-Stop: Gap füllt zur Eröffnung, sonst am Niveau (`CP-EXEC-BUY-STOP-FILL`).

**Je Methode**

| Methode | Einstieg | Stop / Ausstieg | Intrabar |
|---|---|---|---|
| C02/C01 | ruhender Buy-Stop aus den Vorsitzungskanälen, `max(Eröffnung, Trigger)` auf demselben Balken (TUR-INTRADAY, TUR-GAP, Quelle) | 2 N der Vorsitzung je Unit; Unit-Stop und Kanal füllen `min(Eröffnung, Niveau)` | pessimistisch, `OPTIMISTIC_CERTAIN_RULE` als Szenario |
| C08 | nächste Eröffnung nach dem Ausbruchsschluss; nicht ausgeführt bei `1 − Stop/Eröffnung > ADR20` oder Eröffnung ≤ Stop | Stop-Market am Ausbruchstag-Tief (KK-027, Quelle); 1/3 nach dem 3. Schluss, Rest Break-even, MA10 | pessimistisch |
| C12 | nächste Eröffnung nach dem Signalschluss | Stop-Market am Gap-Tagestief, ganze Position; Verletzung strikt unter dem Tief (LATER_DAYS) | pessimistisch |
| C03 | Buy-Stop für die nächste Sitzung, Deckel + Bruchteil | Stop einen Bruchteil unter dem Deckel, Anhebung ab der nächsten Sitzung; Gap zur Eröffnung | pessimistisch, optimistische Variante vorregistriert |

## 6. Prüfplan bis zur Zertifizierung (vorregistriert, ohne Renditeziele)

| Studie | Methode | Klasse | Stand | Abnahme (metricKind) |
|---|---|---|---|---|
| PS-C02/C01/C08/C12/C03-CONFORMANCE | alle | a | READY, lokal erfüllt | alle gelisteten Tests PASS, 0 FAIL, 0 übersprungen (INTEGRITY) |
| PS-C02-CC4-GROUPS | C02 (C01 analog) | d | BLOCKED_OWNER | `ENFORCED_WITH_CALLER_GROUPS`, Referenz ohne Gruppen hashgleich (INTEGRITY); Ablehnungen vorher/nachher (COUNT) |
| PS-C02-CC5 | C02 (alle analog über X-CC5) | d | BLOCKED_OWNER | 0 ungeklärte K5, alle K3 klassifiziert (DATA_COVERAGE) |
| PS-C02-SAMPLE-COUNT | C02 | a | PREPARED | Anzahl Positionen im Paper-Fenster (COUNT), keine Mindestzahl ohne Owner |
| PS-C02-CC8 | C02 (alle analog) | d | BLOCKED_OWNER | vier Integritätsprüfungen von SF6-PAPER-2027, ≥ 250 Sitzungen, Code-Fingerabdruck unverändert (INTEGRITY) |
| PS-C01-READINGS | C01 | d | BLOCKED_OWNER | Entscheidung mit W-TUR-Stelle vor jedem Öffnen der Kennzahlen (DECISION_RECORD); Trades je Lesart (COUNT) |
| PS-C01-STABILITY | C01 | a | READY | Anteil unveränderter Trades, nur Verteilung (DISTRIBUTION_REPORT_ONLY) |
| PS-C08-COSTS, PS-C03-COSTS | C08, C03 | a | READY | Trades je Kostenstufe (COUNT) |
| PS-C08-XS-COVERAGE | C08 | a | PLANNED_NEEDS_SNAPSHOT_RUN | Querschnittsgröße je Datum, Anteil inaktiver Listings (DATA_COVERAGE) |
| PS-C08-SETUP-PROXY | C08 | d | BLOCKED_OWNER | Entscheidung datiert (DECISION_RECORD); Trades je Proxy-Variante (COUNT) |
| PS-C12-CA-PROXIMITY | C12 | a | PLANNED_NEEDS_SNAPSHOT_RUN | Anzahl und Anteil der Signale auf DQ-markierten Sitzungen; nichts wird entfernt (COUNT) |
| PS-C12-READINGS | C12 | d | BLOCKED_OWNER | Quellenstelle oder Entscheidung (SOURCE); Trades je Verletzungslesart (COUNT) |
| PS-C03-ENTRY-BAR | C03 | a | READY | Stops am Einstiegstag je Lesart (COUNT) |
| PS-C03-ATH-COVERAGE | C03 | b | BLOCKED_SECURITY_MASTER | Anteil verifizierter Allzeithochs (DATA_COVERAGE) |
| PS-C03-BOTTOM-START | C03 | d | BLOCKED_OWNER | Entscheidung mit B06-Stelle (DECISION_RECORD); Trades je Lesart (COUNT) |

Die beiden Studien `PLANNED_NEEDS_SNAPSHOT_RUN` brauchen den eingefrorenen DEV-Snapshot und damit einen Workflow-Lauf. Sie sind vorregistriert, aber bewusst nicht ausgelöst.

## 7. Owner-Fragen aus dieser Vorbereitung (gebündelt)

1. **C01:** Referenzlesart von `TUR-SF-S1-OPEN-BREAKOUT` und `TUR-SF-FAILSAFE-EXIT`, oder die Feststellung „nicht essenziell“ (vor dem Öffnen der Kennzahlen).
2. **C01/C02:** Quelle für PIT-Korrelationsgruppen (E7-5 A mit E4-Revision oder B).
3. **C02:** Soll SF6-PAPER-2027 vor dem 01.01.2027 eine Mindestzahl oder ein längeres Fenster bekommen? Danach ist eine Änderung verboten.
4. **C08:** Ist die Zertifizierungsreferenz die Forschungsauswahl ohne Momentum oder die Produktauswahl mit P98 (O-6)?
5. **C08:** Ist der Setup-Proxy CONSOLIDATION_10 für CC-3 tragfähig?
6. **C12:** Volumenfenster und Verletzungslesart, mit Quellenstelle oder als Entscheidung.
7. **C03:** Bodensuch-Beginn und die Lesart von DAR-Q7.
8. **Alle:** CA-Quelle (E7-1) und die Aktivierung von SF6-PAPER-2027.

## 8. Tests

```bash
node --test scripts/supertrader/tests/sf-cert-prep-top5.test.mjs   # 28 Tests (23 CP-Regeltreue, 5 CP-PLAN)
node --test "scripts/supertrader/tests/*.test.mjs"
node --test "core/tests/*.test.mjs"
node scripts/supertrader/guard-protected-paths.mjs
node scripts/quality/check-test-isolation.mjs
```
