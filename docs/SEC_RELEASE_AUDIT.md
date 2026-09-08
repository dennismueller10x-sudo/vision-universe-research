# SEC Financial Data Core — Release Audit

**Stand: 2026-09-08. Normalisierungslogik 1.5.0. GitHub-Actions-Lauf #15 auf
`claude/sec-financial-data-core-qiizhj`.**

Dieses Dokument ist der Nachweis vor dem Pull Request. Alle vorherigen Aussagen
wurden als unverifizierte Behauptungen behandelt und selbst nachgerechnet — aus
dem Code, den Tests, den erzeugten Artefakten unter `quant/data/sec/` und aus neu
geholten SEC-Primärdaten. Wo Dokumentation und Messung auseinandergingen, hat die
Messung gewonnen und die Dokumentation wurde korrigiert.

Das Audit hat **vier echte Fehler** gefunden, alle in den erzeugten Daten sichtbar
und keiner vorher bekannt. Alle vier sind behoben und durch Regressionstests
abgesichert, deren Gegenprobe ohne die Korrektur fehlschlägt.

---

## 1. Nachgerechnete Behauptungen

| Behauptung (vor dem Audit) | Selbst gemessen | |
| --- | --- | --- |
| 4 216 kanonische Fakten | 4 216 → **4 271** nach den Korrekturen | ✔ |
| 27 231 PIT-Beobachtungen | 27 231 → **27 385** nach den Korrekturen | ✔ |
| 602 Restatements | 602 → **604** | ✔ |
| 30 unterdrückte Zellen | 30 → **5** | ✔ |
| Gate A PASS 5/5 | PASS 5/5, `RUNTIME_VERIFIED` | ✔ |
| Gate B FAIL 5/5 | FAIL 5/5 | ✔ |
| Gate C PASS 5/5 | PASS 5/5, 3 636 Datensätze, 0 ohne Zeitstempel | ✔ |
| 492 Tests | **512** (237 + 267 + 8) | ✔ |

Die Zahlen vor dem Audit waren zum Zeitpunkt ihrer Messung richtig. Sie haben
sich durch die Korrekturen dieses Audits verändert, nicht durch einen Fehler in
der ursprünglichen Zählung.

## 2. SEC-Primärquellen-Abgleich

Der einzige Test, der die Pipeline verlässt: `scripts/quant/audit_primary_source.py`
holt `companyfacts` neu von `data.sec.gov`, sucht zu jedem geprüften kanonischen
Wert den XBRL-Rohdatensatz, aus dem er stammen muss, und vergleicht. Jede Zeile
trägt SEC-Concept, Accession, Einreichungsdatum, Periodenende, Rohwert,
normalisierten und kanonischen Wert — nachprüfbar von Hand gegen EDGAR.

**240 Prüfungen über fünf Unternehmen, sechs Kennzahlen, verteilt über die ganze
Historie. 0 Abweichungen.**

| Ergebnis | Anzahl | Bedeutung |
| --- | --- | --- |
| `MATCH` | 121 | Rohwert = normalisierter Wert = kanonischer Wert |
| `MATCH_NO_CANONICAL_COUNTERPART` | 40 | `operating_cash_flow`: Roh = normalisiert, aber `schema.js` kennt keine solche `metricId` |
| `NOT_EXPORTED_QUARTERLY_ONLY` | 79 | FY-Zeilen; der kanonische Export ist bewusst quartalsweise (§3) |
| `MISMATCH_*` | **0** | |
| `NOT_EXPORTED_UNEXPLAINED` | **0** | |

Ein unerklärter Nicht-Export zählt in diesem Werkzeug als Fehler und lässt den
Lauf fehlschlagen — ein Wert, den die Pipeline hält, der mit der SEC
übereinstimmt und trotzdem still niemanden erreicht, wäre kein geringerer Mangel
als eine falsche Zahl. Vor der Kalenderkorrektur (§3.4) gab es 14 Fälle der
Kategorie `NOT_EXPORTED_SUPPRESSED_AMBIGUOUS`; sie sind verschwunden.

`quant/data/sec/primary_source_audit.json` enthält alle 240 Zeilen.

## 3. Gefundene Fehler

### 3.1 Verfügbarkeit wurde in die unsichere Richtung gerundet — PIT, HIGH

