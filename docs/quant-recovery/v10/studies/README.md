# V10 – Strang STUDIES (Signal Backtest, Pattern Evidence, Same Stock Replay)

Retrospektive Entwicklungsstudien (`evidenceKind: HISTORICAL_DEVELOPMENT_STUDY`) auf bereits untersuchter Historie 2000–2025. **NOT_CERTIFIED, productionApproved=false.** Keine Engine, kein Loader, kein Register, keine Datei unter `*/data` geändert.

## Ablauf

1. **Registrierung vor Ergebnis:** [registration-1.0.0.json](registration-1.0.0.json) (Hash `30329e97…`), committet in `8ec1833482`, bevor irgendein Outcome berechnet wurde. Enthält Population-Regel, Endpunkte, Kontrollen, Kosten, Inferenz, Mehrfachtest-Familien, Vorwissen und Entscheidungsregeln. Der Runner liest alle Parameter aus dieser Datei; ein Test prüft, dass `plan.cjs` unverändert ist.
2. **Population (PRIMARY):** `createResearchLoader` mit `{identityEvidence, corporateActionEvidence}`; V9-Frame-Regel (modale ISO-Wochenlabels, Börsen XNAS/XNYS/XASE). 4.476 qualifiziert → **4.282 Listings** (182 abweichende Wochenlabels, 12 Börse). Manifest: [source-manifest-ca-id-1.0.0.json.gz](source-manifest-ca-id-1.0.0.json.gz). Heutige Survivors – **Survivor-Kohorte**.
3. **Rechnen:** Ereignisse und Outcomes aus `research-studies.runSignalStudy` / `runReplayValidation` (unverändert, per Listing, parallel in Worker-Threads); Pattern-Merkmale aus `pattern-research.featuresAt/matchesPattern`; Inferenz `research-validation.inferTemporalBlockMean` (Kalenderblock-Bootstrap, b = 52 bzw. 104 für h = 52, 1.999 Replikate) + Holm; finanzierte Strategie über `research-portfolio.runPortfolio`.
4. **Gegenrechnung:** `python3 -I scripts/quant/v10/studies/verify_v10_studies.py` – unabhängige stdlib-Implementierung aus den Rohreihen: **PASS, 14.573 Prüfungen, 0 Fehler**, max. rel. Abweichung 9,3e-8 (Fisher-z-Näherung bzw. Ledger-Rundung). Rechenparität, kein Holdout.
5. **Engine-Parität:** 1.420.392 Signal-Ereignisse gegen die eigene Kontroll-Konstruktion (0 Abweichungen), Worker-Pfad = direkter Engine-Aufruf (25 Listings, identisch), `runPatternStudy` auf 25 Listings × 2 Patterns (Ereignisse, Zustände, Kontrollen identisch), D1 gegen D2 (17.978 Ereignisse identisch).

## Ergebnisse (PRIMARY, Belege in [ca-id/](ca-id/))

**E Signal Backtest** ([signal-backtest-evidence.json](ca-id/signal-backtest-evidence.json)) – 60 Tests, Holm: 7 Ablehnungen. Sechs davon sind **Rohrenditen** (enthalten Marktdrift: alle fünf Regeln 52 W, NEW_52W_HIGH 26 W). Einzige Holm-signifikante Kontrollaussage: **TREND_UP 13 W ggü. Basisrate −0,63 %** (Unterrendite). **Kein Überschuss ggü. SPY ist Holm-signifikant** (0/20); ggü. der Basisrate gibt es keinen signifikanten positiven Wert.

| Regel | h | n | Roh | SPY-Überschuss (p) | Basisrate-Überschuss (p) |
|---|---|---|---|---|---|
| NEW_52W_HIGH | 13 | 42.004 | +3,09 % (Holm 0,053) | +1,10 % (0,107) | +0,52 % (0,046; Holm 1) |
| NEW_52W_HIGH | 52 | 41.426 | +12,53 % * | +3,44 % (0,167) | +0,52 % (0,371) |
| MOMENTUM_IMPROVED | 13 | 65.110 | +2,78 % | +0,48 % (0,539) | −0,33 % (0,035) |
| TREND_UP | 13 | 63.166 | +2,41 % | +0,21 % (0,781) | **−0,63 % *** |
| MOMENTUM_DETERIORATED | 13 | 64.883 | +3,18 % | +0,64 % (0,336) | −0,05 % (0,840) |
| TREND_DOWN | 52 | 61.953 | +12,37 % * | +2,28 % (0,378) | −2,05 % (0,010; Holm 0,43) |

(* Holm ≤ 0,05; vollständige Tabelle 5 × 4 × 3 mit CI, Regimen, Teilperioden, Kosten und Verteilung in der Belegdatei.) V9 bleibt erhalten: Die V9-P1-Ids im V10-Frame ergeben exakt **+3,37 % roh / +1,37 % SPY-Überschuss (n 9.898)**. Der SPY-Überschuss von NEW_52W_HIGH 13 W fällt über die Teilperioden von +5,1 % (2000–07) auf −0,7 % (2020–25).

