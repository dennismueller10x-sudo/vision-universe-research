# V13b HIST – Kurssturzfälle und Delistings vor 2010

Stand 29.10.2026, Owner-Entscheidung 4. Evidenzart `SOURCE_EVIDENCE`, `NOT_CERTIFIED`, `productionApproved: false`.
Keine Datei unter `*/data`, kein Produktpfad, kein Workflow, kein Loader und keine Engine geändert. Das Register
`v13/delisted/register-1.0.0.json` und alle V10–V13-Ergebnisse bleiben unverändert; neu sind nur versionierte Dateien hier.

## Kurz

1. **28 Kurssturzfälle (Teil A):** 13 Ketten sind jetzt quellengestützt aufgelöst und QUALIFIED: 11 echte Kursereignisse
   und 2 Sonderausschüttungen. 15 bleiben `CA_UNRESOLVED`, darunter 8 SPAC-Zusammenschlüsse. Register 1.1.0:
   QUALIFIED 1.675 → **1.688**, CA_UNRESOLVED 209 → **196**. Sonst ändert sich keine Zeile.
2. **Delistings 1995–2009 (Teil B):** Die EDGAR-Register zählen 4.468 Delisting-Ereignisse. Davon haben 0 eine Kursreihe
   bei uns (vor V13), 13 nach V13. Für ausgeschiedene S&P-500-Mitglieder liefern Fusions- und Übernahmedokumente jetzt
   **29 belegte Endwerte**: 27 Barabfindungen, 1 Aktientausch, 1 gemischt. Einer davon (First Data 2006) ist nach der
   Durchsicht falsch, also bleiben **28 verwendbare**. 473 von 502 begrenzten Austrittszeilen bleiben begrenzt.
3. **Tiingo:** Es gibt keinen sinnvollen Zusatzabruf. Alle 46 Anbieterketten, die vor 2010 enden, wurden in V13 schon
   abgerufen. Die einzigen drei Kandidaten für weiterlaufende Indexaustritte (DDS, MBI, MTG) haben bereits eine gehaltene
   Reihe. **Es wurde nichts abgerufen, und es wird nichts empfohlen.**

## Teil A – Regel und Ergebnis

Die Regel [`protocol-amendment-1.1.0.json`](protocol-amendment-1.1.0.json) wurde in Commit a0539e89f7 eingefroren,
bevor ein SEC-Dokument der Fälle gelesen wurde. Gesehen war bis dahin nur die private Fallliste.

- Quellen: alle Filings der verknüpften CIK in [J−60 T, J+30 T], 284 Dokumente.
- Klasse A (echtes Kursereignis) verlangt zwei Bedingungen:
  - E1: ein Filing in [J−14, J+7] mit einem Ereignis passender Richtung, belegt durch ein Zitat.
  - E2: kein Kapitalereignis in ±5 Handelstagen. Dafür wird jeder Treffer des CA-Scans einzeln disponiert, und der
    Anbieter darf keinen Split-Faktor in diesem Fenster haben.
- Klasse B (dokumentiertes Kapitalereignis) verlangt Verhältnis oder Betrag und ein Datum, das höchstens einen
  Handelstag neben J liegt.
- Klasse C ist alles andere. Eine einzige C-Bewertung lässt die ganze Kette ausgeschlossen.

| Klasse | Ketten | Fälle (Ticker als Kennung) |
|---|---:|---|
| A Insolvenzantrag | 5 | COSI 2016, CVO 2018, ELGX 2020 (2 Sprünge; zweiter: Nasdaq-Delisting-Bescheid), QTWW 2016, EPRS-Sprung 1 (Kette bleibt C) |
| A Going Concern / Zahlungsausfall | 3 | ARLZ 2018, DPLO 2019, HCR 2020 |
| A Regulierung / Börse / Take-under | 4 | CORV 2019 (FDA-Ausschuss 2:11), DRL 2014 (FDIC-Kapitalentscheid), FELP 2019 (NYSE-Delisting), DLGC 2014 (Übernahme zu 0,15 $) |
| B2 Sonderausschüttung | 2 | CYOU 2019 (9,40 $/ADS, Ex-Tag = Sprungtag), TST 2019 (1,77 $, erwarteter Ex-Tag = Sprungtag) |
| C | 15 | 8 SPAC-Zusammenschlüsse ohne gelistetes Negativereignis (ADRT, ASCA, BUJA, BWAQ, CHEA, GODN, JVSA, MOBV); EPRS (Anstieg ohne Ereignis); GRDI; MDR (kein Filing im Fenster); NBG (Rekapitalisierung und 1:15-Reverse-Split); NYRT; PACW; SILK (Prognoserichtung im Fenster nicht belegt) |

