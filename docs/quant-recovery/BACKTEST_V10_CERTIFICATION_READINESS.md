# V10 – Zertifizierungsreife der sechs Backtest-Arten

Der aktive Vertrag ([quant/data/product/backtest-certification-v1.json](../../quant/data/product/backtest-certification-v1.json), sha256 `872f871d…`) und alle Gates sind **unverändert**. Kein Statuswechsel, kein `CERTIFIED`, `productionApproved=false`. Grundlage: [V9-Zertifizierungsreife](v9/certification-readiness-1.0.0.json), V10-Messungen [Studien](v10/studies/ca-id-lifecycle/certification-readiness-1.0.0.json), [Setup](v10/setup/setup-original-inventory-1.0.0.json), [Faktor](v10/factor/README.md).

**Zertifiziert: 0/6.** Erfüllt ihren aktiven Vertrag: **keine**.

## Je Art: was V10 messbar geändert hat

| Art | V9-Blocker | V10-Messung | weiter offen | Klasse |
|---|---|---|---|---|
| SAME_STOCK_REPLAY | `SURVIVOR_BY_CONSTRUCTION`, `DESCRIPTIVE_NOT_A_TEST` | getrennte Regelstudie mit Hash-Stichprobe aus dem Frame (ruleTest für diese Studie messbar erfüllt); deskriptive Ansicht unverändert | Survivorship bleibt für die Einzelaktienansicht strukturell; Gesamtrendite; Holdout | strukturell + Evidenz |
| PATTERN_EVIDENCE | Survivorship teilweise unquantifiziert, Kursrendite, Studie nicht als Backtest zertifiziert | 15 Muster auf 4.235 Listings mit zeitgleicher Kontrollgruppe, Delisting-Schranken ausgewertet, Engine-Parität | Survivorship nur für die im Bestand vorhandenen Delistings quantifiziert (Population ist Survivor-Universum); Kursrendite; `certifiedAsBacktest` strukturell | Evidenz/strukturell |
| SIGNAL_BACKTEST | Survivorship nur Sensitivität ab 2016; keine Regel zertifiziert | Hauptstudie mit Delisting-Sensitivität; Kosten, Slippage, Benchmark, Stichprobe, abhängigkeitsrobuste Inferenz erfüllt; 0/20 SPY-Überschüsse | `ruleCertified` 0/5 (kein Überschuss belegt); OOS/Holdout fehlt; Regime nur deskriptiv; Kursrendite in dieser Studie | Evidenz (wirtschaftlich negativ) |
| SETUP_BACKTEST | 21/120 Stichtage, 46/180 Tage, 0/100 M6, 0/20 Titel, Monatszähler 2/20, OOS, Varianten, Kursrendite | exakter Reifekalender; Rekonstruktion 2005–2025 (120 Listings, 0/16 Holm) | **OOS-Gate im Auswerter fest `false`** (`scripts/quant/build-backtest-certification.mjs` Z. 149) → unter dem unveränderten Vertrag zu keinem Datum zertifizierbar; Unabhängigkeits-Normfrage | Zeit + Norm + Codebefund |
| STRATEGY_BACKTEST | Membership- und Faktorhistorie je 2/24 Monate | rekonstruierte Top-50-Faktorstrategie 2011–2026 (kein Überschuss), TR-Ledger für 8 Titel | Original-Membership/Faktorhistorie (frühestens ~2028-08); Rekonstruktion ersetzt sie nicht (`historicalStudyCanReplace=false`) | Zeit |
| FACTOR_RANKING_BACKTEST | Faktorhistorie 2/24, Forward 0/12, Membership 2/24 | PIT-Rekonstruktion 192 Stichtage, Rang-IC 9/28 Holm, Quintil-Überschüsse 0/28 | Original-Vintages und 12 abgeschlossene Forward-Monate (frühestens 2028-01 / 2028-08) | Zeit |

## Setup: Reifekalender unter unverändertem Vertrag

Bei Veröffentlichung an jeder NYSE-Sitzung ab 27.10.2026: historySpanDays 09.03.2027; historyDates 19.03.2027; completedOutcomesM6, titles, entryVariant 30.03.2027; Monatszähler (`independentWeeks`) **03.04.2028**; OOS **nie** (fester Wert im Auswerter). Die V9-Angabe 26.03.2027 war ein Feiertag (Karfreitag).

## Entscheidungsvorlagen (nicht aktiviert)

1. **Setup-Unabhängigkeit** ([setup-independence-decision-1.0.0.json](v10/setup/setup-independence-decision-1.0.0.json)). Messbefund: Für den M6-SPY-Überschuss sättigt N_eff je Tag bei ≈ 1/ρ ≈ 12,6 – zusätzliche Titel am selben Tag helfen kaum, nur Zeit hilft.
   - **Option A** (Status quo): Monatszähler erfüllt 03.04.2028, dann nur N_eff ≈ 30 und 3 disjunkte M6-Fenster.
   - **Option B (empfohlen):** `independentWeeks` ehrlich in `eventCalendarMonths` umbenennen (nur Audit), neues Gate `m6SpyExcessEffectiveSampleSize ≥ 50` unter vorregistriertem Modell `setup-neff-overlap-1.0.0` (ρ = max(ρ̂ der 126-Sitzungen-Überschüsse, 0,05)) plus `disjointM6Windows ≥ 4`. Frühestens erfüllt: SETUP_NEW 18.–30.01.2029, SETUP_CONFIRMED 29.01.–20.04.2029 (Stress-ρ 0,11: Ende 2029).
   - **Option C** (Rekonstruktion als Ersatz): nicht empfohlen; der Setup-Vertrag schließt das Replay als Ergebnisquelle aus.
   - Unabhängig davon braucht das OOS-Gate eine Segmentdefinition (`oosMinPerSegment` 30); ohne sie bleibt SETUP_BACKTEST nicht zertifizierbar.
2. **Rekonstruierter Research-Scope für Faktor/Strategie** ([v10/factor/README.md](v10/factor/README.md)): eigener, als `RECONSTRUCTION` gekennzeichneter Scope ohne Wirkung auf Verträge/Gates, zulässig nur für Rang-IC-/Quintilaussagen (keine Renditeaussage), Voraussetzungen: Delisting-Population, TR wo belegt, PIT-SIC-Peer-Normierung, Branchenvorlagen, Korrekturregister für XBRL-Skalenfehler und Spin-off-Faktoren. Heute **nicht** erfüllt.
3. **Signal-/Pattern-Studien:** Eine Produktfreigabe einer Regel ist durch V10 nicht begründbar (kein SPY-Überschuss). Fachlich vertretbar wäre allenfalls eine deskriptive Anzeige „historische Häufigkeit/Rohrendite inkl. Marktdrift, Survivor-Kohorte, kein Vorteil belegt“ – nur nach eigener Produktentscheidung.

## Was keine Rückrechnung ersetzen kann

Original veröffentlichte VU-Historie (Setup-Snapshots, Faktor-Vintages, Membership), unberührte Out-of-Sample-Perioden (prospektive 8-K-Kohorte ab 29.04.2027 auswertbar), eine historische Marktpopulation mit Delistings und terminalen Erlösen. Diese Grenzen sind echte Daten- bzw. Zeitgrenzen, keine technischen Sperren.
