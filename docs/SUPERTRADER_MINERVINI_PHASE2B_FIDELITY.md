# Supertrader Phase 2B – Minervini Fidelity Completion

Stand: 2026-10-06. Zweig `claude/minervini-replication-phase2a`. Forschung, **nicht live**: Minervini 2.0.0 bleibt live, keine Ledger- oder Registry-Änderung.

**Kurzfassung**
- Phase 2A bleibt eingefroren und unverändert. Die Referenz steht in `MINERVINI-PHASE2A-BASELINE.json`; Test MR-T-FREEZE ist grün.
- Phase 2B liefert eine neue Version: `minervini-adaptation-1.1.0`.
- Die Version enthält genau eine quellengetriebene Regeländerung, die Startstufe der progressiven Exposure:
  - 25 % Exposure;
  - höchstens 5 % je Position;
  - Beleg: eigener Beitrag Minervinis vom 2022-07-18.
- Neu ist ein generischer, zeitpunktgenauer SEC-Datenlayer:
  - 8-K-Ergebnistermine;
  - SIC je Einreichung.
- Die Fidelity steigt nur auf Regelebene. Keine Bereichsnote steigt, die Gesamtnote bleibt LOW.
- Der Name „Replication“ bleibt verboten (Hard Gate).

---

## 0. Artefakte

| Artefakt | Pfad |
|---|---|
| Baseline 2A (Referenz, unveränderlich) | `scripts/supertrader/fidelity/MINERVINI-PHASE2A-BASELINE.json` |
| Quellenkonflikte und Methodenära | `scripts/supertrader/fidelity/MINERVINI-SOURCE-CONFLICTS.json` (CF-01 … CF-12) |
| Regelbuch 1.1.0 (Kandidat → Freeze) | `scripts/supertrader/fidelity/MINERVINI-CANONICAL-REPLICATION-1.1.0.json` |
| Fidelity-Delta | `scripts/supertrader/fidelity/MINERVINI-PHASE2B-FIDELITY-DELTA.json` |
| Freeze 1.1.0 | `scripts/supertrader/fidelity/MINERVINI-FIDELITY-FREEZE-1.1.0.json` |
| Erzeuger Regelbuch, Delta, Baseline | `scripts/supertrader/replication/minervini-1.1/build-rulebook.mjs` (`--check` im Test) |
| Fidelity-Methode 2B | `scripts/supertrader/replication/minervini-1.1/fidelity-2b.mjs` |
| Engine 1.1.0 | `scripts/supertrader/replication/minervini-1.1/` (die eingefrorenen 2A-Module werden unverändert wiederverwendet) |
| SEC-Datenlayer | `scripts/supertrader/data-layer/sec/` (`earnings-events.mjs`, `industry-sic.mjs`, `build-sec-events.mjs`) |
| Tests | `scripts/supertrader/tests/minervini-adaptation-1-1.test.mjs` (MR11-T-*), `sec-data-layer.test.mjs` (SDL-T-*) |
| Workflow-Modi | `sec-events`, `sec-events-smoke`, `sec-events-holdout`, `mrepl11-measure`, `mrepl11-measure-smoke`, `mrepl11-measure-holdout` |

## 1. Vorgehen und Rollen

- **Lead (Opus):** entscheidet Quellen, Interpretation, kanonische Regeln, Fidelity, Datenaufnahme und das abschließende Red Team.
- **Worker (Sonnet):**
  - A: Quellenprüfung;
  - B: SEC 8-K;
  - C: SEC 13F;
  - D: SIC;
  - E: vorhandene VU-Daten.
- **Reihenfolge:**
  1. Quellen;
  2. Kandidat;
  3. Red Team;
  4. Freeze;
  5. Messung.
- Keine Regel wurde nach einem Messergebnis geändert. Die Änderungsliste (`CHANGES` in `build-rulebook.mjs`) liegt zeitlich vor jeder 1.1-Messung (Commit-Historie).

## 2. Fidelity-Methode 2B

Sie gilt gleich für die Neubewertung von 2A und für 1.1.0.

1. **Zugangsstufe je Quelle:**
   - `PRIMARY_DIRECT`: Interview im Volltext abgerufen, amtliche SEC-Regel;
   - `OWN_POST_INDEX`: eigener X-Beitrag, nur über den Suchindex lesbar;
   - `BOOK_NOT_READ`: Buch, nicht im Volltext zugänglich;
   - `NOTES`: Buchnotizen Dritter;
   - `SECONDARY`: Sekundärquelle.
