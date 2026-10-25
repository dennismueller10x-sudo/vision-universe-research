# Supertrader 7.0 – Abschlussmatrix der 13 Strategien

Generiert von `scripts/supertrader/source-faithful/completion/sf7-completion-matrix.mjs` (sf7-completion-matrix-1.2.0). Maschinelle Felder aus `STRATEGY-SF6-READINESS.json` (Kriterien sf6-readiness-criteria-1.2.0); keine Note ist von Hand gesetzt. Kein Zustand, keine Messklasse und kein Zertifizierungskriterium ändert sich in 7.0; alle 13 Strategien bleiben LIVE_NOT_APPROVED und DIAGNOSTIC_NOT_CERTIFIED.

V4-D1-Spalte: direkt exponierte DQ-K5-Sitzungen der Referenztrades nach der 7.0-Klassifikation, Regelsatz 1.3.0 (Draft-PR #902).

| | Strategie | Zustand | Messklasse | Phasen | erfüllt | fehlt | V4-D1 (exponiert / echt / ungeklärt) | Live |
|---|---|---|---|---|---|---|---|---|
| C01 | `SF_TURTLE_S1` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | FULL_DIAGNOSTIC_STRATEGY_BACKTEST | 9 | CC-2, CC-3, CC-6, CC-7 | CC-1, CC-4, CC-5, CC-8 | 16 / 0 / 16 | LIVE_NOT_APPROVED |
| C02 | `SF_TURTLE_S2` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | FULL_DIAGNOSTIC_STRATEGY_BACKTEST | 9 | CC-1, CC-2, CC-3, CC-6, CC-7 | CC-4, CC-5, CC-8 | 14 / 0 / 14 | LIVE_NOT_APPROVED |
| C03 | `SF_DARVAS_BOX` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | MECHANICAL_COMPONENT_STUDY | 9 | CC-2, CC-4, CC-6, CC-7 | CC-1, CC-3, CC-5, CC-8 | 15 / 0 / 15 | LIVE_NOT_APPROVED |
| C04 | `SF_WEINSTEIN_INVESTOR` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | 9 | CC-1, CC-2, CC-6, CC-7 | CC-3, CC-4, CC-5, CC-8 | 0 / 0 / 0 | LIVE_NOT_APPROVED |
| C05 | `SF_WEINSTEIN_TRADER` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | 9 | CC-1, CC-2, CC-6, CC-7 | CC-3, CC-4, CC-5, CC-8 | 4 / 0 / 4 | LIVE_NOT_APPROVED |
| C06 | `SF_MINERVINI_SEPA_VCP` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | 9 | CC-2, CC-6, CC-7 | CC-1, CC-3, CC-4, CC-5, CC-8 | 0 / 0 / 0 | LIVE_NOT_APPROVED |
| C07 | `SF_MINERVINI_POWER_PLAY` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | 9 | CC-2, CC-4, CC-6, CC-7 | CC-1, CC-3, CC-5, CC-8 | 12 / 0 / 12 | LIVE_NOT_APPROVED |
| C08 | `SF_KK_BREAKOUT` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | 9 | CC-1, CC-2, CC-4, CC-6, CC-7 | CC-3, CC-5, CC-8 | 27 / 0 / 27 | LIVE_NOT_APPROVED |
| C09 | `SF_KK_EPISODIC_PIVOT` | VALIDATION_BLOCKED | NOT_MEASURABLE | – | – | CC-1, CC-2, CC-3, CC-4, CC-5, CC-6, CC-7, CC-8 | – | LIVE_NOT_APPROVED |
| C10 | `SF_KK_PARABOLIC_SHORT` | VALIDATION_BLOCKED | NOT_MEASURABLE | – | CC-1 | CC-2, CC-3, CC-4, CC-5, CC-6, CC-7, CC-8 | – | LIVE_NOT_APPROVED |
| C11 | `SF_MOKA_POCKET_PIVOT` | SOURCE_BLOCKED | SCREEN_STATISTICS | 8 | CC-4, CC-6, CC-7 | CC-1, CC-2, CC-3, CC-5, CC-8 | 9 / 0 / 9 | LIVE_NOT_APPROVED |
| C12 | `SF_MOKA_BUYABLE_GAP_UP` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | 9 | CC-2, CC-4, CC-6, CC-7 | CC-1, CC-3, CC-5, CC-8 | 14 / 0 / 14 | LIVE_NOT_APPROVED |
| C13 | `SF_RASCHKE_HOLY_GRAIL` | SOURCE_BLOCKED | NOT_MEASURABLE | 8 | CC-4, CC-6, CC-7 | CC-1, CC-2, CC-3, CC-5, CC-8 | 29 / 0 / 29 | LIVE_NOT_APPROVED |

## CC-5-Teilkriterien (Entscheidung E7-1)

CC-5 selbst bleibt, wie das Readiness-Artefakt es ableitet, für alle Referenzen offen. Die Teilkriterien zeigen, was erfüllt ist (Lauf 40122736287, Regelsatz 1.3.0; unverändert nach der EDGAR-Prüfung, Läufe 40185801366 / 40190526062, Regelsätze 1.4.0 / 1.4.1: 0 von 83 exponierten DQ-K5-Sitzungen bestätigt):

- `CC5-a-K5-RESOLVED`: every DQ-K5 session behind a reference trade verified (CONFIRMED_*)
- `CC5-b-K3-RESOLVED`: every DQ-K3 session behind a reference trade verified (criteria 1.1.0: DQ-K3 reported as well)
- `CC5-c-DATA-PR`: confirmed undeclared splits corrected in a versioned data PR (not required when none is confirmed)
- `CC5-d-RECOMPUTED`: reference recomputed on the corrected data (CA run trade- and ledger-identical to BASE with the empty overlay)
- `CC5-e-DETECTION-COMPLETE`: the detector can see every undeclared corporate action - NOT met by construction: undeclared splits with a jump below 3x (e.g. 2:1) are flagged by neither DQ-K5 nor DQ-K3
- `CC5-f-HOLDOUT`: the same check on the second test window (HOLDOUT sts1-8595...) - not computed in 7.0

| | Strategie | K5 exponiert / ungeklärt | K3 exponiert / echt / ungeklärt | a | b | c | d | e | f |
|---|---|---|---|---|---|---|---|---|---|
| C01 | `SF_TURTLE_S1` | 16 / 16 | 41 / 1 / 40 | nein | nein | entfällt | ja | nein | nein |
| C02 | `SF_TURTLE_S2` | 14 / 14 | 38 / 0 / 38 | nein | nein | entfällt | ja | nein | nein |
| C03 | `SF_DARVAS_BOX` | 15 / 15 | 30 / 0 / 30 | nein | nein | entfällt | ja | nein | nein |
| C04 | `SF_WEINSTEIN_INVESTOR` | 0 / 0 | 5 / 1 / 4 | ja | nein | entfällt | ja | nein | nein |
| C05 | `SF_WEINSTEIN_TRADER` | 4 / 4 | 9 / 0 / 9 | nein | nein | entfällt | ja | nein | nein |
| C06 | `SF_MINERVINI_SEPA_VCP` | 0 / 0 | 0 / 0 / 0 | ja | ja | entfällt | ja | nein | nein |
| C07 | `SF_MINERVINI_POWER_PLAY` | 12 / 12 | 39 / 0 / 39 | nein | nein | entfällt | ja | nein | nein |
| C08 | `SF_KK_BREAKOUT` | 27 / 27 | 95 / 1 / 94 | nein | nein | entfällt | ja | nein | nein |
| C11 | `SF_MOKA_POCKET_PIVOT` | 9 / 9 | 25 / 0 / 25 | nein | nein | entfällt | ja | nein | nein |
| C12 | `SF_MOKA_BUYABLE_GAP_UP` | 14 / 14 | 69 / 1 / 68 | nein | nein | entfällt | ja | nein | nein |
| C13 | `SF_RASCHKE_HOLY_GRAIL` | 29 / 29 | 99 / 0 / 99 | nein | nein | entfällt | ja | nein | nein |

## C01 `SF_TURTLE_S1`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | Unit-, Korrelationsgruppen- und Failsafe-Logik neu geprüft, kein Fehler in der Referenz; SF7-D3 (OPTIMISTIC-Alternative übersah einen sicheren Stop am Einstiegstag) als versionierte Lesart OPTIMISTIC_CERTAIN_RULE behoben (sf-turtle-1.3.0); Referenz und alte Lesarten hashgleich (Lauf 40170829944) |
| Technisch vollständig | 9/9 Phasen, vollständiger diagnostischer Backtest (Aktien-Adaption) |
| Nachgewiesene Originalregeln | Original Turtle Rules (W-TUR, englisch); die Failsafe-Lesart ist im Original mehrdeutig, beide Lesarten laufen |
| Modellannahmen | Aktien statt Futures, Units auf Eigenkapital, keine PIT-Korrelationsgruppen (SIC-Proxy nur Research, E4) |
| Vollständige Research-Simulation | ja |
| Vollständiger diagnostischer Backtest | ja, FULL_DIAGNOSTIC mit Datenausnahme |
| Belastbare Daten | DEV-Snapshot 2016–2026 EXACT; Holdout survivorship-belastet |
| Gesperrte Daten | PIT-Korrelationsgruppen; V4-D1-Rest |
| Ausführungsrealismus | Tagesbalken, Stop intraday, pessimistische Reihenfolge am selben Tag |
| Manuelle Prüfung | keine |
| Nächster konkreter Schritt | Quelle für PIT-Korrelationsgruppen (E7-5); V4-D1-Rest (E7-1) |
| Zertifizierung erfüllt / fehlt | CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-6-REPRODUCIBLE, CC-7-EXECUTION / CC-1-SOURCE, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-8-OOS |
| Belege | Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache); Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution); Draft-PR #921 E7-1 gezielte EDGAR-Prüfung (Regelsatz 1.4.1, Lauf 40190526062, 260 Anfragen; Vorher 1.4.0, Lauf 40185801366, 303 Anfragen): 83 Sitzungen, 0 bestätigte Splits; docs/SUPERTRADER_7_EDGAR_CA_CHECK.md; Draft-PR #911 SF7-D3 / SF7-D4 als versionierte Varianten, SF6-PAPER-2027 1.1.0 nicht aktiv (Läufe 40170829944 sf-research, 40170832007 sf4-lifecycle) |

