# Quant V13b – F1w als eigenständige Vergleichsstudie (Registrierung 2.0.0)

**Owner-Entscheidung 3 (29.10.2026):** neue, vor der Auswertung eingefrorene Studienregistrierung; F1w darf als eigenständige
Sensitivitäts-/Vergleichsstudie weiterentwickelt werden; die bisherige Hauptpopulation und ihre Ergebnisse bleiben erhalten;
keine automatische Übernahme als Standardregel.

**Die V13-Hauptergebnisse sind unverändert.** F1 (F0 + 390 delistete Reihen, registrierte Frame-Regel) bleibt der registrierte
Hauptvergleich. Alle F0-, F1- und F1w-Werte in diesem Ordner sind wörtlich aus den committeten V13-Dateien
[`../../v13/studies/s1-signal-1.0.0.json`](../../v13/studies/s1-signal-1.0.0.json) und
[`../../v13/studies/s2-population-1.0.0.json`](../../v13/studies/s2-population-1.0.0.json) übernommen (SHA-256 im Ergebnis),
nicht neu geschätzt und nicht überschrieben. Weder F1w noch F1d wird Standard-Frame, Loader-Default oder Produkteingang.

**Evidenzart:** `HISTORICAL_DEVELOPMENT_STUDY`, `NON_CONFIRMATORY_COMPARISON_STUDY`, `NOT_CERTIFIED`, `productionApproved: false`.
Nicht konfirmatorisch: Alle F1w-Zahlen waren aus V13 bekannt, die fünf Regeln wurden auf derselben Historie 2000–2025 entwickelt.

## Registrierung (vor jeder Berechnung eingefroren)

[`study-registration-2.0.0.json`](study-registration-2.0.0.json), SHA-256 `c1ba0ebb…bc7f1f` (Datei `.sha256`), eigener Commit
`04e55fad9c` vor jeder F1d-Berechnung, vor jedem Diagnoselauf und vor dem F1w-Nachlauf. Inhalt:

- **F1w** genau wie Nachtrag 1.0.1: nur der letzte Balken einer delisteten Reihe, der vor dem Modal-Datum seiner ISO-Woche liegt,
  wird auf dieses Datum umbenannt; Kurs unverändert, nichts fortgeschrieben, kein Balken ergänzt.
- **F1d** (neu, kalendertreue Alternative): dieselben Reihen, aber der nicht-modale letzte Balken wird **gestrichen**; die Reihe endet
  an der letzten vollständigen Woche. Kein Aktienkurs wird mehr mit einem späteren SPY-Kurs gepaart; dafür fehlt die Rendite der
  letzten Teilwoche (nicht als 0 % fortgeschrieben, Terminal-Szenarien auf den Vorwochenschluss).
- Lesart vorab festgelegt: **F1d − F1** = Populationseffekt der 1.186 zusätzlichen Reihen; **F1w − F1d** = Behandlung der letzten
  Teilwoche samt Datumslabel; F1w − F1 = Summe.
- Regeln, Horizonte, Kosten (10 + 5 Bp je Seite), SPY-Preisrendite, Fenster, Block-Bootstrap und Holm-Familien (je Frame und Variante
  60 Zellen) wie V10/V13. Keine Tests auf Differenzen, keine Suche. Diagnosen DG1–DG3 und Reproduktion R1 vorab definiert.

## Ergebnisse ([`results-2.0.0.json`](results-2.0.0.json))

Abweichungen von der Registrierung: **keine**. F1d nimmt wie erwartet 1.576 delistete Reihen auf (1.186 gekürzt, 0 zu kurz), dieselbe
Menge wie F1w (5.905 Listings). **R1:** F1w aus V13 exakt reproduziert (Manifest-Hash gleich, alle 120 S1-Terminal-Teile und S2 identisch).

### S1 – Überrendite gegen SPY, netto, Terminal S0 (Prozentpunkte)