2. **Belegstärke einer kanonischen Regel:**
   - HIGH nur mit einer `PRIMARY_DIRECT`-Quelle oder zwei eigenen Beiträgen;
   - sonst höchstens MEDIUM;
   - nur sekundär: LOW.
   - Modellwissen zählt nicht.
3. **Regel-Fidelity** = min(Umsetzungs-Fidelity, Belegstärke).
4. **Bereich** wie in 2A: niedrigste filternde Regel, eine Stufe tiefer, wenn eine Kernregel fehlt. Ein Bereich ohne filternde Regel ist NONE.

**Folge:** Mehrere 2A-Noten waren zu hoch. Trend Template, VCP-Zahlen, maximaler Stop und Einstand bei 3R beruhen nur auf Buchnotizen. 2A hatte sie teils mit „Buchkenntnis des Lead“ auf HIGH gesetzt. Das Delta zeigt deshalb drei Spalten:

- **2A wie eingefroren**;
- **2A neu bewertet**;
- **2B**.

Der faire Vergleich ist „2A neu bewertet → 2B“.

## 3. Antworten auf die 17 Fragen

**1. Welche Quellen konnten verbessert werden?**

Neu als Primärbelege (eigene X-Beiträge, Text über den Suchindex; x.com ist per Egress gesperrt):

| Quelle | Inhalt |
|---|---|
| `SRC-X-2022-07-18-EXPOSURE` | Einstieg mit 25 % Exposure, fünf 5-%-Positionen mit 8-%-Stops |
| `SRC-X-2021-12-RS` | Rund 90 % der Trades mit RS ≥ 89 |
| `SRC-X-2024-EARNINGS` | Quartalszahlen: Abwägung über implizite Volatilität |
| `SRC-X-2018-PYRAMID` | Zukäufe nur an kaufbaren Pivots |

- Amtlich: `SRC-SEC-8K-ITEM202` und `SRC-SEC-HEADER-SIC`.
- Jede Quelle trägt jetzt Zugangsstufe und Methodenära.
- Nicht primär gefunden:
  - VCP-Zahlen;
  - Wortlaut des Trend Template;
  - 50-%-Obergrenze;
  - Positionszahl 4–6 / 16–20;
  - Pilot- und Zukaufgrößen;
  - Einstand 2–3×;
  - Zeitstop in Tagen;
  - EPS- und Umsatzschwellen;
  - Pflicht zum Gruppenrang;
  - 13F-Regel.

**2. Welche Regeln bleiben nur MEDIUM/LOW?**

- 49 von 57 kanonischen Regeln (Schicht A) haben Belegstärke MEDIUM. Darunter sind das gesamte Trend Template, VCP, Einstieg, Ausstieg, maximaler Stop und Positionszahl.
- HIGH-Belegstärke haben nur sechs Regeln: MR-SEPA-00, MR-SEPA-06, MR-RSK-03, MR-RSK-04, MR-SIZ-01 und MR-PF-02 (Grundsatz).
- Regel-Fidelity HIGH haben nur MR-SIZ-01 (1,25 % Risiko je Trade), MR-RSK-03 und MR-PIT-01.

**3. Welche Source Conflicts existieren?**

Zwölf Konflikte, CF-01 bis CF-12, mit Quelle A/B, Zeit, Kontext, Grund, Entscheidung und Belegstärke:

| ID | Konflikt |
|---|---|
| CF-01 | 52-Wochen-Tief 25 / 30 % |
| CF-02 | Basisdauer 45 / 65 Wochen |
| CF-03 | EPS 20 / 25 % (25 % = CAN SLIM) |
| CF-04 | Positionsgröße 25 / 50 % |
| CF-05 | Positionszahl |
| CF-06 | Start-Exposure (umgesetzt) |
| CF-07 | RS 70 gegen Praxis 89+ |
| CF-08 | Quartalszahlen 2017 gegen 2024 |
| CF-09 | Einstand 3R gegen „ohne Zahl“ |
| CF-10 | kein Indexfilter gegen proprietäres SPY-Modell |
| CF-11 | SMA50-Einzelfall |
| CF-12 | Branche: Nr. 1–3 gegen „Gruppe als Bestätigung“ |

**4. Welche Minervini-Ära bildet die Engine ab?**

