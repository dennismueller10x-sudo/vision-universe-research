# Supertrader 7.0 – V4-D1: Auflösung mit vorhandenen Kapitalmaßnahmen-Daten

Stand: 24. Oktober 2026. Ergebnis `DIAGNOSTIC_NOT_CERTIFIED`. Grundlage ist Eigentümerentscheidung E1 aus [SUPERTRADER_6_V4D1_CONTAINMENT.md](SUPERTRADER_6_V4D1_CONTAINMENT.md).

Code:
- [`integrity/ca-resolution.mjs`](../scripts/supertrader/source-faithful/integrity/ca-resolution.mjs) – Klassifikation, vorregistrierte Toleranzen
- [`integrity/ca-overlay.mjs`](../scripts/supertrader/source-faithful/integrity/ca-overlay.mjs) – erzeugtes Overlay-Manifest, Korrektur, Quarantäne
- [`research/run-sf7-ca-resolution.mjs`](../scripts/supertrader/source-faithful/research/run-sf7-ca-resolution.mjs) – Lauf
- Workflow-Modus `sf7-ca-resolution` (Probelauf `sf7-ca-resolution-smoke`: 400 Reihen desselben Snapshots)
- Tests: [`sf-sf7-ca-resolution.test.mjs`](../scripts/supertrader/tests/sf-sf7-ca-resolution.test.mjs)

## Ziel

Supertrader 6.0 hat V4-D1 nur **eingegrenzt**: markierte Sitzungen wurden in Quarantäne genommen, keine wurde geprüft. Diese Arbeit prüft jede markierte Sitzung mit Belegen, die schon vorliegen, und ordnet sie genau einer Klasse zu:

| Klasse | Bedeutung |
|---|---|
| `CONFIRMED_UNDECLARED_SPLIT` | Faktor **und** Sitzung belegt: Kurssprung am Tag d und SEC-Aktienzahl vor/nach d ergeben denselben Standardfaktor, das Rohvolumen bewegt sich passend |
| `CONFIRMED_GENUINE_MOVE` | SEC-Aktienzahl vor/nach d unverändert, keine erklärte oder von Tiingo angedeutete Kapitalmaßnahme, kein Ausreißer, keine Kapitalmaßnahme in den SEC-Meldungen um d |
| `UNRESOLVED` | alles andere – fehlende SEC-Daten, Identitätszweifel, zu weite Stichtage, widersprüchliche Belege |

Keine Vermutung wird als bestätigt ausgegeben. Was nicht eindeutig ist, bleibt `UNRESOLVED` und kommt in Quarantäne.

## Quellen (Reihenfolge aus E1)

1. **Tiingo-Felder derselben Snapshot-Reihe** (`sts1-134d…`, kein neuer Abruf): Roh-Open/-Close, Rohvolumen, `splitFactor`, `divCash`, `adjClose`.
2. **Marketstack: nicht genutzt.** Ein bestehender Zugang zu US-Kapitalmaßnahmen ist nicht belegt; ein neuer oder bezahlter Anbieter ist ausgeschlossen.
3. **SEC:**
   - die Aktienzahlen aus dem vorhandenen privaten Artefakt `_validation/sec-pit-r13.json.gz` (`validation/sec-pit.mjs --r13`; `dei:EntityCommonStockSharesOutstanding` je Deckblatt-Stichtag, erste Einreichung). Es liegt nicht im eingefrorenen Snapshot und wird einmal aus dem privaten Speicher gelesen; der Lauf hält seinen SHA-256 fest;
   - der öffentliche EDGAR-Einreichungsindex (`data.sec.gov/submissions`), **nur** für Kandidaten mit Referenzexposition, die alle Aktienzahl-Tests einer echten Bewegung bestanden haben: höchstens **eine** Anfrage je Emittent, keine Folgeseiten, Budget 150 im Hauptlauf. Gesucht werden 8-K-Items 2.01, 3.03, 5.03 und Fusions-/Abmeldeformulare in [d − 45, d + 15] Tagen.

