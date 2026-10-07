# Supertrader – Minervini Ground-Truth-Validierung

Status: Forschungsdiagnose. Keine Regeländerung, keine Optimierung, kein Live-Einfluss.
Phase 2B bleibt **CLOSED – MAXIMUM CURRENT FIDELITY**. Minervini 2.0.0 (live), der Freeze 1.1.0, Registry und Ledger bleiben unverändert.
Neue öffentliche Performance-Aussagen gibt es nicht.

Leitfrage: Erkennt die eingefrorene Engine `minervini-adaptation-1.1.0` die Setups, die Mark Minervini selbst dokumentiert hat, und zwar zum damaligen Zeitpunkt? Die Signalregeln sind identisch mit 1.0.0.

## Ergebnis auf einen Blick

| Frage | Antwort |
|---|---|
| Erkennt VU seine dokumentierten Setups? | **Überwiegend nicht.** MAIN-Recall **3 von 15 = 20 %** (MAIN_A eigener Einstieg: 2 von 13 = 15 %) |
| Entscheidungsbaum | **Fall B** (Recall < 40 %): Der Backtest der mechanischen Variante ist nicht geeignet, Minervinis Methode zu beurteilen |
| Größter Sperrgrund | **SEPA/Fundamentaldaten:** Sie blockieren 10 von 12 Fehlfällen; in 6 davon sind sie die einzige Sperre |
| Häufigste Einzelursache | **MR-SEPA-10** (Vorjahres-EPS nach GAAP ≤ 0 → kein Einstieg). Davon betroffen sind 7 von 15 seiner MAIN-Käufe: 4 direkt, 3 verdeckt durch einen Datenfehler |
| Datenfehler im SEC-Layer | `seriesWithFallback` wählt den EPS-Wert je Quartal nach Tag-Priorität statt nach frühester Einreichung. Bei einem Tag-Wechsel wird ein Quartal erst mit dem 10-K des Folgejahres sichtbar (`SEPA_STALE`). **Nicht repariert** |
| Trend Template / RS | Trend Template unauffällig (MR-TT-01..07 in 15/15 bestanden), RS in 1/15 zu niedrig (DECK, Perzentil 65) |
| VCP | VCP-Schicht an t\*: 9/15 (60 %). Alle Ablehnungen bis auf eine wegen Basislänge unter 15 Sitzungen |
| Timing, wenn erkannt | 2 × EXACT, 1 × −3 Handelstage (VU früher) |
| Pivot | NOT_MEASURABLE (kein dokumentierter Pivotpreis) |
| Ist die Engine zu permissiv? | **Nein, eher zu streng.** Zufallskontrollen: 1,3 % Signale (2/150), Fälle: 20 % |
| Precision / Falsch-Positiv-Rate | NOT_MEASURABLE: Der einzige Negativfall (UPST) ist wegen zu kurzer Historie nicht auswertbar |

Der Status von Phase 2B bleibt **CLOSED – MAXIMUM CURRENT FIDELITY**.
Die Befunde unten sind Kandidaten für eine dokumentierte Regel- bzw. Datenkorrektur und gelten als „neue Erkenntnis“ im Sinne der Wiederaufnahmekriterien. Umgesetzt wird nichts.


## 1. Quellen und Fallbasis

**Erlaubte Quellen**
- Ground Truth sind nur Minervinis eigene Angaben: Bücher (Tier 1), eigene Beiträge, Videos und Interviews (Tier 2/3).
- Sekundärquellen helfen nur beim Finden.
- Modellwissen ist ausgeschlossen.

**Was praktisch erreichbar war**
- **Bücher:** nicht lesbar. Die bekannten Buchbeispiele liegen zudem überwiegend vor 2008, also vor dem Datenfenster. Kein Buchfall.
- **Eigene X-Beiträge (@markminervini):** x.com ist aus dieser Umgebung nicht abrufbar.
  - Verwendet wurde nur der Ausschnitt- und Titeltext aus einer domain-gefilterten Websuche.
  - Das Datum stammt aus der Status-ID (Snowflake). Die Beitragszeit in ET ist geprüft: Alle MAIN-Beiträge liegen in der Handelszeit, außer RVNC (09:02 ET, vorbörslich; der Anker ist dort der Vortag).
  - Quellenstärke daher höchstens **MEDIUM**.
  - Ticker, die nur in der Zusammenfassung der Suchmaschine standen, gelten als **LOW** und werden nicht ausgewertet. Betroffen: CRWD, BNTX, VAPO, TIPT, BYND, ANF, SPOT, ETSY.