252 von 4 216 kanonischen Fakten (6 %) trugen ein `availableAt` **vor** ihrem
eigenen `filedAt`, um ein bis drei Tage.

Die Ursache ist echtes SEC-Verhalten: Was die SEC nach 17:30 ET annimmt, bekommt
den nächsten Werktag als offizielles Einreichungsdatum, also liegt
`acceptanceDateTime` regulär am Vortag — über ein Wochenende drei Tage davor.
Beispiel: Apples 10-K für das Geschäftsjahr 2019, angenommen am Abend des
30. Oktober, offiziell eingereicht am 31. Oktober.

`availableAt` ist im kanonischen Schema als `date` typisiert, eine Reduktion muss
also stattfinden. Aber sie hat eine sichere und eine unsichere Richtung: Das
Deckeln des Zeitstempels auf sein eigenes Datum behauptet, das Filing sei ab
00:00 dieses Tages öffentlich gewesen, während es am Abend erschien — **bis zu
eine volle Handelssitzung Vorgriff**, genau an dem Tag, an dem ein Filing landet.

Korrektur: Nur das spätere von Annahmedatum und Einreichungsdatum ist nie zu
früh. Der exakte Zeitstempel bleibt im Factbook.

Gemessen nach der Korrektur: **0 von 4 271.**

### 3.2 Abgeleitete Fakten nannten das falsche Filing — Provenance, MEDIUM

Ein abgeleiteter Wert wird verfügbar, wenn sein **letzter** Input es wird. Die
Verfügbarkeit kam korrekt von dort, die Accession aber vom **ersten** Input.
Wurde ein späterer Input restated, zitierte der kanonische Fakt ein Filing, das
älter ist als sein eigener Wert: 77 Zellen trugen zwei Revisionen unter einer
Accession.

Korrektur: Provenance folgt der Verfügbarkeit. Gemessen nach der Korrektur:
**0 von 4 271.**

### 3.3 Merge-Konflikt gegen `main` — HIGH (Release-Blocker)

Der Branch war **nicht** konfliktfrei. `main` hat die Workflow-Datei über PR #47
mit einem Ref-Guard bekommen, der Branch hat sie unabhängig um einen Wochenplan
und den `resolve`-Schritt erweitert. Beides bleibt erhalten; die Fehlermeldung des
Guards nennt nicht mehr den Feature-Branch, weil sie nach dem Merge falsch wäre.

### 3.4 NVDA-Fiskaljahre um ein Jahr verschoben — HIGH

Der schwerste Befund. NVDAs gelernter Kalender war so beschriftet:

| Periodenende | Label | richtig |
| --- | --- | --- |
| 2010-01-31 | FY2010 | FY2010 |
| 2011-01-30 | **FY2010** ← doppelt | FY2011 |
| 2012-01-29 | **FY2011** | FY2012 |
| 2013-01-27 | **FY2012** | FY2013 |
| 2014-01-26 | **FY2013** | FY2014 |
| 2015-01-25 | FY2015 | FY2015 |

Zwei Geschäftsjahre mit dem Label 2010, kein Geschäftsjahr 2014, vier Jahre um
eins verschoben. Ein Konsument, der NVDA FY2012 abfragte, bekam das Jahr, das
NVIDIA selbst FY2013 nennt. Die anderen vier Unternehmen sind nicht betroffen —
geprüft ist die Beschriftung aller fünf.

Ursache: Das Label kommt aus dem `fy`-Feld des Jahresabschlusses — und `fy`
beschreibt das **Filing**, nicht den Fakt. Genau diese Falle vermeidet die
Pipeline überall sonst (`docs/SEC_NORMALIZATION.md` §2); nur beim Kalender wurde
das Feld pro Anker noch ungeprüft übernommen. NVDAs 10-Ks für die Jahre mit Ende
Januar 2011 bis Januar 2014 taggen es ein Jahr zu niedrig.

Das war zugleich die Ursache der meisten NVDA-Unterdrückungen wegen
`AMBIGUOUS_PERIOD_END`. Das Symptom war seit Lauf #9 sichtbar und dokumentiert,
die Ursache nicht — es wurde als „dünne frühe XBRL-Jahre" eingeordnet, statt
diagnostiziert zu werden.

