# Strang G – Strategie-Labor: Vorregistrierung (eingefroren)

Forschung, nicht zertifiziert. Registriert am 05.11.2026 vor dem ersten Labor-Rechenlauf. Quellbasis: main `24568ffc72`.
Dieses Dokument wird nach dem Registrierungscommit nicht geändert; der Runner bricht ab, wenn der SHA-256 nicht stimmt.
Abweichungen, Fehler und Datenlücken stehen ausschließlich im Bericht. Eine sachlich andere Suche braucht eine neue Registrierung.

## 1. Frage

Mit welcher Strategie, gebaut aus Daten und Werkzeugen von Vision Universe, erzielen Anleger nach Kosten eine höhere
Gesamtrendite als der S&P 500 (SPY, Dividenden reinvestiert)? Long-only, kein Hebel, keine Leerverkäufe, USD, keine Steuern.

## 2. Vorwissen (offengelegt)

Bekannt vor dieser Registrierung: E3 (`docs/research/edge/BERICHT.md`, Prüfteil 2020–2026, sieben Quant-Profile und fünf
Supertrader-Methoden, keine schlägt SPY) und die Musterportfolios (`MODEL_PORTFOLIOS.md`, Fenster 2024-01-05 bis 2026-10-02,
fünf Profile, alle unter SPY). Der Prüfzeitraum 2024–2026 ist damit für diese Profilfamilien **nicht unberührt**; er ist eine
einmalige, vorab fixierte Prüfung neuer Varianten. Unberührt ist nur der Holdout 2008–2015. Supertrader-Methoden werden im
Labor nicht erneut gesucht (E3: alle Varianten mit sehr großen Verlusten im Prüfteil); sie zählen nicht zu den Labor-Varianten.

## 3. Zeitaufteilung

| Teil | Zeitraum | Zweck |
|---|---|---|
| Suche (DEV) | 2016-01-01 bis 2023-12-31 | alle Varianten rechnen, Walk-forward, Auswahl |
| Prüfung (TEST) | 2024-01-01 bis 2026-10-02 | einmalig, höchstens 5 vorab festgeschriebene Kandidaten |
| Holdout | 2008-01-01 bis 2015-12-31 | höchstens 2 Finalisten, erst nach Bestätigung der Steuerung |

2026-10-02 ist das letzte Datum der SPY-Gesamtrenditereihe (`vorsorge/data/series/SPY.json`); fehlt eine Woche, wird nicht
verkürzt, sondern blockiert. Daten vor dem jeweiligen Fensterstart dienen nur als Vorlauf (Faktoren, Risiko, Filter).
Das lernende Ranking trainiert in DEV und TEST nur auf Stichtagen ab 2016-01-01, im Holdout nur ab 2008-01-01.
Jedes Fenster startet in Cash; keine Bestände werden kostenlos übertragen. Umschichtungstermine laufen ab dem ersten
Wochenstichtag des Fensters.

Walk-forward in DEV: Für jedes Jahr Y = 2018 … 2023 wird mit der Auswahlregel aus Abschnitt 7 (nur Kriterium K, ohne
Zulassungsregeln) auf 2016-01-01 bis 31.12.(Y−1) die beste Variante bestimmt und ihr Ergebnis im Jahr Y festgehalten.
Die verkettete Walk-forward-Kurve 2018–2023 zeigt, ob die Auswahlregel selbst Vorhersagekraft hat. Sie ist kein Kandidat.

## 4. Daten (Point-in-Time)

- Kurse: kanonische Tiingo-Tagesbalken aus der R2-Historienablage (Gesamtrendite, Rohschluss, Tagesumsatz), Wochenraster
  wie `scripts/quant/portfolio/model-portfolios.cjs#buildPanel`. Delistete Titel immer enthalten: qualifizierte V13-Ketten
  (Register 1.0.0) mit Gesamtrendite und Rohbalken. Population: heutige Kursdateien plus V13-Ketten, heutiger SIC (Grenze).
