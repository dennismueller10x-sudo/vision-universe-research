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

## 3. Coverage vor dem ersten Workflow-Lauf (dieser Sandbox fehlt der Schlüssel)

`docs/VU_DISCOVER_PRICE_COVERAGE.md` (aus `scripts/discover/price-coverage.mjs`):
Discover rechnet hier noch mit den 498 GATE_500-Faktorzeilen (`factorCoverage.partial =
true`), 5 kompakte Reihen, 0 Intraday-Snapshots. Der Build sagt das im Meta;
die Seite sagt „Für 5 von 498 Titeln liegt eine Kursreihe vor".

Der Abschnitt 5 wird nach dem ersten Lauf von `market-data-refresh.yml` und
`intraday-snapshots.yml` mit den gemessenen Zahlen ergänzt.

---

## 4. Tests und QA

| Suite | Umfang | Ergebnis |
|---|---|---|
| `quant/tests/trading-session.test.mjs` | TS1–TS8 Zeitzustände, IS1–IS4 Intraday-Vertrag | 12 grün |
| `quant/tests/universe-source.test.mjs` | US1–US5 Company Master / Fallback / Übergabepunkt | 5 grün |
| `quant/tests/intraday-hygiene.test.mjs` | IH1–IH4 Guard | 4 grün |
| `quant/tests/*.test.mjs` gesamt | inkl. angepasste R10, DS6, Q11, Q14, I14 | 732 grün |
| `discover/tests/live-hub.test.mjs` | LH1–LH6 Dedup, kein Polling bei Schluss, Wachstum, Rollover, Abschaltung | 6 grün |
| `discover/tests/scale.test.mjs` | SC1–SC7 keine 498/GATE_500, Universumsquelle, Live-Umfang, kanonische Reihen, Snapshots | 7 grün |
| `discover/tests/*.test.mjs` gesamt | | 166 grün |
| `scripts/discover/verify-discover-data.mjs` | ausgelieferte Daten vs. Engines | keine Abweichung |
| `scripts/discover/browser-qa-live.mjs` | 29 Prüfpunkte Desktop + iPhone, Uhr Fr 15:00 NY (laufend) und echte Uhr (So, Schluss) | 2 × 29 grün |
| `scripts/discover/browser-qa-v3.mjs` | 39 Prüfpunkte V3 | grün |

Die Browser-QA lief gegen einen lokalen Server mit Mock-Snapshots (Werte aus
einem lokalen Tiingo-Nachbau, nur zum Nachweis des Schreib- und
Zeichenpfads); diese Mock-Daten liegen **nicht** im Repository. Geprüft
wurden dabei: Verzeichnis einmal geladen, jeder Snapshot höchstens einmal
geholt, Abonnenten ≤ sichtbare Karten, Kündigungen beim Scrollen, kein Polling
bei geschlossener Börse, kein Polling im versteckten Fenster, Beschriftung in
Seitensprache, 1T als Standard, Zeitachse, 5T entfernt, keine Konsolenfehler,
keine 4xx, kein horizontaler Überlauf, keine Layout-Sprünge.

---

## 5. Abnahmebericht (wird nach dem ersten Workflow-Lauf ergänzt)

Kennzahlen, die hier stehen werden: Instrumente im Company Master / Fallback,
Tiingo aufgelöst, historische Coverage, Intraday-Coverage (discover /
universe), Live-Coverage, Discover-eligible, Karten mit echtem Tagesverlauf,
ohne Chart mit Gründen, Requests und Nutzlast beim Initial-Load, Cache-Trefferquote,
Mobile-Performance.

---

## 6. Empfehlung

Nicht veröffentlichen, bevor (a) der erste Lauf von `market-data-refresh.yml`
Faktorzeilen und kompakte Reihen für das Produktuniversum geliefert hat,
(b) `intraday-snapshots.yml` einen Sitzungstag durchlaufen ist und (c) der
Company Master übernommen wurde — oder der Eigentümer den Fallback (5.684
Titel) ausdrücklich als Produktuniversum akzeptiert.
