# V11 – Strang WINNERS: Anatomie außergewöhnlicher Gewinner

**Periode FULL_DESCRIPTIVE (Protokoll-Regel R4).** Der DISCOVERY-Strang darf diese Dateien und `scripts/quant/v11/winners/` nicht lesen. Protokoll `docs/quant-recovery/v11/protocol/time-split-1.0.0.json`, SHA-256 `1ff32b61…a69`. Alle Ergebnisse `NOT_CERTIFIED`, `productionApproved: false`. Es ist eine beschreibende Studie, keine Strategie und keine Quelle für Kandidatenregeln.

## Dateien

| Datei | Inhalt |
|---|---|
| [registration-1.0.0.json](registration-1.0.0.json) | Winner-Definition, Kohorten, Merkmale, Endpunkte, Inferenz – committet vor jeder Ergebnisberechnung (Hash `4aa432a0…`) |
| [registration-amendment-1.0.1.json](registration-amendment-1.0.1.json) | Nachtrag: Ersatzmerkmale P/S (`salesToMarketCap`) und Eigenkapitalquote (`equityToAssets`), weil EV/Sales und Nettoverschuldung nur für 2–9 % der Titel vorliegen. Vor jedem Winner-Merkmal-Vergleich committet; offengelegt, dass zu diesem Zeitpunkt die Verfügbarkeitszählung und die (ohnehin bekannte) NVDA-Forward-Rendite 2016-03 gesehen waren |
| [anatomy-results-1.0.0.json](anatomy-results-1.0.0.json) | Effektgrößen, Rang-AUC, Basisraten/Lift/Precision/Recall/False Positives, „Übersetzung“ in Rendite, Zwei-Seiten-Sicht, Splits nach SPY-Regime, Teilperiode, Zinsphase, Schranken-Sensitivität, gepoolte Profile |
| [case-studies-1.0.0.json](case-studies-1.0.0.json) | NVIDIA 2014-Q4…2024-Q4 und 8 systematisch gewählte Winner mit Zeitleiste, SEC-Akzession/Filed-Datum, Profil-Peers |
| [survivorship-gaps-1.0.0.json](survivorship-gaps-1.0.0.json) | Abdeckung je Kohorte gegen SEC-10-K-Melder, Ausgangszustände, Zensur |
| [python-check-1.0.0.json](python-check-1.0.0.json) | Unabhängige Python-Gegenrechnung (stdlib, `python3 -I`) |

Skripte: `scripts/quant/v11/winners/` (`registration.cjs`, `lib.cjs`, `build.cjs`, `analyze.cjs`, `verify_winners.py`); Test `quant/tests/v11-winners.test.mjs`.

## Design (kurz)

- **Population:** V10-Studienframe mit `{identityEvidence, corporateActionEvidence, listingLifecycleEvidence}` → 4.329 Listings. Mitglied einer Kohorte ist, wer am Stichtag t einen Wochenschluss hat und ≥ 52 lückenlose Vorwochen (IPO-Jahr ausgeschlossen und gezählt).
- **Kohorten:** 96 Quartalsstichtage 2001-Q1 … 2024-Q4. Horizonte 1/3/5 Jahre (52/156/260 Wochen), Einstieg Schluss der Folgewoche. Reif: 1Y 96 Kohorten (210.471 Mitglied-Beobachtungen), 3Y 91 (191.908), 5Y 83 (164.462).
- **Klassen je Kohorte und Horizont:** Winner = Top 1 % bzw. Top 5 % der Forward-Kursrendite; Verlierer = unterstes Dezil oder delistet ohne Abfindung; Durchschnitt = Q2–Q4. Barabfindung als Endwert, sonst zensiert (primär letzter Kurs, Sensitivität −100 %).
- **Merkmale nur mit damaligem Wissen:** 10 Kursmerkmale ab 2001 (Wochenschlüsse bis t); 16 Fundamentalmerkmale ab 2011 aus den PIT-Dokumenten des V10-Faktorstrangs (`filed < t`) über `fundamental-inputs.compute` unverändert, Marktkapitalisierung über `factors.cjs#marketCapAt` (ADR-002).
- **Inferenz:** je Kohorte eine Kennzahl, Blockbootstrap über Kohortendaten (`inferTemporalBlockMean`, Blocklänge 4/12/20 Quartale), Holm über 156 AUC-Tests bzw. 156 Effekt-Tests.
- **Renditebasis:** Kursrendite (Aktien und SPY, gleiche Daten); Klassen sind Querschnittsränge, Kosten (10 + 5 bps) ändern sie nicht. Keine Portfolio- oder Investitionsannahme. Alle Unterschiede sind **beobachtet**; die Intervalle beschreiben Unsicherheit, sie belegen keine handelbare Überrendite.

