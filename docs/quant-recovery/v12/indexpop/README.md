# V12 INDEXPOP – Historische Indexpopulation aus SEC-Fondsbestandsmeldungen (P2)

Stand 29.10.2026. Evidenzart RECONSTRUCTION / SOURCE_EVIDENCE, `NOT_CERTIFIED`, `productionApproved: false`. Keine Datei unter `*/data` geändert, kein Produktpfad, keine Engine, kein Loader berührt.

## Quellen (Aufgabe 1) – `inventory-1.0.0.json`

| Fonds | Index | SEC | Bestandsmeldungen mit vollständigem Schedule | verwendete Stichtage |
|---|---|---|---|---|
| SPY | S&P 500 | CIK 884394 (UIT) | N-30D 1996–2026 (bis 2009 jährlich 30.9., ab 2010 halbjährlich), N-CSR 2004, NPORT-P ab 30.9.2019 quartalsweise | 62 (1995-12-31 … 2026-06-30) |
| QQQ | Nasdaq-100 | CIK 1067839 | N-30B-2 jährlich (30.9.) 2004–2025, N-CSRS 2026, NPORT-P ab 2019 | 43 (2004-09-30 … 2026-06-30) |
| DIA | DJIA | CIK 1041130 (UIT) | N-30D 1998–2026 (ab 2004 halbjährlich), NPORT-P ab 2019 | 65 (1998-10-31 … 2026-07-31) |
| IWB / IWM / IWV | Russell 1000 / 2000 / 3000 | iShares Trust CIK 1100663, Serien S000004347 / S000004344 / S000004341 | N-Q 2006–2019 (31.12. und 30.6., ein Trust-Dokument für alle drei), N-CSR/N-CSRS (31.3./30.9., nicht abgerufen, ~2,6 GB), NPORT-P ab 2019 | je 55 (2005-12-31 … 2026-06-30) |

Serienzuordnung über `company_tickers_mf.json` und die serienspezifische EDGAR-Liste. Die Seriennummerierung beginnt 2006; ältere iShares-Meldungen (2000–2005) sind so keiner Serie zuordenbar und wurden nicht verwendet. Abgerufen: 322 Bestandsdokumente (974 MB, privat im Scratchpad).

## Parser und Validierung (Aufgabe 2) – `validation-1.0.0.json`

- N-PORT-XML (stdlib/Regex): Mitglied = `assetCat EC`, `Long`, `NS`, Wert > 0. Gültig, wenn Σ Mitgliedswerte / Nettovermögen ∈ [0,98; 1,01] und Positionszahl im erwarteten Bereich.
- N-30D/N-30B-2/N-Q (HTML und Text, ein Zeilen-/Zellenmodell; iShares-Abschnitt über die Seitenüberschrift des Fonds): gültig, wenn Σ Positionswerte = gemeldete „Total Common Stocks/Total Investments“ ±1 % und Positionszahl plausibel.
- **Ergebnis: 335 von 335 Fonds-Stichtagen validiert** (Berichte: Verhältnis exakt 1,0000; N-PORT 0,9948–1,0009). Nicht validierbar: 0; ein SPY-N-CSR 2004 (anderer Fonds im Dokument) wurde vom gültigen N-30D ersetzt. Je Stichtag ein Dokument (N-PORT vor Bericht, Original vor Änderung).

## Zuordnung (Aufgabe 3) – Regeln `rules-1.0.0.json` → `1.1.0` → `1.2.0`

Positionsschlüssel: CUSIP (N-PORT) bzw. normalisierter Name + Aktienklasse (Berichte). Kandidaten: unsere Stammaktien-Listings mit Wochenreihe; Namen aus `company-names.json`, SEC `company_tickers.json` (Ticker → ID nur über `core/identity.js#securityIdForTicker`) und allen historischen EDGAR-Namen ihrer CIK (`cik-lookup-data.txt`). Preisprüfung je Stichtag: Wert/Stück gegen die Spanne der Wochenschlüsse der Stichtagswoche und der Vorwoche, roh über die Anbieter-Splitfaktoren (`return-series.js#splitFactors`, ADR-002); zugeordnet nur bei genau einem Kandidaten ≤ 5 % und Bestätigung an einem benachbarten Stichtag. Stufen: T1 CUSIP+Name exakt, T2 Name eindeutig, T3 unsicher (nicht verwendet), UNMATCHED.

