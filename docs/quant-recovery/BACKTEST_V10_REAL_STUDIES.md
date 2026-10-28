# V10 – Realstudien

Alle Studien sind vor der Ergebnisberechnung registriert (Registrierungsdatei je Strang mit eigenem Commit vor den Ergebnissen), nutzen nur bestehende Engines (`research-studies`, `research-validation.holm`/`inferTemporalBlockMean`, `research-portfolio`, `weekly-benchmark`, `setup-engine`, `fundamental-inputs`, `FactorEvidence`) und tragen den einheitlichen Evidenzvertrag (studyId, Regelversion, Quelle, Identität, Population, Ein-/Ausschlüsse, Zeitraum, As-of, Verfügbarkeit, Renditebasis, Kosten, Benchmark, reife Outcomes, Performance, Drawdown, Unsicherheit, Mehrfachtest, Reproduktionshash, `NOT_CERTIFIED`, `productionApproved:false`, Geltungsbereich). **Alle Populationen sind heutige Survivors des Anbieteruniversums** (siehe [Datenrettung](BACKTEST_V10_DATA_RECOVERY.md#b--historische-identität-und-delisting)); alle Renditen sind Kursrenditen. 2000–2025 ist durch V7–V9 bereits untersuchte Historie; es gibt keinen unberührten Holdout.

## E – Signal Backtest (5 Regeln)

Beleg: [v10/studies/ca-id-lifecycle/signal-backtest-evidence.json](v10/studies/ca-id-lifecycle/signal-backtest-evidence.json) (registrierter Lifecycle-Lauf auf dem integrierten Stand, Tabellen unten) und [ca-id/](v10/studies/ca-id/) (Primärlauf ohne Lifecycle mit dem CA-Register vor der V10-Erweiterung; reproduzierbar am Commit `79bf2d5742`). Beide Läufe ergeben dieselben 7 Holm-Ablehnungen. Registrierung `registration-1.0.0.json` (Hash `30329e97…`).

- Population: `createResearchLoader({identityEvidence, corporateActionEvidence, listingLifecycleEvidence})` → 4.526 QUALIFIED, V9-Frame-Regel (modale ISO-Wochenlabels, Primärbörsen) → **4.329 Listings** (184 abweichende Wochenlabels, 13 Börse ausgeschlossen); darin 121 beendete Listings (19 mit SEC-belegtem letztem Handelstag, übrige mit unbelegtem eingefrorenem Ende, am letzten beobachteten Schluss geschnitten und zensiert).
- Signal am Wochenschluss, Einstieg am nächsten Wochenschluss; Horizonte 4/13/26/52 Wochen; Kosten 10 + 5 bps je Seite (Sensitivität bis 20 + 30); Endpunkte Roh-Netto, SPY-Überschuss (gleiche Daten), Überschuss gegenüber der Basisrate (zeitgleiche Nicht-Signal-Beobachtungen derselben Population); zirkulärer Kalender-Blockbootstrap (b 52, bei h 52 b 104, 1.999 Replikate) plus Zwei-Wege-Cluster; Holm über 60 Tests.

| Regel | h | n | Roh | SPY-Überschuss (p) | Basisrate-Überschuss (p) |
|---|---|---|---|---|---|
| NEW_52W_HIGH | 13 | 42.395 | +3,07 % | +1,07 % (0,11) | +0,51 % (0,048) |
| NEW_52W_HIGH | 52 | 41.766 | **+12,48 %** | +3,39 % (0,17) | +0,50 % |
| MOMENTUM_IMPROVED | 13 | 65.737 | +2,79 % | +0,48 % | −0,32 % (0,041) |
| MOMENTUM_DETERIORATED | 13 | 65.497 | +3,18 % | +0,64 % | −0,04 % |
| TREND_UP | 13 | 63.802 | +2,40 % | +0,20 % | **−0,63 %** |
| TREND_DOWN | 52 | 62.488 | **+12,30 %** | +2,22 % | −2,07 % (0,0095) |

Fett = Holm ≤ 0,05. **7/60 Holm-Ablehnungen**, davon 6 Roh-Renditen (alle Regeln bei 52 W, NEW_52W_HIGH bei 26 W) – sie enthalten die Marktdrift. **SPY-Überschuss 0/20.** Einziger signifikanter Kontrollbefund: TREND_UP 13 W **unterperformt** die Basisrate (−0,63 %). Der V9-Befund ist exakt reproduziert (V9-P1-Listings im V10-Frame: +3,37 % roh / +1,37 % SPY, n 9.898). Der SPY-Überschuss von NEW_52W_HIGH 13 W sinkt über die Teilperioden: +5,1 % (2000–07), +1,0 %, +0,1 %, −0,7 % (2020–25).

**Survivorship-Sensitivität** (je Zelle in den Einheiten des Endpunkts): ohne die 121 beendeten Listings, mit belegter Barabfindung (2–3 Ereignisse je 52-W-Zelle), Schranke −100 % und letzter Kurs für die übrigen zensierten Outcomes (13–19 je 13-W-Zelle, 57–81 je 52-W-Zelle). Keine Holm-Entscheidung ändert sich; die −100-%-Schranke senkt Mittel um höchstens ≈ 0,15 Pp (52 W). Das belegt nur, dass die *im Bestand vorhandenen* Delistings unerheblich sind – nicht, dass Survivorship unerheblich wäre: Der Bestand deckt 2000 nur ≈ 14 % der damaligen 10-K-Melder ab, und Titel, die vor der Universumsbildung verschwanden, fehlen ganz.

**Finanzierte Long-only-Strategie** (vorab fixiert: 10 Positionen, 13 W Haltedauer, gleichgewichtet, Cash, 10 + 5 bps, `research-portfolio`, 2000-01 bis 2026-04):

| Regel | CAGR | MaxDD | Sharpe | Wochendifferenz zu SPY (Holm-p) |
|---|---|---|---|---|
| NEW_52W_HIGH | 16,4 % | −52,6 % | 0,83 | 0,027 (bei 20 + 30 bps nicht signifikant) |
| TREND_UP | 11,1 % | −65,7 % | 0,55 | 0,28 |
| MOMENTUM_IMPROVED | 7,7 % | −67,3 % | 0,39 | 0,43 |
| SPY buy-and-hold | 5,9 % | −55,9 % | 0,41 | – |

Kein Vorteilsnachweis: Survivor-Kohorte, ~97 % der Signale über einen Hash-Tiebreak übersprungen (ein Pfad von vielen), nicht kostenrobust. Keine Shortstrategien.

## D2 – Pattern Evidence

Beleg: [pattern-evidence.json](v10/studies/ca-id-lifecycle/pattern-evidence.json). 15 registrierte Kursmuster × 13/52 W × 3 Endpunkte = 90 Tests, zeitgleiche Kontrollgruppe (gleiche Woche, gleiche Population, ohne Muster). **11 Holm-Ablehnungen**, 9 davon Roh-Renditen. Basisrate-Überschuss signifikant: strong-12m-momentum 13 W **+1,05 %**, three-month-thrust 52 W **+6,26 %**. **Kein SPY-Überschuss Holm-signifikant** → nach registrierter Entscheidungsregel keine Vorteilsaussage. Scope gegenüber V7/V8 deutlich breiter (11 Survivors/1 Muster → 4.329 Listings/15 Muster mit Kontrollgruppe). 3 Volumenmuster ausgeschlossen (Wochenschlüsse ohne Volumen). Gewinner bei Momentum-/Thrust-Mustern sind auf einer Survivor-Kohorte besonders verdachtsanfällig.

## D1 – Same Stock Replay (regelbasiert)

Beleg: [same-stock-replay-evidence.json](v10/studies/ca-id-lifecycle/same-stock-replay-evidence.json). 200 Listings als Hash-Stichprobe aus dem Frame (nicht handverlesen), Regel ABOVE_40W_SMA, Cooldown 13 W, Episoden, Kosten, 8 Tests. Signifikant nur Roh-Renditen (13 W +2,91 %, 52 W +13,29 %); SPY- und Basisrate-Überschuss nicht (Holm 0,46 bzw. 0,61/0,80). Persistenz frühe → spätere Episoden: ρ 13 W −0,03; 52 W +0,17 (Holm 0,18) – bei 52 W wegen fehlender Sperrzone zwischen den Hälften nicht interpretierbar (Prüfungsbefund 7). Die deskriptive Einzelaktienansicht bleibt unverändert und getrennt. D1 ist konstruktiv eine Teilmenge der D2-Ereignisse „above-40w-line“, also nicht unabhängig.

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
