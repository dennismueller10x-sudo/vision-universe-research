# Supertrader 7.0 – E7-1: gezielte EDGAR-Prüfung der 83 V4-D1-Sitzungen

Stand: 25. Oktober 2026. Ergebnis `DIAGNOSTIC_NOT_CERTIFIED`. Maßgeblich ist der **Regelsatz 1.4.0**, Lauf **40185801366**.

**Kernergebnis:** Keine der 83 referenzexponierten, ungeklärten DQ-K5-Sitzungen ist durch ein EDGAR-Dokument als Split belegt.
- Bestätigt: 0 Splits und 0 echte Bewegungen. Das Overlay bleibt leer.
- Alle 83 Sitzungen bleiben `UNRESOLVED` und in Quarantäne.
- CC-5 wird **nicht** hochgestuft.

## Ziel und Eigentümerentscheidung

Wortlaut der Entscheidung E7-1 vom 25.10.2026:

> „Ich genehmige eine gezielte, kostenfreie und gedrosselte EDGAR-Prüfung der 83 betroffenen Sitzungen. Vorhandene Daten und Caches zuerst nutzen. Nur belegte Kapitalmaßnahmen übernehmen; unklare Fälle bleiben gesperrt. Keine pauschale CC-5-Freigabe.“

Die Prüfung hält folgende Grenzen ein:
- keine bezahlte Quelle und kein neuer Anbieter;
- keine Live-Aktivierung, keine Broker-Order;
- keine UI-Änderung, kein Merge;
- `quant/data` und der Snapshot bleiben unverändert.

Ausgangslage ist Regelsatz 1.3.0 ([SUPERTRADER_7_V4D1_RESOLUTION.md](SUPERTRADER_7_V4D1_RESOLUTION.md)):
- 1.3.0 verlangt für einen Split eine faktortragende, unabhängige Quelle. Bisher war das nur Tiingo-adjClose, und adjClose trägt die V4-D1-Faktoren nie.
- Ein 8-K-Item galt nie als Faktorbeleg. Meldungsdokumente wurden bisher nicht gelesen.

## Regelsatz 1.4.0

Der Regelsatz wurde vor jedem Lauf festgeschrieben.
- Code: [`integrity/ca-edgar.mjs`](../scripts/supertrader/source-faithful/integrity/ca-edgar.mjs).
- Hash: `8f9f5e69c90a49ec14654ab269b3de18a076cb336f2d1fe7583093bb144120dd`, im Test SF7-EDGAR-RULESET festgeschrieben.

1.4.0 ist 1.3.0 **unverändert**, ergänzt um genau **eine** neue faktortragende Quelle. Wie die früheren Fassungen bleibt 1.3.0 als eigene Fassung für den Vorher/Nachher-Vergleich erhalten:
- `ca-resolution.mjs` ist byte-gleich zu Lauf 40122736287;
- sein Hash `08d8a6ec…` ist doppelt festgeschrieben (SF7-REVIEW-L2 und SF7-EDGAR-RULESET);
- der Lauf bricht ab, wenn er sich ändert.

**Neue Quelle:** ein Einreichungsdokument **derselben CIK**, das das Split-Verhältnis nennt.
- Gelesen werden nur die Hauptdokumente vorregistrierter Formulare im Einreichungsfenster [d − 90, d + 100] Tage.
- Reihenfolge:
  1. 8-K mit Item 5.03 oder 3.03 (das nächstgelegene zuerst);
  2. 8-K mit Item 5.07, 3.01 oder 8.01;
  3. 10-Q / 10-K nach d;
  4. 424B1–5 nach d;
  5. DEF/PRE 14A und 14C vor d.
- Höchstens 6 Dokumente je Sitzung.