Regeländerungen offen gelegt: **1.1.0** nach dem ersten Zuordnungslauf, vor jeder Abdeckungszahl (Normalisierungsfehler „NEW“/„THE“, Kopfzeilen im Namen, Vorzugsaktien als Kandidaten, Wochenklammer, Zuordnung je Stichtag statt je Schlüssel). **1.2.0 nach Sicht auf die 1.1.0-Abdeckung**: CUSIP-Kontinuität (eine CUSIP, die an ≥ 2 Stichtagen eindeutig einem Listing zugeordnet ist, gilt an weiteren Stichtagen mit Abweichung ≤ 25 % als dasselbe Listing; Anlass: starke Kursbewegung innerhalb der Woche zum 30.6.2026) und eindeutige Schlüssel bei doppelten Namen in einem Stichtag (Fund der Python-Prüfung). Beide Ergebnisstände liegen vor (`coverage-1.1.0.json`, `coverage-1.2.0.json`); 1.2.0 fügt 1.550 Schlüssel-Stichtage hinzu; die Wirkung konzentriert sich auf Stichtage mit großen Kursbewegungen innerhalb der Woche (QQQ 30.6.2026 +18,6 PP Mitglieder / +29,4 PP Gewicht, IWM 31.3.2020 +14,3 / +14,2 PP), sonst wenige Zehntel (SPY-Jahresmittel 2020 86,9 → 88,3 %). Unter 1.1.0 wäre die Abdeckung an diesen Stichtagen durch die Wochengranularität künstlich niedrig.

Schlüssel (1.2.0): 12.770, davon T1 3.425, T2 2.792, T3 280, UNMATCHED 6.273 (Schlüssel-Stichtage: T1 70.114, T2 54.886, T3 4.131, UNMATCHED 59.460).

## Ergebnisse (Aufgabe 4)

(a) `register-1.2.0.json.gz` – PIT-Mitgliedschaft je Index und Stichtag, spaltenweise: Schlüssel-Hash, CIK, CUSIP-Hash (keine CUSIP im Klartext), Stückzahl, Wert (Gewicht = Wert/Summe), securityId (nur T1/T2), Status, Abdeckungsflag; Quelle je Stichtag mit Akzession, URL und SHA-256.

(b) `coverage-1.2.0.json` – je Stichtag Anteil der Mitglieder (Anzahl/Gewicht) mit qualifizierter Reihe im Research-Loader `{identityEvidence, corporateActionEvidence, listingLifecycleEvidence}` (4.526 QUALIFIED von 6.190 Reihen), zusätzlich „zugeordnet, aber nicht qualifiziert“, T3, UNMATCHED und die größten nicht abgedeckten Mitglieder seit 2019.

Abdeckung (Mittel je Jahr, Anzahl % / Gewicht %; in Klammern: wenn jede zugeordnete Reihe qualifiziert wäre):

| Fonds | 2005 | 2010 | 2015 | 2019 | 2022 | 2025 |
|---|---|---|---|---|---|---|
| SPY | 52,0 / 70,8 (53,6 / 73,4) | 64,2 / 78,1 (66,1 / 82,5) | 72,4 / 79,5 (74,9 / 85,7) | 84,2 / 87,4 (87,3 / 94,9) | 90,3 / 87,5 (94,2 / 98,2) | 94,3 / 88,9 (97,6 / 99,4) |
| QQQ | 45,0 / 59,6 | 56,0 / 53,0 | 61,5 / 62,8 | 84,5 / 80,5 (89,3 / 96,4) | 89,2 / 80,7 (94,3 / 98,1) | 94,1 / 87,6 (98,0 / 99,3) |
| DIA | 93,3 / 94,7 | 93,3 / 93,4 | 90,0 / 88,8 | 88,3 / 89,8 (95,0 / 96,8) | 90,0 / 94,9 (96,7 / 99,2) | 96,7 / 96,8 (100 / 100) |
| IWB (R1000) | 46,9 / 66,3 | 57,9 / 75,0 | 65,2 / 78,2 | 78,8 / 87,2 (82,7 / 94,7) | 84,4 / 87,0 (89,3 / 97,2) | 90,0 / 88,8 (95,1 / 99,1) |
| IWM (R2000) | 27,1 / 29,8 | 35,0 / 39,6 | 42,8 / 49,1 | 57,8 / 66,6 (64,6 / 72,0) | 66,9 / 72,9 (75,4 / 80,1) | 79,8 / 84,4 (91,4 / 93,6) |
| IWV (R3000) | 33,6 / 63,1 | 42,6 / 72,2 | 50,5 / 76,0 | 65,5 / 85,9 (71,1 / 93,2) | 74,7 / 86,1 (81,5 / 96,1) | 84,3 / 88,4 (92,6 / 98,6) |

