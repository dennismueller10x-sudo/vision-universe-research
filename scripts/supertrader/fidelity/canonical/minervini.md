# Regelbuch Minervini (minervini-canonical-1.0.0) – R15
Stand 2026-10-05, Repo-Commit c4ad8e5e4b7. Live-Version: MINERVINI_VCP 2.0.0. Forschungsversion: 3.0.0.
Daten: `rulebook-MINERVINI.json` mit 69 Regeln, 28 Live-Bausteinen und 26 geprüften R14-Aussagen.

## Quellenlage
- **Primär im Abruf:** Stockopedia-Interview 2018, MarketWatch-Interview und X-Beiträge vom Januar 2022 und Juli 2017.
- **Bücher:** Die Bücher 2013 und 2017 sind nicht abgerufen. Ihr Inhalt stammt aus zwei Notizensammlungen: whatheheckaboom (2014) und tradershall (2019).
- **Ohne Abrufbeleg:** Bei der Herkunft „Buch (nicht im Abruf verifiziert)“ ist die Belegstärke höchstens MEDIUM. Seitenzahlen gibt es keine.

## Trend Template: Buch und Code im Vergleich
| Kriterium | Quelle | Code 2.0.0 | Urteil |
|---|---|---|---|
| Kurs > 150 und > 200 | Notizen | `close > SMA150/200` | gleich |
| 150 > 200 | Notizen | gleich | gleich |
| 200er steigt ≥ 1 Monat (lieber 4–5 Monate) | Notizen | SMA200(t) > SMA200(t−21) | LOW: nur Netto-Vergleich, 4–5 Monate fehlen |
| 50 > 150 und > 200 | Notizen | SMA50 > SMA150 > SMA200 | gleich |
| Kurs > 50 | Notizen | gleich | gleich |
| ≥ 30 % über dem 52W-Tief | Notizen: „at least 30%“; Abschnitt Stufe 1→2: 25–30 % | 1,30 × 252-Tage-Tief | gleich. Die öffentliche registry.json zeigt noch „25 % aktiv“ (veraltet). |
| ≤ 25 % unter dem 52W-Hoch | Notizen | 0,75 × 252-Tage-Hoch | gleich |
| IBD-RS ≥ 70 (lieber 80–90) | Notizen | VU-Perzentil (40/20/20/20 aus 3/6/9/12 Monaten) ≥ 70, nur bei der Entdeckung | IBD ist proprietär, daher VU-Proxy |

## SEPA-Fundamentaldaten
- **Was Minervini verlangt:** kräftiges EPS-Plus im letzten Quartal zum Vorjahresquartal (Führer ≥ 20 %, Superperformer 30–40 %+), Beschleunigung, Code 33 (drei Quartale Beschleunigung bei Gewinn, Umsatz **und** Marge), Überraschungen, Revisionen, institutionelle Nachfrage, Branchenführerschaft, Katalysator. Primär: „all you need to look at are earnings, sales and margins – and the chart“.
- **Live 2.0.0: nichts davon (HIGH).**
  - Der Live-Kontext (`ctxOf`, build.mjs Z. 404) enthält kein `fund`.
  - Die Signalseite zeigt heutige Discover-Werte an, ausdrücklich ohne Filter (`filtered:false`).
- **3.0.0 (Forschung):** EPS ≥ +25 % YoY, eine Stufe Beschleunigung, Umsatz > Vorjahr, aus SEC-Erstmeldung mit `filed < Tag`; ohne Daten kein Einstieg. Margen und 3-Quartals-Beschleunigung fehlen.

## VCP und Einstieg
- **Kontraktionen:** Die Quelle nennt 2–6, jede kleiner als die vorige (Beispiel 25 → 15 → 8 %), Volumen trocknet aus, Kauf über dem Pivot bei steigendem Volumen.
  - Code: Zickzack 4 %, Fenster 65 Sitzungen, mindestens 2 streng fallende Tiefen, erste ≤ 35 %, letzte ≤ 10 %, Vol10/Vol50 < 0,8.
  - Urteil: VU-Formalisierung, MEDIUM. Das 65-Tage-Fenster schließt längere Basen aus; die Notizen nennen 3–45 Wochen.
