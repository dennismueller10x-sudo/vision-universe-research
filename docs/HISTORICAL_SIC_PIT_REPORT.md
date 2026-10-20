# Historische Branchenklassifikation (PIT-SIC, SEC EDGAR) – Abschlussbericht

Stand: 20. Oktober 2026. Basis: `main` @ `c64fb4aaf`.

Maschinenlesbar:
- `docs/historical-sic/INVENTORY.json` (Bestandsaufnahme)
- `docs/historical-sic/SOURCE_EVIDENCE.json` (Quellenbelege)
- `docs/historical-sic/COVERAGE.json` (Coverage)
- `quant/data/sec/sic-history/index.json` (Datensatz)

## Kurzfassung

- **Historische SIC ist aus offiziellen SEC-Quellen belegbar.**
  - Filing-Header halten die SIC zum Einreichungszeitpunkt fest.
  - Die Financial Statement Data Sets (FSDS) tun das ebenfalls, ab 2009, mit einem nachgewiesenen Fehlerfenster.
  - Die Submissions-API liefert nur die heutige SIC.
- **Datenbasis:**
  - 17.282 Emittenten (CIK), 446.074 Beobachtungen, 2.678 beobachtete SIC-Wechsel zwischen Codes.
  - Alle Beobachtungen sind hash-gepinnt und aus Rohdaten byte-gleich reproduzierbar.
- **Abfrage:** `core/industry-classification.js#getIndustryClassification(cik, asOf)`.
  - Kein Lookahead: Datums-`asOf` endet um 16:00 ET.
  - Kein Rückgriff auf die heutige SIC; ein unbekannter Zustand bleibt `UNKNOWN`.
- **Turtle und Weinstein:** Ein Adapter ist vorbereitet, aber nicht aktiviert. `TUR-SF-LIMIT-CORR` und `WEIN-SF-GROUP` bleiben `DATA_BLOCKED`, bis der Owner die SIC-Ebenen, die Altersgrenze und die Konstruktion des Gruppencharts entschieden hat.

## 1. Welche offiziellen SEC-Quellen liefern historisch belegbare SIC-Daten?

| Quelle | SIC | Zeitstempel | Belegt durch |
|---|---|---|---|
| **Filing-Header** `Archives/edgar/data/<cik>/<acc>/<acc>.hdr.sgml` | `ASSIGNED-SIC` des Unternehmensblocks zum Einreichungszeitpunkt | `ACCEPTANCE-DATETIME` (Eastern Time, sekundengenau); in alten Filings fehlt sie | Amazon 10-K405 1998: **2731** (Buchverlag), heute 5961 |
| **FSDS `sub.txt`** `files/dera/data/financial-statement-data-sets/<q>.zip` | Readme der SEC: „assigned by the SEC as of the filing date“ | `accepted` (Eastern Time, **auf die Minute gerundet**) | 3.017 Paare mit Headern; außerhalb 2013q3–2014q2 keine Abweichung |

Abruf: Aus den Quartals-ZIPs wird per HTTP-Range nur `sub.txt` gelesen. Das sind 3 Requests und rund 0,5 MB statt ~100 MB je Quartal. Die CRC32 aus dem ZIP-Verzeichnis wird geprüft.

**Befund FSDS-Fehlerfenster.** In 2013q3–2014q2 tragen Zeilen falsche SIC-Werte.
- 233 von 3.017 gepaarten Filings widersprechen dem Header, alle in diesem Fenster (2013q4: 150).
- Der Header zeigt den früheren, stabilen Wert. Der FSDS-Wert kehrt meist nie wieder.
- A-X-A-Ausreißerquote: 2013q4 1,63 %, 2014q1 0,63 %, in den übrigen Quartalen ≤ 0,03 %.
- Folge: Fensterwerte gelten nur, wenn ein Header sie bestätigt oder wenn sie der letzten vertrauenswürdigen früheren Beobachtung gleichen (dann behaupten sie keinen Wechsel).
- Alle 2.565 Fensterwerte, die einen Wechsel behaupteten, wurden per Header geprüft. 37 bleiben unbestätigt und werden verworfen (`quarantine.json`).
- Ohne diese Prüfung wären ~370 der beobachteten SIC-Wechsel Datenfehler gewesen.

## 2. Welche Daten sind nur aktuell?

