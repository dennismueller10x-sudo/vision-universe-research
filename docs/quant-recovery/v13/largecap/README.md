# V13 LARGECAP – quellenbasierte Preisband- und Identitätsintervalle (AAPL, ABT, MS, USB, DD, COR, DOC)

Stand 29.10.2026, Basis `ac66b4e239`. Evidenzart SOURCE_EVIDENCE, `NOT_CERTIFIED`, `productionApproved: false`.
Keine Datei unter `*/data`, kein Produktpfad, Adapter unverändert, keine Gate-Änderung. Default-Loader und alle bisherigen
Optionssätze bleiben unverändert (Test `quant/tests/v13-largecap.test.mjs`).

## Methode und Registrierung

- `protocol-1.0.0.json` (sha256 `3710f99d…`, Commit `e6a6c4df08`) wurde **vor jedem Dokumentabruf und jeder Auswertung** committet.
  Kursanker: **A** Quartals-Hoch/Tief-Tabellen der 10-K/EX-13 (Toleranz 1 %, Randpuffer 10 Tage), **B** durchschnittlicher Kaufpreis
  der Rückkauftabellen (10-Q/10-K, Toleranz 10 % um min/max der Wochenschlüsse). Umrechnung in die Einheiten des Dokuments mit
  dokumentierten Faktoren (Split nur mit Split-Aussage in einer SEC-Meldung, SAB 4C; Spin-off-/Fusionsfaktoren nie zurückgerechnet).
  Identität: dieselbe Meldung nennt **Symbol und Börse**, oder sie liegt zwischen zwei solchen Meldungen ≤ 400 Tage; ältere Symbole nur
  mit Wechselanker. Lauf-Regeln: Bruch bei Abweichung > 10 %, zwei Fehlschlägen in Folge, Lücke > 366 Tage, ungeklammertem
  Split-Ereignis (120 Tage); Fehlquote ≤ 5 %; ≥ 104 Wochen; freigeschaltet wird **nur ein geschlossenes Intervall** (jüngster Lauf).
- `protocol-amendment-1.0.1.json` (sha256 `52a3ef0d…`, Commit `fc03a98e25`): nach Formatsichtung, **vor** jeder Auswertung –
  Apple-Tabellenlayout (Quartale als Spalten), Geschäftsjahresende je Jahr aus dem 10-K (MS-Umstellung Nov→Dez), Klarstellungen
  der Parser. Schwellen und Identitätsregel unverändert. Beobachtungen der Sichtung sind im Nachtrag offengelegt.
- Ergebnisse unter beiden Versionen: `cases-1.0.0.json` (Protokoll 1.0.0 + Nachtrag 1.0.1, Grundlage des Registers) und
  `cases-protocol-1.0.0.json` (nur 1.0.0). Einziger Unterschied: AAPL beginnt unter 1.0.0 am 2013-04-05 statt 2012-10-05.

## Ergebnis je Titel (`cases-1.0.0.json`)

