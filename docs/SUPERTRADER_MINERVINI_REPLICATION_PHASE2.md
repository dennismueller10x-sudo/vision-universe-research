# Supertrader Phase 2A – Minervini Canonical Replication Engine

Stand: 6. Oktober 2026. Baut auf R14, R15 und Migration Phase 1 auf (alle auf `main`).

**Ablageort.** Der Auftrag nennt `docs/MINERVINI_REPLICATION_PHASE2.md`. Diesen Pfad lehnt Supertrader Gate A ab: Erlaubt ist nur `docs/SUPERTRADER_*.md`. Gates werden nicht abgeschwächt, deshalb liegt der Bericht hier.

**Was Phase 2A ist:** eine neue, reine Forschungs-Engine mit eigener ID (`MINERVINI_CANONICAL` 1.0.0). Jeder strategiebestimmende Wert hat eine Rule-ID und eine Herkunftsklasse.

**Was Phase 2A nicht ist:**
- kein Live-Release;
- keine Änderung an Minervini 2.0.0 (live) oder 3.0.0 (Forschung);
- keine Ledger-, Signal- oder Registry-Änderung;
- kein Performance-Tuning.

| Artefakt | Ort |
|---|---|
| Kanonisches Regelbuch (64 Regeln, einzige Quelle aller Parameter) | `scripts/supertrader/fidelity/MINERVINI-CANONICAL-REPLICATION.json` |
| Datenzuordnung Regel → Daten → point-in-time | `scripts/supertrader/fidelity/MINERVINI-DATA-MAPPING.json` |
| Source-to-Code-Kette je Regel (reproduzierbar) | `scripts/supertrader/fidelity/MINERVINI-SOURCE-TO-CODE.json` (`replication/minervini/artifacts.mjs`) |
| Fidelity Freeze | `scripts/supertrader/fidelity/MINERVINI-FIDELITY-FREEZE.json` (`replication/minervini/freeze.mjs`) |
| Engine | `scripts/supertrader/replication/minervini/` |
| Tests | `scripts/supertrader/tests/minervini-replication.test.mjs` |
| Messlauf (nach dem Freeze) | Workflow `supertrader-validation.yml`, Modi `mrepl-sec[-holdout]` und `mrepl-measure[-holdout\|-smoke]` |

---

## 1. Vorgehen und Rollen

| Schritt | Wer | Ergebnis |
|---|---|---|
| Bestandsaufnahme `main` | Lead | R14, R15, Phase 1, `canonical/minervini.*`, R15-Artefakte und Engine-Code gelesen; Basis 223/223 Tests grün |
| Worker A – Fundamentaldaten | Sonnet | Mapping aller SEC-Datensätze; 19 point-in-time-Fallstricke im Bestand (P1–P19) |
| Worker B – Technik/VCP | Sonnet | alle Konstanten von 2.0.0/3.0.0 mit Herkunft; tote Regel MIN-RISK-VU (deckungsgleich mit maxLastDepth) |
| Worker C – Portfolio/Risiko/Exit | Sonnet | 21 generische VU-Regeln (G1–G21), versteckte Defaults im gemeinsamen Code, Wiederverwendbarkeit |
| Worker D – Legacy | Sonnet | Engine-Schnittstelle, Freeze-Tests (M1-G), Isolationsregeln, Wiederverwendungsurteil je Komponente |
| Quellenbewertung, Regelbuch, Entscheidungen, Architektur | Lead | dieses Dokument und das Regelbuch |
| Code-Red-Team | Sonnet (adversarial) und Lead | Abschnitt 9 |
| Quellen-Red-Team, Freeze-Freigabe | Lead | Abschnitt 9 und 10 |

Die Worker haben nicht entschieden. Jede Regel hat die Kette SOURCE → INTERPRETATION → DATA → FORMALIZATION → CODE → TEST → FIDELITY durchlaufen. Sie steht maschinenlesbar in `MINERVINI-SOURCE-TO-CODE.json`.

## 2. Quellenlage

**Rangfolge:**
1. Primär (eigene Beiträge, Interviews)
2. Buch
3. Buchnotizen
4. Sekundär

