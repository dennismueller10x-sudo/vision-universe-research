# Quant V11 – Reverse Strategy Discovery & Alpha Attribution

Stand 28.10.2026. Forschungsauftrag des Owners: das wiederkehrende Ergebnis „kein belastbarer Vorteil gegenüber SPY“ nicht hinnehmen, sondern seine Ursachen zerlegen, die Anatomie außergewöhnlicher Gewinner untersuchen und neue, nachvollziehbare Regeln auf zeitlich getrennten Daten prüfen. Status: `NOT_CERTIFIED`, `productionApproved=false`, keine Gate-Änderung, keine Produktaktivierung, kein Merge.

Protokoll: [time-split-1.0.0.json](v11/protocol/time-split-1.0.0.json) (vor jeder Ergebnisberechnung committet, `fa8c460c4e`). Stränge: [Winners](v11/winners/README.md) · [Ursachenzerlegung](v11/decomposition/README.md) · [Discovery](v11/discovery/README.md) · Unabhängige Prüfung (unten).

## Antwort in fünf Sätzen

1. Der bisher beobachtete „Vorsprung“ der Signalregeln vor SPY ist überwiegend kein Signal-, sondern ein **Populationseffekt**: Die gleichgewichtete Survivor-Population des Anbieteruniversums lag 2000–2012 deutlich vor SPY; die eigentliche Auswahl (Signal minus Population derselben Woche) liegt bei −0,6 bis +0,5 Pp je 13 Wochen.
2. Außergewöhnliche Gewinner waren vorab vor allem **riskant** (hohe Volatilität, tiefer Drawdown, klein, weit unter dem Hoch) – dieselben Merkmale reichern Verlierer mindestens ebenso an; 87–99 % der Merkmalsträger wurden keine Top-5-%-Gewinner.
3. Keine der fünf V10-Regeln und keiner der 24 neu auf TRAIN entwickelten Kandidaten wählt die späteren Extremgewinner besser als der Zufall (Oracle-Lücke fast vollständig Auswahl; Zukunftsperzentile der gewählten Titel 0,46–0,54).
4. Auf VALIDATION hatten drei fundamental-kombinierte Qualitätsregeln beobachtete, aber **nicht abgesicherte** Überrenditen von +13 bis +17 % p. a.; die zwei eingefrorenen Hypothesen verloren in TEST 2021–2025 gegen SPY, die konzentrierte Qualitätsregel signifikant (−13,4 % p. a., Holm-p 0,037).
5. Unter den vorhandenen Daten sind die Tests strukturell schwach: nachweisbar wären erst Überschüsse von etwa 10–13 % p. a.; die Population enthält vor 2023 praktisch keine Delistings und deckt 2000 nur ≈ 14 % der damaligen 10-K-Melder ab.

## 1. Ursachenanalyse: warum die fünf Regeln SPY nicht belastbar schlagen

Beleg: [cause-matrix.json](v11/decomposition/cause-matrix.json), [decomposition-results.json](v11/decomposition/decomposition-results.json).