## Kandidatenmenge

- Alle DQ-K3-Markierungen (Gesamtrendite-Relativ ≥ 3 oder ≤ 1/3) – eine Obermenge von DQ-K5. Gemeldet wird je Stufe.
- Zusätzlich je Markierung: Research-Universum am Vortag (wie 6.0) und **Referenzexposition**: Ein BASE-Trade einer der 11 Referenzen hat die Sitzung im Rückblick von 400 Tagen oder in der Haltedauer (wie 6.0).
- Die E1-Kandidaten sind die Vereinigung aus Universum und Exposition.

## Vorregistrierte Regeln und Toleranzen

Festgelegt vor dem ersten Snapshot-Lauf und Teil des Code-Hashes (`TOLERANCES`, `STANDARD_RATIOS`). Kein Wert wurde nach einem Ergebnis angepasst.

- **Standardfaktoren** N: 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 20, 25, 30, 35, 40, 50, 60, 70, 75, 80, 100, 120, 125, 150, 200, 250, 300, 400, 500, 1000 (1:N rückwärts, N:1 vorwärts).
- **Stichtage:** letzte Deckblatt-Aktienzahl vor d und erste nach d, je höchstens **135 Kalendertage** entfernt. Ein Stichtag genau am Tag d ist mehrdeutig und wird übersprungen. Nur `dei`-Werte; die Ersatzreihe „gewichtete verwässerte Aktien“ zählt nicht.
- **Split** (alle Bedingungen):
  - Aktienverhältnis q = vorher / nachher liegt innerhalb **±10 %** (logarithmisch) bei genau **einem** Standardfaktor; zwei Treffer → `UNRESOLVED`;
  - Schluss- **und** Eröffnungsrelativ des Tages d liegen innerhalb **±35 %** beim selben Faktor, gleiche Richtung;
  - Rohvolumen-Relativ (Median 10 Sitzungen ab d / Median 20 Sitzungen davor) auf der richtigen Seite von 1 und innerhalb **Faktor 4** des Erwarteten;
  - Tiingo-`adjClose` bereinigt entweder nichts oder genau diesen Faktor (±10 %), sonst Widerspruch;
  - **Vorwärts-Split (Kurs fällt):** zusätzlich muss Tiingo-`adjClose` den Faktor kennen. Eine Kapitalerhöhung in einen Absturz sieht sonst genauso aus.
- **Echte Bewegung** (alle Bedingungen):
  - q innerhalb **±10 %** von 1;
  - `adjClose` bereinigt nichts (±10 %);
  - kein Einheitenfehler (Relativ nahe 100 oder 1/100);
  - Relativ nicht innerhalb **±2 %** eines Standardfaktors (Verdacht auf ADS-Verhältnisänderung, die die Aktienzahl nicht zeigt);
  - keine Ausschüttung ≥ 25 % des Kurses in ±5 Sitzungen (Spin-off-Verdacht);
  - CIK aus der bekannten Zuordnung (`KNOWN`); eine reine Namenszuordnung reicht nicht;
  - EDGAR-Index deckt das Fenster ab, ohne Kapitalmaßnahme und ohne 8-K mit unbekannten Items.
- **Immer `UNRESOLVED`:**
  - erklärter Split in ±135 Tagen (Residuum eines erklärten Ereignisses);
  - Ausreißer: Die nächste Sitzung kehrt um (≥ 3 bzw. ≤ 1/3);
  - kein SEC-Eintrag, keine umschließenden Stichtage, Stichtage zu weit;
  - ADR oder IFRS-Emittent;
  - CIK gleichzeitig einem anderen am Tag d lebenden Listing zugeordnet (Identität nicht beweisbar);
  - weitere Markierung zwischen den Stichtagen.

## Korrektur: versioniertes CA-Overlay