**Bücher.**
- *Trade Like a Stock Market Wizard* (2013) und *Think & Trade Like a Champion* (2017) sind nicht im Volltext abgerufen.
- Buchinhalte stammen aus den in R10 abgerufenen Buchnotizen (whatheheckaboom 2014, tradershall 2019) und aus der Buchkenntnis des Lead.
- Sie sind ohne Seitenzahl. Belegstärke höchstens MEDIUM, außer sie sind primär gestützt.

**Neu belegt in Phase 2A.** Eigene Beiträge Minervinis auf X, Text über den Suchindex, weil `x.com` vom Egress-Proxy gesperrt ist:
- **Risiko je Trade:** im Schnitt 1,25 %, höchstens 2,5 % (2018-04-24, 2021-04-16). R15 hatte das als „nicht im Abruf“ eingestuft.
- **„Sell half“:** bei ordentlichem Gewinn und Unsicherheit die Hälfte verkaufen (2019-07-11, 2021-04-03).
- **Teilpositionen und Positionszahl:** Teilpositionen (1/2, 1/4), „8, 12 oder mehr“ Positionen, progressiv exponieren (2020-10-20).
- **Quartalszahlen:** nur mit Gewinnpolster halten; ohne Polster die Größe für 10–15 % Rückgang wählen (2017-10-25). R15 hatte das als UNRESOLVED geführt.
- **Zeitstopp:** Eine seitwärts laufende Aktie kostet Zeit oder Geld (2021-01-17). Das ist ohne Zahl, also gibt es keinen Zeitstopp.
- **50-Tage-Linie:** Einzelfall „Verkauf beim ersten Schluss unter der 50-Tage-Linie“ (2022-07-18). Das ist ein Einzelfall, keine allgemeine Regel.

**Keine Blogs als Grundlage.** Sekundäre Web-Zusammenfassungen dienen nur als Hinweis auf Widersprüche (z. B. 45 vs. 65 Wochen Basisdauer).

**Urheberrecht.** Paraphrasen; Kurzzitate höchstens etwa 15 Wörter.

**Widersprüche und Entscheidungen**

| Punkt | Quellen | Entscheidung | Grund |
|---|---|---|---|
| 52W-Tief: 25 % oder 30 % | Notizen 2013: „at least 30%“; 25–30 % nur im Abschnitt Stufe 1→2 | 30 % | Template-Wortlaut |
| Basisdauer: 45 oder 65 Wochen | abgerufene Notizen: 3–45 Wochen; nicht abgerufene Web-Zusammenfassung: 3–65 | 45 Wochen | Belegstärke |
| EPS-Mindestwachstum | Notizen: Führer ≥ 20 %, Superperformer 30–40 %+; 3.0.0 nutzte 25 % | 20 % | untere Quellenzahl; 25 % entspricht eher der O'Neil-Konvention |
| Höchstgewicht 25 % oder 50 % | Notizen/Primär: 25 %; Sekundär: „nie über 50 %“ | 25 % | 50 % gilt mit Margin, Margin ist ausgeschlossen |
| Ausstieg unter SMA50 | ein primärer Einzelfall, sonst O'Neil-nah | nicht übernommen | keine allgemeine Fundstelle |

## 3. Die öffentlich rekonstruierbare Methode (SEPA)

1. **Trend Template.** Acht Kriterien (Kurs > SMA150/200, SMA150 > SMA200, SMA200 steigt ≥ 1 Monat, SMA50 > SMA150/200, Kurs > SMA50, ≥ 30 % über dem 52W-Tief, ≤ 25 % unter dem 52W-Hoch, RS ≥ 70).
2. **Fundamentaldaten.**
   - Gewinn-, Umsatz- und Margenwachstum mit Beschleunigung („Code 33“ als Ideal).
   - Überraschungen und Revisionen.
   - Institutionelle Nachfrage, Branchenführerschaft, Katalysator.
3. **VCP.**
   - 2–6 kleiner werdende Kontraktionen nach einem Stufe-2-Anstieg, Basis 3–45 Wochen.
   - Volumen trocknet aus, Enge im rechten Teil.
   - Pivot = Hoch der engsten Zone.
