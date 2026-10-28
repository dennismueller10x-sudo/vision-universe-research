# V10 – Validierung

## Trennung der Evidenzarten

| Art | V10 |
|---|---|
| Technische Rechenparität (zweite Implementierung, gleiche Daten) | Python-Referenzen je Strang (unten) |
| Quellennachweis | SEC-Originale mit Akzession, URL, SHA-256 (bzw. `sha256Normalized`, weil SEC jeder Antwort einen zufälligen Bot-Tag anhängt) und Zitat ≤ 300 Zeichen: 761 Identitäts-, 272 CA-, Dividenden- und Lifecycle-Quellen; Schattenlauf SEC-Erzeuger auf 33 aktuellen companyfacts-Antworten |
| Historische Entwicklungsstudie | Signal (5 Regeln), Pattern (15 Muster), Same Stock Replay, finanzierte Strategien – auf 2000–2025, bereits durch V7–V9 untersucht |
| Rekonstruktion | Faktorvintages/Rang-IC/Top-50 (2010–2025), Setup 2005–2025 – nie als damals veröffentlichte VU-Signale |
| Unabhängige bestätigende Prognoseevidenz | **keine**; einzig registriert: prospektive 8-K-Kohorte (V9), auswertbar ab 29.04.2027 |
| Produktzertifizierung | keine |

Eine zweite Programmiersprache ist kein Holdout. Bekannte Historie bleibt bekannt.

## Unabhängige Nachrechnungen

| Strang | Prüfungen | Ergebnis | Grenze |
|---|---|---|---|
| Signal/Pattern/Replay/Strategie | 14.573 (Primär), 14.678 (Lifecycle nach Prüfungskorrekturen) | PASS, max. rel. 9,3e-8 | Loader-Qualifikation als Eingabe übernommen; Bootstrap mit gleichem Zufallsgenerator |
| Engine-Parität Studien | 1.420.392 Signalereignisse vs. Kontrollkonstruktion, Worker vs. Direktaufruf, `runPatternStudy` 25 × 2, D1 ⊂ D2 17.978 | 0 Abweichungen | – |
| Faktor | 14.400 Kursfaktoren, 182.343 Perzentile/Scores/Ränge, 496 IC/Spread/n, Ledger 1,6e-14 | PASS | nur 8 Stichtage in Teil D; IC-Mittel/p/Holm von der Prüfung nachgerechnet; 11/302 Marktkap.-Abweichungen der einfacheren Konzeptwahl gezählt, nicht entschieden |
| Setup | 11 Prüfungen inkl. 2.000 Einzelausgänge (5e-11), N_eff = V9 | PASS | – |
| Population | 132/132 Entscheidungen, 761/761 Quellhashes, 62/62 Preisanker unabhängig wiedergefunden, 30/30 Lifecycle | PASS; 35 Rescan-Treffer manuell beurteilt, 0 echte Widersprüche | Gegenprüfung verfehlte ursprünglich die Abfindungsart (EBTC) – ergänzt |
| Corporate Actions | 600/600 Rahmen, 1.087/1.087 Entscheidungen, 30/30 Register, 272/272 Hashes, 12/12 + 8/8 Textneuparsing | PASS | gleicher Autor, gleiche Regel |
| Total Return | 8/8 Ledger, Abweichung 0 | PASS | – |
| SEC-Schatten | Code vor/nach #1043 auf identischen Antworten | 3 FY-Labels, 12 Zukunftszeilen, 9/9 Aktienzahlen wie V9 | Materialisierung im Bestand steht aus |

## Unabhängige adversariale Prüfung (getrennter Prüfagent, nur lesend)

Ergebnis: kein Look-ahead- oder Rechenfehler in den veröffentlichten Kennzahlen; geprüft und korrekt befunden: Signal-Zeitlogik (Einstieg k+1, SPY gleiche Daten), Kosten je Seite, Kontrollgruppen, Blockbootstrap und alle Holm-Familien (nachgerechnet), Registrierung vor Ergebnis (Git-Historie), Faktor-PIT (`filed < t`, Split-Faktoren nur zwischen Aktienzahl-Stichtag und Entscheidung, Normierung nur im Querschnitt), Loader fail-closed und Default byte-identisch, modale Wochenlabels ohne Outcome-Information.