- **Preise:** In keinem Ausschnitt stehen Pivot, Einstiegskurs oder Stop. Der Pivot-Vergleich ist daher **NOT_MEASURABLE**. Gemessen wird nur das Timing.
- **Suchrunden:** sechs, mit rund 130 Abfragen (protokolliert in `sourcing.searchRounds`). Gesichtete Beiträge ohne Fall stehen in `sourcing.hitsWithoutCase`.

**Fallliste** (`scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-CASES.json`, 104 Einträge, eingefroren)

| Gruppe | Fälle | Rolle |
|---|---:|---|
| MAIN | 16 | Recall. MAIN_A: 14 Fälle mit eigenem Einstieg. MAIN_B: 2 Fälle, Setup bejaht, kein eigener Kauf (AMD 22.07.2020, REPL) |
| SENSITIVITY | 15 | Anker erschlossen oder aus rückblickenden, ergebnisabhängigen Beiträgen (GDDY, MU), Focus-List ohne Tag je Titel (AXON, APP, LMB, NMM, DVA), Fenster aus Dauerangaben (GTHX, NLOK, sechs Titel vom 11.12.2025) |
| WATCHLIST | 6 | Kaufkandidaten vom 22.10.2019 sowie PENN (Position vor dem Ausbruch). Maß: Setup am Vortagsschluss, **kein Recall** |
| ENTRY_TYPE_NOT_MODELLED | 1 | DXCM, Pullback-Kauf. Die Engine modelliert das bewusst nicht |
| NEGATIVE | 1 | UPST am 15.10.2021, „extended, nicht kaufen“. Einzelbeobachtung |
| NICHT AUSGEWERTET | 65 | Einstieg unbekannt (u. a. Verlusttrades QCOM, SWIR), nur illustrativ, LOW, ETF/Short/kein Wertpapier, vor 2008 (Buchfälle), DKL-Aufstockung (Doppelzählung), RBLX (Historie zu kurz, vorab bekannt) |

**Ziel nicht erreicht:** Verlangt waren mindestens 30 Fälle, ideal 50. Belegbare Fälle mit Tag gibt es nur **16**. Die Lücke wird nicht mit schwächeren Fällen gefüllt.

**Sicherheitsidentität je Fall**
- Zuordnung über das damalige Listing: Ticker plus Datum, mit einer Aliasliste (NLOK→GEN, VEC→VVX).
- Erwartete CIK aus SEC-Daten, abgeglichen mit dem SEC-Datenlayer. Bei Abweichung `SECURITY_MAPPING_CIK_MISMATCH`.
- Gibt es mehrere passende Listings, gilt der Fall als mehrdeutig.
- Splits vor und nach dem Anker werden mitgeführt.
- Bekannte Fallen:
  - `RNA` gehört heute einem anderen Emittenten (CIK 2093101). 2024 war es Avidity Biosciences (CIK 1599901).
  - MTLS, AEM, NMM, INMD, TSM, ONON und SWIR sind Auslandsemittenten (20-F/40-F) ohne 10-Q. Laut SEC-Submissions-API geprüft.
  - DKL und NMM sind Personengesellschaften.

## 2. Methode (vorregistriert)

**Reihenfolge und Dokumente**
- Reihenfolge: Präregistrierung → Fallsammlung → Opus-Red-Team → Nachtrag A1 → Freeze → genau ein Replay je Fenster.
- `MINERVINI-GROUND-TRUTH-PREREG.json` wurde vor der Fallliste committed.
- `MINERVINI-GROUND-TRUTH-PREREG-A1.json` entstand nach der Fallsammlung und vor jedem Replay. Es setzt die Red-Team-Befunde um.
- `MINERVINI-GROUND-TRUTH-FREEZE.json` enthält die Hashes der Fallliste, der Präregistrierung und des Replay- und Auswertungscodes sowie den Engine-Freeze 1.1.0.

**Anker und Erkennung**
- **Anker D:** der im Beitrag genannte Tag („heute“, „gestern“, Datum, Wochentag).
- **Bewerteter Schluss t\*:** der Handelstag vor D.
- **Fenster-Fälle:** Fenster W; t\* ist dort der Schluss mit den meisten bestandenen Schichten. Diese Wahl ist günstig für den Fall; sie betrifft nur die Attribution, nicht die Erkennung.
- **Erkannt (DETECTED):** Die Engine erzeugt ein Signal, also ein Setup an t und Hoch[t+1] > Pivot, mit Signaltag in D ± 5 Handelstagen (bzw. in W). Die Engine-Logik ist dabei unverändert (`scanSegment`).

