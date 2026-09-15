# VU INVESTMENT INTELLIGENCE — BUILD STATUS

Letzte Aktualisierung: **Phase 3 abgeschlossen — Anbieterqualifikation und
Bereinigungssemantik.**

> **Phase 3** (September 2026) hat den offenen Auditbefund MEDIUM-7 behoben
> und ein Verfahren gebaut, das Datenanbieter auf ihre Eignung fuer
> historische Auswertungen prueft. Bericht:
> `docs/VU_PHASE3_IMPLEMENTATION_REPORT.md`, Ergebnis:
> `docs/VU_PROVIDER_DECISION_MATRIX.md`.
> **232 Tests gruen** (177 aus Phase 2, 55 neu).
>
> Ergebnis der Qualifikation: **kein Anbieter besteht alle drei Gates, kein
> Befund ist zur Laufzeit geprueft.** Das Verfahren steht, das Urteil fehlt -
> und das ist die ehrliche Bilanz, nicht ein Zwischenstand.
>
> **Phase 2** hatte zuvor die Providerschicht fuer echte Marktdaten gebaut.
> Bericht: `docs/VU_PHASE2_IMPLEMENTATION_REPORT.md`, Befunde:
> `docs/VU_PHASE2_PRODUCTION_AUDIT.md`.
> Das System laeuft weiterhin vollstaendig ohne Anbieterzugang.

## Discover (Zweig `claude/vision-universe-discover-h93fmv`, nicht in `main`)

