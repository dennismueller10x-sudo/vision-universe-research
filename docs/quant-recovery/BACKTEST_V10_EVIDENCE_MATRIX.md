# V10 – Evidenzmatrix

**13/13 implementiert · 7/13 im definierten Scope methodisch abgenommen (7/7 Erweiterungsmethoden, unverändert) · 0/6 zertifizierte Backtest-Arten · `productionApproved=false`.** Maschinenlesbar mit Datei- und Codehashes: [artifact-manifest-1.0.0.json](v10/artifact-manifest-1.0.0.json).

Achsen: Implementierung · historischer Datenscope · Rechenvalidierung · Methode · Realstudie · Population · Renditebasis · unabhängige Bestätigung · aktiver Vertrag.

| Art | Impl. | Datenscope (V10) | Rechen-validierung | Methode | Realstudie V10 | Population | Rendite | unabh. Bestätigung | aktiver Vertrag |
|---|---|---|---|---|---|---|---|---|---|
| SAME_STOCK_REPLAY | ✔ | 200 Hash-Stichprobe aus 4.329 Listings, 2000–2025 | Python PASS | Regelstudie registriert, getrennt von deskriptiver Ansicht | ✔ kein Überschuss | Anbieter-Survivors + 121 beendete | Kurs | keine | nicht erfüllt (strukturell) |
| PATTERN_EVIDENCE | ✔ | 15 Muster, 4.329 Listings, Kontrollgruppe | Python + Engine-Parität | registriert, Holm 90 | ✔ 0 SPY-Überschüsse; 2 Basisrate-Überschüsse | dto. | Kurs | keine | nicht erfüllt |
| SIGNAL_BACKTEST | ✔ | 5 Regeln × 4 Horizonte, ~41–66 Tsd. Ereignisse je Zelle | Python 14.678/0, Engine-Parität 1,42 Mio. | registriert, Holm 60, Block-Bootstrap + Cluster, Survivorship-Schranken | ✔ 0/20 SPY-Überschüsse; finanzierte Strategien ohne kostenrobusten Vorteil | dto. | Kurs (TR nur 8 Titel belegt) | keine | nicht erfüllt (keine Regel) |
| SETUP_BACKTEST | ✔ | Original 21 Stände; Rekonstruktion 120 Listings 2005–2025 | Python 11/11 | N_eff-Modell, Holm 16 | ✔ Rekonstruktion 0/16 | Replay-Titel (Survivors) | Kurs | keine | nicht erfüllbar unter unverändertem Vertrag (OOS fest `false`); Zeit bis 2028 |
| STRATEGY_BACKTEST | ✔ | rekonstruierte Top-50 2011–2026; TR-Ledger 8 Titel | Python 1,6e-14 | Portfolioengine, PIT-Membership = damals lebende Frame-Listings | ✔ Rekonstruktion ohne Überschuss | Survivors | Kurs | keine | nicht erfüllt (Originalhistorie 2/24) |
| FACTOR_RANKING_BACKTEST | ✔ | 192 PIT-Stichtage 2010–2025, 3.957 Emittenten | Python PASS (Teilprüfung) | registriert, Holm 28, Block-Bootstrap/NW | ✔ Rang-IC 9/28; Quintil-Überschüsse 0/28 | Survivors | Kurs | keine | nicht erfüllt (Originalhistorie 2/24, Forward 0/12) |
| MONTE_CARLO | ACCEPTED_WITH_DEFINED_SCOPE (V7) | – | – | unverändert | – | – | – | – | – |
| WALK_FORWARD | ACCEPTED_WITH_DEFINED_SCOPE (V8) | – | – | unverändert | – | – | – | – | – |
| OUT_OF_SAMPLE | ACCEPTED_WITH_DEFINED_SCOPE (V7) | prospektive 8-K-Kohorte ab 29.04.2027 | – | unverändert | – | – | – | – | – |
| MARKET_REGIME | ACCEPTED_WITH_DEFINED_SCOPE (V8) | genutzt deskriptiv (SPY-Regime) in Studien | – | unverändert | – | – | – | – | – |
| PARAMETER_SENSITIVITY | ACCEPTED_WITH_DEFINED_SCOPE (V9) | Kostensensitivität in allen Studien | – | unverändert | – | – | – | – | – |
| EVENT_DRIVEN | ACCEPTED_WITH_DEFINED_SCOPE (V9) | – | – | unverändert | – | – | – | – | – |
| PORTFOLIO_REBALANCING | ACCEPTED_WITH_DEFINED_SCOPE (V9, nur belegte Buchführungsmechanik) | genutzt für 3 Signal-, 1 Faktorstrategie, 8 TR-Ledger | Paritäten PASS | **Befund:** Rundungsstaub beim Vollverkauf großer Stückzahlen (Reparatur vorbereitet, nicht angewendet) | – | – | – | – | – |

Für keine Art ist `INDEPENDENT_EVIDENCE` im Sinne eines unberührten Holdouts oder `ECONOMIC_ADVANTAGE` belegt. Die Abnahmegrenzen der sieben Erweiterungsmethoden bleiben unverändert; V10 hat keine neu abgenommen und keine zurückgenommen. Der Portfolio-Befund betrifft eine Skalierungsgrenze, nicht die abgenommene Buchführungsmechanik (Paritäten bleiben gültig).

## Datenbasis-Achsen

| Achse | V9 | V10 |
|---|---|---|
| SEC P1–P4 | Code | Code + Erzeuger wirksam (Faktbuch 68 Emittenten; Schatten); Bestand ausstehend bis 02.11. |
| PZZA | Code | Schatten CLEAN; Bestand ausstehend bis 31.10. |
| Identitätsbindungen | 5 (Dossiers) | 5 aktiv + 62 qualifiziert hinter eigener Option (Freigabe offen) |
| CA-Register | 24 Ereignisse / 23 Reihen | 30 / 28 |
| Delisting/Lifecycle | nur DQ-Warnung | 30 belegte letzte Handelstage, 122 zensierte unbelegte Enden, Option `listingLifecycleEvidence` |
| QUALIFIED (Research, ohne V10-Identität) | 4.476 | 4.526 |
| Dividenden-Vollständigkeit | MSFT/WMT 47, NVDA 46, IBM 43 | MSFT/WMT/IBM 47, NVDA 42 (V9-Fehler korrigiert) |