**Timing-Klassen** (vorab fest)
- Klassen: EXACT / ±1 / ±3 / ±5 / MISS.
- Zusätzlich berichtet: das Vorzeichen (VU früher oder später) und EXACT+±1 als „starker Beleg“.

**Regel-Attribution**
- Alle Schichten werden an t\* unabhängig ausgewertet: Messrahmen MR-UNI-01, MR-TT-01..08 einzeln, VCP mit Ablehnungsgrund, SEPA mit erster Sperre und Kennzahlen.
- SEPA-Datenlücken (MR-SEPA-00, MR-PIT-01, Beschleunigung nicht nachweisbar) zählen getrennt von Regelverstößen.
- Auslandsemittent oder Personengesellschaft mit fehlenden Quartalsdaten: `DATA_DEFINITION_MISMATCH`.
- Verlust im Vorjahresquartal (GAAP): zusätzlich `EPS_DEFINITION_GAAP_VS_ADJUSTED_POSSIBLE`.

**Kontrollen**
- Je MAIN-Fall 10 Zufallstitel, die am selben t\* den Messrahmen bestehen. Seed: SHA-256 aus Ticker, Status-ID und Anker.
- Diagnostisch eine zweite Gruppe von 10 Titeln, die zusätzlich das Trend Template bestehen.
- Verglichen werden die Kontroll-Signalrate mit dem Recall und die Kontroll-Setup-Rate an t\* mit der Setup-Rate der Fälle.

**Selektivität**
- Trichter je Jahr und Marktphase (SPY-Gesamtrendite über bzw. unter ihrem 200-Tage-Mittel).
- Stufen: Messrahmen, Trend, VCP, Setup, Signal; gezählt je Ausführungstag.

## 3. Scorecard (MAIN, DEV, Lauf 37598401407)

| Kennzahl | Wert |
|---|---:|
| Positive Fälle MAIN | 16 |
| auswertbar | 15 (RNA: SECURITY_MAPPING) |
| korrekt erkannt | **3** (AMD 09.06.2020, AMZN 08.10.2020, AMD 22.07.2020) |
| verpasst | **12** |
| EXACT / ±1 / ±3 / ±5 | 2 / 0 / 1 / 0 |
| Fehlfälle mit Fundamental-Regel (FUNDAMENTALS_RULE) | 5 |
| Fehlfälle mit Fundamental-Datenlücke (FUNDAMENTALS_DATA) | 7 |
| Fehlfälle mit VCP | 5 |
| Fehlfälle mit Trend (ohne RS) / RS / Messrahmen | 0 / 1 / 1 |
| Negativfälle / auswertbar / falsch positiv | 1 / 0 / NOT_MEASURABLE |
| Pivot-Abweichung | NOT_MEASURABLE |

Ein Fall kann an mehreren Schichten scheitern; die Summen werden nicht zu einer Gesamtzahl verrechnet.

**Strata** (Nachtrag A1)

| Stratum | Recall |
|---|---:|
| MAIN_A eigener Einstieg | 2/13 = 15,4 % |
| MAIN_B Setup bejaht, kein eigener Kauf | 1/2 |
| MAIN ohne Auslandsemittenten/LP | 3/12 = 25 % |
| MAIN ohne Ex-post-Anker (AMZN) | 2/14 = 14,3 % |
| MAIN je Beitrag | 3/15 = 20 % |
| SENSITIVITY | 2/14 = 14,3 % (ATI, F, Fenster 26.11.–11.12.2025); GTHX: Historie zu kurz |
| WATCHLIST (Setup am Vortag) | 0/5; INMD: Historie zu kurz. Kein Recall |
| ENTRY_TYPE_NOT_MODELLED (DXCM) | abgelehnt; Trend und VCP bestanden, SEPA-10 |

## 4. Fehlermatrix (12 abgelehnte MAIN-Fälle)

| Bereich | Fälle | Anteil | davon einzige Sperre | Regeln |
|---|---:|---:|---:|---|
| Fundamentals – Datenlücke | 7 | 58 % | 2 (AEM, REPL) | `SEPA_STALE` 5, `SEPA_DATA_MISSING` 2 |
| Fundamentals – Regel | 5 | 42 % | 4 (ZGNX, ROKU, ACAD, SG) | `SEPA_BASE_NOT_POSITIVE` 4, `SEPA_NO_ACCELERATION` 1 |
| VCP | 5 | 42 % | 0 | `BASE_TOO_SHORT` 5 |
| RS (MR-TT-08) | 1 | 8 % | 0 | DECK, Perzentil 65 |
| Trend (MR-TT-01..07) | 0 | 0 % | – | – |
| Messrahmen MR-UNI-01 | 1 | 8 % | 0 | DKL, Dollarumsatz |
| Sicherheitszuordnung | 1 Fall nicht auswertbar | – | – | RNA |
| Ermessen / nicht reproduzierbar | qualitativ | – | – | Cheat-/Low-Cheat-Einstiege, kleine Basen, Kauf vor dem Pivot (DECK „versucht auszubrechen“) |

