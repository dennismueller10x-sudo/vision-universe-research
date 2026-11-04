# Vision Universe – Neustart-Plan (Stand 04.11.2026)

Ziel: Infrastruktur schlank und erste echte Backtest-Ergebnisse in wenigen Tagen; Frontend parallel. Öffentlicher Start hängt nur noch an Recht, Steuer und Testkauf.
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

## 2. Backtesting: ab heute, rückwärts

Ein Backtest rechnet über die Vergangenheit und läuft **jetzt**. Die bisherige Planung hat das Ergebnis an eine Zertifizierung gekoppelt
(Papierhandel ab 2027, 24 Monate aufgezeichnete Snapshots). Das entfällt als Voraussetzung.

- **Historischer Backtest (jetzt):** Point-in-Time aus vorhandenen Quellen rekonstruiert (Kurse mit Split-Faktoren, SEC-Daten mit Einreichungsdatum, delistete Titel aus dem R2-Archiv), Kosten abgezogen. Intern sofort sichtbar, öffentlich mit Kennzeichnung „Forschung, nicht zertifiziert“ und offenen Grenzen (z. B. fehlende historische Indexmitgliedschaft, 83 unklare Kapitalmaßnahmen ausgeschlossen).
- **Vorwärtstest (zusätzlich):** Papierhandel SF6-PAPER-2027 ab 01.01.2027 mit eingefrorenen Regeln. Das ist nur der zusätzliche Beweis, dass die Regeln nicht nachträglich angepasst wurden. Er wird eingeschaltet und läuft im Hintergrund.
- **Ehrlicher Befund aus der Forschung:** Die Quant-Läufe V10–V13c haben nach strenger Mehrfachtest-Korrektur keinen robusten Vorsprung gegenüber dem S&P 500 gefunden. Das Produkt zeigt Ergebnisse so, wie sie sind.

Supertrader: Start mit C01, C02, C03, C08, C12. Die offenen Lesarten (PS-C01, PS-C03, PS-C08, PS-C12, FP-ST-03, FP-ST-05) entscheidet Claude nach der jeweils dokumentierten Empfehlung.
Übrige Methoden als „in Forschung“ sichtbar.

Quant – VU-Portfolio-Standard (freigegeben 04.11.2026; Darstellung als Musterportfolio mit der Rechtsberatung abstimmen):
15–30 Titel, max. 8 % je Titel und 25 % je Branche · Liquiditätsgrenze · Gebühren, Spread, Slippage · delistete Titel im Lauf · Gesamtrendite gegen Gesamtrendite-Benchmark · Walk-forward · Volatilität, Max-Drawdown, Beta ausgewiesen.
Fehlende Bausteine: Risikomodell (Vol/Kovarianz), Titel- und Branchengrenzen, Gesamtrendite-Benchmark, Spread-Kostenmodell, delistete Titel in Strategie-Läufen. Neues Fachmodell → eigener PR mit Vorher/Nachher.

Danach: ein gemeinsamer Backtest-Kern (`core/backtest/`) für Quant, Supertrader und Technical, eigener PR mit Vorher/Nachher-Gleichheit.

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

## 5. Arbeitsstränge parallel (ab 05.11.2026)

Jeder Strang ist eine eigene Claude-Sitzung, besitzt seine Pfade, mergt bei grüner CI selbst und schreibt seinen Stand nach `docs/neustart/<strang>.md`.

| Strang | Besitzt | Tag 1 | Tag 2–4 |
|---|---|---|---|
| A Infrastruktur | `.github/workflows`, `scripts/ci`, `core/registry`, Gates, `docs/` | Security Master 1.3.0 (#1240) vor 11.11., Quant-CI grün, Crons News/Security Master, FV-8-Alarm, alte PRs schließen | Datenzweig statt `main`, Workflows bündeln, Pfad-Gates → Vertragstests, Doku-Archiv, Modul-Steckbrief |
| B Supertrader-Backtest | `supertrader/`, `scripts/supertrader/` | Lesarten entscheiden, Tageslauf wieder frisch | V13-Historienlauf Top 5, Ergebnisse intern, Papierhandel 2027 aktivieren |
| C Quant-Backtest & Portfolio | `quant/`, `scripts/quant/`, `konto/admin/backtests` | Interne Backtest-Vorschau an (#1227), Strategie-Backtest mit delisteten Titeln | Portfolio-Baukasten nach VU-Standard, Musterportfolios mit Ergebnis |
| D Frontend | – | **angehalten 04.11.2026 (Owner):** Das Frontend wird in einem separaten Chat des Owners umgesetzt. Die Stränge A, B, C ändern keine Darstellung (Shell, Navigation, Seiten-Design). | – |

Außerhalb der Technik (Owner): Rechtsberatung beauftragen, Fragebogen R2, Steuerberater, Stripe-Branding, Testkauf Z1, Repo-Variable `SF8_AUTO_PUBLISH` setzen.

## 6. Owner-Entscheidungen

**Alle zehn am 04.11.2026 freigegeben** (Owner im Chat: „alles andere, was du da vorschlägst, gebe ich natürlich frei … ich verlasse mich da komplett auf dich“; Zeitplan in Tagen statt Wochen, Frontend parallel):
1. Start als Research-Werkzeug ohne Renditeversprechen. 2. Security Master 1.3.0 sofort. 3. Arbeitsregeln in `CLAUDE.md` angepasst (Gates, Freigaben).
4. Daten raus aus `main`. 5. Freigaben nur für Geld/Recht/öffentliche Renditeaussagen/Löschen. 6. Supertrader Top 5.
7. Portfolio-Baukasten in den Umfang. 8. Interne Backtest-Vorschau + Geschäftskonto mit `backtest_reviewer`.
9. Offene PRs aufräumen (geschlossene PRs bleiben wiederherstellbar). 10. Lizenzangebote einholen (Kapitalmaßnahmen, Tiingo-Rechte).