Korrektur: Zwei Geschäftsjahre können nicht dasselbe Label tragen, und ein
späteres kann kein niedrigeres haben. Ein Anker, der das verletzt, ist keine
abweichende Namenskonvention, sondern unmöglich — er fällt auf den gelernten
Offset zurück und wird unter `calendar.rejected_anchors` mit dem, was das Filing
behauptet hat, gemeldet. Ein Anker, der bloß von der Mehrheit abweicht, gilt
weiterhin: Ein Emittent darf seine Konvention ändern.

Wirkung: **NVDA unterdrückte Zellen 29 → 4**, gesamt **30 → 5**, kanonische
Fakten **4 216 → 4 271**.

### 3.5 Data Inspector zeigte vier Kennzahlen nicht — MEDIUM

Die Inspector-Ansicht iterierte die Metric Registry; abgeleitete Kennzahlen
kommen aber aus `derived.reconstruct`. Damit fehlten `freeCashFlow`, `netDebt`,
`investedCapital` und `accruals` vollständig — vier der dreizehn
veröffentlichten kanonischen Kennzahlen waren in genau dem Werkzeug unsichtbar,
das sie prüfbar machen soll, und es sind die vier mit der subtilsten Provenance.

Der bestehende Test verlangte von jeder verfügbaren Zeile ein SEC-Concept. Das
stimmt für abgeleitete Werte nicht und darf auch nicht stimmen. Der Test wurde
nicht aufgeweicht, sondern nach Quelle getrennt und dadurch schärfer: Ein
SEC-Fakt braucht ein Concept, ein abgeleiteter braucht `formula_version` und
seine Inputs — und darf **kein** Concept haben.

## 4. Geprüft und in Ordnung

### 4.1 Fiskalperioden und die FY/Q4-Kollision

Über alle 4 271 kanonischen Fakten:

- `fiscalPeriod`-Werte: ausschließlich `Q1`–`Q4`. **Keine FY-Zeile.**
- Je (`metricId`, `fiscalYear`, `fiscalPeriod`) genau **ein** `periodEnd`.
- Je (`metricId`, `periodEnd`) genau **ein** (`fiscalYear`, `fiscalPeriod`) — das
  ist der Schlüssel, den `latestKnownFact` benutzt, und eine Kollision dort war
  der ursprüngliche Faktor-Vier-Fehler. **0 Kollisionen.**
- Quartalsenden innerhalb eines Geschäftsjahres aufsteigend. Kein Verstoß.
- `PERIOD_INTEGRITY` PASS für alle fünf: jede Quartalsbeobachtung umfasst genau
  ein Quartal (8 626 Quartalsbeobachtungen).

### 4.2 Point in Time

27 385 Beobachtungen geprüft, `PIT_NO_FUTURE_DATA_LEAK` PASS 5/5. Zusätzlich
direkt auf der kanonischen Ausgabe nachgerechnet:

| Invariante | Verstöße |
| --- | --- |
| `availableAt >= periodEnd` | 0 |
| `availableAt >= filedAt` | 0 (vorher 252, §3.1) |
| jeder Fakt hat `availableAt`, `filedAt`, `reportedAt`, `periodEnd`, `ingestedAt` | 0 fehlend |
| `availableAt` monoton über die Revisionen einer Zelle | 0 |

### 4.3 Restatements

604 restatete Fakten. Revisionsketten je Zelle: 3 155 mit einer Revision, 371 mit
zwei, 76 mit drei, 24 mit vier, 10 mit fünf.

| Invariante | Verstöße |
| --- | --- |
| `revisionId` lückenlos ab 0 | 0 |
| erste Revision ist `original` | 0 |
| keine zwei aufeinanderfolgenden Revisionen mit gleichem Wert | 0 |
| keine zwei aufeinanderfolgenden Revisionen aus derselben Accession | 0 (vorher 77, §3.2) |

Gate A prüft dasselbe von außen und gegen echte Daten, je Unternehmen mit
Erstmeldung, Korrektur und beiden Verfügbarkeitszeitpunkten. PASS 5/5.

### 4.4 NVDA-Fiskalkalender

Nach §3.4: 19 Geschäftsjahre, Labels streng steigend und eindeutig, vier
zurückgewiesene Anker dokumentiert. `week_based: true`, `label_offset: 0`,
Geschäftsjahresende Januar — keine Kalenderjahr-Annahme.

### 4.5 XOM-Entitätsauflösung