- Das Manifest wird **vom Lauf erzeugt**, nie von Hand geschrieben.
  - Ein Eintrag je `CONFIRMED_UNDECLARED_SPLIT`: Segment, Datum, `splitFactor` (Tiingo-Semantik, 1:10 = 0,1), Hash der Belege.
  - Die Einträge sind sortiert und kanonisch gehasht (`manifestSha256`). Eine Handänderung bricht den Hash, die Anwendung scheitert dann (fail closed).
- Die Anwendung setzt nur `splitFactor` des Rohbalkens am Tag d, und nur dort, wo der Anbieter 1 trug.
  - Die Research-Balken entstehen danach über den **unveränderten** Produktionspfad (`snapshot-input.mjs` → `validation/lib.mjs#adjustSeries`, Konvention von ADR-002, gleiche Divisor-Semantik wie `quant/engines/return-series.js#splitFactors`).
  - Eine zweite Preisableitung gibt es nicht. Ein korrigierter Split ist von einem erklärten Split nicht zu unterscheiden (Test SF7-CA-SPLIT).
- Das Overlay ist eine **Transformation des Research-Datensatzes**. `quant/data` und der Snapshot bleiben unverändert.
  - Die in E1 vorgesehene Nachtragung als deklarierter Split in der Datenschicht ist ein eigener, versionierter Quant-PR. Er ist durch Gate A von diesem PR getrennt.
- **Quarantäne:** nur an `UNRESOLVED`-Sitzungen, mit der Schnittsemantik von `discontinuity.mjs` (BOOK). Eine bestätigte echte Bewegung bleibt ungeschnitten.

### Vorausschau (Lookahead)

- Die Klassifikation liest absichtlich Balken nach d (Stichtag danach, Volumen danach). Sie ist eine Datenprüfung, keine Handelsentscheidung.
- Einen später erkannten Split rückwärts einzurechnen, ist übliche Rückwärtsbereinigung. Jeder erklärte Split des Snapshots wirkt schon so.
- Vor d ändert die Korrektur die bereinigten Kurse um **eine Konstante**:
  - Relative, Rohkurs-Regeln (Kursuntergrenze, Dollarumsatz) und jede kausale Indikator-Kennzahl vor d bleiben gleich;
  - ab d ändert sich nichts (Test SF7-CA-PIT).
- Der Entscheidungspfad liest nur bereinigte Balken, wie bei erklärten Splits.
- Einstieg, Stop, Stückzahl und Abrechnung eines Trades nach d sind identisch mit dem Fall, in dem der Anbieter den Split erklärt hätte.
- Ein Trade vor d hat denselben Dollar-Einsatz und denselben Stop, auf die Kursstufe umgerechnet. Die Stückzahl skaliert mit dem Faktor, bis auf eine Stückrundung (Test SF7-CA-INVARIANT).

## Läufe

| Lauf | Modus | Ergebnis |
|---|---|---|
| [40099986593](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40099986593) | Probelauf auf dem Smoke-Snapshot `sts1-4af8…` | abgebrochen mit `CODE_VERSION_CHANGED` (der Smoke-Snapshot trägt einen älteren Code-Fingerabdruck); der Probelauf nutzt seitdem 400 Reihen des maßgeblichen Snapshots |
| [40100139101](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40100139101) | Probelauf, 400 Reihen von `sts1-134d…` | erfolgreich, alle Läufe abgestimmt |
| [40100630003](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40100630003) | Hauptlauf | Exit 5 `BASE_REGRESSION`. Ursache war ein Lesefehler des Abgleichs: Er suchte die 6.0-Ledger-Hashes unter `baseMatchesAuthoritative` statt `integrity.baseMatchesAuthoritative`. Die Tradezahlen waren gleich. Behoben, mit Test SF7-CA-REGRESSION |
| [40104542747](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40104542747) | Hauptlauf | abgebrochen, weil vor der Korrektur gestartet |
| [**40104626083**](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40104626083) | **Hauptlauf, maßgeblich** | erfolgreich, Commit `9a25c657c`, versiegelt abgelegt (`20261024T160203Z`) |

