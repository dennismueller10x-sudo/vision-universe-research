# VISION UNIVERSE® Discover — V4 Consumer Discovery Experience

Abschlussbericht des Auftrags „CONSUMER DISCOVERY EXPERIENCE V4" (§0–43).
Branch `claude/vision-universe-discover-h93fmv`, aufgesetzt auf `main`
(b68de427e, Live-Stand vom 15.09.2026). **Nicht nach `main` gemergt, nicht
veröffentlicht — Owner-Abnahme zuerst (§41).**

Alles in diesem Bericht ist gemessen, nicht geschätzt. Wo etwas nicht
verifiziert werden konnte, steht das so.

---

## A · Root Cause: „Letzter Handelstag · Freitag" am 15.09.2026 (§8)

**Befund.** Die Seite zeigte am Dienstag, 15.09., den Tagesverlauf und die
Tagesschlusskurse vom **Freitag, 11.09.**, obwohl der Montag, 14.09., eine
reguläre US-Sitzung war.

**Ursache (Kette Provider → Ingest → Cache → Workflow → Resolver → Export →
Client → UI):**

1. **Workflow/Zeitplan (primär).** Die beiden Datenläufe — Intraday-Snapshots
   (`intraday-snapshots.yml`, alle 10 Minuten 13–21 UTC, Universum 21:35 UTC)
   und Marktdaten-Refresh (`market-data-refresh.yml`, 22:30 UTC) — lagen bis
   zur Live-Schaltung am 15.09. 05:04 UTC **nur auf dem Entwicklungsbranch**.
   GitHub führt `schedule`-Trigger ausschließlich aus der Workflow-Datei des
   Default-Branches aus. Am Montag, 14.09., gab es deshalb **keinen einzigen
   Lauf**: alle 23 Läufe des Intraday-Workflows bis dahin waren Push-Läufe
   auf `claude/vision-universe-discover-v3` (`conclusion: skipped` ohne
   Marke); der letzte echte Datenlauf war der Universumslauf vom Sonntag,
   13.09. 19:56 UTC (Sitzung 11.09.). Provider, Ingest, Cache, Resolver und
   Export waren nicht beteiligt — sie wurden schlicht nicht aufgerufen.
2. **Fehlender Frische-Zustand (sekundär, systemisch).** Der Trading Session
   Resolver beschriftete jeden vorhandenen Snapshot als „Letzter Handelstag ·
   {Wochentag}" — formal richtig (Freitag *war* die Sitzung der Reihe), aber
   die Beschriftung behauptete, das sei der letzte Handelstag. Es gab keinen
   Zustand „älter als die letzte abgeschlossene Sitzung", also konnte die
   Seite einen veralteten Stand nicht als solchen kennzeichnen.
3. **Kein Monitoring.** Nichts maß, ob die ausgelieferten Reihen zur letzten
   abgeschlossenen Sitzung passen.

**Verifikation.** `scripts/market/check-freshness.mjs --site=https://research.visionuniverse.de`
(CI-Lauf 34958477280, 10:32 UTC): Intraday Datenstand 2026-09-11 → STALE
(`lastSessionMissing`, erwartet 2026-09-14), 446/446 Einträge STALE;
Tageskurse asOf 2026-09-11 → STALE. Dasselbe Ergebnis lokal
(`quant/data/market/freshness/health.json`).

**Was seit 05:04 UTC gilt.** Die Zeitpläne laufen jetzt auf `main`. Der
erste Intraday-Lauf des Tages ist der um 13:00 UTC; er holt in der
Vorbörse die letzte abgeschlossene Sitzung (Montag) für den Discover-Umfang
nach. **Nicht verifizierbar zum Zeitpunkt dieses Berichts (11:30 UTC):** ob
diese Läufe wie erwartet durchlaufen. Der Freshness-Monitor (unten) prüft
das ab heute um 15:15 UTC und 23:15 UTC.

## B · Freshness-Vertrag (§9–10)

`quant/engines/realtime/freshness.js` (`freshness-contract-1.0.0`), in Node
(Ingest, Health-Check, Tests) und im Browser (Live-Hub, Karten, Aktienseite)
dasselbe Modul. Je Reihe:

| Feld | Inhalt |
|---|---|
| `securityId`, `symbol`, `source`, `interval` | Identität (`source` bleibt in den Daten, erscheint nicht auf Karten) |
| `sessionDate`, `asOf`, `lastBarTimestamp` | Stand der Reihe |
| `marketSessionState` | PRE_MARKET / OPEN / AFTER_HOURS / CLOSED / HOLIDAY |
| `expectedSessionDate`, `lagSessions` | was jetzt gelten müsste, wie viele Sitzungen fehlen |
| `freshnessState` | **LIVE / LAST_SESSION / STALE / UNAVAILABLE** |
| `withinGrace`, `partial`, `reason` | Karenz, unvollständiger Schluss, maschinenlesbarer Grund |
| `label` | Beschriftung in Seitensprache, `tone` live/complete/pending/stale |

Regeln: Börse offen → laufende Sitzung ist LIVE, wenn der Stand jünger als
die Karenz (30 Minuten = drei Workflow-Läufe) ist, sonst STALE; in den
ersten 30 Minuten nach 09:30 ist der Vortag LAST_SESSION („· heutige Kurse
folgen"), danach STALE. Geschlossen → die letzte abgeschlossene reguläre
Sitzung ist LAST_SESSION; ein unvollständiger Schluss bis 30 Minuten nach
16:00 „Schluss folgt", danach STALE. Alles Ältere ist STALE und heißt
**„Stand Fr., 11.09. · nicht aktuell"** — nie „Letzter Handelstag". Für
Tagesreihen gilt eine Karenz von 6 Stunden nach Schluss (Abendlauf 22:30 UTC
+ Build + Auslieferung). Karenzen: `development-preview.json` →
`intraday.freshness`, auch in `meta.realtime.intraday.freshness`.

Tests `quant/tests/freshness.test.mjs` (15): Vorfall Fr→Di (FR1), Fr→Mo,
Wochenende, Feiertag (Labor Day), verkürzter Tag (27.11., 13:00), Sommerzeit
(02.11.), Öffnung, laufende Sitzung mit stehendem Stand, Schluss, neue
Sitzung, keine Reihe, Tagesreihen, Vertragsfelder, Zählung, „STALE heißt
nie Letzter Handelstag". Dazu `discover/tests/live-hub.test.mjs` LH8/LH9.

**UI.** Karten, Eingangsfläche, Aktienseite und Statuszeile lesen den
Vertrag (`data-freshness`); STALE-Verläufe sind gedämpft, das Etikett trägt
den Warnton, die Statuszeile zeigt „Vorbörse · 11.09. · nicht aktuell".

## C · Ingest, Nachzug, Verzeichnis (§10)

`scripts/market/ingest-intraday.mjs`: `--scope=auto` (Zeitplan außer 21:35
UTC) — offen: Discover-Umfang; sonst Universum, wenn die letzte
abgeschlossene Sitzung noch nicht für ≥ 50 % des Universums vorliegt
(Nachzug nach ausgefallenem Lauf). Aufbewahrung behält die jüngste
Universumssitzung, auch wenn zwei neuere nur den Discover-Umfang tragen
(sonst verlöre jede Aktienseite außerhalb der Flächen ihr 1T). Verzeichnis
`intraday-index-1.1.0` mit `lastCompletedSession`, `dataSession`,
`universeSessions`, Frische je Eintrag und Zählung. Der Live-Hub fragt nach,
wenn das Verzeichnis hinter dem Kalender liegt.

## D · Monitoring (§34)

- `scripts/market/check-freshness.mjs` → `quant/data/market/freshness/health.json`
  (Intraday: Datenstand, Einträge je Zustand, Universumsdeckung der letzten
  Sitzung; Tageskurse: asOf des Universums + Stichprobe 40 Reihen); Schritt
  in Intraday- und Refresh-Workflow, Ergebnis im Workflow-Summary.
- `.github/workflows/freshness-monitor.yml`: 06:30 Di–Sa, 15:15 und 23:15
  Mo–Fr (UTC) gegen die veröffentlichte Seite, `--strict` → **roter Lauf bei
  STALE** (GitHub benachrichtigt). Erster Lauf (10:32 UTC) meldete korrekt
  STALE, der Lauf blieb aber grün (Pipe ohne `pipefail`) — behoben in
  Commit 2/n.

## E · Daten & Quellen, Anbieternamen (§11)

Geprüft vor der Änderung: keine Regel im Repository verlangt Anbieternamen
am Chart (`development-preview.json` Grants ohne Auflagen, `display-policy.js`
kennt keine Attributionspflicht, `provider-profiles.json` hat kein
Attributionsfeld; `docs/VU_PROVIDER_LICENSE_CHECKLIST.md` führt die
Quellenangabepflicht als „ungeprüft" und nennt eine separate Seite als
zulässige Stelle). Die hausinterne Regel (`TIINGO_LIVE_ARCHITECTURE.md`:
„am Chart steht, aus welcher Quelle er stammt und wie bereinigt") wird durch
„Tagesschlusskurse, split-bereinigt, Stand …" weiter erfüllt; `priceSeries.source`
bleibt im JSON (Contract-Prüfung). **Offen bleibt das externe Risiko:** der
Tiingo-/IEX-Vertragstext liegt nicht im Repository (`contractInRepository: false`).

Neue Seite `#/daten` (`discover/ui/daten.js`): Marktdaten, Tagesverlauf
(IEX-Bestand von Tiingo, Verzögerung, Zeitzone, Frische-Zustände),
Geschäftszahlen (SEC EDGAR, Plausibilität), Index-Mitgliedschaft (Quelle,
Stichtag), Methoden (Qualifikation, Ranking, Bekanntheit), Lizenzen und
Marken. Fußzeilen-Link „Daten & Quellen". Anbieternamen von neun Stellen
entfernt (Karten-Tooltip, Bildbeschreibungen, Eingangsfläche, Aktienseite,
Datenherkunft, `realtime.message`).

## F · Aktienseite: Verbraucher-Chart mit 1T · 1W · 1M · 6M · 1J · 5J · Max (§12–15)

- Standard ist eine durchgehende Linie ohne Kasten: Kurs groß, Veränderung
  im Zeitraum („+41,8 % in einem Jahr"), Datumsspanne, Kursart, Frische der
  Tagesreihe („Schluss Fr., 11.09. · nicht aktuell"). Farbe folgt der
  Farbwelt; Grün/Rot bleiben den Zahlen (`microchart.js#renderRange`).
- 1T = echter Tagesverlauf (Snapshot); 1W/1M/6M/1J aus der Tagesreihe
  (Kalender-Ausschnitt, `series-sampling.js#sliceRange`); **5J und Max aus
  einer Wochenreihe**: Schlusskurs des letzten Handelstags jeder ISO-Woche
  aus der Historienablage (R2), zusammengeführt mit der Tagesreihe
  (`mergeWeeklyWithDaily`, letzter Punkt = jüngster Schluss). Keine
  Interpolation; bei Vielfachem > 15 zwischen Tief und Hoch logarithmische
  Kursachse (benannt).
- Lange Reihen: `scripts/market/publish-long-series.mjs` + `long-series.yml`
  (CI-Lauf 34958477248: **6 308 Wochenreihen**, 2 ohne Historie, 566 zu
  kurz (< 30 Wochen), 113 MB, 1990-01-05 bis 2026-09-10; monatlicher
  Zeitplan). Aktienseiten mit `series.long`: **5 472 von 5 947**.
- Pro-Werkzeuge (Kerzen, Volumen, Overlays, RSI/MACD/ATR, Struktur) bleiben —
  hinter dem Schalter „Analyse-Chart" in „Chart-Werkzeuge" (§15).
- Tests: `quant/tests/series-sampling.test.mjs` (5), Browser-QA
  (1W vorhanden, Zeiträume „1T 1W 1M 6M 1J 5J Max", 1J/1W zeichnen den
  Verbraucher-Chart, Frische am Chart, Analyse-Chart per Schalter).

## G · Eingangsfläche: Wischen auf dem iPhone (§16)

Befund: es gab **keine Geste** — die Fläche wurde per 10-Sekunden-Takt
oder 3-px-Strich ersetzt, `touch-action` war nirgends gesetzt. Jetzt liegen
alle Flächen auf einer Spur (`translate3d`), Pointer Events für Finger,
Stift und Maus (`touch-action: pan-y`), Entscheidung ab 12 px und
horizontaler Richtung, Widerstand an den Enden, Einrasten ab einem Viertel
der Breite oder 0,45 px/ms, Klick-Sperre nach der Geste (kein versehentliches
Öffnen), Pfeiltasten/Pos1/Ende, 44-px-Punkte, `aria-hidden` je Folie, nur
die sichtbare Fläche hält einen Live-Strom. Ein Chromium-Detail (impliziter
Touch-Capture löst `lostpointercapture` am berührten Element aus, das bis
zur Spur aufsteigt) brach die Geste zunächst ab — behoben, mit CDP-Touch
verifiziert (Folie 0 → 1, Screenshot 02). Browser-QA: Wischen links/rechts,
vertikales Ziehen wechselt nicht, Tastatur.

## H · Ranking-Audit und „Stärkste Aktien" (§17–18, §21)

Audit-Befund (Details im Sitzungsprotokoll, maschinenlesbar im Build):
Leadership-Score = gewichtete Normierung von Abstand zum Jahreshoch,
Rendite 3/6/12 Monate, relativer Stärke 3/12 M, Trendqualität, Volumen,
Drawdown (`discover-v1.json`); **keine** Liquiditäts-, Größen- oder
Kursuntergrenze; Bekanntheit war in zwei Reihen zulassungsrelevant. VLO:
Leadership 94,9 (Perzentil 99,8), Rendite 12 M +152 %, Jahreshoch — Rang 1
„Bekannte Namen", Hero. HP (Helmerich & Payne): Perzentil 95,4, aber
Rang ~275 und ohne Bekanntheitseintrag → auf keiner Fläche; Philips (PHG):
Perzentil 26,7, Rendite 12 M −9,6 % → korrekt nirgends. Kein Look-Ahead
(alle Fenster enden am letzten Handelstag); dokumentierter Widerspruch:
`high52w.note` behauptet ein Fenster ohne den aktuellen Tag, die
Faktorenengine rechnet mit ihm (0 von 5 655 Abstände positiv) — nicht
verändert, im Bericht benannt.

**Qualifikation (`qualification`)**: Score-Abdeckung ≥ 80 %, ≥ 250
Handelstage, Kurs > 5 $, Dollarumsatz (20 Tage) ≥ 5 Mio. $ → **2 613 von
5 947** Titel. Gilt für „Die stärksten Aktien", die drei Index-Reihen und
alle Kurs-Reihen (Jahreshochs, Momentum, Breakouts, relative Stärke, Trend,
Comeback, unter dem Radar); Gründe je Titel (`qualification.reasons`).
Fundamentale Reihen zählen Unternehmen, nicht Gattungen (Dedupe je CIK).

**Rangbegründung** je Karte (`rankingReason`, Contract 1.3.0): Reihe, Rang
von N, Sortierfeld/-wert, Regel, Score mit Perzentil und den drei stärksten
Beiträgen, Qualifikation, Index-Gewicht, Bekanntheitsstufe, Discovery-Rang
und Zuschlag (aus dem Relevanz-Trace). Der Verifier prüft Rang und
Sortierreihenfolge je Reihe.

## I · Index-Mitgliedschaft (§19–20)

Kein Kursanbieter des Projekts liefert Konstituenten; es gab **keine**
Mitgliedschaftsdaten. Quelle jetzt: veröffentlichte Tagesbestände der
abbildenden Fonds bzw. die Liste des Indexeigentümers
(`quant/config/index-membership.json`, `quant/engines/index-membership.js`,
`scripts/market/build-index-membership.mjs`, `index-membership.yml`
wöchentlich). Versioniert unter `quant/data/market/index-membership/`
(aktuell + `history/<indexId>/<asOf>.json`, Änderungen gegen den Vorstand).
Zuordnung zum Company Master über den Ticker (Trennzeichen ignoriert, nur
bei Eindeutigkeit); **keine Ticker-Heuristik über die Mitgliedschaft**.

CI-Lauf 34961350495 (15.09.2026):

| Index | Quelle | Bestand | zugeordnet | nicht zugeordnet |
|---|---|---|---|---|
| S&P 500 | SPY-Bestand (State Street) — IVV-CSV lieferte HTML | 504 | 498 (493 im Discover-Umfang) | SNDK, BNY, Q, VLTO, NRG, 2602335D |
| NASDAQ-100 | Nasdaq-Quote-API (Indexeigentümer) — QQQ 406, QQQM HTML | 101 | 100 (98) | SNDK |
| Dow Jones | DIA-Bestand (State Street) | 30 | 30 (30) | — |

Die sechs nicht zugeordneten S&P-Ticker stehen nicht im Company Master
(Ticker-Wechsel/Neuzugänge; `2602335D` ist ein Platzhalter des Emittenten)
— sie werden benannt, nicht geraten. Reihen `sp500-staerkste`,
`ndx-staerkste`, `djia-staerkste` (Qualifikation + Leadership-Score) mit
Herkunft und Stichtag an der Reihe; Rangliste TOP 10 S&P 500 / NASDAQ-100 /
Dow Jones an Position 4–6 der Startseite; Index-Badges auf der Aktienseite.

## J · Economic Sanity (§22)

Gefunden: CCI „1 337 % Free-Cashflow-Marge" (Umsatz 215 Mio. $ als
ASC-606-Teilkonzept gegen 2,9 Mrd. $ FCF), EXR 995 %, CHTR 561 % Nettomarge,
HIG/GBCI (Versicherer/Banken), LYEL −762 356 % (Umsatz 36 000 $), RLMD
(jüngstes Geschäftsjahr 2013), VMRK +332 959 % (Einheitenfehler in der
Quelle). Fundamentals-Engine 1.2.0 (`PLAUSIBILITY`): Margen erst ab 50 Mio. $
Umsatz; |Marge| > 150 % oder |Gewinn|/|FCF| > 1,5 × Umsatz →
„Umsatzfragment"; Bilanzgeschäfte (Sektor Financials/Real Estate oder
Umsatz < 8 % der Bilanzsumme) ohne FCF-Marge; Margenänderung > 100 pp
verworfen; jüngstes Geschäftsjahr älter als zwei Jahre → alle
Fundamentalkennzahlen weggelassen. Weggelassenes trägt Grund und Detail
(`fundamentalOmitted`, `fundamentalStale`), nie einen Ersatzwert. Der
Verifier lehnt Karten mit Margen außerhalb des Bands ab. „Cashflow-
Maschinen" führen jetzt NRP, BULL, SEZL, PR, MTG … statt CCI/Banken.

**Owner-Entscheidung (offen):** die Ursache für REITs/Tower liegt in
`quant/config/sec-metric-registry.json` (Umsatz-Konzeptpriorität
`RevenueFromContractWithCustomerExcludingAssessedTax` vor `Revenues`). Eine
Änderung der Normalisierung (Version 1.11.0, Neu-Export der Consumer-Bundles)
ist ein Eingriff in die kanonische SEC-Schicht und wurde nicht ohne Abnahme
vorgenommen.

## K · Discovery-Erlebnis (§3–7, §23–28)

- Positionierung über der Eingangsfläche: „Entdecke Aktien, die gerade
  auffallen – und verstehe in Sekunden, warum." + „Kurse, Trends und
  Geschäftszahlen aus echten Daten. Keine Empfehlung." (Telefon: nur die
  erste Zeile). Keine Einführungsseite.
- Reihenfolge (§23): Eingang → Bekannte Namen → Die stärksten Aktien →
  TOP 10 S&P 500 → NASDAQ-100 → Dow Jones → Neue Jahreshochs →
  Unternehmensgeschichte → Wachstum → Gewinne → Cashflow-Rangliste →
  Qualität + Wachstum → Margen → Themenwelt KI → Breakouts → Momentum →
  Compounder → Relative Stärke → Sektoren → … → Comeback → Turnarounds →
  … → Unter dem Radar → Profitables Wachstum → Einzeln entdecken.
  34 Flächen; erstes Stück 8 Flächen / 355 KB.
- Farbwelten (§7): Momentum Cyan, Breakouts Amber, Wachstum Violett,
  Qualität/Cashflow Blau, Comeback Magenta, Compounder Champagner,
  Jahreshochs Eisblau, Leadership Indigo, Bekannte Namen Smaragd; Grün/Rot
  nur für Zahlen; die Chartlinie folgt der Welt.
- Kartenhierarchie (§6/§26): Unternehmen → Kennzahl → Klartext → Chart →
  fundamentaler Hook; Unterzeile jeder Sammlung auch auf dem Telefon (§25).
- Retention (§24): „Weil du … angesehen hast" (Gerätegedächtnis, ohne
  Konto, ohne Tracking), Next Discovery auf der Aktienseite, Damals vs.
  Heute (§32) unverändert erhalten.

