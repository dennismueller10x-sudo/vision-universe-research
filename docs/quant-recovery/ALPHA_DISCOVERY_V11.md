# Quant V11 – Reverse Strategy Discovery & Alpha Attribution

Stand 28.10.2026. Forschungsauftrag des Owners: das wiederkehrende Ergebnis „kein belastbarer Vorteil gegenüber SPY“ nicht hinnehmen, sondern seine Ursachen zerlegen, die Anatomie außergewöhnlicher Gewinner untersuchen und neue, nachvollziehbare Regeln auf zeitlich getrennten Daten prüfen. Status: `NOT_CERTIFIED`, `productionApproved=false`, keine Gate-Änderung, keine Produktaktivierung, kein Merge.

Protokoll: [time-split-1.0.0.json](v11/protocol/time-split-1.0.0.json) (vor jeder Ergebnisberechnung committet, `fa8c460c4e`). Stränge: [Winners](v11/winners/README.md) · [Ursachenzerlegung](v11/decomposition/README.md) · [Discovery](v11/discovery/README.md) · Unabhängige Prüfung (unten).

## Antwort in fünf Sätzen

1. Der bisher beobachtete „Vorsprung“ der Signalregeln vor SPY ist überwiegend kein Signal-, sondern ein **Populationseffekt**: Die gleichgewichtete Survivor-Population des Anbieteruniversums lag 2000–2012 deutlich vor SPY; die eigentliche Auswahl (Signal minus Population derselben Woche) liegt bei −0,6 bis +0,5 Pp je 13 Wochen – gemessen im Survivor-Frame, der Momentum-/Trendregeln gegenüber der Population eher benachteiligt (Prüfung M2).
2. Außergewöhnliche Gewinner waren vorab vor allem **riskant** (hohe Volatilität, tiefer Drawdown, klein, weit unter dem Hoch) – dieselben Merkmale reichern Verlierer mindestens ebenso an; 87–99 % der Merkmalsträger wurden keine Top-5-%-Gewinner.
3. Keine der fünf V10-Regeln und keiner der 24 neu auf TRAIN entwickelten Kandidaten wählt die späteren Extremgewinner besser als der Zufall (Oracle-Lücke fast vollständig Auswahl; Zukunftsperzentile der gewählten Titel 0,46–0,54).
4. Auf VALIDATION hatten drei fundamental-kombinierte Qualitätsregeln beobachtete, aber **nicht abgesicherte** Überrenditen von +13 bis +17 % p. a.; die zwei eingefrorenen Hypothesen verloren in TEST 2021–2025 gegen SPY, die konzentrierte Qualitätsregel deutlich (−13,4 % p. a.; Blockbootstrap Holm-p 0,037, mit Newey-West ≈ 0,07 – Richtung robust, Signifikanz grenzwertig).
5. Unter den vorhandenen Daten sind die Tests strukturell schwach: nachweisbar wären erst Überschüsse von etwa 6,5–13 % p. a. (je nach Holm-Schritt); die Population enthält vor 2023 praktisch keine Delistings und deckt 2000 nur ≈ 14 % der damaligen 10-K-Melder ab.

## 1. Ursachenanalyse: warum die fünf Regeln SPY nicht belastbar schlagen

Beleg: [cause-matrix.json](v11/decomposition/cause-matrix.json), [decomposition-results.json](v11/decomposition/decomposition-results.json).

