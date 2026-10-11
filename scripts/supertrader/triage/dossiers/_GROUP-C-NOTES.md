# Gruppe C Notizen (CANSLIM, PIOTROSKI_F, GREENBLATT_VALUE) - nur Lesen, keine Messläufe

## Auffälligkeiten
- Fundamentalquelle CANSLIM/Piotroski: quant/data/sec/consumer (policy as_of_latest, restated, kein PIT, kein Filed-Filter), geladen in build.mjs:628-640. Core 1.22+/PR #481 nicht beteiligt. Alle drei: fundamental_dependency HIGH, Confidence max. LOW.
- Greenblatt rechnet NICHTS: greenblatt.mjs ist eine Feld-Abdeckungsprüfung. current_assets/current_liabilities/net_ppe = 0 von 6293 (coverage.json), operating_income 66 %, total_debt 44 %. Die Felder liegen zudem in Discover US_REAL, nicht im SEC-Consumer (der enthält sie auch nicht).
- 'PIT nur für 5 Titel' ist code-bestätigt, aber als Dateizählung im Ordner golden-five-pit-coverage (build.mjs:202-211); coverage.json: survivorshipControls=false, delistingReturns=false, delistedWithPriceHistory 201.
- Piotroski: 8 von 9 Signalen stimmt, ABER voll prüfbar nur 732 von 2564 (DLEVER NO_DATA 1089, DMARGIN 1267); Kandidaten brauchen alle 8 -> schuldenfreie/Bruttogewinn-lose Firmen fallen systematisch raus (Auswahlverzerrung). Consumer: LTD fehlt bei 1809, gross_profit bei 2254 von 5073 Emittenten.
- Piotroski B/M (build.mjs:659,666-668) = Equity letztes GJ / (Aktienzahl letztes GJ x heutiger split-adjustierter Kurs): mögliche Split-/Emissionsverzerrung (aus Code abgeleitet, nicht gemessen). Quintil nur über das >=5 USD/5 Mio.-Universum.
- CAN SLIM: Nettogewinn statt EPS, Vorjahresverlust = FAIL (canslim.mjs:54-56), M ist global (alle 2639 PASS), N lax (35 % PASS). 10 Teiltreffer (Stand 2026-10-06) vs. 7 in PRODUCT_MATRIX.
- Ticker->CIK per erstem Treffer (build.mjs:635-636) statt core/identity.js: Verstoß gegen CLAUDE.md-Regel, betrifft CANSLIM und Piotroski.
- Gemeinsame/fremde Regeln: Liquiditätsgrenze close>=5 / dollarVol20>=5e6 (build.mjs:656) und RS-Querschnitt (build.mjs:160-190, >=1 Mio.) stammen von den Live-Strategien. Kein gemeinsames Stop-/Risiko-/Marktfilter-Erbe (keine Trades gerechnet).

## Doku vs. Code
- METHOD_FIDELITY:232-246 + registry.fidelity: CAN SLIM 'M fehlt'; Code hat evalM (canslim.mjs:82-90).
- METHOD_FIDELITY:248-258 + registry.fidelity: Piotroski 'B/M-Quintil fehlt im Code'; build.mjs:669-680 implementiert es (Zeitlogik/Haltedauer fehlen tatsächlich).
- Registry 'engine': null bei allen drei, obwohl Engine-Dateien existieren; Versionsangabe 0.9.0 steht nur in der Registry, nicht im Code.
- Entscheidungsdateien DECISION-R11/12/13, AUDIT-R14 enthalten keine Treffer für die drei Methoden (keine Evidenz vorhanden); PREREGISTRATION-R7.json:44: 'keine Backtests'.
- Lokaler coverage.json zeigt dailyOhlcvYears 1.07, Docs nennen Tageskurse ab 2016: Stand unklar (nicht Teil dieser Triage, aber relevant für Validierbarkeit).

## Fragen an den Koordinator
1. Soll der B/M-Split-Verdacht (Piotroski) in einer Deep-Dive-/Messphase geprüft werden, oder ist Gruppe C komplett an den Fundamental-Core-Track gebunden?
2. Greenblatt: Soll CARD_ONLY/NOT_REPRODUCIBLE bis zur Lieferung der drei Bilanzfelder bleiben (Tier C), oder als 'Datenprojekt' separat geführt werden?
3. Gilt für Teilprüfungen (kein Signal, kein Portfolio) dieselbe Tier-Skala wie für Handelsstrategien? Ich habe Piotroski B, CAN SLIM C, Greenblatt C vorgeschlagen.
4. Verifikation der Messwerte (Consumer-Statistik: 3725 Emittenten mit 8 Quartalen, 1130 ohne) stammt aus Dateilesen im Haupt-Checkout, nicht aus dem Worktree triwt.
