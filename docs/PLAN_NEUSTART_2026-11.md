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
| D2 Frontend | Shell, Navigation, Seiten-Design | **ab 04.11.2026:** Redesign 2027 1:1 nach `docs/design/redesign-2027/` (HANDOVER.md, Master-Prompt im README), Fortschritt in `docs/design/redesign-2027/PROGRESS.md`. Baut auf den Entwürfen der früheren Sitzung D auf (#1331, Zweige `neustart/d-*`). | alle Schritte der Tabelle „Umsetzung in Schritten“ |

Außerhalb der Technik (Owner): Rechtsberatung beauftragen, Fragebogen R2, Steuerberater, Stripe-Branding, Testkauf Z1, Repo-Variable `SF8_AUTO_PUBLISH` setzen.

## 6. Owner-Entscheidungen

**Alle zehn am 04.11.2026 freigegeben** (Owner im Chat: „alles andere, was du da vorschlägst, gebe ich natürlich frei … ich verlasse mich da komplett auf dich“; Zeitplan in Tagen statt Wochen, Frontend parallel):
1. Start als Research-Werkzeug ohne Renditeversprechen. 2. Security Master 1.3.0 sofort. 3. Arbeitsregeln in `CLAUDE.md` angepasst (Gates, Freigaben).
4. Daten raus aus `main`. 5. Freigaben nur für Geld/Recht/öffentliche Renditeaussagen/Löschen. 6. Supertrader Top 5.
7. Portfolio-Baukasten in den Umfang. 8. Interne Backtest-Vorschau + Geschäftskonto mit `backtest_reviewer`.
9. Offene PRs aufräumen (geschlossene PRs bleiben wiederherstellbar). 10. Lizenzangebote einholen (Kapitalmaßnahmen, Tiingo-Rechte).

## 7. Backend-Zusätze aus dem Redesign 2027 (Projekt, nach dem Frontend)

Die Mockups (`docs/design/redesign-2027/`, README „Backend-Zusätze“) zeigen Funktionen, die es heute nicht gibt. Bis sie gebaut sind, zeigen die Seiten sie als „bald“ oder blenden sie aus, nie mit erfundenen Werten.

| # | Funktion | Folien | Baut | Hinweis |
|---|---|---|---|---|
| Z1 | Erster Start: Ziel, Erfahrung (Einsteiger · Fortgeschritten · Profi), erste Aktien; als Konto-Einstellung | E11, N6 | D2 (Seite) + Konto (`workers/vu-account`, Migration) | bauen und testen; keine Produktionsfreigabe umschalten |
| Z2 | Eine Aktienadresse `/aktie/<T>` mit Weiterleitungen der alten Adressen | N4, N5, D09, Q07 ff. | D2 | Herkunftswelt bestimmt Perspektive und Leiste |
| Z3 | Gespeicherte Suchen im Konto | Q02, Screener | D2 + Konto | |
| Z4 | Benachrichtigungen: Kursgrenze ±5 %, Jahreshoch, Quartalszahlen, Setups, neue 13F-Meldungen | E08, E09, D08, D09, H | Konto + Erzeuger | Versandweg (E-Mail über Brevo, später App-Push) braucht Owner-Freigabe |
| Z5 | Screener-Kriterien aus 13F (Hedgefonds) und Supertrader | Screener, H | A (Erzeuger) + B (Supertrader-Export) | keine Fachmodelle ändern, nur vorhandene Ergebnisse als Filter |
| Z6 | Insider-Käufe als Datenquelle | H (Entdecken) | A (neuer Erzeuger) | SEC Form 4 ist frei verfügbar; Eintrag in `core/registry/domains.json` |
| Z7 | AI Atlas mit Antworten, **visuell** in der App | E10 | D2 | Vorhandenen Worker `workers/vu-ask` übernehmen (Claude Haiku 4.5, Budget- und Tagesgrenzen, Cache): Das Modell übersetzt nur die Frage, gerechnet wird im Browser auf VU-Daten. Neu ist nur die Darstellung nach Mockup E10-b mit den VU-Bausteinen (Aktienzeilen, Urteile, Chart C06, Balken, Erklärung, Rechenweg) statt reinem Text. Modell, Budget und Grenzen bleiben unverändert. Öffentlich ohne Beta-Passwort = Owner-Freigabe (Kosten). |

Reihenfolge: Z2, Z1 und Z7 zusammen mit den Seiten, danach Z3, Z5, Z6, zuletzt Z4.

## 8. Strang E: Codex (ab 04.11.2026)

Codex (ChatGPT) arbeitet mit eigenem Nutzungslimit an Aufgaben, die keinen Claude-Strang berühren. Regeln: `AGENTS.md`.

| # | Aufgabe | Pfade | Ergebnis |
|---|---|---|---|
| E1 | Unabhängige Gegenprüfung der historischen Backtests aus B und C (Rechenweg, Look-ahead, Survivorship, Kosten, Benchmark) | nur lesen; Bericht `docs/neustart/E-codex.md` | Liste bestätigter und fraglicher Punkte mit Datei und Zeile; keine Codeänderung an B/C |
| E2 | Z6 Insider-Käufe: Erzeuger aus SEC Form 4 (frei verfügbar), Point-in-Time mit Einreichungsdatum | `scripts/insider/`, `core/registry/domains.json` (ein Eintrag), Tests | Skript mit `--out` und Tests; Strang A bindet es in die Tagespipeline ein |

## 9. Owner-Entscheidungen 05.11.2026

- **Alte PRs:** Liste aus `docs/neustart/A-infrastruktur.md` bestätigt: vorgeschlagene PRs schließen, 21 behalten.
- **Keine weiteren Datenanbieter**, auch keine Anfragen. Daten nur aus Tiingo und Marketstack. FP-ST-01 ruht.
- **Kein Buchkauf:** Die englische Minervini-Ausgabe war nur für die Zertifizierung (CC-1) nötig; Minervini-Regeln bleiben auf den bereitgestellten Übersetzungen und den englischen W-MIN18-Antworten.
- **Backtest-Ergebnisse dürfen ins Produkt**, beschriftet „Forschung, nicht zertifiziert“, mit Grenzen und ohne Renditeversprechen. Keine interne Vorschau und kein Geschäftskonto nötig. Die Darstellung wird mit der Rechtsberatung (R1) mit abgestimmt.
- **Ziel:** eine Methode finden, die den S&P 500 auf ehrlicher Basis schlägt (Strang E, E3).

### E3 (Codex): Edge-Studie gegen den S&P 500

Frage: Welche Methode oder Kombination schlägt den S&P 500 (Gesamtrendite) nach Kosten, ohne Look-ahead und ohne Überanpassung?
Vorgehen, vor dem ersten Lauf in `docs/research/edge/PROTOKOLL.md` festschreiben (vorregistriert):
- Kandidaten nur aus vorhandenen Engines und dokumentierten Regeln: Supertrader Top 5 einzeln und kombiniert; Quant-Profile konzentriert (Top 10–20 statt 15–30), mit Marktfilter (S&P über 200-Tage-Linie, sonst Cash), seltener umgeschichtet; Momentum und Qualität kombiniert.
- Zeitraum geteilt: Entwicklung 2012–2019, unangetastete Prüfung 2020–2026. Parameter nur im Entwicklungsteil wählen.
- Vergleich: SPY-Gesamtrendite, gleichgewichteter S&P 500 (RSP) und Russell 2000 (IWM); dazu risikobereinigt (Sharpe, max. Verlust).
- Mehrfachtest-Korrektur (Deflated Sharpe oder Holm) über alle getesteten Varianten; alle Varianten berichten, auch die schlechten.
- Delistete Titel und Kosten wie in C (`quant/engines/portfolio-backtest.cjs`).
Pfade: `scripts/research/edge/`, `docs/research/edge/`. Keine Produktdateien, keine Fachmodelle, keine Workflows. Ergebnis: Bericht mit Tabelle je Variante, Urteil „schlägt / schlägt nicht / nur risikobereinigt“, und eine Empfehlung für die Produktdarstellung.

## 10. Projekt „Signale mit Nachweis“ (Owner-Ziel 05.11.2026)

Ziel: Die App meldet konkrete Handelsgelegenheiten (Beispiel des Owners: Kauf an einer guten Unterstützungslinie, Take-Two am 04.11.), jeweils mit Einstieg, Stopp und Ziel, und **nur für Setups, die historisch nachweislich besser abschneiden als Kaufen und Halten**. Bausteine sind vorhanden: `quant/engines/technical/support-resistance.js`, `ti/levels.js`, `technical/trade-setup.js`, `setup-engine.js`, `signal-backtest.js`, `pattern-research.js`.

| Stufe | Inhalt | Wer |
|---|---|---|
| S1 | Vorregistrierte Signal-Studie auf den Kursreihen im Repo: je Setup Trefferquote, Gewinn/Verlust je Trade in R, Erwartungswert nach Kosten, Vergleich mit Halten der Aktie und mit SPY über dieselbe Haltedauer | Codex (E4) |
| S2 | Bestätigung der besten Setups mit delisteten Titeln (R2-Archiv) und dem unberührten Holdout 2008–2015 | C (Quant) mit B |
| S3 | Live-Signale nur für bestätigte Setups: Einstieg, Stopp, Ziel, Begründung, Chart; laufende Bilanz jedes Signals ab Veröffentlichung (vorwärts, nicht nachträglich änderbar) | C + D2 (Darstellung nach Mockups Technical/Supertrader) |
| S4 | Rechtliche Einordnung (Signale für alle, keine persönliche Beratung; Pflichtangaben einer Finanzanalyse) | Owner mit Rechtsberatung |

Regel: Kein Setup wird als Signal gezeigt, das S2 nicht bestanden hat. Alle getesteten Setups werden berichtet, auch die schlechten.

## 11. Owner-Linie Recht und Produkt (05.11.2026, verbindlich)

- **Vision Universe ist eine Analyse-Software.** Sie stellt Werkzeuge, Daten und regelbasierte Auswertungen bereit. Keine Anlageberatung, keine Anlageempfehlung, keine konkreten Kauf- oder Verkaufsempfehlungen.
- **Keine Live-Signale** mit Einstieg, Stopp und Ziel als Empfehlung. Projekt §10 Stufe S3 entfällt. Setups und Kandidaten erscheinen nur als neutrale Regel-Ergebnisse („erfüllt die Regel“, „Zone laut Methode“), nach den Wortwahl-Regeln in `docs/legal/WORTWAHL.md`.
- **Keine Anzeige bei der BaFin.** Das Produkt wird so gebaut und formuliert, dass sie nicht nötig ist.
- **Keine Provisionen oder Partnerverträge** (Stand 05.11.2026).
- **Private Bestände:** neutraler Hinweis, dass Gesellschafter und Mitarbeiter privat in Wertpapieren investiert sein können, die die Software anzeigt; Ergebnisse entstehen regelbasiert ohne Einfluss darauf.
- **Rechtstexte liegen auf der Webseite.** Die App enthält nur die Pflicht-Verlinkungen (Impressum, Datenschutz, Nutzungsbedingungen, Risikohinweise) und keine eigenen Rechtstexte.
- **Owner-Entscheidung 06.11.: Supertrader-Kursmarken (Einstieg, Ausstieg, Stopp) und Setup-Ziele werden als Analyse nach benannter Methode wieder gezeigt**, ohne Anzeige nach § 86 WpHG; Rechtstexte unverändert; Klärung mit Anwalt läuft (Restrisiko: `docs/legal/EINORDNUNG.md` §0).
- **Owner-Entscheidung 06.11. (über die Steuerung): Quant-Musterdepots öffentlich mit heutigem Bestand und Protokoll rein/raus** (L3 entfällt, `docs/legal/EINORDNUNG.md` §0). Sie laufen ab 05.11.2026 monatlich vorwärts, beschriftet „Rechenmodell, kein echtes Geld“ (`/quant/musterdepots/`). Backtest-Renditen bleiben nicht öffentlich. Die Vorwärts-Wertentwicklung erscheint erst nach einer eigenen Owner-Freigabe, die hier als Satz eingetragen wird (Marke für den Erzeuger, `docs/quant/PORTFOLIO_STANDARD.md`).
- **Owner-Entscheidung 06.11., Freigabe Musterdepot-Wertentwicklung:** Die Quant-Musterdepots zeigen ihre Wertentwicklung ab Live-Start (05.11.2026), je Depot und je Position ab Aufnahme ins Depot, beschriftet „Rechenmodell, kein echtes Geld“. Backtest-Renditen bleiben nicht öffentlich. Wortlaut des Owners im Steuerungschat: „Quant-Musterdepots, Wertentwicklung, ja, auf jeden Fall. Die Wertentwicklung ab dem Moment, wo man es reingekauft hat.“
- **Owner-Entscheidung 06.11.: Reels bleiben unverändert** (Social Media, nicht Teil der App; Restrisiko in `docs/legal/EINORDNUNG.md` §0).
