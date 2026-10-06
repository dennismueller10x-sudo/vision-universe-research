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

Die Screenshots wurden bei der Release-Abnahme (Abschnitt U.4) mit dem Datenstand nach allen Läufen neu erzeugt; 20–23 kamen hinzu.

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
| Intraday-Snapshots (Abnahme) | 34973148157 (universe) / discover 14:19 / discover 18:30 | Montag 2026-09-14 nachgezogen (5 207 Snapshots), Dienstag laufend LIVE — Abschnitt U |
| Marktdaten-Refresh (Abnahme) | 34986494100 (abgebrochen) / 34987245529 (Commit-Schritt rot) / **35000271379** | Tageskurse bis 2026-09-14, Discover neu gebaut, commit `102e8fd7a` — Abschnitt U |

## Q · Offene Punkte und Owner-Entscheidungen

1. **Abendlauf auf `main` heute (22:30 UTC)** scheitert ohne den Merge im Commit-Schritt und löschte das Coverage-Artefakt (U.6, Punkte 2 und 3); nach dem Merge meldet der Freshness-Monitor ab 06:30 UTC gegen die Live-Seite.
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
`3fd86ef38` (Wochenreihen), `81e12067d` (Index-Mitgliedschaft) · `bb1894c49`
(4/n Bericht, Screenshots, Index-Badges, Feinschliff) · Abnahme: `cbe68ba65`
(erstes Stück 320 KB), `67095b4fc` (Autostash im Refresh), Bot-Commits
`f8ce3fb06` / `ed54c30d3` / `d64d9a78e` (Intraday), `102e8fd7a` (Refresh),
Abnahmebericht (Abschnitt U, `scale/` bleibt stehen, Screenshots neu).

## U · Release-Abnahme (15.09.2026, auf dem Branch, gegen echte Tiingo-Daten)

Die Abnahme wurde ohne Cron auf `main` gefahren: alle Datenläufe wurden per
`workflow_dispatch` auf `claude/vision-universe-discover-h93fmv` gestartet und
haben auf den Branch committet. Nichts davon ist veröffentlicht.

### U.1 · Läufe

| Zeit (UTC) | Workflow / Umfang | Marktlage beim Start | Sitzung | Ergebnis | Commit |
|---|---|---|---|---|---|
| 13:09–14:18 | Intraday-Snapshots, `scope=universe` (Lauf 34973148157) | PRE_MARKET (09:09 New York) | 2026-09-14 (letzte abgeschlossene) | 6 876 Anfragen, 5 207 Snapshots geschrieben, 1 669 ohne reguläre Bars, 0 Fehler, 0 Wiederholungen, 68 min | `f8ce3fb06` |
| 14:19–14:30 | Intraday-Snapshots, `scope=discover` | OPEN (10:25 New York) | 2026-09-15 (laufend) | 522 Anfragen, 506 Snapshots, 16 ohne reguläre Bars, 0 Fehler, 5 min | `ed54c30d3` |
| 15:09–15:13 | Marktdaten-Refresh (Lauf 34986494100) | – | – | von mir abgebrochen, nachdem der Regressionstest zum ersten Startseiten-Stück lokal rot war (U.6, Punkt 1) | – |
| 15:15–16:25 | Marktdaten-Refresh (Lauf 34987245529) auf `cbe68ba65` | OPEN | Tageskurse bis 2026-09-14 | Tageskurse, Faktoren, Technik, Verifier, Discover-Build, Hygiene, Regressionssuite grün; Schritt „Commit und Push" rot (U.6, Punkt 2) | – |
| 17:16–18:29 | Marktdaten-Refresh (Lauf 35000271379) auf `67095b4fc` | OPEN | Tageskurse bis 2026-09-14 | 6 876 Titel, 6 511 ok, 0 Fehler, 365 abgelehnt (Qualität), 6 511 Anfragen; alle Schritte grün | `102e8fd7a` |
| 18:30–18:38 | Intraday-Snapshots, `scope=discover` | OPEN (14:32 New York) | 2026-09-15 (laufend) | 525 Anfragen, 519 Snapshots, 5 min | `d64d9a78e` |

### U.2 · Pfad Provider → Ingest → Storage → Discover-Export → UI (AAPL, echte Werte)