Die 13 neu qualifizierten Ketten enden alle 2010 oder später: 2010–14: 1, 2015–19: 7, 2020–24: 5. Ihre Terminalklassen
nach der unveränderten R6-Regel: DISTRESS 7, MERGER 5, UNKNOWN 1. DRL und HCR tragen MERGER, weil V12 ihr Ereignis so
etikettiert hat; R6 wurde nicht geändert. Belege: [`crash-adjudication-1.1.0.json`](crash-adjudication-1.1.0.json). Er
enthält je Sprung Klasse, Formular, Akzession, URL, Dokument-SHA-256 und ein Zitat von höchstens 300 Zeichen. Eingabe des
Prüfers ist [`crash-decisions-1.1.0.json`](crash-decisions-1.1.0.json), das Register [`register-1.1.0.json`](register-1.1.0.json).

**Offengelegt:**
- E1 wird streng gelesen. Ein Ereignis, das nach dem Sprungtag datiert, zählt nicht. Das betrifft nur GRDI-Sprung 2.
- TST stützt sich auf den vom Emittenten genannten *erwarteten* Ex-Tag.

## Teil B – S&P-500-Austritte 1995–2009

**Umfang:** 502 begrenzte SPY-Austrittszeilen aus V12 SPXPOP 1.1.1 mit t0 ≤ 2009-09-30, davon 325 mit CIK und 195
Übernahmekandidaten.

**Regeln:**
- [`spx-terminal-rules-1.0.0.json`](spx-terminal-rules-1.0.0.json) wurde vor dem Lesen eingefroren (a0539e89f7).
- Angenommen wird nur:
  - eine feste Gegenleistung (Bar, festes Umtauschverhältnis oder beides) aus einem Original-Filing des Emittenten,
  - mit Vollzugsbeleg im Zeitraum (Form 15/25 oder Vollzugsaussage),
  - beim Aktientausch mit dem Kurs des Übernehmers aus demselben SPY-Bericht zu t1, wobei der Übernehmer im Zeitraum
    keinen Split haben darf,
  - mit Plausibilitätswächter: v ∈ [1/3, 3] und kein splitgroßes v.
- Rendite R = (C + r·P_acq(t1)) / p0 − 1. p0 ist Wert/Stück aus dem SPY-Bericht zu t0.

| | 1.0.0 (primär) | 1.0.1 (Sensitivität, nach Sicht) |
|---|---:|---:|
| TERMINAL_CASH / STOCK / MIXED | 27 / 1 / 1 | 24 / 1 / 1 |
| nach Durchsicht markiert | 1 (First Data: Western-Union-Abspaltung am Stichtag) | 3 (Biomet überholtes Angebot, Columbia Energy Tenderpreis, Rohm & Haas Endbetrag ungeprüft) |
| begrenzt: ohne CIK / Indexwechsel (weiter gelistet) / vorübergehend | 182 / 101 / 23 | gleich |
| begrenzt: kein Dokument / mehrdeutig / kein Übernehmerkurs / sonst | 87 / 55 / 13 / 12 | 82 / 68 / 5 / 15 |

Wirkung auf das begrenzte Gewicht je SPY-Periode (1.0.0): 1996 5,76 → 5,58 %, 1999 12,59 → 12,46 %,
2006 3,42 → 2,84 %, 2009 2,17 → 1,34 %. In den übrigen Perioden bewegt es sich um höchstens 0,2 Prozentpunkte.
Die Konsistenzabweichung gegen die SPY-Kursrendite ist nur eine Diagnose, nach der nichts ausgewählt wurde. Sie bleibt
praktisch unverändert, zum Beispiel 1998/99 −12,83 PP und 1999/2000 −10,19 → −10,17 PP. Belege:
[`spx-terminal-register-1.0.0.json`](spx-terminal-register-1.0.0.json),
[`spx-terminal-coverage-1.0.0.json`](spx-terminal-coverage-1.0.0.json) (Abschnitt `spyPeriods`, `gapByYear`) und
[`spx-terminal-review-1.0.0.json`](spx-terminal-review-1.0.0.json).

**Abweichungen (offengelegt):**
- Code-Korrekturen am 1.0.0-Lauf (C1–C7 in `spx-terminal-rules-1.0.1.json`). Die erste Fassung nahm 27 Barwerte an;
  davon widersprachen 4 dem Regeltext (Vorzugsaktie, Wahlrecht, ADS-Anteil, „one share“).
- Die Regeln 1.0.1 (e0d52ff57d) entstanden **nach Sicht**: andere Dokumentreihenfolge, Vollzug vor dem Dokument
  erlaubt, Ausschüttungswächter. 1.0.1 bringt 7 neue Werte, verliert 10 und erzeugt neue Fehler. 1.0.1 wird **nicht
  übernommen**; primär bleibt das vorregistrierte 1.0.0.

## Was unbeobachtbar bleibt

- **Breiter Markt 1995–2009:** 4.468 SEC-Delisting-Ereignisse operativer Emittenten stehen 13 Kursreihen gegenüber,
  alle aus 2008/09. Die Anbieterliste führt für 1995–2009 nur 46 beendete US-Ketten, und alle sind abgerufen. Dazu
  kommen 23 Endwerte, die sich einem SEC-Ereignis zuordnen lassen. Kurse delisteter Nicht-Index-Titel vor 2009 gibt es
  in keiner zugänglichen Quelle.