**Explorativ nach dem Freeze** (`explore-sec-tags.mjs`, öffentliche SEC-companyfacts)
- Die eingefrorene Extraktion auf öffentlichen Daten liefert in **allen** Fällen dieselben SEPA-Gründe wie der Replay. Der SEC-Bestand ist also nicht beschädigt; die Ursache liegt in der Logik.
- Mit Erstmeldung über alle EPS-Tags werden aus den `SEPA_STALE`-Fällen:
  - TNDM, RVNC, REPL → `SEPA_BASE_NOT_POSITIVE` (Verluste)
  - RICK → `SEPA_REVENUE_NOT_GROWING` (Q4 2020 −21 %)
- Der Datenfehler ändert damit **keine Entscheidung**; er verdeckt den GAAP-Konflikt.
- Ohne den Fehler läge die Fundamental-**Regel** bei 9 von 12 Fehlfällen. Fall D träfe dann inhaltlich zu; formal (präregistriert) liegt die Datenlücke vorn.
- GDDY (SENSITIVITY) meldete EPS 2017–2023 nur in einer firmeneigenen Taxonomie und ist damit in US-GAAP-Tags echt fehlend.

## 5. Fundamentals: SEC, GAAP gegen bereinigt, Quartalszuordnung, Splits

**SEC-Fundamentals als Hauptgrund? Ja.** SEPA sperrt 10 von 12 Fehlfällen.

**GAAP gegen bereinigt (Frage 7)**
- 7 von 15 MAIN-Käufen hatten im Vorjahresquartal einen **GAAP-Verlust**: ZGNX, ROKU, ACAD, SG direkt; TNDM, RVNC, REPL verdeckt.
- MR-SEPA-10 („Turnaround nur mit sehr starkem Quartal“) wurde in 2A als *kein Einstieg bei Basis ≤ 0* formalisiert und schon damals mit Fidelity **LOW** markiert.
- Seine dokumentierten Käufe zeigen: Er kauft Wachstumstitel vor der Gewinnschwelle (Biotech, Streaming, Restaurant-Wachstum). Die VU-Lesart widerspricht damit seiner Praxis → **FORMALIZATION_MISMATCH**. „Regel zu streng“ lässt sich nicht belegen.
- Ob er bereinigte EPS nutzt, ist **unbelegt**; keine Primärquelle gefunden.
- Für vorkommerzielle Biotechs (REPL, ZGNX) wäre auch ein bereinigter Gewinn kaum positiv. Das ist nicht geprüft, weil keine bereinigten Daten vorliegen.

**Quartalszuordnung (Frage 8)**
- Abweichende Geschäftsjahre (REPL März, RICK September, AMD 28.03., MU Februar) werden korrekt über das Periodenende zugeordnet.
- Probleme entstehen an anderer Stelle:
  1. Tag-Priorität statt Erstmeldung, siehe oben.
  2. Auslandsemittenten ohne 10-Q: AEM liefert zuletzt Daten von 2014. MTLS, TSM, NMM und INMD haben keine CIK im Datenlayer.
  3. Personengesellschaft DKL ohne CIK-Zuordnung.
- YTD-Rückrechnung und Änderungsmeldungen (Erstmeldung schlägt /A) fielen in keinem Fall auf.

**Splits (Frage 9)**
- Kein Fall ist betroffen.
- Splits liegen nur nach den Ankern: AMZN 20:1 (2022), DXCM 4:1, DECK 6:1, CPRT 2× 2:1, INMD 2:1. Sie fließen rückwirkend in die bereinigten Kurse ein. Die Pivot-Rohpreis-Umrechnung ist getestet (`GT-T-PIVOT-RAW`).
- SEPA bereinigt EPS nur zwischen zwei Einreichungen; in keinem Fall lag ein Split dazwischen.
- Kein Lookahead.