## C02 `SF_TURTLE_S2`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | wie C01 (gemeinsame Engine): kein Fehler in der Referenz; SF7-D3 als versionierte Lesart behoben |
| Technisch vollständig | 9/9 Phasen, vollständiger diagnostischer Backtest |
| Nachgewiesene Originalregeln | Original Turtle Rules (W-TUR, englisch) |
| Modellannahmen | Aktien-Adaption, keine PIT-Korrelationsgruppen |
| Vollständige Research-Simulation | ja |
| Vollständiger diagnostischer Backtest | ja, FULL_DIAGNOSTIC mit Datenausnahme |
| Belastbare Daten | DEV-Snapshot EXACT |
| Gesperrte Daten | PIT-Korrelationsgruppen; V4-D1-Rest |
| Ausführungsrealismus | Tagesbalken, pessimistisch |
| Manuelle Prüfung | keine |
| Nächster konkreter Schritt | Quelle für PIT-Korrelationsgruppen (E7-5); V4-D1-Rest; SF6-PAPER-2027 1.1.0 (vorbereitet, nicht aktiv) |
| Zertifizierung erfüllt / fehlt | CC-1-SOURCE, CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-6-REPRODUCIBLE, CC-7-EXECUTION / CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-8-OOS |
| Belege | Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache); Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution); Draft-PR #921 E7-1 gezielte EDGAR-Prüfung (Regelsatz 1.4.1, Lauf 40190526062, 260 Anfragen; Vorher 1.4.0, Lauf 40185801366, 303 Anfragen): 83 Sitzungen, 0 bestätigte Splits; docs/SUPERTRADER_7_EDGAR_CA_CHECK.md; Draft-PR #911 SF7-D3 / SF7-D4 als versionierte Varianten, SF6-PAPER-2027 1.1.0 nicht aktiv (Läufe 40170829944 sf-research, 40170832007 sf4-lifecycle) |

