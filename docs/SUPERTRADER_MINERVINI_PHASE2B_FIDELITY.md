# Supertrader Phase 2B – Minervini Fidelity Completion (Abschluss)

Stand: 2026-10-06. Zweig `claude/minervini-replication-phase2a`. Nur Forschung und Fidelity:
- **nicht live**;
- Minervini 2.0.0 bleibt unverändert live;
- keine Ledger- oder Registry-Änderung;
- keine Performanceoptimierung.

## Entscheidung

**CLOSED – MAXIMUM CURRENT FIDELITY.**

Die Minervini-Fidelity-Forschung ist vorerst abgeschlossen. Wieder geöffnet wird sie nur bei:
- einer neuen Primärquelle;
- einer neuen offiziellen Datenquelle;
- echten neuen Forward-Daten;
- einer belegten Regelkorrektur.

Nie wegen Backtest-Performance.

**Name:** `minervini-adaptation-1.1.0`, „VU Adaptation – Minervini Canonical (Research)“. Die Bezeichnung **Minervini Replication** ist nicht zulässig (Hard Gate, Abschnitt 9).

---

## 0. Artefakte

| Artefakt | Pfad |
|---|---|
| Baseline 2A (unveränderlich) | `scripts/supertrader/fidelity/MINERVINI-PHASE2A-BASELINE.json` |
| Quellenkonflikte und Methodenära (CF-01 … CF-12) | `scripts/supertrader/fidelity/MINERVINI-SOURCE-CONFLICTS.json` |
| Regelbuch 1.1.0 | `scripts/supertrader/fidelity/MINERVINI-CANONICAL-REPLICATION-1.1.0.json` |
| Fidelity-Delta mit vollständigem Strategie-Diff 1.0.0 → 1.1.0 | `scripts/supertrader/fidelity/MINERVINI-PHASE2B-FIDELITY-DELTA.json` |
| Source-to-Code 1.1.0 | `scripts/supertrader/fidelity/MINERVINI-SOURCE-TO-CODE-1.1.0.json` |
| Data Mapping 1.1.0 mit Datenlücken A/B/C | `scripts/supertrader/fidelity/MINERVINI-DATA-MAPPING-1.1.0.json` |
| **Freeze 1.1.0** | `scripts/supertrader/fidelity/MINERVINI-FIDELITY-FREEZE-1.1.0.json` |
| Mess-Metadaten (öffentlich) | `scripts/supertrader/fidelity/MINERVINI-MEASUREMENT-1.1.0.json` |
| Engine 1.1.0 | `scripts/supertrader/replication/minervini-1.1/` (die eingefrorenen 2A-Module werden unverändert wiederverwendet) |
| SEC-Datenlayer (generisch) | `scripts/supertrader/data-layer/sec/` |
| Tests | `scripts/supertrader/tests/minervini-adaptation-1-1.test.mjs` (MR11-T-*), `sec-data-layer.test.mjs` (SDL-T-*) |
| Verschlüsselte Ergebnisse | Zweig `claude/supertrader-validation-results` (nur Owner lesbar) |

## 1. Phase 2A bleibt unverändert

Erneut geprüft am Ende von Phase 2B (`freeze.mjs --check`, Test MR-T-FREEZE, MR11-T-BASELINE):

| Prüfung | Ergebnis |
|---|---|
| 2A-Freeze | `MINERVINI-FIDELITY-FREEZE.json`, Status FROZEN, Commit `b365b66e5`, byte-gleich (SHA im Baseline-Dokument) |
| Regelbuch-Hash 2A | `58de73f0…71055d5`, unverändert |
| Code-Hash 2A | `f20a12a7…398acbdcb`, unverändert; kein 2A-Modul geändert |
| Freeze 1.1.0 | verweist auf die SHA-256 der 2A-Freeze-Datei; `verifyFreeze` 1.1 scheitert, sobald 2A verändert wird |

## 2. Fidelity – Hauptergebnis

### 2.1 Methode