Maßgeblicher Lauf 40104626083:
- Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Datensatz `EXACT` (`3ea6443d…`), research-v1.
- `sec-pit-r13`: SHA-256 `04ba0f577bdc161ec78c10201ede41f5a94f41f3d7bb877e3b336607bf86e669`, 7.242 Listings mit Aktienzahlen.
- EDGAR-Index: 24 Anfragen, alle erfolgreich, bei einem Budget von 150. Hash der gelesenen Indizes `64725d7b…`.
- Overlay-Manifest: 6 Einträge in 6 Segmenten, `manifestSha256` `daf966103df95a3e265f776b9565759735cde89dc8813440d02850903dd4e656`. Es liegt versiegelt beim Eigentümer (`sf7-ca-resolution-overlay.sealed.json`).
- Code-Hash der Auflösung `a575927264a2…`.
- **Regressionsnachweis:** BASE ist für **alle 11 Referenzen hash-identisch mit 6.0**: Ledger-Hash, Trade-Hash und Tradezahl, geprüft gegen `completion/sf6-run-facts.mjs`.
- Alle 44 Referenzläufe sind abgestimmt (Ledger-Replay).
- Kennzahlen, Sitzungen und Belege je Kandidat liegen nur versiegelt vor.

## Ergebnis

### Klassen

| | DQ-K5 | DQ-K3 |
|---|---|---|
| markierte Sitzungen | 1.210 | 2.521 |
| `CONFIRMED_UNDECLARED_SPLIT` | 6 | 6 |
| `CONFIRMED_GENUINE_MOVE` | 8 | 24 |
| `UNRESOLVED` | 1.196 | 2.491 |
| im Research-Universum am Vortag | 109: 0 / 4 / 105 | 278: 0 / 13 / 265 |
| mit Referenzexposition | 83: 0 / 8 / 75 | 265: 0 / 24 / 241 |
| über einen Referenztrade gehalten | 13: 0 / 2 / 11 | 23: 0 / 3 / 20 |
| E1-Kandidaten (Universum oder Exposition) | 168: 0 / 8 / 160 | 463: 0 / 24 / 439 |

Die Teilzeilen lesen sich als Split / echte Bewegung / ungeklärt.

- Die **6 bestätigten Splits** sind alle Reverse-Splits: 1:5, 1:7, zweimal 1:10, 1:25, 1:35.
  - Vier lagen am Vortag unter 1 $, zwei zwischen 1 und 5 $.
  - Keiner liegt im Research-Universum oder hinter einem Referenztrade.
- Von den **8 echten Bewegungen** (DQ-K5) gehen 6 abwärts und 2 aufwärts. 5 davon lagen am Vortag bei mindestens 5 $.
- **SEC-Zuordnung** der DQ-K5-Sitzungen: 399 mit bekannter CIK, 278 nur über den Namen, 533 ohne SEC-Eintrag.

### Wirkung auf die Referenzen

- **CA** (nur Overlay): Alle 11 Referenzen sind **trade- und ledger-identisch mit BASE**. Kein korrigierter Split lag im Rückblick oder in der Haltedauer eines Referenztrades.
- **CA-Q-K5 / CA-Q-K3:** Die Quarantäne der ungeklärten Sitzungen deckt sich fast mit der 6.0-Quarantäne. Aufgelöst sind nur 14 von 1.210 bzw. 30 von 2.521 Sitzungen.
  - Turtle S1 unter CA-Q-K5 entspricht in Tradezahl und Abgleich genau DQ-K5-BOOK aus 6.0.
  - Der Knock-on bleibt so groß wie in 6.0: Kapital, Positionsplätze, RS-Population.

Lesehilfe zur Tabelle:
- „Exponiert“ zählt hier **Sitzungen** hinter BASE-Trades; 6.0 zählte Trades.
- „Abgleich“ heißt unverändert / geändert / entfernt / neu gegenüber BASE.