## C03 `SF_DARVAS_BOX`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | SF7-D1: 8.596 von 17.002 angenommenen Stops am Einstiegstag sind sicher (Schluss am oder unter dem Stop); als Variante, Referenz unverändert |
| Technisch vollständig | 9/9 Phasen als Modellstudie |
| Nachgewiesene Originalregeln | How I Made $2,000,000 (B06, englisch); Box-Konstruktion teils mehrdeutig |
| Modellannahmen | Box-Beginn, Auswahl, Größe (8 manuelle Entscheidungen ersetzt) |
| Vollständige Research-Simulation | ja |
| Vollständiger diagnostischer Backtest | nur Modellstudie |
| Belastbare Daten | DEV-Snapshot EXACT |
| Gesperrte Daten | V4-D1-Rest |
| Ausführungsrealismus | Tagesbalken; die Referenz misst die pessimistische Intrabar-Annahme (Eigentümerentscheidung D-DARVAS-SIZE-INTRABAR) |
| Manuelle Prüfung | 8 essenzielle Entscheidungen |
| Nächster konkreter Schritt | Eigentümerentscheidungen zu den manuellen Darvas-Regeln; V4-D1-Rest |
| Zertifizierung erfüllt / fehlt | CC-2-LIFECYCLE, CC-4-DATA, CC-6-REPRODUCIBLE, CC-7-EXECUTION / CC-1-SOURCE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS |
| Belege | Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache); Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution); Draft-PR #921 E7-1 gezielte EDGAR-Prüfung (Regelsatz 1.4.1, Lauf 40190526062, 260 Anfragen; Vorher 1.4.0, Lauf 40185801366, 303 Anfragen): 83 Sitzungen, 0 bestätigte Splits; docs/SUPERTRADER_7_EDGAR_CA_CHECK.md |

