# V10 – Realstudien

Alle Studien sind vor der Ergebnisberechnung registriert (Registrierungsdatei je Strang mit eigenem Commit vor den Ergebnissen), nutzen nur bestehende Engines (`research-studies`, `research-validation.holm`/`inferTemporalBlockMean`, `research-portfolio`, `weekly-benchmark`, `setup-engine`, `fundamental-inputs`, `FactorEvidence`) und tragen den einheitlichen Evidenzvertrag (studyId, Regelversion, Quelle, Identität, Population, Ein-/Ausschlüsse, Zeitraum, As-of, Verfügbarkeit, Renditebasis, Kosten, Benchmark, reife Outcomes, Performance, Drawdown, Unsicherheit, Mehrfachtest, Reproduktionshash, `NOT_CERTIFIED`, `productionApproved:false`, Geltungsbereich). **Alle Populationen sind heutige Survivors des Anbieteruniversums** (siehe [Datenrettung](BACKTEST_V10_DATA_RECOVERY.md#b--historische-identität-und-delisting)); alle Renditen sind Kursrenditen. 2000–2025 ist durch V7–V9 bereits untersuchte Historie; es gibt keinen unberührten Holdout.

## E – Signal Backtest (5 Regeln)

Beleg: [v10/studies/ca-id-lifecycle/signal-backtest-evidence.json](v10/studies/ca-id-lifecycle/signal-backtest-evidence.json) (Primär mit Delisting-Schnitt) und [ca-id/](v10/studies/ca-id/) (ohne). Registrierung `registration-1.0.0.json` (Hash `30329e97…`).

- Population: `createResearchLoader({identityEvidence, corporateActionEvidence, listingLifecycleEvidence})` → 4.404 QUALIFIED, V9-Frame-Regel (modale ISO-Wochenlabels, Primärbörsen) → **4.235 Listings** (157 abweichende Wochenlabels, 12 Börse ausgeschlossen); 27 delistete Listings mit belegtem letztem Handelstag.
- Signal am Wochenschluss, Einstieg am nächsten Wochenschluss; Horizonte 4/13/26/52 Wochen; Kosten 10 + 5 bps je Seite (Sensitivität bis 20 + 30); Endpunkte Roh-Netto, SPY-Überschuss (gleiche Daten), Überschuss gegenüber der Basisrate (zeitgleiche Nicht-Signal-Beobachtungen derselben Population); zirkulärer Kalender-Blockbootstrap (b 52, bei h 52 b 104, 1.999 Replikate) plus Zwei-Wege-Cluster; Holm über 60 Tests.

| Regel | h | n | Roh | SPY-Überschuss (p) | Basisrate-Überschuss (p) |
|---|---|---|---|---|---|
| NEW_52W_HIGH | 13 | 42.079 | +3,08 % | +1,09 % (0,11) | +0,51 % |
| NEW_52W_HIGH | 52 | 41.500 | **+12,47 %** | +3,40 % | +0,48 % |
| MOMENTUM_IMPROVED | 13 | 65.218 | +2,80 % | +0,50 % | −0,32 % |
| MOMENTUM_DETERIORATED | 13 | 64.972 | +3,20 % | +0,66 % | −0,04 % |
| TREND_UP | 13 | 63.289 | +2,42 % | +0,22 % | **−0,63 %** |
| TREND_DOWN | 52 | 62.028 | **+12,35 %** | +2,28 % | −2,06 % |

Fett = Holm ≤ 0,05. **7/60 Holm-Ablehnungen**, davon 6 Roh-Renditen (alle Regeln bei 52 W, NEW_52W_HIGH bei 26 W) – sie enthalten die Marktdrift. **SPY-Überschuss 0/20.** Einziger signifikanter Kontrollbefund: TREND_UP 13 W **unterperformt** die Basisrate (−0,63 %). Der V9-Befund ist exakt reproduziert (V9-P1-Listings im V10-Frame: +3,37 % roh / +1,37 % SPY, n 9.898). Der SPY-Überschuss von NEW_52W_HIGH 13 W sinkt über die Teilperioden: +5,1 % (2000–07), +1,0 %, +0,1 %, −0,7 % (2020–25).

**Survivorship-Sensitivität:** Mit dem Delisting-Schnitt bleiben alle Holm-Entscheidungen gleich; Schranken für zensierte Outcomes (−100 % bzw. letzter Kurs) verschieben NEW_52W_HIGH 13 W um < 0,01 Pp. Das zeigt nur, dass die *im Bestand vorhandenen* Delistings unerheblich sind – nicht, dass Survivorship unerheblich wäre (der Bestand enthält kaum delistete Titel).

**Finanzierte Long-only-Strategie** (vorab fixiert: 10 Positionen, 13 W Haltedauer, gleichgewichtet, Cash, 10 + 5 bps, `research-portfolio`, 2000-01 bis 2026-04):

| Regel | CAGR | MaxDD | Sharpe | Wochendifferenz zu SPY (Holm-p) |
|---|---|---|---|---|
| NEW_52W_HIGH | 16,3 % | −52,6 % | 0,82 | 0,03 (bei 20 + 30 bps nicht signifikant) |
| TREND_UP | 11,4 % | −65,2 % | 0,56 | 0,24 |
| MOMENTUM_IMPROVED | 7,5 % | −67,6 % | 0,38 | 0,45 |
| SPY buy-and-hold | 5,9 % | −55,9 % | 0,41 | – |

Kein Vorteilsnachweis: Survivor-Kohorte, ~97 % der Signale über einen Hash-Tiebreak übersprungen (ein Pfad von vielen), nicht kostenrobust. Keine Shortstrategien.

## D2 – Pattern Evidence

Beleg: [pattern-evidence.json](v10/studies/ca-id-lifecycle/pattern-evidence.json). 15 registrierte Kursmuster × 13/52 W × 3 Endpunkte = 90 Tests, zeitgleiche Kontrollgruppe (gleiche Woche, gleiche Population, ohne Muster). **11 Holm-Ablehnungen**, 9 davon Roh-Renditen. Basisrate-Überschuss signifikant: strong-12m-momentum 13 W **+1,04 %**, three-month-thrust 52 W **+6,24 %**. **Kein SPY-Überschuss Holm-signifikant** → nach registrierter Entscheidungsregel keine Vorteilsaussage. Scope gegenüber V7/V8 deutlich breiter (11 Survivors/1 Muster → 4.235 Listings/15 Muster mit Kontrollgruppe). 3 Volumenmuster ausgeschlossen (Wochenschlüsse ohne Volumen). Gewinner bei Momentum-/Thrust-Mustern sind auf einer Survivor-Kohorte besonders verdachtsanfällig.

## D1 – Same Stock Replay (regelbasiert)

Beleg: [same-stock-replay-evidence.json](v10/studies/ca-id-lifecycle/same-stock-replay-evidence.json). 200 Listings als Hash-Stichprobe aus dem Frame (nicht handverlesen), Regel ABOVE_40W_SMA, Cooldown 13 W, Episoden, Kosten, 8 Tests. Signifikant nur Roh-Renditen (13 W +2,93 %, 52 W +13,36 %); SPY- und Basisrate-Überschuss nicht (Holm 0,41 bzw. 0,62/0,69). Persistenz frühe → spätere Episoden: ρ 13 W −0,03; 52 W +0,17 (Holm 0,18). Die deskriptive Einzelaktienansicht bleibt unverändert und getrennt. D1 ist konstruktiv eine Teilmenge der D2-Ereignisse „above-40w-line“, also nicht unabhängig.

## F – Factor Ranking (Rekonstruktion, Pfad A)

Beleg: [v10/factor/](v10/factor/README.md). **RECONSTRUCTION – nie als damals veröffentlichtes VU-Signal.** Rekonstruiert ist vu-factor-evidence-2.0.0 (quant-v2.2.0): Quality, Growth, Value, Profitability PIT aus SEC companyfacts mit der bestehenden Pipeline (1.14.0 inkl. P1–P4, `filed < Stichtag`), Momentum und Risk aus Wochenschlüssen; Revisions nicht rekonstruierbar. PIT-Marktkapitalisierung = Aktienzahl × bereinigter Kurs × `splitFactors` (ADR-002). 192 Monatsstichtage 2010-01–2025-12, Population 1.830 → 4.250 Listings (3.957 Emittenten mit PIT-Dokument), Gesamtrang ab 2011 auf 453–827 Titeln.

Rang-IC (Spearman), Blockbootstrap über Stichtage, Holm über 28 Tests: **9/28 signifikant** – Momentum auf allen Horizonten (IC 0,041–0,065), Profitability 1M/3M, Quality 1M/3M, Gesamtrang 1M (IC 0,040). Die Gesamtrang-IC ist in 2010–2014 null (−0,007), 2015–2025 positiv. **Top-Quintil gegen Q1, SPY oder gleichgewichtete Population: 0/28 je Endpunkt**; bei mehreren Signalen ist der Quintil-Spread trotz positiver IC negativ (Rangsignal ohne verwertbare Ränder).

**Strategie Top-50** (Gesamtrang, monatlich, gleichgewichtet, 15 bp/Seite, `research-portfolio`, 2011-06–2026-01): CAGR 13,0 % vs. SPY 12,3 %, Sharpe 0,70 vs. 0,79, MaxDD −35,4 % vs. −32,2 %; monatlicher Überschuss +0,14 % (p 0,38, KI −0,20…+0,44 %). Die gleichgewichtete Survivor-Population erzielt 14,0 % – mehr als die Strategie.

## F – Strategy Backtest

Eine historische VU-Strategie mit Original-Membership existiert nicht. Rekonstruiert ist nur die obige Top-50-Faktorstrategie (PIT-Membership = damals lebende Frame-Listings, keine rückprojizierte Indexmitgliedschaft) sowie die drei finanzierten Signalstrategien. Total-Return-Ledger sind für 8 Titel belegt (siehe Datenrettung C) und als Mechanik nachgerechnet, nicht als Strategie.

## F – Setup Backtest

Beleg: [v10/setup/](v10/setup/README.md).
- **Original (Pfad B):** 21 contentHash-geprüfte Stände, 4.137 Ereignisse, 20 Ereignisdaten; heute kein M3/M6 reif; erste M3-Reife 24.12.2026, M6 **30.03.2027**; N_eff 17,1 roh / 13,3 SPY-Überschuss (wie V9).
- **Rekonstruktion (Pfad A):** Die Setup-Engine braucht Tages-OHLCV (Hoch, Tief, Volumen); auf Wochenschlüssen stimmen nur 46,7 % der Zustände. Daher Zustände aus dem Produkt-Replay (120 Listings, Parität AAPL 551/551), Ausgänge auf dem Research-Frame, 2005–2025. M6 SPY-Überschuss SETUP_NEW +1,1 % (KI −1,7…+3,6, n 4.861, N_eff 532), SETUP_CONFIRMED −0,3 % (n 488). **0/16 Holm.**

## Gesamtbild

Keine Studie belegt einen historischen Vorteil gegenüber SPY nach Mehrfachtestkontrolle. Robust positiv sind nur (a) Roh-Renditen, die die Marktdrift enthalten, (b) einzelne Überschüsse gegenüber der gleichzeitigen Basisrate (strong-12m-momentum, three-month-thrust), (c) kleine, positive Rang-ICs für Momentum, Profitability, Quality. Negative und nicht signifikante Ergebnisse sind unverändert berichtet.