| Referenz | Trades BASE | DQ-K5 exponiert | davon echt | davon ungeklärt | gehalten | DQ-K3 exponiert | echt | ungeklärt | Trades CA-Q-K5 | Abgleich CA-Q-K5 | Abgleich CA-Q-K3 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Turtle S1 | 820 | 16 | 0 | 16 | 2 | 41 | 2 | 39 | 841 | 128 / 46 / 646 / 667 | 129 / 46 / 645 / 809 |
| Turtle S2 | 559 | 14 | 0 | 14 | 1 | 38 | 1 | 37 | 608 | 326 / 14 / 219 / 268 | 92 / 31 / 436 / 535 |
| Minervini SEPA | 954 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 957 | 901 / 39 / 14 / 17 | 526 / 325 / 103 / 126 |
| Minervini Power Play | 1.007 | 12 | 2 | 10 | 1 | 39 | 3 | 36 | 975 | 108 / 771 / 128 / 96 | 149 / 712 / 146 / 97 |
| Darvas | 19.556 | 15 | 1 | 14 | 0 | 30 | 1 | 29 | 19.633 | 18.167 / 1.306 / 83 / 160 | 15.011 / 4.389 / 156 / 316 |
| Kullamägi Breakout | 9.114 | 27 | 4 | 23 | 3 | 95 | 17 | 78 | 9.145 | 2.341 / 5.328 / 1.445 / 1.476 | 1.706 / 5.589 / 1.819 / 1.681 |
| Pocket Pivot | 1.872 | 9 | 0 | 9 | 2 | 25 | 1 | 24 | 1.864 | 201 / 1.067 / 604 / 596 | 187 / 1.055 / 630 / 655 |
| Buyable Gap-Up | 3.415 | 14 | 1 | 13 | 1 | 69 | 4 | 65 | 3.489 | 1.281 / 1.464 / 670 / 744 | 699 / 1.759 / 957 / 953 |
| Weinstein Investor | 1.348 | 0 | 0 | 0 | 0 | 5 | 2 | 3 | 1.361 | 311 / 916 / 121 / 134 | 369 / 815 / 164 / 195 |
| Weinstein Trader | 1.808 | 4 | 1 | 3 | 2 | 9 | 1 | 8 | 1.920 | 359 / 967 / 482 / 594 | 375 / 963 / 470 / 654 |
| Holy Grail (W-RAS97) | 4.025 | 29 | 5 | 24 | 3 | 99 | 7 | 92 | 3.915 | 386 / 2.366 / 1.273 / 1.163 | 380 / 2.262 / 1.383 / 1.510 |

Minervini SEPA hat keine exponierte Sitzung. Unter CA-Q ändern sich trotzdem 39 bzw. 325 Trades, weil die Quarantäne die Querschnitts-Population verändert, wie schon in 6.0.

### Ungeklärter Rest

Gründe der 75 **referenzexponierten** ungeklärten DQ-K5-Sitzungen:

| Grund | Anzahl | Bedeutung |
|---|---|---|
| `DECLARED_SPLIT_NEARBY` | 19 | erklärter Split in ±135 Tagen, meist ein Split-Faktor am falschen Tag (Sprungpaar) |
| `SEC_LISTING_NOT_MAPPED` | 13 | keine CIK oder keine Aktienzahlen für das Listing |
| `SEC_SHARES_NOT_BRACKETING` | 13 | keine Deckblatt-Aktienzahl auf beiden Seiten |
| `SHARE_RATIO_NO_MATCH` | 7 | Aktienzahl weder unverändert noch ein Standardfaktor (Kapitalerhöhung, Fusion …) |
| `GENUINE_REQUIRES_KNOWN_CIK` | 4 | Aktienzahl unverändert, CIK nur über den Namen zugeordnet |
| `SEC_BRACKET_TOO_WIDE` | 4 | Stichtage weiter als 135 Tage entfernt |
| `SEC_SHARES_NOT_DEI` | 4 | nur gewichtete Aktienzahl, kein Deckblattwert |
| `PRICE_RATIO_AT_STANDARD_FACTOR` | 3 | „echte“ Bewegung genau bei einem Standardfaktor (ADS-Verdacht) |
| `PRICE_RATIO_OFF_FACTOR` | 3 | Aktienzahl zeigt einen Faktor, der Kurs nicht |
| `ADR_OR_FOREIGN_FILER` | 2 | ADR oder IFRS-Emittent |
| `MULTIPLE_JUMPS_IN_BRACKET` | 2 | weitere Markierung zwischen den Stichtagen |
| `SHARE_AND_PRICE_DIRECTION_CONFLICT` | 1 | Aktienzahl und Kurs bewegen sich in dieselbe Richtung |

