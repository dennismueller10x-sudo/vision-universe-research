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

## 9. Red-Team-Review (vor dem Freeze)

**Zu widerlegende Aussage:** „Diese Engine bildet die öffentlich rekonstruierbare Minervini-Methode so originalgetreu ab, wie es mit den verfügbaren Daten möglich ist.“

### 9.1 Code-Red-Team

Ein unabhängiger adversarialer Prüflauf mit eigenen Reproduktionsskripten fand 7 Befunde. Alle sind behoben und durch Regressionstests MR-T-RT-* gesichert.

| # | Befund | Schwere | Behebung |
|---|---|---|---|
| 1 | Stückelungseinheit invertiert (close/rawClose statt rawClose/close). Folge: spätere Splits falsch gestückelt, Titel mit späterem Reverse-Split fielen still heraus (Survivorship-artig) | hoch | Einheit korrigiert; Stückelung zusätzlich am Ausführungstag (MR-T-RT-UNIT) |
| 2 | Fehlende Split-Historie vor der Vorjahres-Einreichung wurde als Fundamentalurteil verbucht | mittel | Bewusst konservativ beibehalten (keine Annahme „kein Split“), jetzt als Datengrund MR-PIT-01 / `PIT_SPLIT_HISTORY_UNKNOWN` ausgewiesen. **Folge für die Messung:** In den ersten Monaten jedes Fensters gibt es kaum Setups (Kursvorlauf nur 1 Jahr). |
| 3 | Dividende auch bei Kauf am Ex-Tag gutgeschrieben | niedrig–mittel | nur ab dem Tag nach dem Einstieg (MR-T-RT-DIVIDEND-ENTRY-DAY) |
| 4 | Fehlende Eröffnung am Ausbruchstag brach den Lauf ab | niedrig, schwer | Füllung am Pivot (MR-T-RT-NAN-OPEN) |
| 5 | Währung einer SEC-Reihe: USD auch als kleine Minderheit bevorzugt | niedrig | häufigste Einheit, USD nur bei Gleichstand (MR-T-RT-UNIT-MAJORITY) |
| 6 | Periodenlängen der SEC-Extraktion als Konstanten außerhalb des Regelbuchs | Hard Gate | `pit.quarterDays`, `pit.yearDays` ins Regelbuch. Kalenderkonstanten (365,25 Tage), Gleitkomma-Toleranzen und die Messstückzahl der Signalmessung sind keine Strategiewerte und im Code kommentiert. |
| 7 | Delisting am Einstiegstag in der Signalmessung als „offen“ gebucht | niedrig | als Delisting gebucht (MR-T-RT-SIGNAL-DELIST) |
| – | Order nach einer Datenlücke Tage später ohne Neubewertung ausgeführt (Verdacht) | – | Order verfällt, wenn der nächste Balken nicht der nächste Kalendertag ist (MR-T-RT-ORDER-GAP) |

**Bestätigt korrekt durch den Prüflauf:**
- **Kausalität:** `scanSegment` auf voller gegen abgeschnittener Reihe, 0 Abweichungen.
- **Split-Richtung:** 2:1 und 1:10 korrekt.
- **Buchungsidentität:** 200 Zufallswelten, Endkapital = Start + Summe der Trade-Ergebnisse, Bargeld nie negativ.
- **Ausstiegslogik:** Stop vor Ziel, Gap-Behandlung, nur aufwärts nachgezogen.
- **SEC-Extraktion:** Q4-Ableitung, Erstmeldung vor Änderung, Bruttogewinn-Sichtbarkeit.

### 9.2 Quellen-Red-Team (Lead)

