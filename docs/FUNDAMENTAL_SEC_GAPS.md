# Fundamental – ältere SEC-Lücken (nicht übernommene Meldungen)

Stand: 24.10.2026. Verbraucherdaten `quant/data/sec/consumer` vom 19.10.2026, Meldeverlauf `quant/data/fundamentals/daily/state.json` von `main`. Grundlage ist `scripts/fundamental/sec-freshness.mjs` (`notAdoptedItems`): Unternehmen, deren jüngste periodische Meldung (10-Q, 10-K, 20-F, 40-F, auch /A) **vor** dem letzten Verbraucherlauf eingereicht wurde und trotzdem nicht in ihrer Verbraucherdatei steht. Am 24.10. sind das **424** (am 23.10. 427; der Meldeverlauf hat sich seitdem weiterbewegt).

Die Analyse ändert keine Daten. Nichts wird pauschal übernommen oder korrigiert; die Verbraucherdaten erzeugt weiterhin allein `sec-consumer-fundamentals.yml` (Quant).

## Vorgehen je Meldung

1. **SEC companyfacts** (`data.sec.gov/api/xbrl/companyfacts/CIK….json`, abgerufen am 24.10.2026 mit dem User-Agent der SEC-Pipeline, höchstens 4 Anfragen/s): Gibt es Fakten mit genau dieser Accession, und aus welcher Taxonomie (`us-gaap`, `ifrs-full`, nur `dei`/`srt`)?
2. **SEC submissions** (`data.sec.gov/submissions/CIK….json`): Wurde die Meldung als (Inline-)XBRL eingereicht, und welcher Berichtszeitraum (`reportDate`) ist angegeben?
3. **Verbraucherdatei:** Ist der Berichtszeitraum schon aus einer anderen Meldung enthalten? Ist die Datei leer, und warum (`coverage.mapped`, `calendar.fiscalYearEnd`)?
4. **SIC** aus dem SEC-Meldeverlauf (`quant/data/sec/sic-history`): 6770 = Mantelgesellschaft (SPAC).

## Ergebnis

| Klasse | Ursache | Meldungen | davon SPAC | noch relevant |
|---|---|---:|---:|---:|
| Fehlende Daten (SEC) | XBRL-Meldung bei der SEC, Fakten fehlen in companyfacts | 225 | 0 | 225 |
| Verarbeitungsgrenze (Erzeuger) | Verbraucherdatei leer: ohne 10-K kein Geschäftsjahresende ableitbar (FiscalCalendar) | 167 | 84 | 83 |
| Sonstige | Zeitraum bereits aus einer anderen Meldung in den Verbraucherdaten (meist Änderungsmeldung /A) | 15 | 0 | 0 |
| Nicht unterstützte Meldung | nur Deckblattangaben (dei) in XBRL, Abschluss nicht als XBRL-Fakten | 10 | 0 | 0 |
| Fehlende Daten (SEC) | companyfacts enthält aus dieser Meldung nur Nebenangaben (srt), keine Abschlusszahlen | 5 | 0 | 5 |
| Sonstige | Nachfolge-Emittent mit neuer CIK: Verbraucherdatei zur neuen CIK leer, Historie liegt unter der alten CIK | 1 | 0 | 1 |
| Nicht unterstützte Meldung | Meldung ohne XBRL (Änderung/Formular ohne Finanzdaten) | 1 | 0 | 0 |
| **Summe** | | **424** | **84** | **314** |

„Noch relevant“ heißt: Für ein Unternehmen des Produktuniversums fehlt ein Berichtszeitraum mit Abschlusszahlen, und keine andere Meldung deckt ihn. Nicht relevant sind:
- SPACs, weil sie keine operativen Abschlüsse haben;
- Meldungen ohne XBRL-Abschluss;
- Änderungsmeldungen, deren Zeitraum bereits vorliegt.

### 1. Fehlende Daten: als XBRL bei der SEC eingereicht, aber nicht in companyfacts (230)