Die Methode gilt gleich für die Neubewertung von 2A und für 2B (`fidelity-2b.mjs`):
- **HIGH:** Belegstärke HIGH nur mit einer Primärquelle im Volltext oder zwei eigenen Beiträgen.
- **MEDIUM:** Buch, Buchnotizen oder ein einzelner Beitrag (Suchindex) ergeben höchstens MEDIUM.
- **LOW:** nur Sekundärquellen ergeben LOW.
- **Modellwissen:** keine Quelle.
- **Regel-Fidelity** = min(Umsetzung, Belegstärke).

### 2.2 Endgültige Matrix

| Bereich | 2A frozen | 2A rescored | 2B final | Veränderung | Restlücke |
|---|---|---|---|---|---|
| Trend | MEDIUM | MEDIUM | **MEDIUM** | keine; Belegstärke Trend Template auf MEDIUM begrenzt | Wortlaut nur über Buchnotizen; IBD-RS nicht öffentlich (VU-RS) |
| Fundamentals | LOW | LOW | **LOW** | Margen-Regressionstests; 13F begründet verworfen | Schätzungen, Revisionen, Überraschungen nicht amtlich frei verfügbar; Einmalposten |
| VCP | LOW | LOW | **LOW** | keine | keine Primärzahlen; Pivot-Volumen intraday |
| Entry | LOW | LOW | **LOW** | keine | Ausbruchsvolumen zum Füllzeitpunkt; Cheat-Einstiege |
| Exit | LOW | LOW | **LOW** | keine | Zeitstop ohne Zahl; Verkauf in die Stärke nach Ermessen; Einstand 3R nur Buchära |
| Sizing | MEDIUM | LOW | **LOW** | Startstufe begrenzt neue Positionen auf 5 % | Pyramidisieren ohne Zukaufgrößen |
| Portfolio | LOW | LOW | **LOW** | MR-PF-02 Startstufe 25 % / 5 % (Regel LOW → MEDIUM) | Margin out of scope; Stufenwechsel ist VU-Formalisierung |
| Risk | MEDIUM | LOW | **LOW** | vergangene Ergebnistermine jetzt zeitpunktgenau | kommender Termin unbekannt (MR-ERN-01); Max-Stop nur Buchnotizen |
| Market | MEDIUM | MEDIUM | **MEDIUM** | keine | Marktmodell ab 2023 proprietär; Ära 2013–2022 ohne Indexfilter |
| Industry | NONE | NONE | **NONE** | SIC zum damaligen Stand neu; nur protokolliert | Minervinis Branchentaxonomie nicht abbildbar; CIK-Lücken |
| **Gesamt** | **LOW** | **LOW** | **LOW** | | |

**Bewertung:**
- Keine Bereichsnote stieg, und keine Note wurde wegen guter Performance angehoben.
- Die Fidelity stieg nur auf Regelebene, bei zwei Regeln:
  - MR-PF-02 setzt jetzt die primär belegten Zahlen der Startphase um.
  - MR-SEPA-12 wird zeitpunktgenau protokolliert statt zu fehlen.
- Die Neubewertung zeigt außerdem, dass 2A mehrere Noten zu hoch angesetzt hatte.

## 3. Änderungen 1.0.0 → 1.1.0

Vollständiger maschineller Diff: `MINERVINI-PHASE2B-FIDELITY-DELTA.json#strategyDiff`. Test MR11-T-DIFF prüft, dass jede Parameter- und Statusänderung dokumentiert ist und dass nur MR-PF-02 das Handelsverhalten ändert.