| Stufe | Inhalt | Bericht |
|---|---|---|
| 1 | Modul, Datenvertrag, Reihen, Detailseite, 52-Wochen-Engine, Leadership Score | `VU_DISCOVER_DELIVERY_REPORT.md` |
| 2 | Dunkle Experience: Eingangsfläche, Poster, Reihenformen, Suche, Telefon | `VU_DISCOVER_EXPERIENCE_REDESIGN.md` |
| 3 | Bildsprache: Farbwelten, datengetriebenes Artwork, dunkler Header | `VU_DISCOVER_VISUAL_IDENTITY.md` |
| 4 | Consumer Layer: Klartext statt Scores, Sammlungen, drei Ebenen | `VU_DISCOVER_CONSUMER_LAYER.md` |
| 5 | Aktienseite als Ebene 2, Swipe-Grundlage, Einzeln entdecken | `VU_DISCOVER_STOCK_EXPERIENCE.md` |
| 6 | V3: Surfaces, Relevanz, Diversity, Chart Truth Contract, Themenwelten (Branch, nicht gemergt) | `VU_DISCOVER_V3.md`, `VU_DISCOVER_V3_COLLECTION_AUDIT.md` |
| 7 | Price Data Completion: Umfang an einer Stelle, kompakte Reihen, Series-Store, Lazy Loading (Branch) | `VU_DISCOVER_PRICE_DATA_COMPLETION.md`, `VU_DISCOVER_PRICE_COVERAGE.md` |
| 8 | Full Market Universe & Live Intraday: Eigentümer-Freigabe (13.09.2026) in Richtlinie/Gates/Profil, kanonische Universumsquelle mit Company-Master-Übergabepunkt, Trading Session Resolver, Intraday-Vertrag + Ingest + Snapshots, Live-Hub, Micro-Intraday auf Karten/Hero/Aktienseite (1T), Workflows `market-data-refresh.yml` + `intraday-snapshots.yml`. Erste CI-Läufe: 5 379 Jahresreihen, 5 339 Faktorzeilen/Karten (100 % mit Chart), 4 348 Intraday-Snapshots (Branch, nicht gemergt, nicht veröffentlicht) | `VU_DISCOVER_FULL_UNIVERSE_LIVE.md`, `VU_DISCOVER_PRICE_COVERAGE.md` |
| 9 | Company-Master-Integration: `us-security-master-1.1.0` (2e22a2e, 7 004 Titel) als kanonische Universumsquelle, Fallback auf 5 684 entfernt, Capability Matrix je Instrument, Sektor-Overlay aus der Gate-Datei, Collections neu berechnet. CI-Läufe: 6 514 Faktorzeilen/Aktienseiten, 6 555 Jahresreihen, 5 188 Intraday-Snapshots; 793 Quant-/167 Discover-Tests, 29+38+63 Browser-Prüfungen grün (Branch, nicht gemergt, nicht veröffentlicht, V3 visuell unverändert) | `VU_DISCOVER_COMPANY_MASTER_INTEGRATION.md`, `VU_DISCOVER_PRICE_COVERAGE.md` |
| 10 | Company Name Enrichment: kanonische Namensschicht `security-master/company-names.json` (Tiingo-Stammdaten → SEC-Tickerverzeichnis → kuratiert, Schlüssel statt Ähnlichkeit, Widerspruchsregel, Herkunft je Zeile), universe-source-Overlay, Discover bevorzugt displayName → legalName → Ticker. 6 981 / 7 004 Namen (99,67 %), 23 offen (Anbieter ohne Namen, Testsymbole); 801 Quant-/170 Discover-Tests, Verifier, Matrix grün; Mitgliedschaft, Kurse, Faktoren, Intraday unverändert (Branch, nicht gemergt, nicht veröffentlicht) | `VU_COMPANY_NAME_ENRICHMENT.md` |
| 12 | Live-Schaltung 15.09.2026: Modelluniversum aus Discover entfernt (nur `US_REAL`), Zweig auf `main` gemergt (kanonische SEC-Schicht von `main`, Normalisierung 1.10.0, Consumer-Export als zweite Ausgabe), `instrumentId` des Company Masters auf jeder Aktienseite, `stock-index`-Vertrag, Company-Master-Artefakte aus der neuen Eligibility; Tests 873 Quant / 191 Discover / 471 Python, Verifier 57 901, Browser-QA grün — **veröffentlicht unter `https://research.visionuniverse.de/discover/`** | `VU_DISCOVER_V3_NETFLIX_BUILD.md` §24b |
| 11 | MASTER BUILD „Netflix of Stock Research": (A) Testsymbole und Nicht-Aktien über Klassifizierer + Namensschicht ausgeschlossen (Produktuniversum 7 004 → 6 875, Consumer-Policy 5 947 Titel, NASDAQ-Suffixcode P/O/N/M für Vorzüge, `displayName`-Schicht); (B) Consumer-Fundamentals aus dem SEC-Bulk-Archiv über die bestehende Pipeline (5 066 / 6 878 Unternehmen, 10 J 2 039, TTM 4 739; Annual/Quarterly/TTM getrennt, PIT auf Filing-Datum; Normalisierung 1.6.0), Engines Damals vs. heute / Journey / Story / Health / Signale, 10 fundamentale Sammlungen; (C) Discover mit Story-Fläche, Rhythmus aus 31 Flächen, Karten-Hook, „Weil du … angesehen hast", Aktienseite in Streaming-Reihenfolge (15 Sektionen), Next Discovery, Empfehlungs-Vertrag. Tests 801 Quant / 192 Discover / 267 Python, Verifier 66 148 Nachrechnungen, Browser-QA 63 + 38 + 29 grün, 25 Screenshots unter `docs/screenshots/discover-v3-netflix/` (Branch, nicht gemergt, nicht veröffentlicht) | `VU_DISCOVER_V3_NETFLIX_BUILD.md`, `VU_FUNDAMENTAL_INTELLIGENCE.md` |

Stand Stufe 5: 118 Discover-Tests, 684 Quant-Tests, 9 502 Nachrechnungen
der ausgelieferten Daten, 63 Browser-Prüfungen — alles grün.

**Veröffentlicht am 12.09.2026** unter
`https://research.visionuniverse.de/discover/`, nach `main` gemergt. Der
Menüeintrag **Discover** steht in `assets/site-navigation.js` an zweiter
Stelle und erscheint damit auf jeder Seite. Der Einzelmodus liegt unter
`/discover/#/einzeln/US_REAL` und ist aus der Discover-Leiste erreichbar.

### Stufe 6 — Discover V3 (Branch `claude/vision-universe-discover-v3`)

Nicht gemergt, nicht veröffentlicht. 150 Discover-Tests, 13 654
Nachrechnungen, 63/63 + 31/31 Browser-Prüfungen, 684 Quant-Tests. Die
Startseite ist ein Manifest aus 21 Surfaces in sieben Formen; bekannte Namen
rücken innerhalb qualifizierter Titel nach vorn; kein Renditepfad wird mehr
als Kurve gezeichnet — fünf echte Charts, 493 Renditeleitern. Details und
Empfehlung zur Veröffentlichung in `VU_DISCOVER_V3.md`.

### Stufe 7 — Price Data Completion (Branch `claude/vision-universe-discover-v3`)