- **Befund:** Laut submissions wurden diese Meldungen als Inline-XBRL eingereicht. companyfacts enthält aber keinen Fakt mit ihrer Accession.
  - Abbott (ABT): Der 10-Q vom 28.07.2026 (0001628280-26-050134) fehlt. companyfacts endet beim 10-Q vom 29.04.2026; kein Fakt hat ein Periodenende nach Juni 2026.
  - Clorox (CLX): Der 10-K vom 07.08.2026 fehlt, der spätere 10-Q vom 07.10.2026 ist dagegen enthalten.
- **Keine zweite Quelle:** Auch die tägliche SEC-Pipeline (`quant/data/fundamentals/issuers`) liest companyfacts. Sie endet bei diesen Unternehmen beim selben Zeitraum.
- **Behebung:** Weder Fundamental noch der Erzeuger kann das beheben. Der nächste Verbraucherlauf übernimmt die Zahlen, sobald die SEC sie in companyfacts aufnimmt. Bei einem 10-Q geschieht das spätestens mit der Folgemeldung, die die Vorperiode als Vergleichsspalte enthält.
- **Anzeige bis dahin:** Die Aktienseite zeigt den Hinweis, dass bei der SEC ein neuerer Bericht vorliegt, der noch nicht verarbeitet ist.
- **Sonderfall:** Bei fünf 20-F enthält companyfacts aus der Meldung nur Nebenangaben (`srt`, z. B. Rückkaufprogramme), keine Abschlusszahlen.

**US-Emittenten (10-Q/10-K) – 150:** AAT (10-Q 31.07.), ABT (10-Q 28.07.), ACHC (10-Q 28.07.), AEP (10-Q 30.07.), AIV (10-Q 07.08.), AMKR (10-Q 28.07.), AVTR (10-Q 29.07.), AXS (10-Q 28.07.), AXTA (10-Q 29.07.), BAND (10-Q 29.07.), BDN (10-Q 28.07.), BG (10-Q 29.07.), BIIB (10-Q 29.07.), C (10-Q 06.08.), CAR (10-Q 29.07.), CARR (10-Q 28.07.), CB (10-Q 28.07.), CCBG (10-Q 29.07.), CDNS (10-Q 29.07.), CHEF (10-Q 29.07.), CLH (10-Q 29.07.), CLVT (10-Q 29.07.), CLW (10-Q 28.07.), CLX (10-K 07.08.), CNK (10-Q 30.07.), CNP (10-Q 28.07.), CSTM (10-Q 29.07.), CTO (10-Q 28.07.), CTS (10-Q 28.07.), CTSH (10-Q 29.07.), CUBE (10-Q 31.07.), D (10-Q 31.07.), DLR (10-Q 31.07.), DTE (10-Q 28.07.), DUK (10-Q 04.08.), ED (10-Q 06.08.), EIX (10-Q 30.07.), ELS (10-Q 28.07.), ENPH (10-Q 28.07.), EQS (10-Q 14.08.), ETR (10-Q 31.07.), EVRG (10-Q 06.08.), EXC (10-Q 30.07.), EXLS (10-Q 28.07.), F (10-Q 29.07.), FE (10-Q 28.07.), FELE (10-Q 29.07.), FET (10-Q 31.07.), FLNA (10-Q 29.07.), FRME (10-Q 31.07.), FRT (10-Q 31.07.), FTV (10-Q 29.07.), GD (10-Q 29.07.), GEF (10-Q 29.07.), GEHC (10-Q 29.07.), GRMN (10-Q 29.07.), GTX (10-Q 29.07.), HAYW (10-Q 29.07.), HBAN (10-Q 28.07.), HCA (10-Q 28.07.), HIW (10-Q 28.07.), HPP (10-Q 10.08.), HTO (10-Q 28.07.), HTZ (10-Q 06.08.), HUBB (10-Q 29.07.), HUM (10-Q 29.07.), HUN (10-Q 31.07.), HURN (10-Q 28.07.), IDA (10-Q 30.07.), INCY (10-Q 28.07.), IQV (10-Q 28.07.), JBS (10-Q 10.08.), JCI (10-Q 29.07.), KFFB (10-K 28.09.), KN (10-Q 28.07.), KNSA (10-Q 28.07.), KNX (10-Q 29.07.), KO (10-Q 29.07.), LAZ (10-Q 28.07.), LFUS (10-Q 29.07.), LII (10-Q 29.07.), LNT (10-Q 31.07.), LSTR (10-Q 29.07.), MAA (10-Q 30.07.), MAS (10-Q 29.07.), MCRI (10-Q 28.07.), MDLZ (10-Q 28.07.), MGEE (10-Q 05.08.), MGPI (10-Q 29.07.), MNRO (10-Q 29.07.), MPT (10-Q 10.08.), NHTC (10-Q 29.07.), NOV (10-Q 29.07.), NXPI (10-Q 28.07.), OGE (10-Q 29.07.), OMF (10-Q 30.07.), ONB (10-Q 29.07.), OPCH (10-Q 29.07.), ORN (10-Q 29.07.), OSK (10-Q 28.07.), PDM (10-Q 28.07.), PFG (10-Q 29.07.), PII (10-Q 28.07.), PLD (10-Q 29.07.), PNR (10-Q 28.07.), POOL (10-Q 29.07.), PPG (10-Q 29.07.), PPL (10-Q 07.08.), PSN (10-Q 29.07.), PYPL (10-Q 28.07.), QRVO (10-Q 28.07.), QUAD (10-Q 29.07.), QURE (10-Q 29.07.), REG (10-Q 03.08.), REYN (10-Q 29.07.), RMBS (10-Q 28.07.), RNGR (10-Q 28.07.), ROG (10-Q 29.07.), RS (10-Q 28.07.), RYN (10-Q 07.08.), SEVN (10-Q 28.07.), SHEN (10-Q/A 29.07.), SITE (10-Q 29.07.), SLG (10-Q 06.08.), SMTC (10-Q 26.08.), SO (10-Q 30.07.), SON (10-Q 28.07.), SPGI (10-Q 28.07.), SR (10-Q 05.08.), SRE (10-Q 06.08.), STAG (10-Q 28.07.), SUI (10-Q 28.07.), TIPT (10-Q 29.07.), TRTX (10-Q 28.07.), TRU (10-Q 28.07.), TWOD (10-Q 29.07.), TXNM (10-Q 31.07.), UDR (10-Q 28.07.), UE (10-Q 06.08.), ULCC (10-Q 29.07.), V (10-Q 29.07.), VFC (10-Q 29.07.), VICR (10-Q 29.07.), VMC (10-Q 29.07.), VRSK (10-Q 29.07.), WELL (10-Q 28.07.), WES (10-Q 05.08.), WNC (10-Q 29.07.), XIFR (10-Q 28.07.), ZWS (10-Q 28.07.)