- `data.sec.gov/submissions` (Feld `sic`): nur der heutige Stammsatz, keine SIC je Filing.
- Die `acceptanceDateTime` dieser API liegt um den UTC-Offset zu spät, etwa `2026-02-06T04:44:31Z` statt `2026-02-05T23:44:31Z` (Header und Indexseite: 18:44:31 ET). Sie wird nicht verwendet.
- Die SEC-SIC-Liste liefert nur die heutigen Beschreibungstexte.
- Im Repository war vor diesem Auftrag jede gespeicherte SIC aktuell, ohne Wirksamkeitsdatum. Betroffen sind:
  - `quant/data/fundamentals/issuers`
  - `sic-peer-taxonomy-v1` (`CURRENT_ONLY`)
  - `vorsorge/data/sources/sec-sic.json`
  - Supertrader `sicDivision`
  - Factor-Evidence-Peers

  Details: `INVENTORY.json`.

## 3. Welche historischen Zeiträume lassen sich zuverlässig abdecken?

- **Ab 2009q1:** alle XBRL-Einreicher über FSDS, also 10-K, 10-Q, 20-F, 40-F, 6-K und weitere, über 71 Quartale bis 2026q3.
  - Im Fenster 2013q3–2014q2 nur header-bestätigt.
  - Auslandsemittenten erst mit ihrer XBRL-Pflicht (TSMC: erstes 20-F in FSDS 2018).
- **Vor 2009 und Lücken davor:** Filing-Header, gezielt abgerufen. Ein Beispiel ist Amazon 1998/1999; dazu kommt der Lückenschluss für das Produktuniversum (Abschnitt 8).
- **Präzision von `knownAt`:**
  - Header mit Acceptance: auf die Sekunde.
  - FSDS: Ende der gerundeten Minute.
  - Header ohne Acceptance (ältere Filings): Ende des späteren Tags aus Einreichungsdatum und Header-Erzeugungstag. Amazon 1999: eingereicht 05.03., Header 08.03., sichtbar ab 09.03.
- **Zeitliche Gültigkeit:** Belegt ist nur der Zustand zum Zeitpunkt eines Filings. Dazwischen gilt `INFERRED_INTERVAL`. Die SEC kann eine SIC ändern, ohne dass es öffentlich sichtbar wird; ein Wechsel liegt irgendwo zwischen zwei Beobachtungen (`changeWindowAfter`).

## 4. Welche Unternehmen sind eindeutig zuordenbar?

- Die Identität läuft ausschließlich über die **CIK** (`iss_cik_<10>`). Ticker und Firmennamen werden nicht abgeglichen.
- **Produktuniversum:**
  - 6.461 von 7.809 Instrumenten tragen eine CIK, 5.481 verschiedene.
  - Die CIK stammt aus der *heutigen* SEC-Tickerliste und ist deshalb nur ab `firstTradeDate` belegt.
  - Davor und ohne CIK (1.348 Instrumente) gilt `IDENTITY_HOLD`.
- **Supertrader-Snapshot:** Die CIK je Segment kommt aus `seg.fund.cik` (`validation/sec-pit.mjs`, Listing-Fenster-Prüfung), begrenzt auf das Segmentfenster.
- **Abgedeckte Fälle (alle getestet):**

  | Fall | Behandlung |
  |---|---|
  | Mehrere Gattungen (GOOG/GOOGL) | eine CIK, eine Klassifikation |
  | ADR (TSMC) | Emittenten-CIK; keine Depotbank-CIK |
  | Ticker- und Namenswechsel (FB → META) | CIK und SIC bleiben |
  | Fusion (Senti Biosciences, De-SPAC) | dieselbe CIK wechselt 6770 → 2836 |
  | Mehrdeutigkeit (zwei CIKs im Fenster) | `IDENTITY_HOLD AMBIGUOUS_CIK` |
  | Co-Registranten im Header | nur der Block mit genau dieser CIK |

## 5. Welche PIT-Lücken bleiben?

- Zeitpunkte vor der ersten Beobachtung (`UNKNOWN_BEFORE_FIRST_OBSERVATION`): 2,34 % der aufgelösten Punkte im Produktuniversum nach dem Lückenschluss.
- Instrumente ohne CIK: 17 % der Instrumente, 12,5 % der Punkte.
- Delistete Titel sind nicht im Produktuniversum. Ihre CIK kennt nur der private Snapshot; die Basis enthält aber alle 17.176 FSDS-Emittenten ab 2009.
- Der tatsächliche Wechselzeitpunkt zwischen zwei Filings ist unbekannt.
- Vor 2009 liegen nur gezielt abgerufene Header vor.

