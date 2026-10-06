# Historical Data Usage Register (Mission VIII, §71–§73)

Stand: 06.10.2026. Branch `claude/vision-universe-mission-viii-7hjwma` (aufgesetzt auf `claude/vision-universe-technical-intelligence-cxarnz`, Commit `993a33302`).

Zweck: festhalten, welche historischen Daten frühere Missionen schon **mit Ergebnissen angesehen** haben. Daten, deren Ergebnisse schon jemand gesehen hat, werden hier nicht als frischer Holdout umetikettiert.

Status-Begriffe:

| Status | Bedeutung |
|---|---|
| DEVELOPMENT | für Entwicklung/Fehlersuche verwendet, Ergebnisse angesehen |
| VALIDATION | Gegenprobe nach einem Entwicklungsschritt, Ergebnisse angesehen |
| CONSUMED TEST | als Test geöffnet; kein Holdout mehr |
| AVAILABLE HOLDOUT | von keiner TI-Studie mit Ergebnissen angesehen |
| SEALED | absichtlich versiegelt, nicht Gegenstand von Mission VIII |

## 1. Rekonstruktion früherer Nutzung

| # | Daten / Zeitraum | Universum | Mission | Zweck | Ergebnisse angesehen? | Status |
|---|---|---|---|---|---|---|
| 1 | Wochenschlüsse 1993-01 – 2012-12 | 6.348 heute gelistete US-Stammaktien (`discover-series-long`) | I (TI V2), II, IV | TRAIN der Szenario-Studie | ja, mehrfach | DEVELOPMENT |
| 2 | Wochenschlüsse 2013-01 – 2018-12 | dieselben 6.348 | I, II, IV | VALIDATION der Szenario-Studie | ja, mehrfach | VALIDATION |
| 3 | Wochenschlüsse ≥ 2019-01 | dieselben 6.348 | I (2×), II (Nachlauf Elliott-Gewicht 0), Statistik-Audit (Engine 3.x), IV (ti-scenario-1.2.1) | TEST der Szenario-Studie | ja, **mindestens 4×** (STATISTICS_AUDIT §6) | CONSUMED TEST |
| 4 | Pilot 120 Titel, alle Zeiträume | Teilmenge von #1–#3 | I | Pilot vor Einführung von `--dev` | ja | CONSUMED |
| 5 | Wochenschlüsse, Walk-forward, 1.784 Reihen, 69.791 Ereignisse | heute gelistete US-Stammaktien ≥ 5 J. Historie | II (Elliott-Validierung H1–H7) | vorab registrierte Elliott-Studie (Entdeckungs- und Bestätigungsstichprobe) | ja | CONSUMED TEST |
| 6 | Tages-OHLCV 2015-10 – 2026-09 | 5 Golden-Titel (AAPL, JPM, MSFT, NVDA, XOM) | I, IV | Tages-Referenz | ja | CONSUMED |
| 7 | Tages-OHLC ausgewählter Titel | geöffnete Practitioner-Fälle + Produktionsauswahl (~35 Anfragen) | VI | OHLC-Studie (Elliott-Struktur, keine Szenario-Outcomes) | Struktur ja, Szenario-Outcomes nein | DEVELOPMENT (nur Elliott-Struktur) |
| 8 | synthetische Korpora (HOLDOUT-1/-2/-3, C1–C3) | Generator | II–IV, VI | Engine-Qualitäts-Gates | ja | CONSUMED (keine Marktdaten) |
| 9 | Practitioner-Referenz V1/V1.1/V1.2 | 78 Fälle; DEV + VAL = 35 geöffnet | V–VII | Praktiker-Abgleich | DEV/VAL ja | DEV/VAL geöffnet |
| 10 | Practitioner-Holdout | 43 Fälle | V–VII | — | nein | **SEALED** (Mission VIII öffnet ihn nicht, §50/§124) |
| 11 | Experten-Werkbank | 210 Fälle, davon 30 EXPERT_HOLDOUT | IV | blinde Annotation | keine Annotationen | **SEALED** |
| 12 | Delistete Listings ab 2015 (privater R2-Abruf `tiingo-delisted`, Wochenbündel) | ≈ 3.079 verwendbare Listings | Quant/Supertrader (Signal-Backtest, Survivorship-Kontrolle) | **andere** Signale (Momentum/Faktor), nicht TI | für TI-Szenarien: **nein** | **AVAILABLE HOLDOUT (TI)** |
| 13 | Tageshistorie des Universums (R2 `v1/tiingo/daily/US/`) | ≈ 7.800 Titel | Quant-Faktoren, Signal-Backtest | andere Signale; die TI-Tagesstudie (`technical-intelligence-evidence.yml`) lief **nie** | für TI-Tagesszenarien: **nein**; Kalenderzeitraum aber wochenweise gesehen (#1–#3) | **CONDITIONAL HOLDOUT (TI Daily)** |
| 14 | Intraday | — | — | keine Historie im Bestand (nur Tages-Snapshots) | — | **NOT AVAILABLE** |

**Folgerung:** Auf Wochenbasis gibt es **keinen unberührten Zeitraum** für die heute gelisteten Titel. Jede Aussage aus #1–#3 ist bestenfalls „bestätigend unter Vorbehalt“. Für TI-Szenario-Ergebnisse unberührt sind nur zwei Quellen:
* die delisteten Listings (#12);
* die Tagesengine über das Universum (#13).

Bei #13 ist der Kalenderzeitraum aus der Wochenstudie bekannt. Das ist **kein makelloser** Holdout, und er wird auch nicht so genannt.

## 2. Nutzung in Mission VIII

| Phase | Daten | Universum | Zweck | Ergebnisse angesehen? | Status in Mission VIII |
|---|---|---|---|---|---|
| W_DEV | Wochenschlüsse, alle Jahre | Überlebende, Titel mit `sha256("hsab\|"+id) mod 2 = 0` | Entwicklung von Harness, Kontrollen, Schwellen (Abdeckungsstufen) | ja | DEVELOPMENT (Daten schon CONSUMED) |
| W_VAL | Wochenschlüsse, alle Jahre | Überlebende, Titel mit `mod 2 = 1` | Gegenprobe erst **nach** DEV-Freeze | ja, nach Freeze | VALIDATION (Daten schon CONSUMED) |
| D_DEV | Tages-OHLCV, Erkennung ≤ 2016-06-30 (Ergebnisfenster ≤ 126 Handelstage, enden vor 2017) | Stichprobe 600 Stammaktien (deterministisch) | Tages-Pipeline testen | ja (CI-Kennzahlen) | DEVELOPMENT |
| W_HOLDOUT | Wochenschlüsse delisteter Listings ab 2015 | Delisted-Kohorte (#12) | **finale Hauptprüfung**, einmal | erst nach Präregistrierung | FINAL HOLDOUT |
| D_HOLDOUT | Tages-OHLCV, Erkennung 2017-01-01 – 2026-09-30 | Stichprobe 1.200 Stammaktien (Obermenge der D_DEV-Titel) | finale Tagesprüfung, einmal | erst nach Präregistrierung | CONDITIONAL HOLDOUT |
| W_UNION | Überlebende ab 2018 + Delisted | beide | Survivorship-Sensitivität (Summen aus beiden Kohorten) | — | SENSITIVITY |

Vor der Präregistrierung entstehen für W_HOLDOUT und D_HOLDOUT nur Stage-1-Siegel und Zähler (Anzahl Reihen, Analysezeitpunkte je Jahr). Ergebnisse gibt es dabei nicht.

## 3. Stand nach Mission VIII (06.10.2026)

| Phase | Status jetzt |
|---|---|
| W_DEV, W_VAL | CONSUMED |
| D_DEV | CONSUMED |
| W_HOLDOUT (delistete Listings ab 2015) | **CONSUMED TEST** (einmal geöffnet, Commit `b2c925807a1`) |
| D_HOLDOUT (Tag, 1.200 Titel, 2017-01 – 2026-09) | **CONSUMED TEST** |
| Tag, übrige ≈ 4.700 Stammaktien 2017–2026 | für TI-Tagesszenarien ungeöffnet. Kalender gesehen; als Holdout nur bedingt geeignet. |
| Kursdaten nach 2026-09-30 | **AVAILABLE HOLDOUT** für eine prospektive Fortschreibung (frühestens 26 Wochen später auswertbar) |
| Practitioner-Holdout (43), Experten-Holdout (30) | weiterhin **SEALED** |
