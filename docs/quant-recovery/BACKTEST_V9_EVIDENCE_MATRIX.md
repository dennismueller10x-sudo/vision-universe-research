# V9 – Evidenzmatrix

**13/13 implementiert · 7/13 im definierten Scope abgenommen · 7/7 Erweiterungsmethoden · 0/6 zertifizierte Backtest-Arten.** Maschinenlesbar mit Datei- und Codehashes: [artifact-manifest-1.0.0.json](v9/artifact-manifest-1.0.0.json).

| Bereich | Status | V9-Nachweis und Grenze |
|---|---|---|
| SAME_STOCK_REPLAY | PARTIAL | Engine unverändert. Quellenbelegte Identitätskorrekturen (COHR, BGC, DCOM, SGI, TRAK) und ein belegter unbereinigter Split (PZZA) als Vorschlag. Survivor-by-construction bleibt strukturell. |
| PATTERN_EVIDENCE | PARTIAL | Keine neue Studie; Survivorship- und Renditebasis-Gate unverändert offen. |
| SIGNAL_BACKTEST | PARTIAL | NEW_52W_HIGH auf registrierten Populationen 1.000/3.255: positive Rohrendite, keine Überschussrendite gegenüber SPY nach Holm. Keine Regel zertifiziert. |
| SETUP_BACKTEST | PARTIAL | 4.137 Ereignisse / 20 Tage / 2 Monate / 6 ISO-Wochen. Blocker: Zeit (M6, 120 Stichtage, 180 Tage) und eine Normfrage (Empfehlung, nicht genehmigt). |
| STRATEGY_BACKTEST | PARTIAL | Ledger mit belegten Zahlungstagen/Splits/Terminalereignissen; Membership- und Faktorhistorie je 2 von 24 Monaten (frühestens ~2028-07). |
| FACTOR_RANKING_BACKTEST | PARTIAL | FY-/PIT-Defekte quellenbelegt mit Korrekturvorschlag; 1.105/1.105 Originalwertparitäten. Faktorhistorie und 12 abgeschlossene Forward-Monate fehlen zeitbedingt. |
| MONTE_CARLO | ACCEPTED_WITH_DEFINED_SCOPE | V7-Abnahme unverändert. |
| WALK_FORWARD | ACCEPTED_WITH_DEFINED_SCOPE | V8-Abnahme unverändert. |
| OUT_OF_SAMPLE | ACCEPTED_WITH_DEFINED_SCOPE | V7-Abnahme unverändert; neu eine prospektive, noch nicht auswertbare 8-K-Kohorte. |
| MARKET_REGIME | ACCEPTED_WITH_DEFINED_SCOPE | V8-Abnahme unverändert. |
| PARAMETER_SENSITIVITY | **ACCEPTED_WITH_DEFINED_SCOPE (neu)** | Vorregistrierte Abhängigkeitsdiagnostik, Kriterien C1–C6 auf P1 und P2 je 36/36 erfüllt; nur Primärendpunkt, nur NEW_52W_HIGH. Trio (C5/C6 30/36) und Überschussendpunkt ausgeschlossen. |
| EVENT_DRIVEN | **ACCEPTED_WITH_DEFINED_SCOPE (neu)** | 11.888 originale 8-K-Item-2.02-Ereignisse, Acceptance-Uhr 283/283, Positivkontrolle A1 nachgewiesen. Scope h=1-Absolutreaktion; h5/h20, Alpha und Earnings-Uhrzeit ausgeschlossen. |
| PORTFOLIO_REBALANCING | **ACCEPTED_WITH_DEFINED_SCOPE (neu, Buchführungsmechanik)** | Belegte Zahlungstage (MSFT/WMT 47/47), Splits, CRNX bar und LBRDK→CHTR Aktien; 22/22 exakte Paritäten. Spin-off, ADS, unbekannter Zahlungstag ausgeschlossen. |

Achsen je Bereich (Implementierung, Daten, Rechnung, Methode, Unabhängigkeit, wirtschaftlicher Effekt, Produktfreigabe) bleiben getrennt: Für **keinen** Bereich ist `INDEPENDENT_EVIDENCE` im Sinne eines unangetasteten Holdouts oder `ECONOMIC_ADVANTAGE` belegt; `PRODUCTION_APPROVED` ist überall `NOT_APPROVED`.