## 6. Wie funktioniert die neue Pipeline?

`scripts/quant/cli.py sic-history <aktion>` (Modul `scripts/quant/sec/sic_history.py`). Netzzugriffe laufen ausschließlich über `http_client.py`. Dort sind deklarierter User-Agent, 5 req/s, Backoff und die neue Range-Methode mit 206-Pflicht umgesetzt.

| Aktion | tut |
|---|---|
| `fetch-fsds` | neue Quartale holen; bekannte werden übersprungen; `--refresh` erkennt Neuveröffentlichungen per Hash |
| `fetch-headers --targets` | Header gezielt holen (parallel unter dem gemeinsamen Rate-Limit) |
| `plan-gapfill --gaps` | aus Submissions-*Listen* (nur Accession/Form/Datum) Header-Ziele vor der ersten Beobachtung wählen |
| `fetch-codes` | SEC-SIC-Liste (Beschreibungen) |
| `hydrate` | fehlende Rohdaten der gepinnten Quellen nachladen; bricht bei Hash-Abweichung ab |
| `build` | offline: Manifest + Rohspeicher → `quant/data/sec/sic-history` |
| `verify` | Rebuild in ein Temp-Verzeichnis, byte-gleich mit dem Stand im Repository |

Ablauf:
1. Der Rohspeicher (`$SEC_CACHE_DIR/sic-history/raw`) wird nie committet.
2. Das Manifest pinnt jede Quelle (sha256, CRC32, URL, `observedAt`) und protokolliert jeden Lauf (Requests, Budget, User-Agent).
3. Normalisierung:
   - CIK 10-stellig;
   - SIC 4-stellig; leer/`0000` wird zu `null` (`NO_SIC_ASSIGNED`);
   - Eastern Time → UTC (Sommerzeit über `zoneinfo`);
   - dieselbe Accession aus FSDS und Header: Der Header gewinnt, eine Abweichung kommt in die Quarantäne.
4. Widersprüchliche SIC zum selben `knownAt` → `CONFLICT`.

Ausgabe:
- 1.000 gzip-Shards `issuers/<CIK-Endung>.json.gz` mit Beobachtungen `[knownAt, sic, accession, form, source, precision, flag]` und Läufen gleicher SIC;
- `index.json`;
- `quarantine.json`;
- `sic-codes.json`.

Workflow: `.github/workflows/sec-sic-history.yml`.
- Nur manuell; ADR-005 (Ref-Checkout, Eingaben über `env`, `push-with-retry.sh`, Concurrency mit `ref_name`).
- `verify` prüft den Rebuild; `refresh` holt neue Quartale und committet.

Registriert ist der Datensatz als `industryClassificationHistory` in `core/registry/domains.json` (`repositoryOnly`, kein Frischevertrag).

## 7. Wie wird Lookahead ausgeschlossen?

1. Jede Beobachtung trägt `knownAt`, den frühesten belegten Zeitpunkt der Veröffentlichung, immer konservativ gerundet (Minute → Ende der Minute, Tag → Ende des Tags).
2. `getIndustryClassification` sieht nur Beobachtungen mit `knownAt ≤ cutoff`. Ein `asOf` als Datum endet um **16:00 America/New_York**. Ein Filing nach Handelsschluss zählt erst ab dem nächsten Datum (Dionics 10-Q, angenommen 16:00:31 ET; Amazon 10-K, angenommen 18:44:31 ET).
3. Turtle fragt mit dem Datum der *vorherigen* Sitzung (`methods/turtle.mjs`).
4. Die heutige SIC ist für die Abfrage nicht erreichbar. Fehlende Information bleibt `UNKNOWN`.
5. Die Rückblick-Sicht `history()` ist als `HINDSIGHT_AUDIT_ONLY` gekennzeichnet und wird nirgends für Entscheidungen verwendet.
6. Tests:
   - Das Ergebnis zu *t* ist identisch mit dem Ergebnis auf dem bei *t* abgeschnittenen Datensatz, synthetisch und auf einem echten Shard über fünf Stichtage.
   - Grenzfälle eine Sekunde vor und nach der Annahme.