| Rule ID | alt | neu | Quelle | Belegstärke | Grund | Performance für Entscheidung verwendet |
|---|---|---|---|---|---|---|
| **MR-PF-02** (wirkend) | Startstufe 50 % Exposure, je Position bis 25 % | **Startstufe 25 % Exposure, höchstens 5 % je Position** (fünf 5-%-Positionen) | @markminervini, Status 1549175636983517185 (2022-07-18), Ära LATER_PUBLIC innerhalb SEPA-PUBLISHED-2013-2022; konkretisiert die Buchspanne 25–50 % (CF-06) | Grundsatz HIGH (Stockopedia 2018, Volltext); Zahlen MEDIUM (ein Beitrag, Suchindex; Rechenbeispiel → ORIGINAL_INTERPRETATION) | Primärbeleg; widerspricht der Buchregel nicht | **false** |
| MR-PF-02, Stufenwechsel | volle Stufe nach einem Gewinn-Trade, Rückkehr nach einem Verlust-Trade | **unverändert**, ausdrücklich **VU_FORMALIZATION** und **keine Minervini-Regel** (Quelle: „erst bei Erfolg erhöhen“, ohne Zahl) | – | – | keine Zahl öffentlich | false |
| MR-SIZ-02 | 25 % ORIGINAL | 25 % ORIGINAL_INTERPRETATION; gilt in der vollen Stufe | CF-04 | MEDIUM | 25 % nur als Rechenbeispiel belegt | false |
| MR-PF-01 | 12 ORIGINAL_INTERPRETATION | 12 VU_FORMALIZATION | CF-05 („8, 12 or more“) | MEDIUM | „or more“ ist keine Obergrenze | false |
| MR-SEPA-12 | fehlend | **nur Protokoll**: Rang in der SIC-Gruppe zum damaligen Stand (`RECORDED_OTHER_TAXONOMY`). **Kein Filter.** SIC ist **nicht** Minervinis Branchenklassifikation. | Buchnotizen; SEC-Einreichungsköpfe (Daten) | MEDIUM | Daten neu; andere Taxonomie (CF-12) | false |
| MR-ERN-01 | nicht reproduzierbar | weiter nicht reproduzierbar (der kommende Termin fehlt), vergangene Termine jetzt vorhanden | 2017-Regel kanonisch; 2024-Fassung nicht übernommen (CF-08) | MEDIUM | – | false |
| MR-SEPA-07/08 | nicht reproduzierbar | NOT AVAILABLE FROM CURRENT OFFICIAL FREE SOURCES | – | MEDIUM | – | false |
| MR-SEPA-11 | 13F dokumentiert | DISCRETIONARY_NOT_FORMALIZED; 13F ist keine Minervini-Regel | – | MEDIUM | O'Neils „I“ wäre eine FOREIGN_RULE | false |

**Seit dem Freeze unverändert:**
- VCP;
- Exit;
- EPS- und Umsatzschwellen;
- SIC als Filter (nicht aktiviert);
- 13F (nicht integriert);
- keine neuen Proxys.

## 4. Daten

| Datenlayer (korrigierter Builder) | DEV | HOLDOUT |
|---|---|---|
| Lauf / Commit | 37497160189 / `cbbbfcbb988` | 37512610810 / `9db37cb18a4` |
| CIKs / Abruffehler | 5.910 / **0** | 3.760 / **0** |
| SIC-Historie | 5.851 (99,0 %) | 3.652 (97,1 %) |
| 8-K-Ergebnismitteilungen vorhanden | 5.896 (99,8 %) | 3.684 (98,0 %) |
| SIC-Wechsel zum damaligen Stand | 912 bei 795 CIKs | 405 bei 369 CIKs |
| Köpfe ohne lesbare SIC (Nachbar gelesen) | 2.494 / 18.391 | 838 / 10.056 |

**Gültigkeit der Bauten:**
- Der vor dem Review gestartete DEV-Bau (`5066f8b7a`) ist ungültig. Freeze und Messung lehnen ihn ab, weil der Datenbau-Commit im Freeze festgehalten ist.
- Ein korrigierter DEV-Lauf (678) wurde in der zweigübergreifenden Warteschlange von einem fremden Lauf verdrängt und erneut gestartet.
- Der Builder ist zwischen beiden Bauten und dem Freeze byte-gleich; `freeze.mjs --write` hat das geprüft.

