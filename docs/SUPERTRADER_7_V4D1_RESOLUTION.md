# Supertrader 7.0 – V4-D1: Auflösung mit vorhandenen Kapitalmaßnahmen-Daten

Stand: 24. Oktober 2026. Ergebnis `DIAGNOSTIC_NOT_CERTIFIED`. Grundlage ist Eigentümerentscheidung E1 aus [SUPERTRADER_6_V4D1_CONTAINMENT.md](SUPERTRADER_6_V4D1_CONTAINMENT.md).

Maßgeblich ist der **Regelsatz 1.2.0**, Lauf **40118088867**. Er enthält die Befunde der Nachprüfung, siehe den Abschnitt „Nachprüfung“.
- Hash des vollständigen Regelsatzes: `7841f3ce…`, in einem Test festgeschrieben.
- Zum Vergleich stehen daneben: 1.0.0 (Lauf 40104626083) und 1.1.0 (Lauf 40111713883).

Code:
- [`integrity/ca-resolution.mjs`](../scripts/supertrader/source-faithful/integrity/ca-resolution.mjs): Klassifikation, vorregistrierter Regelsatz (`RULESET`).
  - Daneben liegt `ca-resolution-1.0.0.mjs`, eine eingefrorene Kopie von 1.0.0. Sie dient nur dem Vorher/Nachher-Vergleich.
- [`integrity/ca-overlay.mjs`](../scripts/supertrader/source-faithful/integrity/ca-overlay.mjs): erzeugtes Overlay-Manifest, Korrektur, Quarantäne.
- [`research/run-sf7-ca-resolution.mjs`](../scripts/supertrader/source-faithful/research/run-sf7-ca-resolution.mjs): der Lauf.
- `validation/sec-pit.mjs --r14`: SEC-Aktienzahlen einschließlich Bilanzwerten.
- Workflow-Modi:
  - `sf7-ca-resolution`;
  - `sf7-ca-resolution-smoke`: 400 Reihen desselben Snapshots;
  - `sec-pit-r14`.
- Tests: [`sf-sf7-ca-resolution.test.mjs`](../scripts/supertrader/tests/sf-sf7-ca-resolution.test.mjs), 27 Tests.

## Ziel

Supertrader 6.0 hat V4-D1 nur **eingegrenzt**: Markierte Sitzungen kamen in Quarantäne, geprüft wurde keine. Diese Arbeit prüft jede markierte Sitzung mit Belegen, die schon vorliegen. Jede Sitzung bekommt genau eine Klasse:

| Klasse | Bedeutung |
|---|---|
| `CONFIRMED_UNDECLARED_SPLIT` | Faktor **und** Sitzung belegt:<br>– Das SEC-Aktienverhältnis und, unabhängig davon, das Eröffnungsrelativ von d wählen denselben Rasterfaktor N.<br>– Das Aktien-Residuum ist eng.<br>– Schluss und Rohvolumen passen.<br>– Die CIK ist bekannt (`KNOWN`), in den Meldungen steht keine Fusion.<br>– Ab N = 10 gibt es einen zweiten Beleg (adjClose oder 8-K 5.03/3.03). |
| `CONFIRMED_MISDATED_DECLARED_SPLIT` | Tiingo hat den Faktor f am Tag j erklärt. Der Kurs sprang aber höchstens 5 Sitzungen daneben um f (innerhalb ±10 %), nicht an j. SEC oder adjClose bestätigen den Faktor. Der erklärte Faktor wird verschoben, nie erfunden. |
| `CONFIRMED_GENUINE_MOVE` | Aktienzahl unverändert, und die frühere Zahl wurde vor d eingereicht. Das Volumen verhält sich nicht wie bei einem Split. Es gibt keine erklärte und keine von Tiingo angedeutete Kapitalmaßnahme. Die CIK ist bekannt, der Emittent ist inländisch, und seine Meldungen um d enthalten keine Kapitalmaßnahme. |
| `UNRESOLVED` | alles andere |

Keine Vermutung wird als bestätigt ausgegeben. Was nicht eindeutig ist, bleibt `UNRESOLVED` und kommt in Quarantäne.