## Befunde

### 1. Gewinnerrenditen sind extrem schief – der Durchschnitt ist eine Tail-Größe

Ein Top-1-%-Winner brauchte im Median +181 % in 1 Jahr, +425 % in 3 Jahren, +636 % in 5 Jahren; Top 5 %: +87 %, +191 %, +283 %. Die 5 % Winner liefern im Median **41 % (1Y) bis 47 % (5Y) der gesamten gleichgewichteten Kursgewinne** ihrer Kohorte. Ohne sie fällt das gleichgewichtete 1Y-Mittel von 15,2 % auf 6,2 %; der Median-Titel (6,8 %) liegt unter SPY (8,8 %), und in 57 % (1Y) bzw. 68 % (3Y) der Kohorten schneidet die Median-Aktie schlechter ab als SPY. Wer nicht zufällig die wenigen Winner hält, hat den Index schwer zu schlagen – unabhängig von jedem Merkmal.

### 2. Was Winner vorher auszeichnete: Streuung, nicht Qualität

Mit Abstand am stärksten trennen Winner von der Durchschnittsgruppe Merkmale, die **Unsicherheit** messen:

| Merkmal (3Y, Top 5 %) | Rang-AUC* | Lift auf der angereicherten Seite | Verlierer-Lift dort |
|---|---|---|---|
| hohe Volatilität (52 W) | 0,72 | 2,17 (höchstes Quintil) | 2,42 |
| tiefer Drawdown | 0,68 | 2,02 | 2,27 |
| geringe Größe (PIT-Marktkap.) | 0,64 | 1,71 | 2,14 |
| weit unter dem 52W-Hoch | 0,63 | 1,85 | 2,17 |
| niedrige operative Marge | 0,62 | 1,82 | 2,54 |
| negative/niedrige Earnings Yield (Verluste) | 0,63 | 1,91 | 2,59 |
| niedrige ROA/ROE | 0,61 | 1,84 | 2,72 |

\* AUC in Richtung des Merkmals, das die Winner tragen (1 − registrierte AUC, wo die registrierte Richtung umgekehrt ist).

Winner kamen also überproportional aus kleinen, volatilen, verlustreichen, stark gefallenen Titeln – und **genau dieselben Merkmale reichern Verlierer mindestens ebenso stark an**: Das Verhältnis Winner-Lift zu Verlierer-Lift liegt für diese Gruppe bei 0,67–1,0 (bei Fundamentaldaten 0,54–0,74, d. h. Verlierer werden *stärker* angereichert). Diese Merkmale sagen „große Bewegung“, nicht „Richtung“. Im Hochvolatilitätsquintil liegt das gleichgewichtete Mittel deshalb über der Population (3Y +26 Pp), der **Median aber darunter (−8 Pp)** – ein Lotterieprofil. Und dieses Mittel ist nach oben verzerrt, weil die Population die Verlierer-Seite systematisch unterrepräsentiert (Abschnitt 6).

### 3. Momentum und Trendqualität: U-Form statt Vorsprung

Hohes 12-1-Momentum enthält mehr Winner als der Durchschnitt (Lift 1,18–1,26), **niedriges Momentum aber noch mehr** (1,56–1,75), und Verlierer sitzen ebenfalls an beiden Enden. Die AUC für Momentum liegt deshalb leicht unter 0,5 (0,45–0,46). „Nähe zum 52W-Hoch“ und „Anteil Wochen über der 40W-Linie“ zeigen das deutlicher: Winner waren beim Start im Mittel weiter vom Hoch entfernt und seltener über der 40W-Linie als Durchschnittstitel. Die einzige glatte Trendgröße mit positiver Tendenz ist R² des Log-Trends (AUC 0,52, Lift ≈ 1,1–1,2, Verlierer ≈ gleich) – praktisch ohne Trennschärfe. Relative Stärke gegenüber SPY ist im Querschnitt eine monotone Transformation des 12-1-Momentums und liefert identische Ränge.