**Systematische Restlücken:**
- Listings ohne CIK-Zuordnung, weil die bestehende Namenszuordnung XBRL-Daten verlangt. Das betrifft eher frühe HOLDOUT-Jahre und kleine Emittenten.
- Ein SIC-Wechsel A → B → A zwischen zwei gelesenen Köpfen bleibt unentdeckt.
- Auslandsemittenten (6-K) haben keine 8-K-Mitteilungen.

### 4.1 Datenlücken endgültig klassifiziert

| Datum | Klasse | Status |
|---|---|---|
| Quartals-EPS, Umsatz, Margen zum damaligen Stand | **A** | SEC-PIT-MREPL-1 (Erstmeldung, filed < Handelstag) |
| Ergebnistermine (vergangene) | **A** | 8-K Item 2.02, bekannt ab dem Folgehandelstag |
| Branchenklassifikation SIC zum damaligen Stand | **A** | Einreichungsköpfe (andere Taxonomie als Minervini; nur Protokoll) |
| Institutionelle Daten (13F) | **B** | amtlich frei ab 2013Q2, known_from = Einreichung; CUSIP-Lizenz offen; keine Minervini-Regel, nicht gebaut |
| Einmalposten | **B** | XBRL-Tags vorhanden, kein belastbares Mapping; nicht gebaut |
| Estimates | **C** | NOT AVAILABLE FROM CURRENT OFFICIAL FREE SOURCES |
| Revisions | **C** | dito |
| Surprises | **C** | dito (kein Proxy aus dem Kurssprung) |
| Ergebnistermine (kommende) | **C** | nicht in SEC-Daten; kein Proxy |
| Intraday-Volumen (alle Börsen) | **C** | nur IEX frei (1–3 % des Volumens); keine bezahlte Pipeline |
| IBD RS / Gruppenrang | **C** | proprietär; VU-RS ist VU_FORMALIZATION |

In diesem Auftrag wurde keine weitere Pipeline gebaut.

## 5. Red Team vor dem Freeze

- **Unabhängiger Review:** kein BLOCKER. Vier MAJOR-Befunde (M1–M4) wurden behoben oder begrenzt, die MINOR-Befunde behoben (siehe Commit `0ea8722c1`). m9 wurde begründet abgelehnt.
- **Letzter Durchgang durch den Lead:** ein Codefehler in der neuen Diagnose. Der Exit-Bezugskurs lag nach statt vor der Slippage. Er wurde mit einem Regressionstest behoben (MR11-T-DIAG-EXIT-PRICE). Sonst gab es keinen Befund mit hohem Schweregrad.

**Geprüft:**
- **Quellen:** unbelegte Regeln, O'Neil-Regeln, Modellwissen, Ära, Widersprüche.
- **Daten:**
  - Lookahead;
  - Sichtbarkeit der Einreichungen;
  - Änderungen;
  - YTD/Quartal;
  - Splits;
  - Rückschaufehler bei der SIC;
  - Durchsickern von Ergebnisterminen;
  - Abdeckung delisteter Titel.
- **Code:**
  - versteckte Defaults;
  - generische VU-Portfolioregeln;
  - Reihenfolge-Bias;
  - Gleichtagsabwicklung, fehlende Eröffnungskurse;
  - Dividenden, Reverse-Splits;
  - Positionsgröße, Kapitalbuchung.
  - Ergebnis: 1.1 unterscheidet sich von 2A nur in der Stufe (MR11-T-SIM-EQUIV, MR11-T-SIM-HOOK).
- **Messung:**
  - Code gleich dem Freeze;
  - gemeinsame Bausteine fail-closed;
  - Datenbau-Commit gebunden;
  - mindestens 99 % Abdeckung.

## 6. Freeze 1.1.0

Datei `MINERVINI-FIDELITY-FREEZE-1.1.0.json`, geschrieben aus sauberem Arbeitsverzeichnis an HEAD `9db37cb18a4`.