## Quellen (Reihenfolge aus E1)

1. **Tiingo-Felder derselben Snapshot-Reihe** (`sts1-134d…`, kein neuer Abruf): Roh-Open/-Close, Rohvolumen, `splitFactor`, `divCash`, `adjClose`.
2. **Marketstack: nicht genutzt.** Ein bestehender Zugang zu US-Kapitalmaßnahmen ist nicht belegt. Ein neuer oder bezahlter Anbieter ist ausgeschlossen.
3. **SEC:**
   - **`sec-pit-r14`** (neu, Lauf 40110748496; r12 und r13 bleiben unverändert):
     - je Stichtag zuerst der Deckblattwert `dei:EntityCommonStockSharesOutstanding`, sonst der Bilanzwert `us-gaap:CommonStockSharesOutstanding` (erste Einreichung je Bilanzstichtag), sonst die gewichtete verwässerte Zahl;
     - jede Zeile trägt ihre Quelle.
     - Gebaut wurde r14 mit demselben Mechanismus wie die bestehenden sec-pit-Modi: die öffentliche Tiingo-Tickerliste, die SEC-Namensliste und **ein** Bulk-Download `companyfacts.zip`.
     - Die Delisting-Einzelabrufe der bestehenden Modi fallen bei r14 weg. Es entstehen keine Kosten.
     - Ergebnis: 7.174 Listings mit Aktienzahlen und 174.954 neue Bilanzzeilen. Der SHA-256 `a02c1847…` steht im Beleg.
     - Die CIK-Zuordnung wird bei jedem Bau neu gerechnet (7.174 statt 7.242 Listings in r13).
   - der öffentliche **EDGAR-Einreichungsindex** (`data.sec.gov/submissions`):
     - höchstens **eine** Anfrage je Emittent, keine Folgeseiten, 30 s Zeitlimit, Budget 150;
     - abgefragt wird für jeden Split-Kandidaten und für referenzexponierte Kandidaten einer echten Bewegung, die alle Aktienzahl-Tests bestanden haben;
     - die gelesenen Einträge (Formular, Datum, Items je CIK) liegen **versiegelt** im Ergebnis.

## Kandidatenmenge

- Alle DQ-K3-Markierungen, d. h. Gesamtrendite-Relativ ≥ 3 oder ≤ 1/3. Das ist eine Obermenge von DQ-K5; gemeldet wird je Stufe.
- Je Markierung kommen zwei Angaben dazu, beide wie in 6.0:
  - Research-Universum am Vortag;
  - **Referenzexposition**: Ein BASE-Trade einer der 11 Referenzen hat die Sitzung im Rückblick von 400 Tagen oder in der Haltedauer.
- „Weitere Markierungen“ zählen über **alle Segmente eines Listings** (Review L3).

## Regelsatz (vorregistriert; 1.1.0, ergänzt durch 1.2.0)

Die 1.2.0-Ergänzungen:
- **Split:**
  - Das Eröffnungsrelativ muss **unabhängig denselben** Rasterwert wählen.
  - Das Aktien-Residuum ist begrenzt: |ln(q/N)| ≤ min(0,2 · Log-Abstand, ln 1,02).
  - **Ab N = 10** ist ein zweiter Beleg nötig: adjClose kennt den Faktor, oder ein 8-K 5.03/3.03 liegt im Fenster.
  - Ein 8-K ohne Items im Fenster blockiert.
- **Falsch datierter Split:**
  - Sprung und Eröffnung innerhalb **ln 1,10** des erklärten Faktors;
  - **zweiter Beleg** Pflicht: SEC-Aktienzahl oder adjClose.
- **Stichtage:** nur aus **einer** Quelle auf beiden Seiten (dei–dei vor bs–bs). Eine gemischte Klammer ist `UNRESOLVED`.
- **Toleranzen:** Einheitenfehler-Band und Faktor-Gleichheit stehen jetzt in `TOLERANCES`.
- **Gegenprobe Volumen:** Sie macht `CONFIRMED_GENUINE_MOVE` für Abstürze mit hohem Volumen fast unerreichbar. Das ist gewollt (konservativ): Ein solcher Absturz ist von einem Vorwärts-Split nicht zu trennen.

