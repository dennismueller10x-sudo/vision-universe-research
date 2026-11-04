# Vision Universe – Neustart-Plan (Stand 04.11.2026)

Ziel: in sechs Wochen launch-reif, öffentliche Beta Anfang Januar 2027 (abhängig von der Rechtsabnahme).
Dieses Dokument ist der Wiederaufnahmepunkt für jede Sitzung, die am Neustart arbeitet. Visuelle Fassung: CEO-Präsentation „Vision Universe Neustart“.

## 1. Befund

| Kennzahl | Wert | Quelle |
|---|---|---|
| Commits 28.10.–04.11. | 889 (271 Bot, 252 Merges) | `git log` |
| Offene PRs | 137, davon über 100 Entwürfe, 65 aus September oder früher | GitHub |
| Workflows | 137, davon 61 mit Schreibrecht, 58 Cron-Einträge | `.github/workflows` |
| Generierte Daten im Repo | ca. 1,66 GB / 48.000 Dateien, `.git` 3,5 GB | `du` |
| Doku-Dateien | 619 unter `docs/`, davon 90 `SUPERTRADER_*.md` | `find` |
| Gesundheitscheck | gesamt STALE (Security Master, News, Intraday, Supertrader-Kandidaten) | `node scripts/core/system-health.mjs` |

Produktstand:

| Produkt | Stand | Wichtigster Blocker |
|---|---|---|
| Discover | live | Frontend-QA seit 30.10. rot (WebKit), 167 Fonds als Aktie geführt |
| Technical | 46/54 Abnahmekriterien, kein P0/P1 offen | Owner: Lizenz Wochenkerzen, AI-Suche, Texte L4 |
| Quant | Scores/Rankings live, Backtest 0/6 Arten zertifiziert | Kein Portfolio-Risikomodell, PIT-Historie frühestens 2028-08 |
| Supertrader | 13/13 Methoden gebaut, 0 echte Backtests, 0 zertifiziert | Security Master 1.1.0 vom 11.09. → Input-Gate (60 Tage) stoppt ab 11.11. |
| Konten/Abo | technisch fertig, 1/8 Startpunkte | Recht R1/R2, Steuer S1, Branding S2, Testkauf Z1 |
| App | privater iOS-Testbuild | nach dem Web-Start |

Fünf Bremsen: Daten im Code-Repo · 137 Workflows mit unzuverlässigen GitHub-Crons · Isolations-Gates prüfen Pfade statt Verträge · Zertifizierung (frühestens 2028) als Voraussetzung für Ergebnisse · jeder Schritt läuft über den Owner.

## 2. Backtesting in drei Stufen