**Enthaltene Felder:**
- Eltern-Freeze 1.0.0 (Datei-SHA, Commit, Hashes);
- Commit, `cleanTree: true`, Zeitstempel;
- Regelbuch-Hash `ae226511…`;
- Quellen-/Provenienz-Hash (Quellenverzeichnis und Konfliktregister);
- Code-Hash `2093c8d1…` (26 Dateien: 1.1-Modul, wiederverwendete 2A-Module, Datenlayer, Builder, 2A-Regelbuch);
- Builder-Hash, Mess-Hash;
- Datenschema-Hashes;
- Hashes der gemeinsamen Bausteine;
- Datenbauten DEV/HOLDOUT;
- Fidelity-Matrix, Klassifikation.

Nach dem Freeze gab es keine Regeländerung. Seither wurden nur das Mess-Metadatendokument und dieser Bericht ergänzt.

## 7. Messung (genau einmal je Zeitraum, nach dem Freeze)

**DEV 2016–2026 und HOLDOUT 2008–2015 sind GESEHENE DATEN** (seit R14). Sie sind kein unabhängiger Holdout. Aus der Messung folgt keine Aussage im Sinne von „out-of-sample bestätigt“.

| Lauf | Run | Commit |
|---|---|---|
| Probelauf (technisch, 600 Segmente, nicht ausgewertet) | 37524852463 | – |
| DEV | 37527592662 | `d05ea7124cc` |
| HOLDOUT | 37534855704 | `ee290dff4a1` |

- Ergebnisse verschlüsselt (Tiingo-Nutzungsrechte).
- Öffentlich sind nur Zählwerte, Anteile, Strukturwerte und Richtungen.
- **Konsistenzprüfung:** Der 1.0-Vergleichslauf ist im selben Lauf identisch mit der eingefrorenen 2A-Simulation (`equivalentTo2A: true`). Er ergibt exakt die Trade-Zahlen der 2A-Messung: DEV 650, HOLDOUT 229.

### 7.1 Kennzahlen und Richtungen

| | DEV | HOLDOUT |
|---|---|---|
| Segmente / mit SEC-Daten | 9.048 / 6.405 | 5.218 / 3.875 |
| Setups / Titel mit Setup | 17.072 / 1.342 | 7.858 / 699 |
| Ausgelöste Signale | 2.075 | 937 |
| Portfolio-Trades 1.1 (1.0) | 670 (650) | 206 (229) |
| CAGR 1.1 gegen SPY | **darunter** | **darunter** |
| Max Drawdown 1.1 gegen SPY | kleiner | kleiner |
| Signale gegen SPY, gleiche Haltedauer (Mittel) | darunter | darüber (Survivorship-Verzerrung, siehe Phase-2A-Bericht) |
| Branche bekannt (Setups) | 16.884 / 17.072 | 7.611 / 7.858 |
| Ergebnisdaten vorhanden (Trades) | 659 / 670 | 206 / 206 |

## 8. Diagnose: Warum entsteht das Ergebnis?

Das ist Diagnose, keine Optimierung. Keine Regel wird geändert.

### 8.1 Exposure und Bargeld (Portfolio)

| | DEV 1.1 | DEV 1.0 | HOLDOUT 1.1 | HOLDOUT 1.0 |
|---|---|---|---|---|
| Ø Gross Exposure | 36,3 % | 48,5 % | 27,6 % | 34,5 % |
| Median Exposure | 27,5 % | 50,0 % | 25,1 % | 38,8 % |
| Zeit < 25 % investiert | 40,3 % | 12,0 % | 49,5 % | 37,7 % |
| Zeit 25–50 % | 34,6 % | 37,5 % | 30,7 % | 23,3 % |
| Zeit 50–75 % | 15,3 % | 38,7 % | 10,2 % | 31,0 % |
| Zeit 75–100 % | 9,8 % | 11,8 % | 9,6 % | 8,0 % |
| Zeit praktisch voll investiert (≥ 95 %) | 4,1 % | 4,5 % | 4,2 % | 2,1 % |
| Zeit ganz ohne Position | 5,0 % | 4,4 % | 30,3 % | 31,2 % |
| Ø / Median Positionen | 4,8 / 5 | 4,8 / 5 | 3,7 / 4 | 3,0 / 3 |
| Ø Positionsgröße | 8,5 % | 11,0 % | 7,7 % | 12,5 % |
| Ø Bargeldanteil | 63,7 % | 51,5 % | 72,4 % | 65,5 % |
| Tage in der Startstufe | 79,6 % | 78,5 % | 84,4 % | 87,0 % |