**EPS-Schwelle (Frage 14 des Auftrags)**
- Bei positiver Basis (AMD +1300 %, AMZN +97 %, ATI +37 %, F +173 %, AXON +231 %) liegen seine Fälle deutlich über 20 %.
- Die 20-%-Schwelle verletzt keines seiner Beispiele. Der Konflikt liegt allein bei der Basis ≤ 0.

## 6. VCP, Trend Template, RS, Branche

**VCP (Fragen 10 und 16)**

| | VU-VCP ja | VU-VCP nein |
|---|---:|---:|
| Minervini-Setup (MAIN, 15) | 9 | 6 |

- Recall der VCP-Schicht 60 %, Falsch-Negativ-Rate 40 %. Precision und Falsch-Positiv-Rate sind NOT_MEASURABLE: Es gibt keine VCP-Negativfälle.
- Ablehnungen: 5 × `BASE_TOO_SHORT` (MTLS 9, TNDM 7, RVNC 9, RICK 13, DECK 3 Sitzungen) und 1 × `STOP_TOO_WIDE` (AMD 22.07., trotzdem 3 Tage früher erkannt).
- Wo er „VCP“ ausdrücklich nennt, erkennt VU sie:
  - ZGNX „große VCP“: 3 Kontraktionen 21/4/3 %
  - SG „klassische VCP“: 29/15/5 %
- Die Basislänge misst VU ab dem höchsten Hoch der letzten 225 Sitzungen, mit mindestens 15 Sitzungen (MR-VCP-01 „3 Wochen“, ORIGINAL_INTERPRETATION).
- Bei RICK spricht er selbst von einer „kleinen Basis“ mit „Low Cheat“. Das deutet auf einen Formalisierungsunterschied (Basisbeginn bzw. Cheat-Pivot innerhalb der Basis) und nicht auf einen Datenfehler.

**Trend Template (Frage 12)**
- MR-TT-01..07 sind in 15/15 MAIN-Fällen an t\* bestanden. Die Interpretation ist mit seinen Fällen vereinbar.

**RS (Frage 13)**
- Nur DECK scheitert (65 < 70). Die VU-RS-Formalisierung (gewichtete 3/6/9/12-Monats-Rendite, Querschnittsperzentil) ist **kein** Hauptproblem.
- Die übrigen Fälle liegen bei Perzentil 81–99.

**Branche (Protokoll, kein Filter)**
- SIC-Gruppe Top 3: ROKU, AMZN, RICK, SG.
- Nicht unter den Top 3: ZGNX (Rang 35/235), ACAD (17/231), REPL (74/324). Die SIC-Pharmagruppe ist sehr groß; Minervinis Branchenbegriff ist nicht SIC.

## 7. Einstieg, Timing, Kontrollen, Selektivität

**Einstieg (Fragen 11 und 20)**
- Erkannte Fälle: 2 × EXACT, 1 × 3 Tage früher.
- Abgelehnte Fälle: Meist gibt es kein VU-Signal in Reichweite. Wo es eines gibt, liegt es Monate entfernt (DECK +477, MU +339 Sitzungen). Sein Einstieg ist dann für VU **nie** ein Signal, nicht „zu früh“ oder „zu spät“.
- Pivotpreis: NOT_MEASURABLE.

**Kontrollen (Fragen 22 und 23)**

| Gruppe | n | Setup an t\* | Signal ±5 |
|---|---:|---:|---:|
| Minervini MAIN | 15 | 13,3 % | **20 %** |
| Zufall, Messrahmen (präregistriert) | 150 | 0,7 % | 1,3 % |
| Zufall, zusätzlich Trend Template (Diagnose) | 150 | 1,3 % | 5,3 % |

Die Engine ist **nicht permissiv**:
- Seine Fälle haben eine etwa 15-mal höhere Signalrate als Zufallstitel desselben Tages und eine etwa 4-mal höhere als Trend-Template-Titel.
- Sie trifft aber nur jeden fünften seiner Käufe. Die Engine ist **selektiv, aber falsch selektiv**: Sie schließt seine Wachstumstitel ohne Gewinn und seine kurzen Basen aus.

**Selektivität (Frage 24)**

Trichter DEV 2016–2026 (Titel-Tage):

| Stufe | Titel-Tage | Anteil an der Vorstufe |
|---|---:|---:|
| Messrahmen | 6,29 Mio. | – |
| Trend Template | 1,06 Mio. | 16,8 % |
| VCP | 135.451 | 12,8 % |
| Setup | **17.072** | 12,6 % |