Befund: alle 498 Titel haben Historie bei Tiingo und wurden ingestiert
(Gate 500: 500/500, ∅ 9 077 Bars ab 1990); ausgeliefert werden fünf, weil
`development-preview.json` den Umfang gegen eine ungeklärte Lizenz
(`LEGAL_REVIEW_REQUIRED`) so setzt. Das ist Richtlinie, nicht Technik — und
wurde nicht umgangen. Gebaut: Umfang als Tickerliste ODER Universum
(`scopeUniverse`), aufgelöst von `scripts/market/preview-scope.mjs`; kompakte
Ein-Jahres-Reihen (`quant/data/market/discover-series/`, ~7 KB je Titel) für
jeden Titel im Umfang; Ingest mit `--scope-from-preview`; Hygiene-Guard und
Workflow folgen dem Umfang; Discover-Series-Store
(`discover/data/series/<U>/<SYMBOL>.json`), Karten tragen Verweise, Reihen
laden bei Sichtbarkeit (Dedup je Titel, Prefetch der nächsten Karten,
Platzhalter ohne Chart). 153 Discover-Tests, 44 Hygiene-/Gate-Tests, 15 996
Nachrechnungen, Browser-QA V3 39/39. Heute 5 Charts von 498 — die Erweiterung
ist eine Zeile in der Konfiguration und eine Lizenzentscheidung des
Eigentümers.

### Auslieferungskette, geprüft

Ein grüner Pages-Build beweist, dass GitHub gebaut hat — nicht, dass die
Seite funktioniert. Deshalb ist die Kette einzeln nachgewiesen:

| Glied | Nachweis |
|---|---|
| `main` trägt Discover | 690 Dateien unter `discover/`, davon 658 Daten-JSONs |
| Pages baut daraus | Artefakt `github-pages` des Builds, 36 592 955 Bytes |
| Das Artefakt enthält Discover | +3,24 MB gegenüber dem Build davor; der Baum ohne `discover/` ist 3,17 MB kleiner |
| Pages hat ausgeliefert | Deployment-Status `success`, `environment_url` = `research.visionuniverse.de` |
| DNS zeigt auf Pages | `research.visionuniverse.de` → `dennismueller10x-sudo.github.io` → `2606:50c0:800x::153` |
| Der Baum liefert alles aus | 126 Anfragen, 0 mit Fehlerstatus (`scripts/discover/delivery-check.mjs`) |
| Die sieben Abnahmepunkte | Startseite, Aktie, Chart, Swipe, Einzeln, Navigation, Mobil — alle grün |

Nachrechnen: `node scripts/discover/delivery-check.mjs --root <baum>`. Das
Skript bedient einen Baum so streng wie Pages (Verzeichnis → `index.html`,
sonst 404, Gross-/Kleinschreibung zählt) und protokolliert jede Anfrage.

`.nojekyll` nimmt Jekyll aus der Kette: der Zweig wird wortwörtlich
veröffentlicht. Geprüft, dass nichts davon abhängt — keine Datei trägt
YAML-Front-Matter, keine HTML-Seite benutzt Liquid.

*Enforce HTTPS* war aus: alle Pages-Deployments bis zum 12.09.2026 meldeten
`http://research.visionuniverse.de/` statt `https://`, die Umleitung von HTTP
auf HTTPS fehlte also. Auf einem iPhone, das jede Adresse zuerst über HTTPS
versucht, war das die wahrscheinlichste Ursache für eine Seite, die nicht
aufgeht. **Am 13.09.2026 in den Repository-Einstellungen gesetzt**
(Settings → Pages → Enforce HTTPS); seitdem meldet das Deployment
`https://`. Die kanonische Adresse des Moduls ist damit
`https://research.visionuniverse.de/discover/`.

Datenlage für Ebene 2: Geschäftszahlen liegen für fünf reale Titel vor
(SEC-Einreichungen der Golden Five) und für das Modelluniversum;
Analystendaten und Segmentdaten gibt es nicht, entsprechende Abschnitte
wurden deshalb nicht gebaut.

## Universe Expansion — 498 → 5.690 (Zweig `claude/vision-universe-expansion-j633h8`)