**Finanzierte Long-only-Strategie** ([funded-strategy-evidence.json](ca-id/funded-strategy-evidence.json); 10 Positionen, 13 Wochen, gleichgewichtet, 10+5 bps je Seite, 2000-01 bis 2026-04): NEW_52W_HIGH CAGR 16,5 % vs. SPY 5,9 %, MaxDD −52 %, Sharpe 0,83 (wöchentliche Differenz Holm-p 0,027; bei 20+30 bps nicht signifikant, p 0,066); TREND_UP 10,9 % (p 0,16), MOMENTUM_IMPROVED 7,7 % (p 0,42). **Auf heutigen Survivors mit zufälliger Auswahl unter >95 % nicht genommenen Signalen ist das keine Vorteilsaussage**: Delistete Verlierer fehlen vollständig. Keine Shortstrategie.

**D2 Pattern Evidence** ([pattern-evidence.json](ca-id/pattern-evidence.json)) – 15 registrierte Kursmuster × 13/52 W × 3 Endpunkte = 90 Tests, Holm: 11 Ablehnungen (9 Rohrenditen). Kontrollaussagen: strong-12m-momentum 13 W **+1,07 %** ggü. Basisrate, three-month-thrust 52 W **+6,28 %** ggü. Basisrate; **kein SPY-Überschuss Holm-signifikant**. Scope deutlich breiter als V7/V8 (11 Survivors, 1 Muster → 4.282 Listings, 15 Muster, gleichwöchige Kontrollgruppe). Positive Werte von Verlierer-/Volatilitätsmustern (deep-drawdown, high-volatility) sind auf einer Survivor-Kohorte besonders verzerrt.

**D1 Same Stock Replay** ([same-stock-replay-evidence.json](ca-id/same-stock-replay-evidence.json)) – 200 Hash-gezogene Listings, ABOVE_40W_SMA, Cooldown 13. Nur Rohrenditen Holm-signifikant (13 W +2,92 %, 52 W +13,28 %); SPY- und Basisrate-Überschuss nicht signifikant; Persistenz (frühe → späte eigene Episoden) 13 W ρ −0,03, 52 W ρ +0,17 (p 0,03, Holm 0,18). Die deskriptive Einzelaktienansicht bleibt unverändert.

**Zertifizierungsreife** ([certification-readiness-1.0.0.json](ca-id/certification-readiness-1.0.0.json)): keine Art zertifizierbar, kein Status geändert. Neu messbar erfüllt: SIGNAL Kosten/Slippage/Benchmark/Stichprobe/Abhängigkeit; SAME_STOCK_REPLAY `ruleTest` für die Regelstudie; PATTERN Scope + Engine-Parität. Weiter offen: Survivorship (alle drei), Gesamtrendite (Studie in PRICE_RETURN), OOS/unberührter Holdout, Regime-Engine-Zertifizierung.

## Abweichungen und Befunde

- **Ledger-Numéraire:** Die finanzierte Strategie läuft mit Startkapital 1 statt der registrierten 100.000 (reine Skalierung, Ergebnisse als Renditen identisch; Kapital wird auf 100.000 umgerechnet). Grund: `research-portfolio` entfernt eine auf Gewicht 0 verkaufte Position nur bei |Stück| ≤ 1e-12 (absolut); bei großen Stückzahlen bleibt Rundungsstaub, der in der Folgewoche `EXACT_PRICE_UNAVAILABLE` (oder `NEGATIVE_UNITS`) auslöst. Regressionstest dokumentiert den Fall. **Engine nicht geändert** (hashgebundene V8/V9-Baselines); Reparatur als eigener PR empfohlen.
- Bootstrap-p-Wert-Auflösung 1/2000: Holm-adjustiert minimal 0,03 (60er-Familie) bzw. 0,045 (90er).

## Survivorship

Ohne `listingLifecycleEvidence` (noch nicht im Loader, Option liefert `INVALID_LOADER_OPTIONS`) ist jede Zelle `NOT_EVALUABLE_WITHOUT_LISTING_LIFECYCLE_EVIDENCE` – nur bedingt gültig (Survivor-Kohorte). Der Code wertet `result.listingLifecycle` defensiv aus: mit/ohne delistete Listings, `TERMINAL_CONSIDERATION` (cashPerShare), Schranken −100 % und letzter Kurs, Zählung zensierter Outcomes.

## Neulauf mit anderer Loader-Konfiguration (< 30 min)

```bash
OUT=/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad/v10-private/studies
node scripts/quant/v10/studies/run-v10-studies.cjs run --out $OUT \
  --loader-options '{"identityEvidence":true,"corporateActionEvidence":true,"listingLifecycleEvidence":true}'   # ~16 min, 3 Worker
python3 -I scripts/quant/v10/studies/verify_v10_studies.py $OUT/ca-id-lifecycle .                                 # ~7 min
node scripts/quant/v10/studies/run-v10-studies.cjs publish --out $OUT --loader-options '{"identityEvidence":true,"corporateActionEvidence":true,"listingLifecycleEvidence":true}'
node scripts/quant/v10/studies/certification-readiness.cjs ca-id-lifecycle
```

Belege landen in `docs/quant-recovery/v10/studies/ca-id-lifecycle/`. Primärlauf: 972 s (Signal 632 s, Pattern + Replay 291 s), Python 429 s.

Tests: `node --test quant/tests/v10-studies.test.mjs`.
