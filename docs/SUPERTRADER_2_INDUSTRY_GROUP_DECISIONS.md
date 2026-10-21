# Supertrader 2.0 – Branchengruppen: Prüfergebnis Turtle und Entscheidungsvorlage Weinstein

Stand: 20. Oktober 2026. Status: **keine Gruppenebene, keine Gewichtung, keine Korrelationsdefinition festgelegt.** `TUR-SF-LIMIT-CORR` und `WEIN-SF-GROUP` bleiben `DATA_BLOCKED`.

Grundlagen:
- Datenbasis: `docs/HISTORICAL_SIC_PIT_REPORT.md`.
- Adapter: `scripts/supertrader/source-faithful/adapters/industry-groups.mjs` (sf-industry-groups-1.1.0).
- Vertrag: `SUPERTRADER_2_PIT_INDUSTRY_GROUPS_CONTRACT.md`.

## Owner-Vorgaben vom 20.10.2026

| Vorgabe | Umsetzung |
|---|---|
| Keine frei gewählten SIC-Ebenen als Korrelationsdefinition | Der Adapter verlangt `decision.basis = 'SIC_PROXY'` und eine `decision.ref`; ohne beides wirft er `MODEL_ASSUMPTION_REQUIRED`. Es gibt keine Voreinstellung. |
| 100 Tage nur als Coverage-Kennzahl | `maxAgeDays` gehört zur Entscheidung und hat keinen Default. Jede Fortschreibung steht als `carryForwardAssumption` in der Lauf-Diagnose. |
| Fehlende Gruppe ist keine Unabhängigkeit | `missingGroupMeaning: UNKNOWN_NOT_INDEPENDENT`. `conformance(runResult)` meldet immer `ruleConformance: NOT_ESTABLISHED`, mit Gründen und der Zahl der Einstiege mit unbekannter Gruppe. |
| Heutige Ticker-Zuordnung nicht als historische Bestätigung | Jede CIK trägt ihre Evidenzklasse (`IDENTITY_EVIDENCE`). Nur ausdrücklich angenommene Klassen zählen. |

## 1. Turtle TUR-LIMIT6 / TUR-LIMIT10: Ist eine Umsetzung über historische Kurskorrelation quellengedeckt?

**Ergebnis: nein. Die Limits bleiben blockiert.**

