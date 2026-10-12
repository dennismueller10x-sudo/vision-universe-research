# Supertrader: vollständiger Tournament-Rerun

## Executive Summary

Previously measured methods: 6; Previously data-blocked methods: 6; Newly certified methods: 0; Still blocked methods: 6.

Execution bugs found: LEGACY_MOMENTUM_LOOKAHEAD_OUTSIDE_SIX, PIOTROSKI_FISCAL_PERIOD_RESOLUTION_STANDALONE_INACTIVE. Data bugs found: TERMINAL_HINT_KNOWLEDGE_TIME_FILTER, UNSUPPORTED_NOMINAL_PIT_LISTING_FLAG, SEC_ACCEPTANCE_CLOCK_CONFLICT. Tournament participants after certification: 6.

Historisches Fenster: 2018-01-02 bis 2026-09-30; Warmup ab 2015-01-01. ActualCurrentAsOf: 2026-10-09; requestedAsOf: 2026-10-09; closedAt: 2026-10-12T16:16:09.675Z; Freshness: EXACT_CLOSED_SESSION.

Tier A/B/C/D: 0/0/6/0. Best systematic: cross_sectional_momentum; Best legendary: WEINSTEIN_STAGE_DAILY.

Strongest signal evidence: cross_sectional_momentum; Best portfolio evidence: cross_sectional_momentum; Best risk profile: KULLAMAGI_DAILY_ADAPTATION. Current strongest matches: Aktienidentitäten privat; relative Methoden Keine. Multi-method consensus: kein qualifizierter Consensus; PARTIAL-Diagnostik getrennt. Relative Best-IDs stammen aus dem Review und sind keine qualifizierten Gewinner.

Die tatsächlichen historischen Läufe, der Source-Control, alle achtzehn exakten eingefrorenen Sensitivitäts-Replays mit privaten Rohkurven/Trades und der frische Current-Lauf wurden unabhängig numerisch und im Red Team geprüft. Die Replays ändern keine Strategieregeln und dienen keiner nachträglichen Parameterwahl. Dieser Report veröffentlicht nur Counts, Enums und Richtungen. Alle Provider-Metriken und Aktienidentitäten bleiben im Owner-Paket.

Zehn Engines; sechs PARTIAL historische Teilnehmer und dieselben sechs im Source-Control; vier datenblockierte Engines. Zwei weitere Source-/Regelkandidaten bleiben ohne Engine gesperrt. Vollständig zertifizierte Methoden und qualifizierte Gewinner: null.

Alle sechs tatsächlichen Rerun-Scores sind NULL: der korrigierte `pitListings:false`-Input lässt die Data-Quality-Komponente im unveränderten festen Algorithmus fehlen. Fehlende Komponenten werden nicht auf null gesetzt, imputiert oder mit umverteilten Gewichten ersetzt. Die tatsächlichen Raw Tiers des unveränderten Algorithmus werden erhalten; die vorab bestimmte Qualifizierungsobergrenze ist C. Overall Confidence LOW.

Die siebenundzwanzig alten educational-/Legacy-Dossierrollen sind kein measured Tier D. Gemessene Tiers: A 0, B 0, C 6, D 0. Blockierte Methoden bleiben ungerankt.

## Beobachtete Richtungen

Source-/Data-/Execution-Grenzen sind Zulassungsgründe und keine Performancebewertung. PERFORMANCE_FAIL bezeichnet ausschließlich die drei gemeinsam beobachteten adversen Richtungen NEGATIVE/BELOW/DEEPER; es verändert weder Scores noch Tiers. Ein nützliches Risk-Profil bleibt separat sichtbar.

