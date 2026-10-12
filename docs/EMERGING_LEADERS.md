# Emerging Leaders – Forschungsgrundlage, Studie, Ergebnis

Stand: 12.10.2026 · Methodik `emerging-leaders-1.0.0` · Studie `quant/data/product/emerging-leaders-v1/study.json`
(Lauf 38235945355, Commit b5cc903) · **Evidenzstatus: EXPERIMENTAL**

## Kurzfassung

Die Engine sollte Aktien finden, deren Marktführerschaft *gerade beginnt*: beschleunigende relative Stärke,
Trendwende, Akkumulation, Volatilitätskompression, fundamentale Beschleunigung. Alle Regeln standen vor dem ersten
Ergebnis in der Vorregistrierung (`quant/methodology/emerging-leaders-v1.json`). Die Point-in-Time-Studie über
2008–2026 (Überlebende **und** delistete Listings) findet **keinen belastbaren Nachweis eines Mehrwerts** gegenüber
einfachem Momentum, relativer Stärke oder SPY. Das ist fehlende Evidenz, kein Beweis, dass die Modelle schlechter
sind (26 Validierungs-Stichtage, geringe Teststärke):

- Auf der Validierungsperiode (2021–06/2023) erfüllte kein Modell die vorab festgelegte Auswahlregel
  (Rang-IC h=63 Newey-West-t ≥ 2). Höchster Wert: t = 0,51 (M3). Kein Modell wurde gewählt.
- Damit ist die Engine nach Vorregistrierung **EXPERIMENTAL**. Die Holdouts werden nur beschreibend berichtet; sie
  bestätigen das Bild (kein Modell schlägt Momentum oder SPY nach Kosten).
- Nach Einsicht in die Holdouts wurde nichts an Faktoren, Gewichten oder Schwellen geändert.

## 1. Forschungsgrundlage (Evidenzklassen)

| Baustein | Klasse | Quelle / Stand |
|---|---|---|
| Querschnitts-Momentum (12-1) | wissenschaftlich | Jegadeesh/Titman 1993; Carhart 1997; Asness/Moskowitz/Pedersen 2013 |
| Nähe zum 52-Wochen-Hoch | wissenschaftlich | George/Hwang 2004 |
| Gewinnwachstum, Post-Earnings-Drift, Profitabilität | wissenschaftlich | Bernard/Thomas 1989; Novy-Marx 2013 |
| Volumen × Momentum | gemischt | Lee/Swaminathan 2000 |
| Trend Template, VCP, Stage 2 | Praktiker | Minervini, Weinstein – keine systematischen Belege für die Gesamtregel |
| CAN SLIM, Darvas-Box, Wyckoff-Akkumulation | Praktiker | O'Neil, Darvas, Wyckoff – Fallbeispiele, keine Out-of-Sample-Prüfung |
| Beschleunigung der RS, Verbesserung aus schwachem Rang, „Emerging“-Population | VU-Hypothese | in dieser Studie erstmals geprüft |

## 2. Architektur

- `quant/engines/emerging-leaders.js`: Merkmale je Titel/Tag (jeder Zugriff nach t wirft `LOOK_AHEAD`), Querschnitt,
  Gruppen A–E, Modelle M1–M4, Baselines, sechs objektive Zustände, Statistik.
- `scripts/quant/lib/emerging-leaders-inputs.mjs`: gemeinsame Aufbereitung für Studie und Tageslauf
  (Splitfaktoren nur aus `return-series.js`, PIT-Fundamentaldaten, Leadership-Nachbildung).
- `scripts/quant/build-emerging-leaders-study.mjs` + `.github/workflows/emerging-leaders-study.yml`: Studie auf der
  kanonischen Historie (R2), nur Aggregate im Repository.
- Discover-Bereich `#/leader` und Tageslauf liegen in einem eigenen PR und sind **nicht** freigeschaltet (siehe 8).

## 3. Faktoren, Modelle, Zustände

Gruppen (Querschnittsperzentile, gleichgewichtet): A relative Stärke (Beschleunigung, Verbesserung, RS 1M),
B Trendwende (SMA50-Steigungswechsel, Start über SMA200, SMA20/50), C Volumen (Auf-/Ab-Volumen, Akkumulationstage,
relatives Volumen), D Kompression (Schwankungsverhältnis, Bollinger-Perzentil, Spannenverhältnis, Pivot-Nähe),
E Fundamental (Umsatzbeschleunigung, -wachstum, Margenänderung, FCF-Marge; nur Jahreswerte, filed ≤ t),
F Marktkontext (Regime, Breite; nur Bedingung).

Korrelationskontrolle in DEVELOPMENT: keine Gruppenkorrelation > 0,7 (höchste A–B 0,52) → keine Zusammenlegung.
M3-Gewichte aus DEV-IC: A 0, B 0,10, C 0,12, D 0,09, E 0,68 – eingefroren.

Zustände (S5→S1, erster Treffer gilt): Etablierter Leader, Ausbruch bestätigt, Ausbruchskandidat, Momentum
entsteht, Frühe Akkumulation. Definitionen wörtlich in der Vorregistrierung; keine Wahrscheinlichkeiten.