| Regel | h | F0 | F1 (primär) | F1w | F1d | p F1 → F1w → F1d |
|---|---:|---:|---:|---:|---:|---|
| MOMENTUM_IMPROVED | 13 | +0,48 | +0,52 | +0,60 | +0,60 | 0,497 → 0,427 → 0,424 |
| NEW_52W_HIGH | 13 | +1,07 | +1,14 | +1,25 | +1,26 | 0,092 → 0,062 → 0,059 |
| TREND_UP | 52 | +3,53 | +3,63 | +3,79 | +3,80 | 0,222 → 0,190 → 0,188 |
| MOMENTUM_IMPROVED | 52 | +3,79 | +3,89 | +4,12 | +4,13 | 0,205 → 0,174 → 0,173 |
| NEW_52W_HIGH | 52 | +3,38 | +3,52 | +3,65 | +3,67 | 0,159 → 0,147 → 0,146 |

Spannweiten über alle 60 Zellen (Terminal S0): F1w − F1 −0,07 … +0,23 Pp.; **F1d − F1 −0,07 … +0,24 Pp.**; **F1w − F1d −0,03 … +0,01 Pp.**
Holm (je 60): F0 7, F1 7, F1w 9, **F1d 9** Ablehnungen (V10-Semantik und S0 gleich; dieselben neun Zellen wie F1w), **keine
SPY_EXCESS-Zelle in irgendeinem Frame.** 58 von 60 Zellen sind `END_OF_SERIES_STABLE` (gleiches Vorzeichen, gleiche Holm-Entscheidung
in F1, F1w, F1d); sensitiv sind nur TREND_UP h 4 und h 13 BASE_RATE_EXCESS (in F1w/F1d abgelehnt, in F1 nicht – Grenzzellen schon in V13).

**Befund:** Der Unterschied zwischen F1w und F1 ist fast vollständig ein **Populationseffekt** (mehr, überwiegend übernommene Reihen),
nicht eine Folge der Umbenennung. Ob die letzte Teilwoche umbenannt oder gestrichen wird, verschiebt keine Zelle um mehr als 0,03 Pp.

### S2 – Population (gleichgewichtet, brutto)

| Zeitraum | EW-CAGR F1 | F1w | F1d | SPY |
|---|---:|---:|---:|---:|
| 2000–2025 | 13,82 % | 13,81 % | 13,82 % | 6,17 % |
| 2013–2019 | 12,34 % | 11,97 % | 11,99 % | 12,01 % |
| 2020–2025 | 10,78 % | 11,24 % | 11,27 % | 13,58 % |

Buy-and-hold h 52 (Terminal S0) 2000–2025: F1 14,85 %, F1w 14,91 %, F1d 14,92 %.

### Diagnosen

- **DG1 – letzte Teilwoche** (1.186 Reihen; Rendite vom letzten Modal-Schluss bis zum letzten Handelstag): Mittel −0,84 %, Median
  +0,02 %; MERGER (836) −0,37 %, UNKNOWN (315) −1,13 %, **DISTRESS (35) −9,46 %** (Median −5,0 %). Abstand letzter Handelstag →
  Modal-Datum 1–4 Wochentage (354/285/288/259). F1d lässt diese Verluste weg; weil nur wenige Ereignisse genau dort enden, bleibt die
  Wirkung auf die Zellen bei ≤ 0,03 Pp.
- **DG2 – SPY-Datum in F1w:** Werden SPY-Ein-/Ausstiege auf umbenannten Balken auf den wahren letzten Handelstag gelegt, betrifft das
  8–49 von 50.000–80.000 Ereignissen je Zelle; die SPY-Überrendite ändert sich um höchstens 0,0003 Pp. Die bekannte Datumsverzerrung
  von Nachtrag 1.0.1 ist damit vernachlässigbar.