**Ausländische Emittenten (20-F/40-F) – 80:** ACB (40-F 11.06.), ANL (20-F 10.04.), ARQQ (20-F 09.12.), ASR (20-F 16.04.), ATS (40-F 28.05.), AUC (20-F 09.12.), AUNA (20-F 22.04.), AURE (20-F 06.01.), AXICY (20-F 24.04.), BHP (20-F 18.08.), BLX (20-F 20.04.), BMA (20-F 20.04.), CHT (20-F 15.04.), CIG (20-F 17.04.), CIGL (20-F 12.05.), DFSC (20-F 29.12.), DOX (20-F 15.12.), DRUG (40-F 23.12.), EDN (20-F 15.04.), ELVA (40-F 19.12.), EZGO (20-F 30.12.), FMX (20-F 24.04.), GFI (20-F 30.03.), GGAL (20-F 16.04.), GIB (40-F 17.12.), GOOS (20-F 15.05.), GRFS (20-F 17.04.), HDB (20-F 29.07.), HELP (40-F 29.06.), HMC (20-F 18.06.), INTR (20-F 30.04.), ITUB (20-F 30.04.), JL (20-F 28.07.), KOF (20-F 16.04.), LNKS (20-F 08.10.), LSPD (40-F 21.05.), MANU (20-F 24.09.), MLEC (20-F 29.12.), MMYT (20-F 27.07.), MNY (20-F/A 27.05.), NAAS (20-F 17.04.), NIPG (20-F 30.04.), NU (20-F 08.04.), NWGL (20-F 27.04.), OGI (40-F 16.12.), OMAB (20-F 30.04.), ORIO (20-F 30.04.), PAC (20-F 17.04.), PAGS (20-F/A 04.06.), PAX (20-F 30.04.), PICS (20-F 30.04.), PMAX (20-F 30.04.), PMEC (20-F 29.07.), PSNY (20-F 17.04.), RNW (20-F 30.07.), SAGT (20-F 29.04.), SDA (20-F 28.04.), SLMT (20-F/A 22.06.), SONY (20-F 18.06.), SQM (20-F 22.04.), SSL (20-F 01.09.), STNE (20-F 23.04.), SUPV (20-F 08.04.), SWVL (20-F 20.04.), TAK (20-F 17.06.), TDIC (20-F 17.08.), TKC (20-F 17.04.), TLK (20-F 15.05.), TV (20-F 30.04.), VFS (20-F 30.04.), VINP (20-F 20.04.), VIST (20-F 28.04.), VLRS (20-F 28.04.), VOD (20-F 22.05.), WBX (20-F 09.04.), XP (20-F 29.04.), XRTX (20-F 20.03.), YFOR (20-F/A 24.04.), YTRA (20-F 31.07.), ZTEK (40-F/A 26.06.)