Gründe aller 1.196 ungeklärten DQ-K5-Sitzungen:

| Grund | Anzahl |
|---|---|
| keine SEC-Zuordnung | 378 |
| keine umschließenden Stichtage | 219 |
| Ausreißer mit Umkehr am Folgetag | 195 |
| erklärter Split in der Nähe | 155 |
| Stichtage zu weit entfernt | 54 |
| mehrere Sprünge zwischen den Stichtagen | 47 |
| Aktienzahl passt zu keinem Faktor | 35 |
| CIK nur über den Namen | 21 |
| nahe einem Standardfaktor | 20 |
| echte Bewegung ohne Referenzexposition (Meldungsprüfung bewusst nicht ausgeführt) | 19 |
| Kurs passt nicht zum Faktor | 13 |
| nur gewichtete Aktienzahl | 12 |
| Faktor mehrdeutig | 7 |
| Richtungskonflikt | 7 |
| ADR oder IFRS-Emittent | 5 |
| CIK mit einem zweiten Listing geteilt | 4 |
| Verdacht auf Einheitenfehler | 2 |
| Eröffnung passt nicht zum Faktor | 2 |
| Volumen fehlt | 1 |

Bei den 2.491 ungeklärten DQ-K3-Sitzungen kommt einmal `CA_FILING_IN_WINDOW` hinzu: Die Aktienzahl war unverändert, im Fenster lag aber eine Meldung zu einer Kapitalmaßnahme.

### Identität (§ 3.2)

- Ein nachweisbarer Zuordnungsfehler ist nicht aufgetreten, korrigiert wurde daher keiner.
- 21 DQ-K3-Sitzungen, davon 4 bei DQ-K5, gehören zu einer CIK, die am selben Tag einem zweiten lebenden Listing zugeordnet ist (z. B. mehrere Gattungen).
  - Sie stehen als `UNRESOLVED` (`CIK_SHARED_BY_LIVE_LISTINGS`); ihre Identität gilt als unbekannt.
- Eine reine Namenszuordnung reicht nie für eine echte Bewegung.

## Antwort: Ist V4-D1 aufgelöst?

**Nur dort, wo Belege vorliegen, und das ist ein kleiner Teil.**
- Aufgelöst sind 14 von 1.210 DQ-K5-Sitzungen (6 Splits, 8 echte Bewegungen), bei DQ-K3 30 von 2.521.
- Von den 83 referenzexponierten DQ-K5-Sitzungen sind 8 als echte Bewegung bestätigt. 75 bleiben ungeklärt.
- Die 6 bestätigten Splits berühren keine Referenz. Die Korrektur ändert daher kein Referenzergebnis.
- Für die Masse der Pennystocks reichen die vorhandenen Daten nicht.
  - 72 % der Sitzungen liegen unter 1 $.
  - Oft fehlt die SEC-Zuordnung, oder es gibt keine zwei Deckblattwerte im Abstand eines Quartals.

### CC-5 je Referenz

CC-5 verlangt drei Dinge:
- jede markierte Sitzung hinter einem Referenztrade ist `CONFIRMED_*`;
- jeder `CONFIRMED_UNDECLARED_SPLIT` ist in einem versionierten Daten-PR korrigiert;
- die Referenz ist neu gerechnet.