**Bargeld nach Grund** (Anteil am gesamten Bargeld; dominante Bindung je Tag, `diagnostics.mjs#classifyCashDay`):

| Grund | DEV 1.1 | HOLDOUT 1.1 |
|---|---|---|
| fehlende Signale (kein Setup / nicht ausgelöst) | 20,1 % (9,7 + 10,4) | 50,1 % (44,2 + 5,9) |
| Start-Exposure-Regel (25 % / 5 %) | **69,6 %** | **41,7 %** |
| Positionsgrenzen (Zahl, 25 %-Kappung, Obergrenze) | 2,6 % | 1,6 % |
| Risiko (1,25 % je Trade) | 0,3 % | 0,1 % |
| sonstige Regeln (Finanzierung zum Vortag, Haltebestand, neue Basis) | 7,4 % | 6,5 % |

**Befund:**
- Das Portfolio steht an **80–84 % der Tage in der Startstufe**.
- Grund ist der Stufenwechsel nach **einem einzelnen** Trade: Rückkehr in die Startstufe nach jedem Verlust-Trade. Rund drei Viertel der Ausstiege sind Anfangsstops (8.3), und der Wechsel ist eine **VU-Formalisierung**, keine Minervini-Zahl.
- Die Startstufe selbst (25 % / 5 %) ist dagegen primär belegt.
- In DEV erklärt diese Kombination den größten Teil des Bargelds. In HOLDOUT kommen fehlende Signale hinzu: 30 % der Tage ohne Position, 2008/09 kaum Setups.

### 8.2 Signalqualität (ohne Portfolio)

| | DEV | HOLDOUT |
|---|---|---|
| Setups → Signale → Trades | 17.072 → 2.075 → 670 | 7.858 → 937 → 206 |
| Vorwärts 21 Tage gegen SPY (Mittel / Median; Anteil über SPY) | darunter / darunter; 46 % | darüber / darüber; 52 % |
| Vorwärts 63 Tage | darunter / darunter; 45 % | darunter / darunter; 48 % |
| Vorwärts 126 Tage | darunter / darunter; 45 % | darüber / darunter; 47 % |
| Gleiche Haltedauer wie die Exit-Regeln (Mittel) | darunter | darüber |

MFE, MAE und Renditehöhen sind verschlüsselt abgelegt.

**Befund:** Es liegt **ein SIGNAL-PROBLEM vor, nicht nur ein Portfolio- oder Exposure-Problem.**
- Auch ohne Kapitalgrenze liegen die ausgelösten Signale in DEV bei allen Horizonten im Mittel und im Median unter SPY.
- Weniger als die Hälfte der Signale schlägt SPY.
- In HOLDOUT ist das Bild gemischt, nahe 50 %.
- Die niedrige Exposure verstärkt den Abstand zu SPY, verursacht ihn aber nicht allein.

### 8.3 Exit-Diagnose

Abgeschlossene Portfolio-Ausstiege 1.1. Gezählt wird das Hoch innerhalb von 252 Sitzungen nach dem Ausstieg, gegen den Auslösekurs vor Slippage.