## 8. Welche Coverage wurde tatsächlich erreicht?

Universum: Produktuniversum (`quant/data/universe/instruments`, 7.809 Instrumente). Fenster: 2016-01 bis 2026-09, Monatsende. Gezählt wird nur, solange das Listing gehandelt wurde.

| Kennzahl | Wert |
|---|---|
| untersuchte Instrumente | 7.809 |
| davon mit CIK (eindeutig auflösbar ab `firstTradeDate`) | 6.461 (82,7 %), 5.481 CIKs, 618 CIKs mit mehreren Listings |
| CIKs mit Beobachtungen in der SIC-Basis | 5.478 von 5.481 (99,95 %) |
| historische SIC-Beobachtungen dieser CIKs | 206.890 (gesamt 446.074 für 17.282 Emittenten) |
| beobachtete SIC-Wechsel zwischen Codes | 886 bei 758 Emittenten, davon 738 im Fenster 2016–2026 |
| Punkte (Listing × Monatsende, solange gehandelt) | 626.400 |
| ambige Identität / ohne CIK (`IDENTITY_HOLD`) | 12,52 % (alle `NO_CIK`; kein `AMBIGUOUS_CIK`) |
| SIC beobachtet, Anteil aller Punkte | **83,68 %** |
| SIC beobachtet, Anteil der aufgelösten Punkte | **95,65 %** |
| SEC hatte keine SIC zugewiesen (`NO_SIC_ASSIGNED`) | 1,95 % der aufgelösten Punkte |
| unbekannt vor der ersten Beobachtung | 2,34 % der aufgelösten Punkte |
| CIK ohne jede Beobachtung | 0,06 % |
| Widerspruch (`CONFLICT`) | 0 |
| **echte Coverage**: letzte Beobachtung ≤ 100 Tage | 451.674 Punkte = 72,1 % aller Punkte (86,2 % der beobachteten) |
| **extrapoliert**: 101–200 / 201–400 / > 400 Tage | 8,9 % / 4,6 % / 0,4 % der beobachteten (zusammen 11,6 % aller Punkte) |
| für Turtle datenseitig verwendbar | 83,68 % der Punkte; Bindung `DATA_BLOCKED` |
| für Weinstein: Zugehörigkeit / Gruppen-Stage | 83,68 % / 0 % |

Der Header-Lückenschluss hob den beobachteten Anteil der aufgelösten Punkte von 92,5 % auf 95,7 % und senkte „vor erster Beobachtung“ von 5,4 % auf 2,3 %.

- **Echte Coverage:** Die letzte Beobachtung ist höchstens 100 Tage alt (laufender Berichtszyklus).
- **Extrapoliert:** Die letzte Beobachtung ist älter und wird als `INFERRED_INTERVAL` fortgeschrieben.

Die Altersklassen sind Berichtsklassen, keine Entscheidungsgrenzen. Messung: `node scripts/quant/sic-history-coverage.mjs --out docs/historical-sic/COVERAGE.json`.

Nicht gemessen ist der Supertrader-Snapshot selbst (privat, R2). Die Messung dort ist Teil der Freigabeschritte (Abschnitt 15).

## 9. Welche Turtle-Limits können damit technisch unterstützt werden?

- `TUR-LIMIT6` und `TUR-LIMIT10` sind technisch unterstützt:
  - `makeTurtleGroupsOf` liefert `groupsOf(securityId, priorSessionDate)` für die unveränderte Engine.
  - Fehlende Gruppen zählt der Adapter mit Grund, die Engine meldet `ENFORCED_PARTIAL_GROUP_COVERAGE`.
  - Der Adapter-Test zeigt, dass beide Limits greifen und dass `runTurtle` ohne Adapter bitgleich bleibt.
- Fachlich bleiben sie gesperrt. Die Originalregel spricht von eng und lose *korrelierten Futures-Märkten* (W-TUR, PDF 10). Eine gleiche SIC ist keine gemessene Kurskorrelation. Keine SIC-Ebene ist durch eine Quelle als „eng“ oder „lose“ gedeckt.
- `TUR-RANK` (gleichzeitige Gruppensignale) braucht dieselbe Gruppendefinition und ist nicht Teil dieses Auftrags.

## 10. Welche zusätzlichen Owner-Entscheidungen sind notwendig?