**Der Grund für die 498 stand in zwei Zeilen Code, nicht beim Anbieter.**
`build-market-factors.mjs` schreibt Faktor-Einzelzeilen nur bis 500 Titel
ins Repository (Dateigröße, nicht Lizenz), und `build-discover-data.mjs`
las genau die dadurch größte Datei: `factors-GATE_500.json`. 500
ausgewählt, 2 ohne ausreichende Historie, 498 im Frontend — während der
FULL-UNIVERSE-Lauf längst 5.684 Titel geholt hatte.
Vollständige Herleitung: `docs/VU_UNIVERSE_EXPANSION.md`.

| Stufe | Inhalt | Bericht |
|---|---|---|
| 1 | Company Master: stabile `instrumentId`, idempotenter Sync, Fähigkeitsmatrix, Qualitäts- und Deckungsbericht | `VU_UNIVERSE_EXPANSION.md` |
| 2 | Suche und Aktienseite gegen den Master — lazy, scherbenweise | `VU_UNIVERSE_EXPANSION.md` |
| 3 | CIK-Zuordnung und SEC-Universum aus dem Master, Sammelweg für companyfacts | `VU_SEC_UNIVERSE_SCALE.md` |

| | vorher | nachher |
|---|---|---|
| Instrumente im ausgelieferten Universum | 498 | **5.690** |
| Primärschlüssel | Ticker | `instrumentId` (`vu_<14 hex>`) |
| delistete Titel | nicht geführt | 15, mit Datum |
| Suche kennt | 498 | das ganze Universum |
| Aktienseite öffnet | 498 | jedes Instrument im Master |
| Firmennamen | 498 | 517 (SEC-Lauf schließt den Rest) |

**Keine Obergrenze im Code.** `quant/config/company-master.json` führt
`size.maxInstruments: null`, und die CI prüft sowohl diese Zeile als auch,
dass kein `MAX_STOCKS`-artiges Konstrukt auftaucht.

Gemessen bei 25.000 / 50.000 Instrumenten: Sync 196 / 449 ms, Indexbau
21 / 56 ms, Suche 0,015 / 0,025 ms je Anfrage, **größte Suchscherbe 5 / 9
KB** — der Browser lädt Kilobyte, nicht das Universum.

**731 Quant-Tests, 118 Discover-Tests, 257 Python-Tests, 650 Prüfungen des
Masters, 19 + 63 Browser-Prüfungen** — alles grün.

Noch offen und ausschließlich ein Workflow-Lauf: `sec.gov` und
`api.tiingo.com` sind aus der Bauumgebung nicht erreichbar. Der Job
`sync` in `.github/workflows/universe-master.yml` holt das vollständige
Anbieterverzeichnis (108.573 Zeilen) und die CIK-Zuordnung; erst danach
stehen Firmennamen und CIK für das ganze US-Universum.

## Fundamental Data Expansion (Zweig `claude/vision-universe-expansion-j633h8`)

**Quelle der Wahrheit ist der akzeptierte US-Wertpapierstamm**, nicht mehr
der 5.690er Stand: 7.803 Mitglieder, **7.004 Produkttitel**, 799
bestätigte Nicht-Aktien. Der Company Master *konsumiert* diese
Entscheidung — die Eignungsdatei nennt ihre Mitgliederliste mit sha256,
und der Bau bricht ab, wenn sie abweicht.

| | |
|---|---:|
| Instrumente (Listings) | 7.809 |
| Mitglieder | 7.803 |
| **Produkttitel** | **7.004** |
| Emittenten mit CIK | 5 |
| Emittenten mit Geschäftszahlen | 5 (18,25–18,75 Jahre, 73–76 Quartale) |
| Metrikregistry | 27 → **40** Kennzahlen, EBITDA ableitbar |

Drei Identitätsebenen: `instrumentId` (Listing), `masterMemberId`
(Mitglied), `issuerId` (Gesellschaft = CIK). Produkttitel werden als
**Mitglieder** gezählt — sechs Mitglieder liegen an zwei Börsen.

**Drei echte Befunde aus dem Abgleich:** 308 Vorzugspapiere galten als
Stammaktien (getrennte Tickerschreibweise `CTA-P-B`); 2.119 aus dem
Wertpapierstamm angehängte Titel hätten einen Kursverlauf zugeschrieben
bekommen, den es nie gab; die Screenerfähigkeit folgte der eigenen
Klassifikation statt der Produktentscheidung und hätte 457 Optionsscheine
in den Aktienscreener gelassen.