| | DEV n | ≥ +25 % über Exit | ≥ +50 % | Verdoppler | HOLDOUT n | ≥ +25 % | ≥ +50 % | Verdoppler |
|---|---|---|---|---|---|---|---|---|
| alle | 655 | 367 (56 %) | 191 (29 %) | 55 (8,4 %) | 200 | 104 (52 %) | 51 (26 %) | 13 (6,5 %) |
| MR-RSK-01 Anfangsstop am technischen Punkt (**ORIGINAL_INTERPRETATION**; Belegstärke MEDIUM) | 485 (74 %) | 272 (56 %) | 144 | 39 | 141 (71 %) | 75 (53 %) | 36 | 10 |
| MR-EXIT-03 Nachziehen auf 50 % des Buchgewinns (**VU_FORMALIZATION**) | 168 (26 %) | 93 (55 %) | 47 | 16 | 59 (30 %) | 29 (49 %) | 15 | 3 |
| MR-RSK-02 10-%-Höchstverlust (ORIGINAL) | 2 | 2 | 0 | 0 | 0 | – | – | – |

- Der Teilverkauf bei 3R (MR-EXIT-02; Auslöser VU_FORMALIZATION, Hälfte ORIGINAL) ist nie Endausstieg.
- Der Einstand (MR-EXIT-01, ORIGINAL) tritt nie als Endausstieg auf: Das Nachziehen (MR-EXIT-03) hebt ab demselben 3R-Ereignis den Stop mindestens auf den Einstand und übernimmt damit die Kennung.
- Alle ausgelösten Signale ohne Kapitalgrenze zeigen dasselbe Bild:
  - DEV: 2.031 Ausstiege, 52 % später ≥ +25 % über dem Schlusskurs am Ausstiegstag.
  - HOLDOUT: 915 Ausstiege, 47 %.

**Befund:**
- Drei Viertel der Ausstiege kommen vom **Anfangsstop**, einer belegten Minervini-Regel, die hier als Interpretation umgesetzt ist.
- Gut die Hälfte der so beendeten Titel lag innerhalb eines Jahres irgendwann 25 % über dem Stopkurs.
- Die **VU-Formalisierung des Nachziehens** zeigt dasselbe Muster bei rund einem Viertel der Ausstiege.

**Einschränkung:** Es gibt keine Vergleichsbasis. Volatile Wachstumswerte erreichen +25 % innerhalb eines Jahres auch ohne jeden Bezug zur Methode häufig. Daraus folgt **kein** Nachweis von „Exit-Destruction“ und keine Exit-Änderung.

Wenn Gewinner abgeschnitten werden, dann überwiegend durch die belegte Stop-Regel. Der Anteil der VU-Formalisierung ist kleiner und zeigt kein anderes Muster.

### 8.4 Vergleich 1.0.0 gegen 1.1.0 (nur diagnostisch)

| | DEV | HOLDOUT |
|---|---|---|
| Signale | identisch (2.075) | identisch (937) |
| Trades 1.0 → 1.1 | 650 → 670 | 229 → 206 |
| Ø Exposure 1.0 → 1.1 | 48,5 % → 36,3 % | 34,5 % → 27,6 % |
| Ø Positionsgröße | 11,0 % → 8,5 % | 12,5 % → 7,7 % |
| Ø Positionen | 4,8 → 4,8 | 3,0 → 3,7 |
| CAGR 1.1 gegen 1.0 | niedriger | niedriger |
| Max Drawdown 1.1 gegen 1.0 | kleiner | kleiner |
| Volatilität 1.1 gegen 1.0 | niedriger | niedriger |

**Wirkung der quellengetreueren Portfolioregel:**
- weniger Kapital im Markt bei gleicher Signalauswahl;
- kleinere Positionen;
- geringeres Risiko und geringerer Ertrag in beiden Zeiträumen.

Das ist keine Bewertung („1.1 ist besser/schlechter“). Die Fidelity-Entscheidung für 1.1 beruht allein auf der Quelle.

## 9. Replication-Claim endgültig

**Nein.** Das R15-Hard-Gate verlangt HIGH in Entry, Exit, Sizing, Portfolio, Risk und Fundamental. Alle stehen auf LOW. Es wirkt keine FOREIGN_RULE und keine UNRESOLVED-Regel.

- Die Engine heißt `minervini-adaptation-1.1.0`.
- Es gibt **keine Phase 2C**, deren einziges Ziel das Wort „Replication“ wäre.

## 10. Antworten auf die 17 Fragen (Phase-2B-Auftrag)