4. **Einstieg.**
   - Kauf im Moment des Pivot-Durchbruchs, mit Volumen.
   - Cheat-, Low-Cheat- und 3C-Einstiege; Power Play als Sonderfall.
5. **Risiko.**
   - Stop am technischen Punkt, nie über 10 %, Durchschnittsverlust deutlich kleiner.
   - Einstand ab 3R.
   - Gewinn sichern (Nachziehen ab 2–3R).
   - In die Stärke verkaufen, oft die Hälfte.
   - Zeitstopp; Ermessens- und Klimaxsignale.
6. **Größe und Portfolio.**
   - 1,25 % Risiko im Schnitt, höchstens 2,5 %.
   - Höchstens 25 % je Position; 4–6 bzw. 8–12 Titel.
   - Pilotkäufe und Aufstocken, progressive Exposure.
   - Margin sparsam; Markt Aktie für Aktie.

**Eindeutig (mechanisch):**
- Trend-Template-Kriterien 1–7.
- 2–6 Kontraktionen; Verlustgrenze 10 %; Einstand bei 3R.
- 1,25 % / 25 %; Positionszahl-Spanne.

**Diskretionär:**
- Enge („tight and light“), Cheat-Zonen, Pilot- und Zukaufpunkte.
- „Schwieriger Markt“, Klimax- und Verletzungssignale.
- Zeitpunkt des Teilverkaufs, Reihenfolge innerhalb eines Tages.
- Ermessensverkauf unter der 20-Tage-Linie.

## 4. Engine-Architektur

```
replication/minervini/
  params.mjs            Parameter NUR aus dem Regelbuch (Proxy: unbekannter Name / fehlende Herkunft -> Fehler)
  trend-template.mjs    MR-TT-01..08
  vcp.mjs               MR-VCP-01..08, MR-RSK-01  (Zerlegung in aufeinanderfolgende Extremwerte)
  sec-facts.mjs         SEC-Erstmeldungen inkl. Margen (MR-PIT-01)
  sepa.mjs              SEPA zum Stand des Ausführungstags; Split-Bereinigung über return-series.js (ADR-002)
  signal-engine.mjs     Setup am Schluss t -> Kauf-Stop-Order für t+1
  exit-policy.mjs       MinerviniReplicationExitPolicy
  portfolio-policy.mjs  MinerviniReplicationPortfolioPolicy
  portfolio-sim.mjs     eigene Portfolio-Simulation (kein gemeinsamer Simulator)
  engine.mjs            Identität, Fidelity je Bereich, Produktklasse (Hard Gate)
  metrics.mjs           Messgrößen
  freeze.mjs            Fidelity Freeze (Hashes)
  artifacts.mjs         Source-to-Code-Artefakt
  build-sec-facts.mjs   SEC-Speicher bauen (Workflow)
  measure.mjs           Messlauf (Workflow, nur nach Freeze)
```

**Nicht verwendet:**
- `engine/simulator.mjs`: 5-Sitzungen-Sperre, Schlussbestätigung, ein Signal blockiert den Titel.
- `validation/portfolio.mjs#runPortfolioTR`: Gleichtagsfinanzierung, alphabetischer Gleichstand, stille Defaults.
- `PORTFOLIO_DEFAULTS`.
- `engine/earnings.mjs`.
- Alle `minervini*.mjs`.

Ein Test bricht ab, falls die Engine einen davon importiert.

**Isolation:**
- `build.mjs` (LIVE_ENGINES) kennt die Engine nicht.
- Kein Ledger, keine Registry-Zeile.
- Phase-1-Freeze M1-G unverändert grün.