Berichte: `docs/VU_FUNDAMENTAL_DATA_EXPANSION.md`,
`docs/VU_FUNDAMENTAL_ACCEPTANCE_REPORT.md`. Maschinenlesbar unter
`quant/data/fundamentals/` und `quant/data/universe/`.

**279 Python-Tests, 683 Master-Prüfungen, 118 Discover-Tests** — grün.
Offen und ausschließlich ein Workflow-Lauf: `sec.gov` ist aus der
Bauumgebung mit HTTP 403 gesperrt. `sec-fundamentals-universe.yml` mit
`backfill: true` füllt 7.291 fehlende Firmennamen, die CIKs und die
Fundamentalhistorie.

## Completed

Alle zehn Phasen sind umgesetzt. Der vollstaendige Bericht steht in
`docs/VU_IMPLEMENTATION_REPORT.md`.

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Audit und Implementation Plan | ✓ |
| 1 | Foundation: Schema, Provider-Interfaces, Methodik, Query-AST, VUQL, Strategy Schema | ✓ |
| 2 | Mock Core: 500 Securities + 11 Edge-Case-Fixtures, MockProvider | ✓ |
| 3 | Quant Core: Normalisierung, Faktoren, VU Quant Score, Radar, Praekomputation | ✓ |
| 4 | Discovery: Quant Home, Ranking, Screener, Radar, Stock Detail, UI-Fundament | ✓ |
| 5 | Strategy Engine: Bibliothek, Strategy Lab, Versionierung, Lineage, Product API | ✓ |
| 6 | Backtest Engine: PIT, Ausfuehrung, Kosten, Metriken, Trust Score, Current Holdings | ✓ |
| 7 | AI Foundation: AIProvider, MockAI, Tool Registry, NL → AST, AI-Seite | ✓ |
| 8 | Watchlist Intelligence: Deltas, Faktorbewegungen, Events | ✓ |
| 9 | Quality Pass: Tests, Responsive, Zustaende, Dokumentation, CI | ✓ |

### Umfang

- **11 Produktseiten** (10 aus V1, `/quant/markt/` aus Phase 2), 23 Engine-Module
  (~6.700 Zeilen V1 + ~1.170 Zeilen Providerschicht), 4 versionierte Methodik-Dateien
- **232 Tests gruen** (`node --test "quant/tests/*.test.mjs"`, ~40 s), darunter die
  22 Acceptance-Kriterien aus Abschnitt 76, die 8 Schluesselpruefungen aus Phase 2
  und die 3 Gate-Tests aus Phase 3
- **27 Fachdokumente** unter `docs/` (13 aus V1, 7 aus Phase 2, 7 aus Phase 3),
  4 Provider-Vorbereitungen unter `providers/`
- CI: `.github/workflows/quant-ci.yml` — Tests, JSON-Validitaet, Seitenstruktur,
  Konsistenz zwischen praekomputierten Daten und Engines
- Am bestehenden Repository geaendert: **zwei Zeilen** (Menuepunkt + Positionierungsregel)

### Im Browser verifiziert

- Alle 10 Seiten: keine Konsolenfehler, kein horizontaler Ueberlauf, Leer- und
  Fehlerzustaende funktionieren
- Vollstaendige User Journey aus Abschnitt 96 end-to-end
- AI-Flow aus Abschnitt 97 (Strategie → Feedback → neue Version)
- Mobile (390 px): kein Ueberlauf auf einer der Seiten. Primaere Bedienelemente
  (Karten, Schaltflaechen, Tabs, Listeneintraege) ≥ 40 px. Ticker-Links in
  Datentabellen liegen bei Textzeilenhoehe (~15 px) - konventionell fuer
  Tabellen, aber auf dem Telefon klein. Als bekannte Einschraenkung gefuehrt.

## Phase 2 — Produktionsaudit und Marktdaten

| Teil | Inhalt | Status |
|---|---|---|
| Audit | 0 CRITICAL, 2 HIGH, 6 MEDIUM, 4 LOW — beide HIGH und 5 MEDIUM behoben | ✓ |
| Providerschicht | Faehigkeiten, Symbolzuordnung, Transport, Qualitaet, Betriebsmodus | ✓ |
| Adapter | Twelve Data, serverseitig, Free Plan | ✓ |
| Pipeline | Abruf → Pruefung → JSON → GitHub Pages, als Workflow | ✓ |
| Schluesselsicherheit | 8 Tests ueber das Repository + Pruefung vor dem Commit | ✓ |
| Oberflaeche | Datenherkunft je Datenklasse, neue Seite `/quant/markt/` | ✓ |
| Pruefstand | `evaluate-provider.mjs` — dieselben Fragen an jeden Anbieter | ✓ |