## C04 `SF_WEINSTEIN_INVESTOR`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | SF7-D1 gezählt (1 sicherer Ausstieg), nur Variante |
| Technisch vollständig | 9/9 Phasen als Modellstudie |
| Nachgewiesene Originalregeln | Weinstein 1988 (B09, englisch) |
| Modellannahmen | Stage-Urteil, Volumen, RS, Overhead Supply (14 manuelle Entscheidungen); SIC3-Gruppenstärke als Research-Proxy |
| Vollständige Research-Simulation | ja |
| Vollständiger diagnostischer Backtest | nur Modellstudie |
| Belastbare Daten | DEV-Snapshot EXACT |
| Gesperrte Daten | PIT-Branchen-Stage, NYSE-Breite |
| Ausführungsrealismus | Wochenschlüsse, tägliche Ausführung |
| Manuelle Prüfung | 14 essenzielle Entscheidungen |
| Nächster konkreter Schritt | PIT-Branchenhistorie; Eigentümerentscheidung, ob V4-D1-Exposition 0 für CC-5 genügt |
| Zertifizierung erfüllt / fehlt | CC-1-SOURCE, CC-2-LIFECYCLE, CC-6-REPRODUCIBLE, CC-7-EXECUTION / CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-8-OOS |
| Belege | Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache); Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution); Draft-PR #921 E7-1 gezielte EDGAR-Prüfung (Regelsatz 1.4.1, Lauf 40190526062, 260 Anfragen; Vorher 1.4.0, Lauf 40185801366, 303 Anfragen): 83 Sitzungen, 0 bestätigte Splits; docs/SUPERTRADER_7_EDGAR_CA_CHECK.md |