Quelle: W-TUR, *The Original Turtle Trading Rules*, gedruckte Seite 16 (PDF 10). Geprüft am 20.10.2026 an der gepinnten Datei (sha256 `cfd448f2…593d4`, identisch mit #709).

> Closely Correlated Markets – For markets that were closely correlated there could be a maximum of 6 Units in one particular direction (i.e. 6 long units or 6 short units). Closely correlated markets include: heating oil and crude oil; gold and silver; Swiss franc and Deutschmark; TBill and Eurodollar, etc.
>
> Loosely Correlated Markets – For loosely correlated markets, there could be a maximum of 10 Units in one particular direction. Loosely correlated markets included: gold and copper; silver and copper, and many grain combinations that the Turtles did not trade because of positions limits.

Was die Quelle festlegt und was nicht:

| Baustein einer Kurskorrelations-Regel | in der Quelle |
|---|---|
| Gruppenbegriff | ja, aber nur über Beispiele benachbarter Futures-Märkte; die Liste endet mit „etc.“ |
| Korrelationsmaß (Pearson auf Renditen, auf Preisen, Rang) | nein |
| Fenster und Frequenz (z. B. 60 / 250 Tage, täglich / wöchentlich) | nein |
| Schwelle für „eng“ und „lose“ | nein |
| Bildung der Gruppen aus paarweisen Werten (Clique, Clustering, Kette) | nein |
| Häufigkeit der Neuberechnung | nein |
| Übertragung auf Einzelaktien | nein; die Quelle handelt Futures |

Eine zeitlich kausale Berechnung ließe sich technisch bauen: Korrelation der Tagesrenditen über ein rollendes Fenster bis zur Vorsitzung, danach Gruppen über eine Schwelle. Sie bräuchte aber mindestens vier frei gewählte Parameter (Maß, Fenster, zwei Schwellen) und eine Gruppenbildung. Keiner davon ist durch W-TUR gedeckt. Nach der Vorgabe „keine frei erfundenen Zuordnungen“ wird sie deshalb **nicht dokumentiert, nicht implementiert und nicht empfohlen**.

Auch die SIC-Ebene bleibt ein Stellvertreter ohne Quellenzahl. Die Beispiele der Quelle sprechen gegen eine Gleichsetzung mit der Branche: Heizöl/Rohöl, Gold/Silber und Franken/D-Mark sind *eng* korreliert, Silber/Kupfer *lose*. Die Grenze verläuft dort entlang des Rohstoffs, nicht entlang einer Branchenklassifikation.

Was offen bleibt, wenn die Limits doch belegt werden sollen. Beides wäre eine eigene Owner-Entscheidung als **deklarierte VU-Modellannahme**, nicht als Originalregel:
- (a) eine SIC-Ebene als Stellvertreter (`basis: SIC_PROXY`), oder
- (b) ein Kurskorrelationsverfahren mit benannten Parametern. Dafür bräuchte der Adapter einen zweiten Gruppenbegriff; den gibt es heute nicht.

## 2. Weinstein: Entscheidungsvorlage Gruppe und Gruppenchart

Regeln (#709, B09):

| Regel | Fundstelle | Modalität | Inhalt |
|---|---|---|---|
| WEIN-GROUP | S. 80 | HARD | keine Long-Käufe in negativer Gruppe; Gruppen-Stage zuerst prüfen |
| WEIN-GROUP2 | S. 80 | CONTEXTUAL | eine gesunde Gruppe genügt; Aktie und Gruppe müssen nicht am selben Stage-2-Punkt stehen |
| WEIN-DIVERS3 | S. 138 | STRONG_PREFERENCE | über mehrere technisch gute Gruppen verteilen |
| WEIN-SH-GRP | S. 233 | STRONG_PREFERENCE | Short: schwache Gruppe unter der MA, RS sinkend |

Die Regeln setzen einen Gruppenchart voraus. Wie er gebildet wird, ist im #709-Extrakt nicht festgehalten.

### 2.1 Gruppenebene

Messung auf dem heutigen Produktuniversum (nur Stammaktien mit CIK, SIC beobachtet zum Stichtag). Das Universum ist überlebensverzerrt; delistete Titel fehlen.

| Ebene | Gruppen | Median Mitglieder | 90 %-Quantil | größte Gruppe | Gruppen < 5 Mitglieder (Anteil der Titel) |
|---|---|---|---|---|---|
| SIC4 (Industry), 2024-06-28 | 388 | 5 | 22 | 2834 Pharma: 438 | 192 (9,4 %) |
| SIC3 (Industry Group), 2024-06-28 | 253 | 6 | 32 | 283: 623 | 97 (5,0 %) |
| SIC2 (Major Group), 2024-06-28 | 69 | 24 | 134 | 28: 724 | 7 (0,3 %) |
| SIC4, 2018-06-29 | 373 | 4 | 15 | 2834: 225 | 219 (16,0 %) |

Abwägung:

| Ebene | dafür | dagegen |
|---|---|---|
| SIC4 | am nächsten an „Branche“ | viele Gruppen zu dünn für einen stabilen Chart; Sammelcodes (2834, 6798 REIT, 6770 Blank Check) |
| SIC3 | Mittelweg | Sammelcodes bleiben |
| SIC2 | stabile Charts | sehr grob (28 = Chemie *und* Pharma); entspricht eher einem Sektor als Weinsteins Gruppe |

Grenzen auf allen Ebenen:
- Die SIC wird von der SEC vergeben, ist selten aktualisiert und für Konglomerate grob.
- Eine externe Branchensystematik (GICS, S&P-Gruppenindizes) wäre lizenzpflichtig und ist ausgeschlossen.

### 2.2 Gruppenchart

| Alternative | Berechnung (zeitlich kausal) | Datenbedarf | Grenzen |
|---|---|---|---|
| **A. Gleichgewichteter Kettenindex** | täglich: Mittel der Tagesrenditen aller Mitglieder laut `rosterAt(ids, Vortag)`; Index verkettet; Wochenbalken nach ISO-Woche wie `methods/weinstein.mjs`; Stage aus der MA30w des Index | nur Snapshot-Tagesbalken (split-adjustiert, ADR-002) und PIT-Mitgliedschaft | kleine Titel zählen gleich viel wie große; dünne Gruppen sind sprunghaft |
| **B. Kapitalisierungsgewichtet** | wie A, Gewicht = Aktienzahl (letzte Meldung ≤ Vortag) × Schlusskurs | zusätzlich PIT-Aktienzahl (SEC `dei:EntityCommonStockSharesOutstanding`, teilweise im privaten SEC-Store) | Lücken in der Aktienzahl; Megacaps dominieren (2834) |
| **C. Gruppenbreite statt Index** | Anteil der Mitglieder, deren eigene Wochen-Stage am Vortag Stage 2 ist (Kursschluss > steigende MA30w) | Snapshot-Balken, bestehende Stage-Logik je Titel | kein Chart im Sinne Weinsteins, sondern eine Ersatzgröße; Schwelle für „gesund“ fehlt |
| **D. Externer Gruppenindex** | veröffentlichte Branchenindizes | lizenzierter Anbieter | ausgeschlossen (keine neuen Provider) |

Zusätzlich offen, für jede Alternative:
- **Mindestzahl Mitglieder**, unter der eine Gruppe als unbekannt gilt. Das ist eine Schwelle ohne Quellenzahl.
- **Mitgliederwechsel:** Ein SIC-Wechsel, ein Listing oder ein Delisting verändert die Gruppe ab dem nächsten Tag. Die Kette verhindert Sprünge.
- **Altersgrenze** der SIC-Beobachtung (`maxAgeDays`).
- **Verwendung:** WEIN-GROUP als Gate oder nur als Evidenz für die manuelle Prüfung. Für Weinstein ist das konsistent mit `MANUAL_REVIEW_SCREEN`.
- **Identitätsbelege:** welche `IDENTITY_EVIDENCE`-Klassen zählen (Abschnitt 3).

Empfehlung zur Reihenfolge, ohne Festlegung:
1. Zuerst als **Evidenz** ausprobieren, nicht als Gate.
2. Alternative A auf SIC3 mit ausgewiesener Mitgliederzahl.
3. Vorher/Nachher auf dem Snapshot.
4. Erst danach über ein Gate entscheiden.

## 3. Identitätsbelege (CIK ↔ Listing)

Herkunft der CIK eines Snapshot-Listings (`validation/sec-pit.mjs`, Feld `how`):

| Klasse | Herkunft | belegt |
|---|---|---|
| `CURRENT_TICKER_MAPPING` (`how = KNOWN`) | heutige Ticker→CIK-Liste `company-names.json`, ohne Fensterprüfung | dass der Ticker **heute** zur CIK gehört; nicht, wem er früher gehörte |
| `NAME_EXACT_XBRL_IN_LISTING_WINDOW` (`how = NAME_MATCH`) | exakter normierter Name aus `cik-lookup-data.txt`, genau ein Kandidat mit XBRL-Werten im Listing-Fenster, sonst verworfen | Name und Berichtsaktivität im Fenster; keine Ähnlichkeitssuche |
| `UNSPECIFIED` | `seg.fund.cik` ohne `how` (`analyze-methods.mjs` reicht `how` heute nicht durch) | nichts über die Herkunft |

Befund:
- Der Adapter 1.0.0 hatte jede `seg.fund.cik` als „SNAPSHOT_SEC_PIT_LISTING_MATCH“ geführt. Für `KNOWN` war das falsch.
- 1.1.0 kennzeichnet die Herkunft. `cikCandidatesFromSegments(segs, secPit)` braucht dafür die sec-pit-Ausgabe; ohne sie gilt `UNSPECIFIED`. Nur Klassen aus `decision.acceptedIdentityEvidence` werden verwendet. Nicht angenommene Fälle werden als `IDENTITY_EVIDENCE_NOT_ACCEPTED` gezählt.

Restrisiko, das sich mit SEC-Daten nicht schließen lässt:
- Die SEC führt keine historische Ticker-Zuordnung. FSDS, Header und Submissions tragen nur den heutigen Ticker.
- Ein recycelter Ticker, den ein *schon vorher meldender* Emittent übernimmt, ist allein aus SEC-Daten nicht erkennbar.
- Abmilderung: Die PIT-API kennt vor der ersten Beobachtung einer CIK keine SIC. Ein neuer Emittent liefert dort `UNKNOWN`, nie eine falsche SIC.

Zu entscheiden:
- welche Klassen gelten;
- ob `KNOWN` nur für Segmente gelten soll, die bis heute dieselbe Notierung sind. Das prüft sec-pit im HOLDOUT-Fenster bereits.

## 4. Was bis zur Freigabe unverändert bleibt

- Turtle- und Weinstein-Engines, der Runner sowie `STRATEGY-SOURCE-CONTRACTS.json` und `STRATEGY-DATA-DEPENDENCIES.json`.
- Keine Live-Aktivierung.
- Der SEC-Workflow bleibt manuell.