### Regelsatz 1.1.0

Der Regelsatz wurde vor dem Lauf festgeschrieben und gehasht (`RULESET`, `rulesetSha256`, Test SF7-REVIEW-L2). Kein Wert wurde nach einem Ergebnis angepasst.

- **Faktorraster** (Review HIGH-1): alle ganzen Zahlen 2 bis 1.000, dazu 1,5 und 2,5.
  - q = Aktien vorher / nachher rastet bei N ein, wenn |ln(q/N)| ≤ min(ln 1,10; 0,45 · ln-Abstand zum Nachbarn).
  - Die Fenster von N und N ± 1 überlappen deshalb nie. Bei 1:24 liegt das Fenster bei ±1,8 %.
  - Das Overlay schreibt genau 1/N.
- **Stichtage:**
  - letzter Wert vor d und erster nach d, je höchstens **135 Tage** entfernt;
  - ein Stichtag genau am Tag d ist mehrdeutig und wird übersprungen;
  - ein Bilanzwert zählt als Vorher-Wert nur, wenn er **vor d eingereicht** wurde. Eine spätere Bilanz kann für den Split schon rückgerechnet sein (SAB Topic 4C).
- **Split:**
  - Schluss- **und** Eröffnungsrelativ innerhalb **±35 %** von N, gleiche Richtung;
  - Rohvolumen-Relativ (Median 10 Sitzungen ab d / 20 davor) auf der Split-Seite von 1 und innerhalb Faktor 4;
  - `adjClose` neutral oder genau N;
  - ein Vorwärts-Split nur, wenn `adjClose` den Faktor kennt;
  - CIK `KNOWN`;
  - EDGAR-Index deckt [d − 45, d + 15] ab, ohne 8-K-Item 2.01 und ohne Fusions- oder Abmeldeformular.
- **Falsch datierter erklärter Split:**
  - genau ein erklärter Split in ±135 Tagen;
  - genau eine Sitzung in ±5 Sitzungen mit Rohrelativ innerhalb ±35 % des erklärten Faktors;
  - am erklärten Tag ein Rohrelativ innerhalb ±35 % von 1;
  - Eröffnung und Volumen wie beim Split;
  - keine weitere Markierung in ±5 Sitzungen;
  - wo SEC-Daten nutzbar sind, müssen sie denselben Faktor zeigen.
- **Echte Bewegung:**
  - q innerhalb ±10 % von 1, und der Vorher-Wert wurde vor d eingereicht;
  - das Volumen verhält sich **nicht** wie ein Split des beobachteten Relativs (Review HIGH-2);
  - kein Einheitenfehler;
  - nicht innerhalb ±2 % eines gängigen Verhältnisses;
  - keine Ausschüttung ≥ 25 %;
  - CIK `KNOWN`;
  - inländischer Emittent: 10-Q/10-K im Index, kein 6-K/20-F/40-F;
  - im Fenster kein Fusionsformular, kein Proxy (DEF/PRE 14A/14C), kein 8-K-Item 2.01/3.03/5.03/5.07/8.01 und kein 8-K ohne Items.
- **Immer `UNRESOLVED`:**
  - erklärter Split in der Nähe, wenn kein Paar nach der Regel oben besteht;
  - Ausreißer mit Umkehr am Folgetag;
  - fehlende oder zu weite SEC-Stichtage;
  - ADR- oder IFRS-Emittent;
  - geteilte CIK;
  - weitere Markierung zwischen den Stichtagen.

## Korrektur: versioniertes CA-Overlay

- Das Manifest wird **vom Lauf erzeugt**, nie von Hand geschrieben.
  - Ein Eintrag hat einen von zwei Typen:
    - `ADD_UNDECLARED`: setzt `splitFactor` = 1/N;
    - `MOVE_DECLARED`: verschiebt den Tiingo-Faktor von j auf i und prüft dabei, dass an j genau dieser Faktor steht.
  - Die Einträge sind sortiert und kanonisch gehasht. Der Hash ist eine **Prüfsumme**, kein Schutz gegen gezielte Änderung. Geschützt wird das Manifest dadurch, dass es versiegelt beim Eigentümer liegt. Eine Abweichung lässt die Anwendung scheitern (Review L5).