| # | Befund | Schwere | Behandlung |
|---|---|---|---|
| 1 | Primärbelege Studien/Faktor auf HEAD nicht reproduzierbar (CA-Register danach erweitert, Frame 4.282 → 4.287) | MAJOR | Reproduktion am Ergebnis-Commit dokumentiert (`79bf2d5742` bzw. `77e4189e83`); Lifecycle-Lauf auf integriertem Stand |
| 2 | EBTC als Barfusion statt bar + Aktie (Endwert −95 % im Lifecycle-Lauf) | MAJOR | Parser und Gegenprüfung korrigiert, Register neu erzeugt (auch BLFS) |
| 3 | Survivorship-Sensitivität mischte bei `BASE_RATE_EXCESS` Rohrenditen ein | MAJOR | korrigiert + Regressionstest, Lifecycle-Lauf neu |
| 4 | Lifecycle-Option schloss unbelegte eingefrorene Listings ganz aus (Selektion auf Outcome) | MAJOR | jetzt Schnitt + Zensur; Population 4.404 → 4.526 |
| 5 | Primärframe enthält 79 Listings mit fortgeschriebenen Schlüssen (< 0,1 % der Beobachtungen) | MINOR | offengelegt; im Lifecycle-Lauf geschnitten; Faktor-Neulauf offen |
| 6 | Lifecycle-Schnitt verlor den echten letzten Kurs (COLA 10,45 statt 2,86) | MINOR | korrigiert + Test |
| 7 | Persistenztest D1 h = 52 ohne Sperrzone | MINOR | offengelegt, Ergebnis nicht interpretierbar (ohnehin nicht Holm-signifikant) |
| 8 | Faktor-Python prüft die berichtete Tabelle nur teilweise | MINOR | offengelegt; Prüfer hat die Tabelle nachgerechnet (identisch) |
| 9 | Faktor-Doku: IC-Reihe Gesamtrang ab 2012-09-28, nicht 2011-06; E3-Schranke 0 % | MINOR | README korrigiert |
| 10 | Fiskalkalender wirkt auf Wertauswahl; Split in derselben Woche doppelt; `DELISTED_NO_CONSIDERATION` abgeleitet | MINOR | offengelegt |

## Nach Sicht auf Zwischenergebnisse geänderte Protokolle (offengelegt, Owner-Urteil offen)

- CA 1.1.1 (Parser-Anker nach 5-Reihen-Rauchtest, vor dem Volllauf), CA 1.1.2 (nur Verschärfung, nach 193/600 Teilurteilen).
- Dividenden 1.0.1/1.0.2 (Parser), 1.0.3/1.0.4 (nur Verschärfung).
- Population 1.0.1 (Referenzquelle), 1.0.2 (Hash-Normalisierung nach 4-Fall-Probelauf), 1.0.3 (Ausschluss doppelter `canonical_id`).
- Studien/Faktor/Setup: nur Laufzeit-/Speicheränderungen nach Registrierung; ein Faktor-Debuglauf auf unvollständigen Dokumenten verworfen.

Jede Version trägt einen eigenen Hash und wurde vor dem Lauf, auf den sie wirkt, committet.

## Tests

Stand nach Integration und Korrekturen (Befehle aus CLAUDE.md, lokal):
- `node --test "quant/tests/*.test.mjs"`: siehe Abschlussbericht (vollständiger Lauf am Ende).
- `node --test "core/tests/*.test.mjs"`: 295/295.
- `python3 -m unittest discover -s scripts/quant/tests -p 'test_*.py'`: 585 OK (inkl. Bulk-Archiv-Wächter; kein V10-Skript nennt das Bulk-submissions-Archiv).
- V10-Tests: `quant/tests/v10-{population,corporate-actions,studies,factor,setup}.test.mjs`.
- `node scripts/quality/check-test-isolation.mjs`: siehe Abschlussbericht.

Isolation: Diff gegen main ohne Änderung unter `quant/data`, `discover/data`, `supertrader/data`, `social/data`, `technical/data`, `.github`, Frontend; Produktadapter und `corporate-action-evidence.js` byte-identisch; Engine-Änderungen nur in Research-Modulen (`research-weekly-loader.cjs`, `research-identity-evidence.cjs`, `research-ca-evidence.cjs`, neu `research-listing-lifecycle.cjs`).

## Ressourcen

4 CPU-Kerne, 15 GiB, kein OOM. Längste Läufe: CA-Rahmenlauf ~2,5 h, Dividenden-Ernte ~1,5 h, Identität ~100 min, PIT-Dokumente ~75 min, Studien ~16 min + Python ~7 min. SEC-Abrufe insgesamt ≈ 11.700 Einzelabrufe + 1 Bulk (1,41 GB), ≤ 2/s je Strang. Keine kostenpflichtigen Abrufe.