**Noch nicht scharf geschaltet.** `quant/data/market/status.json` steht auf
`configured: false`; es sind keine echten Kursdaten committet. Dafuer fehlen
zwei Dinge: das Secret `TWELVE_DATA_API_KEY` und die Klaerung der drei
Veroeffentlichungsfragen aus `docs/VU_PROVIDER_LICENSE_CHECKLIST.md`.

## Phase 3 — Anbieterqualifikation und Bereinigungssemantik

| Teil | Inhalt | Status |
|---|---|---|
| MEDIUM-7 | Zentrale Bereinigungssemantik, Alt-Pipeline migriert ohne Zahlenaenderung | ✓ |
| Semantik | RAW / SPLIT_ADJUSTED / TOTAL_RETURN / UNKNOWN, von beiden Stacks gelesen | ✓ |
| Evidenzspezifikation | 3 Gates, 15 Anforderungen, 7 Belegstufen, 3 Rollen | ✓ |
| Gate-Tests | ausfuehrbar; MockProvider als Referenz, 6 Fehlerfaelle als Gegenprobe | ✓ |
| Pruefstand | `runProviderQualification()`, Belegstufe getrennt vom Befund | ✓ |
| Anbieterprofile | Sharadar, Intrinio, Twelve Data, EODHD, FMP, Polygon | ✓ |
| Mehrere Anbieter | Vorrangregeln, Qualitaetswert, Datenstandskennung | ✓ |

**Kein Urteil, und das ist das Ergebnis.** Kein Anbieter besteht alle drei
Gates. Kein einziger Befund ist zur Laufzeit geprueft: ein bezahlter Zugang war
ausgeschlossen, und die Primaerdokumentation der Anbieter war aus der
Bauumgebung nicht abrufbar (Egress-Proxy). Beides ist ueberall vermerkt, wo
eine Einstufung steht.

Naechster Schritt kostet nichts: Intrinios Developer Sandbox (Dow 30) schliesst
Gate A und C. Gate B nicht - die Dow 30 sind per Definition Ueberlebende.

## Phase 4B — Realtime Market Data und Extended Hours

Gemerged als PR #51, finaler main-Commit **`39bfaea`**.

Provider-neutrale Live-Chart-Architektur: Datenklassen-Leiter
(`REALTIME_STREAM → REALTIME_QUOTE → INTRADAY → EOD → UNAVAILABLE`),
Capability Negotiation mit sechs Zustaenden, Best-Available-Fallback,
deterministische Merge-Regeln gegen Repainting, Verbindungsautomat,
Verfallserkennung und ein Datenstatus, der „LIVE" nur unter sechs
gleichzeitig erfuellten Bedingungen vergibt.

Dazu vier Handelssitzungen (`PRE_MARKET`, `REGULAR`, `AFTER_HOURS`,
`CLOSED`) als zweite Achse - nicht als zweite Leiter.

**817 Pruefungen gruen** (568 JS + 249 Python). Vier Auditbefunde gefunden
und behoben, darunter zwei HIGH.

Der Merge aendert nichts am Verhalten der ausgelieferten Seiten: beide
Feature-Gates bleiben aus, der Lizenzstatus bleibt
`LEGAL_REVIEW_REQUIRED`, `REALTIME_READY` ist nicht gesetzt, und der
Live-Chart ist an keine Seite angebunden.

Echtzeit und erweiterte Handelszeiten stehen auf **UNKNOWN**, bis ein
Laufzeitnachweis mit dem tatsaechlichen Zugang vorliegt.

Berichte: `docs/VU_REALTIME_MARKET_DATA_ARCHITECTURE.md`,
`docs/VU_REALTIME_MARKET_DATA_VALIDATION.md`.
Integrationsstand fuers Preview: `docs/VU_REALTIME_PREVIEW_INTEGRATION.md`.

## In Progress

Universe- und Fundamental-Expansion: gebaut, gemessen, geprüft. Was fehlt,
sind **zwei Workflow-Läufe mit Zugang** — `universe-master.yml`
(`sync: true`) und `sec-fundamentals-universe.yml` (`backfill: true`). Sie
füllen Firmennamen, CIK und Fundamentalhistorie für das Produktuniversum.
Ohne sie bleibt die gemessene Coverage bei 5 von 7.004, und genau so steht
sie im Bericht.