- Die Research-Balken entstehen danach über den **unveränderten** Produktionspfad: `snapshot-input.mjs` → `validation/lib.mjs#adjustSeries`.
  - Das ist die Konvention von ADR-002, mit derselben Divisor-Semantik wie `quant/engines/return-series.js#splitFactors`.
  - Es gibt keine zweite Preisableitung.
- `quant/data` und der Snapshot bleiben unverändert. Die Nachtragung in der Datenschicht ist ein eigener Quant-PR, durch Gate A getrennt.
- **Quarantäne** nur an `UNRESOLVED`-Sitzungen, mit der Schnittsemantik von `discontinuity.mjs` (BOOK).
- **Vorausschau:**
  - Die Klassifikation liest Balken nach d. Sie ist eine Datenprüfung, keine Handelsentscheidung.
  - Die Korrektur ist übliche Rückwärtsbereinigung: Vor d ändert sie die bereinigten Kurse um eine Konstante, ab d ändert sie nichts.
  - Rohkurs-Regeln bleiben gleich (Tests SF7-CA-PIT, SF7-CA-INVARIANT).

## Läufe

| Lauf | Modus | Ergebnis |
|---|---|---|
| 40099986593 | Probelauf auf dem Smoke-Snapshot | abgebrochen: `CODE_VERSION_CHANGED`, weil der Smoke-Snapshot einen älteren Code-Fingerabdruck trägt; seitdem 400 Reihen von `sts1-134d…` |
| 40100139101 | Probelauf 1.0.0 | erfolgreich |
| 40100630003 | Hauptlauf 1.0.0 | Exit 5: Lesefehler des BASE-Abgleichs (falscher Schlüssel). Behoben, Test SF7-CA-REGRESSION |
| 40104542747 | Hauptlauf 1.0.0 | abgebrochen, weil vor der Korrektur gestartet |
| [40104626083](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40104626083) | Hauptlauf **1.0.0** („Vorher“) | erfolgreich, Commit `9a25c657c` |
| [40110748496](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40110748496) | `sec-pit-r14` | erfolgreich, ohne Einzelabrufe |
| [40111713883](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40111713883) | Hauptlauf 1.1.0 | erfolgreich, Commit `6351d6eaf`; 7 Splits, Overlay `64f4de26…` |
| [**40118088867**](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40118088867) | **Hauptlauf 1.2.0, maßgeblich** | erfolgreich, Commit `972bdfaf4`, versiegelt abgelegt (`20261024T183921Z`) |

Maßgeblicher Lauf 40118088867:
- Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Datensatz `EXACT`, research-v1.
- Regelsatz `7841f3cee73aa309c8f7855f41726fbdedeb9b738b13db24d510fd5f69d59958`.
- `sec-pit-r14`: SHA-256 `a02c184705f46c4299f16608e3f50831581a1f42101f5243f3c9425279e66bbd`.
- EDGAR-Index: 12 Anfragen, alle erfolgreich.
- Overlay: 1 Eintrag (`ADD_UNDECLARED`, 1:10). `manifestSha256` `04728f16a2a2960245b1d4fcec85ebb5df946f5147f4c169a5989087e38baf26`.
- **BASE hash-identisch mit 6.0 für alle 11 Referenzen** (Ledger, Trades, Anzahl).
- CA ist trade- und ledger-identisch mit BASE.
- Alle 44 Läufe sind abgestimmt (Ledger-Replay).

## Ergebnis

### Klassen 1.0.0 / 1.1.0 / 1.2.0

| | DQ-K5 1.0.0 | 1.1.0 | **1.2.0** | DQ-K3 1.0.0 | 1.1.0 | **1.2.0** |
|---|---|---|---|---|---|---|
| markierte Sitzungen | 1.210 | 1.210 | 1.210 | 2.521 | 2.521 | 2.521 |
| `CONFIRMED_UNDECLARED_SPLIT` | 6 | 7 | **1** | 6 | 7 | **1** |
| `CONFIRMED_MISDATED_DECLARED_SPLIT` | – | 0 | **0** | – | 0 | **0** |
| `CONFIRMED_GENUINE_MOVE` | 8 | 0 | **0** | 24 | 2 | **2** |
| `UNRESOLVED` | 1.196 | 1.203 | **1.209** | 2.491 | 2.512 | **2.518** |
| referenzexponiert: echt / ungeklärt | 8 / 75 | 0 / 83 | **0 / 83** | 24 / 241 | 2 / 263 | **2 / 263** |