## C05 `SF_WEINSTEIN_TRADER`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | SF7-D1 gezählt (4 sichere Ausstiege), nur Variante |
| Technisch vollständig | 9/9 Phasen als Modellstudie |
| Nachgewiesene Originalregeln | Weinstein 1988 (B09, englisch) |
| Modellannahmen | 12 manuelle Entscheidungen ersetzt |
| Vollständige Research-Simulation | ja |
| Vollständiger diagnostischer Backtest | nur Modellstudie |
| Belastbare Daten | DEV-Snapshot EXACT |
| Gesperrte Daten | PIT-Branchen-Stage, NYSE-Breite; V4-D1-Rest |
| Ausführungsrealismus | Wochenschlüsse, tägliche Ausführung |
| Manuelle Prüfung | 12 essenzielle Entscheidungen |
| Nächster konkreter Schritt | PIT-Branchenhistorie; V4-D1-Rest |
| Zertifizierung erfüllt / fehlt | CC-1-SOURCE, CC-2-LIFECYCLE, CC-6-REPRODUCIBLE, CC-7-EXECUTION / CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-8-OOS |
| Belege | Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache); Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution); Draft-PR #921 E7-1 gezielte EDGAR-Prüfung (Regelsatz 1.4.1, Lauf 40190526062, 260 Anfragen; Vorher 1.4.0, Lauf 40185801366, 303 Anfragen): 83 Sitzungen, 0 bestätigte Splits; docs/SUPERTRADER_7_EDGAR_CA_CHECK.md |

## C06 `SF_MINERVINI_SEPA_VCP`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | Quelleninventur: 346 Befunde, englische W-MIN18-Zeilen im Vertrag, 3 quellengestützte Varianten (Flat Base, 25 %-Lesart, RS-Linie), Diagnosen (größter Rückgang, Halbgewinn-Stop, Nach-Ausbruch-Belege aus E7-2); 154 Befunde klassifiziert; REF ledger-identisch (Lauf 40172178386) |
| Technisch vollständig | 9/9 Phasen als Modellstudie (4.0-Engine unverändert) |
| Nachgewiesene Originalregeln | Bücher vollständig im Projekt, nur Übersetzungen (B12 id, B07 id, B03 vi); englische Bestätigung nur über W-MIN18; Trend-Template-Zahlen in zwei Übersetzungen gleich |
| Modellannahmen | 19 Lifecycle- und 6 sf7-Modellannahmen, jede klassifiziert (Inventur) |
| Vollständige Research-Simulation | ja |
| Vollständiger diagnostischer Backtest | nur Modellstudie |
| Belastbare Daten | DEV-Snapshot EXACT; PIT-EPS split-korrigiert, wo belegbar |
| Gesperrte Daten | IBD-RS-Historie, Schätzungen / Überraschungen / Guidance |
| Ausführungsrealismus | Buy-Stop-Limit am Pivot, pessimistisch; SF7-D4 (OPTIMISTIC-Alternative) als SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE behoben, alle 21 Varianten hashgleich (Lauf 40170832007) |
| Manuelle Prüfung | 11 essenzielle Entscheidungen (Priorität, Earnings-Qualität, VCP-Gültigkeit, RS) |
| Nächster konkreter Schritt | Eigentümer: englische Ausgabe oder Entscheidung über Übersetzungsbelege (CC-1); CC-5-Teilkriterien (E7-1); Minervini-Ausstiegsvarianten (E7-7) |
| Zertifizierung erfüllt / fehlt | CC-2-LIFECYCLE, CC-6-REPRODUCIBLE, CC-7-EXECUTION / CC-1-SOURCE, CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-8-OOS |
| Belege | Draft-PR #899 Minervini-Quelleninventur und E7-2-Klassifikation (Lauf 40172178386, sf7-minervini-1.3.0); docs/SUPERTRADER_7_MINERVINI_SOURCE_INVENTORY.md; Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache); Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution); Draft-PR #921 E7-1 gezielte EDGAR-Prüfung (Regelsatz 1.4.1, Lauf 40190526062, 260 Anfragen; Vorher 1.4.0, Lauf 40185801366, 303 Anfragen): 83 Sitzungen, 0 bestätigte Splits; docs/SUPERTRADER_7_EDGAR_CA_CHECK.md; Draft-PR #911 SF7-D3 / SF7-D4 als versionierte Varianten, SF6-PAPER-2027 1.1.0 nicht aktiv (Läufe 40170829944 sf-research, 40170832007 sf4-lifecycle) |