- **S&P 500 vor 2009:** 473 Zeilen bleiben begrenzt (Punkt 0 %, Untergrenze −100 %):
  - 182 ohne CIK, also nur über den Namen in alten Berichten auffindbar.
  - 101 Indexwechsler, die weiter gehandelt wurden. Ein Kurs wäre ohne neue Quelle nur für 3 Titel möglich; die halten
    wir bereits, sie scheitern an der V12-Zuordnung.
  - 23 vorübergehende Abwesenheiten.
  - 1 Insolvenz.
  - 166 Übernahmen ohne eindeutige feste Gegenleistung: Wahlrecht oder Proration, kein lesbares Dokument (EDGAR vor
    1996 lückenhaft), Übernehmer nicht im SPY oder mit Split.
- **Sparse Fondspreise:** 67 Austrittszeilen haben 92 Zwischenbeobachtungen in anderen Fondsberichten (IWB/IWM/QQQ/DIA)
  zwischen t0 und t1. Sie schließen keine Schranke, weil der Wert zu t1 oder bei Vollzug fehlt, und werden deshalb nur
  gezählt.

## Prüfung, Abrufe, Reproduktion

- **Unabhängige Python-Prüfung** ([`python-check-1.0.0.json`](python-check-1.0.0.json), `python3 -I verify_hist.py`,
  eigene HTML-Textextraktion, eigene Muster und Wochenlogik): **1.242 / 1.242** Prüfungen bestanden.
  - Zitate, Dokument-Hashes und Fenster aller 28 Fälle.
  - Neuableitung der 13 Ketten: Punkte-SHA-256, Endbeleg, Terminalklasse.
  - Gleichheit aller übrigen Registerzeilen mit 1.0.0.
  - Jeder angenommene Endwert: Zitat, Betrag, p0 aus dem Roh-Snapshot, Übernehmerkurs, Rendite, Vollzug,
    Gewichtsbuchhaltung.
  - Grenze: Die Prüfung liest dieselben gecachten SEC-Bytes. Inhaltliche Fehler wie First Data fand nur die Durchsicht.
- **SEC-Abrufe:** 1.536 über `scripts/quant/sec/http_client.py` (≤ 2/s, UA VisionUniverseResearch), Teil A ≈ 592,
  Teil B ≈ 944, 0 endgültige Fehler.
  - Darin enthalten sind 284 verworfene Range-Versuche: sec.gov ignoriert HTTP-Range auf Archivpfaden. Danach wurde
    jedes Dokument einmal ganz geladen.
  - Rohdaten liegen nur in `scratchpad/v13b-private/`.

```bash
P=<scratchpad>; EC="--extra-cache $P/v12-private/indexpop/http-cache ..."   # Liste: $P/v13b-private/extra-caches.txt
python3 -I scripts/quant/v13b/hist/crash_collect.py --root . --v13-private $P/v13-private --listref $P/v12-private/listref --private $P/v13b-private $EC
python3 -I scripts/quant/v13b/hist/crash_adjudicate.py --root . --private $P/v13b-private $EC
python3 -I scripts/quant/v13b/hist/qualify_110.py --root . --private $P/v13-private --listref $P/v12-private/listref --jumpmap $P/v13b-private/crash/jumpmap-1.1.0.json --out-public docs/quant-recovery/v13b/hist/register-1.1.0.json --out-series $P/v13b-private/series-1.1.0
python3 -I scripts/quant/v13b/hist/spx_terminal.py --root . --private $P/v13b-private --spxpop $P/v12-private/spxpop --rules 1.0.0 $EC   # und --rules 1.0.1
python3 -I scripts/quant/v13b/hist/spx_coverage.py --root . --listref $P/v12-private/listref --indexpop $P/v12-private/indexpop --out docs/quant-recovery/v13b/hist/spx-terminal-coverage-1.0.0.json --fetch-spec $P/v13b-private/tiingo-fetch-spec.json
python3 -I scripts/quant/v13b/hist/verify_hist.py --root . --v13-private $P/v13-private --listref $P/v12-private/listref --private $P/v13b-private --indexpop $P/v12-private/indexpop --caches <cache-dirs> --out docs/quant-recovery/v13b/hist/python-check-1.0.0.json
node --test quant/tests/v13b-hist.test.mjs
```

Die Reihen der 13 neuen Ketten liegen privat unter `v13b-private/series-1.1.0/`. Die übrigen 1.675 QUALIFIED-Reihen
bleiben unverändert in `v13-private/series/`. Ein Research-Loader für Register 1.1.0 wurde nicht gebaut, weil
`research-delisted-series.cjs` auf 1.0.0 gebunden ist. Das wäre eine eigene, opt-in Erweiterung.