| Ursache | Befund | Größenordnung |
|---|---|---|
| **Benchmark/Population** | SPY-Überschuss = (EW-Population − SPY) + Auswahl − Kosten; der Populationsterm erklärt 103–215 % des Brutto-Überschusses bei vier Regeln; ab 2010 ≈ 0 | NEW_52W_HIGH 13 W: +1,07 = +0,87 + 0,51 − 0,31 Pp |
| **Auswahlqualität** | Signal minus Population derselben Woche: −0,6 … +0,5 Pp je 13 W, bei vier von fünf Regeln negativ; Oracle-Anteil −2 … +1 % | TREND_UP −0,59 Pp (einzig Holm-abgesichert, negativ) |
| **Einstieg** | Der Kursvorteil entsteht **vor** dem Signal (NEW_52W_HIGH +14,6 Pp ggü. SPY in den 4 Wochen davor); Verzögerung 0–4 Wochen ändert wenig | ±0,3 Pp |
| **Ausstieg/Haltedauer** | Event-Time-Kurve: NEW_52W_HIGH ggü. Population +0,5 Pp bis 52 W, −0,8 Pp bei 104 W; andere Regeln ab Woche 1 darunter; Trailing-Stops schaden | bis −2,7 Pp |
| **Gewichtung/Portfoliobau** | V10-Strategiepfad war ein günstiger von vielen: über 200 Zufalls-Tiebreaks Median-CAGR 14,5 % (NEW_52W_HIGH), 6,3 % (TREND_UP), 5,6 % (MOMENTUM_IMPROVED); Volatilitätsgewichtung schlechter; Cash-Drag unerheblich | NEW_52W_HIGH − EW-Index: +0,9 Pp (Median) |
| **Kosten** | Turnover 4,2–4,8×/Jahr, Kosten 1,3–1,4 % p. a.; Signifikanz der NEW_52W_HIGH-Strategie verschwindet ab ≈ 38 bps je Seite | Break-even 35–123 bps je Seite |
| **Renditedefinition** | Strategie und SPY: gleiche 1.370 Wochen, beide Kursrendite, split-bereinigt, Kosten nur Strategie (Python-Referenz bis 5,6e-15). SPY-Ausschüttungen 1,87 % p. a. (6 N-30D-Belege) vs. Signal-Titel 1,3–1,5 % → der Kursvergleich **begünstigt** die Regeln | 0,4–0,7 Pp p. a. |
| **Datenabdeckung** | Survivor-Universum (keine Delistings vor 2023 im Frame), Abdeckung 15–49 % der 10-K-Melder; der Populationsvorsprung 2000–2012 ist plausibel überwiegend Survivor-Konditionierung | nicht in Pp messbar |
| **Statistische Unsicherheit** | effektive Stichprobe 1–9 % der Ereigniszahl; Mindesteffekt bei 80 % Power (Holm 60) 9,5–13,1 % p. a. | alle 20 SPY-Zellen darunter |

Zeitverlauf: Der Rückgang des NEW_52W_HIGH-SPY-Überschusses (+5,1 → −0,7 Pp) geht zu ≈ 90 % auf den Populationsterm zurück; die Auswahl blieb in allen Teilperioden positiv – kein Effektverfall der Regel, sondern Wegfall eines Benchmark-Vorteils.

## 2. Anatomie außergewöhnlicher Gewinner (beschreibend, ganze Periode)

Beleg: [anatomy-results-1.0.0.json](v11/winners/anatomy-results-1.0.0.json), [case-studies-1.0.0.json](v11/winners/case-studies-1.0.0.json). 96 Quartalskohorten 2001–2024, 1/3/5 Jahre.

- **Schiefe:** Top 5 % liefern im Median 41–47 % aller gleichgewichteten Gewinne einer Kohorte; ohne sie fällt die 1-Jahres-EW-Rendite von 15,2 % auf 6,2 %; die Median-Aktie (6,8 %) liegt unter SPY (8,8 %).
- **Vorab trennende Merkmale** (3 J, Top 5 %): hohe Volatilität (AUC 0,72), tiefer Drawdown (0,68), kleine Größe (0,64), weit unter dem 52W-Hoch (0,63), Verluste/geringe Marge (0,61–0,63). Das Verhältnis Winner-Lift zu Loser-Lift liegt bei 0,54–1,0: **Dispersion, nicht Qualität**.
- **Momentum U-förmig**, Wachstum und Bewertung schwach, Profitabilität schützt eher vor Verlusten als dass sie Gewinner anzeigt.
- **NVIDIA:** vor 2016, 2019 und 2023 unauffällig bzw. profitabler Large Cap im Kursrückgang; 238–358 Titel teilten jeweils das Profil, ihre Top-5-%-Quote lag mit 2,8–3,4 % **unter** der Basisrate. Das starke Wachstum wurde erst nach Beginn des Anstiegs berichtet (SEC-Akzessionen im Beleg). 2024 waren alle Profilmerkmale extrem – NVIDIA war dann kein Gewinner mehr.
- Systematisch gewählte weitere Gewinner (ECPG, MNST, MITK, SNBR, ENPH, GRVY, CVNA, DAVE): 6 von 8 Erholungen aus extremer Schwäche oder volatile Small Caps.

## 3. Strategiehypothesen und ihre historischen Ergebnisse

Beleg: [v11/discovery/](v11/discovery/README.md). TRAIN-Exploration: 203 protokollierte Varianten. Walk-Forward innerhalb TRAIN: die jeweils beste Variante erzielt out-of-sample **weniger** als die durchschnittliche (−0,53 % vs. −0,23 % je Intervall) – Auswahl der Besten hatte schon in TRAIN keinen Wert.