| Methode | Signal | Portfolio vs Benchmark | Drawdown vs Benchmark | Source-Limits | Performance-Diagnostik | Eligibility | Confidence |
|---|---|---|---|---|---|---|---|
| cross_sectional_momentum | NEGATIVE | BELOW | DEEPER | DATA_LIMITED, EXECUTION_LIMITED | PERFORMANCE_FAIL | PARTIAL | LOW |
| 52_week_high_effect | NEGATIVE | BELOW | DEEPER | DATA_LIMITED, EXECUTION_LIMITED | PERFORMANCE_FAIL | PARTIAL | LOW |
| LOW_VOLATILITY | NEGATIVE | BELOW | DEEPER | DATA_LIMITED, EXECUTION_LIMITED | PERFORMANCE_FAIL | PARTIAL | LOW |
| TURTLE_S2_EQUITY_DAILY | NEGATIVE | BELOW | DEEPER | DATA_LIMITED, EXECUTION_LIMITED, FIDELITY_LIMITED | PERFORMANCE_FAIL | PARTIAL | LOW |
| WEINSTEIN_STAGE_DAILY | NEGATIVE | BELOW | SIMILAR | DATA_LIMITED, EXECUTION_LIMITED, FIDELITY_LIMITED | COMPONENT_MIXED_OR_UNAVAILABLE | PARTIAL | LOW |
| KULLAMAGI_DAILY_ADAPTATION | NEGATIVE | BELOW | SHALLOWER | DATA_LIMITED, EXECUTION_LIMITED, FIDELITY_LIMITED | COMPONENT_MIXED_OR_UNAVAILABLE | PARTIAL | LOW |

## Old-vs-new: drei Bedingungen getrennt

Original #589 → gleiche neue Source-Daten mit originaler Execution misst eine deskriptive Source-Snapshot-Differenz. Source-Control → V2 vergleicht denselben neuen Canonical-Source mit den vorab registrierten Zertifizierungs-/Execution-Overlays. Original #589 → V2 enthält beide Änderungen und ist kein rein kausaler Certification-Effekt. Alte Ergebnisse werden nicht nachträglich umetikettiert.

| Methode | Source-Snapshot-Delta: Portfolio / Signal / Risiko | Certification-Overlay-Delta | Kombiniertes Delta |
|---|---|---|---|
| cross_sectional_momentum | UNCHANGED / UNCHANGED / UNCHANGED | DECREASED / DECREASED / INCREASED | DECREASED / DECREASED / INCREASED |
| 52_week_high_effect | DECREASED / DECREASED / UNCHANGED | DECREASED / DECREASED / INCREASED | DECREASED / DECREASED / INCREASED |
| LOW_VOLATILITY | UNCHANGED / UNCHANGED / UNCHANGED | DECREASED / DECREASED / UNCHANGED | DECREASED / DECREASED / UNCHANGED |
| TURTLE_S2_EQUITY_DAILY | UNCHANGED / UNCHANGED / UNCHANGED | DECREASED / DECREASED / INCREASED | DECREASED / DECREASED / INCREASED |
| WEINSTEIN_STAGE_DAILY | UNCHANGED / UNCHANGED / UNCHANGED | DECREASED / DECREASED / DECREASED | DECREASED / DECREASED / DECREASED |
| KULLAMAGI_DAILY_ADAPTATION | UNCHANGED / UNCHANGED / UNCHANGED | DECREASED / DECREASED / INCREASED | DECREASED / DECREASED / INCREASED |

Tatsächliche am Terminal-Bar-Cutoff korrigierte Klassifikationen: 294. Ein separater Listing-End-Diagnostikcount ist damit nicht gleichzusetzen. Zertifizierte tatsächliche Terminal-Proceeds: 0.

Predeclared Overlays filtern post-terminal/undatierte Klassenhinweise und bewahren echte Zeitgrenzen. Bekannte Cash-Entitlements wären von spendbarer Settlement-Cash getrennt; ein vollständiges tatsächliches Ledger wurde nicht hergestellt. Unbekannte Terminal-Proceeds und Quarantäne bleiben Szenarien, keine realisierten Outcomes.

Die separate Legacy-Execution-Day-Low-Bugfix gilt nicht pauschal für den Kullamägi-Daily-Signal-Day-Low/Next-open-Pfad. Der standalone Piotroski-FY-Link-Resolver wurde als isolierte Implementierungsbugfix-Version ohne neue Formel, Rankings oder synthetisch umbenannte Perioden source-/unit-geprüft. Alle vier Fundamental-Engines bleiben blockiert; dieser Fix wurde im tatsächlichen historischen oder Current-Dispatch nicht aktiviert und hat keine gemessenen F-Score-Ergebnisse erzeugt.

## Current, Consensus und Forward

Der tatsächliche Current-Lauf behandelt alle zehn Engines. Vier bleiben BLOCKED; PARTIAL-Diagnostik darf nicht zum ELIGIBLE-Set werden. Qualified/Strong Consensus und vollständig qualifizierte aktuelle Kandidaten bleiben leer. Die privaten Matches sind keine Kaufempfehlung.