**Die 6 Split-Bestätigungen aus 1.0.0 unter 1.2.0:**

| 1.0.0 | 1.2.0 | Grund |
|---|---|---|
| 1:10 | 1:10 | bestätigt (einziger Split) |
| 1:10 | `UNRESOLVED` | `OPEN_SELECTS_OTHER_FACTOR`: Die Eröffnung wählt einen anderen Faktor |
| 1:35 | `UNRESOLVED` | `OPEN_SELECTS_OTHER_FACTOR` |
| 1:7 | `UNRESOLVED` | `OPEN_SELECTS_OTHER_FACTOR` |
| 1:5 | `UNRESOLVED` | `SHARE_RESIDUAL_TOO_LARGE`: Aktienzahl weicht zu weit vom Faktor ab |
| 1:25 | `UNRESOLVED` | `SPLIT_REQUIRES_KNOWN_CIK` (schon unter 1.1.0) |

Die in 1.1.0 neu bestätigten 1:10 und 1:11 halten 1.2.0 ebenfalls nicht stand. Der einzige bestätigte Split liegt unter 1 $ und hinter keinem Referenztrade.

**Echte Bewegungen:** 0 bei DQ-K5. Bei DQ-K3 sind es 2, beide referenzexponiert (betroffen: Turtle S1, Kullamägi, BGU und Weinstein Investor). Sie liegen über keinem gehaltenen Trade.

### Die beiden Restgruppen des Auftrags

1. **Erklärter Split in der Nähe** (19 exponierte DQ-K5-Sitzungen):
   - Auch die strengere Regel bestätigt kein Paar.
   - Exponiert: 13 `DECLARED_SPLIT_NEARBY`, 6 `MULTIPLE_DECLARED_SPLITS_NEARBY`.
   - Über alle DQ-K5-Sitzungen: 124 und 29.
   - Ein falsches Verhältnis lässt sich ohne Erfinden eines Faktors nicht korrigieren.
2. **Fehlende SEC-Daten** (32 exponierte DQ-K5-Sitzungen):
   - Exponiert: 11 ohne Zuordnung, 13 ohne umschließende Stichtage, 5 zu weit, 3 ohne zulässige Quelle.
   - Seit 1.2.0 sind die Klammern quellenrein: 188 dei–dei und 7 bs–bs bei DQ-K5, 2 gemischte sind `UNRESOLVED`.
   - Bestätigt wird dadurch keine Sitzung.

### Wirkung auf die Referenzen (1.2.0)

Lesehilfe: Abgleich heißt unverändert / geändert / entfernt / neu gegenüber BASE.

