# Unabhängige Prüfung von Security-Master-PR #1119

Stand: 09.11.2026 (UTC). **Empfehlung: nachbessern; unverändert nicht mergen.** Die fachliche Prüfung erfolgte ausschließlich lesend. Auf anschließenden Nutzerauftrag wird der Bericht in einem separaten Dokumentations-PR veröffentlicht und als eingefrorener Beleg registriert. PR #1119, Fachcode und generierte Daten bleiben unverändert.

## Ergebnis und Trefferquote

Die pauschale Aussage „132 Firmen sind delistet/nicht mehr handelbar“ ist durch die Belege nicht gedeckt. Viele alte Listing-Zeilen dürfen durchaus INACTIVE werden. Das ist von einer Einstellung des Firmen-/Wertpapierhandels, der Fortführung an einem anderen Handelsplatz und einem Umtausch alter Aktien zu unterscheiden. Besonders **FITBI** ist ein belegter Börsenwechsel; **QRTEB und TRINL** haben nicht passende Klassenbelege. Die 8-K-Regel „Einreichungstag = Wirksamkeitstag“ verwechselt nachweislich Einreichung und Ereignis; ohne eindeutige Datumssemantik sind die Werte nicht freigabefähig.

| Messgröße | Ergebnis |
|---|---|
| Reproduzierbare Zufallsstichprobe | 40 von 132 |
| Zusätzlicher breiter Bekanntheits-/Größen-Screen | 57 Titel; einschließlich Überschneidungen 79 verschiedene Detailprüfungen |
| Original-SEC-Beleg für Zufallsstichprobe unabhängig abgerufen | 40/40 = 100 % |
| Beleg für Beendigung/Ersetzung des **alten Listings**, eng ausgelegt | 40/40 = 100 %; ausdrücklich keine Trefferquote für globale Unhandelbarkeit |
| Im Detailumfang Beleg nicht passend zur betroffenen Klasse | 2/79: QRTEB, TRINL; klassenbezogene Belegdeckung damit höchstens 77/79 = 97,5 % |
| Konkrete 8-K-Ereignis-/Datumsabweichungen in Zufallsstichprobe | 5/40 = 12,5 %: ACVA, BSII, CFB, COLA, ISPO; CFB als erster inaktiver Handelstag plausibel, jedoch nicht als Vollzugsdatum |
| Weitere solche Datumsabweichungen außerhalb Zufallsstichprobe | AACT, AVNS, STRM, PLYA |
| Nachgewiesene/angezeigte Fortführung in Zufallsstichprobe | mindestens 8/40: APAD, BBCQ, BSII, COLA, CSCI, BHAT, CASI, FTRK; letzte drei teils nur Metadaten/OTC-Zulässigkeit, keine heutige Ausführung geprüft |
| Kursprüfung | alle 132, siehe Volltabelle unten |

Eine ehrliche Gesamt-Trefferquote für „heute nirgends mehr handelbar und Datum exakt richtig“ lässt sich aus Form 25 und SEC-Tickerlisten **nicht** berechnen: bei mehreren Fällen bleibt das offen. 35/40 ohne gefundenen 8-K-Datumsfehler sind **keine** verifizierten 87,5 % Datumsgenauigkeit; Form-25-Wirksamkeit, Handelsstopp und Rückzahlung sind unterschiedliche Ereignisse. Auch positive Nachfolger-Metadaten beweisen keinen tatsächlich ausgeführten Handel am 09.11.2026.

## Prüfstand, Population und Auswahl

- Repository-Snapshot main: `b4ece5290c5d71cca05b3692e5c95ea415f4a909` (lokaler Abruf; spätere Datenläufe nicht enthalten).
- PR-Head: `4f16be792d9b608b35ced3be1d86c297f76960b5`; Basis laut PR `5d9b6d6798d1a7f697c7f98cf8663f1a4ce3aa91`.
- PR: https://github.com/dennismueller10x-sudo/vision-universe-research/pull/1119
- Register: 133 Records. Prüfpopulation = diese Records **ohne MDV** (132); MDV ist laut PR-Vergleich mit der neuen Anbieterliste schon inaktiv. Der auf der PR-Basis eingecheckte alte Stamm allein rekonstruiert die 132 nicht: er führt MDV noch ACTIVE mit end_date 19.08.2026. Der PR baut den Stamm nicht neu und enthält den verwendeten vollständigen Anbieter-Input nicht. Die 132 sind daher aus Register plus dokumentierter MDV-Ausnahme abgegrenzt, nicht aus einem eingecheckten 132-Zeilen-Diff.
- PR-Inputstand: 28./29.10.2026; Prüfdatum: 09.11.2026. Aktueller main-Stamm hat Stand 04.11.2026. Diese Stände werden nicht vermischt.
- Auswahl ohne Zurücklegen: SHA-256 von UTF-8 `PR1119-independent-audit-2026-11-09:` + Ticker, aufsteigend nach vollständigem Hexdigest; erste 40. Der feste Seed macht die pseudozufällige Auswahl reproduzierbar; keine Auswahl nach Prüfergebnis.
- „Groß/bekannt“ ist kein objektiver Grenzwert. Konservativ wurden auch bekannte kleinere Emittenten sowie deren Anleihe-/Vorzugsserien einbezogen; alle 57 stehen im Detailverzeichnis mit Kennung B. Dies ist keine Marktkapitalisierungsrangliste.

Zufallsstichprobe: AACB, ACVA, APAD, ATMC, BBCQ, BHAT, BOWN, BSII, BWNB, CASI, CCIX, CFB, COLA, CSCI, CVAC, ETWO, EVGR, FTRK, GAINL, GLADZ, HBI, HSII, INFA, ISPO, JFB, MCAA, MURA, PET, PRLH, SDM, SLP, SNBR, SNCR, SNCRL, TBHC, TBNK, UBFO, VSTA, ZIMV, ZK.