- **Einstieg:**
  - Die Quelle beschreibt den Kauf im Moment des Pivot-Durchbruchs.
  - Code: Tagesschluss über dem Pivot, Kauf zur nächsten Eröffnung.
  - Urteil: MEDIUM.
- **Ausbruchsvolumen ≥ 1,4×:**
  - Im Abruf gibt es dafür keine Minervini-Fundstelle. Die Zahl entspricht der O'Neil-Konvention (40–50 %).
  - Einordnung: FOREIGN_RULE, MEDIUM. Das ist eine harte Sperre; R14 sprach nur von „sekundär“.
- **Fehlt:** Cheat-, Low-Cheat- und 3C-Einstiege, Power Play, Messung der Enge („tight and light“).

## Risiko und Ausstieg
- **Stop:**
  - Quelle: 10 % sind der „uncle point“, der Durchschnittsverlust liegt bei 3–7 %.
  - Code: max(Tief der letzten Kontraktion, Eröffnung − 10 %).
  - Urteil: LOW. Die 10 % sind im Code der Regelfall, kein Notbehelf.
- **Einstand bei 3R:**
  - Die Buchnotizen sagen wörtlich sinngemäß: Steigt der Kurs um das Dreifache des Risikos, wird der Stop fast immer auf Einstand gezogen.
  - Code: identisch.
  - **R14 nennt 3R „VU“ – das ist FALSCH.**
- **Ausstieg unter der 50-Tage-Linie mit Volumen:** Im Abruf nicht belegt (UNRESOLVED). Im Code ist das der Haupt-Trailing-Exit.
- **Fehlt:** Verkauf in die Stärke bzw. der halben Position (HIGH); Nachziehen über den Einstand ab 2–3R; Zeitstop; gestaffelte Stops (Stockopedia, primär); engere Stops/Ziele in schwierigen Märkten; Pyramidisieren und Pilotkäufe (strukturell unmöglich: ein Signal je Titel).
- **Wiedereinstieg:** Nach 5 Sitzungen Sperre (VU) ist ein neues VCP-Setup möglich. Die Quelle sagt: Große Gewinner brauchen oft 2–3 Versuche.
- **Quartalszahlen:** Im Abruf nichts gefunden (UNRESOLVED). Im Code gibt es keine Regel.

## Positionsgröße und Portfolio
| Baustein | Quelle | Live | Urteil |
|---|---|---|---|
| Risiko je Trade | 1–2 % (Notizen); 1,25 % nur aus dem R7-Auszug von X, nicht im Abruf | 1,25 % | LOW |
| Höchstgewicht | 25 % (Notizen) | 25 % | NONE |
| Anzahl Positionen | 4–6 klein, 10–12 groß; 8–10, evtl. 12; nie > 15–20 | 10 | NONE (Code-Text „VU“ ist falsch) |
| Konzentration und Margin | 4 Titel bar, 8 mit Margin; Hebel „sparingly“ | maxExposure 1,0 | VU-Grenze |
| Progressive Exposure | Start mit 25–50 % Pilot, erst bei Erfolg erhöhen | halbes Risiko, wenn die Dollar-Summe der letzten 5 Trades < 0; Start sofort voll | MEDIUM |
| Reihenfolge | „buy in order of breakout“ | VU-RS am Vortag, dann alphabetisch | LOW (Proxy) |
| Markt | Aktie für Aktie, Indizes vom Bildschirm; im feindlichen Markt raus | kein Filter; SPY > GD200 in R12 verworfen | LOW |
| Liquidität | keine feste Grenze | ≥ 5 USD, ≥ 5 Mio. USD | VU |
**Weitere VU-Eigenheit:** Ein Signal ohne Portfolioplatz läuft im Protokoll weiter und sperrt den Titel bis zu seinem Abschluss.

## SEC-Daten
- **quant/data/sec/consumer** (5.073 CIKs):
  - `policy as_of_latest`: zuletzt berichtete Werte, Quartale nur für etwa 2 Jahre.
  - **Nicht point-in-time.**
  - Nur für die CAN-SLIM- und Piotroski-Teilprüfung (build.mjs `loadSecFundamentals`).