## C07 `SF_MINERVINI_POWER_PLAY`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | VCP-Differenz B12 / B03 zugunsten der Referenz aufgelöst; Korrekturspanne präzisiert (20 %, niedrigpreisig etwa 25 %); REF ledger-identisch |
| Technisch vollständig | 9/9 Phasen als Modellstudie |
| Nachgewiesene Originalregeln | Bücher nur als Übersetzung; englische Bestätigung für Stop und Größe (W-MIN18) |
| Modellannahmen | Pivot, Urteil zum Startvolumen, Schwelle „niedrigpreisig“ |
| Vollständige Research-Simulation | ja |
| Vollständiger diagnostischer Backtest | nur Modellstudie |
| Belastbare Daten | DEV-Snapshot EXACT |
| Gesperrte Daten | V4-D1-Rest |
| Ausführungsrealismus | wie SEPA; SF7-D4 behoben (versionierte Variante) |
| Manuelle Prüfung | 6 essenzielle Entscheidungen |
| Nächster konkreter Schritt | CC-1-Entscheidung wie SEPA; V4-D1-Rest |
| Zertifizierung erfüllt / fehlt | CC-2-LIFECYCLE, CC-4-DATA, CC-6-REPRODUCIBLE, CC-7-EXECUTION / CC-1-SOURCE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS |
| Belege | Draft-PR #899 Minervini-Quelleninventur und E7-2-Klassifikation (Lauf 40172178386, sf7-minervini-1.3.0); docs/SUPERTRADER_7_MINERVINI_SOURCE_INVENTORY.md; Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution); Draft-PR #921 E7-1 gezielte EDGAR-Prüfung (Regelsatz 1.4.1, Lauf 40190526062, 260 Anfragen; Vorher 1.4.0, Lauf 40185801366, 303 Anfragen): 83 Sitzungen, 0 bestätigte Splits; docs/SUPERTRADER_7_EDGAR_CA_CHECK.md; Draft-PR #911 SF7-D3 / SF7-D4 als versionierte Varianten, SF6-PAPER-2027 1.1.0 nicht aktiv (Läufe 40170829944 sf-research, 40170832007 sf4-lifecycle) |

## C08 `SF_KK_BREAKOUT`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | neu geprüft (Einstieg zur Eröffnung: keine Mehrdeutigkeit am Einstiegstag); keine technisch lösbare Lücke |
| Technisch vollständig | 9/9 Phasen als Modellstudie |
| Nachgewiesene Originalregeln | Kullamägi-Webprimärquellen (englisch) |
| Modellannahmen | Setup-Qualität, Größe (7 manuelle Entscheidungen) |
| Vollständige Research-Simulation | ja |
| Vollständiger diagnostischer Backtest | nur Modellstudie |
| Belastbare Daten | DEV-Snapshot EXACT |
| Gesperrte Daten | V4-D1-Rest |
| Ausführungsrealismus | nächste Eröffnung / Stop; geringe Trade-Stabilität durch Knock-on (E6) |
| Manuelle Prüfung | 7 essenzielle Entscheidungen |
| Nächster konkreter Schritt | Eigentümerentscheidungen zu den manuellen Regeln; V4-D1-Rest |
| Zertifizierung erfüllt / fehlt | CC-1-SOURCE, CC-2-LIFECYCLE, CC-4-DATA, CC-6-REPRODUCIBLE, CC-7-EXECUTION / CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS |
| Belege | Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache); Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution); Draft-PR #921 E7-1 gezielte EDGAR-Prüfung (Regelsatz 1.4.1, Lauf 40190526062, 260 Anfragen; Vorher 1.4.0, Lauf 40185801366, 303 Anfragen): 83 Sitzungen, 0 bestätigte Splits; docs/SUPERTRADER_7_EDGAR_CA_CHECK.md |