**Vorher (Freitag-Stand, wie am 15.09. um 07:37 UTC gemessen; Lauf 34958477280 und lokal um 13:09 UTC):**

| Stufe | sessionDate | lastBarTimestamp | asOf | freshnessState |
|---|---|---|---|---|
| Storage `intraday/index.json` (1.1.0) | dataSession 2026-09-11 · lastCompletedSession 2026-09-14 | – | 2026-09-11T20:55Z | STALE 446 / 446 (lastSessionMissing) |
| Snapshot `2026-09-11/ref_AAPL.json` | 2026-09-11 | 15:55 New York (78 Punkte) | 2026-09-11T20:40Z | STALE |
| Discover-Export `stocks/US_REAL/AAPL.json` | asOf 2026-09-11 (Tagesreihe bis 2026-09-11) | 2026-09-11 | updatedAt 2026-09-13T21:04Z | STALE (Tageskurse, lastSessionMissing) |
| UI Statuszeile / Karten / Aktienseite | – | – | – | „Vorbörse · 11.09. · nicht aktuell" · „Stand Fr., 11.09. · nicht aktuell" · `data-freshness="STALE"`; die Zeichenkette „Letzter Handelstag" kommt auf keiner Seite vor |

**Nachher, Stufe 1 (Universum, Montag nachgezogen; gemessen 14:18 UTC, Markt OPEN):**

| Stufe | sessionDate | lastBarTimestamp | asOf | freshnessState |
|---|---|---|---|---|
| Provider (status.json) | 2026-09-14, kind `last`, isComplete true | – | Lauf 13:09:32Z, PRE_MARKET | – |
| Ingest → Snapshot `2026-09-14/ref_AAPL.json` | 2026-09-14 | 15:55 New York (78 Punkte 09:30–15:55, 0 verworfen) | 2026-09-14T20:35Z (16:35, letzter erweiterter Punkt) | LAST_SESSION beim Schreiben (13:09Z, PRE_MARKET) |
| Storage `intraday/index.json` | dataSession 2026-09-14 (universe true, regularComplete true, 5 207 Snapshots) · lastCompletedSession 2026-09-14 · universeSessions [2026-09-11, 2026-09-14] | – | 2026-09-14T20:55Z | Zusammenfassung zum Laufstart: LAST_SESSION 515, STALE 1 (CWBC ohne Montag-Bars) |
| `check-freshness` um 14:18Z (OPEN, > 30 min Karenz) | 2026-09-14 | – | – | STALE (currentSessionMissing) · „Stand Mo., 14.09. · nicht aktuell" |
| UI um 14:18Z | – | – | – | Statuszeile „Geöffnet · 14.09. · nicht aktuell" (STALE); Karten und Aktienseite „Stand Mo., 14.09. · nicht aktuell"; Hinweis „dieser Stand ist nicht der letzte Handelstag (2026-09-15 erwartet)" |

Das ist die Kernaussage von §8–10: ein Stand, der nicht die erwartete Sitzung
ist, heißt „nicht aktuell" — vor Sitzungsbeginn (Freitag-Stand am Dienstag)
genauso wie während der laufenden Sitzung (Montag-Stand um 10:18 New York).
„Letzter Handelstag · …" entsteht nur noch, wenn `sessionDate` gleich der
letzten abgeschlossenen Sitzung ist und keine Sitzung läuft bzw. die Karenz
nach der Eröffnung noch nicht abgelaufen ist.

**Nachher, Stufe 2 (Discover-Umfang während der Sitzung; gemessen 14:31 UTC):**