| Ursache | Befund | Größenordnung |
|---|---|---|
| **Benchmark/Population** | SPY-Überschuss = (EW-Population − SPY) + Auswahl − Kosten; der Populationsterm erklärt 103–215 % des Brutto-Überschusses bei vier Regeln; ab 2010 ≈ 0 | NEW_52W_HIGH 13 W: +1,07 = +0,87 + 0,51 − 0,31 Pp |
| **Auswahlqualität** | Signal minus Population derselben Woche: −0,6 … +0,5 Pp je 13 W, bei vier von fünf Regeln negativ; Oracle-Anteil −2 … +1 %. Achtung: im Survivor-Frame fehlen spätere Pleiten mit schwachem Vormomentum; das hebt die Population und benachteiligt Momentum/52W-Hoch/TREND_UP, begünstigt TREND_DOWN/MOMENTUM_DETERIORATED – Größe nicht messbar | TREND_UP −0,59 Pp (einzig Holm-abgesichert, negativ, aber in Richtung gegen die Regel verzerrt) |
| **Einstieg** | Der Kursvorteil entsteht **vor** dem Signal (NEW_52W_HIGH +14,6 Pp ggü. SPY in den 4 Wochen davor); Verzögerung 0–4 Wochen ändert wenig | ±0,3 Pp |
| **Ausstieg/Haltedauer** | Event-Time-Kurve: NEW_52W_HIGH ggü. Population +0,5 Pp bis 52 W, −0,8 Pp bei 104 W; andere Regeln ab Woche 1 darunter; Trailing-Stops schaden | bis −2,7 Pp |
| **Gewichtung/Portfoliobau** | V10-Strategiepfad war ein günstiger von vielen: über 200 Zufalls-Tiebreaks Median-CAGR 14,5 % (NEW_52W_HIGH), 6,3 % (TREND_UP), 5,6 % (MOMENTUM_IMPROVED); Volatilitätsgewichtung schlechter; Cash-Drag unerheblich | NEW_52W_HIGH − EW-Index: +0,9 Pp (Median) |
| **Kosten** | Turnover 4,2–4,8×/Jahr, Kosten 1,3–1,4 % p. a.; Signifikanz der NEW_52W_HIGH-Strategie verschwindet ab ≈ 38 bps je Seite | Break-even 35–123 bps je Seite |
| **Renditedefinition** | Strategie und SPY: gleiche 1.370 Wochen, beide Kursrendite, split-bereinigt, Kosten nur Strategie (Python-Referenz bis 5,6e-15). SPY-Ausschüttungen 1,87 % p. a. (6 N-30D-Belege) vs. Signal-Titel 1,3–1,5 % → der Kursvergleich **begünstigt** die Regeln | 0,4–0,7 Pp p. a. |
| **Datenabdeckung** | Survivor-Universum (keine Delistings vor 2023 im Frame), Abdeckung 15–49 % der 10-K-Melder; der Populationsvorsprung 2000–2012 ist plausibel überwiegend Survivor-Konditionierung | nicht in Pp messbar |
| **Statistische Unsicherheit** | effektive Stichprobe 1–9 % der Ereigniszahl; Mindesteffekt bei 80 % Power: 9,5–13,1 % p. a. im ungünstigsten, ≈ 6,5–8 % im günstigsten Holm-Schritt (Familie 60) | alle 20 SPY-Zellen darunter |

Zeitverlauf: Der Rückgang des NEW_52W_HIGH-SPY-Überschusses (+5,1 → −0,7 Pp) geht zu ≈ 90 % auf den Populationsterm zurück; die Auswahl blieb in allen Teilperioden positiv – kein Effektverfall der Regel, sondern Wegfall eines Benchmark-Vorteils.

## 2. Anatomie außergewöhnlicher Gewinner (beschreibend, ganze Periode)

Beleg: [anatomy-results-1.0.0.json](v11/winners/anatomy-results-1.0.0.json), [case-studies-1.0.0.json](v11/winners/case-studies-1.0.0.json). 96 Quartalskohorten 2001–2024, 1/3/5 Jahre.

- **Schiefe:** Top 5 % liefern im Median 41–47 % aller gleichgewichteten Gewinne einer Kohorte; ohne sie fällt die 1-Jahres-EW-Rendite von 15,2 % auf 6,2 %; die Median-Aktie (6,8 %) liegt unter SPY (8,8 %).
- **Vorab trennende Merkmale** (3 J, Top 5 %): hohe Volatilität (AUC 0,72), tiefer Drawdown (0,68), kleine Größe (0,64), weit unter dem 52W-Hoch (0,63), Verluste/geringe Marge (0,61–0,63). Das Verhältnis Winner-Lift zu Loser-Lift liegt bei 0,54–1,0: **Dispersion, nicht Qualität**.
- **Momentum U-förmig**, Wachstum und Bewertung schwach, Profitabilität schützt eher vor Verlusten als dass sie Gewinner anzeigt. Die U-Form und „Gewinner aus Erholungen“ sind teilweise Survivor-Artefakt (spätere Pleiten mit schwachem Momentum fehlen; unteres Quintil: Mittel +7,4 Pp, Median −0,9 Pp).
- **Formale Signifikanz:** Registriert (1.999 Replikate) 0/156 – strukturell nicht ablehnbar. Die nicht registrierte Sensitivität mit 99.999 Replikaten (85/156) ist bei 3J-/5J-Fundamentalmerkmalen **nicht belastbar**, weil der Blockbootstrap dort nur 2–4 Blöcke hat (45 der 85 Ablehnungen). Belastbar sind nur große, in jeder Kohorte gleichgerichtete Effekte (Volatilität, Größe) qualitativ.
- **NVIDIA:** vor 2016, 2019 und 2023 unauffällig bzw. profitabler Large Cap im Kursrückgang; 238–358 Titel teilten jeweils das Profil, ihre Top-5-%-Quote lag mit 2,8–3,4 % **unter** der Basisrate. Das starke Wachstum wurde erst nach Beginn des Anstiegs berichtet (SEC-Akzessionen im Beleg). 2024 waren alle Profilmerkmale extrem – NVIDIA war dann kein Gewinner mehr.
- Systematisch gewählte weitere Gewinner (ECPG, MNST, MITK, SNBR, ENPH, GRVY, CVNA, DAVE): 6 von 8 Erholungen aus extremer Schwäche oder volatile Small Caps.