- **DG3 – Empfindlichkeit der geförderten Strategie (nur erklärend):** Das V10-Portfolio lässt nur Reihen ohne Lücke zu, die bis zur
  letzten Strategiesitzung (2026-04-02) laufen. Delistete Reihen kommen deshalb nur hinein, wenn sie **2026** endeten: F1 7, F1w 52,
  F1d 51 (45 bzw. 44 davon sind Umbenennungs-/Kürzungsfälle, die F1 wegen des Freitagslabels ganz ausschließt). Es sind faktisch
  Überlebende von 2000–2025, die F0 fehlten – kein Delisting-Effekt der Studienperiode. NEW_52W_HIGH: CAGR F1 16,42 % → F1w/F1d
  19,68 % (Holm-p 0,027 → 0,003). Nur 13 Episoden liegen in delisteten Reihen (Mittel +8,7 % gegen +5,7 % aller Episoden), aber
  **80 Episoden** unterscheiden sich von F1, davon 67 in nicht delisteten Titeln: Ein neuer Kandidat belegt einen der 10 Plätze, und
  der Hash-Losentscheid verschiebt alle späteren Belegungen. Schon F0 → F1 zeigt das: TREND_UP steigt von 11,08 % auf 11,75 % CAGR durch eine einzige Episode in einer delisteten
  Reihe (+225 % brutto), die genau eine F0-Episode verdrängt.
  F1d liefert exakt dieselben Portfolio-Zahlen wie F1w. Die Konstruktion ist pfadabhängig; ihre Zahlen sind kein Populationsbefund
  und wurden nicht optimiert.

## Was F1w (und F1d) beiträgt – und was nicht

- **Beiträgt:** Die registrierte Frame-Regel schließt drei Viertel der qualifizierten delisteten Reihen nur wegen des Wochentags ihres
  letzten Handels aus. F1w/F1d zeigen, wie die Ergebnisse mit diesen Reihen aussehen, und F1d zeigt, dass das Ergebnis nicht an der
  Umbenennung hängt.
- **Beweist nicht:** keinen Mehrwert einer Regel (keine SPY_EXCESS-Ablehnung in keinem Frame); keine bessere Regel als F1 (keine
  Ersetzung, keine Standardregel); nichts über Delistings vor 2010, die 209 CA_UNRESOLVED-Reihen oder echte Übernahme-Gegenleistungen
  (weiter nur Szenarien); keine Bestätigung, da Historie und F1w-Zahlen vorher bekannt waren. Die zusätzlichen Holm-Ablehnungen
  (TREND_UP h 4/13 gegen Basisrate, negativ; NEW_52W_HIGH h 26 RAW_NET) sind Grenzfälle derselben Daten, keine neue Evidenz.

## Reproduktion

```bash
P=<scratchpad>
for f in F1d F1w F1 F0; do node --max-old-space-size=8192 scripts/quant/v13b/f1w/run.cjs --frame $f; done   # privat: $P/v13b-f1w/private/<frame>
node scripts/quant/v13b/f1w/assemble.cjs                                                                      # -> results-2.0.0.json
python3 -I scripts/quant/v13b/f1w/verify_v13b_f1w.py $P/v13-studies/private $P/v13b-f1w/private . $P/v13-private/series docs/quant-recovery/v13b/f1w/python-check-2.0.0.json
node --test quant/tests/v13b-f1w.test.mjs
```

F1w, F1 und F0 nutzen die privaten V13-Läufe (`v13-studies/private`, keine Kopie). Laufzeit F1d 710 s (Signalstudie 562 s),
F1w-Nachlauf 139 s, F0/F1 je ~45 s.

**Unabhängige Python-Prüfung:** [`python-check-2.0.0.json`](python-check-2.0.0.json) – **PASS**, 14.266 Prüfungen, 0 Fehler, 120 p-Werte (F1d, beide Varianten) samt Holm, 269 s. Geprüft: F1d-Frame-Regel und Zählungen (gleiche Reihen wie F1w), alle F1d-S1-Zellen (V10-Semantik, Szenarien 0–2, Total-Return-Teilmenge), S2 vollständig, DG1, DG2 (inkl. Gleichheit der Modal-Datum-Werte mit V13), DG3 für alle vier Frames inkl. Universumsgröße der Engine. Signalregeln, Ausgangsstatus, Bootstrap und Holm aus der unabhängigen V10-Python-Referenz, Registerbindung und F1/F1w-Regel aus der V13-Python-Referenz.