Gegen SEC-Daten neu gemessen:

| CIK | Name | Ticker laut SEC | periodische Filings |
| --- | --- | --- | --- |
| 0000034088 | EXXON MOBIL CORP | *(keiner)* | 132, 1993-12-31 … 2026-06-30 |
| 0002115436 | ExxonMobil Holdings Corp | XOM (NYSE) | 1, 2026-06-30 |

Die Pipeline benutzt die historische CIK (die gesamte Fundamentalhistorie) und
beschriftet sie mit dem deklarierten Ticker `XOM`. Beide Anforderungen sind
erfüllt: Die fast leere Holding-Historie wird **nicht** verwendet, und die CIK
wird **nicht** als Ticker erfunden. Der Override ist deklariert und mit
gemessener Begründung versehen; ein nicht deklarierter CIK-Widerspruch stoppt den
Lauf weiterhin.

### 4.6 Determinismus und Idempotenz

Gemessen an den committeten Artefakten zweier aufeinanderfolgender Läufe bei
unveränderter Logikversion (Läufe #11 und #12, Logik 1.3.0): Der Inhaltshash von
`canonical/AAPL.json` nach Entfernen der Wall-Clock-Felder ist in beiden Läufen
**identisch** (`34971d46…`). Läufe mit geänderter Logikversion erzeugen
erwartungsgemäß einen anderen Hash.

### 4.7 Provider-Abstraktion

Der Adapter erfüllt genau **eine** Schnittstelle und beansprucht keine weitere:

| Interface | Ergebnis |
| --- | --- |
| `FundamentalDataProvider` | **erfüllt** (`getFacts`, `getFilings`, `getFactPanel`, `healthCheck`) |
| `MarketDataProvider` | nicht beansprucht |
| `EstimateDataProvider` | nicht beansprucht |
| `CorporateActionsProvider` | nicht beansprucht |
| `ReferenceDataProvider` | nicht beansprucht |
| `MacroDataProvider`, `NewsDataProvider` | nicht beansprucht |

Das Fähigkeitsprofil deklariert alle `market.*` und `estimate.*` als `false`,
`reference.securityMaster: false`, `historicalUniverse: false` — und lässt
Ungeprüftes als `null` stehen statt es zu `false` zu verdichten.

### 4.8 Vendor-Leakage

3 636 kanonische Fakten aller fünf Unternehmen durch `findVendorLeakage` und
`schema.js` geprüft: **0 Leaks, 0 Schemaverstöße**. `Filing`-Datensätze tragen
`filingId` und `formType`, nicht `accession` und `form`. Kein Feld der SEC-Schicht
erscheint oberhalb der Grenze.

### 4.9 Datenqualität auf der kanonischen Ausgabe

| Prüfung | Verstöße |
| --- | --- |
| doppelte Fakten (Kennzahl, Jahr, Periode, Revision) | 0 |
| unbekannte Einheit | 0 |
| `usd_m` ohne `currency: USD` | 0 |
| `ratio`/`count_m` mit Währung | 0 |
| negativer Wert bei strikt nicht-negativer Kennzahl | 0 |
| Periodenende nach dem Einreichungsdatum | 0 |
| Geschäftsjahr außerhalb 2005–2030 | 0 |
| Quartalsreihenfolge innerhalb eines Geschäftsjahres | 0 |

Die Qualitätsengine markiert und korrigiert nie. Verbliebene ERROR-Befunde: fünf,
alle bei NVDA, alle auf **Rohfakten** mit einem Periodenende nach dem eigenen
Einreichungsdatum — `EntityPublicFloat`,
`CommonStockDividendsPerShareDeclared`,
`StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount` und zwei weitere
Rückkauf-Konzepte. **Keines dieser Konzepte bildet die Registry auf eine
kanonische Kennzahl ab**, sie erreichen die kanonische Schicht also nicht.
Inhaltlich sind es zukunftsgerichtete Angaben, bei denen ein in der Zukunft
liegendes Periodenende normale SEC-Praxis ist. Die ERROR-Severity ist dafür
streng angesetzt und wurde **nicht** abgesenkt.

### 4.10 Secrets

- Keine `.env`, kein Schlüssel, kein Token im Repository oder in der
  Branch-Historie. `quant/tests/secrets.test.mjs` grün (8 Tests).
- Die SEC-Pipeline liest fünf Umgebungsvariablen, alle Pfade außer einer:
  `SEC_USER_AGENT`. Deren Wert ist die Kontaktadresse, die die
  SEC-Fair-Access-Policy ausdrücklich verlangt — kein Geheimnis.
- SEC/EDGAR braucht keinen API-Schlüssel.
- `.gitignore` deckt `.sec-cache/`, `.quant-state/`, `quant/data/sec/raw/` und
  `quant/data/sec/facts/` ab; alle vier per `git check-ignore` geprüft, keine
  Datei daraus getrackt. Zusätzlich bricht ein Workflow-Guard ab, wenn etwas
  außerhalb `quant/data/` verändert oder ein Artefakt größer als 2 MB wird.

### 4.10a Committete Datenmenge skaliert linear — bekannt, nicht gelöst

Der Größen-Guard dieses Workflows schlug beim ersten Pull Request an und hat
dabei zwei Dinge gezeigt.

Erstens war er falsch zugeschnitten: Er maß ganz `quant/data`, wovon mehr als die
Hälfte früheren Phasen und den Phase-4A-Marktdaten gehört. Er scheiterte an
Wachstum, das dieser Workflow weder verursacht noch kontrolliert — und hätte
denselben Fehlschlag beim nächsten Commit des anderen Arbeitsstrangs erzeugt. Er
misst jetzt `quant/data/sec`, also was diese Pipeline selbst schreibt: 5,9 MB
gegen ein Budget von 8 MB.

Zweitens, und das bleibt offen: **5,9 MB für fünf Unternehmen skalieren linear.**
Bei 500 Unternehmen wären das rund 590 MB committeter Artefakte — für ein
öffentliches Repository nicht tragbar. Die Hälfte davon sind die
Inspector-Ansichten (2,9 MB), die Diagnose sind und nicht Datenschicht; die
kanonische Schicht selbst sind 2,4 MB.

Das ist keine Aussage über die Ingestion — die skaliert über Checkpointing und
den Bulk-Pfad — sondern über den *Auslieferungsweg*. Ein größeres Universum
braucht einen anderen: die kanonische Schicht als Parquet oder DuckDB neben dem
Repository, den Inspector auf Abruf statt vorberechnet, oder committete
Artefakte nur für ein Referenzuniversum. Diese Entscheidung gehört in die
Skalierungsphase und wird hier nur benannt, nicht getroffen.

### 4.11 Erzeugte Dateien

Committet werden 5,8 MB unter `quant/data/sec/`: die kanonische Schicht
(5 Dateien), Index, Coverage-Matrix, Gate-Bericht, Inspector-Ansichten (5),
Universumsauflösung und der Primärquellen-Abgleich. **Nicht** committet:
Rohpayloads, Factbooks, HTTP-Cache, Checkpoint-Zustand.

### 4.12 Workflow

20 Schritte, YAML validiert, jeder eingebettete Python-Heredoc kompiliert, jedes
aufgerufene CLI-Kommando existiert, jedes Node- und Python-Skript existiert,
jede referenzierte Konfigurationsdatei existiert — alles als Test, nicht als
Sichtprüfung (`scripts/quant/tests/test_workflows.py`, 12 Tests).

Ein Teil-Lauf kann nicht als Erfolg durchgehen: Nach `ingest` (mit
`continue-on-error`) läuft `retry`, danach ein Vollständigkeitscheck, der jedes
konfigurierte Unternehmen im Store verlangt. Beide Testsuiten laufen **vor** dem
Ingest; ein roter Test bricht ab, bevor eine SEC-Anfrage gestellt wird.

Beim Merge fiel auf, dass der aus `main` übernommene Ref-Guard vom
Kommando-Parser des Workflow-Tests als Aufruf `cli.py providers` missdeutet
wurde, weil seine Dateiliste mit `scripts/quant/cli.py` beginnt. Der Parser
verlangt jetzt einen echten Aufruf; Gegenprobe: Ein tatsächlich falsches Kommando
wird weiterhin gefunden.

### 4.13 Performance, gemessen

| | Kaltstart (Lauf #4) | warmer Cache (Lauf #14) |
| --- | --- | --- |
| Universum auflösen | 15 s | 1 s |
| Ingest 5 Unternehmen | 13 s | 7 s |
| kanonischer Export | 4 s | 10 s |
| Gesamtlauf inkl. Tests | 78 s | 75 s |

Ein Drittel der Laufzeit sind die beiden Testsuiten (31–33 s), nicht die SEC.

Anfragen pro Lauf: eine Tickerkarte für den ganzen Lauf, plus je Unternehmen eine
`submissions`-Anfrage (JPM zusätzlich 71 Seiten Historie) und eine
`companyfacts`-Anfrage. Das Rate Limit liegt bei 5 Anfragen/Sekunde; in fünfzehn
Läufen kam keine Rate-Limit-Antwort.

**Keine Hochrechnung auf 500 oder 5 000 Unternehmen wird hier behauptet.**
Gemessen ist der Durchsatz bei fünf. Architektonisch vorhanden und getestet, aber
nicht bei Größe gemessen: Checkpointing mit Wiederaufnahme, Retry-Queue,
`--limit`, der inkrementelle Pfad über die Filing-Signatur (unveränderte
Unternehmen überspringen den großen `companyfacts`-Abruf) und der
`companyfacts.zip`-Bulk-Pfad, der ab etwa 500 Unternehmen die günstigere Route
ist. Der nächste Skalierungsschritt ist ein Lauf über ein größeres Universum,
keine Codeänderung.

## 5. Bekannte Grenzen (unverändert)

1. **Survivorship-Bias im Universum.** SEC hat kein Security Master und keinen
   Delisting-Feed. Gate B bleibt FAIL, 5/5, `universeSizeDuring: 0`.
2. **Keine Kursdaten.** Kein Value-, kein Momentum-Faktor aus dieser Quelle.
   `MARKET_DATA_AVAILABLE` ist NOT_APPLICABLE, nicht FAIL.
3. **Keine Corporate Actions, keine Split-Historie, keine Analystenschätzungen.**
4. **Strukturierte Daten erst ab 2007/2008.** 1993–2006 ist FILING_ONLY.
5. **`operatingCashFlow`, `eps`, `cash`, `totalDebt` haben keinen kanonischen
   Platz.** `quant/engines/schema.js` `METRIC_UNITS` deklariert 15 `metricId`s;
   die SEC-Schicht bedient 13 davon, die beiden übrigen (`ebitda`,
   `dividendPerShare`) stehen dokumentiert in `UNSUPPORTED_METRICS`. Die
   genannten vier Kennzahlen werden intern normalisiert und PIT-aufgelöst — der
   Primärquellen-Abgleich prüft `operating_cash_flow` mit — und speisen
   `freeCashFlow` und `accruals`, aber sie zu veröffentlichen hieße, das
   gemeinsame Schema zu erweitern. Das ist bewusst nicht Teil dieser Phase.
6. **5 unterdrückte Zellen** (NVDA 4, XOM 1) in den frühen XBRL-Jahren, gemeldet
   mit Grund `AMBIGUOUS_PERIOD_END`.
7. **`securityId` ist `sec_<TICKER>`**, der Konvention von `main` folgend. Ändert
   sich ein Ticker, ändert sich die ID. Für die fünf Testtitel stabil, für einen
   Emittenten mit Tickerwechsel nicht — bekannt, nicht in dieser Phase geändert,
   weil es die Konvention des bestehenden Systems ist.
8. **Nur fünf Unternehmen gemessen** (§4.13).
9. **Der committete Auslieferungsweg skaliert linear** (§4.10a): 5,9 MB für fünf
   Unternehmen, also rund 590 MB für 500. Die Ingestion skaliert, die
   Auslieferung über committete Artefakte nicht.

## 6. Ergebnis

| Klasse | Offen |
| --- | --- |
| CRITICAL | **0** |
| HIGH | **0** (3 gefunden, 3 behoben) |
| MEDIUM | **0** (2 gefunden, 2 behoben) |
| LOW / INFO | 8 dokumentierte Grenzen (§5), keine davon ein Defekt |

512 Tests grün: 237 Python (SEC), 267 JavaScript (davon 34 SEC-Adapter), 8
Academy. Kein bestehender Test gelöscht, keine Assertion abgeschwächt, keiner
übersprungen. Zwei Tests wurden im Zuge von Korrekturen **verschärft** (§3.5,
§4.12).

**READY FOR PR.**