| Prüfpunkt | Ergebnis |
|---|---|
| Fremdregeln | Volumen ≥ 1,4× (O'Neil), Ausstieg unter SMA50 mit Volumen, Indexfilter, 5-Sitzungen-Sperre, alphabetische Auswahl, `PORTFOLIO_DEFAULTS`: alle entfernt. Test MR-T-NO-FOREIGN-RULES. Keine Regel mit FOREIGN_RULE oder UNRESOLVED wirkt. |
| CAN SLIM statt Minervini | Nicht übernommen: 25 % EPS (O'Neils C; 3.0.0 lag damit näher an O'Neil als an Minervini), jährliches EPS-Wachstum (A), institutionelle Sponsorship (I) als Ersatz, Marktrichtung (M) als Indexfilter, Ausbruchsvolumen 40–50 %. Die übernommenen Fundamentalregeln (20 %, Beschleunigung, Umsatz, Code 33, Margen) haben Minervini-Fundstellen. |
| Versteckte Defaults | Alle 40 strategiebestimmenden Werte im Regelbuch; Proxy wirft bei unbekanntem Namen; Tests auf `??`/`\|\|`-Zahlen und Default-Parameter. |
| Falsch interpretierte Quellen | 1,25 % jetzt primär belegt. „Sell half“ primär belegt; die 3R-Kopplung ist als VU-Formalisierung gekennzeichnet. Der SMA50-Einzelfall wurde nicht verallgemeinert. Zeitstopp ohne Zahl, also nicht umgesetzt. |
| Lookahead | Setup am Schluss t, Order für t+1. RS-Querschnitt am Tag t. Reservierung aus dem Vortagesstand; Verkaufserlöse erst ab d+1. Volumenbestätigung ist zum Kaufzeitpunkt unbekannt und wird deshalb nur protokolliert. |
| SEC-Timing | Einreichung < Handelstag. Erstmeldung je Periode. Abgeleitete Werte sichtbar ab der späteren Einreichung. Split-Bereinigung nach ADR-002. Frischeprüfung. Tests MR-T-PIT-*. |
| Sizing | 1,25 % / 25 % primär. Nach einem Gap kann das Risiko je Trade bis etwa 2,5 % steigen (Stop höchstens 10 % unter der Füllung bei höchstens 25 % Gewicht). Das liegt innerhalb von Minervinis Höchstwert. |
| Generische VU-Portfoliologik | eigener Simulator; Messrahmen offen als VU_OWN in Schicht C |
| Exit | nur Minervini-Gründe; Lücken (Zeitstopp, Klimax, 20-Tage-Linie) offen ausgewiesen |
| VCP-Parameter | Keine Zickzack-Schwelle. Basisdauer und Kontraktionszahl aus Quellen. Volumen < 1,0 × SMA50 nach Quellenbezug. Die Zerlegung ist als VU-Formalisierung markiert. |

**Ergebnis.** Die Aussage hält mit drei offen ausgewiesenen Einschränkungen:
1. Mehrere belegte Regeln sind mangels Daten oder Zahl nicht reproduzierbar (Abschnitt 6 und 7).
2. Der VCP und der Verkauf in die Stärke sind VU-Formalisierungen.
3. Die Fidelity reicht nicht für den Namen „Replication“ (Abschnitt 8).

Eine Fremdregel, ein versteckter Default oder ein Lookahead wurde nach den Korrekturen nicht gefunden. **Red Team bestanden → Freeze freigegeben.**

### 6.1 SEC-Speicher `sec-pit-mrepl-1` (Lauf 37457779561, DEV)

Gebaut am 06.10.2026, CIK-Zuordnung aus `sec-pit-r12`. Zählwerte aus öffentlichen SEC-Daten:

| Reihe | Listings |
|---|---|
| Listings gesamt | 6.384 |
| mit Datensatz | 6.383 |
| EPS | 6.368 |
| Umsatz | 5.971 |
| Bruttogewinn | 3.969 |
| operatives Ergebnis | 5.264 |
| Nettoergebnis | 6.374 |

Weitere Angaben:
- IFRS-Emittenten: 136.
- Abgeleitete Q4-EPS-Zeilen: 32.291. Sie werden über einen Split verworfen.
- Der Bruttogewinn deckt rund 62 % der Listings ab; die Margen bleiben deshalb ein reines Protokollmerkmal.

**HOLDOUT** (Lauf 37459790385, CIK aus `sec-pit-r12` des Holdout-Namensraums):

| Reihe | Listings |
|---|---|
| Listings | 3.896 |
| EPS | 3.891 |
| Umsatz | 3.784 |
| Bruttogewinn | 2.620 |
| operatives Ergebnis | 3.173 |
| Nettoergebnis | 3.888 |

Weitere Angaben: IFRS-Emittenten 41; abgeleitete Q4-EPS-Zeilen 20.935.

## 10. Fidelity Freeze

Erst nach bestandenem Red-Team-Review. Datei `scripts/supertrader/fidelity/MINERVINI-FIDELITY-FREEZE.json`.

| Feld | Wert |
|---|---|
| Status | FROZEN (06.10.2026) |
| Commit | `b365b66e5` (Engine-Code und Regelbuch) |
| Regelbuch-Hash (sha256) | `58de73f048968e7b604e716420a28c48f33c4bccc75c3d00efbda168c71055d5` |
| Code-Hash (sha256 über alle Engine-Dateien) | `f20a12a7a26750daf6dd08732ccaab0dcb7f7bdd5eff6955d03e8f7398acbdcb` |
| Engine | `MINERVINI_CANONICAL` 1.0.0, Regelbuch `minervini-canonical-replication-1.0.0` |
| Datenschema | SEC `vu-sec-pit-mrepl-1.0.0` (Zeile: Periodenende, Wert, Einreichung, Accession, Formular, abgeleitet, Tag, Komponenten-Einreichung); Kurse wie R14; RS `VU-RS-PCT-0.4r63-0.2r126-0.2r189-0.2r252-DV20GE1M` |
| Gemeinsame Bausteine | mit Hash protokolliert (indicators, return-series, taxonomy, product-classes, lib, analyze-methods), blockieren andere Produkte nicht |

**Absicherung:**
- `measure.mjs` bricht ohne gültigen Freeze ab (Code 3).
- Test MR-T-FREEZE scheitert bei jeder späteren Änderung an Regelbuch oder Engine-Code. Eine Änderung braucht eine neue Version und einen neuen Freeze.

## 11. Messung (nach dem Freeze)

**Technischer Probelauf** (Lauf 37459842061, DEV, 600 Reihen, gegen den Freeze geprüft):
- Freeze erkannt.
- 598 Segmente, davon 380 mit SEC-Daten.
- 467 Setups bei 40 Titeln.
- 53 Portfolio-Trades, 55 Signale.

Das Log zeigt keine Richtungen. Keine Codeänderung danach.

### 11.1 Rahmen

- **Nur Messung.** Die Engine wurde nach den Läufen nicht verändert; Freeze und Hashes sind unverändert.
- **GESEHENE DATEN.** DEV 2016–2026 und HOLDOUT 2008–2015 wurden in R14 geöffnet. Die Ergebnisse dienen der Beschreibung, nicht der Optimierung, und sind keine unabhängige Evidenz.
- **Kennzahlen.** Sie liegen wie in R14 nur verschlüsselt für den Eigentümer vor (`claude/supertrader-validation-results`; Tiingo-Nutzungsrechte, AT7). Das sind CAGR, Total Return, Max Drawdown, Volatilität, Sharpe, Exposure, Positionen, Umschlag, Trefferquote, Ø Gewinn/Verlust, MFE/MAE, SPY-Gesamtrendite sowie Signal- und Portfolioqualität getrennt.
- **Öffentlich.** Hier stehen nur Zählwerte und Richtungen, keine Zahlen aus Kursdaten.
- **Survivorship.** Der HOLDOUT ist nicht frei davon (R14): Positive Ergebnisse sind nach oben verzerrt.

### 11.2 DEV 2016-01-04 bis 2026-09-30 (Lauf 37461915341, `minervini-replication-dev.sealed.json`)

| Größe | Wert |
|---|---|
| Titel (Segmente) | 9.048, davon mit SEC-Erstmeldungen 6.405 |
| Setups (Schluss t → Order t+1) | 17.072 bei 1.342 Titeln |
| Ausgelöste Signale ohne Kapitalgrenze | 2.075 |
| Portfolio-Trades | 650 |
| Portfolio-CAGR gegen SPY-Gesamtrendite | **unter SPY** |
| Max Drawdown gegen SPY | **kleiner als SPY** |
| Signale gegen SPY bei gleicher Haltedauer (Mittel) | **unter SPY** |

Abschnitt 11.3 (HOLDOUT) folgt nach dem zweiten Lauf.

## 12. Abschlussbericht

**1. Was ist Minervinis öffentlich rekonstruierbare Methode?**

SEPA ist eine Abfolge von Filtern, dann folgt die Ausführung:
1. Trend Template (Stufe 2);
2. fundamental führende Aktie (Gewinn, Umsatz, Margen mit Beschleunigung);
3. VCP mit klarem Pivot und geringem Risiko;
4. Kauf beim Durchbruch;
5. strikte Verlustbegrenzung (≤ 10 %, Einstand bei 3R) und Verkauf in die Stärke;
6. konzentriertes Portfolio mit 1,25 % Risiko je Trade und höchstens 25 % je Position, progressiv aufgebaut.

**2. Welche Bestandteile sind eindeutig?**
- Trend-Template-Kriterien 1–7;
- 2–6 Kontraktionen; Pivot als Kaufpunkt;
- Verlustgrenze 10 %; Einstand bei 3R;
- 1,25 % Risiko (Höchstwert 2,5 %), 25 % Höchstgewicht;
- Positionszahl-Spanne;
- die Hälfte verkaufen als Werkzeug.

**3. Welche sind diskretionär?**
- Enge der Basis; Cheat- und Low-Cheat-Zonen;
- Pilot- und Zukaufpunkte;
- „schwieriger Markt“;
- Klimax- und Verletzungssignale; Ermessensverkauf an der 20-Tage-Linie;
- Zeitpunkt des Teilverkaufs; Gewichtung der Fundamentaldaten (Code 33 als Ideal);
- Katalysator.

**4. Welche Daten besitzt VU bereits?**
- Tageskurse inklusive delisteter Titel (2007–2026, privat);
- point-in-time-RS-Querschnitt;
- SEC-Erstmeldungen mit Einreichungsdatum: EPS und Umsatz (seit R11); Bruttogewinn, operatives Ergebnis und Nettoergebnis (neu in Phase 2A, aus derselben Quelle);
- Split- und Dividendenhistorie;
- Delisting-Klassen.

**5. Welche Daten fehlen?**
- Konsensschätzungen, Überraschungen, Revisionen;
- 13F-Bestände;
- Branchengruppen zum damaligen Stand;
- Ergebnistermine (Ankündigung);
- Intraday-Volumen am Pivot (Historie);
- Kennzeichnung von Einmalposten;
- IBD-RS (proprietär).

**6. Welche Regeln sind nicht reproduzierbar?**
- Mangels Daten: MR-SEPA-07/08/09/11/12, MR-ERN-01, MR-ENT-02.
- Nicht öffentlich: MR-SEPA-13 (Katalysator), Minervinis Marktrisikomodell, IBD-RS.
- Ohne Zahl: MR-EXIT-05 (Zeitstopp).
- Diskretionär, bewusst nicht formalisiert: MR-VCP-05, MR-ENT-03, MR-RSK-04/05, MR-EXIT-06/07, MR-PF-03.
- Außer Umfang: Margin, Short (MR-PF-04/05).
- Nicht Teil von 1.0.0, belegt: Power Play (MR-ENT-04).

**7. Welche VU-Formalisierungen waren unvermeidbar?**
- VCP-Zerlegung (MR-VCP-08);
- RS-Ersatz (MR-TT-08);
- SMA200-Steigung über 21 Sitzungen (MR-TT-03);
- Volumen < 1,0 × SMA50 (MR-VCP-04);
- Kauf-Stop auf Tagesbalken (MR-ENT-01);
- Teilverkauf an 3R gekoppelt (MR-EXIT-02);
- 50 % des Höchstgewinns sichern (MR-EXIT-03);
- Startquote 50 % / voll nach Gewinn-Trade (MR-PF-02);
- Reihenfolge nach RS und Stopabstand (MR-PF-06);
- Umsatz > 0 (MR-SEPA-04);
- point-in-time-Datenregeln (MR-PIT-01).

Der Messrahmen (Universum, Kosten, Ausführung) ist VU_OWN und keine Minervini-Regel.

**8. Was aus 2.0.0 wurde wiederverwendet?**
- Nur Konzepte, kein Code:
  - Trend-Template-Kriterien 1–7 (fachlich gleich, neu implementiert);
  - Einstand bei 3R;
  - die Werte 1,25 %/25 % (jetzt primär belegt).
- Gemeinsame reine Primitive: `indicators.mjs#sma/rollingMax/rollingMin`.
- Die Datenschicht von R14: `loadPitData`, `adjustSeries`, Verschlüsselung.

**9. Was aus 3.0.0 wurde wiederverwendet?**
- Das Prinzip der Sichtbarkeit (Einreichung vor dem Handelstag).
- Die bestehende CIK-Zuordnung (`sec-pit-r12/r11`).
- Code von `earnings.mjs` ist nicht übernommen: 25 %-Schwelle, Verlustbasis als Beschleunigung, keine Split-Bereinigung, kein Quartalsabgleich.

**10. Welche bisherigen Regeln wurden verworfen?**
- Ausbruchsvolumen ≥ 1,4× (O'Neil).
- Ausstieg unter SMA50 mit Volumen (ungeklärt).
- Schlussbestätigung mit Kauf zur nächsten Eröffnung.
- 4-%-Zickzack, 65-Sitzungen-Fenster, Grenzen 35 %/10 %, Vol10/Vol50 < 0,8.
- 10 %-Stop als Regelfall.
- Verfall nach 20 Sitzungen, 5-Sitzungen-Sperre, ENTRY_READY 3 %.
- RS nur bei Entdeckung; Halbierungsregel.
- 10 Plätze mit alphabetischem Gleichstand.
- Gleichtagsfinanzierung.
- EPS ≥ 25 %; Verlustbasis als Beschleunigung.

Liste: Regelbuch `legacyDisposition`.

**11. Wie hoch ist die Fidelity je Teilbereich?**
- Trend MEDIUM, Einstieg LOW, Fundamental LOW, Ausstieg LOW.
- Größe MEDIUM, Portfolio LOW, Marktumfeld MEDIUM, Risiko MEDIUM.
- Gesamt LOW (strenge Methode, Abschnitt 7).

**12. Darf die Engine „Replication“ heißen?**
Nein. Der Hard Gate ist nicht erfüllt; Gründe in Abschnitt 8. Name: `minervini-adaptation-1.0.0`, „VU Adaptation – Minervini Canonical (Research)“.

**13. Unterschied zu Live 2.0.0**

| | Live 2.0.0 | Phase 2A (1.0.0) |
|---|---|---|
| SEPA | keine | point-in-time-Filter |
| Einstieg | Schlussbestätigung | Kauf-Stop am Pivot |
| Volumenfilter | 1,4× (O'Neil) | keiner (Volumen nur protokolliert) |
| VCP | Zickzack mit VU-Zahlen | Zerlegung ohne erfundene Schwelle, Basis bis 45 Wochen |
| Ausstieg | SMA50 mit Volumen | Hälfte bei 3R, Einstand, Gewinnsicherung |
| Lebenszyklus | Sperre, Verfall | keiner |
| Startquote | keine | progressive Exposure mit Startquote |
| Plätze | 10 | 12 |
| Gleichstand | alphabetisch | kein Alphabet |
| Kurse, Universum, Kosten | gleiche Quelle (Messrahmen R14) | gleiche Quelle (Messrahmen R14) |

**14. Unterschied zu Research 3.0.0**
- 3.0.0 ist 2.0.0 plus ein EPS-Filter (25 %, eine Beschleunigungsstufe, Umsatz > 0) ohne Split-Bereinigung.
- 1.0.0 teilt mit 3.0.0 nur das Sichtbarkeitsprinzip. Alles andere ist anders, wie unter Frage 13.
- Der Fundamentalfilter ist quellennäher (20 %) und datentechnisch korrigiert.

**15. Welche offenen Datenlücken verhindern höhere Fidelity?**

Nach Wirkung geordnet:
1. Konsens, Überraschungen und Revisionen. Eine kostenlose offizielle Quelle ist nicht bekannt.
2. Intraday-Volumen für die Ausbruchsbestätigung.
3. Ergebnistermine (8-K Item 2.02, kostenlos, nicht eingeführt).
4. 13F-Sponsorship (kostenlos, nicht eingeführt).
5. Branchengruppen zum damaligen Stand (SIC je Einreichung, kostenlos, nicht eingeführt).
6. Längerer Kursvorlauf für die Split-Historie, damit SEPA ab Fensterbeginn bewertbar ist.
7. Ohne Daten-, aber mit Quellenproblem:
   - Zahl für den Zeitstopp;
   - Definition von Cheat-Zonen und Pilot-/Zukaufpunkten;
   - Buch-Volltexte, damit Fundstellen seitengenau belegt sind und die Belegstärke über MEDIUM steigt.

Jede neue Datenquelle braucht eine eigene Freigabe. Danach wäre eine neue Version mit neuem Freeze nötig.

## 13. Stopp

Gemäß Auftrag:
- kein Weinstein, kein Darvas, kein Turtle, kein Umbau von Kullamägi;
- kein Live-Release; keine Änderung an Minervini 2.0.0 oder 3.0.0, an Ledgern, Signalen oder der Registry.

Eine spätere VU-Adaptation oder Live-Migration ist ein eigener Auftrag mit eigener Version, Präregistrierung und Vorwärtsprüfung. DEV und HOLDOUT sind gesehene Daten; neue Evidenz entsteht nur vorwärts oder in neuen Zeiträumen.