- Fundamentaldaten: SEC companyfacts, Lesart ORIGINAL, sichtbar nur bei Einreichung strikt vor dem Stichtag
  (`quant/engines/portfolio-pit-factors.cjs`).
- Gewinnüberraschung: aus companyfacts (`EarningsPerShareDiluted`, ersatzweise `EarningsPerShareBasic`), Quartalswerte
  (Dauer 80–100 Tage) aus 10-Q/10-K in der zuerst eingereichten Fassung; Ereignisdatum = Einreichungsdatum.
- Insider-Käufe: SEC Insider Transactions Data Sets (Form 3/4/5, Quartalsarchive), nur Form 4 ohne Änderungen,
  Transaktionscode P, meldende Person Officer oder Director; sichtbar bei Einreichungsdatum strikt vor dem Stichtag.
  Zuordnung über die Emittenten-CIK zu `securityIds` des PIT-Fundamentalindex (auch delistete Ketten).
- ETFs: Wochen-Gesamtrenditen aus `vorsorge/data/series/` (Fondskosten enthalten): SPY, QQQ, IWM, IEF, BIL und die neun
  Sektor-ETFs XLB, XLE, XLF, XLI, XLK, XLP, XLU, XLV, XLY.
- Markt und Zinsen: SPY-Tagesschluss (`quant/data/market/multi-asset/series/SPY.json`), US10Y und US2Y (US Treasury) aus
  demselben Ordner.
- Geprüft und zurückgestellt: **13F-Konsens.** Historische Bestände gibt es als SEC-Datensatz erst ab 2013; die
  CUSIP-Zuordnung zu delisteten Titeln ist im Repository nicht zeitpunktgenau möglich (nur heutige `cusip-map.json`).
  Ein Signal, das später delistete Titel nicht sieht, wäre survivorship-verzerrt. Folgestudie erst mit zeitpunktgenauer
  CUSIP-Historie. **Makro außer Zinsen** (Konjunkturdaten mit Revisionen) wird nicht verwendet.

Fehlt ein Baustein einer Familie (z. B. Insider- oder EPS-Datensatz lädt nicht), sind deren Varianten
„nicht bestimmbar (blockiert)“; sie bleiben in der Zählung, werden nicht ersetzt.

## 5. Ausführung und Kosten

- Entscheidung zum Wochenschluss t, Ausführung zum Schluss der Folgewoche (Ledger `quant/engines/research-portfolio.cjs`
  über den E3-Ablauf, `scripts/research/edge/quant-e3.cjs`). Markt- und Zinsfilter wie E3: bewertet am letzten
  Tagesschluss der Entscheidungswoche.
- Kosten je Seite für alle Handel (auch Filterwechsel): **10 bp Gebühr + 10 bp Slippage + halber Spread** nach
  Liquiditätsklasse aus `portfolio-construction.cjs` (2–50 bp, +25 bp unter 5 USD). ETFs: 10 + 10 + 2 bp.
- Cash (Filter aus, nicht ausführbare Order, Restbestand) wird mit der Wochen-Gesamtrendite von BIL verzinst und nicht
  in Aktien reinvestiert. Sensitivität: Cash unverzinst. Vor Beginn der BIL-Reihe (2007-06-01) ist Cash unverzinst und der
  BIL-Vergleichswert der ETF-Regeln 0 %.
- Endwert delisteter Titel: MERGER 100 %, UNKNOWN 70 %, DISTRESS 0 %, SERIES_END 100 % des letzten Schlusses.
- Aktienportfolios nach VU-Portfolio-Standard: 15–30 Titel, Ziel N, max. 8 % je Titel, max. 25 % je Branche (FF12),
  Kurs ≥ 5 USD, ADV ≥ 2 Mio. USD (ersatzweise Marktkap. ≥ 300 Mio.), gleichgewichtet (EQUAL), Kandidatenpool 90,
  Vorlauf 104 Wochen. Zu wenige zulässige Titel: Engine-Regel (Bestand läuft weiter), gezählt.