- Je 1.000 Titel-Tage im Messrahmen sind das 2,7 Setups, rund 6–7 je Handelstag.
- Setup mit Auslösung am Folgetag: 4.283. Signale mit einer Position je Titel (Messung 2B): 2.075.
- Je Jahr 1,7–3,4 Setups pro 1.000 Titel-Tage.
- Abwärtsphase (SPY unter dem 200-Tage-Mittel), z. B. 2022: 1,9 gegen 2,5 in der Aufwärtsphase. Die Engine wird im Abschwung weniger aktiv, schaltet aber nicht ab.

Trichter HOLDOUT 2008–2015 (Titel-Tage):

| Stufe | Titel-Tage |
|---|---:|
| Messrahmen | 3,44 Mio. |
| Setup | 7.858 |
| Signal | 1.936 |

- 2008: 0 Setups, 2009: 10, 2010: 258.
- Das liegt an der Datenlage, nicht am Markt: Maschinenlesbare XBRL-Quartalszahlen der SEC gibt es für die meisten Emittenten erst ab 2009–2011. Die Selektivität der frühen Jahre ist daher ein **DATA_MISSING**-Effekt.

## 8. Fallstudien

Kette je Fall: Quelle → Daten → Fundamentals → Trend → VCP → Pivot → VU-Entscheidung → Minervini-Entscheidung → Differenz. Preise bleiben verschlüsselt.

**Erfolgreiche Reproduktionen**

1. **AMD, 09.06.2020** (MAIN_A)
   - Quelle: Beitrag, er sei positioniert; AMD versuche, in schwachem Markt aus einer Basis zu kommen.
   - Fundamentals: EPS +1300 % gegen +275 %, Umsatz +40 %.
   - Trend: RS 87.
   - VCP: 4 Kontraktionen 38/16/4/3 %, Volumen 0,69.
   - VU: Signal am Ankertag, **EXACT**. Differenz: keine.
2. **AMZN, 08.10.2020** (MAIN_A, Ex-post-Anker)
   - Quelle: Kauf „am Donnerstag“.
   - Fundamentals: EPS +97 % nach −29 %, Umsatz +40 %.
   - Trend: RS 81.
   - VCP: 2 Kontraktionen 19/4 %.
   - VU: **EXACT**.
3. **AMD, 22.07.2020** (MAIN_B)
   - Quelle: Buy-Alert am Vortag, Breakout-Alert am Morgen.
   - VU: Signal 3 Tage **früher** an einem engeren Pivot. Am Ankertag ist der Stop zu weit (18 %).
   - Differenz: anderer Pivot, siehe Vorzeichen.
4. **ATI, Fenster 26.11.–11.12.2025** (SENSITIVITY)
   - Quelle: kürzlich long gekauft.
   - Fundamentals: EPS +37 % gegen +21 %, Umsatz +7 %.
   - VCP: 10/4 %.
   - VU: Signal im Fenster.
5. **F (Ford), gleiches Fenster** (SENSITIVITY)
   - Fundamentals: EPS +173 % nach −102 %.
   - VCP: 11/4 %.
   - VU: Signal im Fenster.

**Klare Fehlschläge**

6. **ROKU, 16.07.2019**
   - Quelle: Ausbruch am Morgen, er ist positioniert.
   - Trend: RS 99, Branchenrang 1.
   - VCP: 19/5 %, Volumen 0,64.
   - SEPA: Vorjahresquartal GAAP-Verlust → `BASE_NOT_POSITIVE`. Einzige Sperre.
   - Kategorie: FUNDAMENTAL_MISMATCH / FORMALIZATION_MISMATCH.
7. **SG, 08.10.2024** (Aufstockung)
   - Quelle: „klassische VCP“, von VU erkannt (29/15/5 %).
   - Trend: RS 98.
   - SEPA: GAAP-Verlust, einzige Sperre. Gleiches Muster wie ROKU.
8. **TNDM, 30.06.2020**
   - Quelle: Ausbruch, er ist positioniert.
   - SEPA: `SEPA_STALE` wegen des Tag-Fehlers (Q1 2020 erst ab Feb. 2021 sichtbar); korrekt wäre `BASE_NOT_POSITIVE`.
   - VCP: Basis 7 Sitzungen.
   - Kategorien: DATA_WRONG + FUNDAMENTAL_MISMATCH + VCP_MISMATCH.
9. **RICK, 05.04.2021**
   - Quelle: er nennt „kleine Basis“ und „Low Cheat“.
   - VCP: Basis 13 < 15.
   - SEPA: Tag-Fehler; korrekt wäre fallender Umsatz (Pandemie-Quartal).
   - Hier wirkt sein Ermessen (Cheat-Einstieg, Umsatzdelle akzeptiert) mit.