SPY 1996: 31,8 / 46,4; 2000: 42,3 / 59,4.

(c) `exits-1.2.0.json.gz` – 6.450 Austritte (SPY 916, QQQ 219, DIA 31, IWV 5.284; IWB/IWM-Austritte sind überwiegend Wechsel zwischen den Hälften und nur in den privaten Daten) mit letztem Bestandsdatum, Kursreihenstatus und Folgeschicksal aus SEC-Submissions (Form 25/15, 8-K 2.01/1.03, DEFM14A, SC 14D9; Fenster 400 Tage). SPY: 176 übernommen/fusioniert, 114 sonst delistet/deregistriert, 1 Insolvenz, 262 weiter berichtend (nur Indexwechsel), 33 ohne SEC-Beleg, 323 ohne CIK, 2 CIK-Namenskonflikt. IWV: 1.961 übernommen, 338 sonst delistet, 94 Insolvenz, 1.239 weiter berichtend, 1.481 ohne CIK. **Von den 296 übernommenen/delisteten SPY-Austritten haben 7 eine qualifizierte Reihe (keiner vor 2013); bei IWV 47 von 2.426, davon 38 in 2024–2026.**

(d) `quarter-prices-1.2.0.json.gz` – Rohpreis Wert/Stück je Stichtag für 7.579 Schlüssel ohne abgedeckte Reihe. Plausibilität (`price-plausibility-1.2.0.json`) dort, wo beide existieren und der Stichtag selbst ein Wochenbar ist (n = 44.349): Median-Abweichung 0, p99 0,06 %, Anteil > 1 % 0,09 % (N-PORT-Ära p99 0,02 %, Berichtsära 0,13 %). Die Verteilung ist durch die 5-%-Zuordnungstoleranz nach oben abgeschnitten. Split-Konsistenz: 3 Fälle mit Verhältnis ≈ 2 an nicht zugeordneten Stichtagen (FNF 2006, MCO 2011) – Hinweis auf vom Anbieter nicht abgebildete Splits/Basen.

## Bewertung (Aufgabe 5)

- **Kein Index erreicht in irgendeinem Stichtag ≥ 95 % der Mitglieder und ≥ 99 % des Gewichts** mit dem Research-Loader in der Option `{identityEvidence, corporateActionEvidence, listingLifecycleEvidence}`. Höchstwerte: DIA 2025 (96,7 / 96,8), SPY 2025 (94,3 / 88,9).
- Hauptursache beim Gewicht sind **zugeordnete, aber nicht qualifizierte Großwerte**: AAPL und GOOGL (`CORPORATE_ACTION_UNRESOLVED`, zusammen ≈ 8,5 % des S&P-500-Gewichts seit 2019), dazu ABT, MS, USB, JCI, KDP, WBD (CA) und TEL, DD, DOW, COR, DOC, MRNA (`AMBIGUOUS_LISTING_IDENTITY`). Würden alle zugeordneten Reihen qualifiziert, erreichten SPY 10, QQQ 9 und DIA 22 Stichtage die Schwelle 95/99 (SPY 2024–2025 durchgehend 96,5–97,6 / 99,2–99,4); der S&P 500 ab etwa 2023 wäre dann eine qualifizierbare Teilpopulation. **Das ist der wichtigste Hebel für P4**: CA-/Identitätsbelege für rund 15 Listings.
- Die zweite Ursache ist die **Universumslücke** (UNMATCHED: Mitglieder ohne jedes Listing bei uns), fast vollständig delistete oder übernommene Titel: SPY 42,8 % der Mitglieder 2004, 22,4 % 2015, 2,2 % 2025.
- **Breiter Markt (Russell 3000):** Lücke (100 − abgedeckt) bei der Anzahl 66 % (2005), 57 % (2010), 49 % (2015), 35 % (2019), 25 % (2022), 16 % (2025); beim Gewicht 37 %, 28 %, 24 %, 14 %, 14 %, 12 %. Davon UNMATCHED 61,5 % (2005) → 6,5 % (2025); der Rest sind nicht qualifizierte (≈ 8 %) und unsichere (≈ 1–3 %) Zuordnungen. Russell 2000 bleibt bis 2025 unter 80 %.
- Vor 2019 ist keine Teilpopulation mit < 5 % Lücke möglich, ohne Kursdaten delisteter Titel zu beschaffen (Freigabevorlage, siehe offene Punkte); die Quartalspreise (d) erlauben nur Schranken bzw. quartalsweise Renditen dieser Titel.