`SEPA-PUBLISHED-2013-2022`: die Bücher von 2013 und 2017, konkretisiert durch eigene öffentliche Beiträge 2017–2022.

- Spätere Neuerungen werden nicht übernommen:
  - Quartalszahlen nach impliziter Volatilität (2024);
  - proprietäres Marktmodell (2023+);
  - Ranglisten mit Schätzungsrevisionen (2026).
- Test MR11-T-ERA prüft, dass kein wirkender Parameter allein auf Quellen ab 2023 oder auf undatierten Sekundärquellen beruht.

**5. Welche neuen offiziellen Daten wurden erschlossen?**

Zwei kostenlose, amtliche Quellen, gebaut als generischer VU-Datenlayer (privater Eimer, Schlüssel `sec-events-sic-1.json.gz` je Fenster):

- `data.sec.gov/submissions` mit 8-K Item 2.02;
- EDGAR-Einreichungsköpfe (`.hdr.sgml`, `ASSIGNED-SIC`).

Der Datenlayer ist nicht Minervini-spezifisch. Eine spätere Nutzung durch Quant oder Discover braucht einen eigenen PR.

**6. Was liefern 8-K-Daten?**

- Ergebnismitteilungen seit 2004-08-23, zeitpunktgenau: bekannt ab dem Handelstag nach dem Einreichungsdatum.
- `acceptanceDateTime` wird gespeichert, aber nicht genutzt; die Zeit ist bei manchen Emittenten um Stunden versetzt.
- 8-K/A setzt die letzte Mitteilung nicht zurück.
- Mehrfacheinreichungen innerhalb von 10 Tagen gelten als Duplikat.
- **Nicht** ableitbar ist der kommende Termin. Deshalb bleibt MR-ERN-01 (Quartalszahlen nur mit Polster) nicht reproduzierbar; es gibt keine Fortschreibung aus Vorjahresterminen.
- In der Messung zeigen die Daten nur ex post, wie viele Trades über eine Mitteilung gehalten wurden:
  - streng;
  - inklusive;
  - Mitteilung am Ein- bzw. Ausstiegstag getrennt.

**7. Was liefern 13F-Daten?**

Für diese Methode nichts, und sie wurden bewusst **nicht** gebaut:

- Keine Minervini-Fundstelle für eine 13F-Regel. Er beschreibt institutionelle Nachfrage über Akkumulation in Kurs und Volumen; eine Zählung der Halter wäre O'Neils „I“, also eine FOREIGN_RULE.
- Strukturierte Daten gibt es erst ab 2013Q2. HOLDOUT 2008–2015 wäre größtenteils ohne Daten.
- Bekannt ist eine Position erst ab der Einreichung (bis 45 Tage nach Quartalsende), nie ab dem Quartalsende.
- Die CUSIP-Zuordnung ist lizenzpflichtig (CGS); im Repo gibt es nur eine heutige OpenFIGI-Tabelle.
- MR-SEPA-11 ist neu als `DISCRETIONARY_NOT_FORMALIZED` eingestuft.

**8. Was liefert SIC?**

- Die SIC zum Einreichungszeitpunkt je CIK, aus dem Kopf der periodischen Einreichungen:
  - 10-K/10-Q, bis 2008 auch 10-KSB/10-QSB, 20-F, 40-F;
  - bei kombinierten Einreichungen der FILER-Block des Emittenten.
- Gelesen wird per Bisektion: erste und letzte Einreichung, bei Wechsel halbiert.
- Die SIC an einem Tag ist die der jüngsten gelesenen Einreichung vor diesem Tag. Davor gilt sie als unbekannt, ohne Rückfüllen.
- Dokumentierte Grenze: Ein Wechsel A → B → A zwischen zwei gelesenen Köpfen bleibt unentdeckt.
- Beispiel: Fiserv 7374 (2020) → 7389 (2026). Die heutige SIC aus `submissions` wird bewusst nicht gespeichert.
- Verwendung: nur das Protokoll zu MR-SEPA-12 (Rang in der SIC-Gruppe), kein Filter (siehe Frage 11).

**9. Welche Margin-Daten sind belastbar?**

Brutto-, operative und Nettomarge aus `sec-pit-mrepl-1`, unverändert aus 2A:

- Erstmeldung zählt;
- sichtbar ab der späteren Einreichung von Zähler und Umsatz;
- eine Währung je Reihe;
- YTD-Werte werden nie als Quartal gelesen;
- Q4 = Jahr − 3 Quartale, sichtbar erst ab dem 10-K;
- Umsatz ≤ 0 ergibt keine Marge.