Das erklärt die V10-Befunde: NEW_52W_HIGH und Momentum zeigen kleine positive Basisraten-Überschüsse bzw. Rang-ICs, aber die außergewöhnlichen Gewinner kommen überwiegend **nicht** aus dem Top-Momentum-Segment, sondern aus Erholungen.

### 4. Wachstum und Bewertung: schwache, teils richtungsfeste Signale

- **Umsatzwachstum** (TTM, 3J-CAGR) ist das am ehesten „qualitative“ Winner-Merkmal: Top-Quintil-Lift ≈ 1,5, AUC 0,51–0,58 (3J-CAGR 5Y: 0,576, nach Auflösungs-Sensitivität Holm-signifikant). Aber Verlierer werden dort gleich stark angereichert (Lift 1,6–1,7): Wachstumsfirmen streuen.
- **Günstige Bewertung auf Umsatzbasis** (hohes Umsatz/Marktkap., Ersatz für EV/Sales) ist eines der wenigen Merkmale, bei denen Winner-Lift (1,4–1,6) den Verlierer-Lift (0,85–1,13) übersteigt; das Top-Quintil liegt im Mittel über der Population (3Y +17 Pp), im Median nur +4 Pp. EV/Sales selbst (nur 32–45 Kohorten, ~100 Titel je Kohorte) zeigt dasselbe stärker, ist aber wegen der Abdeckung nicht belastbar.
- **Bruttomarge, EPS-Wachstum, Buch/Markt**: Winner-Lift 1,1–1,5, Verlierer-Lift ähnlich oder knapp darunter; AUC 0,48–0,55. Keine nennenswerte Trennschärfe.
- **Rentabilität/Qualität (operative Marge, ROA, ROE, FCF-Marge, Earnings Yield)** trennt Winner *negativ*: profitable Titel stellen weniger Winner, aber vor allem viel weniger Verlierer (Verlierer-Lift im niedrigsten Quintil 2,3–2,7). Profitabilität ist ein Schutz- und kein Gewinnermerkmal.
- Niedrige Accruals (Merkmal mit registrierter Richtung „niedriger besser“, AUC 0,56–0,58) markieren hier überwiegend Verlustfirmen mit operativem Cashflow über dem Ergebnis – und reichern Verlierer gleich stark an (Lift 1,8–1,9).

### 5. Warum Merkmale nicht in Überrendite übersetzen

1. **Basisraten sind winzig, die False-Positive-Quote riesig.** Selbst das beste Einzelmerkmal hebt die Winner-Quote im Quintil von 5 % auf 10–13 %; **87–99 % der Merkmalsträger werden keine Top-5-%-Winner**, beim Top-1-%-Ziel 97–99,9 %. Precision Top 1 % liegt höchstens bei 0,5–3 %.
2. **Zwei-Seiten-Anreicherung.** Was Winner anreichert, reichert Verlierer fast immer gleich stark an (Abschnitt 2). Ein gleichgewichtetes Portfolio solcher Titel erbt beide Enden; der Median-Titel liegt unter der Population.
3. **Das Mittel lebt von wenigen Ausreißern, die man nicht vorher kennt.** Im Hochvolatilitätsquintil hängt die positive Mitteldifferenz an einer Handvoll Winner; ohne sie kehrt sie sich um.
4. **Instabilität über Phasen.** Z. B. Umsatz/Marktkap.-Top-Quintil 3Y: +46 Pp (2020–25), +3 Pp (2013–19); Umsatzwachstum: AUC 0,58 (2013–19), 0,46 (2020–25); Momentum-AUC 0,35 in negativen SPY-Trendphasen, 0,49 in positiven; in Phasen fallender Zinsen (10J-Rendite −0,5 Pp und mehr in 52 W) sind Winner noch stärker Erholungstitel (AUC Nähe 52W-Hoch 0,32).
5. **Survivorship verschönert genau die Lotterie-Merkmale** (Abschnitt 6) – die tatsächliche Verlierer-Seite ist schlechter, als sie hier aussieht.