## C09 `SF_KK_EPISODIC_PIVOT`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | SF7-D2: versiegelte EP-Trade-Kennzahlen waren leer (Feld pnl) – behoben; SF7-D5: sicherer Stop in der Füll-Minute unter der optimistischen Minutenregel – Variante; Cache-Lauf mit 0 Abrufen, EP-Referenz identisch |
| Technisch vollständig | chartbasierte Intraday-Modellstudie auf einer Stichprobe |
| Nachgewiesene Originalregeln | Kullamägi-EP-Artikel (englisch); Katalysator nicht prüfbar |
| Modellannahmen | Gap-Screen, ORH-Einstieg, IEX-Volumentempo |
| Vollständige Research-Simulation | Stichprobenstudie |
| Vollständiger diagnostischer Backtest | als Strategie nicht messbar |
| Belastbare Daten | IEX-Minuten ab 2017 (Cache) |
| Gesperrte Daten | Katalysator-/News-Historie, konsolidiertes Intraday-Volumen |
| Ausführungsrealismus | nur IEX-Minuten; Stop am selben Tag nur gegen IEX-Tiefs geprüft (offenes Risiko) |
| Manuelle Prüfung | 2 essenzielle Entscheidungen |
| Nächster konkreter Schritt | Budgetentscheidung für eine größere Stichprobe (E5); Katalysatorkalender aus SEC-8-K-Zeitstempeln |
| Zertifizierung erfüllt / fehlt | – / CC-1-SOURCE, CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS |
| Belege | Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache) |

## C10 `SF_KK_PARABOLIC_SHORT`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | Stichprobencode neu geprüft, kein Fehler |
| Technisch vollständig | hypothetische Einzeltrade-Studie |
| Nachgewiesene Originalregeln | Kullamägi-Webprimärquellen |
| Modellannahmen | Kontexturteil (4 manuelle Entscheidungen) |
| Vollständige Research-Simulation | hypothetisch |
| Vollständiger diagnostischer Backtest | nicht ausführbar: keine Borrow-/Locate-Historie |
| Belastbare Daten | IEX-Minuten ab 2017 |
| Gesperrte Daten | Borrow-, Locate-, Leihgebühr-Historie; Uptick-Rule-Modell |
| Ausführungsrealismus | nur hypothetische Shorts |
| Manuelle Prüfung | 4 essenzielle Entscheidungen |
| Nächster konkreter Schritt | Quelle für Borrow-Historie (Lizenz-/Kostenentscheidung) |
| Zertifizierung erfüllt / fehlt | CC-1-SOURCE / CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS |
| Belege | Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache) |

## C11 `SF_MOKA_POCKET_PIVOT`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | neu geprüft; keine technisch lösbare Lücke (Stop bleibt SOURCE_BLOCKED, Modellvariante nach E3) |
| Technisch vollständig | 8/9 Phasen; 9/9 nur als Modellvariante |
| Nachgewiesene Originalregeln | Morales/Kacher-Webprimärquellen; Initialstop nicht in der Quelle |
| Modellannahmen | 7 manuelle Entscheidungen; Stop am Signaltagstief als Variante |
| Vollständige Research-Simulation | ja |
| Vollständiger diagnostischer Backtest | nur Modellstudie |
| Belastbare Daten | DEV-Snapshot EXACT |
| Gesperrte Daten | Stopregel (Quelle); konsolidiertes Intraday-Volumen |
| Ausführungsrealismus | Schluss / nächste Eröffnung |
| Manuelle Prüfung | 7 essenzielle Entscheidungen |
| Nächster konkreter Schritt | Quelle für die Stopregel |
| Zertifizierung erfüllt / fehlt | CC-4-DATA, CC-6-REPRODUCIBLE, CC-7-EXECUTION / CC-1-SOURCE, CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS |
| Belege | Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache); Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution); Draft-PR #921 E7-1 gezielte EDGAR-Prüfung (Regelsatz 1.4.1, Lauf 40190526062, 260 Anfragen; Vorher 1.4.0, Lauf 40185801366, 303 Anfragen): 83 Sitzungen, 0 bestätigte Splits; docs/SUPERTRADER_7_EDGAR_CA_CHECK.md |