Neu sind Regressionstests: MR11-T-MARGIN-YTD, -AMEND, -UNIT, -Q4, -PERIOD.

- Grenzen:
  - Bruttogewinn fehlt bei vielen Banken und Dienstleistern (keine Kostenzeile);
  - kein Tag-Mapping für Einmalposten (MR-SEPA-09).
- Die Margenregel bleibt protokolliert (MR-SEPA-06), weil die Quelle keine Mindestschwelle nennt.

**10. Welche Datenlücken bleiben?**

- Konsens, Revisionen und Überraschungen (MR-SEPA-07/08): **NOT AVAILABLE FROM CURRENT OFFICIAL FREE SOURCES**.
- Der kommende Ergebnistermin (MR-ERN-01).
- Minervinis Branchentaxonomie (IBD-Gruppen) und „die 4–5 führenden Sektoren“.
- Einmalposten (MR-SEPA-09).
- Intraday-Volumen zum Ausbruchszeitpunkt: Tagesdaten können nicht zum Füllzeitpunkt bestätigen; IEX deckt nur 1–3 % des Volumens ab; keine bezahlte Pipeline.
- Margin und Short sind out of scope.
- Katalysatoren (qualitativ).
- CIK-Zuordnung für Titel, deren Namenszuordnung XBRL-Daten verlangte. Das gilt vor allem für frühe HOLDOUT-Jahre und kleine Emittenten; das SIC-Protokoll ist dort unvollständig.

**11. Welche neuen Regeln wurden tatsächlich implementiert?**

- **Wirkend:** MR-PF-02, Startstufe 25 % Exposure und höchstens 5 % je neuer Position:
  - gilt zu Beginn und nach jedem Verlust-Trade;
  - nach einem Gewinn-Trade 100 % und 25 %, wie bisher.
- **Nur protokolliert:**
  - MR-SEPA-12: Rang in der SIC-Gruppe zum damaligen Stand;
  - Mitteilungen während der Haltedauer (Messung).
- **Nur Herkunft korrigiert, Wert unverändert:**
  - MR-SIZ-02: 25 % jetzt ORIGINAL_INTERPRETATION;
  - MR-PF-01: 12 Positionen jetzt VU_FORMALIZATION.

**12. Warum gehören sie methodisch hinein?**

- MR-PF-02 konkretisiert die Buchregel („mit Pilotpositionen auf 25–50 %, erst bei Erfolg erhöhen“) mit Minervinis eigenen Zahlen am unteren Ende der Spanne.
- 2A setzte das obere Ende (50 %) und erlaubte 25 % je Position. Das widerspricht dem Primärbeispiel.
- Die Änderung liegt innerhalb der Ära, ist primär belegt und nicht durch eine Messung motiviert.
- MR-SEPA-12 wird nicht gefiltert, weil SIC eine andere Taxonomie ist. Ein Gate wäre eine VU-Erfindung mit Wirkung auf die Auswahl (CF-12).

**13. Wie verändert sich Fidelity?**

- Regelebene:
  - MR-PF-02: LOW → MEDIUM gegen „2A neu bewertet“; gegen „2A wie eingefroren“ MEDIUM → MEDIUM, aber ohne Widerspruch zur Primärquelle;
  - MR-SEPA-12: fehlend → protokolliert (LOW).
- Bereiche und gesamt: unverändert (Matrix in Abschnitt 4).
- Die Neubewertung senkt gegenüber 2A wie eingefroren:
  - Sizing MEDIUM → LOW (Kernregel Pyramidisieren fehlt; 25-%-Grenze nur MEDIUM belegt);
  - Risk MEDIUM → LOW (maximaler Stop nur über Buchnotizen; MR-ERN-01 fehlt).

**14. Gibt es weiterhin unvermeidbare VU-Formalisierungen?**

Ja, 17 Parameter. Darunter:

- RS-Definition (IBD-RS ist nicht öffentlich);
- SMA200 „steigt“ über 21 Sitzungen;
- 52 Wochen als 252 Sitzungen;
- Umsatz > Vorjahr;
- Teilverkauf bei 3R;
- Trailing 50 %;
- 12 Positionen;
- 100 % volle Stufe;
- Wechsel der Stufe nach einem Trade;
- Zeitpunkt- und Periodenregeln der SEC-Daten;
- VCP-Zerlegung;
- Reihenfolge nach RS;
- SIC-Gruppenebenen.