| Stufe | sessionDate | lastBarTimestamp | asOf | freshnessState |
|---|---|---|---|---|
| Provider (status.json) | 2026-09-15, kind `current`, isRunning true | – | Lauf 14:25:11Z, OPEN (10:25 New York) | – |
| Snapshot `2026-09-15/ref_AAPL.json` | 2026-09-15 | 10:25 New York (12 Punkte ab 09:30, previousClose 332,27) | 2026-09-15T14:25Z | LIVE |
| Storage `intraday/index.json` | dataSession 2026-09-15 (universe false, regularComplete false, 506 Snapshots) · lastCompletedSession 2026-09-14 · universeSessions [2026-09-14] (Freitag-Verzeichnis durch die Aufbewahrung entfernt) | – | 2026-09-15T14:30Z | LIVE 506, STALE 10 (Titel ohne Dienstag-Bars um 10:25) |
| `check-freshness` um 14:31Z | 2026-09-15 | – | – | Intraday LIVE (runningSession) · „Heute · Stand 10:30"; 516 Einträge: LIVE 505, STALE 11 |
| UI um 14:31Z | – | – | – | Statuszeile „Geöffnet · Stand 10:30" (LIVE); Karten/Aktienseite AAPL, NVDA, VLO „Heute · Stand 10:25" (LIVE); 1T-Chart mit Startlinie Vortagesschluss 332,27 und Verlauf bis 10:25 |

**Nachher, Stufe 3 (Tageskurse nach dem Refresh; gemessen 18:29 UTC, Markt OPEN):**

| Stufe | sessionDate | lastBarTimestamp | asOf | freshnessState |
|---|---|---|---|---|
| Provider (`tiingo-status.json`) | Tagesreihen bis 2026-09-14 | – | Lauf 17:17–18:21Z | – |
| Storage `quant/data/technical/instruments/AAPL.json` | letzter Balken 2026-09-14 | 2026-09-14 (1 320 Balken seit 2021-06-11) | – | – |
| Discover-Export `stocks/US_REAL/AAPL.json` | asOf 2026-09-14 | 2026-09-14 | updatedAt 2026-09-15T18:23Z, Kurs 333,08 $ (+0,24 % am Montag) | LAST_SESSION |
| Discover-Meta `meta.json` | US_REAL asOf 2026-09-14 (5 947 Titel) | – | generatedAt 2026-09-15T18:25Z | – |
| `check-freshness` um 18:29Z | Tageskurse asOf 2026-09-14 = erwartete letzte Sitzung | – | – | LAST_SESSION (lastCompletedSession) · „Schluss Montag"; Stichprobe 40 Reihen: 40 × LAST_SESSION |
| UI (Aktienseite, Zeiträume 1W–Max) | – | – | – | „Schluss Montag" unter jedem Zeitraum; 1J: „12.09.2025 – 14.09.2026 · Tagesschlusskurse · split-bereinigt" |

