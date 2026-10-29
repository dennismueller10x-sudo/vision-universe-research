# Übergabe nach V13 (Stand 29.10.2026)

Einstieg für die nächste Entwicklungsrunde.

Ausführliche Berichte:
- [DATA_QUALITY_V13_FINAL.md](DATA_QUALITY_V13_FINAL.md)
- [DATA_QUALITY_V12_FINAL.md](DATA_QUALITY_V12_FINAL.md)
- [ALPHA_DISCOVERY_V11.md](ALPHA_DISCOVERY_V11.md)
- [BACKTEST_V10_FINAL.md](BACKTEST_V10_FINAL.md)

Alles Research ist `NOT_CERTIFIED` mit `productionApproved: false`.

**Negative V10–V13-Ergebnisse gelten unverändert:**
- kein SPY-Überschuss nach Holm in irgendeiner Signal-, Faktor- oder Strategiestudie;
- keine künstliche Überrendite;
- keine Verallgemeinerung, dass Strategien grundsätzlich keinen Mehrwert erzeugen können.

## 1. Merge-Commits auf main

| Merge | PR | Inhalt |
|---|---|---|
| `9447b75b2e` | #1117 | Research-Portfolio: Vollverkauf ohne Rundungsrest |
| `1f7a3af718` | #1118 | `cli.py consumer`: Coverage/Historie folgen `--out` |
| `bcc2dc9084` | #1120 | market-cap-1.2.0: Börsenwert bei XBRL-Skalenfehler zurückgehalten |
| `1a190df67d` | #1121 | Fundamental: belegte Spin-offs bereinigen Aktienzahl/EPS nicht |
| `c7c9c2bb2d` | #1091 | Quant V10–V13 Research (Datenrettung, Studien, Register, Berichte) |

**Zurückgehalten:** #1119 (Security-Master-Status, 132 SEC-belegte Deaktivierungen).
- Grund: G7 hat keinen Freigabeweg für Deaktivierungen.
- Der freigegebene Wechsel 1.1.0 → 1.3.0 ist noch nicht gelaufen.
- Die Entscheidungsvorlage steht im PR-Kommentar (Optionen A/B/C, Empfehlung A = Staffelung ohne Gate-Änderung nach dem 1.3.0-Lauf).

