# DISCOVER V3 — Full Market Universe & Live Intraday Charts

Zweig `claude/vision-universe-discover-v3`. **Nicht nach `main` gemergt, nicht
veröffentlicht.** Auftrag vom 13.09.2026: die Golden-Five-/GATE_500-Grenze ist
keine Produktgrenze mehr; jede Aktie mit echten Kursdaten hat immer einen
sinnvollen Chart-Zustand; Live-Intraday auf Karten, Eingangsfläche und
Aktienseite; kein zweiter Store, kein zweiter Company Master, keine zweite
Chart-Engine.

Reihenfolge der Arbeit: Audit → Implementierung → Daten-Coverage → Tests →
Mobile QA → Screenshots → Abschlussbericht. Dieses Dokument ist der Bericht;
die Zahlen darin stammen aus Läufen, nicht aus Annahmen.

---

## 1. Audit

### 1.1 Lizenzentscheidung (Owner Decision)

Der Eigentümer hat am 13.09.2026 erklärt: *„Die erforderliche Tiingo-Freigabe
für die öffentliche Anzeige der Market-Data liegt vor. Wir verwenden das
entsprechend freigegebene große Paket."*

Diese Erklärung ist im Repository festgehalten — nicht als Kommentar, sondern
dort, wo die Anzeigerichtlinie sie liest:

| Artefakt | Was steht dort |
|---|---|
| `quant/config/development-preview.json` | `grants` für `marketData`, `intraday`, `realtime` mit `publicRawDisplayAllowed`, `publicDerivedDisplayAllowed`, `publicRealtimeAllowed`, `basis` (Wortlaut der Erklärung) und `checkedAt: 2026-09-13`; `scopeUniverse: PRODUCT_UNIVERSE`; `intraday`-Block (Intervall, Refresh, Umfänge) |
| `quant/config/feature-gates.json` | `ENABLE_LIVE_MARKET_DATA` und `ENABLE_PUBLIC_LIVE_MARKET_DATA` auf `true`, mit Begründung und Datum |
| `quant/config/provider-profiles.json` | Tiingo `licensing.status: OWNER_DECLARED_LICENSED`, Befunde `OWNER_DECLARED`, `declaration` mit Datum, Wortlaut und `contractInRepository: false`; `previousStatus` LEGAL_REVIEW_REQUIRED bis 13.09.2026 |

Was das **nicht** ist: eine eigene Rechtsprüfung. Der Vertragstext liegt dem
Repository nicht vor; `OWNER_DECLARED` ist deshalb eine eigene Stufe unterhalb
von `DOCUMENTATION_VERIFIED`, und `aiUsage`/`modelTraining` bleiben `UNKNOWN`.
Die Kursart der IEX-Intradaydaten bleibt vom Anbieter unbenannt
(`priceType UNSPECIFIED`); die Seite schreibt deshalb „Stand 15:42" und nie
„Last Trade".

Gate und Grant sind zwei Schlösser: `display-policy.js` verlangt beides, und
die Tests R10/I14/I15 halten fest, dass ein offenes Gate ohne Grant nichts
freischaltet.

### 1.2 Universum — und der Übergabepunkt zum Company Master