## L · Tests, Verifier, Guards (§40)

| Suite | Ergebnis |
|---|---|
| `node --test quant/tests/*.test.mjs` | **926 / 926** (+15 Freshness, +5 Series-Sampling, +8 Index-Mitgliedschaft) |
| `node --test discover/tests/*.test.mjs` | **191 / 191** (+2 Live-Hub Freshness; Fixtures auf realistische Unternehmensgröße skaliert) |
| Python `unittest discover -s quant/tests` | **471 / 471** (unverändert) |
| `verify-discover-data.mjs` | 60 937 Prüfungen, keine Abweichung (neu: Rangbegründung, Index-Herkunft, Qualifikation, Margenband) |
| `assert-no-secrets`, `assert-public-data-hygiene` (inkl. Wochenreihen) | grün |
| Browser-QA `browser-qa.mjs` | **63 / 63** (neu: Wischgeste, Spur, Analyse-Chart-Schalter; Ranglisten-Prüfungen auf `top-10` gescoped) |
| Browser-QA `browser-qa-v3.mjs` | **38 / 38** (Themenwelt nach dem Nachladen) |
| Browser-QA `browser-qa-live.mjs` | **33 / 33** (STALE-Beschriftung, kein Anbietername, 1W, Verbraucher-Chart, Frische am Chart) |