| Referenz | Trades BASE | DQ-K5 exponiert (alle ungeklärt) | gehalten | DQ-K3 exponiert | echt | ungeklärt | Trades CA-Q-K5 | Abgleich CA-Q-K5 | Abgleich CA-Q-K3 |
|---|---|---|---|---|---|---|---|---|---|
| Turtle S1 | 820 | 16 | 2 | 41 | 1 | 40 | 841 | 128 / 46 / 646 / 667 | 135 / 50 / 635 / 722 |
| Turtle S2 | 559 | 14 | 1 | 38 | 0 | 38 | 606 | 324 / 12 / 223 / 270 | 93 / 31 / 435 / 532 |
| Minervini SEPA | 954 | 0 | 0 | 0 | 0 | 0 | 957 | 901 / 39 / 14 / 17 | 526 / 325 / 103 / 126 |
| Minervini Power Play | 1.007 | 12 | 1 | 39 | 0 | 39 | 975 | 108 / 771 / 128 / 96 | 149 / 711 / 147 / 95 |
| Darvas | 19.556 | 15 | 0 | 30 | 0 | 30 | 19.623 | 18.058 / 1.410 / 88 / 155 | 14.076 / 5.299 / 181 / 377 |
| Kullamägi Breakout | 9.114 | 27 | 3 | 95 | 1 | 94 | 9.048 | 2.809 / 4.784 / 1.521 / 1.455 | 1.924 / 5.413 / 1.777 / 1.623 |
| Pocket Pivot | 1.872 | 9 | 2 | 25 | 0 | 25 | 1.853 | 187 / 1.058 / 627 / 608 | 201 / 1.040 / 631 / 651 |
| Buyable Gap-Up | 3.415 | 14 | 1 | 69 | 1 | 68 | 3.500 | 1.281 / 1.487 / 647 / 732 | 723 / 1.788 / 904 / 948 |
| Weinstein Investor | 1.348 | 0 | 0 | 5 | 1 | 4 | 1.361 | 311 / 916 / 121 / 134 | 369 / 815 / 164 / 195 |
| Weinstein Trader | 1.808 | 4 | 2 | 9 | 0 | 9 | 1.934 | 373 / 962 / 473 / 599 | 365 / 975 / 468 / 636 |
| Holy Grail (W-RAS97) | 4.025 | 29 | 3 | 99 | 0 | 99 | 4.039 | 375 / 2.400 / 1.250 / 1.264 | 376 / 2.253 / 1.396 / 1.527 |

- **CA** (nur Overlay) ist für alle 11 Referenzen trade- und ledger-identisch mit BASE.
- Die exponierten Sitzungen sind für jede Referenz identisch mit 1.1.0, nur ihre Gründe verschieben sich.
- Die CA-Q-Abgleiche weichen von 1.1.0 nur dort ab, wo sich die Menge der geschnittenen Sitzungen geändert hat.

### Ungeklärter Rest der 83 exponierten DQ-K5-Sitzungen (1.2.0)

| Gruppe | Anzahl | Gründe |
|---|---|---|
| erklärter Split in der Nähe | 19 | `DECLARED_SPLIT_NEARBY` 13, `MULTIPLE_DECLARED_SPLITS_NEARBY` 6 |
| SEC-Daten fehlen oder reichen nicht | 32 | `SEC_LISTING_NOT_MAPPED` 11, `SEC_SHARES_NOT_BRACKETING` 13, `SEC_BRACKET_TOO_WIDE` 5, `SEC_SHARES_NOT_DEI` 3 |
| echte Bewegung nicht belegbar | 16 | `VOLUME_CONSISTENT_WITH_SPLIT` 6, `PRICE_RATIO_AT_STANDARD_FACTOR` 3, `CA_FILING_IN_WINDOW` 3, `GENUINE_REQUIRES_KNOWN_CIK` 2, `VOLUME_EVIDENCE_MISSING` 2 |
| Widerspruch Aktienzahl ↔ Kurs | 14 | `SHARE_RATIO_NO_MATCH` 5, `PRICE_RATIO_OFF_FACTOR` 4, `SHARE_AND_PRICE_DIRECTION_CONFLICT` 3, `MULTIPLE_JUMPS_IN_BRACKET` 2 |
| ADR / IFRS | 2 | `ADR_OR_FOREIGN_FILER` 2 |

### Identität (§ 3.2)

- Ein nachweisbarer Zuordnungsfehler ist nicht aufgetreten.
- 21 DQ-K3-Sitzungen haben eine CIK, die mit einem zweiten am Tag d lebenden Listing geteilt ist (`CIK_SHARED_BY_LIVE_LISTINGS`). Ihre Identität gilt als unbekannt.
- Namenszuordnungen reichen für keine bestätigte Klasse (Review MEDIUM-2). Die sec-pit-Namensprüfung selbst meldet 5 falsche von 1.500 geprüften Zuordnungen.

## Antwort und CC-5