1. Die SIC-Ebene für TUR-LIMIT6 („eng“) und TUR-LIMIT10 („lose“): 4-stellig, 3-stellig oder 2-stellig. Alternativ eine gemessene Kurskorrelation statt SIC; das wäre ein eigener Datenvertrag.
2. `maxAgeDays`: ab welchem Alter der letzten SIC-Beobachtung die Gruppe als unbekannt gilt.
3. Der Umgang mit unbekannter Gruppe. Heute (Engine) greifen dann nur LIMIT4 und LIMIT12. Das wird gezählt und ausgewiesen, aber nicht blockiert.
4. Weinstein:
   - die Gruppenebene;
   - die Konstruktion des Gruppencharts (Gewichtung, Mitgliederwechsel, Mindestzahl);
   - ob der Gruppenchart aus dem Snapshot gebildet werden darf.
5. Ein Zeitplan für `sec-sic-history.yml` (heute nur manuell), etwa quartalsweise nach der FSDS-Veröffentlichung.
6. Das eigene Speicherbudget der SIC-Historie (12 MB) in `test_workflows.py`, nach dem Präzedenzfall `consumer`.

## 11. Welche Weinstein-Regeln profitieren davon?

| Bestandteil | Stand |
|---|---|
| Branchenzugehörigkeit (WEIN-GROUP, WEIN-GROUP2, WEIN-DIVERS3, WEIN-SH-GRP) | **mechanisch unterstützt** über `makeWeinsteinGroupMembership` (`groupOf`, `rosterAt`) bei vom Owner gewählter Ebene |
| Branchenrelative Stärke, Gruppen-Stage (MA30w des Gruppencharts) | `DATA_BLOCKED`: braucht einen Gruppenchart |
| Branchenranking, Marktführerschaft, qualitative Gruppenbewertung | nicht mechanisch, nicht umgesetzt |

Datenvertrag für den Gruppenchart (offen):

```
groupIndex(groupKey, level, date) -> { value, members, method }
```

- Mitglieder: `rosterAt(ids, date)`, PIT, ohne Lookahead.
- Kurse: Snapshot-Tagesbalken (split-adjustiert, ADR-002).
- Gewichtung und Mindestzahl Mitglieder: Owner.
- Die Wochenbalken der Gruppe folgen den Konventionen von `methods/weinstein.mjs`.

## 12. Welche Datenlücken bleiben trotz historischer SIC?

- Keine Korrelationsmessung: SIC beschreibt das Geschäft des Registranten, nicht das Kursverhalten.
- Kein Gruppenchart und kein Gruppen-Stage.
- SIC ist grob und wird von der SEC vergeben. Konglomerate und Holdings stecken teils in Sammelcodes (6770 Blank Checks, 6799, 6199).
- ETFs, Fonds und Instrumente ohne CIK haben keine Klassifikation.
- Delistete Titel sind nur über den privaten Snapshot zuordenbar.
- Vor 2009 nur gezielte Header; die Abdeckung vor 2009 wurde nicht systematisch erhoben.

## 13. Welche Tests und Reviews wurden bestanden?

| Suite | Ergebnis |
|---|---|
| `scripts/quant/tests/test_sic_history.py` | 27/27 |
| `core/tests/industry-classification.test.mjs` (synthetische Grenzfälle) | 14/14 |
| `core/tests/industry-classification-sec.test.mjs` (echte SEC-Beispiele, Lookahead auf echtem Shard) | 9/9 |
| `scripts/supertrader/tests/sf-industry-groups.test.mjs` | 7/7 |
| `node --test "core/tests/*.test.mjs"` | 205/205 |
| `python3 -m unittest discover -s scripts/quant/tests` | 519/519 |
| `node --test "scripts/supertrader/tests/*.test.mjs"` | 486 Tests, 485 bestanden, 1 übersprungen (bestehender Skip), 0 Fehler (mit Adapter-Branch) |
| `sic-history verify` (Rebuild byte-gleich) | bestanden |
| Supertrader Gate A gegen den Fundament-Branch | bestanden |
| `scripts/quality/check-test-isolation.mjs` | bestanden („keine Produktionsdatei verändert“) |