Bestehende Tests wurden nicht aufgeweicht; geänderte Erwartungen folgen
ausdrücklichen V4-Vorgaben (Kartenreihenfolge §26, Zeiträume §13,
Labels §9/§11, mehrere Ranglisten §20).

## M · Performance (§33)

Startseite, lokaler Server, Chromium: Desktop 72 Anfragen / 1 484 KB
(JS 672 KB, JSON 280 KB, Intraday 156 KB, Reihen 99 KB), DOMContentLoaded
288 ms, 1 822 DOM-Knoten; iPhone 61 Anfragen / 1 420 KB, 312 ms. Live-Hub:
Abonnements nur für sichtbare Karten (5 Desktop, 1 Telefon), kein Polling
bei geschlossener Börse.

## N · Screenshots (§38)

`docs/screenshots/discover-v4/` (19 Dateien, Stand nach Iteration 2):
01 iPhone Eingang · 02 Wischen Zustand 2 · 03 Bekannte Namen · 04 Stärkste
Aktien · 05 S&P 500 · 06 NASDAQ-100 · 07 Dow Jones · 08 Unternehmensgeschichte ·
09 Aktienseite Kopf (Index-Badges) · 10 1T · 11 1M · 12 6M · 13 1J ·
14 Fundamentals · 15 Damals vs. Heute · 16 Next Discovery · 17 Desktop
Discover · 18 Desktop Aktienseite · 19 Daten & Quellen.