**Parser** (lokal; der Text wird verworfen):
- HTML entfernen, Entitäten und Bindestriche vereinheitlichen.
- Erkannte Formen:
  - `1-for-15`, `one-for-twenty-five`, `one (1)-for-twenty (20)`;
  - `1:50` (nur neben einem Split-Wort oder nach „ratio of“; Uhrzeiten wie 12:01 a.m. ausgeschlossen);
  - „every ten (10) shares … into one (1) share“;
  - Vorwärts-Splits wie `two-for-one` und `3-for-2`.
- Zahlwörter bis tausend; „and“ zählt nur nach „hundred“.
- Ein Verhältnis zählt nur, wenn höchstens 150 Zeichen entfernt ein Split-Wort steht.
- „reverse“ oder „consolidation“ beziehungsweise „forward“ in der Nähe legt die Richtung fest.
- **Spannen sind nie ein Faktor:**
  - ein Spannenwort davor (between, ranging, not less/more than, up to, …);
  - oder zwei Verhältnisse, die durch and / to / through / or verbunden sind.

**Bestätigung `CONFIRMED_UNDECLARED_SPLIT`.** Alle Bedingungen müssen erfüllt sein:
1. Der 1.3.0-Grund der Sitzung öffnet einen Dokumentpfad:
   - **Pfad A** `NO_FACTOR_BEARING_SOURCE`: Alle Aktien-, Kurs-, Eröffnungs- und Volumentests von 1.2.0/1.3.0 sind bestanden, es fehlte nur die faktortragende Quelle.
   - **Pfad B**: Die SEC-Aktienzahlen sind nicht nutzbar. Gründe: `SEC_SHARES_MISSING`, `_NOT_DEI`, `_NOT_BRACKETING`, `SEC_BRACKET_TOO_WIDE`, `SEC_MIXED_SOURCE_BRACKET`.
   - Jeder andere Grund bleibt unverändert, denn ein Dokument hebt keinen Widerspruch auf. Dazu zählen: erklärter Split in der Nähe, widersprechende Aktienzahl, ADR/IFRS, geteilte CIK, Ausreißer, nicht zugeordnetes Listing und die Gründe einer echten Bewegung.
2. Die CIK ist `KNOWN`, nicht geteilt, kein ADR/IFRS.
3. Es gibt genau **ein** Verhältnis.
   - Gezählt werden alle Nicht-Spannen-Aussagen der gelesenen Dokumente, die undatiert oder höchstens 135 Tage von d entfernt datiert sind.
   - Zwei verschiedene Verhältnisse ergeben `DOCUMENT_CONFLICTING_RATIOS`.
   - Ein Verhältnis außerhalb des Rasters (z. B. 5-for-4) zählt als zweites Verhältnis.
   - Nur Spannen ergeben `DOCUMENT_RANGE_ONLY`.
   - Ein Fusions- oder Umtauschangebot in der Passage ergibt `DOCUMENT_MERGER_CONTEXT`.
4. Das Verhältnis liegt auf dem 1.3.0-Raster.
5. Mindestens eine Aussage stammt aus einem **Nachereignis-Formular** (8-K, 10-Q, 10-K, 424B). Sie nennt ein Datum höchstens 80 Zeichen von einer Wirksamkeitsformulierung entfernt, und die erste Sitzung ab diesem Datum liegt **innerhalb ±2 Sitzungen von d**.
   - Ein Proxy oder eine Informationsschrift allein bestätigt nie (`DOCUMENT_PROXY_ONLY`).
6. Die Eröffnung wählt denselben Rasterwert, der Schluss liegt innerhalb ln 1,35 in derselben Richtung, und das Rohvolumen verhält sich wie dieser Split.
   - adjClose widerspricht nicht.
   - Pfad A: Das Aktienverhältnis wählt denselben Rasterwert, mit der Residuum-Grenze von 1.2.0.
   - Pfad B: keine weitere Markierung des Listings innerhalb ±10 Sitzungen.
7. Der EDGAR-Index deckt das 1.3.0-Fenster ab. Im Fenster liegt kein Fusions-, Abgangs-, Tausch- oder Übernahmeangebotsformular (auch SC TO-I / SC 13E4), kein 8-K 2.01 und kein 8-K ohne Items.
   - Eine nicht lesbare ältere Indexseite gilt als nicht abgedeckt (fail closed).
   - Ein nicht lesbares Dokument gilt als `DOCUMENT_FETCH_FAILED`.