Abgedeckte Testfälle:
- SIC-Wechsel im Zeitverlauf;
- Filing nach Handelsschluss;
- Abfrage vor der ersten Beobachtung;
- fehlende Metadaten (Acceptance, Filing-Datum, CIK im Header) → Quarantäne;
- widersprüchliche Beobachtungen → `CONFLICT`;
- CIK- und Tickerwechsel;
- mehrere Listings;
- ADR;
- nicht eindeutige Identität;
- unbekannte Intervalle (`INFERRED_INTERVAL`, `STALE` nur auf Grenze des Aufrufers);
- Lookahead;
- deterministischer Rebuild;
- Hash-Pin-Bruch;
- Neuveröffentlichung;
- Budgetabbruch;
- unveränderte Turtle-Ergebnisse ohne Aktivierung.

Review nach den acht Prüfdimensionen: Abschnitt 16.

## 14. Welche Draft-PRs wurden erstellt?

| PR | Inhalt | Basis |
|---|---|---|
| [#811](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/811) (Draft) | A–C: Quellenprüfung und Belege, PIT-Datenmodell, Ingest und Validierung, Datensatz, PIT-API in `core`, Workflow, Registry, Coverage, dieser Bericht | `main` |
| [#812](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/812) (Draft) | D: Turtle-/Weinstein-Adapter und Abnahmetests, Vertrag fortgeschrieben; nur Supertrader-Pfade (Gate A) | #811 |

A–C sind ein PR: Ein Ingest ohne API oder eine API ohne Daten wäre nicht testbar. D ist wegen Gate A getrennt und gestapelt.

## 15. Konkrete Schritte für die nächste Supertrader-Freigabe

1. Owner entscheidet die Punkte aus Abschnitt 10 (1–4).
2. PR „Turtle-Gruppen aktivieren“, nur Supertrader-Pfade:
   - `run-research.mjs` erhält `--industry-groups <decision-ref>`;
   - der Runner lädt die SIC-Basis für die CIKs des Snapshots;
   - die Engine-Version bleibt;
   - die Statuswechsel in `STRATEGY-SOURCE-CONTRACTS.json` und `STRATEGY-DATA-DEPENDENCIES.json` werden durch den Erzeuger neu gebaut.
3. Vorher/Nachher-Lauf auf `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`: Ledger und Kennzahlen mit und ohne Gruppen, dazu `correlationGroupMissing` je Grund.
4. Coverage auf den Snapshot-Segmenten messen: Anteil `OBSERVED` je Jahr, delistete Titel getrennt.
5. Weinstein: erst den Gruppenchart-Vertrag entscheiden und bauen, dann WEIN-GROUP als Gate prüfen.

## 16. Review

| Dimension | Prüfung | Befund |
|---|---|---|
| Source Accuracy | 3.017 Header ↔ FSDS-Paare; Indexseite als Gegenprobe; Readme-Definition | FSDS-Fehlerfenster gefunden und neutralisiert; API-Acceptance falsch und deshalb nicht verwendet |
| PIT Integrity | `knownAt` konservativ; 16:00-ET-Schnitt; Abschneide-Test auf echtem Shard; keine heutige SIC erreichbar | keine offenen Befunde |
| Identity Mapping | nur CIK; Fenster aus `firstTradeDate` bzw. Segmentfenster; `AMBIGUOUS_CIK` und `NO_CIK` als Hold | **MEDIUM (offen, dokumentiert):** Die Instrument-CIK ist eine heutige Zuordnung. Recycelte Ticker vor `firstTradeDate` sind abgefangen, Fehler im `firstTradeDate` selbst nicht |
| SEC Access Compliance | User-Agent mit Kontakt; 5 req/s; Backoff; Range statt Bulk; Budgets; Request-Log | 11.775 protokollierte Requests (FSDS 213, Header 8.930, Submissions-Listen 2.631, SIC-Liste 1) plus rund 30 manuelle Stichproben; 0 dauerhafte Ausfälle Requests insgesamt |
| Historical Coverage | Abschnitt 8 | echte und extrapolierte Coverage getrennt |
| Reproducibility | Hash-Pins, `verify` byte-gleich, `hydrate` mit Abbruch bei Abweichung | bestanden |
| Supertrader Integration | Adapter ohne Engine-Änderung; Status `DATA_BLOCKED` unverändert; Gate A | bestanden |
| Legacy Isolation | keine bestehende SIC-Quelle verändert; keine Auslieferung (`repositoryOnly`); Supertrader-Suite unverändert | bestanden |

Es gibt keine offenen HIGH- oder CRITICAL-Befunde.