1. **Welche Quellen wurden verbessert?**
   - Vier eigene X-Beiträge kamen hinzu: Exposure 2022, RS-Praxis 2021, Quartalszahlen 2024, Pyramidisieren 2018.
   - Zwei amtliche Quellen kamen hinzu: 8-K Item 2.02 und Einreichungsköpfe.
   - Jede Quelle trägt jetzt Zugangsstufe und Ära.
2. **Welche Regeln bleiben MEDIUM/LOW?**
   - 49 von 57 kanonischen Regeln haben Belegstärke MEDIUM.
   - Regel-Fidelity HIGH haben nur MR-SIZ-01, MR-RSK-03 und MR-PIT-01.
3. **Welche Quellenkonflikte gibt es?** CF-01 … CF-12 im Konfliktregister.
4. **Welche Ära bildet die Engine ab?** SEPA-PUBLISHED-2013-2022.
5. **Welche neuen Daten wurden erschlossen?** 8-K-Ergebnistermine und SIC zum damaligen Stand (Abschnitt 4).
6. **Was liefert 8-K?** Vergangene Termine, bekannt ab dem Folgehandelstag; nicht den kommenden Termin.
7. **Was liefert 13F?** Für diese Methode nichts. Nicht gebaut; Klasse B.
8. **Was liefert SIC?** Die Branche zum damaligen Stand, nur als Protokoll. Andere Taxonomie als Minervini.
9. **Welche Margen sind belastbar?** Brutto-, operative und Nettomarge als Erstmeldung zum damaligen Stand, mit Regressionstests.
10. **Welche Lücken bleiben?** Abschnitt 4.1, Klasse C.
11. **Was wurde implementiert?** MR-PF-02 Startstufe (wirkend); MR-SEPA-12 als Protokoll.
12. **Warum gehören diese Änderungen methodisch hinein?** Primärbeleg innerhalb der Ära; kein Widerspruch zum Buch (Abschnitt 3).
13. **Wie verändert sich die Fidelity?** Nur auf Regelebene; die Bereiche bleiben gleich (Abschnitt 2).
14. **Gibt es weiterhin VU-Formalisierungen?** Ja, 17 Parameter, darunter der Stufenwechsel, die RS-Definition und die SIC-Ebenen. Alle sind ausgewiesen.
15. **Darf die Engine Replication heißen?** Nein (Abschnitt 9).
16. **Welche Einschränkungen bleiben?**
    - Bücher nicht im Volltext; Beiträge nur über den Suchindex.
    - Diskretionäre Teile nicht formalisiert.
    - Gesehene Daten.
    - CIK-Lücken.
17. **Was wäre für höhere Fidelity nötig?**
    - Volltext der Bücher;
    - direkter Abruf der Beiträge;
    - lizenzierte Schätzungsdaten;
    - Ergebniskalender;
    - Intraday-Volumen;
    - öffentliche Zahlen Minervinis zu Zeitstop, Zukäufen und Stufenübergängen.

## 11. Tests

Vor dem PR alle grün:
- vollständige Supertrader-Suite;
- Gate A (`guard-protected-paths.mjs`);
- Test-Isolation;
- Freeze 2A und 1.1 (`--check`);
- `build-rulebook.mjs --check`, `artifacts.mjs --check`.

Abgedeckt sind unter anderem:
- Quellenprovenienz (MR11-T-SOURCE-PROVENANCE, MR11-T-ERA);
- Datenabdeckung (MR11-T-MEASURE-FREEZE);
- Konsistenz von Messung und Freeze;
- keine versteckten Defaults (MR11-T-NO-HIDDEN-DEFAULTS).

## 12. STOP

Phase 2B und Minervini sind abgeschlossen:
- kein Weinstein, Darvas oder Turtle;
- Kullamägi unverändert;
- kein Live-Schalten;
- keine Phase 2C;
- keine Optimierung.

Der PR wird geöffnet, aber **nicht** gemergt. Über den nächsten Supertrader wird separat entschieden.