## 6. Suchraum (78 Varianten, vollständig)

Scores sind Querschnitts-Perzentile je Stichtag; Kombinationen sind das Mittel der Perzentile. W = Umschichtung in Wochen,
N = Zieltitelzahl, F = SPY-Marktfilter (SPY > SMA200, sonst Cash).

| Familie | Wirtschaftliche Begründung | Signal | Raster | Anzahl |
|---|---|---|---|---|
| MOM Momentum/relative Stärke | Unterreaktion auf Nachrichten, langsame Informationsverarbeitung | 12-1 Monate (52 W., ohne letzte 4), 6-1 (26 W., ohne letzte 4), Mittel beider | Signal 3 × W {13, 26} × N {15, 25} | 12 |
| HI52 Trend Einzeltitel | Ankereffekt am 52-Wochen-Hoch (George/Hwang) | Kurs / 52-Wochen-Hoch, nur über 40-Wochen-Mittel | W {13, 26} × N {15, 25} | 4 |
| QUAL Qualität | profitable, solide Firmen werden unterbewertet (Novy-Marx, Asness) | Familien quality + profitability | W {13, 26} × N {15, 25} | 4 |
| VAL Value | Risikoprämie und Überreaktion | Familie value | W {13, 26} × N {15, 25} | 4 |
| LVOL Niedrige Volatilität | Hebelrestriktion, Lotterie-Präferenz | Familie risk (−Vol 52 W.) | W {13, 26} × N {15, 25} | 4 |
| INS Insider-Käufe | Informationsvorsprung der Insider (Lakonishok/Lee, Cohen et al.) | Zahl verschiedener kaufender Insider im Fenster L, Gleichstand nach Kaufwert/Marktkap.; nur Titel mit ≥ 1 Käufer | L {13, 26} × W {4, 13} × N {15, 25} | 8 |
| PEAD Gewinnüberraschung | Drift nach Gewinnmeldung (Bernard/Thomas) | SUE = (EPS_q − EPS_q−4) / Std. der letzten bis 8 solchen Differenzen (mind. 4), Meldung in den letzten 13 W. | W {4, 13} × N {15, 25} | 4 |
| KOMBI Kombinationen | Diversifikation schwach korrelierter Prämien | K1 MOM+QUAL, K2 MOM+LVOL, K3 VAL+MOM+QUAL, K4 QUAL+LVOL+MOM, K5 MOM+QUAL+PEAD, K6 QUAL+INS(26 W., 1/0) | 6 × F {aus, an} × W {13, 26}, N 25 | 24 |
| LERN lernendes Ranking | Gewichtung der Signale aus Vergangenheitsdaten | Ridge-Regression des 13-Wochen-Folgerang auf alle Einzelsignale (MOM 12-1, 6-1, HI52, LVOL, QUAL, profitability, growth, VAL, INS, SUE; fehlend = 0,5), nur Labels, die vor t vollständig bekannt sind, Stichprobe alle 4 Wochen, mind. 52 Stichtage, sonst Gleichgewicht aller Signale | λ {0,01; 0,1} × N {15, 25}, W 13 | 4 |
| ETF Trendfolge, Markt- und Zinsfilter | Zeitreihen-Momentum, Krisenvermeidung (Moskowitz/Ooi/Pedersen, Faber) | E1 SPY über SMA200 sonst BIL; E2 SPY wenn 52-W.-Rendite > BIL sonst BIL; E3 wie E1, zusätzlich BIL wenn US10Y > 52-W.-Mittel + 0,75 pp; E4 SPY wenn 52-W.-Rendite > BIL sonst IEF; R1/R2 bester aus SPY/QQQ/IWM nach 26 bzw. 52 W., sonst BIL wenn unter BIL; S1 3 beste Sektoren nach 52-4 W., W 13; S2 = S1 mit Filter F; S3 3 beste Sektoren nach 26 W., W 4; S4 = S3 mit Filter F | wöchentlich geprüft | 10 |