### 2. Verarbeitungsgrenze des Erzeugers: leere Verbraucherdatei ohne Geschäftsjahresende (167)

- **Befund:** Fast alle dieser Emittenten haben bisher keinen 10-K eingereicht (Börsengang oder SPAC 2025/26). Drei haben laut SEC-Meldeverlauf zwar einen 10-K (FSOL, BEBE, NRT), companyfacts enthält aber keine Jahresfakten daraus. companyfacts enthält ihre 10-Q-Abschlusszahlen (`us-gaap`). Die Verbraucherdatei ist trotzdem leer (`coverage.mapped = 0`, `calendar.fiscalYearEnd = null`).
- **Ursache:** `FiscalCalendar` leitet das Geschäftsjahr aus Jahresmeldungen ab. Ohne 10-K entsteht kein Geschäftsjahr und damit auch kein Quartal.
- **Zuständigkeit:** Das ist eine Grenze in `scripts/quant/sec` (Quant, fremde Pipeline), kein Fehler der Fundamental-Projektion. Eine Änderung gehört nach der Fachmodell-Regel in einen eigenen Quant-PR mit Vorher/Nachher-Vergleich.
- **Auflösung:** Mit dem ersten 10-K löst sich die Lücke für das jeweilige Unternehmen von selbst.
- **Nicht relevant:** 84 SPACs (SIC 6770).

**Relevant – operative Unternehmen, 83:** AADX (12.08.), ADBT (12.08.), ADIG (13.08.), AIAI (14.08.), AKTS (13.08.), ALMR (11.08.), AMSS (14.08.), APMD (08.09.), ARXS (30.07.), ATTO (02.09.), AVAT (19.08.), AVEX (12.08.), AVLN (12.08.), BLSM (18.09.), BOBS (06.08.), BRUN (18.08.), BRVE (08.09.), BTGO (12.08.), BXDC (04.08.), CBRS (12.08.), CNXU (14.09.), COAG (11.08.), CSQR (10.08.), DMRC (14.08.), EAI (31.07.), EIKN (13.08.), ELMT (13.08.), EROK (13.08.), EXYN (20.08.), FBDT (28.08.), FCBM (14.08.), FRBT (13.08.), FRVO (13.08.), FSOL (13.08.), GENB (06.08.), GLND (13.08.), GMRS (12.08.), GYGY (21.08.), HMH (05.08.), HONA (05.08.), INIO (28.07.), IOND (01.09.), JAN (05.08.), JMKE (09.09.), KARD (11.08.), KLRA (12.08.), LABT (14.08.), LCLN (10.08.), LFTO (13.08.), LMRI (13.08.), LTGO (03.09.), MAIR (30.07.), MFP (18.08.), MSBT (13.08.), MWH (14.08.), NRT (08.09.), OBX (14.08.), OCTV (12.08.), ODTX (06.08.), OFRM (06.08.), PARK (13.08.), PBLS (13.08.), PS (13.08.), PXED (14.07.), QMLS (28.08.), QNT (13.08.), RACC (12.08.), REF (11.09.), RMIX (14.08.), RVII (28.09.), SCTX (02.09.), SECZ (13.08.), SPTX (03.08.), SSMR (12.08.), STDN (27.08.), SUJA (04.08.), SWMR (14.08.), TRAX (12.08.), VGNT (04.08.), WHK (13.08.), XE (13.08.), YSS (14.08.), YSWY (13.08.)