## 3. Strategiehypothesen und ihre historischen Ergebnisse

Beleg: [v11/discovery/](v11/discovery/README.md). TRAIN-Exploration: 203 protokollierte Varianten. Walk-Forward innerhalb TRAIN: die jeweils beste Variante erzielt out-of-sample **weniger** als die durchschnittliche (−0,53 % vs. −0,23 % je Intervall) – Auswahl der Besten hatte schon in TRAIN keinen Wert.

| Hypothese | Idee | VALIDATION (beobachtet ggü. SPY) | abgesichert? | TEST 2021–2025 | Erklärung |
|---|---|---|---|---|---|
| Momentum-Familie (12 Kandidaten, z. B. MOM12-1+REV1 N20 InvVol) | relative Stärke, Umkehr-Filter, Puffer, Marktfilter | −5,6 … +5,3 % p. a.; unter Stresskosten alle negativ | nein (Holm 1,0) | nicht getestet (keiner zulässig) | Brutto-Auswahl +4 … +11 % p. a., bei 12-1-/6-Monats-Regeln fast vollständig Momentum-Exposure (mechanisch, da Rangvariable), bei MOM3-Regeln überwiegend titelspezifisch (+3,1 … +5,6 %); Kosten 1–4 % p. a. fressen den Großteil |
| Value-haltige Regeln (CF01–CF05, CF11) | Bewertung + Qualität | −9,8 … +0,2 % | nein | – | Verlust 2017–2020 fast ganz Value-Beitrag (−8 … −15 % p. a.) |
| **H1** Qualität N10 quartalsweise (CF06) | konzentrierte Qualitätsauswahl | +15,7 % (Holm 0,16) | nein | **−13,4 % p. a.** (Bootstrap-Holm 0,037; Newey-West-Holm ≈ 0,07; 10 Blöcke) | VALIDATION-Gewinn zu +9 % p. a. titelspezifisch, 85 % davon aus 5 Titeln (Konzentration); TEST: spezifisch −6,4 %, dazu −5,4 % Universumseffekt (Mega-Caps dominierten) |
| **H2** Profitabilität + Momentum N20 quartalsweise (CF10) | Kombination | +13,5 % (Holm 0,16) | nein | −5,6 % (p 0,38) | Auswahl in TEST ≈ 0; Rückstand ist der Universumseffekt (EW < SPY) |
| CF12 Let winners run + Qualitätsausstieg | langes Halten | +16,7 % (Holm 0,46) | nein | nicht getestet (Familiengrenze) | in TRAIN schwach; VALIDATION-Ergebnis auf wenigen Titeln |

**Oracle-Obergrenze** (`ORACLE_LOOKAHEAD`): Top-20 nach realisierter Rendite erreichen 35 % brutto je 4-Wochen-Intervall (Population 0,9 %). Alle realistischen Regeln erreichen 0–4 % dieser Prämie; die Lücke ist fast vollständig Auswahl, nicht Gewichtung oder Timing.

## 4. Unter welchen realistisch handelbaren Bedingungen war Überrendite erreichbar?

- **Beobachtet ja, abgesichert nein:** NEW_52W_HIGH als finanzierte Strategie (Median aller Zufallspfade 14,5 % CAGR vs. SPY 5,9 % 2000–2026) – aber ≈ 7,7 der 10,5 Pp sind der Survivor-Populationsvorsprung, der Rest (≈ +0,9 Pp ggü. EW-Index) liegt weit unter der Nachweisgrenze und verschwindet ab ≈ 38 bps Kosten je Seite.
- **Konzentrierte Qualität** wirkte 2017–2020 stark und kehrte sich 2021–2025 um – ein Konzentrations- und Regime-Effekt, kein stabiler Vorteil.
- **Die Gewinner-Prämie liegt in den Rändern:** Wer sie erfassen will, muss breit in riskante Titel investieren und Verlierer in Kauf nehmen; der Erwartungswert solcher Portfolios ist auf einer Survivor-Population nach oben verzerrt und daher nicht belastbar messbar.
- **Was fehlt, um die Frage besser zu beantworten:** eine historische Population mit Delistings und terminalen Erlösen (insb. vor 2015), Total Return auf beiden Seiten, Tages-OHLCV, sauber korrigierte PIT-Marktkapitalisierung (XBRL-Skalenfehler) – und echte Vorwärtsdaten.

