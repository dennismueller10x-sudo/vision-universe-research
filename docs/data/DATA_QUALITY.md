# Datenqualität

**Engine:** `core/data-quality.js` (reine Regeln) · **CLI:** `node scripts/core/data-quality.mjs [--json] [--strict]` ·
**CI:** `core-ci.yml` (Bericht auf jedem PR, streng täglich gegen `main`).

Jede Regel ist deterministisch. Gleiche Artefakte ergeben dasselbe Ergebnis. Es gibt keine Stichproben und keinen Anbieterabruf.

| Regel | Schwere | Prüft | Fängt (belegter Fall) |
|---|---|---|---|
| DQ-ID-1 | ERROR | jede `securityId` in Konfiguration, Universum und Gate-Universen folgt `core/identity.js` | BRK-B als `ref_BRKB` |
| DQ-ID-2 | ERROR | kein doppelter Ticker und keine doppelte `securityId` im Produktuniversum | – |
| DQ-ID-3 | WARN | ein aktives Symbol hat genau ein aktives Instrument im Company Master | SGI, COHR (Börsenwechsel) |
| DQ-PX-1 | ERROR | Reihen sind sortiert, ohne Doppeldaten, haben nur positive Kurse, und der Kopf (`to`, `barCount`) passt zum Inhalt | CPTAF, DMN mit Kurs 0 |
| DQ-PX-2 | WARN | Reihen tragen die letzte abgeschlossene Sitzung; Histogramm des Rückstands | 53 Reihen ≥ 5 Sitzungen alt (AVB, LEG, WBS …) |
| DQ-PX-3 | WARN | kein Tagessprung über ±60 % in split-bereinigten Reihen; ganzzahliger Faktor = Split-Verdacht | AMOD 1,17 → 3,49 (Faktor 3) |
| DQ-PX-4 | ERROR | Tages- und Wochenreihe zeigen am selben Tag denselben Schluss (eine Preiswahrheit). Nur identische Stichtage, Toleranz eine Rundungseinheit (`roundClose`: Cent ab 1 $, vier gültige Stellen darunter); Befund als `LEVEL` (ganze Überlappung um einen Faktor daneben, mit Splitfaktor) oder `POINT` | 22./23.10.2026: AMTD ×60, DKI ×50, CAPS ×30, MBRX ×20, OBAI ×20, FRGT ×10, REVB ×7, EHGO ×5, GP ×5 (Reverse-Splits nach dem Wochenlauf) |
| DQ-PX-5 | ERROR | die Aktienseite zeigt den letzten Schluss ihrer Reihe | – |
| DQ-PX-6 | WARN | keine Tagesreihe eines im Wertpapierstamm (`us-security-master.json`) ACTIVE geführten Titels endet mit ≥ 5 exakt gleichen Schlüssen (`core/listing-staleness.js`); Verteilung der Endläufe über alle Reihen im Bericht. Nur Bericht, kein Ausschluss | 27.10.2026: 475 Titel, u. a. ADEX, CHL (ganze 270-Tage-Reihe eingefroren) |
| DQ-PX-7 | WARN | dasselbe für die Wochenreihe, ≥ 4 gleiche Wochenschlüsse | 27.10.2026: 341 Titel, u. a. VECT 173, ADEX 147, CHL 65 Wochen |
| DQ-ID-4 | WARN | Wertpapierstamm und Tagesreihe widersprechen sich nicht: Stamm nur INACTIVE, Reihe läuft aktuell weiter (Ticker-Wiederverwendung) oder eingefroren nach dem Stamm-Ende; Stamm ACTIVE, Reihe > 2 Sitzungen zu Ende | 27.10.2026: BGC, CNL, COHR, DCOM, EFOR, SGI, SUNE, TRAK (Stammzeile eines früheren Ticker-Inhabers); 95 × Stamm ACTIVE, Reihe zu Ende (u. a. DBRG, CRNX, WBS) |
| DQ-PR-1 | ERROR | Discover-Aktienindex und Aktienseiten sind deckungsgleich | – |
| DQ-PR-2 | ERROR | jeder ausgelieferte Pfad (Chartreihen, Supertrader-Kartenlinks) existiert | 4 Supertrader-Charts, 11 Kartenlinks |
| DQ-IX-1 | WARN | Indexmitglieder sind aktive, geeignete Titel; nicht zuordenbare Bestände werden genannt | TEL, DD, DOW, MRNA, COHR, P, ECHO INACTIVE; NRG, VLTO, SNDK, Q, BNY fehlen |
| DQ-TW-1 | WARN | der Technical-Screener (`technical/data`) stammt aus der aktuellen Materialisierung und liegt höchstens zwei Sitzungen zurück | Audit 26.10.2026: `technical-world.yml` lief nie automatisch |
| DQ-TW-2 | WARN | kein Tagesfeld des Technical-Katalogs ist in allen Zeilen leer | `aboveEma200`/`distEma200` vor dem ersten Lauf nach #927 |
| DQ-TW-3 | ERROR | Technical-Schluss = Schluss der Discover-Tagesreihe am selben Tag (eine Preiswahrheit) | 26.10.2026: 5.647/5.647 gleich |
| DQ-TW-4 | WARN | jeder materialisierte Titel steht im Technical-Screener oder ist in `meta.skipped` gezählt | sechs Vorzugsaktien (C-P-N, F-P-B/C/D, T-P-A/C) fielen still durch ein Dateimuster |
| DQ-SEC-1 | WARN | jedes veröffentlichte Geschäftsjahreslabel der SEC-Bundles (`quant/data/sec/consumer`) liegt höchstens ein Jahr neben dem Kalenderjahr seines Periodenendes | V9: WTBA FY 2107 für 2017, STX FY 2027 für das Jahr bis 2025-06-27, PRTH 43465/43830 |
| DQ-SEC-2 | WARN | keine veröffentlichte SEC-Zeile endet nach ihrem Einreichungsdatum (Fälligkeitsplan, erklärte Dividende, Deckblattdatum nach Annahme) | V9: ASLE Aktienzahl zum 2034-03-05 aus einem Filing von 2024, AXR 2033, PFIS 2028, AAL 2027 |
| DQ-SEC-3 | INFO | zählt je Emittent, was die Normalisierung abgelehnt hat: fy-Anker `IMPLAUSIBLE_FILING_FY` und Zukunftsperioden `FUTURE_PERIOD_END` (Bundle-Feld `quality`). INFO, weil die Ablehnung die richtige Behandlung ist; die Zahl macht Wiederkehr sichtbar | Nachbau 27.10.2026 (5.063 Bundles): IMPLAUSIBLE_FILING_FY 23 bei 19 Emittenten, FUTURE_PERIOD_END 1.084 bei 398 Emittenten; danach DQ-SEC-1 nur noch CAPS (Kalenderluecke, eigene Ursache), DQ-SEC-2 0 |
| DQ-TW-5 | WARN | jede Wochen-/Monatsspalte (`feld@1W`, `feld@1M`) ist belegt, sobald ein Bündel der Materialisierung die nötige `technical-mtf`-Version trägt; Felder, die noch kein Bündel liefern kann, stehen als „wartet“ in der Notiz (L7: 18 Spalten bis `technical-mtf-1.1.0`) | Absicherung für L7 (#1017): ohne die Regel blieben die neuen Spalten nach der Materialisierung unbemerkt leer |
| DQ-SF8-1 | ERROR | Supertrader-8-Research-Kandidaten (`supertrader/data/sf-candidates`): Stand höchstens zwei Sitzungen hinter der letzten abgeschlossenen, nicht danach | Vorbereitung V3; Daten gibt es erst nach Freigabe |
| DQ-SF8-2 | ERROR | jede Ansicht: `securityId` = `core/identity.js`, Scherbe = `shardKey`, je Methode kein Titel doppelt | ADR-001 |
| DQ-SF8-3 | ERROR | Stufe 4 gesperrt, keine Ansicht und keine Kurzzeile (`index.json`, `summary.top`) über der Obergrenze ihrer Methode (`SF8_CEILING`), Status in `summary` und `index` `LIVE_NOT_APPROVED` / `LOCKED_FOR_ALL_13` / Orders `NONE` | Vertrag 1.0.0 |
| DQ-SF8-4 | ERROR | unterhalb `MODELED_TRADE_PLAN` kein Plan und kein Orderparameter, geprüft per Allowlist der ganzen Ansicht: oberste Felder, `trend`, `sortKeys`, beschreibende Kennzahlen je Methode (`SF8_DESCRIPTIVE_FEATURES`, auch verschachtelt), Strukturmarken (`SF8_STRUCTURE_LEVELS`), Chartmarke nur als Strukturmarke der festgeschriebenen Art (`SF8_PIVOT_KINDS`); Zahlen nur in Zahlenfeldern, kein Preis in Texten, Lesarten, Kurzzeilen und Ablehnungsgründen; Statustexte wie `NOT_IN_SOURCE` erlaubt | Review SF8-R2 (BLOCKING); Owner-Entscheidung 28.10.2026: beschreibende Kennzahlen wie `closeVsGapLow` (C12) und Turtle-`N`/`nPct` zulässig, nie als Einstieg, Stop oder Order; viermal unabhängig nachgeprüft. Seit dem Chartstruktur-PR (#1056) zieht der Vertrag dem Erzeuger nach: keine Marke, die in ihrer Quelle der Orderpreis ist (C06/C07-Pivot, C13 swingLow/impulseHigh, C11 signalDayLow); unterhalb von MODELED keine C07-Korrekturtiefe, bei C06/C07/C13 kein 52-Wochen-Hoch und bei C06 nichts, woraus es sich zurückrechnen ließe (`pctBelowHigh52w`, `largestCorrection`, `vcpFootprint.depths`; `SF8_FEATURES_HIDDEN`, `SF8_SUBFIELDS_HIDDEN`, `SF8_TREND_HIDDEN`) |
| DQ-SF8-5 | ERROR | Quarantäne (V4-D1) nur als Chart-Kandidat; kein FAIL veröffentlicht; keine Stufe über einer CAP-Grenze | 83 Quarantänefälle bleiben unverändert |
| DQ-SF8-6 | ERROR | Ergebnisverträge: Schema, genau die 13 Methoden, `index.json` Pflicht, alle Strategie- und Scherbendateien, Zählungen, Stand, jede Ansicht genau einmal in ihrer Scherbe und dort gleich, `index.json` je Ansicht genau eine gleiche Zeile, `summary.top` Teilmenge davon, kein `records/` | – |
| DQ-SF8-7 | ERROR | öffentliche Teile höchstens 16 MB, jede Datei höchstens 2 MB | Lauf 23.10.: 12,7 MB, größte Datei 1,25 MB |
| DQ-SF8-8 | ERROR | Schluss jeder Ansicht = veröffentlichter Schluss derselben Identität und Sitzung (`published-close.js`, ohne Toleranz) | V4, ADR-002 |

Die DQ-SF8-Regeln prüfen jede veröffentlichte Ansicht (Strategiedateien und Scherben) und den Aktivierungszustand der Registry (`activation.state`). Für eine vorbereitete (`PREPARED_DISABLED`) oder freigegebene, noch nicht gelaufene (`ACTIVATING`) Datenart ohne Daten bestehen sie mit 0 Prüfungen. Liegen Daten ohne Freigabe vor, ist die Freigabe ohne Daten erteilt oder ist ein Teil unlesbar, ist jede Regel rot. Der Tageslauf prüft sein Ergebnis vor dem Commit mit `node scripts/core/data-quality.mjs --only=sf8 --sf8-dir=<Ausgabe> --sf8-activated --strict`.

## Erster Lauf (03.10.2026, Repository-Stand)

```
PASS   DQ-ID-1 [0/25071]  DQ-ID-2 [0/7803]  DQ-ID-3 [0/7794]
ERROR  DQ-PX-1 [2/6484]   CPTAF, DMN: Kurs 0           → behoben im Publisher, wirksam beim nächsten Refresh
WARN   DQ-PX-2 [60/6484]  {"0":6418,"1":4,"2":2,"3":5,"4":2,"5+":53}
WARN   DQ-PX-3 [203/6484] davon viele Rundungsartefakte unter 1 $ → behoben, wirksam beim nächsten Refresh
PASS   DQ-PX-4 [0/5952]   DQ-PX-5 [0/5982]   DQ-PR-1 [0/5982]
ERROR  DQ-PR-2 [15/7323]  Supertrader-Pfade → behoben im Erzeuger, wirksam beim nächsten supertrader-signals-Lauf
WARN   DQ-IX-1 [7/628]
```

Die ERROR-Befunde sind im Code behoben. Sie verschwinden aus den Daten, sobald die jeweiligen Läufe neu erzeugt haben.
Deshalb prüft `core-ci.yml` auf PRs nur als Bericht und **streng nur im täglichen Lauf gegen `main`**.

## Reparatur DQ-PX-4 (Wochenreihe nach einem Split)

Ein Split landet am Morgen danach in der Tagesreihe, in der Wochenreihe erst beim nächsten Lauf von `long-series.yml`.
Deshalb läuft dienstags bis samstags um 04:20 UTC (nach dem Nachtlauf) der **Reparaturlauf**:

1. `node scripts/market/long-series-repair-plan.mjs` vergleicht die committeten Reihen (kein Abruf). Ohne Befund endet der Lauf ohne Speicherzugriff und ohne Commit.
2. Nur die genannten Titel werden aus der Historienablage neu gebaut (`publish-long-series.mjs --only`). Bei mehr als 40 Titeln baut er nichts und ist rot: das ist ein Systemfehler, kein Split-Nachzug.
3. Nachprüfung derselben Titel. Was dann noch abweicht, wird auf den Stand vor dem Lauf zurückgesetzt, nicht veröffentlicht, und macht den Lauf rot.

Von Hand: `long-series.yml` → *Run workflow* mit `mode = repair` (findet die Titel selbst) oder `only = AMTD,GP`.

## Neue Regel hinzufügen

1. Reine Funktion in `core/data-quality.js` (Eingabe: geladene Artefakte; Ausgabe über `result()`).
2. Laden der Eingaben in `scripts/core/data-quality.mjs`.
3. Test in `core/tests/data-quality.test.mjs`: der Fehler, für den die Regel geschrieben ist, und eine Gegenprobe.
4. Zeile in dieser Tabelle.