**Gepoolte Profile (post hoc, nicht registriert, deskriptiv):**
- „Quality-Growth-Momentum“ (Top-Quintil 12-1-Momentum, Umsatzwachstum TTM und operative Marge – das NVIDIA-Profil 2016/2017 und 2024): 1,7 % der Titel; Top-5-%-Quote 6,6 % (1Y) / 7,2 % (3Y) / 8,2 % (5Y) gegenüber 5 %; Verlierer 8–10 % (Basis 10 %); 92–93 % der Profilträger keine Winner; Mitteldifferenz zur Population −4,2 / −2,3 / +4,2 Pp, alle Intervalle schließen 0 ein.
- „Distressed Rebound“ (höchste Volatilität, tiefster Drawdown, weit unter Hoch): 10–11 % der Titel; Top-5-%-Quote 11–13 %, Top-1-% 3,5–4,1 %, aber Verlierer-Quote 27–29 %; Mitteldifferenz +15 / +30 / +51 Pp (Intervall ohne 0), Mediandifferenz −4 / −11 / −12 Pp. Die positive Mitteldifferenz ist das Produkt der Schiefe und der fehlenden Pleiten im Frame, keine belegte Überrendite.

### 6. Survivorship-Lücke (je Kohorte in survivorship-gaps-1.0.0.json)

Kohortenmitglieder je SEC-10-K-Melder (Größenordnung, enthält OTC): 2001 15 %, 2005 17 %, 2009 19 %, 2013 25 %, 2017 34 %, 2021 42 %, 2023 49 %. Im Frame sind nur 121 beendete Reihen (19 SEC-belegt: 5 Barfusionen, 5 Aktienfusionen, 2 ohne Abfindung, 7 unbekannt; 102 unbelegt eingefroren und zensiert). Für alle Kohorten bis 2019 sind **sämtliche** 3Y-Ausgänge „beobachtet“ – es gibt in der Population vor 2020 faktisch keine Delistings. Die Verlierer-Klasse ist damit relativ definiert (unterstes Dezil der Überlebenden), nicht die echte Verlierer-Seite des Marktes. Extreme Gewinner sind dagegen vollständig enthalten (sie überleben). Folge: Lift- und Mittelwerte für Lotterie-Merkmale sind nach oben, Verlierer-Lifts nach unten verzerrt. Zensur-Schranken: Zwischen „letzter Kurs“ und „−100 %“ ändern sich 0 Top-1-%-, 2–14 Top-5-%- und 242–529 Verlierer-Zuordnungen; keine Holm-Entscheidung ändert sich.

### 7. Inferenz und Mehrfachtest – offen berichtet

Registriert waren 1.999 Bootstrap-Replikate. Der kleinste erreichbare p-Wert ist damit 1/2000; Holm über 156 Tests kann nie unter 0,078 fallen → **registrierte Familie: 0/156 Ablehnungen (strukturell)**. Post hoc, offengelegt und nicht registriert: dieselben Zeilen mit 99.999 Replikaten → AUC 85/156, Effekt Winner−Durchschnitt 90/156 Holm-Ablehnungen. Die Ablehnungen betreffen fast ausschließlich die Streuungs-/Größen-/Verlust-Merkmale (Abschnitt 2) und das Momentum gegen Top-1-%-Winner (mit AUC < 0,5), dazu EV/Sales (geringe Abdeckung) und Accruals. Unter den „Qualitäts“-Merkmalen erreicht nur die 3J-Umsatz-CAGR beim 5Y-Horizont (beide Winner-Definitionen) bzw. 3Y-Effekt Top 5 % eine Ablehnung. Für 5Y gibt es nur ≈ 4 unabhängige Blöcke; diese Intervalle sind breit.

## Fallstudien (case-studies-1.0.0.json)

### NVIDIA (ref_NVDA, CIK 0001045810)