## Gegenprüfung (Aufgabe 6) – `python-check-1.2.0.json` (`python3 -I verify_indexpop.py`)

- A N-PORT (xml.etree): 168/168 Stichtage gleiche Anzahl und Summe wie JS.
- B Berichte (html.parser/Zeilen-Regex): 165/167 gleiche Anzahl und Summe, 167/167 gleiche gemeldete Summe; 2 Abweichungen (SPY 2003-09-30, 2006-09-30: der Python-Parser verliert 1–2 umbrochene Zeilen, die JS-Summe trifft den gemeldeten Wert exakt).
- C Zwei verschiedene SEC-Dokumente je Stichtag (N-PORT vs. Halbjahres-/Jahresbericht, 36 Paare): Anzahl 31/36 gleich, Wert 30/36 innerhalb 1 % (QQQ 2019–2022 identisch; SPY/DIA bis ±1,4 % – unterschiedliche Bewertungs-/Bestandsstichtage der beiden Meldungen).
- D Abdeckung aus Register + Loader-Export neu gerechnet: 335/335 identisch.
- E Zuordnungsstichprobe (jede 37. zugeordnete Zeile, n = 6.508, eigene Splitfaktor-Rechnung): 6.455 ≤ 5 %, 6.508 ≤ 25 %. Fand den Doppelschlüssel-Fehler (behoben in 1.2.0).

## Reproduktion

```bash
python3 -I scripts/quant/v12/indexpop/inventory.py <repo> <priv> <priv>/work/inventory.json      # SEC
python3 -I scripts/quant/v12/indexpop/fetch_docs.py <repo> <priv> <priv>/work/inventory.json <priv>/work/manifest.json   # SEC
scripts/quant/v12/indexpop/run-pipeline.sh <priv>                                                 # offline, ~3 min
python3 -I scripts/quant/v12/indexpop/fates.py <repo> <priv> <priv>/work/exits-1.2.0.json <out>   # SEC (submissions)
python3 -I scripts/quant/v12/indexpop/verify_indexpop.py <repo> <priv> 1.2.0 <out>               # ~10 min
node --test quant/tests/v12-indexpop.test.mjs
```

SEC-Abrufe dieses Strangs: 4.874 Anfragen (Inventar/Indizes ≈ 50, Bestandsdokumente 322 + 27 Filing-Indizes, Namens-/Tickerlisten 3, Submissions für 4.216 CIKs ≈ 4.480), ≤ 2/s, 0 Fehler; Rohdaten nur unter `scratchpad/v12-private/indexpop/`.

## Grenzen und offene Punkte

- Wochenreihen erlauben keine taggenaue Preisprüfung; die Klammer-/Kontinuitätsregel ist eine Identitätsprüfung, keine Kursrekonstruktion.
- iShares N-CSR/N-CSRS (31.3./30.9.) und iShares 2000–2005 nicht ausgewertet; SPY vor 2010 nur jährlich.
- Name-Schlüssel der Berichtsära können Emittenten mit gleichem Namen über Jahrzehnte verbinden; Zuordnung deshalb je Stichtag mit Nachbarbestätigung.
- Klassenpaare mit fast gleichem Kurs (MKC/MKC.V, WSO/WSO.B, LILA/LILAK) und in der Stammdatei als Stammaktie klassifizierte Vorzugs-Listings (z. B. MCHPP, HBAN-Serien) bleiben T3.
- CIK ohne Listing nur über eindeutigen EDGAR-Namen; 23 Namenskonflikte ausgeschlossen.
- Freigabebedarf (P4): CA-/Identitätsbelege für AAPL, GOOGL u. a. (Liste `coverage-1.2.0.json` → `topUncoveredSince2019H2`); Kursdaten delisteter Titel nur über die bestehenden Read-only-Jobs als Freigabevorlage.