| Bedingung | Stand |
|---|---|
| alle exponierten DQ-K5-Sitzungen bestätigt | **erfüllt nur für Minervini SEPA und Weinstein Investor.** Beide hatten schon in 6.0 keine exponierte Sitzung, sind also leer erfüllt. Bei DQ-K3 gilt das nur für Minervini SEPA |
| dasselbe für die übrigen 9 Referenzen | **nicht erfüllt**: 3 bis 24 ungeklärte DQ-K5-Sitzungen je Referenz |
| bestätigte Splits korrigiert, Referenzen neu gerechnet | **im Research-Datensatz erfüllt** (Overlay, CA-Lauf). Die Nachtragung in der Datenschicht als versionierter Quant-PR ist **offen**. Für die Referenzen hat sie keine Wirkung, weil kein Split exponiert ist |
| neue Snapshot-Generation mit Vorher/Nachher (E1) | **offen**: Der Lauf rechnet auf der bestehenden Generation mit Overlay |

Die Readiness-Matrix (`sf6-readiness-criteria.mjs`, `v4d1Resolution`) bleibt unverändert. Ob die leer erfüllten Referenzen CC-5 erhalten, entscheidet der Eigentümer.

### Was für CC-5 bleibt

1. **Falsch datierte erklärte Splits** (`DECLARED_SPLIT_NEARBY`: 19 exponiert, 155 insgesamt bei DQ-K5).
   - Nötig ist eine eigene, vorher registrierte Regel: Sprungpaar und Faktor des erklärten Splits stimmen überein, dann wird die Sitzung verschoben.
2. **Fehlende SEC-Daten** (34 exponiert: `SEC_LISTING_NOT_MAPPED`, `SEC_SHARES_NOT_BRACKETING`, `SEC_SHARES_NOT_DEI`, `SEC_BRACKET_TOO_WIDE`).
   - Gezielt helfen würden die 10-Q-Aktienzahlen (`CommonStockSharesOutstanding` aus der Bilanz) als zweiter Stichtag.
   - Sie kommen aus derselben `companyfacts`-Quelle. Nötig ist ein Neubau von sec-pit (r14), kein neuer Anbieter.
3. **Echte Bewegungen mit Namens-CIK** (4 exponiert): Die Identität ließe sich über den EDGAR-Index belegen (frühere Namen, Ticker), mit einer Anfrage je Emittent.
4. **Kapitalerhöhung, Fusion, ADS** (18 exponiert: `SHARE_RATIO_NO_MATCH`, `PRICE_RATIO_*`, `ADR_OR_FOREIGN_FILER`, `MULTIPLE_JUMPS_IN_BRACKET`, Richtungskonflikt).
   - Mit freien Daten ist das nicht entscheidbar. Die Sitzungen bleiben ungeklärt und in Quarantäne, solange keine lizenzierte zweite CA-Quelle hinzukommt.
5. **Daten-PR in der Quant-Schicht** für die 6 bestätigten Splits, getrennt von diesem PR durch Gate A, und eine **neue Snapshot-Generation**.
6. **HOLDOUT** (`sts1-8595…`) ist hier nicht gerechnet. Das HOLDOUT-sec-pit-r13 liegt im eigenen Namensraum vor.

## Grenzen

- Marketstack wurde nicht genutzt, weil ein bestehender, budgetierter Zugang zu US-Kapitalmaßnahmen nicht belegt ist.
- `sec-pit-r13` ist nicht eingefroren.
  - Die verwendete Fassung ist über den SHA-256 im Beleg festgehalten.
  - Ein späterer Neubau ergibt einen anderen Hash.
- Der EDGAR-Index wird live gelesen (24 Anfragen). Sein Hash steht im Beleg, die Inhalte liegen versiegelt vor.
- Spin-offs sind ein Restrisiko der 8 bestätigten echten Bewegungen; zwei davon liegen über einem Referenztrade.
  - Ein Spin-off ohne Ausschüttung in den Tiingo-Daten und ohne 8-K-Item 2.01 im Fenster ist von einer echten Bewegung nicht sicher zu trennen.
- Nicht erklärte 2:1-Splits sieht weder DQ-K5 noch DQ-K3; das ist unverändert seit 6.0.
