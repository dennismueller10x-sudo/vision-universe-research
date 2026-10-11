# Gruppe A Notizen (Momentum/Breakout, Kullamägi)

Nur Lesen, keine Messläufe, keine *.sealed.json geöffnet.

## Auffälligkeiten
- Versionen im Repo: 6 Engine-Dateien (1.1.0, 2.0.0, 3.0.0, 3.0.0-A Ablation, 3.1.0, 3.2.0). "1.0.0" existiert nur als String (kk-breakout.mjs manageCompatible, legacy-Map), keine Datei. Registry-Live = Engine-Live = 3.2.0, kein Drift im Live-Pfad.
- Engine-Variantenname KK_COMMON_BREAKOUT_BUYSTOP_R11 kommt in den Registry-Varianten nicht vor (nur KK_COMMON_BREAKOUT_DAILY); build.mjs:917 mappt per Präfix auf den DAILY-Gate-Satz. Harmlos, aber unsauber.
- Fremdregeln: im Signal-/Exit-Pfad keine (kein Marktfilter, kein Fundamentalfilter). Geteilt sind nur VU-Defaults: 5-Sitzungen-Sperre (simulator.mjs:28), Kosten 10/1 bp (execution.mjs:15), Perzentil-Querschnitt >= 1 Mio. USD (build.mjs:170).
- Umgekehrte Richtung (Isolation): KK-RISK-01 (0,5 %) liegt in engine/backtest.mjs PORTFOLIO_DEFAULTS und wird von Methoden ohne eigene portfolio-Angabe geerbt (Weinstein, laut R15 Altfall). Wer KK-Portfolio ändert, nicht die Defaults anfassen.
- Live-Ledger kann über SUPERTRADER_INTRADAY_CACHE einen Minuten-Oracle nutzen (build.mjs:369-378, 466); nicht Teil der Regelversion.
- Momentum hat eine explizite Portfolio-Policy (kk-breakout-v3.mjs:68, portfolio-policy.mjs:21), kein stilles Erben der Sizingfelder.
- EP/PS: im Repo kein Begriff CARD_ONLY. Registry sagt mode RESEARCH, product_status ADVANCED_RESEARCH, presentation NAME_ONLY, engine null. Beide aus Gate-/Backtest-Lauf ausgeschlossen (build.mjs:881). Inhaltlich bestätigt: Namenskarten.
- Kanonisches Regelbuch (fidelity/canonical/kullamagi.json) hat 11 EP- und 8 PS-Regeln, damit sind die Quellen gelesen; blockiert ist die Datenlage, nicht die Quelle.

## Widersprüche Doku vs Code
1. Regelkarte "Danach keine Sperre" (registry-r8.mjs:58) vs simulator.mjs:238/243: INV-01/INV-02 setzen die 5-Sitzungen-Sperre (nur "Setup verloren", simulator.mjs:261, ist 0). R15 hat dies als LOW geführt.
2. simulator.mjs-Header (Z. 20-21, LC-CONFLICT-01: Invalidation vor Bestätigung) vs Kauf-Stop-Pfad (Z. 182-233 läuft vor Z. 238): Momentum 3.x kauft auch an Tagen, an denen der Schluss unter das Basistief fällt.
3. Registry research_status/source_fidelity "Hoch / PRIMARY_EXPLICIT" vs R15-Matrix (Entry MEDIUM, Portfolio LOW, Claim nicht erlaubt). Registry ist optimistischer.
4. Registry führt KK-BO-PORT-01 (max ca. 30 % über Nacht) und KK-BO-REGIME-01 als aktiv; Code erzwingt nur 25 % beim Einstieg, Regime nur Anzeige.
5. METHOD_FIDELITY.md Matrix (Stand R7: Schlusskurs-Entry, Gap-Sperre, 20 %) ist veraltet (selbst als historisch markiert; R15-T21). Round-9-Absatz darin ist aktuell.
6. R15 "Exit wörtlich original" ist hinsichtlich Tagestief-Stop eingeschränkt: Der Code nimmt das Tief des ganzen Tages (kk-breakout-v3.mjs:57-59), die Quelle das Tief bis zum Kauf. METHOD_FIDELITY (Korrektur Runde 9) nennt das selbst "systematisch zu günstig". Exit-HIGH daher nur mit Vorbehalt.
7. gates.mjs:105 EXECUTION_MODEL pass=true fest; das Gate prüft nichts.

## Fragen an den Koordinator
- Soll "CARD_ONLY" als Triage-Status für ADVANCED_RESEARCH/NAME_ONLY-Einträge gelten (im Repo nicht definiert)?
- Tier-Skala: B für Momentum (nächstes am Original, aber kein belegter Vorteil) so gewünscht, oder A erst bei belegtem Signal?
- Ist ein Deep Dive Momentum (ORH mit internen Minutendaten ab 2017) gewünscht? Das wäre die einzige Messung, die den Original-Einstieg prüft.
- Die Gruppen B-E sollten dieselben geteilten Stellen prüfen (Sperre 5, Kosten, Querschnitt 1 Mio., buy-stop-vor-Invalidation, Defaults), damit Befunde nicht doppelt gemeldet werden.