Summe 78. Keine weiteren Varianten, Schwellen oder Gewichte. Sensitivitäten (Cash unverzinst, Engine-Kosten 1 + 5 bp,
strenge Endwerte UNKNOWN 30 %) werden berichtet, zählen nicht als Varianten und dienen nicht der Auswahl.

## 7. Auswahl (nur DEV)

Kriterium K: Deflated Sharpe Ratio (Bailey/López de Prado 2014) der wöchentlichen Log-Überrendite gegenüber SPY über DEV,
mit Schiefe und Wölbung, Versuchszahl N = 78, Varianz der Sharpe-Werte über alle gültigen Varianten.

Zulassung eines Kandidaten: (a) DEV-Gesamtrendite netto > SPY, (b) Überrendite in beiden Hälften 2016–2019 und 2020–2023
positiv, (c) maximaler Verlust höchstens 10 pp schlechter als SPY in DEV.
Rangfolge nach K, dann Varianten-ID; höchstens 2 je Familie; höchstens 5. Bleiben Plätze frei, Weg „weniger Verlust“:
CAGR ≥ SPY-CAGR − 1,5 pp und maximaler Verlust ≤ 0,75 × SPY-Verlust in DEV, Rang nach CAGR-Abstand, höchstens 1 je Familie.
Auswahl, Hash der DEV-Ergebnisdatei und Regeln werden committet, bevor der Prüfteil gerechnet wird. Bleibt kein Kandidat,
endet die Suche mit „keine Strategie besteht“.

## 8. Statistik

- Alle 78 Varianten werden berichtet, auch blockierte und schlechte.
- DSR je Variante (Abschnitt 7) und White's Reality Check (stationärer Bootstrap, mittlere Blocklänge 13 Wochen,
  9.999 Replikate, Seed 20261106) für H0 „keine Variante hat eine positive mittlere Überrendite“ über DEV.
- Prüfung und Holdout: gepaarter zirkulärer Block-Bootstrap (13 Wochen, 9.999, Seed 20261106) der mittleren
  Log-Überrendite je Kandidat, Holm über die Kandidaten; Prüfung allein ist mit 2,75 Jahren schwach, das wird benannt.

## 9. Urteile

- **besteht**: Gesamtrendite netto > SPY-Gesamtrendite im Prüfteil **und** im Holdout (Owner-Definition).
  Zusatz „statistisch gesichert“, wenn der Block-Bootstrap über Prüfteil und Holdout gemeinsam Holm-p ≤ 0,05 ergibt;
  sonst „besteht, statistisch nicht gesichert“.
- **Mehrwert weniger Verlust** (separat, kein „schlägt den Markt“): in Prüfteil und Holdout CAGR ≥ SPY − 1,5 pp und
  maximaler Verlust ≤ 0,75 × SPY-Verlust.
- **besteht nicht**: sonst. Bei gültigen Daten heißt das: kein Nachweis, nicht bewiesene Gleichheit.
- **nicht bestimmbar (blockiert)**: fehlende Daten, nie automatisch „besteht nicht“.
- Holdout erst nach schriftlicher Bestätigung der Steuerung (`docs/research/labor/HOLDOUT_FREIGABE.md`, Finalisten
  vorab benannt: Kandidaten, die den Prüfteil bestehen, Rang nach K, höchstens 2).

## 10. Vorwärtstest

Besteht eine Strategie, werden ihre Regeln mit Hash eingefroren und ein Papiertrack mit festen Regeln gestartet
(Muster SF6-PAPER-2027): Start am ersten Wochenschluss nach dem Urteil, keine Änderung, laufende Bilanz gegen SPY.

## 11. Veröffentlichung

Das Repository ist öffentlich: dort stehen nur Protokoll, Methodik und Urteile. Renditezahlen, Kurven und p-Werte gehen
verschlüsselt aus dem Workflow und als privates Artifact an den Owner. Keine Renditewerbung, keine Produktdateien,
keine Fachmodelle geändert.