| Titel | Intervall (Wochen) | Anker im Intervall (A/B, alle bestanden) | Identität | Bemerkung |
|---|---|---|---|---|
| AAPL | 2012-10-05 – 2025-09-26 (678) | 36 / 146 | „AAPL“ + Nasdaq seit 10-K 1994 | A 184/184 bestanden (1993–2017, Splits 2000/2005/2014 belegt). Ein zweiter akzeptierter Lauf 1993-11-12 – 2012-09-28 (986 Wochen, inkl. 2000-09-29) wird **nicht** freigeschaltet: Bruch durch eine ASR-Zeile 10-Q Jan 2013, in der der Parser regelkonform „$8,050“ (Restbetrag) als Preis las; Auswahlregel = jüngster Lauf |
| ABT | 2022-08-05 – 2026-06-26 (204) | 0 / 19 | „ABT“ erst ab 10-K 2019 genannt | 192 A- und 176 B-Anker vor 2018 ohne Identitätsanker; Lücke 2019-03 – 2022-08 (keine Rückkaufzeilen mit Preis); AbbVie 2013 bleibt außerhalb |
| MS | 2008-09-05 – 2026-06-26 (930) | 70 / 313 | „MS“ erst ab 10-K 2006 | Woche 2008-10-17 (+99 %, MUFG) liegt im Intervall, durch Quartalsband (6,71–44,50) und Monate geklammert → `RESOLVED_SOURCE_PRICE_BAND`, Rendite `PRICE_RETURN_ONLY`. Zwei B-Fehlschläge Sep/Okt 2008 (−16 %, −46 %, Krisenmonate, Mitarbeitertransaktionen) brechen den Lauf; das bestandene Quartal Sep–Nov 2008 eröffnet den nächsten (Grenzfall, siehe Grenzen) |
| USB | 2001-04-06 – 2026-06-26 (1.317) | 122 / 174 | „USB“ + NYSE ab 10-K405 1998 | 1996–1999 Abweichung ≈ 65 % (Faktor ≈ 3: Anbieterreihe passt nicht zu den Tabellen der alten USB), 2000/2001 Fusion Firstar (Faktor 1,265 nicht Split) → Historie vor April 2001 bleibt gesperrt |
| DD | 2017-11-03 – 2024-01-26 (326) | 0 / 40 | „DWDP“ (DowDuPont) und „DD“, Wechselanker in 10-Q/10-K 2020–2022 | Faktoren im Intervall: Dow-Abspaltung 1,487 (kein Split, beidseitig verankert), 1:3-Reverse-Split 2019-06-03 (Split-Aussage belegt). Danach keine B-Anker 2024-02 – 2025-09; Okt 2025 Fehlschlag (Parser ordnet die Zeile „November 1“ dem Oktober zu, Qnity-Abspaltung), Mai 2026 Fehlschlag (Faktor 0,333 vom 2026-06-24 ohne gefundene Split-Aussage → nicht als Split behandelt) |
| COR | 2016-07-01 – 2026-06-26 (522) | 6 / 117 | „ABC“ ab 10-K 2001, Wechselanker ABC→COR im 10-K 2023 | Frühere akzeptierte Läufe 2000-11 – 2006-11 und 2007-09 – 2015-03 nicht freigeschaltet (jüngster Lauf). Brüche: A-Abweichungen 2–3 % 2006/07 (zweimal in Folge), Rückkäufe 2015/16 zu 96 bzw. 52,66 USD (14–39 % unter den Wochenschlüssen, verhandelte Käufe) |
| DOC | 2024-03-01 – 2026-04-24 (113) | 0 / 7 | „DOC“ ab 8-K 2024-03-11 | Healthpeak (HCP/PEAK) nennt das Symbol vor 2019 nicht; Wechsel PEAK→DOC im 8-K 2024-02-21 belegt, aber Cover (PEAK) und Aussage („DOC“) > 400 Zeichen auseinander → kein Wechselanker nach Regel; Physicians Realty (alte Zeile DOC) bleibt ausgeschlossen |

Gesperrt bleibt jeweils alles außerhalb des Intervalls (vor `validFrom` und nach `validTo`); das Reihenende am letzten Anker ist **kein Delisting**
(Warnung `SERIES_TRUNCATED_AT_LAST_ANCHOR_NOT_A_DELISTING`).

## Register und Loader

- `quant/engines/research-largecap-price-anchors.cjs` (Schema `research-largecap-price-anchors-1.0.0`, 7 Datensätze), erzeugt von
  `scripts/quant/v13/largecap/build-registry.cjs` aus `cases-1.0.0.json` (Test: byte-identischer Neubau).
- `research-weekly-loader.cjs`: neue Option `identityEvidenceProtocolV13Largecap` in eigener Liste `LOADER_OPTIONS_V13`
  (erfordert `identityEvidenceProtocolV12`); `LOADER_OPTIONS`, `LOADER_OPTIONS_V12`, `research-identity-evidence.cjs` unverändert.
  Fail-closed: Registerschema, doppelte IDs gegenüber Dossier/V10/V12, Stammzeilensatz, aktive Zeile, Historienwächter über
  `[validFrom, validTo]`, Bandbestätigung nur exakt passender Split-Wochen (sonst unveränderter validate()-Fehler).
- QUALIFIED mit V13-Option: 4.588 → 4.595 (nur die sieben Titel; andere Reihen unverändert).

## Unabhängige Prüfung – `independent-check-1.0.0.json`: PASS_WITH_CONSERVATIVE_IDENTITY_FINDINGS