`CONFIRMED_GENUINE_MOVE` behält die Regeln von 1.3.0. Ein Dokument kann eine echte Bewegung nur zurücknehmen (`DOCUMENT_CONTRADICTS_GENUINE`), nie neu bestätigen. Alles Unklare bleibt `UNRESOLVED` und in Quarantäne.

Eine Regel wurde vor dem ersten Lauf nachgeschärft, ausgelöst durch einen synthetischen Test: Ein Datum zählt nur neben einer Wirksamkeitsformulierung. Sonst hätte das Einreichungsdatum einer Satzungsänderung in derselben Passage als Wirksamkeitsdatum gegolten. Der Hash oben ist der Stand **nach** dieser Änderung und **vor** dem Probelauf. Nach den Läufen wurde keine Regel geändert.

## Quellen und Caches

| Quelle | genutzt | Anmerkung |
|---|---|---|
| Tiingo-Felder des Snapshots `sts1-134d…` | ja | Rohkurse, Rohvolumen, `splitFactor`, adjClose; kein neuer Abruf |
| `sec-pit-r14` (privater Eimer) | ja | CIK, Zuordnung (`KNOWN`/Name), Aktienzahlen; SHA-256 `a02c1847…` unverändert |
| versiegelter EDGAR-Index aus Lauf 40122736287 | nein | nur mit dem Eigentümerschlüssel lesbar, im Lauf nicht entschlüsselbar |
| `sec-delist-r13` | nein | enthält nur Delisting-Klassen, keine Accession-Nummern oder Items |
| privater EDGAR-Cache `_validation/edgar-ca-r1.json.gz` | ja | neu: vom Probelauf angelegt, vom Hauptlauf gelesen (13 Indizes, 47 Dokumente). Er enthält nur extrahierte Werte (Verhältnis, Daten, Kennzeichen, Passagen-Hash), **nie Dokumenttext**. Nach dem Hauptlauf: 79 Indizes, 284 Dokumente |
| EDGAR live | ja | `data.sec.gov/submissions` (ältere Seiten nur bei fehlender Abdeckung) und Hauptdokumente unter `www.sec.gov/Archives/edgar/data/…` |
| Exhibits (EX-3.1, EX-99.1) | nein | nicht gelesen, siehe Grenzen |

## Drosselung und Budget

Code: [`research/sf7-edgar-client.mjs`](../scripts/supertrader/source-faithful/research/sf7-edgar-client.mjs).
- Anfragen laufen sequentiell, mit mindestens 500 ms Abstand (höchstens 2 je Sekunde), 30 s Zeitlimit und dem User-Agent von `validation/sec-pit.mjs`.
- Das harte Gesamtbudget beträgt **600 Anfragen** je Lauf, die 1.3.0-Indexabfragen eingeschlossen; im Probelauf sind es 60.
- Weitere Grenzen: höchstens 6 Dokumente je Sitzung, höchstens 3 Indexseiten je CIK.
- Eine Anfrage über dem Budget wird nie gesendet. Sitzungen, die danach noch offen sind, werden `EDGAR_BUDGET_EXHAUSTED` (`UNRESOLVED`).
- Vor der ersten Dokumentanfrage prüft der Lauf die Anzahl im Umfang (83). Weicht sie ab, bricht er mit Exit 6 ab.

## Läufe

| Lauf | Modus | Ergebnis |
|---|---|---|
| [40185388680](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40185388680) | `sf7-ca-edgar-smoke` (400 Reihen, Umfang exponierte DQ-K3, Budget 60) | erfolgreich: 31 Sitzungen, 17 geprüft, 60/60 Anfragen, 4 über dem Budget abgewiesen, 0 Fehler, Cache angelegt |
| [**40185801366**](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40185801366) | **`sf7-ca-edgar`, maßgeblich** | erfolgreich, Commit `70dc3620a`, versiegelt abgelegt |