10. **AEM, 14.09.2020**
    - Trend und VCP bestanden (11/4 %).
    - SEPA: Auslandsemittent ohne 10-Q, letzte XBRL-Quartalszahl 2014.
    - Kategorie: DATA_DEFINITION_MISMATCH.
11. **DECK, 12.04.2021**
    - Sperren: RS 65, Basis 3 Sitzungen, keine EPS-Beschleunigung.
    - Er kaufte beim *Versuch* des Ausbruchs. Keine einzelne Regel erklärt die Differenz; sein Ermessen dominiert.
12. **RNA, 13.11.2024**
    - Der Ticker gehört heute einem anderen Emittenten; die damalige Avidity-Reihe fehlt im Bestand.
    - Die Identitätsprüfung verhindert eine falsche Zuordnung → SECURITY_MAPPING, nicht auswertbar.

**Negativkontrolle und falsch Positive**

13. **UPST, 15.10.2021** („extended, nicht kaufen“)
    - Nicht auswertbar: Die Notierung ab Dez. 2020 ist kürzer als 252 Sitzungen.
    - Ein falsch Positiver ist damit nicht messbar. Die Zufallskontrollen zeigen eine sehr niedrige Grundrate (1,3 %).

## 8a. Antworten auf die Leitfragen

1. **Erkennt VU seine dokumentierten Setups?**
   - Nur selten: 3 von 15.
2. **Recall?**
   - 20 % (MAIN), 15 % mit eigenem Einstieg, 14 % in SENSITIVITY.
3. **Precision?**
   - Nicht messbar (kein auswertbarer Negativfall).
4. **Welche Regeln erzeugen die meisten Falsch-Negativen?**
   - SEPA: Datenlücken (Tag-Priorität, Auslandsemittenten) und MR-SEPA-10 (GAAP-Basis ≤ 0).
   - Danach MR-VCP-01 (Basis < 15 Sitzungen).
5. **Welche Regeln erzeugen Falsch-Positive?**
   - Nicht messbar.
   - Kontrollen: Die Engine signalisiert bei Zufallstiteln selten (1,3 %).
6. **Sind SEC-Fundamentaldaten ein Hauptgrund?**
   - Ja: 10 von 12 Fehlfällen, 6 davon allein.
7. **Probleme GAAP gegen bereinigt?**
   - Ja, ein Konflikt mit seiner Praxis: 7 von 15 Käufen hatten eine negative GAAP-Basis.
   - Seine EPS-Basis ist unbelegt.
8. **Probleme der Quartalszuordnung?**
   - Ja: Tag-Priorität statt Erstmeldung (4 MAIN-Fälle verspätet), Auslandsemittenten ohne 10-Q, fehlende CIK (DKL, MTLS).
   - Abweichende Geschäftsjahre sind unauffällig.
9. **Split-Probleme?**
   - Keine gefunden.
10. **Erkennt unsere VCP-Engine seine VCPs?**
    - Zu 60 %.
    - Wo er „VCP“ ausdrücklich nennt (ZGNX, SG), ja.
    - Kurze Basen und Cheat-Einstiege nicht.
11. **Stimmen unsere Pivots zeitlich und im Preis?**
    - Zeitlich ja, wenn erkannt (2 × EXACT, 1 × −3).
    - Preis nicht messbar.
12. **Ist das Trend Template korrekt?**
    - Mit seinen Fällen vereinbar (15/15).
13. **Ist unsere RS-Formalisierung problematisch?**
    - Nein, 1/15.
14. **Ist unsere Engine zu permissiv oder zu streng?**
    - Zu streng und falsch selektiv. Nicht permissiv.

**Entscheidungsbaum**

| Fall | Ergebnis |
|---|---|
| A | nein |
| **B** | **ja** |
| C | nein |
| D | formal nein, explorativ ja |
| E | nein (VCP 5/12, nie einzige Sperre) |
| F | teilweise: Cheat-/Low-Cheat-, Pullback- und Vor-Ausbruch-Einstiege sowie die Auswahl aus großen Listen bleiben Ermessen |

**Kandidaten für einen eigenen, späteren PR** (mit Vorher/Nachher-Vergleich; hier nicht umgesetzt)
1. SEC-Extraktion: Erstmeldung über alle EPS-Tags (gemeinsamer Baustein, Freeze betroffen).
2. MR-SEPA-10: Lesart gegen seine dokumentierten Käufe vor der Gewinnschwelle prüfen. Zuerst eine Primärquelle zu seiner EPS-Basis suchen.
3. MR-VCP-01: Basisbeginn und Mindestlänge bei Cheat- bzw. kleinen Basen.
4. Quartalsdaten für Auslandsemittenten (6-K ohne XBRL) und CIK-Zuordnung für Personengesellschaften.
5. Wiederverwendete Ticker (RNA/Avidity) in der Kursreihen-Beschaffung.