`python3 -I scripts/quant/v13/largecap/verify_largecap13.py` (eigene Implementierung, stdlib): 362 zitierte SEC-Körper neu gehasht;
alle 1.595 Anker-Zitate im Rohtext gefunden; Jahr/Quartal-Zuordnung, Perioden und Preise eigenständig hergeleitet; alle Bandtests,
Läufe, Intervalle und Historienwächter der sieben Titel **identisch**. 78 Befunde, alle in konservativer Richtung: die eigene
Symbolerkennung findet das kleingeschriebene Cover-Feld „Trading symbol(s)“ (AAPL-10-Q ab 2019, USB-10-K ab 2020), das der Extraktor
übersah. Wirkung (explorativ, nachträglich, **nicht** übernommen): AAPL endete am 2026-06-26 statt 2025-09-26 (717 statt 678 Wochen);
USB unverändert. Informativ: in einigen Meldungen innerhalb der Intervalle wurden Rückkauftabellen ohne verwertbare Preiszeile
nicht als Anker genutzt (Liste je Titel in der Prüfdatei).

## Reproduktion

```bash
P=<scratchpad>/v13-private/largecap
python3 -I scripts/quant/v13/largecap/fetch_docs.py --out $P/manifest.jsonl                 # SEC (580 Abrufe)
python3 -I scripts/quant/v13/largecap/build_facts.py --manifest $P/manifest.jsonl --out $P/facts-dev.jsonl
python3 -I scripts/quant/v13/largecap/fetch_8k.py --facts $P/facts-dev.jsonl --out $P/facts-8k.jsonl   # SEC (5 Abrufe)
cat $P/facts-dev.jsonl $P/facts-8k.jsonl > $P/facts-1.0.0.jsonl
node scripts/quant/v13/largecap/evaluate.cjs --facts $P/facts-1.0.0.jsonl --version 1.0.1 --out docs/quant-recovery/v13/largecap/cases-1.0.0.json
node scripts/quant/v13/largecap/evaluate.cjs --facts $P/facts-1.0.0.jsonl --version 1.0.0 --out docs/quant-recovery/v13/largecap/cases-protocol-1.0.0.json
node scripts/quant/v13/largecap/build-registry.cjs
python3 -I scripts/quant/v13/largecap/verify_largecap13.py . $P docs/quant-recovery/v13/largecap/independent-check-1.0.0.json
node --test quant/tests/v13-largecap.test.mjs
```

SEC: 585 Netzabrufe (Ledger privat), ≤ 2/s über `scripts/quant/sec/http_client.py`; frühere Privat-Caches nur lesend.

## Grenzen / offen

- Preisbänder prüfen Niveaus, nicht einzelne Wochen; B-Anker erkennen Niveaufehler < 10 % nicht; Dividenden nicht geprüft.
- Überlappende Perioden: Ein Lauf beginnt mit der ersten Periode nach dem Bruch in der Sortierung nach Periodenende; bei MS beginnt so
  das Intervall mit dem bestandenen Quartal Sep–Nov 2008, obwohl die B-Monate Sep/Okt 2008 brachen. Strengere Lesart (Intervall erst
  nach dem Bruch) wäre eine neue Version: MS dann ab Nov 2008, die Woche 2008-10-17 außerhalb.
- Parsergrenzen mit Wirkung: AAPL-ASR-Zeile (langer Lauf 1993–2012 nicht freigeschaltet), DD Okt 2025 (Fußnote am Monatsnamen),
  DD-Reverse-Split 2026 ohne erkannte Split-Aussage, Cover-Symbol klein geschrieben (s. o.). Korrekturen wären nachträglich → nur explorativ.
- Vorgänger-Registranten (andere CIK: AmeriSource Health, E. I. du Pont, alte USB/Firstar-Historie) sind nicht Teil von 1.0.0.
- Symbol-Aussagen fehlen in älteren ABT-, HCP- und MS-Meldungen; eine andere Identitätsquelle (z. B. CUSIP, Börsenmitteilung) wäre eine neue Version.
- SPY-/Index-Abdeckung mit der neuen Option ist nicht neu gerechnet (V12-Skript `coverage.cjs` mit zusätzlicher Option nötig).