## Zwanzig Abschlussfragen

### 1. Welche vorher blockierten Methoden sind jetzt messbar?

Keine der sechs zuvor blockierten Methoden ist jetzt vollständig zertifiziert oder neu messbar. Ein einzelner geprüfter Source-Kontextpunkt ist keine vollständige Methodenzulassung.

### 2. Welche bleiben blockiert?

Weiterhin blockiert: gross_profitability_novy_marx, piotroski_value_fscore, greenblatt_magic_formula, value_plus_momentum, industry_momentum, residual_momentum. Vier vorhandene Engines bleiben ungemessen; zwei Kandidaten haben keine Engine.

### 3. Welche Datenverträge fehlen noch?

Es fehlen breite historische Security-/Issuer-/Full-Class-Bindung, PIT-Marktpopulation, zertifizierte Market Equity und vollständige Jahresoperanden. Industry-Membership/Source-Taxonomie und die vorab gewählte Residual-Holding-Variante fehlen ebenfalls.

### 4. Welche Execution-Probleme wurden gefunden?

Der Legacy-Momentum-Day-Low-Lookahead liegt außerhalb der sechs historischen Teilnehmer. Der standalone Piotroski-FY-Resolver wurde source-/unit-geprüft, bleibt im tatsächlichen Dispatch inaktiv. Next-open-/Settlement-Zeit und unbekannte Terminal-Proceeds begrenzen die Execution-Zertifizierung weiterhin.

### 5. Hat der Momentum-Lookahead die frühere Bewertung verändert?

Eine veränderte frühere Bewertung durch den Legacy-Momentum-Lookahead wird nicht behauptet: Dieser Legacy-Pfad ist keine der sechs gemessenen Tournament-Methoden. Der Kullamägi-Daily-Pfad verwendet den vorher geschlossenen Signal-Day-Low und Next-open. Drei Vergleichsbedingungen trennen Source-Snapshot und Certification-Overlay.

### 6. Welche Methoden zeigen jetzt positive Signal-Evidenz?

POSITIVE beobachtete Signal-Richtung: Keine. Keine bewiesene Alpha-Aussage oder ungesehene Validierung. Relative Review-Priorität: cross_sectional_momentum.

### 7. Welche schlagen SPY auf Portfolioebene?

ABOVE Portfolio-Richtung gegenüber SPY im beobachteten Panel: Keine. Relative Review-Priorität: cross_sectional_momentum; keine vollständig qualifizierten Gewinner.

### 8. Welche haben besseres Drawdown-/Risk-Profil?

SHALLOWER beobachtete Drawdown-Richtung: KULLAMAGI_DAILY_ADAPTATION. Relative Risk-Priorität: KULLAMAGI_DAILY_ADAPTATION. Terminal-Outcomes sind nicht abschließend zertifiziert.

### 9. Welche systematischen Methoden sind jetzt am stärksten?

Vom tatsächlichen Review benannte relative systematische Methoden: cross_sectional_momentum. Leere Auswahl bedeutet keine Auswahl; Daten-Confidence MEDIUM und Execution-Confidence LOW begrenzen die Evidenz.

### 10. Welche Legendary-Methoden sind jetzt am stärksten?

Vom tatsächlichen Review benannte relative Legendary-Methoden: WEINSTEIN_STAGE_DAILY. Die drei Engines sind VU-Adaptionen mit LOW Source-Fidelity; keine vollständige Original-Replikation.

### 11. Welche Methoden waren vorher nur wegen schlechter Daten benachteiligt?

Review-belegte Methoden: Keine. Ohne diese Attribution wird keine Benachteiligung allein durch schlechte Daten behauptet. Source-Snapshot- und Certification-Overlay-Delta werden getrennt gezeigt.

### 12. Welche bleiben trotz besserer Daten schwach?

Vom Review als weiterhin schwach benannte Methoden: cross_sectional_momentum, 52_week_high_effect, LOW_VOLATILITY, TURTLE_S2_EQUITY_DAILY, WEINSTEIN_STAGE_DAILY, KULLAMAGI_DAILY_ADAPTATION. Datenblockierung oder eine fehlende Score-Komponente allein beweisen keine schlechte Performance.

### 13. Gibt es Tier A?

Gemessene Tier-A-Methoden: 0. Keine vollständig qualifizierte Methode; fehlende Score-Komponenten bleiben NULL.