Lauf 40185801366 im Einzelnen:
- Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Datensatz `EXACT`, research-v1.
- Die Kandidaten wurden neu berechnet: 2.521 DQ-K3, davon 1.210 DQ-K5.
- 1.3.0 unverändert: 11 Indexabfragen, alle erfolgreich. Die Klassen sind identisch mit Lauf 40122736287: DQ-K5 1.210 `UNRESOLVED`; DQ-K3 2 echt, 2.519 ungeklärt.
- 1.3.0-Overlay-Manifest `e0a31fea…`, gleich Lauf 40122736287 (geprüft im Lauf).
- Umfang: **83** Sitzungen, wie erwartet.
- **BASE ist hash-identisch mit 6.0 für alle 11 Referenzen** (Ledger, Trades, Anzahl).
- 1.4.0-Overlay: 0 Einträge, `manifestSha256` `0014035ba58e07fc53e2015e052ae7e439794296dae1d5ad1cc1f7f95c751098`. Es unterscheidet sich von `e0a31fea…` nur durch die Klassifikator-Version im Manifest.
- CA ist für alle 11 Referenzen trade- und ledger-identisch mit BASE.
- Die CA-Q-K5- und CA-Q-K3-Abgleiche sind gleich wie unter 1.3.0. Alle Läufe sind abgestimmt.
- Code-Hashes: Engine `89fbcf86…`, CA `52d79c75…`, EDGAR `59c02d95…`.

## Verbrauchte Anfragen

| | Anzahl |
|---|---|
| Anfragen gesamt | **303 von 600** |
| davon Indizes (`submissions`) | 66 |
| davon ältere Indexseiten | 0 |
| davon Dokumente | 237 |
| fehlgeschlagen / über dem Budget abgewiesen | 0 / 0 |
| Cache-Treffer (Index / Dokument) | 17 / 33 |
| Dokumente ausgewählt und gelesen | 270 / 270 |

## Ergebnis je Klasse

**Die 83 Sitzungen unter 1.4.0:**

| Klasse | 1.3.0 | 1.4.0 |
|---|---|---|
| `CONFIRMED_UNDECLARED_SPLIT` | 0 | **0** |
| `CONFIRMED_MISDATED_DECLARED_SPLIT` | 0 | **0** |
| `CONFIRMED_GENUINE_MOVE` | 0 | **0** |
| `UNRESOLVED` | 83 | **83** |

**Prüfstatus:**
- 72 Sitzungen geprüft (CIK vorhanden). 11 sind ohne CIK nicht prüfbar (`SEC_LISTING_NOT_MAPPED`).
- Dokumentpfad: 0 Sitzungen in Pfad A, 21 in Pfad B, 62 ohne Pfad (Grund aus 1.3.0 bleibt).

**EDGAR-Grundwahrheit** (Label je Sitzung, für die Anbieter-Abnahme in E7-1):

| Label | Anzahl |
|---|---|
| `REVERSE_SPLIT_DOCUMENTED` | 1 |
| `FORWARD_SPLIT_DOCUMENTED` | 0 |
| `NO_SPLIT_DOCUMENT_FOUND` | 36 |
| `AMBIGUOUS` (zwei Verhältnisse, nur Spanne, Fusionskontext) | 4 |
| `UNCLEAR` (kein Verhältnis, Datum außerhalb, Proxy allein, außerhalb des Rasters) | 31 |
| `NOT_CHECKED` (keine CIK) | 11 |

`NO_SPLIT_DOCUMENT_FOUND` heißt **nicht** „kein Split“. Es bedeutet nur: Kein gelesenes Hauptdokument nennt ein Verhältnis mit Split-Wort.

**Dokumentbefund je Sitzung:**