## 4. Daten und Abdeckung

| Periode | Stichtage (h=63) | zulässige Titel je Stichtag | Quelle |
|---|---|---|---|
| DEVELOPMENT 2016–2020 | 57 | 2.082 | heutige Titel + 1.464 delistete Listings |
| VALIDATION 2021–06/2023 | 26 | 2.406 | dto. |
| HOLDOUT_RECENT 07/2023–09/2026 | 36 | 2.484 | dto. |
| HOLDOUT_EARLY 2008–2015 | 93 | 1.653 | volles Universum 2007–2015 (4.560 Überlebende, 714 beendete Listings) |

454.393 Beobachtungen aus 8.517 Listings. 208 Doppelhistorien (Kürzelwechsel) und 39 Kopien delisteter Reihen
verworfen. Nicht abrufbar: Alt-Listings neu vergebener Kürzel (Klasse D, 178 + 172).
Universum: US-Stammaktien, Rohkurs ≥ 5 USD, Dollarumsatz 20 T ≥ 5 Mio. USD am Stichtag.

## 5. Ergebnisse (Primärhorizont 63 Handelstage, Topdezil, Überrendite gegen SPY)

Netto = nach 0,30 % Kosten je Umschlag. „vs. Universum“ = Topdezil minus alle zulässigen Titel desselben Stichtags
(t nach Newey-West).

| Periode | M1 netto (t) | M3 netto | M4 netto | Momentum 12-1 netto (t) | RS 6M netto | M1 vs. Universum (t) | Momentum vs. Universum (t) |
|---|---|---|---|---|---|---|---|
| DEVELOPMENT | −0,05 % (−0,07) | −0,16 % | −0,54 % | +1,20 % (1,08) | +1,32 % | +0,44 % (0,83) | +1,69 % (1,79) |
| VALIDATION | −3,60 % (−3,17) | −3,30 % | −2,95 % | −4,80 % (−2,29) | −4,91 % | −0,66 % (−0,80) | −1,87 % (−1,13) |
| HOLDOUT_RECENT | −2,43 % (−1,79) | −1,55 % | −2,54 % | +0,62 % (0,35) | −0,52 % | −0,93 % (−0,86) | +2,12 % (1,40) |
| HOLDOUT_EARLY | −0,21 % (−0,36) | −0,18 % | −0,33 % | −0,53 % (−0,50) | −0,73 % | −0,32 % (−0,98) | −0,65 % (−0,65) |

Zufalls-Baseline (200 Ziehungen) liegt jeweils auf dem Universumsmittel; das gleichgewichtete Universum selbst liegt
2016–2026 unter SPY (Großwerte-Dominanz).

## 6. Getrennte Antwort: Mehrwert gegenüber Momentum, RS und SPY?

**Signalqualität** (Rang-IC und Fama-MacBeth, h=63): Kein Modell hat in irgendeiner Periode einen IC mit t ≥ 2
(Spanne −0,025 bis +0,025). Fama-MacBeth gegen Momentum und Leadership: kein Modell mit t ≥ 2; im
HOLDOUT_RECENT sind M1/M2 signifikant *negativ* (t −2,3 / −2,4). Die Zustände trennen nicht: keine benachbarte
Zustandsdifferenz ist in mehr als einer Periode signifikant, Vorzeichen wechseln. → **kein Mehrwert**.

**Forward Returns** (Topdezil gegen SPY und gegen Universum, 21/63/126/252 Tage): Kein Modell schlägt in einer
Periode das Universum mit t ≥ 2 beim Primärhorizont; Momentum und RS liegen in DEV und HOLDOUT_RECENT vorn
(HOLDOUT_RECENT h=126: Momentum +6,1 % vs. Universum, t 3,5; M1 +0,2 %, t 0,2). Einzelne positive Werte (M4,
h=252, VALIDATION: +3,7 % vs. Universum, t 2,9) sind Nebenhorizonte mit 17 Stichtagen unter rund 64 Vergleichen
und nicht bestätigt (HOLDOUT_RECENT +1,6 %, t 0,7; HOLDOUT_EARLY −1,2 %). → **kein Mehrwert**.

**Investierbares Portfolio** (monatlich umgeschichtetes Topdezil, nicht überlappend, Kosten = Umschlag × 0,30 %;
aus den h=21-Aggregaten abgeleitet, Information Ratio ≈ t·√(12/n)):

| Periode | M1 netto p.a. vs. SPY | M3 | M4 | Momentum 12-1 | RS 6M | Universum |
|---|---|---|---|---|---|---|
| DEVELOPMENT | −2,6 % | −2,3 % | −5,3 % | +5,0 % | +2,5 % | +0,6 % |
| VALIDATION | −21,1 % | −15,3 % | −20,6 % | −21,9 % | −20,6 % | −10,3 % |
| HOLDOUT_RECENT | −2,9 % | −3,3 % | −7,5 % | +2,9 % | −0,5 % | −6,7 % |
| HOLDOUT_EARLY | −6,1 % | −3,5 % | −6,9 % | −1,3 % | −2,2 % | +1,2 % |