- **quant/data/sec/canonical und inspector:** Erstmeldungen mit Filing-Datum, aber nur 5 Titel.
- **sec-pit-r11 / r12** (privater Speicher, sec-pit.mjs aus EDGAR companyfacts):
  - Quartals-EPS und Umsatz als **Erstmeldung**, mit delisteten Titeln, sichtbar ab dem Einreichungstag.
  - **Point-in-time.**
  - r11 nutzt Minervini 3.0.0; r12 dient nur dem Audit.
- **sec-delist-r13:** Klassifikation von Delistings, nur für die Portfolio-Szenarien.
- **quant/data/fundamentals:** Nur Abdeckungsberichte (backtest-readiness: 5.119 Titel PIT-fähig, survivorship-behaftet).
- **Wofür die Daten verwendet werden:**
  - 2.0.0 nutzt keine davon.
  - 3.0.0 nutzt sec-pit-r11.
- **Warum 2.0.0 ohne SEC-Daten läuft:** 2.0.0 stammt aus R7, vor den PIT-Daten. consumer ist nicht PIT. Die Begründung in fidelity.mjs (Survivorship) ist seit R11 veraltet.
- **Warum 3.0.0 nicht live ging:**
  - DECISION-R11: a(W4) FAIL und b(Vollportfolio S1) FAIL. Der Filter senkt die Zahl der Einstiege, auch bei Gewinnern.
  - DECISION-R13: Es bleibt bei RESEARCH.
- **Reproduzierbarkeit:**
  - Mit vorhandenen Daten: Trend Template, EPS und Umsatz samt Beschleunigung, alle Preis- und Ausstiegsregeln.
  - Daten vorhanden, aber nicht integriert: Marge/GrossProfit (keine Erstmeldungs-Extraktion), Code 33 über 3 Quartale, SIC-Branche, Float.
  - Integriert, aber nicht live: MIN-EPS-01, MIN-EPS-ACC, MIN-REV-01.
  - Nicht öffentlich: IBD-RS, Überraschungen und Revisionen zum damaligen Stand, Katalysator, diskretionäre VCP-Beurteilung, Minervinis Marktmodell, historische Intraday-Pivots.

## Geprüfte R14-Aussagen
- **CONFIRMED:** 19.
- **PARTIALLY:** 4 (VCP-Fallzahl, 1,4×-Herkunft, Stop, Rang).
- **FALSE:** 1 (3R sei VU).
- **UNVERIFIABLE:** 2 (verschlüsselte Ergebnisse).

## Dokumentationsfehler (live sichtbar)
- registry.json zeigt die 25-%-Variante als aktiv und Ausstiegstexte aus 1.1.0.
- PORTFOLIO.source und process-chain nennen die 10 Positionen „VU“.
- process-chain lässt beim Ausstieg die Volumenbedingung und den Einstand weg.
- In fidelity.mjs und METHOD_FIDELITY.md ist die SEC-Begründung veraltet.

## Fidelity und Urteil
- **Fidelity:** Einstieg MEDIUM · Ausstieg LOW · Positionsgröße MEDIUM · Portfolio MEDIUM · Fundamentaldaten LOW · Marktlage MEDIUM.
- **Replikation darf nicht behauptet werden** (`replicationClaimAllowed: false`).
- **Zulässiger Name:** „VU-Version nach Minervinis Trend Template und VCP-Idee – ohne SEPA-Fundamentaldaten und ohne Verkauf in die Stärke“.
- **Nicht zulässig:** „Minervini-Methode“ oder „SEPA“.

## Was eine echte Replikation bräuchte
1. SEPA aus PIT-Daten: EPS, Umsatz, Marge mit Beschleunigung über bis zu 3 Quartale; Schwellen als registrierte Varianten.
2. Breitere Basiserkennung (3–45 Wochen, Enge, Volumen am Pivot) plus Cheat- und Power-Play-Setups.
3. Einstieg per Kauf-Stop am Pivot; Volumen nur als Qualitätsmerkmal.
4. Stop technisch (Ziel-Ø-Verlust 5–7 %, Kappe 10 %, optional gestaffelt); Einstand ab 3R, Nachziehen, Halbverkauf in die Stärke, Zeitstop, Wiedereinstieg, Pilotkauf und Aufstocken.
5. Portfolio: 1,25 % Risiko, max. 25 %, 8–12 Titel, Exposure-Stufen 25 → 50 → 100 % nach Erfolg; Margin/Short nur als getrennte Varianten.