Zwei visuelle Iterationen (§37): Iteration 1 zeigte doppeltes „nicht
aktuell" am Tagesverlauf, hellen Kasten statt Punkt, +545 625,00 %, die
erste Reihe am Schreibtisch unter der Falz, flache Max-Kurve; Iteration 2
behob alles (Beschriftung, Punkte, Prozentformat, Hero-Höhe, log-Achse).

## O · Abnahmefragen (§39)

1. Versteht ein neuer Nutzer in ≤ 5 s, was Discover ist? — Positionierungszeile + Eingangsfläche mit Kicker, Name, einer Zahl, einem Satz. Ja.
2. Hero-Swipe auf iPhone? — Pointer Events, Einrasten, verifiziert mit CDP-Touch und Browser-QA. Ja.
3. Zeigt die Seite bei offener Börse den laufenden Tag, sonst den letzten Handelstag, ohne stale Daten als aktuell? — Vertrag + Monitor; heute STALE (Freitag) und **als solches beschriftet**; der Nachzug hängt am 13:00-UTC-Lauf auf `main` (nicht verifiziert).
4. Stock Detail ist ein Consumer-Chart mit realen Zeiträumen? — 1T/1W/1M/6M/1J aus Tages-, 5J/Max aus Wochenreihen (5 472 Seiten); Pro-Tools nachgeordnet. Ja.
5. Warum VLO/HP/Philips? — rankingReason je Karte, Audit oben. Ja.
6. Stärkste Aktien robust? — Qualifikation vor Rang, 2 613 Titel. Ja.
7. Index-Rankings aus echter Mitgliedschaft? — Fondsbestände / Indexeigentümer, versioniert, Stichtag 15.09.2026. Ja.
8. 1 337 % FCF-Marge? — weg, mit Grund; Ursache im Registry benannt (Owner-Entscheidung).
9. Farbwelten statt Blau? — sieben Welten, Grün/Rot semantisch. Ja.
10. Anbieternamen im Consumer-UI? — entfernt; Daten & Quellen mit Lizenzabsatz. Ja.
11. Keine erfundenen Daten/Bars/Labels? — Verifier, Hygiene, Vertrag. Ja.
12. Bestehende Tests grün? — 926 / 191 / 471, keine Aufweichung. Ja.
13. Monitoring? — health.json, Workflow-Summaries, Monitor mit rotem Lauf. Ja.
14. Nicht gemergt, nicht veröffentlicht? — Ja.