Jede ist im Regelbuch mit Rule-ID, Herkunft und Begründung ausgewiesen. Kein versteckter Default; die Tests MR11-T-NO-HIDDEN-DEFAULTS und MR11-T-PARAMS-* prüfen das.

**15. Darf die Engine jetzt Replication heißen?**

**Nein.** Das R15-Hard-Gate verlangt HIGH in Einstieg, Ausstieg, Sizing, Portfolio, Risiko und Fundamental. Keiner dieser Bereiche ist HIGH.

- Name: `minervini-adaptation-1.1.0`
- Anzeige: „VU Adaptation – Minervini Canonical (Research)“
- Produktklasse: VU_ADAPTATION

**16. Welche Einschränkungen bleiben?**

- Bücher nicht im Volltext; X-Beiträge nur als Suchindex-Ausschnitt.
- Diskretionäre Teile nicht formalisiert:
  - Zeitstop ohne Zahl;
  - Pyramidisieren;
  - Verkauf in die Stärke nach Ermessen;
  - Marktlage;
  - Katalysator.
- DEV und HOLDOUT sind GESEHENE DATEN (seit R14). Die Messung ist Beschreibung, kein Beleg.
- Das SIC-Protokoll ist unvollständig, wo die CIK-Zuordnung fehlt.
- Die Engine ist Research only.

**17. Was wäre für noch höhere Fidelity notwendig?**

1. Rechtmäßiger Volltextzugang zu beiden Büchern, für seitengenaue Zahlen (Trend Template, VCP, Einstand).
2. Direkter Abruf der eigenen Beiträge (Archiv), damit Buchnotizen-Regeln auf HIGH steigen können.
3. Lizenzierte Konsens- und Revisionsdaten für MR-SEPA-07/08: kostenpflichtig, außerhalb des Auftrags.
4. Ein zeitpunktgenauer Ergebniskalender für MR-ERN-01: kostenpflichtig.
5. Intraday-Volumen aller Börsen für MR-ENT-02: kostenpflichtig.
6. Öffentliche Zahlen Minervinis zu Zeitstop, Zukaufgrößen und Stufenübergängen der Exposure.
7. Eine Margin-Modellierung (MR-PF-04), falls gewünscht.

Ohne diese Punkte bleibt die Gesamtnote LOW. Die Lücken sind dokumentiert, nicht erfunden.

## 4. Abschlussmatrix

Werte: 2A wie eingefroren / 2A neu bewertet (Methode 2B) → 2B. Quelle: `MINERVINI-PHASE2B-FIDELITY-DELTA.json`.

| Bereich | Phase 2A | Phase 2B | Veränderung | Restlücke |
|---|---|---|---|---|
| Trend | MEDIUM / MEDIUM | MEDIUM | keine; Belegstärke des Trend Template auf MEDIUM begrenzt | Wortlaut nur über Buchnotizen; IBD-RS nicht öffentlich (VU-RS) |
| Fundamentals | LOW / LOW | LOW | Margen-Regressionstests; 13F begründet verworfen | Schätzungen, Revisionen, Überraschungen nicht amtlich frei; Einmalposten |
| VCP | LOW / LOW | LOW | keine | keine Primärzahlen; Pivot-Volumen intraday (MR-VCP-05) |
| Entry | LOW / LOW | LOW | keine | Ausbruchsvolumen zum Füllzeitpunkt, Cheat-Einstiege |
| Exit | LOW / LOW | LOW | keine | Zeitstop ohne Zahl; Verkauf in die Stärke nach Ermessen; Einstand 3R nur Buchära |
| Sizing | MEDIUM / LOW | LOW | Startstufe begrenzt neue Positionen auf 5 % | Pyramidisieren (MR-PF-03) ohne Zukaufgrößen |
| Portfolio | LOW / LOW | LOW | MR-PF-02 Startstufe 25 % / 5 % (Regel LOW → MEDIUM) | Margin out of scope; Stufenübergang VU |
| Risk | MEDIUM / LOW | LOW | keine; vergangene Ergebnistermine jetzt zeitpunktgenau | kommender Termin unbekannt (MR-ERN-01); Max-Stop nur Buchnotizen |
| Market | MEDIUM / MEDIUM | MEDIUM | keine | Marktmodell ab 2023 proprietär; Ära 2013–2022 ohne Indexfilter |
| Industry | NONE / NONE | NONE | SIC zum damaligen Stand neu; Rang in der Gruppe protokolliert | Minervinis Branchentaxonomie und Sektorbegriff nicht abbildbar; CIK-Lücken |