| Befund | Anzahl |
|---|---|
| `NO_SPLIT_DOCUMENT_FOUND` | 36 |
| `DOCUMENT_NO_RATIO` | 16 |
| `DOCUMENT_EFFECTIVE_DATE_OUTSIDE_WINDOW` | 10 |
| `DOCUMENT_RATIO_NOT_ON_GRID` | 3 |
| `DOCUMENT_MERGER_CONTEXT` | 3 |
| `DOCUMENT_CONFLICTING_RATIOS` | 1 |
| `DOCUMENT_NO_EFFECTIVE_DATE` | 1 |
| `DOCUMENT_PROXY_ONLY` | 1 |
| Dokumentfaktor gefunden | 1 |

Der einzige dokumentierte Reverse-Split liegt in Pfad B. Er bleibt `SPLIT_REQUIRES_KNOWN_CIK`, weil die CIK nur über den Namen zugeordnet ist. Wie in 1.3.0 genügt eine Namenszuordnung für keine bestätigte Klasse.

## Ergebnis je Referenz (DQ-K5, exponiert)

| Referenz | exponiert | ungeklärt 1.3.0 | Split 1.4.0 | echt 1.4.0 | ungeklärt 1.4.0 |
|---|---|---|---|---|---|
| Turtle S1 | 16 | 16 | 0 | 0 | 16 |
| Turtle S2 | 14 | 14 | 0 | 0 | 14 |
| Minervini SEPA | 0 | 0 | 0 | 0 | 0 |
| Minervini Power Play | 12 | 12 | 0 | 0 | 12 |
| Darvas | 15 | 15 | 0 | 0 | 15 |
| Kullamägi Breakout | 27 | 27 | 0 | 0 | 27 |
| Pocket Pivot | 9 | 9 | 0 | 0 | 9 |
| Buyable Gap-Up | 14 | 14 | 0 | 0 | 14 |
| Weinstein Investor | 0 | 0 | 0 | 0 | 0 |
| Weinstein Trader | 4 | 4 | 0 | 0 | 4 |
| Holy Grail (W-RAS97) | 29 | 29 | 0 | 0 | 29 |

Eine Sitzung kann mehrere Referenzen betreffen; die Summe der Zeilen ist deshalb größer als 83.

## Gesperrt bleiben alle 83 Sitzungen

| Grund (1.4.0) | Anzahl | Herkunft |
|---|---|---|
| `NO_SPLIT_DOCUMENT_FOUND` | 15 | Pfad B: 9 nicht umschließend, 4 zu weit, 2 nicht dei |
| `DOCUMENT_NO_RATIO` | 2 | Pfad B |
| `DOCUMENT_RATIO_NOT_ON_GRID` | 1 | Pfad B |
| `DOCUMENT_EFFECTIVE_DATE_OUTSIDE_WINDOW` | 1 | Pfad B |
| `DOCUMENT_PROXY_ONLY` | 1 | Pfad B |
| `SPLIT_REQUIRES_KNOWN_CIK` | 1 | Pfad B, Verhältnis belegt, CIK nur über den Namen |
| `DECLARED_SPLIT_NEARBY` / `MULTIPLE_DECLARED_SPLITS_NEARBY` | 13 / 6 | unverändert aus 1.3.0 |
| `SEC_LISTING_NOT_MAPPED` | 11 | keine CIK, nicht prüfbar |
| `VOLUME_CONSISTENT_WITH_SPLIT`, `PRICE_RATIO_AT_STANDARD_FACTOR`, `CA_FILING_IN_WINDOW`, `GENUINE_REQUIRES_KNOWN_CIK`, `VOLUME_EVIDENCE_MISSING` | 6, 3, 3, 2, 2 | echte Bewegung nicht belegbar (1.3.0-Regeln) |
| `SHARE_RATIO_NO_MATCH`, `PRICE_RATIO_OFF_FACTOR`, `SHARE_AND_PRICE_DIRECTION_CONFLICT`, `MULTIPLE_JUMPS_IN_BRACKET` | 5, 4, 3, 2 | Widerspruch Aktienzahl ↔ Kurs (kein Dokumentpfad) |
| `ADR_OR_FOREIGN_FILER` | 2 | unverändert |