**Keine versteckten Defaults (Hard Gate).**
- Alle 40 strategiebestimmenden Parameter liegen im Regelbuch, je mit Rule-ID, Herkunft (ORIGINAL / ORIGINAL_INTERPRETATION / VU_FORMALIZATION / VU_OWN) und Begründung.
- `VU_OWN` ist nur in der Messrahmen-Schicht C erlaubt.
- `FOREIGN_RULE` und `UNRESOLVED` sind als Parameter verboten.
- Tests: MR-T-PARAMS-MISSING, MR-T-NO-HIDDEN-DEFAULTS, MR-T-PARAMS-USED. Sie scheitern bei:
  - fehlender Herkunft;
  - unbekanntem Namen;
  - numerischem `??`/`||`-Ersatzwert;
  - numerischem Default-Parameter;
  - verwaisten Parametern.

## 5. Regeln je Bereich (Kurzfassung; vollständig im Regelbuch)

### 5.1 Trend

| Regel | Formalisierung | Herkunft |
|---|---|---|
| MR-TT-01..07 | wie Template; SMA einfach, 52W = 252 Sitzungen Tageshoch/-tief | ORIGINAL (TT-03 Lesart: SMA200[t] > SMA200[t-21]) |
| MR-TT-08 | VU-RS-Perzentil (0,4·r63 + 0,2·r126 + 0,2·r189 + 0,2·r252) im point-in-time Querschnitt, ≥ 70, **an jedem Tag** | VU_FORMALIZATION (IBD NOT_PUBLIC) |

### 5.2 VCP und Einstieg (VU-Formalisierung einer diskretionären Regel)

**Zerlegung der Basis (MR-VCP-08).**
- H1 ist das höchste Hoch der letzten 225 Sitzungen (45 Wochen).
- L1 ist das tiefste Tief danach; H2 ist das höchste Hoch nach L1; und so weiter bis t.
- Daraus folgen streng tiefere Hochs und streng höhere Tiefs. „Jede Kontraktion kleiner“ (MR-VCP-03) ist damit durch die Konstruktion erfüllt.
- Ein späterer, tieferer Rücksetzer verschmilzt mit H1 zu einer Kontraktion.
- Es gibt keine Zickzack-Schwelle und kein erfundenes Fenster.

**Bedingungen:**
- Basisdauer 15–225 Sitzungen;
- 2–6 Kontraktionen;
- Volumen der letzten Kontraktion < SMA50-Volumen;
- Pivot = Hoch zu Beginn der letzten Kontraktion, Stop = ihr Tief;
- Stopabstand ≤ 10 %, sonst kein Setup.

**Einstieg:**
- Kauf-Stop am Pivot für den Folgetag.
- Füllung max(Eröffnung, Pivot), wenn das Tageshoch den Pivot überschreitet.
- Ausbruchsvolumen nur protokolliert, weil es zum Kaufzeitpunkt unbekannt ist.

**Kein Lebenszyklus:** kein Verfall, keine Sperre, kein ENTRY_READY. Das Setup wird an jedem Schluss neu bewertet.

**Wiedereinstieg:** nur mit einer Basis, die nach dem Ausstieg beginnt.

**Bekannte Grenze:** Kleine Tageswellen am rechten Rand können als zusätzliche Kontraktionen zählen. Dann greift die Obergrenze 6 strenger als das menschliche Auge.

### 5.3 SEPA (point-in-time)

**Gates:**
- EPS-Wachstum des jüngsten sichtbaren Quartals ≥ 20 % gegen das Vorjahresquartal.
- Beschleunigung gegen das direkt vorangehende Quartal.
- Umsatz desselben Quartals über Vorjahr.
- Fehlende oder nicht bewertbare Daten → kein Einstieg.

**Nur protokolliert:** Code 33, Umsatzbeschleunigung, Brutto-/operative/Nettomarge und deren Veränderung.

**Neu gegenüber 3.0.0 (Worker-A-Befunde behoben):**
- Split-Bereinigung des Vorjahres-EPS über `return-series.js#splitFactors`;
- Kontinuitätsprüfung des Vorquartals;
- Umsatz auf dasselbe Quartal abgeglichen;
- Frischeprüfung (180 Tage);
- Formularfilter;
- Accession, Formular und Einheit je Wert;
- Q4-EPS über einen Split verworfen;
- Margen neu.