Der neue Company Master (die „7.000+ Unternehmen") liegt **nicht** in diesem
Branch. Er existiert im Workstream US Security Master:

| | |
|---|---|
| Branch | `claude/tiingo-us-equity-discovery-k5j4bc` @ `2e22a2e` (2026-09-11) |
| Datei | `quant/data/market/security-master/eligibility.json`, `us-security-master-1.1.0` |
| Regel | Produktuniversum = alle Entscheidungen außer `EXCLUDED` |
| Zählung | 7.803 Mitglieder → **7.004** Produktuniversum (ELIGIBLE 6.477 · SEPARATE_CLASS 308 · REVIEW 219); 799 ausgeschlossen (WARRANT 392 · UNIT 258 · RIGHT 116 · TEST_SECURITY 30 · ETF 3) |
| Konsument | `claude/full-universe-proof-y8ncfa` (`scripts/realtime/build-product-symbols.mjs`, geschützte Vercel-Vorschau) |

Entsprechend der Vorgabe wurde **keine zweite 7.000er-Liste** integriert und
keine Datei aus dem anderen Zweig kopiert. Stattdessen liest ein
Universums-Modul (`scripts/market/universe-source.mjs`) die kanonische Quelle:

1. liegt `security-master/eligibility.json` im Branch → Company Master, Regel
   „alles außer EXCLUDED", Zählung gegen die Quelle nachgerechnet
   (Abweichung = Abbruch), `handover.status = INTEGRATED`;
2. sonst → das größte im Branch vorhandene, mit Kursdaten belegte Universum
   `quant/data/market/scale/universe-FULL_UNIVERSE.json` (5.684 Titel:
   5.682 Common Stocks, 2 ETFs; NASDAQ 3.215 · NYSE 2.229 · AMEX 197 · NYSE MKT
   18 · BATS 15 · NYSE ARCA 9 · EXPM 1), `handover.status = PENDING`.

Der Übergabepunkt steht wörtlich in jedem Build (`discover/data/meta.json →
universeSource.handover.message`):

> Market-Data-Layer ist für 5684 Titel bereit
> (quant/data/market/scale/universe-FULL_UNIVERSE.json); Integration des neuen
> Company Masters wartet auf claude/tiingo-us-equity-discovery-k5j4bc @ 2e22a2e
> (quant/data/market/security-master/eligibility.json, us-security-master-1.1.0,
> 7004 Titel).

Sobald die Eignungsartefakte übernommen werden (Merge/Cherry-Pick des
Workstreams, nicht eine Kopie), liest die Pipeline sie ohne Codeänderung; die
Tests US1–US5 prüfen beide Wege.

SEC/Fundamentals wurden nicht angefasst (Auftrag: nicht neu bauen).

### 1.3 Aufgehobene MVP-Grenzen

| Vorher | Nachher |
|---|---|
| `development-preview.json`: fünf Ticker | `scopeUniverse: PRODUCT_UNIVERSE` + fullHistory-Titel + Benchmark |
| `build-discover-data.mjs`: `factors-GATE_500.json`, `universe-GATE_500.json` fest verdrahtet | Universum aus `universe-source.mjs`; Faktordatei: FULL_UNIVERSE, sonst das größte vorhandene Gate mit `factorCoverage.partial = true` im Meta |
| `build-market-factors.mjs`: Einzelzeilen über 500 Titel nur in der Arbeitsablage (`DETAIL_LIMIT = 500`) | Einzelzeilen für das ganze Universum werden ausgeliefert |
| `ingest-tiingo.mjs`: Free-Kontingent (50/h) | `--commercial --request-budget --concurrency`; `historyFrom` (2023-01-01) für Titel außerhalb fullHistory |
| Golden-Five-Workflow | `market-data-refresh.yml` (Produktuniversum, täglich) + `intraday-snapshots.yml` |
| Discover-Series als Kopie in `discover/data/series/US_REAL/` | Karten verweisen direkt auf `quant/data/market/discover-series/<securityId>.json` (kein Duplikat) |

Geblieben sind die **Datenqualitäts-Gates**: `MarketQuality.validateBars`,
Bereinigungskonsistenz (§24), ≥ 30 Schlusskurse für eine kompakte Reihe, ≥ 2
reguläre Punkte für einen Intraday-Snapshot. Diese Grenzen sind keine
Produktgrenzen und wurden nicht angefasst.

### 1.4 Provider-Coverage (gemessen, Stand der letzten Läufe)

| Frage | Zahl | Quelle |
|---|---|---|
| Instrumente im Produktuniversum (Branch) | 5.684 | `universe-FULL_UNIVERSE.json` |
| davon bei Tiingo aufgelöst | 5.684 (0 unaufgelöst) | `gate-FULL_UNIVERSE.json` |
| mit ≥ 250 Tagesbars (Faktor-fähig) | 4.984 (87,05 %) | `gate-FULL_UNIVERSE.json` |
| Faktorzeilen gerechnet | 5.639, 45 übersprungen (FAIL) | `factors-FULL_UNIVERSE-summary.json` |
| Historische Intraday-Bars (5 min, IEX, mehrere Tage) | belegt: PASSED (234 Bars über 5 Tage, AAPL) | `golden-preview/capabilities/*.json` |
| Erweiterte Zeiten | belegt: PASSED (PRE 31 · REGULAR 156 · AFTER 31 Bars) | dito |
| Realtime-Strom (WebSocket) | belegt (LIVE_CHART_READY TRUE), Kursart UNSPECIFIED | `commercial/live-candle-verification.json` |
| Kompakte Reihen im Repository vor dem ersten Lauf | 5 (AAPL, JPM, MSFT, NVDA, XOM) | `discover-series/index.json` |
| Intraday-Snapshots im Repository vor dem ersten Lauf | 0 | — |

Intraday-Bars stammen aus dem IEX-Bestand (nur IEX-Volumen). Die Kurse sind
echt; die Karte nennt Quelle und Handelsplatz (`tiingo/IEX`).

---

## 2. Architektur

### 2.1 Chart-Grundprinzip

„Börse geschlossen → kein Chart" ist falsch und kommt nicht mehr vor. Der
**Trading Session Resolver** (`quant/engines/realtime/trading-session.js`, auf
`market-hours.js` + `market-calendar.json`) beantwortet je Zeitpunkt:

| Zustand | `marketState` | `displaySession` |
|---|---|---|
| Fr 15:00 NY | OPEN | Freitag, läuft (`progress` 0,85) |
| Fr 16:30 NY | AFTER_HOURS | Freitag, vollständig |
| Sa / So / Mo 08:00 NY | CLOSED / CLOSED / PRE_MARKET | Freitag |
| Mo 09:31 NY | OPEN | Montag (Wechsel um 09:30, nicht um Mitternacht) |
| Feiertag (Labor Day) | HOLIDAY | Handelstag davor |
| 27.11. (verkürzt) 13:30 NY | AFTER_HOURS | Schluss 13:00 |

Sommer-/Winterzeit laufen über `Intl` mit benannter Zeitzone; kein Offset ist
fest eingebaut (TS7). Tests: TS1–TS8.

### 2.2 Intraday-Vertrag

`quant/engines/realtime/intraday-snapshot.js` — ein Snapshot je Titel und
Sitzung:

```
instrumentId, symbol, securityId, provider (tiingo), venue (IEX), dataMode (real),
seriesType INTRADAY_BARS, interval (5min), sessionDate, timezone,
sessionOpen/Close (ISO), sessionOpenLocal/CloseLocal, earlyClose,
asOf, asOfLocal, fetchedAt, marketStateAtFetch,
isLive (false: Snapshot, kein Strom), isDelayed (true), delayMinutes,
regularComplete, isComplete, previousClose,
points [[ "HH:MM", close ], …]   (reguläre Sitzung, New Yorker Zeit)
extended { pre: [...], after: [...] }
publishBasis, publishCheckedAt
```

Regeln, die der Vertrag durchsetzt (IS1–IS4): kein Punkt wird erfunden, nicht
interpoliert, nicht fortgeschrieben; ein Snapshot einer abgeschlossenen
Sitzung ist unveränderlich (`merge` gibt ihn zurück); während der Sitzung
wächst er nur; ohne zwei reguläre Punkte ist er kein Chart
(`publishable: false`). Cache-Schlüssel: `instrumentId + sessionDate +
interval`.

### 2.3 Ingest und Ablage

`scripts/market/ingest-intraday.mjs` nutzt den bestehenden Adapter
(`providers/tiingo/adapter.js#getIntradayBars`, `resampleFreq=5min`,
`afterHours=true`), den bestehenden `MarketStore` (Vortagesschluss) und die
bestehende Anzeigerichtlinie (intern: Gate `ENABLE_LIVE_MARKET_DATA`;
öffentlich: Grant `intraday`). Ablage:

```
quant/data/market/intraday/<sessionDate>/<securityId>.json   Snapshot
quant/data/market/intraday/index.json                         Verzeichnis (Discover-Umfang, je Titel die jüngste Sitzung)
quant/data/market/intraday/status.json                        Bilanz des Laufs (Zählungen, keine Kurse)
```

Abgeschlossene Snapshots kosten keinen zweiten Abruf; identische Stände werden
nicht neu geschrieben; ältere Sitzungen als `retentionSessions` (2) werden aus
dem Baum entfernt. Der Hygiene-Guard prüft jede Datei: Titel im Umfang,
Grundlage vorhanden, Sitzung = Verzeichnis (IH1–IH4).

Zwei Umfänge (`intraday.scopes`): **discover** — die Titel auf den
Discover-Flächen (`discover/data/live-scope/US_REAL.json`, geschrieben vom
Build; heute 223 Titel) alle 10 Minuten während der Sitzung; **universe** —
das ganze Produktuniversum einmal nach Schluss, damit jede Aktienseite ein 1T
hat.

### 2.4 Was „live" auf GitHub Pages heißt — und was nicht

Es gibt keinen Server und keinen Schlüssel im Browser
(`docs/TIINGO_LIVE_ARCHITECTURE.md`). „Live" bedeutet: der Workflow
`intraday-snapshots.yml` erneuert die Snapshots im Sitzungstakt, die Seite
fragt in demselben Takt nach und nennt den Stand mit Uhrzeit. Grenzen, die
diese Auslieferung hat und die die Seite nicht verschweigt:

- GitHub Pages baut etwa zehnmal je Stunde; ein Stand ist deshalb bis zu ~10
  Minuten alt. Die Karte schreibt **„Heute · Stand 15:42"**, nie „live"
  (`isLive` bliebe `false`, bis ein echter Strom fließt).
- Das Anbieterlimit ist als Sicherheitsobergrenze 100 Anfragen/Minute
  (`COMMERCIAL_LIMITS`, `SAFETY_CEILING`): 223 Titel dauern ~2,5 Minuten je
  Lauf, das Universum ~1 Stunde nach Schluss.
- Cron kennt keine Sommerzeit; das Fenster ist 13–21 UTC, der Resolver hält
  Läufe außerhalb der Sitzung kurz (kein Abruf, kein Commit).
- Repository-Wachstum: je Discover-Lauf ändern sich nur gewachsene Snapshots
  (~40 Byte je neuem Punkt); der Universumslauf schreibt einmal täglich
  5.684 Dateien à ~1–8 KB. Git speichert Deltas; die Retention hält den Baum
  bei zwei Sitzungen.

Ein WebSocket-Relay (mit dem bereits belegten Strom, `wss://api.tiingo.com/iex`)
würde in denselben Hub und dieselbe Richtlinie eingehängt (`isLive: true`,
Label „Heute · live"). Er ist nicht gebaut: er bräuchte einen Server.

### 2.5 Shared Live Data Hub (Client)

`discover/ui/live-hub.js` — **ein** Strom je Titel für Eingangsfläche, Karte
und Aktienseite:

- Verzeichnis einmal je Seite; Snapshots je Pfad einmal, laufende Abrufe
  dedupliziert; `merge` hält das Unveränderlichkeitsprinzip auch im Browser.
- Abonnements hängen an der Sichtbarkeit (IntersectionObserver, Rand 80 px):
  Karte im Bild → abonnieren, Karte draußen → kündigen. Nie mehr Abonnements
  als sichtbare Karten (gemessen: 9 Abonnenten bei 8 sichtbaren Karten plus
  Eingangsfläche; nach acht Bildschirmen 78 Kündigungen).
- Nachfragen nur, wenn es etwas bringen kann: Börse offen oder Verzeichnis
  hinkt dem Kalender hinterher; verstecktes Fenster hält an; ohne Abonnenten
  kein Timer. Ein Tick lädt nur Snapshots, deren `asOf` sich geändert hat.
- Sitzungswechsel (09:30, 16:00) per Zeitgeber auf `nextChangeAt`: die
  Beschriftung springt ohne neuen Abruf (LH5).
- Vorladen der nächsten ein, zwei Karten beim Wischen (`prefetch`).

Die Karte lädt **entweder** den Tagesverlauf (wenn das Verzeichnis den Titel
kennt) **oder** die Tagesreihe — ein Abruf je sichtbarer Karte, nicht zwei;
fällt der Snapshot aus, kommt die Tagesreihe, fällt auch die aus, die
Renditeleiter. Ein Skelett („Kurs lädt") mit derselben Höhe verhindert
Layout-Sprünge (gemessen: alle Kartenbilder 88 px auf dem Telefon).

### 2.6 Darstellung

Ein Renderer für Intraday (`microchart.js#renderIntraday`), drei Größen:
Karte (300×92), Eingangsfläche (640×110), Aktienseite (960×400 mit
Zeitachse). Die Zeitachse ist die ganze Sitzung 09:30–16:00; eine laufende
Sitzung füllt sie nur so weit, wie echte Punkte reichen. Startlinie ist der
Vortagesschluss (sonst der erste Kurs — und die Beschreibung sagt das).
Keine Animation, keine Interpolation; der letzte Punkt einer laufenden Sitzung
trägt einen ruhigen Ring, keinen Puls.

UI-Sprache (`TradingSession.describe`): „Heute · Stand 15:42", „Heute ·
Schluss 16:00", „Heute · Schluss 13:00 (verkürzt)", „Letzter Handelstag ·
Freitag", „Letzter Handelstag · 04.09."; App-Leiste „Geöffnet · Stand 15:00"
bzw. „Geschlossen · Letzter Handelstag · Freitag". Keine technischen Codes,
kein „Keine Live-Daten".

Aktienseite: Standard **1T**, wenn ein Snapshot vorliegt (sonst 1J); 1M–1J,
5J, Max aus der Tagesreihe wie bisher; 5T entfällt (eine Sitzung je Titel —
„fünf Tage" aus einem Tag wären eine Behauptung). Für 1T ist der
Werkzeugkasten zu: gleitende Durchschnitte über 5-Minuten-Kurse wären andere
Kennzahlen als die der Tagesreihe.

### 2.7 Keine Parallelarchitektur

| Vorgabe | Umsetzung |
|---|---|
| kein zweiter MarketStore | `MarketStore` für Tageskurse; Intraday-Snapshots sind eine Ablage desselben Datenraums (`quant/data/market/`), geprüft vom selben Guard |
| kein zweiter Company Master | `universe-source.mjs` liest, erzeugt nichts |
| keine zweite Chart-Engine | Tagesreihen: bestehender `technicalChart`/Micro-Chart; Intraday: ein Renderer im bestehenden `microchart.js` |
| kein zweiter Symbol Resolver | `SymbolMapping.createRegistry` wie im Tages-Ingest |
| keine zweite Live-Engine | `RealtimeSource.assess` bleibt; der Hub ist die Verteilung, `trading-session.js` sitzt auf `market-hours.js` |

---

## 3. Daten-Coverage nach den ersten Workflow-Läufen (gemessen)

Drei Läufe auf dem Branch, alle mit echtem Tiingo-Zugang in GitHub Actions:

| Lauf | Ergebnis |
|---|---|
| `intraday-snapshots.yml` #1 (34764858020, 15:11 UTC, So 13.09.) | Discover-Umfang: 223 Titel, 223 Anfragen in 121 s, **219 Snapshots** der letzten abgeschlossenen Sitzung (Fr 11.09.), 4 ohne reguläre IEX-Bars (ALE, ALOT, BRK-A, NRT); 195 mit allen 78 Fünf-Minuten-Bars, Minimum 41; 563 KB gesamt, Verzeichnis 45 KB |
| `market-data-refresh.yml` #1 (34764857968) | brach nach ~1.100 Titeln an einer Reihe mit zu wenigen Bars ab (Protokollzeile las `stats.errors` auf `null`) — behoben in abf6f96; Arbeitsablage (330 MB) gesichert |
| `market-data-refresh.yml` #2 (34765537674, 45 min Ingest) | Ingest, Faktoren, Technical, Discover-Build und Hygiene grün; vier Tests aus der 498er-Zeit rot (Suchindex < 120 KB, „nicht jede Reihe ausgeliefert", „> 50 Karten ohne Reihe", Inline-Punkte der Eingangsfläche) — angepasst in c79aabd; Arbeitsablage 1 561 MB gesichert |
| `market-data-refresh.yml` #3 (34768312221, 8 min) | aus dem Cache: 5 386 Titel aktuell, 299 erneut abgelehnt (Qualität), 0 fehlgeschlagen; **Commit ae2aa1c** mit 10 785 Dateien |

### 3.1 Kennzahlen (Stand ae2aa1c, Kurse bis 11.09.2026)

| Frage | Zahl |
|---|---|
| Instrumente in der Universumsquelle (Fallback, Company Master PENDING) | 5 684 (+ Benchmark SPY = Umfang 5 685) |
| davon bei Tiingo aufgelöst / mit ≥ 250 Tagesbars | 5 684 / 5 663 |
| Tageskurse in der Arbeitsablage (ab 2023-01-01, fullHistory ab 2015) | 5 386 Titel; 299 von der Qualitätsprüfung abgelehnt (large_move, split_not_adjusted, stale_last_bar …) |
| kompakte Discover-Reihen (`discover-series/`, 1 Jahr Tagesschluss) | **5 379** geschrieben, 306 übersprungen (301 ohne Arbeitsdaten, 5 mit < 30 Schlusskursen); 33 MB |
| Faktorzeilen (`factors-FULL_UNIVERSE.json`, jetzt im Repository) | **5 339** gerechnet, 345 übersprungen; 18 MB |
| Discover US_REAL: Titel / mit Kursreihe / Detailseiten | **5 339 / 5 339 (100 %) / 5 339** |
| nicht discovery-eligible (Handelsregeln, ausgewiesen, nicht versteckt) | 92 |
| Karten auf der Startseite / mit echtem Tageschart | 179 (148 Titel) / **179 (100 %)** |
| Live-Umfang (Titel auf Discover-Flächen) | 293 |
| Intraday-Snapshots nach Lauf #1 / davon im neuen Live-Umfang | 219 / 136 (Universumslauf siehe 3.2) |
| Suchindex US_REAL (geladen erst beim Öffnen der Suche) | 536 KB (≈ 100 B je Titel) |
| `discover/data` gesamt | 94 MB (5 339 Detailseiten, 21 Reihen, Startseite in 3 Stücken) |
| Hygiene-Guard, Verifier (15 996+ Nachrechnungen), 166 Discover- und 711 Quant-Tests | grün |

### 3.2 Intraday-Universumslauf (gemessen)

`intraday-snapshots.yml` #2 (f0a578b, `[intraday-snapshot:universe]`, Commit d6a342e):

| Kennzahl | Wert |
|---|---|
| Umfang / Anfragen / Laufzeit | 5 685 Titel / 5 466 Anfragen / 54 min (100 Anfragen je Minute, Sicherheitsobergrenze) |
| Snapshots der letzten abgeschlossenen Sitzung (Fr 11.09.) | **4 348** (4 129 neu + 219 unveränderlich aus Lauf #1, 0 Anfragen dafür) |
| ohne reguläre IEX-Bars (dünn gehandelt; ehrlich ohne Tagesverlauf) | 1 337 |
| fehlgeschlagen | 0 |
| vollständige Sitzung (78 Fünf-Minuten-Bars) / weniger als 20 Bars | 2 821 / 134 |
| Größe | 10,3 MB (Verzeichnis 82 KB: 236 Einträge mit Stand für den Discover-Umfang + 4 348 Kürzel je Sitzung + 107 ID-Ausnahmen) |
| Live-Umfang mit Tagesverlauf | 236 von 293 (57 ohne IEX-Abschlüsse) |
| Discover-Titel mit 1T auf der Aktienseite | **4 114 von 5 339** (77 %) |

Die Kursreihe der übrigen Titel bleibt die Tagesreihe: Karte und Aktienseite
zeigen 1M–1J, kein Tagesverlauf wird geschätzt. Das Verzeichnis führt das
Universum nur als Kürzelliste je Sitzung; die Aktienseite baut den Pfad aus
Sitzung, Muster (`ref_<symbol>`) und Ausnahmen — kein Abruf ins Leere, kein 404.

### 3.3 Initial-Load (lokal gemessen, Startseite, echte Daten)

| | Desktop 1440×900 | iPhone 390×844 |
|---|---|---|
| Anfragen bis `networkidle` | 67 | 55 |
| Nutzlast (unkomprimiert) | 1 112 KB | 1 051 KB |
| davon JS / CSS / JSON (Meta, Startseite Stück 1, Intraday-Verzeichnis 82 KB) | 437 / 125 / 221 KB | 437 / 125 / 221 KB |
| Kursreihen (Tagesschluss) im Vorlade-Rand | 14 (90 KB) | 6 (38 KB) |
| Intraday-Snapshots (sichtbar + 80 px, inkl. Vorladen der nächsten Karten) | 13 (111 KB) | 9 (100 KB) |
| Live-Abonnenten nach dem Laden | 1 (Eingangsfläche; Karten folgen beim Scrollen) | 1 |
| Karten im DOM (Stück 1) / DOM-Knoten | 52 / ~1 740 | 52 / ~1 680 |
| Cache-Treffer (Series-Loader / Hub) | jede Reihe und jeder Snapshot genau einmal (requests = cached, failures 0) | dito |

Kein Abruf hängt von der Titelzahl ab: die Startseite lädt drei Stücke,
Reihen und Snapshots nur für Sichtbares. Die Zeitmessung selbst (DOMContentLoaded)
ist in dieser Sandbox nicht belastbar (lokaler Node-Server unter Last) und
wird nicht berichtet.

### 3.4 Bekannte Grenzen nach den Läufen

- **Abgelehnte Reihen werden je Lauf erneut angefragt** (299 Anfragen), weil
  eine Ablehnung nicht als „erledigt" im Checkpoint steht. Kostet ~3 Minuten
  Kontingent je Tag; Nacharbeit: Ablehnungen mit Datum merken und erst nach
  n Tagen erneut prüfen.
- **`discover/data` (94 MB) wird täglich neu geschrieben**, weil jede
  Detailseite Stand und Kennzahlen trägt; Git speichert Deltas, die Historie
  wächst trotzdem um Dutzende MB je Tag. Nacharbeit: Detailseiten nur bei
  Änderung schreiben oder Kennzahlen aus einer Datei je Universum lesen.
- Vier Titel des Discover-Umfangs haben keine regulären IEX-Bars (BRK-A,
  ALE, ALOT, NRT): sie zeigen die Tagesreihe, keinen Tagesverlauf — ehrlich,
  nicht geschätzt.
- Der Company Master (7 004 Titel) ist nicht übernommen; das Universum ist
  der Fallback mit 5 684 Titeln (Abschnitt 1.2).

## 4. Tests und QA

| Suite | Umfang | Ergebnis |
|---|---|---|
| `quant/tests/trading-session.test.mjs` | TS1–TS8 Zeitzustände, IS1–IS4 Intraday-Vertrag | 12 grün |
| `quant/tests/universe-source.test.mjs` | US1–US5 Company Master / Fallback / Übergabepunkt | 5 grün |
| `quant/tests/intraday-hygiene.test.mjs` | IH1–IH4 Guard | 4 grün |
| `quant/tests/*.test.mjs` gesamt | inkl. angepasste R10, DS6, Q11, Q14, I14 | 711 grün |
| `discover/tests/live-hub.test.mjs` | LH1–LH6 Dedup, kein Polling bei Schluss, Wachstum, Rollover, Abschaltung | 6 grün |
| `discover/tests/scale.test.mjs` | SC1–SC7 keine 498/GATE_500, Universumsquelle, Live-Umfang, kanonische Reihen, Snapshots | 7 grün |
| `discover/tests/*.test.mjs` gesamt | inkl. LH7 (Pfad aus Sitzung + Muster) | 167 grün |
| `scripts/discover/verify-discover-data.mjs` | ausgelieferte Daten vs. Engines | keine Abweichung |
| `scripts/discover/browser-qa-live.mjs` | 29 Prüfpunkte Desktop + iPhone, Uhr Fr 15:00 NY (laufend) und echte Uhr (So, Schluss) | 2 × 29 grün |
| `scripts/discover/browser-qa-v3.mjs` | 39 Prüfpunkte V3 (von Golden-Five-Annahmen gelöst) | grün |
| `scripts/discover/browser-qa.mjs` | 63 Prüfpunkte der Stufen 1–5 (Annahmen aus der 498er-Zeit auf das große Universum umgestellt) | 63/63 |

Die Browser-QA lief zweimal: gegen die echten Daten aus den CI-Läufen (echte
Uhr, Sonntag → „Letzter Handelstag · Freitag") und gegen Mock-Snapshots aus
einem lokalen Tiingo-Nachbau mit gestellter Uhr (Freitag 15:00 New York →
„Heute · Stand 14:55") zum Nachweis des laufenden Zustands; die Mock-Daten
liegen **nicht** im Repository. Geprüft
wurden dabei: Verzeichnis einmal geladen, jeder Snapshot höchstens einmal
geholt, Abonnenten ≤ sichtbare Karten, Kündigungen beim Scrollen, kein Polling
bei geschlossener Börse, kein Polling im versteckten Fenster, Beschriftung in
Seitensprache, 1T als Standard, Zeitachse, 5T entfernt, keine Konsolenfehler,
keine 4xx, kein horizontaler Überlauf, keine Layout-Sprünge.

---

## 5. Abnahmebericht (Stand d6a342e, So 13.09.2026)

| Kennzahl | Wert | Quelle |
|---|---|---|
| Instrumente im Company Master | 7 004 (in `claude/tiingo-us-equity-discovery-k5j4bc`, **nicht übernommen**) | Abschnitt 1.2 |
| Instrumente in der genutzten Universumsquelle | 5 684 (+ SPY) | `universe-FULL_UNIVERSE.json` |
| Tiingo-Symbole aufgelöst | 5 684 (100 %) | Gate-Bericht |
| Historische Coverage (kompakte Jahresreihe) | 5 379 (94,6 %); 301 von der Qualitätsprüfung abgelehnt, 5 zu kurz | `discover-series/index.json` |
| Faktorzeilen | 5 339 (93,9 %) | `factors-FULL_UNIVERSE-summary.json` |
| Intraday-Coverage (letzte Sitzung, 5 min, IEX) | 4 348 (76,5 %); 1 337 ohne IEX-Abschlüsse | `intraday/status.json` |
| Live-Coverage | 0 Ströme — auf GitHub Pages Snapshot-Refresh im 10-Minuten-Takt während der Sitzung (`isLive: false`, Label „Stand HH:MM") | Abschnitt 2.4 |
| Discover-eligible | 5 339 Titel mit Karte/Detailseite; 92 als nicht handelbar ausgewiesen | `meta.json` |
| Karten mit echtem Micro-Chart (Startseite) | 179 von 179 mit Tagesreihe (100 %); 152 von 179 Karten (121 von 148 Titeln) mit Tagesverlauf; Live-Umfang 236 von 293 Titeln | Coverage-Bericht |
| ohne Chart, Gründe | 0 ohne Tagesreihe auf der Startseite; 1 337 Titel ohne Tagesverlauf (keine IEX-Abschlüsse), 306 ohne Jahresreihe (Qualität/zu kurz) | `status.json`, `index.json` |
| Initial-Load Startseite (Desktop / iPhone) | 67 / 55 Anfragen, 1,11 / 1,05 MB unkomprimiert, 1 Live-Abonnent, Verzeichnis 82 KB | Abschnitt 3.3 |
| Cache-Trefferquote | jede Reihe und jeder Snapshot genau einmal je Sitzung (requests = cached, failures 0); 219 Snapshots im zweiten Lauf ohne Anfrage (unveränderlich) | Hub-Statistik, `status.json` |
| Mobile-Performance | 390 px: kein horizontaler Überlauf, erste Reihe bei 784 px im ersten Bild, Kartenbilder 88 px ohne Sprung, ≤ 14 Abonnenten im ersten Bild | Browser-QA live/legacy |
| QA | Live-QA 29/29 (echte Uhr) + 29/29 (Uhr Fr 15:00 NY, Mock), V3-QA 39/39, Legacy-QA 63/63 — alle auf den echten Daten | `scripts/discover/browser-qa*.mjs` |
| Tests | 167 Discover, 711 Quant, Verifier ohne Abweichung, Hygiene-Guard grün | `node --test` |

Was in dieser Sandbox **nicht** gemessen werden konnte: eine laufende
Sitzung mit echten Daten (Sonntag). Der Pfad „Heute · Stand 15:42" ist
durch die Uhr-gestellte Browser-QA (Freitag 15:00 New York) mit
Mock-Snapshots und durch den Vertrag (IS3: wachsend, nie schrumpfend)
belegt; die erste echte Sitzung liefert der Montag-Zeitplan — auf diesem
Branch nur per Push-Marke.

## 6. Empfehlung

Nicht veröffentlichen, bevor (a) der erste Lauf von `market-data-refresh.yml`
Faktorzeilen und kompakte Reihen für das Produktuniversum geliefert hat,
(b) `intraday-snapshots.yml` einen Sitzungstag durchlaufen ist und (c) der
Company Master übernommen wurde — oder der Eigentümer den Fallback (5.684
Titel) ausdrücklich als Produktuniversum akzeptiert.
