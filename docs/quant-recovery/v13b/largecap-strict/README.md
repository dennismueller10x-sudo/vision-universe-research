# V13b LARGECAP-STRICT – strengere Intervallgrenze (Protokollnachtrag 1.1.0)

Stand 29.10.2026, Basis `7e38ec8e16`. Owner-Entscheidung 2 (V13b): die strengere historische Intervallgrenze (Anlass Morgan Stanley 2008)
als **neue versionierte Research-Regel**, nur mit Beleg aus Originalquellen; ohne Beleg bleibt der Zeitraum ausgeschlossen; kein
rückwirkendes Umschreiben. Evidenzart SOURCE_EVIDENCE, `NOT_CERTIFIED`, `productionApproved: false`. Keine Datei unter `*/data`,
kein Produktpfad, keine Gate-Änderung, keine neuen SEC-Abrufe (nur vorhandene Rohkörper aus `v13-private/largecap`).

## Regel und Registrierung

- `protocol-amendment-1.1.0.json` (sha256 `a90fa885…`, Commit `7fc5dbaa4d`) wurde **vor** jeder Auswertung unter 1.1.0 committet.
  Er ist nach Sicht der 1.0.1-Ergebnisse geschrieben (offengelegt: MS-Grenzfall und die Periodenlisten um die Intervallstarts,
  daraus auch AAPL/COR erkennbar); deshalb ist er **reine Einschränkung**: geclippt wird nur der unter 1.0.1 gewählte Lauf, kein
  Rückgriff auf andere Läufe → 1.1.0-Intervall ⊆ 1.0.1-Intervall oder gesperrt.
- Regel `STRICT_INTERVAL_BOUNDARY` (für alle sieben Titel, beide Grenzen, beide Ankerarten): ein freigeschaltetes Intervall enthält
  **keinen Tag einer fehlgeschlagenen Ankerperiode, die nicht selbst zum Lauf gehört**. Eine bestandene Periode anderer Auflösung
  (Quartal über einem Monat oder umgekehrt) hebt einen Fehlschlag nicht auf. Tolerierte Fehlschläge innerhalb des Laufs (5 %-Regel) unverändert.
- A-priori-Festlegung zur Auflösung: Grenze an der **gedruckten** Periodengrenze der SEC-Quelle – Rückkaufzeile (B) tagesgenau
  (Puffer 0), Quartalstabelle (A) mit dem 10-Tage-Puffer aus 1.0.0; keine Verortung innerhalb einer Periode über Anbieterreihe,
  Tagesdaten oder Dritte; neuer Start muss in einer bestandenen Laufperiode liegen, sonst nächste belegbare Grenze.
  Erste freigeschaltete Woche = erster Wochenschluss am/nach dem Tag nach der ausgeschlossenen Periode.

## Vorher/Nachher je Titel

| Titel | 1.0.1 (`cases-1.0.0.json`, unverändert) | 1.1.0 (`cases-1.1.0.json`) | Δ Wochen | Grenze setzt (Originalquelle) |
|---|---|---|---|---|
| AAPL | 2012-10-05 – 2025-09-26 (678) | **2012-11-09** – 2025-09-26 (673) | −5 | B-Zeile 10-Q 2013-01-24 „September 30 to November 3, 2012“ (fehlgeschlagen; Parserlesung „$8,050“ einer ASR-Zeile, wie unter 1.0.1 der Laufbruch) |
| ABT | 2022-08-05 – 2026-06-26 (204) | unverändert (204) | 0 | – |
| MS | 2008-09-05 – 2026-06-26 (930) | **2008-11-07** – 2026-06-26 (921) | −9 | 10-K 2009-01-29 (0001193125-09-013429): „Month #1 (September 1, 2008—September 30, 2008)“ $20,01 (−16 %) und „Month #2 (October 1, 2008—October 31, 2008)“ $36,13 (−46 %); Start belegt durch „Month #3 (November 1, 2008—November 30, 2008)“ $14,44 (bestanden) |
| USB | 2001-04-06 – 2026-06-26 (1.317) | **2001-04-12** – 2026-06-26 (1.316) | −1 | Fehlgeschlagenes Quartal Q1 2001 (10-K 2002 und 2003, Hoch/Tief 26,06/18,49) + 10-Tage-A-Puffer |
| DD | 2017-11-03 – 2024-01-26 (326) | unverändert (326) | 0 | – |
| COR | 2016-07-01 – 2026-06-26 (522) | **2016-09-02** – 2026-06-26 (513) | −9 | 10-K 2016-11-22: „August 1 to August 31“ $60,38 (−29 %); Start belegt durch Zeile September 2016 (bestanden) |
| DOC | 2024-03-01 – 2026-04-24 (113) | unverändert (113) | 0 | – |

