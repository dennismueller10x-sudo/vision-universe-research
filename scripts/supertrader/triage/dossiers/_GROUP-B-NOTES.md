# Gruppe B (Trendfolge) – Notizen Agent B

Dossiers: DONCHIAN_TURTLE, TURTLE_ORIGINAL_FUTURES (Ref), DARVAS_BOX, DARVAS_ORIGINAL (Ref), NEO_DARVAS (Ref), VU_TREND_52W.
Nur Lesen, keine Messlaeufe, *.sealed.json nicht geoeffnet. Alle Zahlen aus Evidenz: SEALED_NOT_READABLE.

## Auffaelligkeiten
- Turtle 2.0.2: portfolio = 2.0.0-Portfolio ohne priority -> Default ALPHA (model-portfolio.mjs:32,35). Rang-Version 2.1.0 (Staerke/N) nie live.
- Turtle: kein Gewichtsdeckel (maxPositionPct 1,0), Cash bindet statt 12-Titel-Grenze; Einzelgewichte laut R15 ca. 1/5 bis >1/3.
- Darvas 3.0.2: 0,5 % Risiko = Kullamaegi-Zahl (backtest.mjs:11); Kappe 1/6 bindet fast immer, Zahl wirkt nur bei Gap-Einstiegen.
- Darvas: RS-Rang nutzt build.mjs-Komposit (0,4/0,2/0,2/0,2 ueber 63/126/189/252 Tage) mit 1-Mio-Querschnittsfilter – verdeckte Selektionsregel.
- Darvas-Signalstufe A/B gated nichts; alle B-Setups werden gehandelt (darvas.mjs:131).
- Trend52 ist komplett eigenstaendig (kein PORTFOLIO_DEFAULTS, kein simulator.mjs): kein Defaults-Erbe, aber ETF-Ausschluss nur upstream (build.mjs:106-121).

## Widersprueche Doku vs. Code
1. Turtle-Aufnahme: ENTRY_EXIT_RULES.md:72 / Registry sagen "<= 6 % unter Ausbruchspunkt"; Code: nur ENTRY_READY (<= 3 %) ist PENDING (donchian-v2.mjs:104, lifecycle.mjs:22, simulator.mjs:257,278). WATCH 3-6 % wird nicht persistiert, offenes Setup faellt bei >3 % (LC-SETUP-LOST). Aus Codelesung, nicht gemessen -> Messfrage.
2. model-portfolio.mjs:20-22,36 "keine Rangregel in der Quelle" (Turtle) ist falsch (R14/R15 bestaetigt).
3. METHOD_FIDELITY.md:49-54 beschreibt 1.1.0/2.0.0 (SMA-N, 0,5 % Risiko, 10 Positionen) – fuer Live 2.0.2 / 3.0.2 veraltet.
4. registry.mjs:320,336,337,340,381,383 (Darvas) beschreiben 1.2.0 (Schlusskurs, Stop an Unterkante); registry.json und Code sind 3.0.2 (Kauf-Stop, 1 % unter Kauforder).
5. darvas-v302.mjs:4 nennt die Ampel "TraderFox", :11 "VU"; R15 klassifiziert sie als FOREIGN_RULE.
6. Gate-Mapping per Praefix (build.mjs:921,923): jede DARVAS*/DONCHIAN*-Variante bekommt den Plan der Altvariante; EXECUTION_MODEL-Gate ist fest "pass = true" (gates.mjs:105). VU_TREND_52W hat gar keine Gate-Definition (NOT_COMPARABLE).

## Methodik-Hinweise
- Original- und Fremdmethoden (TURTLE_ORIGINAL_FUTURES, DARVAS_ORIGINAL, NEO_DARVAS) sind NOT_REPLICATED / NOT_REPRODUCIBLE, Tier D, ohne Engine. Keine Behauptung von Replikation.
- Tiers: DONCHIAN_TURTLE C, DARVAS_BOX C, VU_TREND_52W B (nur wegen Provenienz/Forward-Readiness, nicht wegen Evidenz; deep_dive true).
- seen_data = true fuer alle drei Engines: DEV 2016-2026 und Holdout (R14) wurden betrachtet.
- Vorwaertsevidenz praktisch null: Turtle/Darvas live seit ca. 02.10.2026, Trend52 R12 am 03.10.2026.

## Fragen an den Koordinator
- Soll "Tier" Evidenz allein oder auch Produkt-/Forward-Readiness abbilden? (Trend52 B vs. C.)
- Darf das Turtle-Rebuild "turtle-equity-adaptation" (R15 Phase 2) als eigenes Dossier gefuehrt werden? Hier bewusst nicht vermischt.
- supertrader/data/trend52.json und ledger/VU_TREND_52W.json fehlen im Sparse-Checkout: liveSince, Anzahl Entscheidungen und aktuelles Universum sind UNKNOWN.
- Soll der 3 %/6 %-Widerspruch (Turtle) als Standardmessung (Signalvollstaendigkeit) aufgenommen werden?