Keine Engine 1.2, keine Schwellenänderung, kein neuer Datenanbieter.


## 9. Minervinis überprüfbare historische Performance (getrennter Recherche-Block)

Die Recherche lief über eine Websuche; die Einzelquellen wurden nicht im Volltext geprüft. Die Einstufung folgt der Belegart.

| Angabe | Belegart | Einstufung |
|---|---|---|
| US Investing Championship 2021: +334,8 % (Kategorie über 1 Mio. USD) | Wettbewerb. Der Veranstalter prüft nach eigenen Angaben anhand von Brokerauszügen | **Wettbewerb, vom Veranstalter geprüft**, nicht unabhängig auditiert |
| US Investing Championship 1997 | Wettbewerb; in Sekundärquellen widersprüchliche Zahlen (155 % vs. 255 %) | **Wettbewerb, Zahl unklar** |
| 1994–1999/2000: rund 220 % Jahresrendite im Durchschnitt | Eigene Angabe (Bücher, Interviews, Marketing) | **Selbstberichtet**; kein Prüfbericht gefunden |
| Buchbeispiele (Gewinner-Charts) | Eigene Darstellung, nachträglich ausgewählt | **Buchbeispiel, nicht repräsentativ** |
| Marketing (Seminare, Kurse) | Eigene Werbung | **Marketing** |
| Von Dritten unabhängig geprüfte Gesamthistorie | nicht gefunden | **nicht vorhanden** |

Kritiker weisen auf die ungeprüfte Lücke zwischen den Wettbewerbsjahren hin.
Für diese Validierung ist Performance **keine Ground Truth**. Fälle wurden nicht nach späterem Kursverlauf ausgewählt.

## 10. Diskretionärer Vorsprung (benannt, nicht algorithmisiert)

Was die Beiträge selbst erkennen lassen:

- **Visuelle Mustererkennung:**
  - Er spricht von „Cheat“, „Low Cheat“ und „3-C“-Einstiegen. Das sind Einstiege unterhalb des klassischen Pivots in einer noch laufenden Basis.
  - Pullback-Käufe (DXCM) und Positionen vor dem Ausbruch (PENN) kommen vor.
  - Die Engine kauft nur über dem Pivot der letzten Kontraktion.
- **Qualitative Auswahl:**
  - Aus großen Kandidatenlisten (Buy-Alert-Liste mit 45 Namen, Focus List) kauft er nur einzelne Titel.
  - REPL verpasste er, weil er gleichzeitig andere Titel kaufte; das ist eine Kapazitätsentscheidung.
- **Gewinnauslegung:**
  - Er hält in die Zahlen, wenn ein Gewinnpolster besteht (ZUMZ, BROS, KGC, GDDY).
  - Ein Titel kann für ihn „extended“ sein, obwohl die Zahlen gut sind (UPST).
- **Marktkontext:**
  - Progressive Exposure, Index-Shorts als Absicherung, kurze Stops.
  - „Wenig kaufbare Titel“ in einer Rally.
- **Ermessen beim Ausstieg:**
  - Verkauf in Stärke (BROS, IBKR); zu frühes Verkaufen räumt er selbst ein (NVDA).
  - Teilverkäufe mit „Backstop“ und „Freeroll“ (GTHX).

Diese Punkte werden nicht in Regeln übersetzt.

## 11. Grenzen

- Die Ground Truth stammt nur aus Suchindex-Ausschnitten. Autor, Antwortkontext und Bilder sind nicht prüfbar. Der Index ist zudem zugunsten populärer Beiträge verzerrt.
- Verlusttrades haben selten einen Einstiegstag und fallen daher aus. Das ist eine Gewinner-Asymmetrie.
- Es gibt 16 MAIN-Fälle; Cluster aus einem Beitrag werden zusätzlich auf Beitragsebene berichtet.
- Bei einem einzigen Negativfall sind Precision und Falsch-Positiv-Rate nicht messbar.
- Kein dokumentierter Pivot: kein Preisvergleich der Pivots.
- Alle auswertbaren Fälle liegen in DEV. HOLDOUT liefert nur den Trichter.
- DEV und HOLDOUT gelten seit R14 als gesehene Daten.