**V4-D1 ist nur dort aufgelöst, wo Belege vorliegen.**
- Unter dem strengen Regelsatz 1.2.0 ist **ein** nicht erklärter Split bestätigt und korrigiert. Er berührt keine Referenz.
- **Keine** referenzexponierte DQ-K5-Sitzung ist bestätigt.
- Die Bestätigungen aus 1.0.0 und 1.1.0 halten den Prüfungen der Reviews überwiegend nicht stand.
  - Bei 5 der 6 früheren Splits stimmen Eröffnung, Aktien-Residuum oder Identität nicht eng genug.
  - Das zeigt, wie wenig die freien Daten für eine Bestätigung hergeben.

| CC-5-Bedingung | Stand |
|---|---|
| alle exponierten DQ-K5-Sitzungen bestätigt | **leer erfüllt nur für Minervini SEPA und Weinstein Investor** (keine exponierte Sitzung); bei DQ-K3 nur für Minervini SEPA |
| dasselbe für die übrigen 9 Referenzen | **nicht erfüllt**: 4 bis 29 ungeklärte DQ-K5-Sitzungen je Referenz |
| bestätigte Splits korrigiert, Referenzen neu gerechnet | im Research-Datensatz erfüllt. Offen ist der Quant-Daten-PR für den einen Split; ohne Wirkung auf die Referenzen |
| neue Snapshot-Generation mit Vorher/Nachher (E1) | offen |

Die Readiness-Matrix bleibt unverändert; die Entscheidung liegt beim Eigentümer.

**Was für CC-5 bleibt:**
- eine lizenzierte zweite Quelle für Kapitalmaßnahmen;
- oder die Annahme durch den Eigentümer, dass die Quarantäne der ungeklärten Rest-Sitzungen genügt.

Mit freien Daten ist der Rest nicht weiter zu trennen. Offen bleibt außerdem HOLDOUT (`sts1-8595…`, nicht gerechnet).

## Unabhängiges Review von #902 (Stand `bba505a`)

| Befund | Behebung | Test |
|---|---|---|
| HIGH-1: Einrasten auf eine kuratierte Liste mit ±10 %; 1:24 wurde zu 1:25, 15/16/70/75/80/120/125 nie bestätigbar | Raster 2..1.000 (+1,5, 2,5) mit getrennten Fenstern; Overlay schreibt 1/N; Vorher/Nachher der 6 Bestätigungen oben | SF7-REVIEW-HIGH-1 |
| HIGH-2: Vorher-Zahl nach d eingereicht; keine Volumen-Gegenprobe; Proxy und 5.07/8.01 fehlten | Vorher-Wert muss vor d eingereicht sein; `VOLUME_CONSISTENT_WITH_SPLIT`; DEF/PRE 14A/14C, 5.07, 8.01 im Fenster | SF7-REVIEW-HIGH-2 |
| MEDIUM-1: Fusionsschutz beim Split war toter Code | Indexabfrage auch für Split-Kandidaten; Fusion / 2.01 blockiert (fail closed) | SF7-REVIEW-MEDIUM-1/2 |
| MEDIUM-2: Namens-CIK genügte für einen Split | `KNOWN` für beide bestätigten Klassen | SF7-REVIEW-MEDIUM-1/2 |
| MEDIUM-3: EDGAR-Index nicht reproduzierbar, nur Hash | gelesene Einträge versiegelt, 30-s-Zeitlimit; Doku korrigiert | SF7-CA-RUN |
| MEDIUM-4: Auslandsemittenten (6-K) bestanden die Meldungsprüfung | echte Bewegung nur bei 10-Q/10-K und ohne 6-K/20-F/40-F | SF7-REVIEW-MEDIUM-4 |
| L1: Wächter ohne Test | Mutanten-Tests für jeden Wächter, Identität und die strikte Stichtagsgrenze | SF7-REVIEW-L1, SF7-REVIEW-L1-IDENTITY / L3 |
| L2: Regelsatz nicht vollständig festgeschrieben | `RULESET` mit allen Toleranzen, Raster, Formularen und Items; Hash im Test | SF7-REVIEW-L2 |
| L3: weitere Markierungen nur je Segment | je Listing über alle `#n`-Segmente | SF7-REVIEW-L1-IDENTITY / L3 |
| L4: sec-pit summiert Gattungen als Menge von Werten | dokumentiert, siehe Grenzen | – |
| L5: „Handänderung bricht den Hash“ | umformuliert: Prüfsumme, geschützt durch Versiegelung | – |
| L6 | dokumentiert | – |