Zwischen Stufe 2 und Stufe 3 (14:35 bis 18:29 UTC ohne Intraday-Lauf, weil
der Cron nur auf `main` läuft) meldete `check-freshness` den Tagesverlauf
korrekt als STALE mit dem neuen Grund `runningSessionStaleAsOf` („Heute ·
Stand 10:30 · nicht aktuell"): ein vier Stunden alter Stand einer laufenden
Sitzung ist nicht aktuell, auch wenn er von heute ist. Nach dem Lauf um
18:30 UTC steht der Discover-Umfang wieder auf LIVE („Heute · Stand 14:35",
512 LIVE, 9 STALE = Titel ohne Dienstag-Bars).

**Ergebnis für §8–10:** Der Pfad erkennt und liefert die jüngste tatsächlich
verfügbare reguläre Sitzung auf beiden Ebenen — Tageskurse: Montag
2026-09-14 (LAST_SESSION); Tagesverlauf: Dienstag 2026-09-15 laufend
(LIVE) bzw. Montag als letzte abgeschlossene Sitzung im Universum. Der
Freitag-Stand vom Morgen wurde in keiner Stufe als „Letzter Handelstag"
beschriftet; das Wort erscheint auf keiner gerenderten Seite (Prüfung per
Volltext im DOM, Startseite und drei Aktienseiten, vorher und nachher).

### U.3 · Charts (AAPL, NVDA, Hero-Titel)

Gerendert auf dem iPhone-Viewport (390 × 844, 2×) gegen die echten Reihen nach dem Refresh; Werte aus dem DOM:

| Titel | 1T | 1M | 6M | 1J |
|---|---|---|---|---|
| AAPL | „Heute · Stand 14:30", 5-Minuten-Kurse ab 09:30, Startlinie 333,08 (Montagsschluss), 61 Punkte um 14:30 | 333,08 $ · +9,11 % · 13.08.–14.09.2026 · 22 Tagesschlusskurse | +33,2 % · 13.03.–14.09.2026 · 127 Schlusskurse | +42,3 % · 12.09.2025–14.09.2026 · 252 Schlusskurse · Achse 234,07–340,08 |
| NVDA | „Heute · Stand 14:35", Startlinie 210,96 | 210,96 $ · −6,36 % · 13.08.–14.09.2026 | +17,0 % · 13.03.–14.09.2026 | +18,6 % · 12.09.2025–14.09.2026 |
| VLO (Hero-Titel) | „Heute · Stand 14:35", Startlinie 382,95 | 382,95 $ · +11,7 % · 13.08.–14.09.2026 | +66,1 % · 13.03.–14.09.2026 | +144 % · 12.09.2025–14.09.2026 |

Zusätzlich geprüft: 1W (6 Schlusskurse, 04.09.–14.09.), 5J (Wochenschlusskurse ab 10.09.2021; NVDA +839 % auf logarithmischer Achse, benannt), Max (Wochenschlusskurse ab 05.01.1990 bzw. 22.01.1999, logarithmisch, benannt). Keine Konsolenfehler; jeder Zeitraum trägt „Schluss Montag" als Frische-Zeile der Tagesreihe, der 1T-Tab die Frische des Tagesverlaufs.

### U.4 · Screenshots

`docs/screenshots/discover-v4/` wurde mit dem Datenstand nach allen Läufen neu erzeugt (18:40 UTC; Markt OPEN, Tagesverlauf LIVE „Stand 14:35", Tageskurse „Schluss Montag"):

| Nr. | Datei | Inhalt |
|---|---|---|
| 01 | 01-iphone-hero | Startseite: Statuszeile „Geöffnet · Stand 14:35", Positionierung, Eingang Valero Energy (+148 % in 12 Monaten, Tagesverlauf bis 14:35, Punkte 1/5) |
| 02 | 02-iphone-hero-swipe-2 | nach echter Touch-Wischgeste (CDP): Slide 2 Matson, Punkt 2 aktiv |
| 03–04 | bekannte Namen, die zehn stärksten Aktien | Reihen mit Unterzeile |
| 05–07 | 05-iphone-sp500, 06-iphone-nasdaq100, 07-iphone-dow | Index-Ranglisten mit Rangziffern, Unterzeile (Bestand SPY / Nasdaq-Liste / DIA, Stichtag 15.09.2026), Live-Verlauf je Karte |
| 08 | Unternehmensgeschichte | Story-Fläche |
| 09–13 | Aktienseite AAPL: Kopf, 1T, 1M, 6M, 1J | Verbraucher-Chart mit Preis, Prozent, Zeitraum, Frische |
| 14–16 | AAPL in 30 Sekunden, Damals/Heute, Weiter entdecken | – |
| 17–19 | Desktop: Startseite, Aktienseite, Daten & Quellen | – |
| 20–21 | 20-iphone-nvda-1T, 21-iphone-nvda-1J | NVDA 1T live und 1J |
| 22–23 | 22-iphone-hero-vlo-1T, 23-iphone-hero-vlo-1J | Hero-Titel Valero: 1T live und 1J |

### U.5 · Visueller Abgleich gegen die Referenzen

Gegen die in V4 §28–30 beschriebenen Referenzen (Trade Republic: Preis groß, Prozent farbig, Zeitraum-Tabs als einzige Bedienung, Chart ohne Rahmen, nüchterne Typografie; Netflix: eine große Eingangsfläche, Reihen mit klarer Hierarchie, Rangziffern, wenig Text, Wischen):

- **Aktienseite** (10, 13, 20–23): Preis 333,08 $ und Prozent stehen wie in der Referenz über dem Chart, die Tabs 1T–Max sind die einzige Bedienung, die Werkzeuge liegen eingeklappt darunter („Chart-Werkzeuge +"). Der 1T-Chart trägt die Startlinie des Vortagesschlusses und Uhrzeiten 09:30–16:00, der 1J-Chart Hoch/Tief an der rechten Achse und Monatsmarken. Farbe nur semantisch (rot unter, blau/grün über der Startlinie). Passt.
- **Startseite** (01, 02, 17): Eingangsfläche mit Titel, einer Zahl, einer Klartextzeile, zwei Handlungen und dem Tagesverlauf; die Punkte zeigen 1/5 und wechseln mit dem Wischen. Auf dem Desktop steht der Zwölfmonatsverlauf als Bild rechts. Passt zur Netflix-Referenz; die Fläche bleibt Daten, keine Fotos.
- **Ranglisten** (05–07): Rangziffern hinter den Karten, je Karte Name, Kurs, Tagesänderung, Zwölfmonatszahl, Klartext, Live-Verlauf, fundamentaler Hook, Signal. Unterzeile nennt Bestand und Stichtag. Passt.
- **Kein Blocker gefunden.** Zwei Kleinigkeiten, beide ohne Änderung belassen (U.7): die Reihen-Unterzeile wird auf dem Telefon nach einer Zeile abgeschnitten (bewusst, §25); Zwölfmonatszahl im Text (Faktor, 12M-Fenster in Handelstagen) und im 1J-Chart (Kalenderjahr ab 12.09.2025) unterscheiden sich um wenige Prozentpunkte (AAPL 45 % / +42,3 %, VLO +148 % / +144 %).

### U.6 · Behobene Release-Blocker (nur diese drei Änderungen, keine Architektur)

1. **Erstes Startseiten-Stück zu groß für den bestehenden Test.** V4 (4/n)
   hatte `chunkMaxBytes` auf 430 KB gesetzt; `discover/tests/v3.test.mjs`
   („Nachladen: das erste Stück ist klein") verlangt < 320 KB. Die
   Regressionssuite läuft im Marktdaten-Refresh vor dem Commit — der Lauf
   wäre rot geblieben und hätte nie committet. Der Test bleibt unverändert;
   der Deckel steht wieder auf 320 KB. Das erste Stück trägt jetzt Eingang,
   bekannte Namen, stärkste Aktien und die drei Index-Ranglisten (309 KB,
   6 Flächen); Jahreshochs und Unternehmensgeschichte rutschen ins zweite
   Stück (290 KB, 8 Flächen). Commit `cbe68ba65`. Tests danach: quant 926/926,
   discover 193/193, Verifier 63 383 Prüfungen ohne Abweichung, Browser-QA
   63/63 · 38/38 · 33/33.
2. **Refresh-Commit scheiterte an Test-Rückständen.** Lauf 34987245529 war bis
   zur Regressionssuite grün (Tageskurse, Faktoren, Technik, Verifier,
   Discover-Build, Hygiene, Tests) und fiel im Schritt „Commit und Push":
   `quant/tests/issuer-master.test.mjs` baut den Emittentenstand in die echte
   Ablage (`issuer-manifest.json`, `cik-resolution.json`; nur `generatedAt`
   ändert sich) und `git pull --rebase` verweigert wegen ungestagter
   Änderungen. **Dieser Test steht seit dem V3-Merge (0d04a2ad6, 15.09.) auch
   auf `main`; der Abendlauf um 22:30 UTC auf `main` liefe ohne den Fix in
   denselben Fehler** — die Tageskurse auf der Live-Seite blieben dann auf
   dem Stand vom 11.09. Fix: `git pull --rebase --autostash` im Refresh-
   Workflow (Commit `67095b4fc`). Die anderen Workflows mit Commit
   (Intraday, Index-Mitgliedschaft, Wochenreihen) führen diese Suite nicht
   aus und sind nicht betroffen.
3. **Refresh löschte ein kanonisches Artefakt.** Der Refresh-Commit
   `102e8fd7a` entfernte `quant/data/technical/scale/technical-coverage-
   ELIGIBLE_US_EQUITY.json`: `scripts/technical/build-technical-data.mjs`
   räumt vor dem Bau das ganze Verzeichnis `quant/data/technical/` weg, auch
   `scale/`, das dem Scale-Gate gehört. Die Python-Suite
   (`test_canonical_market.py`, 3 Tests) verlangt diese Datei — sie lief nach
   dem Refresh rot (468/471). Die Datei liegt auf `main` erst seit dem
   V3-Merge (0d04a2ad6, 15.09. 05:04 UTC); **der Abendlauf auf `main` löschte
   sie ebenso, und die SEC-Daily-Prüfung (Python-Suite) wäre am Morgen rot.**
   Fix: der Bau räumt nur noch seine eigenen Erzeugnisse weg und lässt
   `scale/` stehen (vier Zeilen); die Datei ist aus `67095b4fc` wiederhergestellt.
   Lokal nachgebaut: `scale/` bleibt liegen, Python 471/471.

### U.7 · Beobachtungen, keine Blocker

- Die Frische-Zusammenfassung in `intraday/index.json` (`freshness.checkedAt`)
  wird mit dem Zeitpunkt des Laufstarts gerechnet. Beim 68-Minuten-Nachzug des
  Universums stand darin „LAST_SESSION 515" (Laufstart 13:09Z, PRE_MARKET),
  während der Health-Check am Laufende (14:17Z, OPEN) bereits STALE meldete.
  Beides ist ehrlich gestempelt; der Client rechnet die Frische ohnehin zur
  Anzeigezeit aus `dataSession`/Einträgen und dem Sitzungsauflöser, nicht aus
  dieser Zusammenfassung. Die regulären Läufe dauern 5–8 Minuten.
- Titel ohne Bars in der laufenden Sitzung (10–16 dünne Werte um 10:25 New
  York) bleiben je Reihe auf dem Montag-Stand und heißen dort „nicht aktuell"
  — Frische ist ein Vertrag je Reihe, nicht je Seite.
- Statuszeile „Stand 10:30" gegenüber Karten „Stand 10:25": die Statuszeile
  nennt den jüngsten Stand des Verzeichnisses (letzter Titel des Laufs), die
  Karte den Stand ihrer Reihe.

### U.8 · GO / NO-GO

**GO** für den Merge nach `main` — unter Owner-Abnahme, nicht selbst gemergt, nicht deployt.

Begründung:

1. Der Produktionsfehler aus §8 ist auf dem Branch mit echten Daten geschlossen: Der Universumslauf holt die letzte abgeschlossene Sitzung (Montag) nach, der Discover-Lauf liefert die laufende Sitzung (Dienstag, LIVE), der Refresh bringt die Tageskurse auf den Montag. Ein alter Stand heißt in jeder Stufe „nicht aktuell" — vor der Eröffnung, während der Sitzung, und auch für einen heutigen, aber vier Stunden alten Stand. „Letzter Handelstag" erscheint nur, wenn es stimmt.
2. Die Ursache (Cron nur auf `main`) ist mit dem Merge behoben: die Workflows gehen mit auf `main`; der Freshness-Monitor meldet ab dann dreimal täglich gegen die Live-Seite und wird rot, wenn ein Lauf ausfällt.
3. Drei echte Release-Blocker wurden in der Abnahme gefunden und behoben (U.6): Deckel 320 KB, Autostash im Refresh, `scale/` bleibt beim Technik-Bau stehen. Kleine, benannte Änderungen, keine Architektur. Zwei davon betreffen `main` heute schon: **ohne den Merge (oder einen Hotfix der beiden Stellen) scheitert der Abendlauf um 22:30 UTC auf `main` im Commit-Schritt (die Live-Seite bliebe bei den Tageskursen vom 11.09.), und selbst mit gelungenem Commit fehlte danach das kanonische Coverage-Artefakt.** Das ist ein Grund, die Abnahme nicht aufzuschieben.
4. Tests unverändert streng: quant 926/926, discover 193/193, Python 471/471 (nach Punkt 3 in U.6), Verifier 63 383 Prüfungen ohne Abweichung, Browser-QA 63/63 · 38/38 · 33/33, Guards (Geheimnisse, öffentliche Daten) grün; Performance Desktop 1 568 KB / 356 ms DOM-ready, iPhone 1 496 KB / 332 ms.
5. Offen bleibt nur, was nicht in Discover liegt (Abschnitt Q): SEC-Umsatzkonzept, sechs S&P-Ticker im Company Master, Größe der Wochenreihen, Lizenztext, Preferred-Gattungen L/Z. Nichts davon verhindert den Merge.

Nach dem Merge (Owner): Freshness-Monitor-Lauf 06:30 UTC am Mittwoch abwarten (erwartet grün: Universum Dienstag nach dem 21:35-Lauf, Tageskurse Dienstag nach 22:30). Falls er rot ist, steht in `quant/data/market/freshness/health.json` und im Lauf-Summary, welche Stufe fehlt.