Endseite: bei keinem Titel greift die Regel (kein nachfolgender Fehlschlag überlappt). Alle sieben bleiben freigeschaltet.
**MS:** die Woche 2008-10-17 (+99 %) liegt unter 1.1.0 außerhalb; MS lädt ohne `RESOLVED_SOURCE_PRICE_BAND`, Rendite wieder
`PRICE_RETURN` (unter 1.0.1 unverändert `PRICE_RETURN_ONLY`). Der MS-Start ist tagesgenau durch die gedruckten Zeilendaten belegt.

**1.0.x unverändert:** `docs/quant-recovery/v13/largecap/*` (cases-1.0.0 `f15feb58…`, cases-protocol-1.0.0, independent-check-1.0.0),
`research-largecap-price-anchors.cjs` (`1915b292…`) und `evaluate.cjs` byte-identisch (Test pinnt die sha256). `evaluate-1.1.0.cjs`
rechnet 1.0.1 mit dem unveränderten `evaluate.cjs` neu und verlangt Gleichheit mit dem eingefrorenen `cases-1.0.0.json`, bevor es clippt.

## Register und Loader

- `quant/engines/research-largecap-price-anchors-1.1.0.cjs` (Schema `research-largecap-price-anchors-1.1.0`, 7 Datensätze), erzeugt von
  `scripts/quant/v13b/largecap-strict/build-registry.cjs` (byte-identischer Neubau getestet); Quellen je Datensatz inkl. Grenz-Fehlschlägen und Startbeleg.
- Neue Option `identityEvidenceProtocolV13LargecapStrict` in eigener Liste `LOADER_OPTIONS_V13B` (erfordert `identityEvidenceProtocolV13Largecap`):
  ersetzt nur dann die 1.0.1-Datensätze der sieben Titel. Fail-closed: Schema/Kette, 1.1.0 ⊆ 1.0.1 je Titel, fehlender 1.1.0-Datensatz → `LARGECAP_STRICT_LOCKED`.
- Default-Loader und alle bestehenden Optionssätze (Default, V9/V10, V12, V13) gegen den Loader von `7e38ec8e16` byte-identisch (Test, 9 Listings).

## Unabhängige Prüfung – `independent-check-1.1.0.json`: PASS (0 Befunde)

`python3 -I scripts/quant/v13b/largecap-strict/verify_strict.py` (stdlib, eigene Implementierung): alle 1.595 Bandtests aus der Reihe neu,
Läufe mit Mitgliedschaft neu (= 1.0.1), Clipping/Startbeleg/History-Guard neu (= cases-1.1.0); jede grenzsetzende bzw. -belegende Periode
(20) aus dem **Roh**körper: sha256, Zitat gefunden, Periodendaten und Preis aus dem Rohtext neu geparst, Quartal über das 10-K-Geschäftsjahresende, Bandtest wiederholt.
Hinweis: der eigene Datumsparser las bei AAPL zunächst über die Zeilenbeschriftung hinaus (Folgezeile); auf die Beschriftungslänge begrenzt, dann PASS.

## Reproduktion

```bash
P=<scratchpad>/v13-private/largecap
node scripts/quant/v13b/largecap-strict/evaluate-1.1.0.cjs --facts $P/facts-1.0.0.jsonl --out docs/quant-recovery/v13b/largecap-strict/cases-1.1.0.json
node scripts/quant/v13b/largecap-strict/build-registry.cjs
python3 -I scripts/quant/v13b/largecap-strict/verify_strict.py . $P docs/quant-recovery/v13b/largecap-strict/independent-check-1.1.0.json
node --test quant/tests/v13b-largecap-strict.test.mjs
```

## Grenzen

- AAPL-Clip beruht auf derselben Parserlesung wie der 1.0.1-Laufbruch (ASR-Zeile, „$8,050“ = Restbetrag); eine Korrektur wäre nachträglich → nicht übernommen.
- USB verliert eine Woche allein durch den A-Puffer (Quartalsgrenzen sind Monatsnäherungen).
- Bänder prüfen Niveaus, nicht Einzelwochen; die übrigen 1.0.0-Grenzen gelten unverändert. Index-/SPY-Abdeckung mit der neuen Option nicht neu gerechnet.
