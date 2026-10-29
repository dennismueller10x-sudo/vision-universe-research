# V12 – Historische Datenqualität: Abschluss

Stand 29.10.2026, Branch `claude/vision-quant-v10-backtest-4ho3rd` (PR #1091, Draft, nicht gemergt). Plan: [DATA_QUALITY_V12_PLAN.md](DATA_QUALITY_V12_PLAN.md). Keine Datei unter `*/data`, kein Produktpfad, kein Workflow, kein Frontend, keine Gate-Änderung; alle Korrekturen sind quellengebundene, opt-in Research-Register mit unabhängiger Python-Gegenprüfung. `NOT_CERTIFIED`, `productionApproved=false`.

## Einordnung der V10/V11-Ergebnisse

Die negativen V10/V11-Befunde bleiben unverändert dokumentiert. Sie zeigen, dass die bisherige Datenbasis keinen Vorteil gegenüber SPY belastbar messen konnte – nicht, dass realistisch handelbare Strategien grundsätzlich keinen Mehrwert erzeugen können. V12 hat die Datenbasis verbessert und die Verzerrungen gemessen; auch auf der besseren Basis ist kein Vorteil abgesichert (siehe unten), bei einer Nachweisgrenze von 3,6–9,4 Pp p. a.

## 1. Konkrete Datenkorrekturen

| Bereich | Korrektur | Beleg |
|---|---|---|
| **PIT-Marktkapitalisierung (P1)** | 117.888 Aktienzahl-Beobachtungen (3.131 Emittenten) geprüft: 129 korrigiert (Skalenfehler 10^±3/±6/±9 bei 79 Emittenten), 768 fail-closed ausgeschlossen; auf Panelebene 1.365 Zeilen korrigiert (401 Skala, 944 Split-Zeitpunkt, 20 Spin-off-als-Split), 3.067 ausgeschlossen. Alle 149 Werte > 5e12 USD beseitigt (EEFT, ON, ORCL, YUM, CB, CPK). 52 Anbieter-„Splits“ als Spin-offs/keine Splits belegt (GE, IBM, ALV, T, EXC, FTV, WDC). Citigroup Q3/2009 bleibt ausgeschlossen. | [v12/mcap](v12/mcap/README.md), Modul `research-pit-market-cap.cjs` |
| **Historische Indexmitgliedschaft (P2)** | 335 validierte Fondsbestands-Stichtage aus SEC-Originalen (SPY seit 1995, QQQ, DIA, iShares Russell 1000/2000/3000 seit 2005-12): Mitglieder, Gewichte, Stückzahl, Wert; 6.450 Austritte mit SEC-Folgeschicksal | [v12/indexpop](v12/indexpop/README.md) |
| **Qualifizierte Indexpopulation (P4)** | Periodenrenditen aller Mitglieder aus Wert/Stück mit Split-Erkennung aus den Beständen, inkl. ausgeschiedener Titel: **PIT-S&P-500 qualifiziert 2009-09 bis 2026-06** (Fehler ggü. SPY-Kursrendite Median 0,24 Pp halbjährlich bzw. 0,06 Pp quartalsweise; Schranken-Anteil 1,06 % bzw. 0,14 %), PIT-Russell-1000/3000 2005-12 bis 2026-06 (extern geprüft ab 2019-09), Nasdaq-100 ab 2016-09 | [v12/spxpop](v12/spxpop/README.md), Modul `research-index-population.cjs` |
| **Listingreferenz und Delistings (P3)** | 10.745 Listingketten (Tiingo-Referenz, 27 + 65 eingefrorene Enden korrigiert), 12.161 SEC-Delisting-Ereignisse, Gründe für 2.354 (1.593 Fusion, 225 Börsenregel, 59 Insolvenz; Stichprobe 44/44 bestätigt); exakte Abdeckungsmatrix je Jahr/Segment | [v12/listref](v12/listref/README.md), Modul `research-listing-reference.cjs` |
| **Große gesperrte Listings (P4b)** | GOOGL ab 2016-02, JCI ab 2016-12, KDP ab 2022-10, TEL ab 2013-11, IEX ab 2019-03 qualifiziert (QUALIFIED 4.583 → 4.588 mit V10-/V12-Identität); AAPL, ABT, MS, USB, DD, COR, DOC ohne SEC-Kursanker weiter gesperrt | [v12/largecap](v12/largecap/README.md) |

## 2. Gemessene Verzerrungen (vorher unbekannt)

- **Referenz selbst verzerrt:** Tiingos Tickerliste enthält vor 2009 praktisch keine beendeten Listings; gegen SEC-Delistings ist sie bis 2008 zu ≈ 0–3 %, 2015–2026 zu 34–72 % vollständig.
- **Unsere Abdeckung:** 52–85 % der Referenzlistings je Jahr mit Kursreihe, Research-Frame 44–67 %; die Lücke sind fast ausschließlich später delistete Titel (bis 2023 je Jahr ≤ 1 mit Reihe). S&P-500-Abdeckung mit unseren Reihen 2005 52 % (Gewicht 71 %) → 2025 95,8 % (91,6 %).
- **Survivorship innerhalb des S&P 500 direkt gemessen:** Mitglieder mit unserer Kursreihe übertreffen alle Mitglieder um **+0,67 Pp p. a.** (2009–2019 +1,04; 2019–2026 +0,11; Obergrenze der Verzerrung bei Austritten −100 %: +3,76). Nach unabhängiger Prüfung (REQUAL 1.1.0, SPXPOP 1.1.1): belegte Punktschätzung nach Folgeschicksal **+0,70** (CAGR-Differenz +0,76), Spanne +0,38 (oberes Szenario) … +3,77 (Obergrenze); p-Werte nur je Szenario.

## 3. Veränderte Studienresultate (vorher/nachher)

Beleg: [v12/requal](v12/requal/README.md), [v12/mcap/impact-1.0.0.json](v12/mcap/impact-1.0.0.json). Werte der Ergebnisversion 1.0.0; nach unabhängiger Prüfung neu als 1.1.0 auf SPXPOP 1.1.1 (EW-PIT-S&P-500 10,57 %, Survivorship +0,66, Gleichgewichtung −1,46 PP; S1 9,46 %, S6 7,09 %, S2–S5 unverändert; zusätzlich CW_ALL-Benchmark 10,91 %, gegen die keine Strategie abgesichert abweicht, und Spanne ab 2013-03 mit gleichen Vorzeichen) – siehe Abschnitt 6.

| Frage | vorher (V10/V11, Survivor-Frame) | nachher (V12) |
|---|---|---|
| Faktorstudie, Marktkap.-Korrektur | Rang-IC 9/28 Holm, Top-50 13,03 % CAGR | unverändert in der Aussage (größte IC-Änderung −0,0011; Top-50 12,98 %) |
| Populationseffekt ggü. SPY | EW-Survivor-Frame deutlich vor SPY (Haupterklärung des V10-„Überschusses“) | 2009–2026: EW-PIT-S&P-500 10,60 % vs. SPY 12,39 % (Kurs); exakt additive Zerlegung: Universum +0,53, Survivorship im Index +0,67, Gleichgewichtung −1,43 (2019–2026 −3,56), wöchentliches Rebalancing +1,42 Pp p. a.; SPY-Total-Return 14,40 % |
| Fünf Signalregeln | Populationsterm NEW_52W_HIGH 13 W +0,87 Pp; TREND_UP −0,59 Pp abgesichert negativ | auf S&P-Mitgliedern: Populationsterm durchweg negativ (NEW_52W_HIGH −0,35); Auswahl −0,57 … +0,32 Pp; TREND_UP −0,16, nicht mehr abgesichert; 0/30 Holm |
| Faktor-Rang-IC | Momentum 0,051, Risk 0,076, Value 0,055, Quality 0,035 (Frame) | PIT-S&P-500 inkl. Austritte: 0,008 / −0,008 / −0,011 / 0,014 – der Wegfall kommt aus der Population (große, liquide Titel), nicht aus Marktkap.-Korrektur oder Austritten; 0 Holm-Ablehnungen |
| Vollständige Strategien (neu, 6 vorab registriert, 2010-03–2026-03, SPY 11,32 %) | – | S3 Qualität+Profitabilität 11,55 % (+0,23 Pp, unter Stresskosten −0,29); S1 EW 9,48 %; S4 Momentum+QP Vol-Ziel 9,59 %; S5 Low-Vol 9,16 % (MaxDD −18,7 %, Crash/Bär +3,56 Pp je Periode, Erholung −4,30); S2 Momentum mit Marktfilter 6,38 % (verpasst Erholungen 2020-Q2/2022-Q4); S6 Cash-Puffer 7,10 %. Kein Unterschied abgesichert (kleinster Holm-p Newey-West 0,10) |

**Lesart:** Auf der qualifizierten Basis verschwindet der frühere Vorsprung, weil er ein Survivor- und Gleichgewichtungseffekt war; Faktorsignale, die im breiten Survivor-Frame positive Rang-ICs zeigten, sind unter den großen S&P-Titeln nahezu null. Defensive Strategien (Low-Vol, Qualität) verhalten sich phasentypisch (Schutz im Bär, Rückstand in Erholungen), Marktfilter kosteten in V-förmigen Erholungen. Kein Ergebnis ist ein Vorteilsnachweis, keines ein Beweis, dass es keinen gibt.

## 4. Grenzen der qualifizierten Basis

- Frequenz halbjährlich bis 2019-H1, danach quartalsweise (keine Wochen-/Monatsstudien; Drawdowns an Stichtagen unterschätzt: SPY −24,8 % vs. −34,1 % täglich).
- Kursrendite; Mitgliedsdividenden fehlen, deshalb keine Total-Return-Strategien (SPY-TR nur als Referenz). Größenordnung (SEC-XBRL, REQUAL 1.1.0): Low-Vol +0,7, Momentum/Qualität −0,5 … −0,7 PP p. a. ggü. CW_ALL; Cash verzinst zum EFFR (+0,26 … +0,35 PP bei S2/S4/S6).
- Vor 2009 keine qualifizierte S&P-Periode (Schranken 3–13 %); Russell 1000 vor 2019 nur intern geprüft.
- Large-Cap-Population: Aussagen gelten nicht für Small/Micro Caps (dort keine qualifizierte Basis).

## 5. Verbleibende Freigaben (Owner)

1. **Nachladen delisteter Kurse** über die bestehenden Anbieter in Actions: 4.322 bei Tiingo geführte, bei uns fehlende delistete Listings (2.483 mit CIK; Abdeckung gegen die Anbieterreferenz dann 0,88–0,98) – Kandidaten öffentlich nur aggregiert in `v12/listref/fetch-candidates-1.0.3.json` (Volltabelle privat); nichts abgerufen.
2. **Optional:** iShares-N-CSR/N-CSRS (≈ 2,6 GB SEC) für zwei zusätzliche Russell-Stichtage je Jahr und eine externe Referenz vor 2019.
3. **AAPL/ABT/MS/USB/DD/COR/DOC:** neue Protokollversion mit anderem Kursanker (Quartals-Hoch/Tief-Tabellen) – Entscheidung nötig.
4. **Loader-Option `identityEvidenceProtocolV12`** (Code-Änderung am Research-Loader) und die 62 V10-Bindungen (`identityEvidenceProtocolV10`).
5. **Nach Sicht geänderte Regeln** (offengelegt, Urteil erbeten): MCAP 1.0.1–1.0.8, INDEXPOP 1.1.0/1.2.0, SPXPOP 1.1.0/1.1.1, LISTREF 1.0.1, LARGECAP 1.0.1, REQUAL 1.0.2 und Nachtrag 1.1.0.
7. **Git-Historie:** die zurückgezogenen LISTREF-1.0.2-Zeilendateien (Anbieter-Metadaten) liegen noch in der Branch-Historie (Commit `1ab37c75b4`); Entfernung vor einem Merge (Squash/Bereinigung) braucht Freigabe.
6. **Erzeuger-PRs (Produkt):** Marktkap.-Patch `v12/mcap/producer-patch-market-cap-1.2.0.diff` (558 Zeilen zurückgehalten, heute nur LTM betroffen), Security-Master-Status (V10), `research-portfolio`-Vollverkauf (V10), `cli.py consumer`-Ausgabepfad.

## 6. Unabhängige Prüfung

Getrennter, nur lesender Prüfagent auf Stand `f9621b0326`. **Kein BLOCKER, 6 MAJOR, 11 MINOR.** Vom Prüfer nachgerechnet und korrekt: Datenhygiene (keine `*/data`-, Produktpfad- oder Workflow-Änderung, keine Rohdaten Dritter/Secrets), Loader byte-identisch ohne Option (955 IDs × 4 Optionssätze), 10/10 MCAP-Korrekturen gegen companyfacts, PIT-Fähigkeit der MCAP-Regel, MCAP-Wirkung, SPXPOP-Fehler gegen SPY, additive P5a-Zerlegung, Registrierungsreihenfolge, Formulierung „keine Überrendite abgesichert“ ohne Verallgemeinerung. Belastbar: Skalenkorrekturen ab Faktor 1000, Ausschlüsse, Indexparser, S&P-Population ab 2013-03 (quartalsweise ab 2019-09 extern ±0,25 Pp), Loader, „Faktor-IC im S&P ≈ 0“, „keine Überrendite abgesichert“. Nur bedingt belastbar: Survivorship-Höhe (szenarioabhängig), Spanne 2009-09–2013-03 (Regel nach Sicht), Abstände der Strategien zu SPY (Benchmark-Messfehler, Dividenden), MCAP-Fehlerquote (frisch 18/19).


### Korrekturen nach unabhängiger Prüfung (umgesetzt)

| Befund | Korrektur | Vorher → nachher | Beleg |
|---|---|---|---|
| SPXPOP m4 | Regel 1.1.1: Identitätsbruch bei Fusionen (C3/C4-Verknüpfung, Aktienzahlsprung, Kurs > 2× Index unter jeder Hypothese) wird nicht verkettet, BOUNDED_EXIT/IDENTITY_BREAK; 13 Fälle (Broadcom ×4, PXRE, BPZ, Arsanis, WMIH, Aerovate, Cano, System1) | SPY 2015-09 Fehler −0,12 → −0,46 PP (weiter qualifiziert); keine Qualifikation geändert; Python bestätigt 7/7 lokalisierte Brüche | [v12/spxpop](v12/spxpop/README.md) |
| REQUAL MAJOR 2 | Szenarien FATE/UPPER, Bezeichnungen korrigiert (ZERO keine Schranke, LOWER = Obergrenze der Verzerrung) | Survivorship +0,67 (ZERO) → FATE +0,70 / UPPER +0,38 / LOWER +3,77 PP | [v12/requal](v12/requal/README.md) |
| REQUAL MAJOR 3/4 | CW_ALL als gleichartige Benchmark, Schranken-Gewicht, Dividenden, Cash | gegen CW_ALL (10,91 %) kein Unterschied abgesichert (min. Holm-p 0,12); S2–S5 halten ≤ 0,08 % Schranken-Gewicht | requal 1.1.0, `dividends-1.1.0.json` |
| REQUAL MAJOR 5 | Spanne ab 2013-03 (Regel 1.0.1) | S1 −2,69, S3 −0,25, S5 −3,51 PP ggü. SPY; Vorzeichen unverändert | requal 1.1.0 |
| REQUAL m6–m8 | CAGR neben arithmetisch, P5d-Text nicht kausal, Same-Bar offengelegt | – | requal 1.1.0 |
| MCAP MAJOR 1, m2, m3 | Validierung ohne Überschneidung, Korrekturnotiz („32/32“ falsch, Dateinamen, `rowsValueScoreChanged`), `strict`-Option mit Laufzeit-Hashprüfung | frisch 18/19 (Wilson-Untergrenze 75,4 %); 222.316 „geänderte“ Value-Scores → 689 um > 1 Punkt | [v12/mcap](v12/mcap/README.md) |
| LISTREF MAJOR 6 | keine zeilenweisen Anbieter-Metadaten im Repository (1.0.3: Zählungen, CIK, HMAC-Kennungen, 5-Jahres-Klassen) | 1.0.2-Zeilendateien entfernt, Vollfassung privat | [v12/listref](v12/listref/README.md) |
| LARGECAP m9 | V10-Registererzeuger erhält die nicht aufzählbare `v12`-Erweiterung (Test: byte-identischer Neubau) | Code-Hash-Änderung der V10-Reproduktionen offengelegt | [v12/largecap](v12/largecap/README.md) |