Fundamentaldaten je Stichtag mit Akzession und Filed-Datum des TTM-Umsatzes (z. B. 2016-03-24 → 10-K `0001045810-16-000205`, filed 2016-03-17; 2019-03-29 → `0001045810-19-000023`, filed 2019-02-21; 2022-12-30 → 10-Q `0001045810-22-000166`, filed 2022-11-18).

- **Vor dem Anstieg 2016 (Stichtage 2015-Q2/Q3):** unauffällig. 2015-06: 12-1-Momentum +20 % (Perzentil 0,79), 88 % des 52W-Hochs, Umsatzwachstum +11 % (0,66), operative Marge 17 % (0,78), Marktkap. im obersten Fünftel, Volatilität im Mittelfeld. In keinem der vier Profilmerkmale im Top-Quintil – keine Regel auf diesen Merkmalen hätte NVDA gegenüber 2.197 Titeln hervorgehoben. Danach: 1Y +129 % (Top 1 %), 3Y +1.060 %.
- **2016-03 (Anstieg läuft):** Momentum-Perzentil 0,98, am 52W-Hoch, aber Umsatzwachstum nur +7 % (0,63), Earnings Yield 3,3 % (0,43). Gleiches Profil (Top-Quintil Momentum + Nähe Hoch) hatten **238 Titel**; deren 3Y-Mittel +42 %, Median +32 % (Kohortenmedian +25 %, SPY +37 %), Top-5-%-Quote 3,4 % (unter der Basis 5 %), 230 von 238 keine Winner.
- **2016-12 bis 2018-09 (Quality-Growth-Momentum):** Momentum, Wachstum (+26 % … +53 %) und Marge (24–37 %) alle im Top-Quintil; nur 11–28 Profil-Peers, Top-5-%-Quote der Peers 9–27 % (klein n). NVDA selbst: ab 2017-Q4 1Y-Renditen −11 % … −37 %.
- **Vor dem Anstieg 2019/2020 (2018-12, 2019-03):** nach dem Krypto-Einbruch Momentum −16 % / −32 % (Perzentil 0,31 / 0,11), 48–64 % des 52W-Hochs, Marge weiter top (0,95–0,97). Profil = nur Marge top; **279 Peers**, deren 3Y-Mittel +46 %, Top-5-%-Quote 2,9 %. NVDA: 3Y +765 % bzw. +460 % (Top 1 %).
- **Vor dem KI-Anstieg 2023 (2022-09, 2022-12):** Momentum −34 % / −43 %, 37–53 % des 52W-Hochs, Umsatzwachstum TTM +18 % (Perzentil 0,58, fallend), Marge 21 % (0,84). Profil = Marge; **358 Peers**, Top-1-%-Quote 0,3 %, Top-5-% 2,8 %. NVDA: 1Y +230 % / +279 %, 3Y +1.171 % / +1.453 %. Das Umsatzwachstum, das den Anstieg erklärt, wurde erst nach dem Start berichtet (2023-12: +57 %, 2024: +126 … +208 %).
- **2024 (alle Profilmerkmale extrem):** 1Y nur +7 % … +50 %, kein Winner.

Fazit NVDA: Vor den großen Anstiegen sah NVDA wie ein profitabler Großwert in einer Kursschwäche aus – ein Profil, das Hunderte Titel teilten und das im Schnitt nicht auffällig lief. Die „offensichtlichen“ Wachstums- und Momentumwerte lagen erst vor, als der Anstieg bereits lief bzw. vorbei war.

### Systematisch gewählte Winner (höchste 3Y-Forward-Rendite je Teilperiode, NVDA ausgenommen)