### 14. Gibt es Tier B?

Gemessene Tier-B-Methoden: 0. Die tatsächlichen Tiers folgen dem unveränderten Algorithmus; Gewichte werden nicht umverteilt.

### 15. Welche aktuellen Aktien erfüllen die stärksten Methoden?

Aktuelle Aktienidentitäten, Preise und Signal-Details stehen ausschließlich im Owner-Paket. Relative Current-Methoden aus dem Review: Keine. PARTIAL-Matches sind keine qualifizierten Kaufsignale.

### 16. Gibt es Multi-Method-Consensus?

Qualified/Strong Consensus ist leer. Die tatsächliche PARTIAL-Diagnostik ist getrennt und ihre Aktienidentitäten bleiben privat. Relative Consensus-Methoden: Keine; kein unabhängiger Trading-Score.

### 17. Welche Methoden sollen Forward-Ledgers erhalten?

Research-Forward-Watch: cross_sectional_momentum, WEINSTEIN_STAGE_DAILY, KULLAMAGI_DAILY_ADAPTATION. Ledger vorbereitet, keine echten Post-freeze-Records; geschlossene Baseline-Snapshots sind keine Forward-Signale.

### 18. Welche Deep Dives sind jetzt wirklich gerechtfertigt?

Review-begründete Research-Deep-Dives: cross_sectional_momentum, WEINSTEIN_STAGE_DAILY, KULLAMAGI_DAILY_ADAPTATION. Keine erzwungene Auswahl und keine Gewinnerbehauptung; SEEN_HISTORY verlangt spätere unabhängige Prüfung.

### 19. Welche Methoden sollten nur educational bleiben?

Review-benannte educational Methoden: turtle, stan_weinstein, kullamagi_breakout, nicolas_darvas, MINERVINI, william_oneil_canslim, david_ryan, morales_kacher, dan_zanger, ed_seykota, linda_raschke, marty_schwartz, mark_ritchie, paul_tudor_jones, larry_hite, oliver_kell, leif_soreide, sean_ryan, j_law, KK_PARABOLIC_SHORT, richard_driehaus, jesse_livermore, gary_bielfeldt, william_eckhardt, tom_basso, michael_marcus, bruce_kovner. Die alten vierundzwanzig educational und drei ungemessenen Legacy-Dossiers bleiben getrennt von den tatsächlichen sechs gemessenen Tiers.

### 20. Was ist der nächste konkrete Produkt-/Research-Schritt?

Die konkreten offenen Daten-/Execution-Verträge schließen und echte Forward-Beobachtungen sammeln. Relative Research-Darstellung muss PARTIAL/LOW und Source-Limits zeigen. Keine neue Variante aus derselben Historie als ungesehen testen; kein neuer Minervini-Optimierungstrack.

## Grenzen und Quellen

Beobachtetes Panel, unzertifizierter historischer Markt-Nenner, keine breite historische Full-Class-Bindung, keine abschließende Terminal-Cash-Zertifizierung und kein ungesehener Holdout begrenzen jede Schlussfolgerung. Ein Source-Pilot oder eine bedingt freigegebene Accounting-Normalisierung stellt kein vollständiges PIT-Universum her.

Offizielle SEC-Quellen: [API-Vertrag](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [Companyfacts](https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip), [Submissions](https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip). Der Residual-Faktor-Snapshot ist [revidiertes French-Research-Material](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html), kein historischer as-known-Vintage.

Die originalen #589-Artefakte `SUPERTRADER-LEGENDARY-SOURCE-MAP.json` und `SUPERTRADER-REAL-TRADER-TRACK-RECORD-EVIDENCE.json` dokumentieren Original-Trader-Quellen und Track-Record-Evidenz. Sie bleiben von VU-Adaption, Tournament-Signal, Portfolio und Score getrennt; Originalrenditen werden keinem VU-System zugeschrieben.

Die immutable Vorabentscheidung steht in `SUPERTRADER-METHOD-ELIGIBILITY.json`; Daten-/Execution-Verträge und Source-Pilot-Grenzen stehen in `SUPERTRADER_DATA_EXECUTION_CERTIFICATION.md`. Der Owner erhält vollständige private Rohdaten, exakte Zahlen, aktuelle Aktien, Review- und Vergleichsdetails.