**Prüfung vor den Merges:**
- **Kombinierter Stand** (main + alle fünf PRs) lokal geprüft:
  - quant 3.544/3.545 (die eine Abweichung, der alte Vollverkauf-Test, wurde in #1091 zum Regressionstest umgestellt);
  - core 299, fundamental 74, discover/supertrader/screener 1.567 (10 übersprungen), technical 35;
  - Python OK.
- **CI:** Jede PR vor dem Merge grün. GitHub hat keine Pflicht-Checks konfiguriert; geprüft wurden alle gelaufenen Checks. Vercel ist kein Check-Lauf; das Kontingentproblem kam nur als Kommentar und blockiert nichts.

**main nach dem Merge** (`c7c9c2bb2d`):
- lokal quant 3.544 bestanden / 1 übersprungen (privater Datentest), core + fundamental 373, Python OK, Isolationsprüfung OK;
- CI 7 erfolgreich, 43 übersprungen, 0 Fehler.

## 2. Tatsächlich integrierte Korrekturen

**Produkt** (wirken mit dem nächsten regulären Datenlauf; generierte Daten wurden nicht angefasst):
- Börsenwert-Skalenprüfung: heute LTM und CSHR zurückgehalten; CSHR ist ein bewusster Fehlalarm.
- Spin-off-Basis: 78 falsche Aktienzahl-Bereinigungen → 0; GE GJ 2023 121 → 152 Mrd. USD.
- Vollverkauf im Research-Portfolio.
- consumer-Ausgabepfad.

**Research** (alle opt-in; Default-Loader und Produktadapter byte-identisch):
- V10:
  - CA-Register (30 Ereignisse) und TR-Register (8 Titel);
  - Identitäts- und Lifecycle-Register;
  - Materialisierung der SEC-Korrekturen; die PZZA-/Consumer-Nachprüfung ist für den 02.11.2026 eingeplant.
- V12:
  - PIT-S&P-500 aus SEC-Fondsbeständen;
  - XBRL-Marktkap.-Korrektur (Research-Panel);
  - Listingreferenz.
- V13:
  - Register delisteter Reihen 1.0.0 (1.675 QUALIFIED) und 1.1.0 (1.688, +13 belegte Kurssturz- bzw. Ausschüttungsfälle);
  - Large-Cap-Intervalle 1.0.1 und 1.1.0 (strikt).
- V13b (dieser Folge-PR):
  - LARGECAP-STRICT 1.1.0: MS ab 2008-11-07;
  - F1w-Vergleichsstudie 2.0.0;
  - HIST: Kurssturzfälle und SPX-Endwerte vor 2010.

**Loader-Optionen** (nur für ausdrücklich aktiviertes Offline-Research freigegeben):
- `identityEvidenceProtocolV10`, `identityEvidenceProtocolV12`, `identityEvidenceProtocolV13Largecap`, `identityEvidenceProtocolV13LargecapStrict`.

## 3. Private delistete Kursarchive

**Nur in diesem Sitzungs-Scratchpad, nicht im Repository:**
- v13-private: Rohabruf 4 Läufe, Reihen, Schlüssel, Large-Cap-Belege; 457 MB.
- v13-studies/private: Ereignisdateien; 229 MB.
- v13b-private: SEC-Dokumente HIST; 267 MB.

Der Container ist flüchtig.

**Neu erzeugbar:**
- Branch `claude/v13-delisted-fetch-4ho3rd`:
  - Workflow `quant-v13-delisted-fetch.yml` mit der Commit-Marke `[v13-delisted:<batches>]`.
  - Für einen neuen Lauf vorher ein neues Schlüsselpaar erzeugen und `scripts/quant/v13/delisted/fetch-pubkey.pem` ersetzen.
  - Kosten: 8.620 Anfragen, Pauschaltarif.
- Danach `scripts/quant/v13/delisted/qualify.py`.
- Das Register bindet jede Reihe per `pointsSha256`; ein neuer Abruf muss diese Hashes reproduzieren, sonst schlägt der Loader fehl.

**Dauerhafte private Ablage** (z. B. R2-Bucket des Owners) ist eine offene Entscheidung.

## 4. Ungeklärte Identitäten und Endwerte

**Delistete Ketten:**
- 1.819 ohne CIK-Verknüpfung;
- 162 nur mit neuerem Listing desselben Tickers;
- 196 CA_UNRESOLVED (davon 15 der 28 Sturzfälle weiter ungeklärt: 8 SPAC-Zusammenschlüsse, EPRS, GRDI, MDR, NBG, NYRT, PACW, SILK);
- 151 nur Kurs mit zensiertem Ende.

**Endwerte:**
- Fusionsgegenleistungen sind für die delisteten Reihen nicht verifiziert, nur als Band ±10 % gerechnet.
- SPX-Austritte 1995–2009: 28 belegte Endwerte (First Data 2006 im Primärregister falsch – Spin-off Western Union ignoriert –, markiert in `v13b/hist/spx-terminal-review-1.0.0.json`; vor Nutzung ausschließen). 473 von 502 Zeilen bleiben unbeobachtbar.

**Große Titel:**
- Ältere ABT-, HCP- und MS-Filings nennen kein Symbol.
- AAPL-Parserlücke (ASR-Zeile „$8,050“).
- DD-Splitaussage 2026.
- Kleingeschriebenes Deckblattfeld.
- Alle nur explorativ korrigierbar.

## 5. Tatsächlich veränderte Backtest-Ergebnisse

| Studie | vorher | nachher |
|---|---|---|
| V10-Signalstudie, SPY-Überrendite je Zelle | F0 | F1 −0,01 … +0,14 PP; F1w/F1d bis +0,33 PP; Holm 7 → 7 (F1), 9 (F1w/F1d); **0 SPY-Zellen signifikant** |
| EW-Population 2000–2025 | 13,86 % | 13,82 % (F1), 13,81 % (F1w); SPY 6,17 % |
| PIT-S&P-500 Survivorship-Term | 0,76 PP | 0,73 PP; Untergrenze 3,98 → 3,48 PP |
| Finanzierte NEW_52W_HIGH-Strategie | 16,4 % | 19,7 % nur in F1w/F1d: Pfadabhängigkeit der 10-Slot-Konstruktion, kein Populationseffekt |
| Large-Cap-Intervalle | – | sieben Titel freigeschaltet (QUALIFIED 4.588 → 4.595), strikt 1.1.0 kürzer (MS −9, COR −9, AAPL −5, USB −1 Wochen) |

**Noch nicht ausgewertet:** Register 1.1.0 (+13 Reihen) und die SPX-Endwerte vor 2010 in den Studien. Beides braucht eine Loader-Erweiterung und eine neue Registrierung.

## 6. Grenzen der historischen Grundpopulation

- **Delistings vor 2010:** praktisch unbeobachtbar. Die Anbieterliste führt 1995–2009 nur 46 beendete Ketten; von 4.468 SEC-Delisting-Ereignissen hat 13 eine Kursreihe.
- **Abdeckung gegen die Anbieterreferenz:** 2005 74 %, 2016 71 %, 2024 87 %. Die Referenz selbst ist vor 2013 überlebensverzerrt.
- **SEC-Delisting-Ereignisse mit Kursreihe:** ≈ 30 % je Jahr ab 2015, nahe 0 vor 2009.
- **Frame-Regel:** Die registrierte Wochenlabel-Regel lässt nur 390 von 1.675 delisteten Ketten zu. F1w/F1d bleiben Sensitivitäten und werden ohne neue Registrierung nicht Standard.
- **Renditebasis:** in den Studien überwiegend Kursrendite; Gesamtrendite nur für 8 Titel und die delistete Teilmenge.

## 7. Verbleibende produktkritische Probleme

1. **Security Master:** 132 belegte Delistings stehen in Produktdaten weiter auf ACTIVE (#1119 zurückgehalten); weitere 33 Fälle ohne ausreichenden Beleg.
2. **Wechsel 1.1.0 → 1.3.0:** steht aus (Owner-Lauf mit `approved_changes`).
3. **Unbelegte Spin-offs** bleiben als Splits gelesen, z. B. FTV 1,327 (2025); FTV GJ 2024 etwa 25 % zu niedrig.
4. **Börsenwert:** nur zurückgehalten, nicht korrigiert (Stufe 2 offen); der UI-Text für den neuen Grund fehlt (Frontend-Sperre).
5. **OOS-Gate:** im Zertifizierungsauswerter fest `false` (`scripts/quant/build-backtest-certification.mjs`); Setup ist unter dem aktiven Vertrag zu keinem Datum zertifizierbar.
6. **Alte PR-Commits mit Anbieterzeilen** sind weiter per SHA öffentlich abrufbar (Web, API, raw: HTTP 200); siehe Abschnitt 8.

## 8. Offene Genehmigungen

1. **#1119:** Option A (Staffelung, kein Gate-Eingriff, nach dem 1.3.0-Lauf), B (Gate-Sonderfreigabe für belegte Deaktivierungen) oder C (Schwellen-Eingabe).
2. **GitHub-Support:** Antrag auf Entfernung der überschriebenen Commits und Blobs aus PR #1091. Nur der Owner kann ihn einreichen; ein vorbereiteter Text liegt dem Owner vor.
   - Betroffen sind 8 Commits und 2 Blobs.
   - Keine Remote-Ref (2.223 geprüft, einschließlich refs/pull/*) und keine der 989 Branches enthält sie. Keine Forks.
3. **Neue Registrierung,** um Register 1.1.0 und die SPX-Endwerte in Studien einzubeziehen.
4. **Dauerablage** der privaten Kursarchive.
5. **Setup-Unabhängigkeitsgate** (Option B empfohlen) und OOS-Segmentdefinition, aus V10 weiter offen.
6. **Merge des V13b-Folge-PR**; nicht von der Freigabe für #1091/#1117–#1121 umfasst.

## 9. Zertifizierungsreife

**Zertifiziert: 0/6.** Verträge und Gates sind unverändert; es gab keinen Statuswechsel. Die Einschätzung aus [BACKTEST_V10_CERTIFICATION_READINESS.md](BACKTEST_V10_CERTIFICATION_READINESS.md) gilt weiter.

| Art | Stand | frühestens |
|---|---|---|
| Signal, Pattern | wirtschaftlich negativ (kein SPY-Überschuss) | nicht absehbar |
| Same Stock Replay | strukturell Survivor | nicht absehbar |
| Setup | OOS-Gate fest `false` | erst nach Normentscheidung |
| Faktor-Ranking | Original-Vintages und Forward-Monate fehlen | 2028-01 / 2028-08 |
| Strategie | Original-Membership fehlt | ~2028-08 |

V13 verbessert die Datengrundlage (Delistings ab 2010, Large Caps, Korrekturen). Keine Zertifizierungsvoraussetzung ist dadurch erfüllt.