1. **Regeltreu** (zum Start): offene Regeln, heutige Kandidaten, keine Renditeversprechen.
2. **Historisch getestet** (Ziel 27.11.2026): echter Lauf inkl. delisteter Titel und Kosten, beschriftet „Forschung, nicht zertifiziert“.
3. **Zertifiziert** (frühestens 2028): Papierhandel SF6-PAPER-2027 muss **vor dem 01.01.2027** aktiviert sein (#1268, #1270).

Supertrader-Start mit Top 5: C01, C02, C03, C08, C12. Übrige Methoden als „in Forschung“.
Offene Lesarten in einer Sitzung entscheiden: PS-C01, PS-C03, PS-C08, PS-C12, FP-ST-03, FP-ST-05.

Quant – VU-Portfolio-Standard (Vorschlag, Owner-Entscheidung; Darstellung mit Rechtsberatung klären):
15–30 Titel, max. 8 % je Titel und 25 % je Branche · Liquiditätsgrenze · Gebühren, Spread, Slippage · delistete Titel im Lauf · Gesamtrendite gegen Gesamtrendite-Benchmark · Walk-forward · Volatilität, Max-Drawdown, Beta ausgewiesen.
Fehlende Bausteine: Risikomodell (Vol/Kovarianz), Titel- und Branchengrenzen, Gesamtrendite-Benchmark, Spread-Kostenmodell, delistete Titel in Strategie-Läufen. Neues Fachmodell → eigener PR mit Vorher/Nachher.

Später: ein gemeinsamer Backtest-Kern (`core/backtest/`) für Quant, Supertrader und Technical, eigener PR mit Vorher/Nachher-Gleichheit.

## 3. Restrukturierung

| Umbau | Vorher | Nachher |
|---|---|---|
| Generierte Daten | in `main` | eigener Datenzweig, später R2; Pages-Build holt die Daten |
| Workflows | 137 | ca. 12: `pipeline-daily`, `pipeline-intraday`, `ci`, `deploy`, `social`, `account`, `weekly-maintenance` … |
| Zeitgeber | 58 GitHub-Crons | ein Cloudflare-Takt (vorhandener Waker) |
| Gates | Pfad-Isolation | Vertragstests + CODEOWNERS; Frische alarmiert, blockiert keinen Code |
| Doku | 619 | ca. 20 lebende Seiten, Rest im Archiv |
| Offene PRs | 137 | unter 15 |
| Struktur | 48 Top-Level-Ordner | `products/<id>/{module.json,web,engine,producer.mjs,tests}`, `core/`, `services/`, `pipelines/` |

`module.json` (Steckbrief) trägt Route, Navigation, Zugang (free/pro/intern), Status, Erzeuger, Zeitplan und Frische-Grenze. Menü, Pipeline, Statusseite und Paywall lesen den Steckbrief.

Voraussetzung: Die Arbeitsregeln in `CLAUDE.md` („Gates werden nicht abgeschwächt“) ändert nur der Owner.

## 4. Arbeitsweise

1. Ein Wochenziel, eine Seite. 2. Ein PR pro Ergebnis. 3. Grüne CI genügt für Code, Doku, interne Daten, Design.
4. Owner-Freigabe nur für Geld, Recht, öffentliche Renditeaussagen, Löschen. 5. Entscheidungen gebündelt einmal täglich.
6. Tagesbericht statt Chatverlauf. 7. Fortschritt nur über gezählte Abnahmekriterien.

## 5. Fahrplan

| Phase | Zeitraum | Inhalt | Fertig, wenn |
|---|---|---|---|
| 0 Stabilisieren | 05.–10.11. | Security Master 1.3.0 (#1240), Quant-CI grün (`secrets.test.mjs` S5 vs. iOS-Workflow), Crons für News und Security Master, FV-8-Alarm, PR-Sichtung | kein STALE, CI grün, < 40 offene PRs |
| 1 Entschlacken | 09.–20.11. | Datenzweig, 12 Pipelines, Cloudflare-Takt, Vertrags-Gates, Doku-Archiv | Querschnitts-PR geht durch, eine Woche ohne Datenkonflikt |
| 2 Backtests | 09.–27.11. | Lesarten-Sitzung, V13-Lauf Top 5, interne Vorschau (#1227), Portfolio-Baukasten | Ergebnisse für 5 Methoden und 1 Musterportfolio intern sichtbar |
| 3 Launch-Reife | 23.11.–18.12. | Frontend nach Redesign-Mockups, Recht/Testkauf/Branding, Papierhandel aktiv, Backtests öffentlich als Forschung | Checkout öffentlich schaltbar, Papierhandel vor 01.01. |

Feste Termine: 10.11.2026 Security Master · 18.12.2026 Merge Papierhandel · 01.01.2027 Start Papierhandel · ca. 26.03.2027 Setup-OOS A1–A6.

## 6. Owner-Entscheidungen

1. Start als Research-Werkzeug ohne Renditeversprechen. 2. Security Master 1.3.0 sofort. 3. Arbeitsregeln in `CLAUDE.md` anpassen (Gates).
4. Daten raus aus `main`. 5. Freigaben nur für Geld/Recht/öffentliche Aussagen/Löschen. 6. Supertrader Top 5.
7. Portfolio-Baukasten in den Umfang. 8. Interne Backtest-Vorschau + Geschäftskonto mit `backtest_reviewer`.
9. Offene PRs aufräumen (Liste zur Bestätigung). 10. Lizenzangebote einholen (Kapitalmaßnahmen, Tiingo-Rechte).