**Sichtbarkeit:** Einreichungsdatum < Handelstag der Order. Je Periode zählt die Erstmeldung; spätere Änderungen wirken nicht zurück.

### 5.4 Risiko und Ausstieg (MinerviniReplicationExitPolicy)

| Regel | Umsetzung | Herkunft |
|---|---|---|
| MR-RSK-01/02 | Stop am Kontraktionstief; nach einem Gap höchstens 10 % unter dem Füllkurs | ORIGINAL / Lesart |
| MR-EXIT-02 | Hälfte bei Einstieg + 3R (Tageshoch), Gap zur Eröffnung | Hälfte ORIGINAL (primär); 3R VU-Formalisierung, an den Einstand gekoppelt |
| MR-EXIT-01 | ab 3R Stop ≥ Einstand (ab Folgetag) | ORIGINAL |
| MR-EXIT-03 | danach Stop ≥ Einstieg + 50 % des höchsten Schlussgewinns | Lesart „Großteil sichern“; 50 % = kleinste Lesart (VU-Formalisierung) |
| nicht umgesetzt | Zeitstopp (keine Zahl), 20-Tage-Linie, Klimax, Verletzungen (diskretionär), SMA50-Ausstieg (ungeklärt), gestaffelte Stops (optional), Quartalszahlen-Regel (Daten fehlen) | – |

### 5.5 Größe und Portfolio (MinerviniReplicationPortfolioPolicy)

| Regel | Umsetzung | Herkunft |
|---|---|---|
| MR-SIZ-01 | Stück = min(1,25 % Kapital / (Pivot − Stop), 25 % Kapital / Pivot), ganze echte Aktien | ORIGINAL (primär) |
| MR-PF-01 | höchstens 12 Positionen | Lesart „8–10, evtl. 12 / große Konten 10–12“ |
| MR-PF-02 | Exposure-Obergrenze 50 % zu Beginn und nach einem Verlust-Trade, 100 % nach einem Gewinn-Trade | VU-Formalisierung von „progressive exposure“ |
| MR-PF-06 | gleichzeitige Orders: VU-RS-Rangwert ↓, dann Stopabstand ↑; exakter Gleichstand nur ganz; nie alphabetisch | VU-Formalisierung von „in der Reihenfolge der Ausbrüche“ |
| MR-PF-07 | kein Indexfilter | Lesart „Aktie für Aktie“ |
| nicht umgesetzt | Pilot/Aufstocken je Titel, Margin, Short | – |

### 5.6 Messrahmen (VU_OWN, offen ausgewiesen, Schicht C)

- **Universum:** wie R14, Rohschluss ≥ 5 USD, Dollarumsatz20 ≥ 5 Mio. USD.
- **Kosten:** 10 bp Slippage und 1 bp Gebühr je Seite.
- **Reservierung vor dem Tag:** kein Zukunftswissen über ausgelöste Orders.
- **Keine Gleichtagsfinanzierung.**
- **Balkenreihenfolge:** Stop vor Ziel.
- **Startkapital:** 100.000 USD.
- **Dividenden:** gutgeschrieben.
- **Delisting:** zum letzten Schluss.

## 6. Daten

Vollständig in `MINERVINI-DATA-MAPPING.json`.

**Vorhanden und genutzt:**
- Tageskurse inklusive delisteter Titel;
- point-in-time-RS-Querschnitt;
- Quartals-EPS und Umsatz als Erstmeldung.

**Neu aus vorhandener Quelle:** Bruttogewinn (auch Umsatz − Kosten), operatives Ergebnis und Nettoergebnis als Erstmeldung, im Speicher `sec-pit-mrepl-1`. Er wird aus EDGAR companyfacts gebaut, mit der bestehenden CIK-Zuordnung.

**Fehlend (NOT REPRODUCIBLE WITH CURRENT DATA), ohne Proxy:**

| Daten | Offizielle kostenlose Quelle (dokumentiert, nicht eingeführt) |
|---|---|
| Konsensschätzungen | keine |
| Überraschungen | keine |
| Revisionen | keine |
| 13F-Sponsorship | SEC 13F-Datensätze |
| Branchengruppenrang zum damaligen Stand | SIC je Einreichung |
| Einmalposten | – |
| Ergebnistermine | 8-K Item 2.02 |
| Intraday-Volumen am Pivot | – |