## 5. Red Team (vor dem Freeze)

Unabhängiger Review des Kandidaten:

- **BLOCKER:** keiner.
- **MAJOR:** vier Befunde, alle behoben oder begrenzt vor dem Freeze (Commit `0ea8722c1`).
- **MINOR:** zwölf Befunde.

**MAJOR**

| Befund | Behebung |
|---|---|
| M1: Freeze grün trotz geänderter gemeinsamer Bausteine | Messlauf bricht jetzt ab, wenn sich `indicators.mjs`, `return-series.js`, `lib.mjs`, `analyze-methods.mjs`, `taxonomy.mjs` oder `product-classes.mjs` seit dem Freeze geändert haben. Der Builder und das 2A-Regelbuch sind im Code-Hash. |
| M2: Mitteilungen am Ausstiegstag (Gap-Ausstieg) nicht gezählt | Getrennte Zählung: streng, inklusive, Ein- und Ausstiegstag. |
| M3: Builder konnte bei SEC-Sperre (403) still unvollständig ablegen | Lange Wartezeit bei 403; Statistik im Speicher; Abbruch ohne Ablage bei mehr als 1 % Fehlern; die Messung verlangt 99 % Abdeckung. |
| M4: CIK-Quelle nur Titel mit XBRL-EPS | Ergänzt um die CIKs delisteter Listings aus `sec-delist-r13`, dazu 10-KSB/10-QSB. Die Restlücke ist dokumentiert (Frage 10), weil die bestehende Namenszuordnung XBRL-Daten verlangt. |

**MINOR, behoben**
- Ära je Quelle ausdrücklich: `SRC-SECONDARY-WEB-2026` war fälschlich als Regulierung eingestuft, Buchnotizen trugen das Notizjahr.
- Startstufe als ORIGINAL_INTERPRETATION, gleiche Maßgabe wie MR-SIZ-02.
- Zirkularität von MR-PF-02 im Delta offengelegt.
- MR-SEPA-12 als `RECORDED_OTHER_TAXONOMY`, Protokoll je Trade.
- Aktiengattungen gleicher CIK zählen einmal; Gruppengröße ohne den Titel selbst.
- FILER-Block des Emittenten bei kombinierten Einreichungen; SIC 0000 gilt als unbekannt.
- `--write` des Freeze nur für HEAD bei sauberem Arbeitsverzeichnis.
- Kompakter Querschnitt (Speicher).
- Ereignisdaten nur, wo die CIK überhaupt 8-K-2.02-Mitteilungen hat.
- Heutige SIC wird nicht mehr gespeichert (Rückschaufalle für spätere Nutzer).

**Bewusst nicht übernommen**
- Speicherschlüssel unter `_validation/` (m9): Auch diese Schlüssel liegen unter demselben Präfix, es gibt also keinen Schutzunterschied. Ein bereits laufender Bau hatte den Schlüssel geschrieben; der Neubau überschreibt ihn, statt ein verwaistes Objekt zu hinterlassen.

**Ohne Befund**
- Portfolio-Simulation: einziger Unterschied zu 2A ist die Stufe (Test MR11-T-SIM-EQUIV).
- Workflow.
- Gate A.
- HIGH-Belegstärken.
- Zeitbezug von RS und SIC: bekannt am Setup-Schluss, Order am Folgetag.

## 6. Freeze 1.1.0

_wird nach dem Freeze ergänzt_

## 7. Messung (nach dem Freeze, nur Beschreibung)

_wird nach den Messläufen ergänzt_

## 8. Hard Gate erneut geprüft

`classify()` liefert:
- `replicationClaimAllowed = false`;
- Kernbereiche nicht HIGH: Einstieg, Ausstieg, Sizing, Portfolio, Risiko, Fundamental;
- keine wirkende FOREIGN_RULE oder UNRESOLVED-Regel.

Name `minervini-adaptation-1.1.0`.

## 9. STOP

Phase 2B endet hier:
- kein Weinstein;
- kein Live-Schalten;
- keine Optimierung;
- keine Regeländerung aus den Messergebnissen.

Der PR wird vorbereitet, aber nicht gemergt.