## Vorher / Nachher

- 1.3.0 gegen 1.4.0: keine Sitzung hat die Klasse gewechselt.
  - Nur bei 21 Pfad-B-Sitzungen hat sich der Grund verschoben: von einer SEC-Lücke auf den Dokumentbefund.
  - Außerhalb des Umfangs hat sich keine Sitzung geändert (`changedOutsideScope` 0, im Lauf geprüft).
- Readiness (`completion/sf7-completion-matrix.mjs` 1.2.0): `CA7` und die CC-5-Teilkriterien sind zahlengleich. Neu ist nur der Beleg `EDGAR`.

## Grenzen

- **Nur Hauptdokumente:** Exhibits (Satzungsänderung EX-3.1, Pressemitteilung EX-99.1) wurden nicht gelesen. Ein 8-K, das nur auf das Exhibit verweist, ergibt `NO_SPLIT_DOCUMENT_FOUND` oder `DOCUMENT_NO_RATIO`. Das betrifft wahrscheinlich einen Teil der 36 Sitzungen ohne Fundstelle.
  - Exhibits mitzulesen wäre eine Regeländerung. Sie bräuchte einen neuen Regelsatz 1.4.1 mit Vorher/Nachher und eine Begründung.
- Der Parser ist konservativ. Einige Fälle blockieren eher, als dass sie bestätigen:
  - Ein Spannenwort („up to“, „within“) in der Nähe macht ein Verhältnis zur Spanne.
  - „merger“ in der Passage blockiert.
  - Ein undatierter historischer Split mit anderem Verhältnis zählt als Widerspruch.
- 11 Sitzungen haben keine CIK-Zuordnung und sind mit EDGAR nicht prüfbar.
- Der EDGAR-Index ist live. Die gelesenen Werte liegen versiegelt und im privaten Cache vor; Dokumenttext wird nicht gespeichert, die Prüfsumme des Volltexts schon.
- Nicht erklärte 2:1-Splits sieht weder DQ-K5 noch DQ-K3. `CC5-e` bleibt deshalb unerfüllt.

## CC-5

**Keine CC-5-Hochstufung.**
- `CC-5-CORPORATE-ACTIONS` bleibt für alle 13 Strategien unerfüllt. Der Test, der das festhält (SF7-COMPLETION-MATRIX), bleibt unverändert.
- `CC5-a` (K5) ist nur für Minervini SEPA und Weinstein Investor erfüllt, und dort nur leer, weil sie keine Exposition haben.
- `CC5-b` (K3) ist nur für Minervini SEPA erfüllt.
- `CC5-e` (Erkennung vollständig) und `CC5-f` (Holdout) bleiben unerfüllt.

**Für den Eigentümer:** Mit freien Hauptdokumenten ist kein Split belegbar. Die verbleibenden Wege sind:
1. ein Regelsatz 1.4.1, der auch Exhibits liest (kostenfrei, im gleichen Budget);
2. die lizenzierte CA-Quelle aus E7-1 (Sharadar/Massive), geprüft gegen die EDGAR-Labels oben;
3. die Annahme, dass die Quarantäne der ungeklärten Sitzungen genügt.

Code:
- [`integrity/ca-edgar.mjs`](../scripts/supertrader/source-faithful/integrity/ca-edgar.mjs);
- [`research/sf7-edgar-client.mjs`](../scripts/supertrader/source-faithful/research/sf7-edgar-client.mjs);
- [`research/run-sf7-ca-edgar.mjs`](../scripts/supertrader/source-faithful/research/run-sf7-ca-edgar.mjs);
- Workflow-Modi `sf7-ca-edgar` und `sf7-ca-edgar-smoke`.

Tests: [`sf-sf7-ca-edgar.test.mjs`](../scripts/supertrader/tests/sf-sf7-ca-edgar.test.mjs), 11 Tests, nur synthetische Texte.