## P · Datenläufe auf dem Branch (CI)

| Workflow | Lauf | Ergebnis |
|---|---|---|
| Lange Kursreihen | 34958477248 | 6 308 Wochenreihen, commit 3fd86ef38 |
| Index-Mitgliedschaft | 34958477441 / 34960525129 / **34961350495** | 1: IVV-CSV war HTML, QQQ 406; 2: SPY + DIA ok, Nasdaq-Quelle an Validierung gescheitert; 3: **alle drei**, commit 81e12067d |
| Freshness-Monitor | 34958477280 | STALE korrekt gemessen, Lauf wegen fehlendem `pipefail` grün → behoben |

## Q · Offene Punkte und Owner-Entscheidungen

1. **Verifikation des Nachzugs auf `main`** (13:00 UTC Intraday, 22:30 UTC Refresh) — der Monitor meldet ab 15:15 UTC.
2. **SEC-Umsatzkonzept** (Registry-Priorität für ASC 606) — Änderung der kanonischen Normalisierung nur mit Abnahme.
3. **Sechs nicht zuordenbare S&P-Ticker** (SNDK, BNY, Q, VLTO, NRG) — Company-Master-Nachzug (Ticker-Wechsel), nicht Discover.
4. **Größe der Wochenreihen** (113 MB je Lauf, monatlich) — Alternative: Ablage außerhalb von Git, falls die Historie zu schnell wächst.
5. **Lizenz/Attribution extern** — Vertragstext nicht im Repository; die Seite nennt Tiingo/IEX unter Daten & Quellen.
6. **Preferred-Gattungen mit NASDAQ-Suffix L/Z** (HBANL, HBANZ) stehen als Aktien im Universum; die fundamentalen Reihen dedupen je Unternehmen, die Klassifizierung selbst wurde nicht verändert.