## 7. Fidelity

**Methode:** Je Bereich gilt die niedrigste Fidelity der filternden Regeln. Fehlt eine Kernregel des Bereichs, wird um eine Stufe abgesenkt, aber nicht unter LOW. Berechnet in `engine.mjs`; ein Test prüft die Gleichheit mit dem Regelbuch.

| Bereich | 1.0.0 (Phase 2A) | Hauptgrund |
|---|---|---|
| Trend | MEDIUM | RS ist ein VU-Ersatz für IBD |
| Einstieg | LOW | VCP formalisiert; Enge, Cheat, Power Play und Volumenbestätigung fehlen |
| Fundamental | LOW | EPS/Umsatz point-in-time ok; Turnarounds ausgeschlossen; Überraschungen, Revisionen, 13F und Gruppen fehlen |
| Ausstieg | LOW | Einstand, Hälfte und Nachziehen umgesetzt; Zeitstopp (keine Zahl) und Klimax fehlen |
| Größe | MEDIUM | 1,25 %/25 % primär; Pilot und Aufstocken fehlen |
| Portfolio | LOW | progressive Exposure formalisiert; Margin fehlt |
| Marktumfeld | MEDIUM | kein Indexfilter (quellentreu); Minervinis Risikomodell nicht öffentlich |
| Risiko | MEDIUM | Stopregeln quellentreu; Quartalszahlen-Regel ohne Daten |
| **Gesamt** | **LOW** (niedrigster Bereich) | |

**Vergleich mit 2.0.0.** R15 bewertete 2.0.0 mit einer milderen Methode (Einstieg MEDIUM, Ausstieg LOW, Größe MEDIUM, Portfolio MEDIUM, Fundamental LOW). Die strengere Phase-2A-Methode ist nicht direkt vergleichbar. Je Regel zeigt das Regelbuch den Unterschied:

| | 2.0.0 | 1.0.0 |
|---|---|---|
| Wirkende Fremdregeln | 1 (Volumen 1,4×) | 0 |
| Wirkende ungeklärte Regeln | 1 (SMA50-Ausstieg) | 0 |
| VU_OWN-Regeln | in Kernbereichen | nur im Messrahmen |
| SEPA | fehlt | point-in-time |
| Verkauf in die Stärke | fehlt | vorhanden |
| Sizing | 1,25 % (sekundär) | 1,25 % (primär) |

## 8. Produktklasse und Name (Ergebnis, nicht Vorgabe)

`engine.mjs#classify` wendet den R15-Hard-Gate an. Ein Replication-Claim ist nur erlaubt, wenn alle Kernbereiche und Fundamental HIGH sind und keine Fremdregel bzw. ungeklärte Regel wirkt.

**Ergebnis:**
- `replicationClaimAllowed: false`;
- Produktklasse `VU_ADAPTATION`;
- Name `minervini-adaptation-1.0.0`;
- Anzeige „VU Adaptation – Minervini Canonical (Research)“.

**Die Engine darf nicht „Minervini Replication“ heißen.** Sie ist die quellentreueste Minervini-Umsetzung im Repository, aber keine Replikation:
- sechs von acht Bereichen liegen unter HIGH;
- Überraschungen, Revisionen, Sponsorship und Gruppen fehlen;
- der VCP ist eine Formalisierung.

Auch „High-Fidelity Adaptation“ ist nicht gedeckt, weil die Gesamt-Fidelity LOW ist.

## 9. Red-Team-Review (Lead, vor dem Freeze)

Abschnitt 9 wird nach Abschluss des Reviews ergänzt.

## 10. Fidelity Freeze

Abschnitt 10 wird beim Freeze ergänzt.

## 11. Messung (nach dem Freeze)

Abschnitt 11 wird nach dem Messlauf ergänzt.

## 12. Abschlussbericht (28 Fragen des Auftrags)

Abschnitt 12 wird nach der Messung ergänzt.