| Teilperiode | Titel | Stichtag | 3Y | Profil am Stichtag |
|---|---|---|---|---|
| 2000–07 | ECPG | 2001-12-28 | +9.046 % | Vol 117 % (Perzentil 0,03), 29 % des 52W-Hochs, keine PIT-Fundamentaldaten (vor 2011) |
| 2000–07 | MNST | 2003-06-27 | +8.720 % | unauffällig: Momentum +1 %, Vol 31 %, 95 % des Hochs |
| 2008–12 | MITK | 2009-03-27 | +11.500 % | Vol 300 %, −56 % Momentum; Wochenbewegung 3,1× (2008-08) → Quellprüfung empfohlen (`EXTREME_WEEKLY_MOVE_CHECK_SOURCE`) |
| 2008–12 | SNBR | 2008-12-26 | +8.307 % | −95 % Momentum, 3 % des Hochs (Krisentief) |
| 2013–19 | ENPH | 2017-12-29 | +7.004 % | Momentum +187 % (0,99), Vol 94 %, kleine Marktkap. (0,18), Verlust (Earnings Yield −27 %) |
| 2013–19 | GRVY | 2016-03-24 | +4.084 % | unauffällig, im Frame keine PIT-Fundamentaldaten verfügbar |
| 2020–25 | CVNA | 2022-12-30 | +8.976 % | −97 % Momentum, 3 % des Hochs, Vol 146 %, Umsatzwachstum +33 % |
| 2020–25 | DAVE | 2023-06-30 | +6.930 % | −74 % Momentum, 21 % des Hochs, Umsatzwachstum +37 % (0,86) |

Sechs von acht Fällen sind Erholungen aus extremer Schwäche (Distressed Rebound) oder Hochvolatilitäts-Kleinwerte; zwei waren am Stichtag unauffällig. Das Distressed-Rebound-Profil teilten jeweils ≈ 10 % aller Titel, davon wurden 27–29 % Verlierer (Abschnitt 5). Die Reihen sind split-bereinigt (heutige Faktoren), die Kurse in heutigen Einheiten; ein Penny-Stock-Merkmal ist daraus nicht ableitbar.

## Python-Gegenrechnung

`python3 -I scripts/quant/v11/winners/verify_winners.py <privat> <pit-docs> <out>`: Mitgliedschaft 96/96 Kohorten identisch (210.472 Zeilen), 2.104.720 Kursmerkmale 0 Abweichungen (rel. 1e-9), 566.841 Rendite- und Klassenzuordnungen 0 Abweichungen, 2.184 Lift-Kennzahlen 0 Abweichungen → **PASS**. Fundamental-Stichprobe (400 Zeilen, 543 Vergleiche einfacher TTM-Quoten aus den PIT-Dokumenten): 99,8 % Übereinstimmung, 1 Abweichung (Quartalssummierung der Engine) gelistet. Offenlegung: Der erste Lauf meldete FAIL – 198 `shareAbove40w`-Werte wegen exakter Gleichstände Schlusskurs = 40W-Linie (Python summiert kompensiert, JS naiv; „>“ kippt) und 81 Rundungsvergleiche (JS-Export auf 1e-6 gerundet). Die Toleranzregeln sind in der Datei beschrieben (630 Gleichstände akzeptiert); kein Ergebnis wurde geändert. Die Loader-Qualifikation ist Eingabe, nicht nachgerechnet. Eine zweite Sprache ist kein Holdout.

## Reproduktion

```bash
node scripts/quant/v11/winners/build.cjs --private <scratchpad>/v11-private/winners      # ~2 min, 1,4 GB
node scripts/quant/v11/winners/analyze.cjs --private <…>/winners --out docs/quant-recovery/v11/winners   # ~3 min
python3 -I scripts/quant/v11/winners/verify_winners.py <…>/winners <…>/v10-private/factor/docs docs/quant-recovery/v11/winners/python-check-1.0.0.json   # ~1,5 min
node --test quant/tests/v11-winners.test.mjs
```

Keine SEC-Abrufe (nur vorhandene PIT-Dokumente), keine Datei unter `*/data` geändert.

## Grenzen

Survivor-lastige Population (Abdeckung 15–49 % der 10-K-Melder); Kursrendite ohne Dividenden; Fundamentaldaten erst ab 2011, Banken/Versicherer/REITs ohne Margen-/Bewertungsmerkmale, Mehrfach-Listings und Auslandswährungsmelder ohne Marktkap.; Fiskalkalender der PIT-Dokumente aus heutigem Stand (V10-Grenze); überlappende Kohorten mit wenigen unabhängigen Blöcken; 2000–2025 ist durch V7–V10 bekannte Historie. Regime/Zinsphase sind nachlaufend gemessen (SPY 26 W, 10J-Rendite 52 W), aber als Teilmengenbeschreibung, nicht als Signal.