## R · Änderungen (Dateien)

Engines: `quant/engines/realtime/freshness.js` (neu), `series-sampling.js`
(neu), `index-membership.js` (neu), `discover/engines/fundamentals.js`
1.2.0, `contract.js` 1.3.0. Skripte: `ingest-intraday.mjs`,
`check-freshness.mjs` (neu), `build-index-membership.mjs` (neu),
`publish-long-series.mjs` (neu), `build-discover-data.mjs`,
`verify-discover-data.mjs`, `assert-public-data-hygiene.mjs`. Workflows:
`intraday-snapshots.yml`, `market-data-refresh.yml`, `freshness-monitor.yml`
(neu), `index-membership.yml` (neu), `long-series.yml` (neu). UI:
`hero.js`, `detail.js`, `microchart.js`, `cards.js`, `surfaces.js`,
`live-hub.js` 1.2.0, `daten.js` (neu), `app.js`, `discover.css`,
`index.html`. Konfiguration: `development-preview.json`,
`index-membership.json` (neu), `discover-v1.json` (v4.0.0). Daten:
`quant/data/market/discover-series-long/`, `index-membership/`,
`freshness/health.json`, `intraday/index.json`, `discover/data/*`.

## S · Nicht gemacht

- Russell-Indizes (optional, §20) — nicht gebaut.
- Kein Umbau der SEC-Pipeline, keine zweite Daten-/Ranking-Architektur (§0).
- Keine Veröffentlichung, kein Merge.

## T · Commits

`166cc70e3` (1/n Freshness, Ingest, Monitor, Index, Qualifikation,
Plausibilität) · `1042c5f19` (2/n Spur, Verbraucher-Chart, Daten & Quellen,
Positionierung, Farbwelten) · `f963fa7bd` (3/n Kartenhierarchie,
Unterzeilen, Qualifikation der Kurs-Reihen, log-Achse) · Bot-Commits
`3fd86ef38` (Wochenreihen), `81e12067d` (Index-Mitgliedschaft) · 4/n
(dieser Bericht, Screenshots, Index-Badges, Feinschliff).