| Hypothese | Idee | VALIDATION (beobachtet ggü. SPY) | abgesichert? | TEST 2021–2025 | Erklärung |
|---|---|---|---|---|---|
| Momentum-Familie (12 Kandidaten, z. B. MOM12-1+REV1 N20 InvVol) | relative Stärke, Umkehr-Filter, Puffer, Marktfilter | −5,6 … +5,3 % p. a.; unter Stresskosten alle negativ | nein (Holm 1,0) | nicht getestet (keiner zulässig) | Brutto-Auswahl +4 … +11 % p. a. fast vollständig Momentum-Exposure, Kosten 1–4 % p. a. fressen sie; hohe Volatilität |
| Value-haltige Regeln (CF01–CF05, CF11) | Bewertung + Qualität | −9,8 … +0,2 % | nein | – | Verlust 2017–2020 fast ganz Value-Beitrag (−8 … −15 % p. a.) |
| **H1** Qualität N10 quartalsweise (CF06) | konzentrierte Qualitätsauswahl | +15,7 % (Holm 0,16) | nein | **−13,4 % p. a. (Holm 0,037, signifikant schlechter)** | VALIDATION-Gewinn zu +9 % p. a. titelspezifisch, 85 % davon aus 5 Titeln (Konzentration); TEST: spezifisch −6,4 %, dazu −5,4 % Universumseffekt (Mega-Caps dominierten) |
| **H2** Profitabilität + Momentum N20 quartalsweise (CF10) | Kombination | +13,5 % (Holm 0,16) | nein | −5,6 % (p 0,38) | Auswahl in TEST ≈ 0; Rückstand ist der Universumseffekt (EW < SPY) |
| CF12 Let winners run + Qualitätsausstieg | langes Halten | +16,7 % (Holm 0,46) | nein | nicht getestet (Familiengrenze) | in TRAIN schwach; VALIDATION-Ergebnis auf wenigen Titeln |

**Oracle-Obergrenze** (`ORACLE_LOOKAHEAD`): Top-20 nach realisierter Rendite erreichen 35 % brutto je 4-Wochen-Intervall (Population 0,9 %). Alle realistischen Regeln erreichen 0–4 % dieser Prämie; die Lücke ist fast vollständig Auswahl, nicht Gewichtung oder Timing.

## 4. Unter welchen realistisch handelbaren Bedingungen war Überrendite erreichbar?

- **Beobachtet ja, abgesichert nein:** NEW_52W_HIGH als finanzierte Strategie (Median aller Zufallspfade 14,5 % CAGR vs. SPY 5,9 % 2000–2026) – aber ≈ 7,7 der 10,5 Pp sind der Survivor-Populationsvorsprung, der Rest (≈ +0,9 Pp ggü. EW-Index) liegt weit unter der Nachweisgrenze und verschwindet ab ≈ 38 bps Kosten je Seite.
- **Konzentrierte Qualität** wirkte 2017–2020 stark und kehrte sich 2021–2025 um – ein Konzentrations- und Regime-Effekt, kein stabiler Vorteil.
- **Die Gewinner-Prämie liegt in den Rändern:** Wer sie erfassen will, muss breit in riskante Titel investieren und Verlierer in Kauf nehmen; der Erwartungswert solcher Portfolios ist auf einer Survivor-Population nach oben verzerrt und daher nicht belastbar messbar.
- **Was fehlt, um die Frage besser zu beantworten:** eine historische Population mit Delistings und terminalen Erlösen (insb. vor 2015), Total Return auf beiden Seiten, Tages-OHLCV, sauber korrigierte PIT-Marktkapitalisierung (XBRL-Skalenfehler) – und echte Vorwärtsdaten.

## 5. Datenbefunde mit Handlungsbedarf (eigene Erzeuger-PRs)

- XBRL-Skalenfehler in der PIT-Marktkapitalisierung (z. B. ON 3,5e18, YUM 2,4e22, CB 1,8e16 USD) – betrifft Value-Scores, Größenmerkmale und Kapitalgewichtung; in V11 per offengelegter Plausibilitätsregel ausgeschlossen (4.589 von 370.386 Zeilen), Erzeuger-Korrektur nötig.
- MITK: 3,1-facher Wochensprung ungeprüft.
- `research-portfolio`: Operationsbudget verhindert N 20/50-Läufe über lange Zeiträume (Replica-Ledger mit Parität 5e-15 genutzt); Rundungsstaub-Patch aus V10 weiter offen.

## 6. Unabhängige methodische Prüfung

Siehe Abschnitt am Ende (wird nach Abschluss der Prüfung ergänzt).