## C12 `SF_MOKA_BUYABLE_GAP_UP`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | neu geprüft; 50-Sitzungen-Fenster bleibt deklarierte Konvention |
| Technisch vollständig | 9/9 Phasen als Modellstudie |
| Nachgewiesene Originalregeln | Morales/Kacher-Webprimärquellen; Volumenfenster mehrdeutig |
| Modellannahmen | 8 manuelle Entscheidungen; D-BGU-VOLWINDOW |
| Vollständige Research-Simulation | ja |
| Vollständiger diagnostischer Backtest | nur Modellstudie |
| Belastbare Daten | DEV-Snapshot EXACT |
| Gesperrte Daten | V4-D1-Rest |
| Ausführungsrealismus | Eröffnungs-/Gap-Füllungen |
| Manuelle Prüfung | 8 essenzielle Entscheidungen |
| Nächster konkreter Schritt | Eigentümerentscheidungen zu den manuellen Regeln; V4-D1-Rest |
| Zertifizierung erfüllt / fehlt | CC-2-LIFECYCLE, CC-4-DATA, CC-6-REPRODUCIBLE, CC-7-EXECUTION / CC-1-SOURCE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS |
| Belege | Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache); Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution); Draft-PR #921 E7-1 gezielte EDGAR-Prüfung (Regelsatz 1.4.1, Lauf 40190526062, 260 Anfragen; Vorher 1.4.0, Lauf 40185801366, 303 Anfragen): 83 Sitzungen, 0 bestätigte Splits; docs/SUPERTRADER_7_EDGAR_CA_CHECK.md |

## C13 `SF_RASCHKE_HOLY_GRAIL`

| Frage | Antwort |
|---|---|
| Was hat sich in 7.0 geändert? | SF7-D1 gezählt (127 sichere Ausstiege), nur Variante |
| Technisch vollständig | 8/9 Phasen; Trailing nur als Modellvariante |
| Nachgewiesene Originalregeln | Einstieg/Stop aus der gekennzeichneten Sekundärquelle W-RAS97; Trailing und Größe nicht in den Quellen |
| Modellannahmen | 3 manuelle Entscheidungen; Trailing über Swing-Tiefs als Variante (E3) |
| Vollständige Research-Simulation | ja |
| Vollständiger diagnostischer Backtest | nur Modellstudie |
| Belastbare Daten | DEV-Snapshot EXACT |
| Gesperrte Daten | Trailing-Regel (Quelle) |
| Ausführungsrealismus | Tagesbalken, pessimistisch |
| Manuelle Prüfung | 3 essenzielle Entscheidungen |
| Nächster konkreter Schritt | Primärquelle für Trailing / Größe |
| Zertifizierung erfüllt / fehlt | CC-4-DATA, CC-6-REPRODUCIBLE, CC-7-EXECUTION / CC-1-SOURCE, CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS |
| Belege | Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache); Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution); Draft-PR #921 E7-1 gezielte EDGAR-Prüfung (Regelsatz 1.4.1, Lauf 40190526062, 260 Anfragen; Vorher 1.4.0, Lauf 40185801366, 303 Anfragen): 83 Sitzungen, 0 bestätigte Splits; docs/SUPERTRADER_7_EDGAR_CA_CHECK.md |