## Known Limitations

- **Alle Daten sind synthetisch**, solange kein Anbieterzugang konfiguriert ist. Auch
  mit echten Kursen bleiben die Fundamentaldaten synthetisch: die Ergebnisse belegen die
  Funktionsweise der Engine, nicht die historische Tragfaehigkeit einer Strategie an
  realen Maerkten. `backtestEligibility()` gibt dafuer `realEvidence: false` zurueck.
- **Reale Unternehmen bekommen keinen Quant Score.** Das Referenzuniversum
  (`ref_*`, 15 Titel) erhaelt ausschliesslich Kursdaten. Ein Score aus Kursdaten allein
  waere ein Momentum-Signal mit falschem Namen.
- **Kein Anbieter ist als Evidenzquelle qualifiziert.** Solange kein Anbieter die
  drei Gates besteht, bleibt jeder Backtest eine Vorfuehrung der Rechenlogik.
  `describeSnapshot()` gibt dafuer `evidenceEligible: false` zurueck und nennt die
  fehlende Voraussetzung.
- **Die Kursreihen sind splitbereinigt, nicht total-return-bereinigt.** Damit sind
  Momentum und Volatilitaet zulaessig, Renditeaussagen nicht. Eine Stufe hoeher
  kommt man nur mit Dividendenereignissen, nicht mit einer Annahme.
- Analyst Revisions sind im Schema vorgesehen, aber als `available: false` markiert —
  ohne lizenzierte PIT-Konsensdaten wird der Faktor nicht mit erfundenen Daten befuellt.
- Deflated Sharpe Ratio und Probability of Backtest Overfitting sind nicht implementiert;
  der Trust Score vergibt fuer diesen Block null Punkte statt ihn zu ueberspringen.
- Ein Universum (`US_EQUITIES`), eine Waehrung, keine Makro-, News- oder Ownership-Daten.
- Kein Nutzerkonto: Strategien, Backtests und Watchlist liegen im `localStorage`.
- Ein 20-Jahres-Backtest mit monatlichem Rebalancing dauert rund 19 Sekunden. Der Web
  Worker haelt die Oberflaeche bedienbar, beschleunigt die Rechnung aber nicht.
- Regulatorische Pruefung (MiFID II, WpIG, WpHG, MAR, EU AI Act, Datenlizenzen) steht aus
  und liegt ausserhalb dieses Builds.

## Next Phase

Nach Nutzen sortiert, nicht nach Aufwand:

1. **Intrinio Developer Sandbox anfragen** (kostenlos) und Gate A + C gegen
   echte Dow-30-Daten laufen lassen. Liefert die ersten
   `RUNTIME_VERIFIED`-Befunde des Projekts und prueft nebenbei, ob der
   Pruefstand an echten Daten funktioniert.
2. **Sharadar-Lizenzfrage klaeren.** Professionelle Nutzer muessen ueber
   Nasdaq Data Link beziehen; eine oeffentliche Website ist mit hoher
   Wahrscheinlichkeit professionelle Nutzung. Ohne diese Antwort ist jede
   Kostenrechnung gegenstandslos.
3. **Primaerdokumentation direkt lesen**, sobald eine Umgebung ohne
   Egress-Beschraenkung verfuegbar ist. Hebt mehrere Befunde von
   `THIRD_PARTY_REPORTED` auf `DOCUMENTATION_VERIFIED` und koennte Gate B bei
   Sharadar schliessen.
4. **Erst dann** ein bezahlter Sharadar-Monat (Full History Bundle) fuer alle
   drei Gates. Die 5-Jahres-Variante reicht nicht: Gate A und B brauchen
   Restatement- und Delisting-Faelle im Zeitraum.
5. **Danach Kapitalmassnahmen als erste produktive Datenklasse** - nicht
   Fundamentaldaten. Ohne Dividendenereignisse bleiben die Kursreihen
   splitbereinigt, und ohne Total Return gibt es keine Renditeaussage.

**Weiterhin offen aus Phase 2:** die drei Veroeffentlichungsfragen der
Lizenzcheckliste, LOW-2 und LOW-3 (Barrierefreiheit der Tabellen).

Details in `docs/VU_PHASE3_IMPLEMENTATION_REPORT.md`.
