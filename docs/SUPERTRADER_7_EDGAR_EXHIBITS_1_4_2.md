# Supertrader 7.0 – Regelsatz 1.4.2: EDGAR-Exhibits für die 83 V4-D1-Sitzungen

Stand: 25. Oktober 2026. Ergebnis `DIAGNOSTIC_NOT_CERTIFIED`. Maßgeblich ist der **Regelsatz 1.4.3**, Lauf **40214193643**, siehe [Regelsatz 1.4.3](#regelsatz-143-review-von-931). Der Regelsatz 1.4.2 mit Lauf 40206319111 ist eingefroren. Vorgänger und Vorgeschichte: [SUPERTRADER_7_EDGAR_CA_CHECK.md](SUPERTRADER_7_EDGAR_CA_CHECK.md) (1.4.0 und 1.4.1, PR #921).

**Kernergebnis:** Die Exhibits bestätigen **keinen** Split, weder unter 1.4.2 noch unter 1.4.3.
- Gelesen wurden 29 Exhibits aus 51 Einreichungen der 21 Sitzungen mit Dokumentpfad.
- Alle 83 Sitzungen bleiben `UNRESOLVED` und in Quarantäne. Das Overlay ist leer.
- Verbraucht wurden **122 von 600** Anfragen für alle 1.4.2-Läufe zusammen.
- CC-5 wird **nicht** hochgestuft.

## Eigentümerentscheidung (25.10.2026, wörtlich)

> „Ich genehmige die gezielte Erweiterung auf Regelsatz 1.4.2 mit Prüfung der relevanten EDGAR-Exhibits. Beschränke dich auf die noch ungeklärten 83 Sitzungen und unmittelbar erforderliche Belegquellen. Bitte: vorhandene Daten und Caches zuerst nutzen, Anfragen streng budgetieren und drosseln, nur eindeutig belegte Split-Faktoren übernehmen, echte Kursbewegungen nicht nachträglich als Splits klassifizieren, unklare Fälle weiterhin sperren, alle Ergebnisse nachvollziehbar dokumentieren. Vor einem größeren Abrufvolumen oder neuen Kosten erneut Freigabe einholen."

Die Prüfung hält folgende Grenzen ein:
- keine bezahlte Quelle und kein neuer Anbieter;
- keine Live-Aktivierung, keine Orders;
- keine UI-Änderung, kein Merge;
- `quant/data` und der Snapshot bleiben unverändert.

## Regelsatz 1.4.3 (Review von #931)

**Grund:** Ein unabhängiges Review von #931 hat zwei Parser-Befunde gefunden, an denen die Belastbarkeit des Exhibit-Ergebnisses hängt. Es gab keinen CRITICAL- und keinen HIGH-Befund.
- Die Änderung folgt aus dem Review, **nicht** aus einem Ergebnis: Lauf 40206319111 hatte nichts bestätigt.
- Hash `5fba098cb0a9f8916d868105cf0dd5b9de58c3a33d4c61f1331544b1c8ef359a`, vor jedem Lauf festgeschrieben.
- 1.4.2 liegt eingefroren in [`ca-edgar-1.4.2.mjs`](../scripts/supertrader/source-faithful/integrity/ca-edgar-1.4.2.mjs) (`2130be8e…`); 1.4.1, 1.4.0 und 1.3.0 sind unverändert.
- Je Befund gibt es synthetische Tests (SF7-REVIEW143-F1, -F2, -F3, -M1 sowie SF7-EDGAR-LEDGER und SF7-EDGAR-PLAN).

| Befund | Schwere | Behebung in 1.4.3 |
|---|---|---|
| F1: falsch negativ beim Satzungswortlaut | MEDIUM | Erkannt werden jetzt: „each ten (10) shares of Common Stock, par value $0.001 per share, … shall be combined into one (1) share“ (das Muster reicht jetzt über 300 Zeichen und über Dezimalpunkte); „every N shares … issued and outstanding … automatically reclassified and combined into one share“; „converted into one (1) share“ neben einem Reverse-Split. „converted into“ gilt nicht mehr für sich allein als Wandlungswortlaut. Fusionswortlaut sowie convertible / conversion / warrant / exercise / preferred stock sperren weiter |
| F2: falsch positiv bei Ermessenswortlaut | MEDIUM | Ein Satz mit Ermessens-, Bedingungs- oder Ermächtigungswortlaut (may, could, would, in its sole discretion, authorized / authority, if effected, if approved, proposal, to approve, intends / plans to, subject to … approval) trägt nie einen Faktor. Nur solche Sätze ergeben `DOCUMENT_DISCRETIONARY_ONLY`. Vollzogenes („effected“, „became effective“, „filed a certificate of amendment … effective“) besteht. Der Monat „May“ ist kein Modalwort |
| F3 (LOW 6): Exhibit-Typ aus der ersten `EX-`-Zelle | LOW | Der Typ kommt aus der Spalte „Type“, gefunden über die Kopfzeile. Ohne Kopfzeile gibt es kein Exhibit, und die Sitzung ist unvollständig (`EXHIBIT_INDEX_UNPARSED`) |
| M1: die 1.4.2-Probe lief auf DQ-K3-Sitzungen außerhalb der 83 | MEDIUM | Dokumente und Exhibits nur noch für K5-Sitzungen, in jedem Modus |
| M2: Ledger nicht sicher gegen gleichzeitige Läufe | MEDIUM | Eine feste Concurrency-Gruppe `supertrader-sf7-ca-edgar-ledger` für alle `sf7-ca-edgar*`-Modi; das Ledger wird nach der Reservierung zurückgelesen, bei Abweichung bricht der Lauf ab |
| L4: Plan übersprang Sitzungen ohne gecachten Index | LOW | Solche Sitzungen zählen mit dem schlimmsten Fall: Indexseiten + 6 Dokumente + 6 Filing-Indizes + 6 × 3 Exhibits |
| L5: fehlendes Ledger begann bei 0 | LOW | Ein fehlendes Ledger oder weniger als **122** verbrauchte Anfragen (Anker der 1.4.2-Läufe, im Code) bricht ab |

**Abweichung der 1.4.2-Probe, offen benannt:** Die Probe 40205818659 verbrauchte **42 Anfragen**. Sie lief auf exponierten DQ-K3-Sitzungen von 400 Reihen. Ihre Anfragen dienten damit Sitzungen **außerhalb** der 83:
- 1 Einreichungsindex;
- 36 Hauptdokumente;
- 3 Filing-Indizes;
- 2 Exhibits.

Die 42 Anfragen sind im Ledger gezählt. Seit 1.4.3 ist der Umfang in jedem Modus K5.

**Vorher 1.4.2 nur aus dem Cache:** Der eingefrorene 1.4.2 wurde aus den gecachten Extraktionen (Parser 1.1.0) und den gecachten Index-Parses (1.0.0) bewertet, ohne Anfrage. Für alle 21 Sitzungen mit Dokumentpfad war das vollständig möglich.
- 1.4.3 liest Dokumente und Exhibits mit dem neuen Parser nur für diese 21 Sitzungen neu; nur dort kann ein Dokument bestätigen.
- Für die 51 übrigen geprüften Sitzungen ohne Dokumentpfad übernimmt 1.4.3 das 1.4.2-Label (`labelsCarriedFrom142` 51); ihre Klasse bleibt die aus 1.3.0.

**Läufe 1.4.3:**

| Lauf | Modus | Anfragen | Ergebnis |
|---|---|---|---|
| [40212814452](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40212814452) | `sf7-ca-edgar-plan` | **0** | 51 Hauptdokumente, 51 Filing-Indizes, höchstens 153 Exhibits, also **Obergrenze 255** (unter dem Rest von 478, kein Stopp); 0 Sitzungen ohne gecachten Index |
| [**40214193643**](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40214193643) | **`sf7-ca-edgar`, maßgeblich** | **132** von 478 reserviert | 51 Hauptdokumente, 51 Filing-Indizes, 30 Exhibits; Einreichungsindizes aus dem Cache (83 Treffer); 0 Fehler, 0 über dem Budget |

Eine Probe wurde nicht gestartet.

**Ledger, alle 1.4.x-Exhibit-Läufe:**

| Lauf | Anfragen |
|---|---|
| 1.4.2 Plan | 0 |
| 1.4.2 Probe | 42 |
| 1.4.2 Hauptlauf | 80 |
| 1.4.3 Plan | 0 |
| 1.4.3 Hauptlauf | 132 |
| **Summe** | **254 von 600** (Rest 346) |

**Prüfungen im Hauptlauf:**
- Snapshot `EXACT`; 1.3.0 unverändert; das Manifest `e0a31fea…` ist reproduziert; der Umfang sind **83** Sitzungen.
- BASE ist hash-identisch mit 6.0 für alle 11 Referenzen; CA ist identisch mit BASE.
- 1.4.3-Overlay: **0 Einträge**, `2850f3512982dadcd46b02e54177d07aef7e410cf33af77cbe4309e0aa174267`.
- `genuineCandidatesChanged` 0, `changedOutsideScope` 0.

**Exhibits unter 1.4.3:**
- 30 gelesen: `EX-3.1` 8, `EX-3.2` 6, `EX-99.1` 16. Ein EX-99.1 mehr als unter 1.4.2, weil der Typ jetzt aus der Type-Spalte kommt.
- **0 Split-Aussagen mit Verhältnis**, auch mit dem erweiterten Satzungswortlaut.
- 2 Aussagen mit Ermessenswortlaut wurden ausgeschlossen (aus den Hauptdokumenten).

**Vorher (1.4.2) / Nachher (1.4.3):**

| Klasse (83) | 1.4.2 | 1.4.3 |
|---|---|---|
| `CONFIRMED_UNDECLARED_SPLIT` | 0 | **0** |
| `CONFIRMED_GENUINE_MOVE` | 0 | **0** |
| `UNRESOLVED` | 83 | **83** |

| Label | 1.4.2 | 1.4.3 |
|---|---|---|
| `REVERSE_SPLIT_DOCUMENTED` | 0 | 0 |
| `NO_SPLIT_DOCUMENT_FOUND` | 33 | 33 |
| `UNCLEAR` | 33 | 32 |
| `AMBIGUOUS` | 6 | 7 |
| `NOT_CHECKED` (keine CIK) | 11 | 11 |

Eine Sitzung wechselt von `UNCLEAR` zu `AMBIGUOUS`: Ihr einziges Verhältnis steht in einem Satz mit Ermessenswortlaut. Die Dokumentbefunde der 21 Pfad-Sitzungen sind gleich geblieben:

| Befund | Anzahl |
|---|---|
| `NO_SPLIT_DOCUMENT_FOUND` | 12 |
| `DOCUMENT_CAP_EXCEEDED` | 4 |
| `DOCUMENT_NO_RATIO` | 2 |
| `DOCUMENT_RATIO_NOT_ON_GRID` | 1 |
| `DOCUMENT_PROXY_ONLY` | 1 |
| `DOCUMENT_EFFECTIVE_DATE_OUTSIDE_WINDOW` | 1 |

Je Referenz (DQ-K5 exponiert / bestätigt 1.4.2 / bestätigt 1.4.3 / ungeklärt 1.4.3):

| Referenz | exponiert | 1.4.2 | 1.4.3 | ungeklärt |
|---|---|---|---|---|
| Turtle S1 | 16 | 0 | 0 | 16 |
| Turtle S2 | 14 | 0 | 0 | 14 |
| Minervini SEPA | 0 | 0 | 0 | 0 |
| Minervini Power Play | 12 | 0 | 0 | 12 |
| Darvas | 15 | 0 | 0 | 15 |
| Kullamägi Breakout | 27 | 0 | 0 | 27 |
| Pocket Pivot | 9 | 0 | 0 | 9 |
| Buyable Gap-Up | 14 | 0 | 0 | 14 |
| Weinstein Investor | 0 | 0 | 0 | 0 |
| Weinstein Trader | 4 | 0 | 0 | 4 |
| Holy Grail (W-RAS97) | 29 | 0 | 0 | 29 |

**Gelöst durch Exhibits: 0 von 83.** Die Restgruppen, die Wirkung auf CC-5 und die nötigen Anbieter-Datenfelder in den Abschnitten unten gelten unverändert für 1.4.3. Die Gründe der Pfad-B-Sitzungen sind gleich geblieben.

Die folgenden Abschnitte beschreiben Regelsatz 1.4.2 und seine Läufe.

## Regelsatz 1.4.2

Der Regelsatz wurde vor jedem Lauf festgeschrieben.
- Code: [`integrity/ca-edgar.mjs`](../scripts/supertrader/source-faithful/integrity/ca-edgar.mjs).
- Hash `2130be8e8131c22100e00160cb5606e1db95e628e554088ccf04dcb861191636`, Test SF7-EDGAR-RULESET.
- 1.4.1 liegt eingefroren in [`ca-edgar-1.4.1.mjs`](../scripts/supertrader/source-faithful/integrity/ca-edgar-1.4.1.mjs), Hash `21f78d69…`; 1.4.0 in `ca-edgar-1.4.0.mjs`, Hash `8f9f5e69…`.
- 1.3.0 (`08d8a6ec…`) ist unverändert.

1.4.2 ist 1.4.1 plus **genau eine** weitere Quelle: die **Exhibits der Einreichungen, die 1.4.1 bereits auswählt**.
- Es gelten dieselbe CIK, dasselbe Fenster [d − 90, d + 100], dieselben Formulare und dieselbe Obergrenze von 6 Einreichungen je Sitzung.
- **Vorregistrierte Exhibit-Typen** (Spalte „Type“ des Einreichungsindex):
  - `EX-3.1`, `EX-3.2`, `EX-3(i)`, `EX-3.i`, `EX-3.01`, `EX-3.02`: Satzung, Satzungsänderung (Certificate of Amendment), Satzungsordnung;
  - `EX-99.1`, `EX-99.01`: Pressemitteilung.
  - Andere Typen (z. B. EX-10, EX-101) zählen nicht.
- **Fundweg:** die Indexseite `…/<acc>-index.htm` der Einreichung.
  - Es zählen nur Verweise im Verzeichnis derselben Einreichung, also derselben CIK.
  - Ein Inline-XBRL-Verweis (`/ix?doc=`) wird aufgelöst, Verweise in andere Verzeichnisse werden verworfen.
- **Dieselben Regeln wie 1.4.1.** Ein Exhibit gilt als Dokument des Formulars seiner Einreichung und durchläuft denselben Parser mit:
  - Verhältnis und Datum aus demselben Satz, Jahreskonflikt;
  - Spanne und Auswahlliste, zwei Verhältnisse;
  - Ausschluss von Optionsschein-, Wandlungs- und Umtauschsätzen, Fusionswortlaut;
  - ±2 Sitzungen auf dem Snapshot-Kalender.
- **Ein Dokumentfaktor bestätigt nur zusammen mit den notwendigen Kurs- und Aktienbedingungen von 1.4.1:** Eröffnung auf demselben Rasterwert, Schluss, Volumen, adjClose ohne Widerspruch und (Pfad A) dieselbe Aktienzahl.
- **Eine echte Bewegung wird nie ein Split.** Sitzungen mit einem 1.3.0-Grund der echten Bewegung haben keinen Dokumentpfad und behalten ihre Klasse.
  - Der Lauf prüft das (`genuineCandidatesChanged` = 0, sonst Abbruch).
  - Ein Exhibit-Verhältnis, das der Kurssprung nicht trägt, bleibt `UNRESOLVED` (`PRICE_RATIO_OFF_DOCUMENT_FACTOR`, Test SF7-EDGAR-GENUINE-142).
- **Umfang der Abrufe:** Exhibits werden nur für die Sitzungen mit Dokumentpfad gelesen (21 von 83). Nur dort kann ein Dokument bestätigen; das ist die „unmittelbar erforderliche Belegquelle“.
  - Für die übrigen 62 Sitzungen gilt der 1.4.1-Befund aus den Hauptdokumenten im Cache, ohne Anfrage.
- **Unvollständig ist `UNRESOLVED`:**
  - mehr als 3 zulässige Exhibits in einer Einreichung (`EXHIBIT_CAP_EXCEEDED`);
  - ein nicht lesbarer Index oder ein nicht lesbares Exhibit (`EXHIBIT_FETCH_FAILED`);
  - wie in 1.4.1: mehr als 6 Kandidaten-Einreichungen oder ein gekürztes Dokument.

## Budget, Drosselung, Plan

Code: [`research/run-sf7-ca-edgar.mjs`](../scripts/supertrader/source-faithful/research/run-sf7-ca-edgar.mjs), [`research/sf7-edgar-client.mjs`](../scripts/supertrader/source-faithful/research/sf7-edgar-client.mjs).
- Wie bisher: sequentiell, höchstens 2 Anfragen je Sekunde, 30 s Zeitlimit, der SEC-User-Agent von `sec-pit.mjs`, keine Wiederholungen.
- **Kumulative Obergrenze von 600 Anfragen für alle 1.4.2-Läufe zusammen** (Plan, Probe, Hauptlauf), geführt in einem privaten Ledger (`_validation/edgar-ca-142-ledger.json.gz`):
  - Jeder Lauf **reserviert** sein Budget im Ledger, bevor er die erste Anfrage stellt. Ist das Ledger nicht schreibbar, bricht er ab.
  - Danach rechnet er auf die tatsächlich gestellten Anfragen ab. Eine nicht abgerechnete Reservierung zählt voll (fail closed).
- **Plan-Schritt** (Modus `sf7-ca-edgar-plan`):
  - Er rechnet nur aus dem Cache, mit einem Client, der nichts senden kann (Budget 0).
  - Ergebnis: die noch fehlenden Indizes und Hauptdokumente und die Obergrenze der Filing-Index- und Exhibit-Anfragen (3 Exhibits je nicht gecachtem Index).
  - Der Hauptlauf rechnet denselben Plan vor dem ersten Abruf und stoppt, wenn die Obergrenze das Restbudget übersteigt (`EDGAR_PLAN_EXCEEDS_BUDGET`, Exit 8).

## Läufe

| Lauf | Modus | Anfragen | Ergebnis |
|---|---|---|---|
| [40204439421](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40204439421) | `sf7-ca-edgar-plan` | **0** | Plan für die 83 Sitzungen: 0 Indizes, 0 Hauptdokumente, 51 Filing-Indizes, höchstens 153 Exhibits, also **Obergrenze 204** (unter 600, kein Stopp) |
| [40205818659](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40205818659) | `sf7-ca-edgar-smoke` (400 Reihen, exponierte DQ-K3) | **42** von 60 reserviert | technische Probe: 1 Index, 36 Hauptdokumente, 3 Filing-Indizes, 2 Exhibits (EX-3.1, EX-99.1), 0 Fehler |
| [**40206319111**](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40206319111) | **`sf7-ca-edgar`, maßgeblich** | **80** von 558 reserviert | 51 Filing-Indizes, 29 Exhibits; Indizes und Hauptdokumente vollständig aus dem Cache; 0 Fehler, 0 über dem Budget |

**Ledger nach allen Läufen:** 0 (Plan) + 42 (Probe) + 80 (Hauptlauf) = **122 von 600**, Rest 478.

Aufteilung der 122 Anfragen:

| Art | Anzahl |
|---|---|
| Plan | 0 |
| Filing-Indizes | 54 (3 Probe, 51 Hauptlauf) |
| Exhibits | 31 (2 Probe, 29 Hauptlauf) |
| Probe: Einreichungsindex und Hauptdokumente der DQ-K3-Sitzungen | 37 |

**Cache-Treffer im Hauptlauf:** 83 Indizes, 270 Hauptdokumente.
- Cache vorher: 80 Indizes, 296 Dokumente, 3 Filing-Indizes, 2 Exhibits.
- Cache nachher: 54 Filing-Indizes, 31 Exhibits.
- Der Cache hält nur extrahierte Werte, nie Dokumenttext.

**Prüfungen im Hauptlauf:**
- Snapshot `EXACT`; 1.3.0 unverändert (11 Indexabfragen aus dem Cache).
- Das 1.3.0-Manifest `e0a31fea…` ist reproduziert, der Umfang sind **83** Sitzungen.
- **BASE ist hash-identisch mit 6.0 für alle 11 Referenzen.**
- Das 1.4.2-Overlay hat **0 Einträge**, `manifestSha256` `0cad82fd98f478f4c1c320bb693d23591b20ed3d5a4ba890f8f90ed9514cb818`. CA ist für alle 11 Referenzen trade- und ledger-identisch mit BASE.
- Weil kein Split bestätigt ist, ist kein zusätzlicher Overlay-Vergleich der Referenzen nötig.
- `genuineCandidatesChanged` 0, `changedOutsideScope` 0.

## Was die Exhibits gezeigt haben

| | Anzahl |
|---|---|
| Sitzungen mit Exhibit-Prüfung (Dokumentpfad B) | 21 |
| Einreichungen (Filing-Indizes) | 51 |
| zulässige Exhibits gelesen | 29: `EX-3.1` 8, `EX-3.2` 6, `EX-99.1` 15 |
| Split-Aussagen mit Verhältnis in Exhibits | **0** |
| unvollständig wegen der Exhibits | 0 |

Keines der 29 Exhibits enthält eine Verhältnis-Aussage im Split-Zusammenhang, die die Regeln zählen; Sätze über Optionsscheine und Wandlungen sind dabei ausgeschlossen. In einer Sitzung führt ein Exhibit das Split-Wort ohne Verhältnis (`NO_SPLIT_DOCUMENT_FOUND` → `DOCUMENT_NO_RATIO`).

## Vorher (1.4.1) / Nachher (1.4.2)

Beide Fassungen liefen im selben Lauf auf denselben Hauptdokumenten. 1.4.2 zieht zusätzlich die Exhibits heran.

| Klasse (83 Sitzungen) | 1.4.1 | 1.4.2 |
|---|---|---|
| `CONFIRMED_UNDECLARED_SPLIT` | 0 | **0** |
| `CONFIRMED_GENUINE_MOVE` | 0 | **0** |
| `UNRESOLVED` | 83 | **83** |

| Label | 1.4.1 | 1.4.2 |
|---|---|---|
| `REVERSE_SPLIT_DOCUMENTED` | 0 | 0 |
| `NO_SPLIT_DOCUMENT_FOUND` | 36 | 33 |
| `UNCLEAR` | 30 | 33 |
| `AMBIGUOUS` | 6 | 6 |
| `NOT_CHECKED` (keine CIK) | 11 | 11 |

Drei Sitzungen wechseln von `NO_SPLIT_DOCUMENT_FOUND` nach `UNCLEAR`, weil ein Exhibit das Split-Wort ohne zählbares Verhältnis enthält. Das Label bewertet die gelesenen Dokumente ohne die Obergrenze von 6. Der Klassifikationsgrund wechselt nur in einer Sitzung, die beiden anderen bleiben durch die Obergrenze unvollständig.

| Referenz | DQ-K5 exponiert | bestätigt 1.4.1 | bestätigt 1.4.2 | ungeklärt 1.4.2 |
|---|---|---|---|---|
| Turtle S1 | 16 | 0 | 0 | 16 |
| Turtle S2 | 14 | 0 | 0 | 14 |
| Minervini SEPA | 0 | 0 | 0 | 0 |
| Minervini Power Play | 12 | 0 | 0 | 12 |
| Darvas | 15 | 0 | 0 | 15 |
| Kullamägi Breakout | 27 | 0 | 0 | 27 |
| Pocket Pivot | 9 | 0 | 0 | 9 |
| Buyable Gap-Up | 14 | 0 | 0 | 14 |
| Weinstein Investor | 0 | 0 | 0 | 0 |
| Weinstein Trader | 4 | 0 | 0 | 4 |
| Holy Grail (W-RAS97) | 29 | 0 | 0 | 29 |

## Welche der 83 Fälle die Exhibits gelöst haben

**Keinen.** 0 von 83 sind bestätigt, weder als Split noch als echte Bewegung.

## Welche ungeklärt bleiben und warum (1.4.2)

| Gruppe | Anzahl | Gründe |
|---|---|---|
| Dokumentpfad B, SEC-Aktienzahlen nicht nutzbar, Dokumente und Exhibits geprüft | 21 | `NO_SPLIT_DOCUMENT_FOUND` 12, `DOCUMENT_CAP_EXCEEDED` 4, `DOCUMENT_NO_RATIO` 2, `DOCUMENT_RATIO_NOT_ON_GRID` 1, `DOCUMENT_PROXY_ONLY` 1, `DOCUMENT_EFFECTIVE_DATE_OUTSIDE_WINDOW` 1 |
| erklärter Split in der Nähe (Tiingo) | 19 | `DECLARED_SPLIT_NEARBY` 13, `MULTIPLE_DECLARED_SPLITS_NEARBY` 6 |
| echte Bewegung nicht belegbar (bleibt so, nie Split) | 16 | `VOLUME_CONSISTENT_WITH_SPLIT` 6, `PRICE_RATIO_AT_STANDARD_FACTOR` 3, `CA_FILING_IN_WINDOW` 3, `GENUINE_REQUIRES_KNOWN_CIK` 2, `VOLUME_EVIDENCE_MISSING` 2 |
| Widerspruch Aktienzahl ↔ Kurs | 14 | `SHARE_RATIO_NO_MATCH` 5, `PRICE_RATIO_OFF_FACTOR` 4, `SHARE_AND_PRICE_DIRECTION_CONFLICT` 3, `MULTIPLE_JUMPS_IN_BRACKET` 2 |
| keine CIK-Zuordnung | 11 | `SEC_LISTING_NOT_MAPPED` |
| ADR / IFRS | 2 | `ADR_OR_FOREIGN_FILER` |

## Wirkung auf CC-5 und die 13 Strategien

- **CC-5 bleibt für alle 13 Strategien unerfüllt**, ohne automatische Hochstufung; der Test SF7-COMPLETION-MATRIX hält das fest.
- `CA7` und die CC-5-Teilkriterien sind zahlengleich (`completion/sf7-completion-matrix.mjs` 1.3.0, nur aus den öffentlichen Zählungen):
  - `CC5-a` (K5) ist leer erfüllt nur für Minervini SEPA und Weinstein Investor (keine Exposition);
  - `CC5-b` (K3) ist nur für Minervini SEPA erfüllt;
  - `CC5-e` (Erkennung vollständig) und `CC5-f` (Holdout) bleiben unerfüllt.
- EP und PS haben keine Tagesreferenz in `CA7`; sie sind unverändert `VALIDATION_BLOCKED`.
- Keine Strategie ändert Zustand, Readiness oder Zertifizierung. Alle bleiben `LIVE_NOT_APPROVED`.
- Eine Datenkorrektur in `quant/data` ist gegenstandslos, weil kein Split bestätigt ist. Sie bliebe ohnehin ein eigener Quant-PR.

## Was ein bezahlter Anbieter liefern müsste

Je verbleibender Gruppe; die Abnahme gilt gegen die EDGAR-Labels aus E7-1.

| Gruppe (Anzahl) | nötige Datenfelder |
|---|---|
| keine CIK (11) | historische Wertpapier-Zuordnung: Ticker-Historie mit Gültigkeitszeitraum → CIK / CUSIP (oder eine eigene permanente ID) für **delistete** Titel; dazu die Split-Ereignisse unter dieser ID |
| Dokumentpfad ohne Beleg (21) | je Split **Ex-Datum (erster Handelstag split-bereinigt) und Verhältnis** (Zähler/Nenner, Richtung), auch für delistete Emittenten; zusätzlich PIT-Aktienzahlen (Stichtag, Wert, Einreichungsdatum), um die fehlenden SEC-Klammern zu schließen |
| erklärter Split in der Nähe (19) | Split-Ereignisse mit Ex-Datum und Verhältnis **und** Korrekturstatus (storniert / korrigiert / doppelt), um falsch datierte oder falsch bemessene Tiingo-Faktoren zu entscheiden |
| Widerspruch Aktienzahl ↔ Kurs (14) | Split-Ex-Datum und Verhältnis plus Kapitalmaßnahmen, die die Aktienzahl ändern (Emissionen, Rückkäufe), mit Datum und Stückzahl |
| echte Bewegung (16) | vollständige Liste aller Kapitalmaßnahmen im Fenster (Splits, Spin-offs, Sonderausschüttungen, Bezugsrechte, Fusionen), damit ein „keine Kapitalmaßnahme“ belegt ist; PIT-Aktienzahlen |
| ADR (2) | Änderungen des ADR-Verhältnisses (DR ratio change) mit Wirksamkeitsdatum |

Die Abnahmekriterien aus der Entscheidungsvorlage E7-1 gelten unverändert: mindestens 90 % Event-Treffer, mindestens 95 % exakte Ratio, 0 falsch-positive Treffer, mindestens 85 % Abdeckung 2008–2017.

## Grenzen

- **Keine Split-Aussage in den 29 Exhibits:** Entweder tragen die geprüften Exhibits kein Verhältnis, etwa Bylaws (EX-3.2) oder Ergebnis-Pressemitteilungen, oder ihr Wortlaut fällt unter eine der strengen Regeln.
  - Ursachen sind etwa: Datum in einem anderen Satz, Optionsschein- oder Wandlungsbezug, eine Formulierung außerhalb des Parsers.
  - Welche Ursache zutrifft, steht nur versiegelt in den Einzelbefunden.
  - Die Regeln wurden **nach** dem Lauf nicht angepasst. Jede Lockerung wäre ein neuer Regelsatz mit Vorher/Nachher und eigener Freigabe.
- 4 der 21 Sitzungen mit Dokumentpfad bleiben wegen der Obergrenze von 6 Einreichungen unvollständig (1.4.1-Regel, unverändert).
- Gemeinsam eingereichte Dokumente bleiben eine dokumentierte Grenze, siehe [SUPERTRADER_7_EDGAR_CA_CHECK.md](SUPERTRADER_7_EDGAR_CA_CHECK.md).
- Der Rest von 346 Anfragen im Ledger (nach 1.4.3) ist **keine** Freigabe für weitere Abrufe. Ein weiterer 1.4.x-Lauf braucht eine eigene Entscheidung.
- Auch mit dem erweiterten Satzungswortlaut von 1.4.3 enthält keines der 30 Exhibits eine zählbare Split-Aussage. Ein häufiger Grund dürfte sein, dass Satzungsänderungen den Wirksamkeitszeitpunkt als „Effective Time“ ohne Datum im selben Satz nennen. Das bleibt bewusst streng: Datum und Verhältnis müssen im selben Satz stehen (Regel R1 aus 1.4.1).

Tests: [`sf-sf7-ca-edgar.test.mjs`](../scripts/supertrader/tests/sf-sf7-ca-edgar.test.mjs), nur synthetische Texte. Für 1.4.2 neu:
- Exhibit-Fund aus einem Index;
- Satzungs- und Pressemitteilungs-Wortlaut;
- Spanne oder zwei Verhältnisse im Exhibit;
- echte Bewegung mit Exhibit-Verhältnis;
- kumulatives Ledger;
- Plan ohne Anfrage und Stopp vor dem ersten Abruf;
- Hash-Pins von 1.4.2, 1.4.1 und 1.4.0.

## Abschluss V4-D1 (Eigentümerentscheidung 25.10.2026)

**Ergebnis:** Die Prüfung der verfügbaren kostenlosen Daten ist **im untersuchten Umfang ausgeschöpft**. Untersucht wurden:
- die Tiingo-Felder des eingefrorenen Snapshots;
- die SEC-Aktienzahlen (sec-pit r14);
- die EDGAR-Einreichungsindizes;
- die Hauptdokumente und die Exhibits EX-3.1, EX-3.2 und EX-99.1 derselben CIK im vorregistrierten Fenster um jede Sitzung.

Die Regelsätze 1.3.0 bis 1.4.3 sind jeweils vor ihrem Lauf gepinnt. Insgesamt sind es 877 kostenfreie, gedrosselte Anfragen.

**Keine der 83 referenzexponierten DQ-K5-Sitzungen ist belegt.**

Das ist **kein Beweis**, dass es außerhalb dieses Umfangs keine Belege gibt. Nicht untersucht sind:
- die EDGAR-Volltextsuche;
- Einreichungen außerhalb des Fensters;
- weitere Exhibit-Typen;
- Unterlagen anderer Registranten;
- Börsen- und FINRA-Mitteilungen;
- lizenzierte Anbieter.

Für die 11 Sitzungen ohne CIK war die Prüfung von vornherein nicht möglich.

**Was weiter gilt:**
- **Quarantäne:** Sie bleibt aktiv. Alle 83 Sitzungen bleiben gesperrt, das CA-Overlay bleibt leer.
- **Klassifikation:** Unbelegte Kapitalmaßnahmen werden nie als bestätigte Splits klassifiziert. Kandidaten einer echten Kursbewegung werden nie nachträglich zu Splits; das Laufgate `EDGAR_GENUINE_CANDIDATE_CHANGED` und die Tests `SF7-EDGAR-GENUINE*` sichern das ab.
- **Status:** CC-5 und sämtliche Zertifizierungsstatus bleiben unverändert. 0 von 13 Strategien sind Zertifizierungskandidaten, alle 13 sind `LIVE_NOT_APPROVED`.
- **Weitere Suchrunden:** Es gibt keine weiteren EDGAR-Exhibit-Runden. Die restlichen 346 Anfragen im Ledger sind keine Freigabe.
- **Weg nach vorn:** Weiter kommt man nur mit einer lizenzierten Quelle für Kapitalmaßnahmen nach gesonderter Kostenfreigabe oder mit der Entscheidung, die Quarantäne als Dauerzustand zu führen.