### 3. Nicht unterstützte Meldungen (11, nicht relevant)

- **Befund:** Entweder enthält das XBRL nur das Deckblatt (`dei`) und der Abschluss liegt nur als Dokument vor (häufig bei 40-F/20-F mit dem Abschluss als Anlage), oder die Meldung hat gar kein XBRL.
- **Folge:** Aus companyfacts nicht verwertbar. Daten kommen erst mit einer späteren XBRL-Meldung.
- AGMB (20-F 23.04.), ALPS (20-F 06.08.), AUGO (20-F/A 29.04.), CIB (20-F 08.04.), CNI (40-F 04.02.), HBNB (20-F 30.04.), KWM (20-F 15.05.), PAYP (20-F 30.06.), TMCR (20-F 27.04.), VACI (20-F 07.10.), VMET (20-F 30.04.)

### 4. Sonstige (16, nicht relevant)

- **ExxonMobil (XOM) – relevant:** Das Produktuniversum ordnet XOM der neuen CIK 0002115436 zu (ExxonMobil Holdings Corp). Unter dieser CIK liegt in companyfacts bisher nur ein 10-Q (Q2 2026, eingereicht am 03.08.2026 mit der Accession 0000034088-26-000093 der bisherigen Gesellschaft). Die Verbraucherdatei ist deshalb leer, und Fundamental zeigt für XOM keine SEC-Historie. Die Historie liegt unter der alten CIK 0000034088, für die es keine Verbraucherdatei gibt. Die Zuordnung Ticker → CIK gehört dem Verzeichnis und der SEC-Pipeline (Quant), nicht Fundamental. Sie wird hier nicht umgebogen, weil das eine Identitätsänderung wäre (ADR-001). Das ist an Quant weiterzugeben.
- **Befund:** Änderungsmeldungen (/A) und eine Nachmeldung, deren Berichtszeitraum aus der ursprünglichen Meldung bereits in der Verbraucherdatei steht. companyfacts enthält aus ihnen keine Fakten.
- **Offen:** Ob eine Änderung Zahlen korrigiert, lässt sich daraus nicht feststellen.
- AEG (20-F/A 01.04.), EXK (40-F/A 13.04.), IMTE (20-F/A 04.03.), INTJ (20-F/A 21.04.), KRKR (20-F/A 19.05.), LGO (40-F/A 02.04.), LU (20-F 30.04.), NBIS (20-F/A 22.05.), NGEN (40-F/A 16.10.), NNNN (20-F/A 09.04.), TBBB (20-F/A 22.05.), VMAR (20-F/A 19.12.), WBUY (20-F/A 13.05.), WOK (20-F/A 20.03.), ZBAO (20-F/A 12.01.)

## Folgen für Fundamental

- **Keine Datenkorrektur in diesem PR.** Fundamental zeigt bei allen betroffenen Unternehmen den letzten verarbeiteten Zeitraum. Kennt die SEC bereits einen neueren 10-Q/10-K, steht zusätzlich der Hinweis auf den noch nicht verarbeiteten Bericht da.
- **Kein zusätzlicher Lauf:** Der Wächter `fundamental-sec-freshness.yml` stößt für diese älteren Meldungen keinen Lauf an (`notAdopted`). Solange companyfacts sie nicht enthält, würde auch ein neuer Lauf sie nicht übernehmen.
- **Weiterzugeben an Quant:** Klasse 2 (Geschäftsjahr ohne 10-K, 83 operative Unternehmen) und die CIK-Nachfolge bei XOM.