Methodik: Originale der SEC-Belege wurden per HTTPS gelesen, einschließlich Wertpapierklasse und einschlägiger Item-2.01-/3.01-Texte. Bei Register-URLs auf ein Verzeichnis wurde das Original-Submission-Dokument der Accession gelesen. Zusätzlich wurden SEC-Submissions mit aktuellen Ticker-Metadaten und ausgewählte zeitnahe 8-K/6-K gelesen. Die PR-eigenen eingefrorenen Kursläufe gelten nicht als unabhängiger Delistingbeleg. Für Form 25 ist filingDate + 10 Tage die formale Listing-Wirksamkeit gemäß [17 CFR 240.12d2-2(d)(1)](https://www.ecfr.gov/current/title-17/section-240.12d2-2); daraus folgt weder der letzte Handelstag noch ein Verbot des OTC-/Auslandshandels.

## Fehlfälle, Fortführungen und erforderliche Korrekturen

### Falsche oder unzureichende Klassenbelege – vorerst ausnehmen

- **QRTEB:** Falsche Klasse: Form 25 nennt Series A Common Stock und 8%-Preferred, nicht Series B. Andere 8-K nennen Series B als QVCGB auf OTC und später QVCGQ. QRTEB nicht aus diesem Form 25 deaktivieren. [SEC 0001354457-26-000540](https://www.sec.gov/Archives/edgar/data/1355096/000135445726000540/xslF25X02/primary_doc.xml).
- **TRINL:** Beleg passt nicht: Form 25 umfasst Common Stock und 7,875%-Notes März/September 2029. TRINL wird darin nicht identifiziert. Datum 03.08.2026 für TRINL nicht belegt; ausnehmen bis klassenbezogener Beleg vorliegt. [SEC 0001213900-26-081363](https://www.sec.gov/Archives/edgar/data/1786108/000121390026081363/ea0299064-01_25.htm).

TRINL ist damit kein bewiesener heute aktiver Titel; bewiesen ist der fehlende Bezug dieses Belegs zur stillgelegten Zeile. Für QRTEB ist das historische Ende des alten Symbols durchaus möglich, aber durch einen anderen Vorgang zu belegen.

### Börsenwechsel, Nachfolger und fortgeführter Handel

- **AACT:** Fortführung KDK/KDKRW an Nasdaq ab 25.09.2025; Vollzug 24.09., PR nimmt 30.09. Alte NYSE-Zeile beenden, Nachfolger verknüpfen. [SEC 0001193125-25-225299](https://www.sec.gov/Archives/edgar/data/1853138/000119312525225299/0001193125-25-225299.txt).  [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0001853138.json).
- **APAD:** Vollzug 07.05.2026; ENHA an NYSE ab 08.05.2026. Börsen-/Tickerwechsel; altes Symbol beenden, Firma nicht als unhandelbar behandeln. [SEC 0001628280-26-032558](https://www.sec.gov/Archives/edgar/data/1956439/000162828026032558/0001628280-26-032558.txt).  [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0001956439.json).
- **BBCQ:** Business Combination am 27.08.2026; New Pasqal Shares/Warrants sollen als PSQL/PSQLW an Nasdaq handeln. Kein Nachweis für Ende der wirtschaftlichen Fortführung. [SEC 0001213900-26-094397](https://www.sec.gov/Archives/edgar/data/2088295/000121390026094397/0001213900-26-094397.txt).  [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0002088295.json).
- **BSII:** Vollzug 03.06.2025, nicht 05.06.; TGE/TGE WS an NYSE/NYSE American angekündigt. Alte SPAC-Zeile endet, Nachfolger bleibt zuzuordnen. [SEC 0001104659-25-056485](https://www.sec.gov/Archives/edgar/data/2025065/000110465925056485/0001104659-25-056485.txt).  [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0002025065.json).
- **COLA:** Vollzug 01.10.2026; Nachfolger SAIQ handelt ab 02.10.2026 an Nasdaq. PR nimmt Einreichung 07.10. [SEC 0001213900-26-107578](https://www.sec.gov/Archives/edgar/data/2028201/000121390026107578/ea0307944-8k_columbus.htm).  [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0002028201.json).
- **FITBI:** Börsenwechsel: Nasdaq endet 11.06.2026, NYSE beginnt 12.06.2026, Series I als FITB PRI (SEC aktuell FITB-PI). PR 21.06. ist nur formaler Nasdaq-Austrag. Kein Ende der Handelbarkeit. [SEC 0001193125-26-267509](https://www.sec.gov/Archives/edgar/data/35527/000119312526267509/d132955d25.htm). [SEC 0001193125-26-255417](https://www.sec.gov/Archives/edgar/data/35527/000119312526255417/d157060d8k.htm) [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0000035527.json).
- **CSCI:** 6-K bestätigt freiwilligen Nasdaq-Rückzug bei Erhalt der Toronto-Notierung. SEC aktuell CSCIF. Kein weltweites Ende der Handelbarkeit. [SEC 0001493152-25-012330](https://www.sec.gov/Archives/edgar/data/1113423/000149315225012330/form25.htm). [SEC 0001493152-25-012012](https://www.sec.gov/Archives/edgar/data/1113423/000149315225012012/form6-k.htm) [SEC 0001493152-25-021770](https://www.sec.gov/Archives/edgar/data/1113423/000149315225021770/form6-k.htm) [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0001113423.json).
- **EBR-B:** Form 25 betrifft Preferred-ADS der AXIA Energia, nicht gesamte Firma. Aktuelle SEC-Metadaten führen AXIAY/AXICY. Klassen-/Tickerfortführung vor pauschaler Firmen-Deaktivierung auflösen. [SEC 0000876661-25-001021](https://www.sec.gov/Archives/edgar/data/1439124/000087666125001021/xslF25X02/primary_doc.xml).  [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0001439124.json).
- **QRTEA:** Alter Ticker war bereits zu QVCGA gewechselt; spätere 8-K führen QVCAQ auf OTCID. Form 25 betrifft Nasdaq-Series A, nicht Ende aller Handelbarkeit. [SEC 0001354457-26-000540](https://www.sec.gov/Archives/edgar/data/1355096/000135445726000540/xslF25X02/primary_doc.xml). [SEC 0001355096-26-000015](https://www.sec.gov/Archives/edgar/data/1355096/000135509626000015/qvcga-20260417.htm) [SEC 0001104659-26-075187](https://www.sec.gov/Archives/edgar/data/1355096/000110465926075187/tm2618149d1_8k.htm) [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0001355096.json).
- **BHAT:** Nasdaq-Form 25 echt; aktuelle SEC-Metadaten führen BHATF. Fortführung prüfen; fehlende Bewegung von BHAT beweist keine Unhandelbarkeit von BHATF. [SEC 0001354457-26-000685](https://www.sec.gov/Archives/edgar/data/1759136/000135445726000685/xslF25X02/primary_doc.xml).  [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0001759136.json).
- **CASI:** Nasdaq-Form 25 echt; aktuelle SEC-Metadaten führen CASIF. Fortführung prüfen; kein globaler Unhandelbarkeitsbeweis. [SEC 0001354457-26-000606](https://www.sec.gov/Archives/edgar/data/1962738/000135445726000606/xslF25X02/primary_doc.xml).  [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0001962738.json).
- **FTRK:** 6-K nennt Nasdaq-Suspension seit 18.08.2026 und OTC-Quote FTRKD, vorher FTRKF. SEC aktuell FTRKF. 19.10. ist formales Delisting, nicht Ende jeglichen Handels. [SEC 0001354457-26-000974](https://www.sec.gov/Archives/edgar/data/2027262/000135445726000974/xslF25X02/primary_doc.xml). [SEC 0001493152-26-043941](https://www.sec.gov/Archives/edgar/data/2027262/000149315226043941/form6-k.htm) [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0002027262.json).
- **SNBR:** Form 25 beendet Nasdaq-Common-Stock-Notierung; SEC aktuell SNBRQ. OTC-/Insolvenzfortführung nicht als unveränderte Nasdaq-Zeile behandeln, aber Firma nicht pauschal unhandelbar nennen. [SEC 0001354457-26-000682](https://www.sec.gov/Archives/edgar/data/827187/000135445726000682/xslF25X02/primary_doc.xml).  [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0000827187.json).
- **MGIC:** 6-K: Fusion mit Matrix am 24.02.2026 erwartet, Handelsstopp nach After-hours 23.02.; Form 25 wirksam 06.03. Aktuelle SEC-Metadaten RMTHF; Folgeidentität gesondert prüfen. [SEC 0001354457-26-000210](https://www.sec.gov/Archives/edgar/data/876779/000135445726000210/xslF25X02/primary_doc.xml). [SEC 0000876779-26-000003](https://www.sec.gov/Archives/edgar/data/876779/000087677926000003/ea0278176-6k_magic.htm) [SEC-Tickerstand](https://data.sec.gov/submissions/CIK0000876779.json).

Diese Fälle nicht pauschal wieder ACTIVE schalten: ein altes Symbol kann richtig inaktiv sein. Erforderlich sind Ereignistyp (Wechsel/Fusion/OTC), Nachfolgeidentität, alter/neuer Handelsplatz und passende Klassenkennung. Ein tatsächlicher Fusionsumtausch (z. B. ANSS→Cash/SNPS, HBI→Cash/Gildan, SLRN→Alumis) rechtfertigt das Ende der alten Aktie; er ist kein falsches Delisting nur weil der Käufer weiter handelt.

### Datumsfehler und unterschiedliche Datumsbegriffe

| Ticker | PR effectiveDate | Im Original belegtes Ereignis |
|---|---|---|
| AACT | 2025-09-30 | Vollzug 24.09.2025; KDK an Nasdaq ab 25.09.. [SEC 0001193125-25-225299](https://www.sec.gov/Archives/edgar/data/1853138/000119312525225299/0001193125-25-225299.txt) |
| ACVA | 2026-10-19 | Vollzug 16.10.2026; 19.10. ist Einreichung. [SEC 0001193125-26-425225](https://www.sec.gov/Archives/edgar/data/1637873/000119312526425225/0001193125-26-425225.txt) |
| AVNS | 2026-07-30 | Vollzug/Handelsstopp vor Eröffnung 27.07.2026. [SEC 0001606498-26-000115](https://www.sec.gov/Archives/edgar/data/1606498/000160649826000115/avns-20260727.htm) |
| BSII | 2025-06-05 | Business Combination 03.06.2025; Handelsfortführung TGE angekündigt. [SEC 0001104659-25-056485](https://www.sec.gov/Archives/edgar/data/2025065/000110465925056485/0001104659-25-056485.txt) |
| CFB | 2025-03-03 | Handelsende nach regulärem Handel 28.02.2025; Fusion 01.03.. [SEC 0001104659-25-019506](https://www.sec.gov/Archives/edgar/data/1458412/000110465925019506/0001104659-25-019506.txt) |
| COLA | 2026-10-07 | Vollzug 01.10.2026; SAIQ-Handel ab 02.10.. [SEC 0001213900-26-107578](https://www.sec.gov/Archives/edgar/data/2028201/000121390026107578/ea0307944-8k_columbus.htm) |
| ISPO | 2026-02-04 | Vollzug und Nasdaq-Anforderung 03.02.2026. [SEC 0001820566-26-000018](https://www.sec.gov/Archives/edgar/data/1820566/000182056626000018/0001820566-26-000018.txt) |
| STRM | 2025-08-13 | Vollzug und Handelsstopp vor Eröffnung 12.08.2025. [SEC 0001437749-25-026379](https://www.sec.gov/Archives/edgar/data/1008586/000143774925026379/strm20250812_8k.htm) |
| PLYA | 2025-06-17 | Closing 11.06.2025; Nasdaq-Suspension/Form 25 am 16.06.. [SEC 0001104659-25-060328](https://www.sec.gov/Archives/edgar/data/1692412/000110465925060328/0001104659-25-060328.txt) |

Weitere semantische Datumsprobleme: ETWO fusionierte am 03.08., Stopp erst vor Eröffnung 04.08.2025. ZIMV nennt 20.10. als Fusion, **30.10.2025** ausdrücklich als formales Delisting. ZEUS kann am 13.02.2026 noch handeln, der Stopp erfolgt laut Text nach Börsenschluss. BWNB/GAINL/GLADZ haben Rückzahlungstermine vor filingDate+10 (13.08.2026 / 16.12.2025 / 15.10.2025); Ankündigungen sind kein nachträglicher Erfüllungsnachweis. Diese Angaben nicht in ein unbenanntes einziges effectiveDate pressen.

### Bekannte Emittenten sind nicht zwingend delistet

Bei BWNB, CGBDL, FOSLL, GAINL, GLADZ, METCL, RILYK, RWAYZ, RZB und SNCRL beziehen sich die Form-25-Belege auf **Notes/Debentures**, bei FITBI auf Preferred Depositary Shares. Sie sind im PR-Vergleich dennoch EQUITY_COMMON. Das ist ein bereits vorhandener Klassifizierungsfehler, den die Deaktivierung nicht behebt. Der Klassenbezug der jeweiligen Austragung ist im Detailverzeichnis dokumentiert. Babcock & Wilcox, Carlyle Secured Lending, Fossil, Gladstone, Ramaco, BRC/Riley, Runway und RGA dürfen aus diesen Belegen nicht als insgesamt nicht mehr handelbar abgeleitet werden.

## Kurse in quant/data: vollständige Prüfung aller 132

Geprüft wurden die lokalen Tagesreihen `quant/data/market/discover-series/ref_<T>.json`, Wochenreihen `discover-series-long`, und das Tagesverzeichnis `intraday/2026-11-09`. Zusätzlich wurde die Datenstruktur unter quant/data sowie die aggregierte Markt-/Universumskette gesichtet. EBR-B ist der Baseline-Ticker; kein stillschweigender Wechsel auf EBR.B oder Nachfolger, der eine neue Identitätszuordnung voraussetzen würde.

- **131/132 haben weiterhin eine lokale Tageskursreihe.** EBR-B fehlt dort.
- **130/132 reichen bis 06.11.2026**, der letzten abgeschlossenen US-Börsensitzung vor der Prüfung; SAT endet am 29.09.2026. Die Werte sind weiter als `CALCULATED`/`dataMode: real` gekennzeichnet.
- **Keine der 132 hat eine Datei im Intraday-Verzeichnis 09.11.2026**; auch die geprüften Tages-/Wochenpunkte enthalten keinen Kurs vom 09.11. Ein wörtlicher Nachweis „echter Kurs heute“ wurde also nicht gefunden.
- Bei 130 der 131 vorhandenen Tagesreihen gibt es nach dem PR-effectiveDate **keine** Schlusskursänderung. Das entspricht fortgeschriebenen alten Preisen und widerlegt ein Delisting nicht. Es ist dennoch der vom Nutzer gesuchte Datenwiderspruch: aktuelle Datumsstempel/Produktreihen suggerieren weiterhin aktuelle Preisbeobachtungen.
- **SHLT**: 31.03.2025 = 2,07; 01.04. = 2,08; 02.04. = 2,05 USD, danach konstant bis 06.11.2026. Das sind zwei Änderungen nach effectiveDate 31.03. Der 7-Tage-Puffer des PR lässt gerade solche Bewegungen zu. Ohne Klärung von Quelle/Handelsplatz nicht als widerspruchsfreien Stopptag übernehmen.

Historische Kurse dürfen erhalten bleiben. Nach dem maßgeblichen Handelsende fortgeschriebene Punkte brauchen Stale-/Synthetic-Kennzeichnung bzw. Abbruch der handelbaren Reihe. Eine Kurszeile allein beweist keinen Trade; aus dem eingefrorenen Schluss darf auch kein verifizierter Liquidationserlös im Backtest entstehen.

## Detailverzeichnis der 79 Prüfungen

Z = Zufallsstichprobe, B = zusätzlicher Bekanntheits-Screen. „Form 25 bestätigt“ bezeichnet ausschließlich das alte Listing und die genannte Klasse. Für solche Zeilen ohne weiteren Beleg sind letzter Handelstag, OTC-Fortführung und heutige globale Handelbarkeit offen. „Fusion bestätigt“ bezieht sich auf die alte Aktie, nicht auf die Existenz der operativen Firma. Jeder Link führt zum unabhängig gelesenen Original, nicht zu einem PR-internen Fallbericht.

| Ticker / Auswahl | Firma | PR-Datum | Befund und Beleg |
|---|---|---|---|
| AACB (Z) | Artius II Acquisition Inc. | 2026-08-29 | Form 25 bestätigt alten Listing-Rückzug; Class A Ordinary Share, Right, Unit. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-26-000808](https://www.sec.gov/Archives/edgar/data/2034334/000135445726000808/xslF25X02/primary_doc.xml)  |
| ACVA (ZB) | ACV Auctions Inc. | 2026-10-19 | Übernahme durch Copart am 16.10.2026; PR-Datum 19.10. ist Einreichung, nicht Vollzug. Alte Aktien in Baranspruch umgewandelt. SEC-Submissions führt ACVA noch: Metadaten allein ungeeignet. [SEC 0001193125-26-425225](https://www.sec.gov/Archives/edgar/data/1637873/000119312526425225/0001193125-26-425225.txt)  |
| ALE (B) | ALLETE INC | 2025-12-15 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001140361-25-045482](https://www.sec.gov/Archives/edgar/data/66756/000114036125045482/ef20060780_8k.htm)  |
| ANSS (B) | ANSYS INC | 2025-07-17 | Synopsys-Fusion 17.07.2025, Suspendierung vor Eröffnung; alte ANSS-Aktien in Cash/0,3399 SNPS umgewandelt. Kein bloßer Tickerwechsel. [SEC 0001140361-25-026141](https://www.sec.gov/Archives/edgar/data/1013462/000114036125026141/0001140361-25-026141.txt)  |
| APAD (Z) | Enhanced Group Inc. | 2026-05-08 | Vollzug 07.05.2026; ENHA an NYSE ab 08.05.2026. Börsen-/Tickerwechsel; altes Symbol beenden, Firma nicht als unhandelbar behandeln. [SEC 0001628280-26-032558](https://www.sec.gov/Archives/edgar/data/1956439/000162828026032558/0001628280-26-032558.txt)  |
| ATMC (Z) | ALPHATIME ACQUISITION CORP | 2026-01-25 | Form 25 bestätigt alten Listing-Rückzug; Ordinary Shares, Rights, Units, Warrants. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-26-000044](https://www.sec.gov/Archives/edgar/data/1889106/000135445726000044/xslF25X02/primary_doc.xml)  |
| AVNS (B) | AVANOS MEDICAL, INC. | 2026-07-30 | Fusion am 27.07.2026; Handelsstopp vor Eröffnung 27.07. ausdrücklich bestätigt. PR 30.07. zu spät. [SEC 0001606498-26-000115](https://www.sec.gov/Archives/edgar/data/1606498/000160649826000115/avns-20260727.htm)  |
| BBCQ (Z) | Bleichroeder Acquisition Corp. II | 2026-08-27 | Business Combination am 27.08.2026; New Pasqal Shares/Warrants sollen als PSQL/PSQLW an Nasdaq handeln. Kein Nachweis für Ende der wirtschaftlichen Fortführung. [SEC 0001213900-26-094397](https://www.sec.gov/Archives/edgar/data/2088295/000121390026094397/0001213900-26-094397.txt)  |
| BGFV (B) | BIG 5 SPORTING GOODS Corp | 2025-10-02 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001193125-25-227537](https://www.sec.gov/Archives/edgar/data/1156388/000119312525227537/d54346d8k.htm)  |
| BHAT (Z) | Blue Hat Interactive Entertainment Technology | 2026-07-24 | Nasdaq-Form 25 echt; aktuelle SEC-Metadaten führen BHATF. Fortführung prüfen; fehlende Bewegung von BHAT beweist keine Unhandelbarkeit von BHATF. [SEC 0001354457-26-000685](https://www.sec.gov/Archives/edgar/data/1759136/000135445726000685/xslF25X02/primary_doc.xml)  |
| BLFS (B) | BIOLIFE SOLUTIONS INC | 2026-10-06 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001193125-26-415012](https://www.sec.gov/Archives/edgar/data/834365/000119312526415012/0001193125-26-415012.txt)  |
| BOWN (Z) | Bowen Acquisition Corp | 2026-07-23 | Form 25 bestätigt alten Listing-Rückzug; Ordinary Shares, Rights, Units. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-26-000667](https://www.sec.gov/Archives/edgar/data/1973056/000135445726000667/xslF25X02/primary_doc.xml)  |
| BSII (Z) | Black Spade Acquisition II Co | 2025-06-05 | Vollzug 03.06.2025, nicht 05.06.; TGE/TGE WS an NYSE/NYSE American angekündigt. Alte SPAC-Zeile endet, Nachfolger bleibt zuzuordnen. [SEC 0001104659-25-056485](https://www.sec.gov/Archives/edgar/data/2025065/000110465925056485/0001104659-25-056485.txt)  |
| BWNB (ZB) | Babcock & Wilcox Enterprises, Inc. | 2026-08-23 | Beleg betrifft 6,50%-Senior-Notes 2026, nicht BW-Stammaktie. Rückzahlung für 13.08.2026 angekündigt; 23.08. nur formale Austragung. [SEC 0000876661-26-000682](https://www.sec.gov/Archives/edgar/data/1630805/000087666126000682/xslF25X02/primary_doc.xml) [SEC 0001104659-26-082840](https://www.sec.gov/Archives/edgar/data/1630805/000110465926082840/tm2620294d1_8k.htm) |
| CASI (ZB) | CASI Pharmaceuticals, Inc. | 2026-07-03 | Nasdaq-Form 25 echt; aktuelle SEC-Metadaten führen CASIF. Fortführung prüfen; kein globaler Unhandelbarkeitsbeweis. [SEC 0001354457-26-000606](https://www.sec.gov/Archives/edgar/data/1962738/000135445726000606/xslF25X02/primary_doc.xml)  |
| CCIX (Z) | Churchill Capital Corp IX/Cayman | 2026-08-06 | Form 25 bestätigt alten Listing-Rückzug; Class A Ordinary, Warrant, Unit. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-26-000732](https://www.sec.gov/Archives/edgar/data/2006291/000135445726000732/xslF25X02/primary_doc.xml)  |
| CFB (Z) | CROSSFIRST BANKSHARES, INC. | 2025-03-03 | Fusion mit First Busey am 01.03.2025; Nasdaq-Stopp nach regulärem Handel 28.02.2025. Einreichung 03.03. kein Fusionsdatum; als erster inaktiver Börsentag nach dem Wochenende vertretbar. [SEC 0001104659-25-019506](https://www.sec.gov/Archives/edgar/data/1458412/000110465925019506/0001104659-25-019506.txt)  |
| CGBDL (B) | Carlyle Secured Lending, Inc. | 2025-12-08 | Form 25 betrifft 8,20%-Notes 2028; keine Delistung von CGBD-Stammaktien ableiten. [SEC 0001354457-25-001191](https://www.sec.gov/Archives/edgar/data/1544206/000135445725001191/xslF25X02/primary_doc.xml)  |
| CMRX (B) | CHIMERIX INC | 2025-04-21 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001193125-25-087237](https://www.sec.gov/Archives/edgar/data/1117480/000119312525087237/0001193125-25-087237.txt)  |
| COLA (Z) | Columbus Acquisition Corp/Cayman Islands | 2026-10-07 | Vollzug 01.10.2026; Nachfolger SAIQ handelt ab 02.10.2026 an Nasdaq. PR nimmt Einreichung 07.10. [SEC 0001213900-26-107578](https://www.sec.gov/Archives/edgar/data/2028201/000121390026107578/ea0307944-8k_columbus.htm)  |
| CSCI (Z) | COSCIENS Biopharma Inc. | 2025-09-05 | 6-K bestätigt freiwilligen Nasdaq-Rückzug bei Erhalt der Toronto-Notierung. SEC aktuell CSCIF. Kein weltweites Ende der Handelbarkeit. [SEC 0001493152-25-012330](https://www.sec.gov/Archives/edgar/data/1113423/000149315225012330/form25.htm) [SEC 0001493152-25-012012](https://www.sec.gov/Archives/edgar/data/1113423/000149315225012012/form6-k.htm) [SEC 0001493152-25-021770](https://www.sec.gov/Archives/edgar/data/1113423/000149315225021770/form6-k.htm) |
| CVAC (ZB) | CureVac N.V. | 2026-01-16 | Form 25 bestätigt alten Listing-Rückzug; Ordinary Shares. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-26-000010](https://www.sec.gov/Archives/edgar/data/1809122/000135445726000010/xslF25X02/primary_doc.xml)  |
| EBR-B (B) | AXIA Energia S.A. | 2026-01-08 | Form 25 betrifft Preferred-ADS der AXIA Energia, nicht gesamte Firma. Aktuelle SEC-Metadaten führen AXIAY/AXICY. Klassen-/Tickerfortführung vor pauschaler Firmen-Deaktivierung auflösen. [SEC 0000876661-25-001021](https://www.sec.gov/Archives/edgar/data/1439124/000087666125001021/xslF25X02/primary_doc.xml)  |
| ENFN (B) | Enfusion, Inc. | 2025-04-21 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001104659-25-036869](https://www.sec.gov/Archives/edgar/data/1868912/000110465925036869/tm2512751d1_8k.htm)  |
| ETWO (ZB) | E2open Parent Holdings, Inc. | 2025-08-04 | Vollzug 03.08.2025; Handelsstopp vor Eröffnung 04.08. PR 04.08. ist als erster inaktiver Handelstag plausibel, nicht als Vollzugsdatum. [SEC 0001193125-25-172643](https://www.sec.gov/Archives/edgar/data/1800347/000119312525172643/d936154d8k.htm)  |
| EVGR (Z) | Evergreen Corp | 2025-06-30 | Form 25 bestätigt alten Listing-Rückzug; Class A Ordinary Shares, Warrants, Units. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-25-000551](https://www.sec.gov/Archives/edgar/data/1900402/000135445725000551/xslF25X02/primary_doc.xml)  |
| FITBI (B) | FIFTH THIRD BANCORP | 2026-06-21 | Börsenwechsel: Nasdaq endet 11.06.2026, NYSE beginnt 12.06.2026, Series I als FITB PRI (SEC aktuell FITB-PI). PR 21.06. ist nur formaler Nasdaq-Austrag. Kein Ende der Handelbarkeit. [SEC 0001193125-26-267509](https://www.sec.gov/Archives/edgar/data/35527/000119312526267509/d132955d25.htm) [SEC 0001193125-26-255417](https://www.sec.gov/Archives/edgar/data/35527/000119312526255417/d157060d8k.htm) |
| FNA (B) | Paragon 28, Inc. | 2025-04-21 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0000950157-25-000330](https://www.sec.gov/Archives/edgar/data/1531978/000095015725000330/0000950157-25-000330.txt)  |
| FOSLL (B) | Fossil Group, Inc. | 2025-11-23 | Form 25 betrifft 7%-Senior-Notes 2026; FOSL weiterhin SEC-Ticker. Wertpapierklasse korrigieren. [SEC 0001354457-25-001126](https://www.sec.gov/Archives/edgar/data/883569/000135445725001126/xslF25X02/primary_doc.xml)  |
| FRGE (B) | Forge Global Holdings, Inc. | 2026-03-02 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001827821-26-000010](https://www.sec.gov/Archives/edgar/data/1827821/000182782126000010/0001827821-26-000010.txt)  |
| FTRK (Z) | Fast Track Group | 2026-10-19 | 6-K nennt Nasdaq-Suspension seit 18.08.2026 und OTC-Quote FTRKD, vorher FTRKF. SEC aktuell FTRKF. 19.10. ist formales Delisting, nicht Ende jeglichen Handels. [SEC 0001354457-26-000974](https://www.sec.gov/Archives/edgar/data/2027262/000135445726000974/xslF25X02/primary_doc.xml) [SEC 0001493152-26-043941](https://www.sec.gov/Archives/edgar/data/2027262/000149315226043941/form6-k.htm) |
| GAINL (ZB) | GLADSTONE INVESTMENT CORPORATION\DE | 2025-12-25 | Beleg betrifft 8%-Notes 2028; Rückzahlung für 16.12.2025 angekündigt, nicht 25.12. Stammaktie GAIN bleibt in SEC-Tickern. [SEC 0001354457-25-001271](https://www.sec.gov/Archives/edgar/data/1321741/000135445725001271/xslF25X02/primary_doc.xml) [SEC 0001193125-25-281793](https://www.sec.gov/Archives/edgar/data/1321741/000119312525281793/d63612d8k.htm) |
| GLADZ (ZB) | GLADSTONE CAPITAL CORP | 2025-10-24 | Beleg betrifft 7,75%-Notes 2028; Rückzahlung für 15.10.2025 angekündigt, nicht 24.10. Stammaktie GLAD bleibt in SEC-Tickern. [SEC 0001354457-25-001020](https://www.sec.gov/Archives/edgar/data/1143513/000135445725001020/xslF25X02/primary_doc.xml) [SEC 0001193125-25-203558](https://www.sec.gov/Archives/edgar/data/1143513/000119312525203558/d57484d8k.htm) |
| GLDD (B) | Great Lakes Dredge & Dock CORP | 2026-04-01 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001193125-26-136214](https://www.sec.gov/Archives/edgar/data/1372020/000119312526136214/d145321d8k.htm)  |
| HBI (ZB) | Hanesbrands Inc. | 2025-12-01 | Gildan-Übernahme 01.12.2025; alte HBI-Aktien in 0,102 Gildan-Aktien plus 0,80 USD umgewandelt; Suspendierung vor Eröffnung. Status für alte Zeile korrekt. [SEC 0001193125-25-303276](https://www.sec.gov/Archives/edgar/data/1359841/000119312525303276/d848051d8k.htm)  |
| HSII (ZB) | HEIDRICK & STRUGGLES INTERNATIONAL INC | 2025-12-10 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001193125-25-313582](https://www.sec.gov/Archives/edgar/data/1066605/000119312525313582/d832427d8k.htm)  |
| INFA (ZB) | Informatica Inc. | 2025-11-18 | Salesforce-Übernahme 18.11.2025; alte Class-A-Aktien in 25 USD umgewandelt, Suspendierung vor Eröffnung. Status für alte Zeile korrekt. [SEC 0001104659-25-113667](https://www.sec.gov/Archives/edgar/data/1868778/000110465925113667/tm2531245d7_8k.htm)  |
| ISPO (Z) | Inspirato Inc | 2026-02-04 | Vollzug und Delisting-Anforderung 03.02.2026; PR nimmt Einreichung 04.02. [SEC 0001820566-26-000018](https://www.sec.gov/Archives/edgar/data/1820566/000182056626000018/0001820566-26-000018.txt)  |
| JFB (Z) | JFB Construction Holdings | 2026-09-13 | Form 25 bestätigt alten Listing-Rückzug; Class A Common Stock. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-26-000855](https://www.sec.gov/Archives/edgar/data/2024306/000135445726000855/xslF25X02/primary_doc.xml)  |
| LPSN (B) | LIVEPERSON INC | 2026-09-04 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001193125-26-383671](https://www.sec.gov/Archives/edgar/data/1102993/000119312526383671/d112155d8k.htm)  |
| MCAA (Z) | Mountain & Co. I Acquisition Corp. | 2025-05-29 | Form 25 bestätigt alten Listing-Rückzug; Class A Ordinary Shares, Warrant, Unit. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-25-000429](https://www.sec.gov/Archives/edgar/data/1856995/000135445725000429/xslF25X02/primary_doc.xml)  |
| METCL (B) | Ramaco Resources, Inc. | 2025-08-11 | Form 25 betrifft 9%-Senior-Notes 2026; METC/METCB weiterhin SEC-Ticker. Kein Firmen-Delisting. [SEC 0001354457-25-000756](https://www.sec.gov/Archives/edgar/data/1687187/000135445725000756/xslF25X02/primary_doc.xml)  |
| MGIC (B) | MAGIC SOFTWARE ENTERPRISES LTD | 2026-03-06 | 6-K: Fusion mit Matrix am 24.02.2026 erwartet, Handelsstopp nach After-hours 23.02.; Form 25 wirksam 06.03. Aktuelle SEC-Metadaten RMTHF; Folgeidentität gesondert prüfen. [SEC 0001354457-26-000210](https://www.sec.gov/Archives/edgar/data/876779/000135445726000210/xslF25X02/primary_doc.xml) [SEC 0000876779-26-000003](https://www.sec.gov/Archives/edgar/data/876779/000087677926000003/ea0278176-6k_magic.htm) |
| MURA (Z) | Mural Oncology plc | 2025-12-05 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001193125-25-308710](https://www.sec.gov/Archives/edgar/data/1971543/000119312525308710/d64366d8k.htm)  |
| MYNA (B) | Mynaric AG | 2025-07-03 | Form 25 bestätigt alten Listing-Rückzug; American Depository Shares. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-25-000561](https://www.sec.gov/Archives/edgar/data/1850453/000135445725000561/xslF25X02/primary_doc.xml)  |
| NKLA (B) | Nikola Corp | 2025-04-13 | Form 25 bestätigt alten Listing-Rückzug; 0001 par value per share. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001731289-25-000026](https://www.sec.gov/Archives/edgar/data/1731289/000173128925000026/form25.htm)  |
| ODP (B) | ODP Corp | 2025-12-10 | Übernahme 10.12.2025; ODP wird Tochtergesellschaft, Nasdaq-Suspendierung vor Eröffnung. Alte Zeile darf inaktiv werden. [SEC 0001193125-25-314368](https://www.sec.gov/Archives/edgar/data/800240/000119312525314368/d76250d8k.htm)  |
| PET (Z) | Wag! Group Co. | 2025-09-28 | Form 25 bestätigt alten Listing-Rückzug; Common Stock, Warrants. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-25-000920](https://www.sec.gov/Archives/edgar/data/1842356/000135445725000920/xslF25X02/primary_doc.xml)  |
| PLYA (B) | Playa Hotels & Resorts N.V. | 2025-06-17 | Übernahme/Tender Closing 11.06.2025; Nasdaq-Handelsstopp und Form 25 am 16.06.; PR nimmt 17.06. Formales Delisting davon getrennt. [SEC 0001104659-25-060328](https://www.sec.gov/Archives/edgar/data/1692412/000110465925060328/0001104659-25-060328.txt)  |
| PRLH (Z) | Pearl Holdings Acquisition Corp | 2025-06-01 | Form 25 bestätigt alten Listing-Rückzug; Class A Ordinary Shares, Warrants, Units. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-25-000444](https://www.sec.gov/Archives/edgar/data/1856161/000135445725000444/xslF25X02/primary_doc.xml)  |
| QRTEA (B) | Old QVC Group, Inc. | 2026-06-18 | Alter Ticker war bereits zu QVCGA gewechselt; spätere 8-K führen QVCAQ auf OTCID. Form 25 betrifft Nasdaq-Series A, nicht Ende aller Handelbarkeit. [SEC 0001354457-26-000540](https://www.sec.gov/Archives/edgar/data/1355096/000135445726000540/xslF25X02/primary_doc.xml) [SEC 0001355096-26-000015](https://www.sec.gov/Archives/edgar/data/1355096/000135509626000015/qvcga-20260417.htm) [SEC 0001104659-26-075187](https://www.sec.gov/Archives/edgar/data/1355096/000110465926075187/tm2618149d1_8k.htm) |
| QRTEB (B) | Old QVC Group, Inc. | 2026-06-18 | Falsche Klasse: Form 25 nennt Series A Common Stock und 8%-Preferred, nicht Series B. Andere 8-K nennen Series B als QVCGB auf OTC und später QVCGQ. QRTEB nicht aus diesem Form 25 deaktivieren. [SEC 0001354457-26-000540](https://www.sec.gov/Archives/edgar/data/1355096/000135445726000540/xslF25X02/primary_doc.xml) [SEC 0001355096-26-000015](https://www.sec.gov/Archives/edgar/data/1355096/000135509626000015/qvcga-20260417.htm) [SEC 0001104659-26-075187](https://www.sec.gov/Archives/edgar/data/1355096/000110465926075187/tm2618149d1_8k.htm) |
| REE (B) | REE Automotive Ltd. | 2026-07-23 | Form 25 bestätigt alten Listing-Rückzug; Class A Ordinary Shares. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-26-000675](https://www.sec.gov/Archives/edgar/data/1843588/000135445726000675/xslF25X02/primary_doc.xml)  |
| REVG (B) | REV Group, Inc. | 2026-02-12 | Form 25 bestätigt alten Listing-Rückzug; Common Stock. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0000876661-26-000076](https://www.sec.gov/Archives/edgar/data/1687221/000087666126000076/xslF25X02/primary_doc.xml)  |
| RILYK (B) | BRC Group Holdings, Inc. | 2026-04-09 | Form 25 betrifft 5,50%-Senior-Notes 2026; RILY und weitere Serien weiterhin SEC-Ticker. [SEC 0001354457-26-000307](https://www.sec.gov/Archives/edgar/data/1464790/000135445726000307/xslF25X02/primary_doc.xml)  |
| RVNC (B) | Revance Therapeutics, Inc. | 2025-02-06 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001193125-25-021403](https://www.sec.gov/Archives/edgar/data/1479290/000119312525021403/0001193125-25-021403.txt)  |
| RWAYZ (B) | Runway Growth Finance Corp. | 2026-03-14 | Form 25 betrifft 8%-Notes 2027; RWAY weiterhin SEC-Ticker. Keine Stammaktien-Deaktivierung ableiten. [SEC 0001354457-26-000229](https://www.sec.gov/Archives/edgar/data/1653384/000135445726000229/xslF25X02/primary_doc.xml)  |
| RZB (B) | REINSURANCE GROUP OF AMERICA INC | 2026-06-25 | Form 25 betrifft 5,75%-Subordinated Debentures 2056; RGA/RZC weiterhin SEC-Ticker. [SEC 0000876661-26-000529](https://www.sec.gov/Archives/edgar/data/898174/000087666126000529/xslF25X02/primary_doc.xml)  |
| SASR (B) | SANDY SPRING BANCORP INC | 2025-04-01 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001104659-25-030581](https://www.sec.gov/Archives/edgar/data/824410/000110465925030581/tm2510685d3_8k.htm)  |
| SDM (Z) | Smart Digital Group Ltd | 2026-07-23 | Form 25 bestätigt alten Listing-Rückzug; Ordinary Shares. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0001354457-26-000676](https://www.sec.gov/Archives/edgar/data/2014955/000135445726000676/xslF25X02/primary_doc.xml)  |
| SHLT (B) | SHL TELEMEDICINE LTD | 2025-03-31 | Nasdaq-ADS-Rückzug formal 31.03.2025; kein Beweis, dass alle SHL-Wertpapiere nicht mehr handelbar sind. Lokale Tagesreihe bewegt sich noch am 01./02.04.: Datums-/Quellenkonflikt. [SEC 0001178913-25-000961](https://www.sec.gov/Archives/edgar/data/1166834/000117891325000961/zk2532880.htm)  |
| SLP (ZB) | Simulations Plus, Inc. | 2026-10-06 | Übernahme durch Altaris-Gesellschaften am 06.10.2026; Item 3.01 nennt kein Listing mehr ab diesem Datum. Alte Zeile inaktiv plausibel. [SEC 0001023459-26-000092](https://www.sec.gov/Archives/edgar/data/1023459/000102345926000092/0001023459-26-000092.txt)  |
| SLRN (B) | ACELYRIN, Inc. | 2025-05-21 | Alumis-Fusion 21.05.2025; Nasdaq-Suspendierung vor Eröffnung, alte Aktien umgewandelt. Kein bloßer Symbolwechsel. [SEC 0001193125-25-123707](https://www.sec.gov/Archives/edgar/data/1962918/000119312525123707/d13977d8k.htm)  |
| SNBR (ZB) | Sleep Number Corp | 2026-07-24 | Form 25 beendet Nasdaq-Common-Stock-Notierung; SEC aktuell SNBRQ. OTC-/Insolvenzfortführung nicht als unveränderte Nasdaq-Zeile behandeln, aber Firma nicht pauschal unhandelbar nennen. [SEC 0001354457-26-000682](https://www.sec.gov/Archives/edgar/data/827187/000135445726000682/xslF25X02/primary_doc.xml)  |
| SNCR (ZB) | SYNCHRONOSS TECHNOLOGIES INC | 2026-02-13 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001628280-26-008072](https://www.sec.gov/Archives/edgar/data/1131554/000162828026008072/0001628280-26-008072.txt)  |
| SNCRL (ZB) | SYNCHRONOSS TECHNOLOGIES INC | 2025-05-19 | Form 25 betrifft 8,375%-Senior-Notes 2026; nicht SNCR-Common-Stock. Dessen spätere Fusion separat belegt. [SEC 0001354457-25-000399](https://www.sec.gov/Archives/edgar/data/1131554/000135445725000399/xslF25X02/primary_doc.xml)  |
| STRM (B) | STREAMLINE HEALTH SOLUTIONS INC. | 2025-08-13 | Vollzug und Handelsstopp vor Eröffnung 12.08.2025; PR nimmt Einreichung 13.08. [SEC 0001437749-25-026379](https://www.sec.gov/Archives/edgar/data/1008586/000143774925026379/strm20250812_8k.htm)  |
| TBHC (ZB) | BRAND HOUSE COLLECTIVE, INC. | 2026-04-02 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001437749-26-011128](https://www.sec.gov/Archives/edgar/data/1056285/000143774926011128/0001437749-26-011128.txt)  |
| TBNK (Z) | Territorial Bancorp Inc. | 2025-04-02 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001193125-25-071362](https://www.sec.gov/Archives/edgar/data/1447051/000119312525071362/d932149d8k.htm)  |
| TBPH (B) | Theravance Biopharma, Inc. | 2026-09-23 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001104659-26-109979](https://www.sec.gov/Archives/edgar/data/1583107/000110465926109979/0001104659-26-109979.txt)  |
| THR (B) | Thermon Group Holdings, Inc. | 2026-06-01 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001104659-26-068666](https://www.sec.gov/Archives/edgar/data/1489096/000110465926068666/0001104659-26-068666.txt)  |
| TRINL (B) | Trinity Capital Inc. | 2026-08-03 | Beleg passt nicht: Form 25 umfasst Common Stock und 7,875%-Notes März/September 2029. TRINL wird darin nicht identifiziert. Datum 03.08.2026 für TRINL nicht belegt; ausnehmen bis klassenbezogener Beleg vorliegt. [SEC 0001213900-26-081363](https://www.sec.gov/Archives/edgar/data/1786108/000121390026081363/ea0299064-01_25.htm)  |
| TRML (B) | Tourmaline Bio, Inc. | 2025-10-28 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001104659-25-102971](https://www.sec.gov/Archives/edgar/data/1827506/000110465925102971/tm2529486d1_8k.htm)  |
| UBFO (Z) | UNITED SECURITY BANCSHARES | 2026-04-01 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001628280-26-022619](https://www.sec.gov/Archives/edgar/data/1137547/000162828026022619/ubfo-20260401.htm)  |
| VBTX (B) | Veritex Holdings, Inc. | 2025-10-20 | Fusions-/Übernahmevollzug und Rückzug der alten Aktie in Item 2.01/3.01 bestätigt. Kein bloßer unveränderter Weiterhandel unter altem Listing belegt; formales Delisting separat vom Vollzug zu führen. [SEC 0001104659-25-100622](https://www.sec.gov/Archives/edgar/data/1501570/000110465925100622/tm2529027d1_8k.htm)  |
| VSTA (ZB) | Vasta Platform Ltd | 2026-01-30 | Form 25 bestätigt alten Listing-Rückzug; 00005 per share. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0000950103-26-000644](https://www.sec.gov/Archives/edgar/data/1792829/000095010326000644/dp240098_25.htm)  |
| ZEUS (B) | OLYMPIC STEEL INC | 2026-02-13 | Ryerson-Fusion 13.02.2026; Handelsstopp erst nach Börsenschluss desselben Tages. Datum braucht Tageszeitsemantik; am 13.02. noch Handel möglich. [SEC 0001193125-26-051373](https://www.sec.gov/Archives/edgar/data/917470/000119312526051373/0001193125-26-051373.txt)  |
| ZIMV (ZB) | ZimVie Inc. | 2025-10-20 | Fusion 20.10.2025. Text nennt formales Delisting ausdrücklich 30.10.2025; PR 20.10. nur als Handels-/Fusionsstatus, nicht formales Delisting, vertretbar. [SEC 0001193125-25-243136](https://www.sec.gov/Archives/edgar/data/1876588/000119312525243136/0001193125-25-243136.txt)  |
| ZK (ZB) | ZEEKR Intelligent Technology Holding Ltd | 2026-01-01 | Form 25 bestätigt alten Listing-Rückzug; Klasse im Original. Datum = filingDate + 10; tatsächliches Handelsende/weitere Handelbarkeit nicht abschließend belegt. [SEC 0000876661-25-001004](https://www.sec.gov/Archives/edgar/data/1954042/000087666125001004/xslF25X02/primary_doc.xml)  |

## Volltabelle Kursabgleich (132)

Letzter Schluss = vorhandener Datenpunkt, nicht verifizierter Börsentrade. Änderungen zählen aufeinanderfolgende unterschiedliche Tages-Schlusswerte mit Datum **nach** effectiveDate. Der erste Tag eines konstanten Endlaufs kann noch der echte letzte Handelstag sein. Alle 132: Intraday-Datei 09.11.2026 fehlt.

| Ticker | PR effectiveDate | letzter Tagespunkt | Schluss USD | konstant seit | gleiche Endpunkte | Änderungen danach |
|---|---|---|---:|---|---:|---:|
| AACB | 2026-08-29 | 2026-11-06 | 10.59 | 2026-08-19 | 57 | 0 |
| AACT | 2025-09-30 | 2026-11-06 | 9.49 | 2025-09-24 | 189 | 0 |
| ACHL | 2025-03-21 | 2026-11-06 | 1.48 | 2025-03-20 | 190 | 0 |
| ACVA | 2026-10-19 | 2026-11-06 | 10.5 | 2026-10-14 | 18 | 0 |
| ADVM | 2025-12-09 | 2026-11-06 | 4.36 | 2025-12-08 | 190 | 0 |
| AFAR | 2025-03-15 | 2026-11-06 | 11.68 | 2024-11-07 | 270 | 0 |
| AFBI | 2026-08-17 | 2026-11-06 | 23 | 2026-07-30 | 71 | 0 |
| AITR | 2025-07-24 | 2026-11-06 | 11 | 2025-04-15 | 196 | 0 |
| ALE | 2025-12-15 | 2026-11-06 | 67.9 | 2025-12-12 | 188 | 0 |
| ALOT | 2026-08-26 | 2026-11-06 | 28.99 | 2026-08-25 | 53 | 0 |
| ANSC | 2026-08-22 | 2026-11-06 | 11.46 | 2026-08-11 | 63 | 0 |
| ANSS | 2025-07-17 | 2026-11-06 | 374.3 | 2025-07-16 | 189 | 0 |
| APAD | 2026-05-08 | 2026-11-06 | 8.03 | 2026-05-07 | 128 | 0 |
| APLT | 2026-02-03 | 2026-11-06 | 0.103 | 2026-02-02 | 190 | 0 |
| ARBKL | 2025-12-22 | 2026-11-06 | 5.3 | 2025-12-12 | 187 | 0 |
| ATCOL | 2025-07-13 | 2026-11-06 | 25.32 | 2025-07-02 | 189 | 0 |
| ATMC | 2026-01-25 | 2026-11-06 | 15.6 | 2025-12-08 | 217 | 0 |
| AVGR | 2025-07-03 | 2026-11-06 | 0.474 | 2025-03-04 | 270 | 0 |
| AVNS | 2026-07-30 | 2026-11-06 | 24.99 | 2026-07-24 | 75 | 0 |
| BBCQ | 2026-08-27 | 2026-11-06 | 9.79 | 2026-08-27 | 51 | 0 |
| BGFV | 2025-10-02 | 2026-11-06 | 1.44 | 2025-09-30 | 189 | 0 |
| BHAT | 2026-07-24 | 2026-11-06 | 0.675 | 2026-03-13 | 165 | 0 |
| BLFS | 2026-10-06 | 2026-11-06 | 38.61 | 2026-10-05 | 25 | 0 |
| BLFY | 2026-04-01 | 2026-11-06 | 13.24 | 2026-03-31 | 154 | 0 |
| BOWN | 2026-07-23 | 2026-11-06 | 9.19 | 2025-10-09 | 270 | 0 |
| BSII | 2025-06-05 | 2026-11-06 | 9.99 | 2025-06-04 | 188 | 0 |
| BWNB | 2026-08-23 | 2026-11-06 | 25.16 | 2026-08-12 | 62 | 0 |
| CASI | 2026-07-03 | 2026-11-06 | 0.2075 | 2026-02-25 | 176 | 0 |
| CCCX | 2026-02-23 | 2026-11-06 | 13.66 | 2026-02-13 | 183 | 0 |
| CCIX | 2026-08-06 | 2026-11-06 | 10.88 | 2026-07-24 | 75 | 0 |
| CFB | 2025-03-03 | 2026-11-06 | 15.99 | 2025-02-28 | 188 | 0 |
| CFFS | 2025-06-01 | 2026-11-06 | 11.28 | 2025-01-29 | 270 | 0 |
| CGBDL | 2025-12-08 | 2026-11-06 | 25.48 | 2025-11-24 | 190 | 0 |
| CMRX | 2025-04-21 | 2026-11-06 | 8.54 | 2025-04-17 | 188 | 0 |
| COLA | 2026-10-07 | 2026-11-06 | 2.86 | 2026-10-01 | 27 | 0 |
| CREV | 2026-06-14 | 2026-11-06 | 0.4021 | 2026-02-06 | 185 | 0 |
| CSCI | 2025-09-05 | 2026-11-06 | 2.72 | 2025-09-03 | 189 | 0 |
| CVAC | 2026-01-16 | 2026-11-06 | 4.66 | 2026-01-05 | 188 | 0 |
| DYCQ | 2026-01-25 | 2026-11-06 | 11.18 | 2025-11-19 | 228 | 0 |
| EBR-B | 2026-01-08 | keine Datei | – | – | – | – |
| EBTC | 2025-07-01 | 2026-11-06 | 39.64 | 2025-06-30 | 188 | 0 |
| EMPG | 2026-10-16 | 2026-11-06 | 17.36 | 2025-10-13 | 270 | 0 |
| ENFN | 2025-04-21 | 2026-11-06 | 10.76 | 2025-04-17 | 187 | 0 |
| EPWK | 2026-06-12 | 2026-11-06 | 0.7535 | 2025-12-22 | 189 | 0 |
| ESHA | 2026-05-10 | 2026-11-06 | 11.57 | 2026-04-30 | 133 | 0 |
| ETWO | 2025-08-04 | 2026-11-06 | 3.3 | 2025-07-31 | 188 | 0 |
| EVGR | 2025-06-30 | 2026-11-06 | 11.95 | 2025-02-12 | 188 | 0 |
| FITBI | 2026-06-21 | 2026-11-06 | 25.69 | 2026-06-12 | 103 | 0 |
| FLIC | 2025-06-02 | 2026-11-06 | 11.87 | 2025-05-30 | 188 | 0 |
| FNA | 2025-04-21 | 2026-11-06 | 13.09 | 2025-04-16 | 189 | 0 |
| FOSLL | 2025-11-23 | 2026-11-06 | 17.01 | 2025-11-13 | 194 | 0 |
| FRGE | 2026-03-02 | 2026-11-06 | 45 | 2026-02-27 | 173 | 0 |
| FTRK | 2026-10-19 | 2026-11-06 | 0.16 | 2026-08-17 | 59 | 0 |
| GAINL | 2025-12-25 | 2026-11-06 | 25.22 | 2025-12-15 | 187 | 0 |
| GHLD | 2025-11-28 | 2026-11-06 | 20.01 | 2025-11-26 | 195 | 0 |
| GIFI | 2026-01-16 | 2026-11-06 | 12 | 2026-01-14 | 189 | 0 |
| GLADZ | 2025-10-24 | 2026-11-06 | 25.23 | 2025-10-09 | 191 | 0 |
| GLDD | 2026-04-01 | 2026-11-06 | 17 | 2026-03-31 | 154 | 0 |
| GORV | 2025-11-28 | 2026-11-06 | 0.4211 | 2025-11-26 | 116 | 0 |
| HBI | 2025-12-01 | 2026-11-06 | 6.47 | 2025-11-28 | 189 | 0 |
| HNNAZ | 2026-07-09 | 2026-11-06 | 24.9 | 2026-06-29 | 93 | 0 |
| HONE | 2025-11-07 | 2026-11-06 | 12.1 | 2025-10-31 | 198 | 0 |
| HSII | 2025-12-10 | 2026-11-06 | 59.01 | 2025-12-09 | 188 | 0 |
| HTBK | 2026-04-21 | 2026-11-06 | 13.45 | 2026-04-17 | 142 | 0 |
| HYZN | 2025-03-13 | 2026-11-06 | 0.6399 | 2025-01-30 | 241 | 0 |
| ICCH | 2025-03-17 | 2026-11-06 | 23.49 | 2025-03-07 | 192 | 0 |
| INFA | 2025-11-18 | 2026-11-06 | 24.79 | 2025-11-14 | 116 | 0 |
| IPEX | 2026-09-28 | 2026-11-06 | 3.16 | 2026-09-25 | 29 | 0 |
| ISPO | 2026-02-04 | 2026-11-06 | 4.26 | 2026-02-02 | 188 | 0 |
| JFB | 2026-09-13 | 2026-11-06 | 4.95 | 2026-09-03 | 46 | 0 |
| LPSN | 2026-09-04 | 2026-11-06 | 3.1 | 2026-09-02 | 47 | 0 |
| MAYA | 2026-09-28 | 2026-11-06 | 10.32 | 2026-05-28 | 114 | 0 |
| MCAA | 2025-05-29 | 2026-11-06 | 11.39 | 2025-01-24 | 270 | 0 |
| METCL | 2025-08-11 | 2026-11-06 | 25.26 | 2025-08-01 | 188 | 0 |
| MGIC | 2026-03-06 | 2026-11-06 | 17.38 | 2026-02-23 | 180 | 0 |
| MODV | 2025-10-11 | 2026-11-06 | 0.4319 | 2025-08-27 | 189 | 0 |
| MOFG | 2026-02-20 | 2026-11-06 | 49.31 | 2026-02-13 | 181 | 0 |
| MURA | 2025-12-05 | 2026-11-06 | 2.04 | 2025-12-03 | 189 | 0 |
| MYNA | 2025-07-03 | 2026-11-06 | 0.2628 | 2025-02-14 | 191 | 0 |
| NKLA | 2025-04-13 | 2026-11-06 | 0.183 | 2025-02-25 | 187 | 0 |
| NPAB | 2025-03-31 | 2026-11-06 | 10.9 | 2024-11-20 | 270 | 0 |
| NURO | 2025-05-02 | 2026-11-06 | 4.58 | 2025-05-01 | 187 | 0 |
| OAKU | 2026-05-25 | 2026-11-06 | 12.2 | 2026-03-23 | 160 | 0 |
| ODP | 2025-12-10 | 2026-11-06 | 28 | 2025-12-09 | 189 | 0 |
| OMGA | 2025-03-30 | 2026-11-06 | 0.1426 | 2025-02-24 | 189 | 0 |
| ONCT | 2025-03-27 | 2026-11-06 | 0.5266 | 2024-12-27 | 270 | 0 |
| ORGN | 2026-07-02 | 2026-11-06 | 0.9501 | 2026-07-01 | 91 | 0 |
| OXSQZ | 2025-09-28 | 2026-11-06 | 25.2 | 2025-09-16 | 189 | 0 |
| PET | 2025-09-28 | 2026-11-06 | 0.0469 | 2025-07-29 | 115 | 0 |
| PLYA | 2025-06-17 | 2026-11-06 | 13.48 | 2025-06-13 | 197 | 0 |
| PRLH | 2025-06-01 | 2026-11-06 | 11.32 | 2025-01-29 | 270 | 0 |
| PTNM | 2026-10-11 | 2026-11-06 | 10.39 | 2025-10-13 | 270 | 0 |
| PVBC | 2025-11-17 | 2026-11-06 | 13.5 | 2025-11-14 | 187 | 0 |
| QRTEA | 2026-06-18 | 2026-11-06 | 0.3588 | 2026-02-06 | 186 | 0 |
| QRTEB | 2026-06-18 | 2026-11-06 | 2 | 2026-02-06 | 186 | 0 |
| REE | 2026-07-23 | 2026-11-06 | 0.0769 | 2026-07-15 | 82 | 0 |
| REVG | 2026-02-12 | 2026-11-06 | 63.9 | 2026-01-30 | 187 | 0 |
| RILYK | 2026-04-09 | 2026-11-06 | 25.23 | 2026-03-27 | 156 | 0 |
| RVNC | 2025-02-06 | 2026-11-06 | 3.65 | 2025-02-05 | 188 | 0 |
| RWAYZ | 2026-03-14 | 2026-11-06 | 24.99 | 2026-03-04 | 171 | 0 |
| RZB | 2026-06-25 | 2026-11-06 | 25.34 | 2026-06-12 | 102 | 0 |
| SASR | 2025-04-01 | 2026-11-06 | 27.95 | 2025-03-31 | 187 | 0 |
| SAT | 2026-09-28 | 2026-09-29 | 25.06 | 2026-09-14 | 12 | 0 |
| SBT | 2025-04-01 | 2026-11-06 | 4.84 | 2025-03-31 | 199 | 0 |
| SCCC | 2025-10-10 | 2026-11-06 | 24.99 | 2025-09-29 | 187 | 0 |
| SDM | 2026-07-23 | 2026-11-06 | 1.85 | 2025-10-13 | 270 | 0 |
| SELX | 2026-10-18 | 2026-11-06 | 0.34 | 2026-06-05 | 108 | 0 |
| SHLT | 2025-03-31 | 2026-11-06 | 2.05 | 2025-04-02 | 197 | 2 |
| SLP | 2026-10-06 | 2026-11-06 | 18.5 | 2026-10-02 | 26 | 0 |
| SLRN | 2025-05-21 | 2026-11-06 | 2.27 | 2025-05-20 | 187 | 0 |
| SNBR | 2026-07-24 | 2026-11-06 | 0.125 | 2026-06-22 | 98 | 0 |
| SNCR | 2026-02-13 | 2026-11-06 | 9 | 2026-02-12 | 182 | 0 |
| SNCRL | 2025-05-19 | 2026-11-06 | 25.14 | 2025-05-09 | 187 | 0 |
| STRM | 2025-08-13 | 2026-11-06 | 5.33 | 2025-08-11 | 188 | 0 |
| SVAC | 2026-07-20 | 2026-11-06 | 9.12 | 2026-07-10 | 85 | 0 |
| TBHC | 2026-04-02 | 2026-11-06 | 0.9399 | 2026-04-01 | 153 | 0 |
| TBMC | 2026-04-06 | 2026-11-06 | 7.33 | 2026-03-26 | 157 | 0 |
| TBNK | 2025-04-02 | 2026-11-06 | 8.33 | 2025-04-01 | 190 | 0 |
| TBPH | 2026-09-23 | 2026-11-06 | 17.03 | 2026-09-22 | 34 | 0 |
| TFFP | 2025-03-16 | 2026-11-06 | 0.065 | 2024-12-12 | 267 | 0 |
| THR | 2026-06-01 | 2026-11-06 | 61.14 | 2026-05-29 | 112 | 0 |
| TIRX | 2026-07-06 | 2026-11-06 | 0.0303 | 2026-03-04 | 171 | 0 |
| TRINL | 2026-08-03 | 2026-11-06 | 25.07 | 2026-02-06 | 186 | 0 |
| TRML | 2025-10-28 | 2026-11-06 | 47.98 | 2025-10-24 | 189 | 0 |
| UBFO | 2026-04-01 | 2026-11-06 | 10.51 | 2026-03-31 | 154 | 0 |
| VBTX | 2025-10-20 | 2026-11-06 | 30.26 | 2025-10-17 | 188 | 0 |
| VCIC | 2026-04-10 | 2026-11-06 | 11 | 2026-03-31 | 153 | 0 |
| VSTA | 2026-01-30 | 2026-11-06 | 4.9 | 2026-01-28 | 193 | 0 |
| XTKG | 2026-07-24 | 2026-11-06 | 0.5936 | 2026-04-01 | 150 | 0 |
| ZEUS | 2026-02-13 | 2026-11-06 | 47.86 | 2026-02-12 | 183 | 0 |
| ZIMV | 2025-10-20 | 2026-11-06 | 18.99 | 2025-10-15 | 190 | 0 |
| ZK | 2026-01-01 | 2026-11-06 | 26.73 | 2025-12-19 | 187 | 0 |

## Empfehlung und Grenzen

1. **Nachbessern, nicht unverändert mergen.** QRTEB und TRINL zunächst aus dieser Belegmenge ausnehmen; neuen klassenbezogenen Beleg verlangen. FITBI als Wechsel zur NYSE behandeln und Nachfolger erhalten. Alte Nasdaq-Zeile nur mit klarer Listing-Semantik beenden.
2. Alle 8-K-Ereignisdaten aus dem Dokument lesen; Einreichung nicht als universellen Wirksamkeitstag verwenden. `lastTradingDate`, `tradingSuspendedAt`, `mergerEffectiveDate`, `formalDelistingDate` und `evidenceKnownAt` getrennt führen. Für historische Anwendungen Informationsverfügbarkeit/Look-ahead beachten.
3. Die innerhalb der 132 noch nicht einzeln vertieft geprüften Fälle nicht aus einer Stichprobenquote pauschal freigeben. Vor Datenlauf klassen- und venuebezogene Zuordnung aller Registereinträge, insbesondere bei SPACs, Auslandsemittenten und Nebenklassen, prüfen. Keine Regel „SEC hat alten Ticker nicht mehr = gesamte Firma unhandelbar“.
4. Preisfortschreibung bei allen 130 bis 06.11. laufenden Tagesreihen bereinigen/kennzeichnen; SHLT separat klären. Danach Master und Produktuniversum in einem konsistenten Erzeugerlauf mit Vorher/Nachher-Vergleich prüfen. Historische Originaldaten bewahren.
5. G7 und Release-/Merge-Konflikte sind zusätzliche Betriebsfragen aus der PR-Beschreibung, kein Ersatz für die fachlichen Korrekturen; Gates nicht abschwächen.

Grenzen: kein Live-Broker-/OTC-Ausführungstest, keine kostenpflichtigen Börsenstammdaten, keine vollständige globale Handelsplatzsuche für sämtliche Firmen. SEC-Submissions sind Metadaten und teils veraltet (z. B. ACVA). Originalbelege sind zwar unabhängig gelesen, stammen aber bei der ersten Prüfung aus denselben Accessions wie das PR-Register; die zusätzliche Kontrolle besteht in Inhalt/Klasse/Datum und weiteren Meldungen, nicht in einer Behauptung unabhängiger Herkunft jedes Ereignisses. Einige ergänzende SEC-Abrufe wurden nach HTTP 429 nicht fortgesetzt; deren fehlender Inhalt wurde nicht als Bestätigung gewertet. Für SHLT wurde eine ausländische Fortführung nicht abschließend nachgewiesen. Ergebnisse gelten für den oben gepinnten Repository-Snapshot, nicht für später laufende Pipelines.

Die breite Firmenauswahl und alle Einzelzeilen oben machen offene Punkte sichtbar. Dieser Bericht ist eine ablehnende Prüfung des unveränderten PR, keine Freigabe sämtlicher übriger Registerzeilen.