Umschlag je Monat: M1 77 %, M3 63 %, M4 78 % gegenüber Momentum 30 %. Das Topdezil teilt nur 9–14 % seiner Titel mit
dem Momentum-Dezil – es ist eine eigene, aber keine bessere Auswahl. Dass fast alles unter SPY liegt, teilt auch
das gleichgewichtete Universum (Großwerte-Dominanz, Kursrendite ohne Dividenden); der Maßstab für Können ist die
Differenz zum Universum, und die liegt bei rund 0. Diese Portfolio-Sicht ist beschreibend und nicht vorregistriert.
→ **kein belastbarer Mehrwert**.

**Statistische Belastbarkeit (Review 3):** Die Newey-West-Regel (Lag ⌈h/21⌉−1) lehnt bei wenigen Stichtagen zu oft
ab. Simulation unter der Nullhypothese mit derselben Überlappung:

| Horizont | Stichtage | Anteil |t| ≥ 2 unter H0 | wahrer 97,5-%-Wert |
|---|---|---|---|
| 21 | 28 | 6,2 % | 2,10 |
| 63 | 26 | 16,5 % | 2,97 |
| 126 | 23 | 26,8 % | 4,79 |
| 252 | 17 | 52,6 % | 12,5 |

Alle scheinbar positiven Befunde (t ≥ 2) liegen bei h ≥ 126 und sind kein Nachweis; bei h=21 und h=63 gibt es keinen.
Die Auswahlregel t ≥ 2 war damit eher zu großzügig – und trotzdem qualifizierte sich kein Modell.

**Fazit:** Emerging Leaders liefert in dieser Fassung keinen belastbaren Nachweis eines zusätzlichen Mehrwerts
gegenüber Momentum, relativer Stärke oder SPY – weder als Signal noch in den Forward Returns noch als
investierbares Portfolio. Bei h=63 liegen die Modelle in VALIDATION und HOLDOUT_EARLY knapp und nicht signifikant
vor Momentum/RS, im HOLDOUT_RECENT dahinter.
Die Engine bleibt **EXPERIMENTAL** und wird nicht als Prognosemodell freigegeben.

## 7. Reviews und Integrität

Drei unabhängige Prüfrunden (Look-ahead, Survivorship, Leakage, Holdout, Statistik). Behobene Befunde vor dem
gewerteten Lauf u. a.: verlorene Delisting-Renditen über heutige Reihen, still verworfene Lesefehler, Doppelzählung
delisteter Kopien, veraltete Reihen als Schein-Delisting, SPY-Eintrittsausrichtung, Fundamentaldaten in
Technik-Gruppen. Lauf 1 wurde vor jeder Auswertung abgebrochen (Protokolle ungelesen). Der gewertete Lauf trägt
Code-Fingerabdruck und Laufprotokoll (`runs`, `holdoutEvaluations` = 1).

Review 3 (Abschluss, nach dem gewerteten Lauf): Point-in-Time-Integrität, Holdout-Unabhängigkeit und Modellwahl
bestanden; Delisting-Logik bestanden; keine Fehler, die das Ergebnis ändern könnten. Offene Grenzen: unentdeckte
Kürzelwechsel bei abweichender letzter Kerze (verzerrt alle Auswahlen gleich), HOLDOUT_EARLY mit wenigen beendeten
Listings (714 gegen 4.560 Überlebende; Delisting-Anteil 1,2 % gegen 3–4 % 2016–2026, wahrscheinlich nach oben
verzerrt, nur beschreibend), Laufprotokoll erfasst keinen Lauf, der schreibt, aber nicht pusht.

## 8. Grenzen

Kursrendite ohne Dividenden (Titel und SPY gleich); keine PIT-Sektoren; Größe über Dollarumsatz; Fundamentaldaten
nur für heutige Titel (M2/M3 2016–2026 nach oben verzerrt – trotzdem kein Mehrwert); Klasse-D-Listings fehlen;
Europa ohne Volumenreihen nicht abgedeckt; monatliches Raster mit überlappenden Fenstern (Newey-West);
Zustände tagesweise wechselhaft (Persistenz von Monat zu Monat: S4 3–6 %, S1 8–11 %, S5 48–55 %).

## 9. Empfehlung

- Discover-Bereich nicht freischalten (bestehende Discover-Produktion unverändert). Der vorbereitete PR bleibt
  Entwurf; eine spätere Freischaltung nur als klar gekennzeichnete, beschreibende Ansicht ohne Rangliste nach
  Modellwert – oder gar nicht.
- Kein Nachtuning auf den gesehenen Perioden. Eine neue Hypothese braucht eine neue Methodikversion mit eigener,
  noch ungesehener Prüfperiode (z. B. Live-Forward-Test ab 10/2026, vorregistriert).
- Was die Daten stützen: einfaches Momentum/RS war im Mittel besser – auch das ohne Signifikanz in allen Perioden.