## 5. Datenbefunde mit Handlungsbedarf (eigene Erzeuger-PRs)

- XBRL-Skalenfehler in der PIT-Marktkapitalisierung (Maxima laut Prüfung: EEFT 7,9e18 (2021), CB 2,0e16, YUM 3,2e16, ON 3,9e15 USD; 149 Panelzeilen > 5e12; in der Winners-Studie 38 Kohortenmitglieder, AUC-Wirkung ≤ 0,006) – betrifft Value-Scores, Größenmerkmale und Kapitalgewichtung; in V11 per offengelegter Plausibilitätsregel ausgeschlossen (4.589 von 370.386 Zeilen), Erzeuger-Korrektur nötig.
- MITK: 3,1-facher Wochensprung ungeprüft.
- `research-portfolio`: Operationsbudget verhindert N 20/50-Läufe über lange Zeiträume (Replica-Ledger mit Parität 5e-15 genutzt); Rundungsstaub-Patch aus V10 weiter offen.

## 6. Unabhängige methodische Prüfung

Getrennter, nur lesender Prüfagent auf Stand `31d6b1ec3b`. **Gesamturteil: Die negativen Kernaussagen tragen – keine Regel validiert, SPY-Vorsprung überwiegend Survivor-/Gleichgewichtungs-Populationseffekt, extreme Schiefe der Gewinnerrenditen. Kein BLOCKER.**

Geprüft und korrekt befunden: Commit-Reihenfolge Protokoll → Registrierungen → Freeze → VALIDATION → Final-Freeze → TEST (Zeitstempel privater Dateien passend, lineare Reflogs); Firewall R4 (Discovery enthielt zum TEST-Zeitpunkt nur `discovery/` und `protocol/`); keine eingefrorene Spezifikation nachträglich geändert; finale Auswahl mechanisch reproduziert; PIT (527.993 Panelzeilen, 0 mit Verfügbarkeit ≥ Stichtag; Querschnittsnormierung); Benchmark-Konsistenz; Zerlegungsidentität; Attributionszahlen.

| # | Befund | Schwere | Behandlung |
|---|---|---|---|
| M1 | Winners: Signifikanz der 99.999-Replikat-Sensitivität bei 2–4 Blöcken nicht belastbar (45/85 Ablehnungen) | MAJOR | Aussagen hier und im Winners-README entschärft |
| M2 | Survivorship verzerrt auch Auswahl- und Querschnittsterme (gegen Momentum/Trend, für Rebound/TREND_DOWN) | MAJOR | in Synthese und READMEs ergänzt; nicht korrigierbar ohne Delisting-Population |
| m1 | H1-Signifikanz fragil (Newey-West-Holm ≈ 0,07) | MINOR | entschärft |
| m2/m3 | falsche Größenangaben der XBRL-Fehler; Winners ohne Hinweis | MINOR | korrigiert/ergänzt |
| m4 | Decomposition-Plausibilitätsfilter nutzt Median über die ganze Listing-Historie (Look-ahead in Benchmark-Gewichtung, deskriptiv) | MINOR | offengelegt; kapitalgewichtete Zahlen beider Stränge nicht direkt vergleichbar |
| m5 | Fundamental-TRAIN prüfte Momentum-Rangsummen 2013–2016 = Kurs-VALIDATION | MINOR | offengelegt; begünstigt Kurskandidaten, deren VALIDATION trotzdem null |
| m6 | „einmal gerechnet“ technisch umgehbar (`--out-dir`); kein Hinweis auf weitere Läufe | MINOR | offengelegt |
| m7 | Decomposition-Registrierung „keine Outcomes“, ein privates Probe-Skript rechnete die (aus V10 bekannte) NEW_52W_HIGH-CAGR wahrscheinlich vorher | MINOR | offengelegt |
| m8 | Attribution: „spezifisch“ ist Residuum; Momentum-Exposure einer Momentum-Regel mechanisch; MOM3-Regeln überwiegend spezifisch | MINOR | korrigiert |
| m9 | Python-Gegenrechnungen prüfen vor allem Arithmetik/Ledger, kaum Inferenz (Bootstrap mit gleichem Generator portiert) | MINOR | offengelegt: Inferenz nicht unabhängig bestätigt |
| m10 | Power: Mindesteffekt im günstigsten Holm-Schritt ≈ 6,5–8 % | MINOR | ergänzt |
| m11 | kleiner Look-ahead beim Einstiegsfilter (`canEnter`) | MINOR | Wirkung null (0 erzwungene Ausstiege) |

Konsistenz: Die drei Stränge widersprechen sich nicht, teilen aber denselben Survivor-Frame mit gleichgerichteter Verzerrung – ihre Übereinstimmung ist keine unabhängige Bestätigung.