## Nachprüfung von #902 (Stand `585d4fb`)

Die Nachprüfung hat alle früheren Behebungen bestätigt: Jede Rücknahme lässt ihren Test scheitern. Zwei Befunde blieben, dazu kleinere Punkte. Behoben in Regelsatz 1.2.0, vor dem Lauf festgeschrieben.

| Befund | Behebung | Test |
|---|---|---|
| HIGH: Ausgabe neuer Aktien schiebt q in das Fenster von N − 1. Der Schlusskurs-Test (ln 1,35) trennt N und N ± 1 nicht. Nachgestellt: 1:10 +6 % → 1:9, 1:25 +3 % → 1:24, 1:200 +0,6 % → 1:199, 1:1000 +0,1 % → 1:999, Kurs 8x / q = 7 → 1:7 | Eröffnungsrelativ muss denselben Rasterwert wählen; Residuum ≤ min(0,2 · Log-Abstand, 2 %); ab N = 10 zweiter Beleg (adjClose oder 8-K 5.03/3.03) | SF7-NACH-HIGH (alle fünf Driftfälle `UNRESOLVED`, ohne Drift richtig bestätigt) |
| MEDIUM: falsch datierter Split mit Fehlalarmen. Ein Phantom-2:1 neben einem echten −50-%-Absturz löschte den Absturz; ein erklärtes 1:10 gegen echte 8x wurde mit 1/10 bestätigt | Sprung und Eröffnung innerhalb ln 1,10 des erklärten Faktors; zweiter Beleg (SEC oder adjClose) Pflicht | SF7-NACH-MEDIUM |
| LOW: Eröffnungsprüfung beim falsch datierten Split und Überspringen bei ADR / geteilter CIK / IFRS ohne Test | Tests ergänzt | SF7-NACH-MEDIUM |
| LOW: fest verdrahtete Toleranzen (1,5; 1e-3) | in `TOLERANCES`, Teil des Regelsatz-Hashes | SF7-NACH-LOW, SF7-REVIEW-L2 |
| LOW: Gegenprobe Volumen macht echte Abstürze fast unerreichbar | dokumentiert (gewollt konservativ) | – |
| LOW: 8-K ohne Items beim Split | blockiert (`8K_ITEMS_UNKNOWN_NEAR_SPLIT`) | SF7-NACH-LOW |
| LOW: gemischte dei/bs-Klammern | nur quellenreine Klammern, sonst `SEC_MIXED_SOURCE_BRACKET` | SF7-NACH-LOW |
| LOW: Zeitlimit des Abrufs ohne Test | `fetchSubmissions` mit Zeitlimit; ein hängender Abruf endet als fehlender Index | SF7-NACH-LOW |

## Grenzen

- Marketstack wurde nicht genutzt.
- `sec-pit-r13` und `-r14` sind nicht eingefroren; ihre Fassung ist nur über den SHA-256 im Beleg festgehalten.
- Der EDGAR-Index wird live gelesen. Die gelesenen Einträge liegen versiegelt vor.
- **sec-pit, Gattungssumme (L4):** Die Deckblattwerte mehrerer Gattungen derselben Einreichung werden als *Menge* verschiedener Werte summiert. Zwei Gattungen mit gleicher Stückzahl zählen dann nur einmal.
  - Für r12/r13 bleibt das zur Reproduktion unverändert.
  - Für r14 ebenso, weil companyfacts keine Gattungskennung liefert.
  - Folge: Die Aktienzahl kann bei Mehrgattungsemittenten zu niedrig sein. Das spricht eher für `UNRESOLVED` als für eine falsche Bestätigung, denn das Verhältnis muss in ein enges Rasterfenster fallen.
- Spin-offs ohne Ausschüttung und ohne 8-K-Item 2.01 im Fenster bleiben ein Restrisiko für bestätigte echte Bewegungen; derzeit gibt es nur 2, beide DQ-K3.
- Nicht erklärte 2:1-Splits sieht weder DQ-K5 noch DQ-K3.
