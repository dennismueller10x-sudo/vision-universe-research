# VISION UNIVERSE® QUANT & AI — PROJECT MASTER
## Zentrale technische und fachliche Source of Truth

**Stand: 7. September 2026 · Branch `main` (Commit `9878cdc`) · PR #43 gemerged**
**232/232 Tests grün (`node --test "quant/tests/*.test.mjs"`, eigenständig nachgerechnet)**

> Dieses Dokument ist für einen neuen Claude-Code-, Codex- oder ChatGPT-Chat geschrieben,
> der das Projekt fortsetzen soll, ohne die bisherige Chat-Historie zu kennen. Es ist
> eine Verdichtung, keine Kopie der 27 Fachdokumente unter `docs/`. Wo Doku und
> tatsächlicher Code/Git-Stand auseinanderlaufen, gilt **Code + Tests + Git vor Prosa** —
> jeder gefundene Widerspruch ist unten explizit vermerkt, nicht stillschweigend
> aufgelöst.
>
> Diese Datei ist reine Dokumentation. Bei ihrer Erstellung wurde kein produktiver Code,
> keine Architektur und keine Produktionsdaten verändert.

---

## Inhalt

1. [Was ist Vision Universe Quant & AI](#1-was-ist-vision-universe-quant--ai)
2. [Product Vision](#2-product-vision)
3. [Das Gesamtprodukt Vision Universe](#3-das-gesamtprodukt-vision-universe)
4. [Repository-Architektur](#4-repository-architektur)
5. [Phase 1 — Foundation](#5-phase-1--foundation)
6. [Phase 2 — Production Audit](#6-phase-2--production-audit)
7. [Phase 3 — Data Qualification](#7-phase-3--data-qualification)
8. [Release-Status: PR #43](#8-release-status-pr-43)
9. [Release-Audit-Funde und Guardrails](#9-release-audit-funde-und-guardrails)
10. [Quant Engine — VU Quant Score](#10-quant-engine--vu-quant-score)
11. [Factor DNA](#11-factor-dna)
12. [Score Momentum / Quant Radar](#12-score-momentum--quant-radar)
13. [Strategy Engine](#13-strategy-engine)
14. [Backtest Engine](#14-backtest-engine)
15. [Point-in-Time (PIT)](#15-point-in-time-pit)
16. [Backtest Trust Score](#16-backtest-trust-score)
17. [AI Architecture](#17-ai-architecture)
18. [VUQL](#18-vuql)
19. [Provider Abstraction](#19-provider-abstraction)
20. [Aktuelle Data Strategy](#20-aktuelle-data-strategy)
21. [SEC-Workstream](#21-sec-workstream)
22. [Tiingo-Workstream](#22-tiingo-workstream)
23. [Technical Intelligence & Elliott Wave](#23-technical-intelligence--elliott-wave)
24. [Data Licensing](#24-data-licensing)
25. [Mock / Hybrid / Live](#25-mock--hybrid--live)
26. [Security](#26-security)
27. [Storage Strategy](#27-storage-strategy)
28. [Cost Philosophy](#28-cost-philosophy)
29. [Was VU kauft vs. selbst berechnet](#29-was-vu-kauft-vs-selbst-berechnet)
30. [Known Limitations](#30-known-limitations)
31. [DO NOT BREAK THESE RULES](#31-do-not-break-these-rules)
32. [Aktueller Status je Modul](#32-aktueller-status-je-modul)
33. [Roadmap](#33-roadmap)
34. [Decision Gates](#34-decision-gates)
35. [How to Continue This Project](#35-how-to-continue-this-project)
36. [Changelog](#36-changelog)

---

## 1. Was ist Vision Universe Quant & AI

`/quant/` ist der Investment-Intelligence-Bereich von Vision Universe: eine
faktorbasierte Aktienanalyse (VU Quant Score), ein Screener mit eigener Abfragesprache
(VUQL), eine Strategy Engine mit versionierten Regelwerken, eine Point-in-Time-Backtest-
Engine mit methodischem Trust Score, eine Watchlist Intelligence und eine AI-Oberfläche,
die alle diese Bausteine als Werkzeuge aufruft, ohne selbst eine einzige Finanzkennzahl
zu erzeugen.

Er wurde in drei Phasen zwischen dem 6. und 7. September 2026 gebaut (siehe
[Changelog](#36-changelog)) und ist seit PR #43 Teil von `main`. **Alle Daten sind
synthetisch** — es handelt sich um einen funktionsfähigen, vollständig getesteten
Vorbau, nicht um ein produktives Analyseergebnis über reale Wertpapiere.

---

## 2. Product Vision

**VISION UNIVERSE® = INVESTMENT INTELLIGENCE LAYER.** Broker wie Trade Republic sind der
**Execution Layer**. Vision Universe bildet den Weg davor ab:

```
IDEA → DISCOVERY → RESEARCH → QUANT → SCREENING → STRATEGY → BACKTEST
     → UNDERSTANDING → MONITORING
```

**North Star: FROM INVESTMENT IDEA TO EVIDENCE.**

Vision Universe soll **nicht** werden: Broker, Autotrading-System, klassisches
Bloomberg-Terminal, reiner Aktien-Screener, reine Finanznews-Seite.

Ziel: **institutional depth, consumer UX.**

---

## 3. Das Gesamtprodukt Vision Universe

Bestehende Bereiche (zentrale Navigation in `assets/site-navigation.js`, 13 Einträge):

| Bereich | Pfad | Inhalt |
|---|---|---|
| News | `/news/` | Newsdesk, mehrere Quellen |
| **Quant** | `/quant/` | dieser Bereich |
| Dashboard | `/dashboard/` | Aktien-Dashboard: Research, Charting, Discover, Watchlist (V6.3, echte Twelve-Data-Kurse) |
| Guide | `/guide/` | — |
| ETF | `/etf/` | ETF-Dashboard |
| Hedgefonds | `/hedgefonds/` | 13F-Auswertung aus SEC EDGAR (eigenständig, siehe [§21](#21-sec-workstream)) |
| Analysten | `/analysten/` | Analystenbewertungen/Kursziele |
| Macro | `/macro/` | Macro-Intelligence-Dashboard, ~52 Indikatoren, sauberste Referenzarchitektur |
| Magazin | `/magazin/` | redaktionelle Ausgaben |
| Morning | `/morning/` | Morning Briefing |
| Reports | `/reports/xpeng/` | Einzelreports |
| Academy | `/academy/` | Experience-System (Lernstrecken), eigene Engines + Node-Tests |
| Budget | `/budget/` | Platzhalter |

Quant & AI ist **kein isolierter Bereich**, sondern langfristig die gemeinsame
Intelligence-Schicht: dieselbe Faktor-, Score- und Backtest-Logik soll perspektivisch
auch Dashboard, Hedgefonds-Bereich und Reports speisen. Aktuell (V1) ist die Trennung
noch strikt: **`quant/` liest keine Daten aus `dashboard/`, `macro/`, `hedgefonds/` oder
`academy/` und schreibt dort nichts hinein** — außer den zwei Zeilen Navigation.

---

## 4. Repository-Architektur

### 4.1 Ausgangslage

Das Repository ist eine **statische GitHub-Pages-Site** (`research.visionuniverse.de`,
`CNAME`): kein `package.json`, kein Bundler, keine Server-Runtime, Auslieferung direkt
vom Default-Branch. Alle 12 bestehenden Produktbereiche (Dashboard, Macro, Academy, …)
folgen demselben Muster: reine Berechnungslogik getrennt von UI, Daten als
präkomputiertes JSON, Tests mit `node --test`.

### 4.2 Die Leitentscheidung: Erweiterung statt Rewrite

Die im ursprünglichen Research vorgesehene Zielarchitektur (**Next.js, FastAPI,
PostgreSQL, Parquet, Redis**) wäre die Architektur für einen späteren produktiven
Multi-User-Betrieb mit echten Daten. Sie wurde **bewusst nicht** für diesen Build
gewählt:

- Das Repository hat weder Build-Pipeline noch Server-Runtime; ein Next.js/FastAPI-Umbau
  wäre ein Rewrite aller zwölf bestehenden, funktionierenden Produktbereiche gewesen.
- V1 läuft ausschließlich auf deterministisch erzeugbaren Mock-Daten — dafür ist weder
  eine Datenbank noch ein Python-Service nötig.
- Bestehende CI, bestehendes Design-System, bestehende Navigation sollten unverändert
  weiterlaufen.

**Stattdessen:** `/quant/` wurde als neuer, eigenständiger Produktbereich nach exakt dem
Muster von `macro/` und `academy/` gebaut. Die Schichten des Research-Modells wurden
**eins zu eins abgebildet, nur mit anderer Laufzeittechnologie**:

| Research-Schicht | Umsetzung hier |
|---|---|
| Provider Abstraction | `quant/engines/provider.js` |
| Financial Data Core | `quant/engines/schema.js` |
| Quant Engine | `factors.js`, `normalization.js`, `quant-score.js`, `radar.js` |
| Strategy Engine | `strategy.js` |
| Backtest Engine | `backtest.js`, `trust-score.js` |
| AI Research Layer | `ai-provider.js`, `ai-tools.js` |
| Product API (`/v1/...`) | `quant/api/client.js` — dieselben Contracts als Funktionsaufrufe |
| Product Layer | `quant/**/index.html` + `quant/ui/*` |

Die Grenze zwischen Product API und Engines ist so geschnitten, dass `api/client.js`
später gegen `fetch('/v1/...')` gegen einen echten HTTP-Service ausgetauscht werden
kann, **ohne dass eine Seite angefasst werden muss** — das ist der Migrationspfad zu
Next.js/FastAPI/PostgreSQL, wenn Multi-User-Betrieb mit echten Daten ansteht.

### 4.3 Schichtenmodell

```
quant/**/index.html + quant/ui/*        PRODUCT LAYER — nur Darstellung
            │
quant/api/client.js                     PRODUCT API — die v1-Contracts
            │
ai-provider.js, ai-tools.js             AI RESEARCH LAYER (Tool Registry = Sicherheitsgrenze)
            │
factors.js, quant-score.js, strategy.js DOMAIN ENGINES
query.js, vuql.js, radar.js
            │
backtest.js, trust-score.js             BACKTEST ENGINE
            │
schema.js                               FINANCIAL DATA CORE
            │
provider.js                             PROVIDER ABSTRACTION
            │
mock-provider.js                        Mock (V1) · später Twelve Data, Intrinio, EODHD
```

Jede Schicht kennt nur die direkt darunterliegende. Eine Seite ruft **nie** eine Engine
direkt auf, immer `quant/api/client.js`.

### 4.4 Verzeichnisse

```
quant/
  engines/       reine Logik, Browser + Node, UMD (globalThis statt window), ohne DOM
  methodology/   versionierte Konfiguration (Gewichte, Schwellen, Strategien) — 6 JSON-Dateien
  api/           Product-API-Schicht (v1-Contracts)
  ui/            Designsystem, Shell, gemeinsames SVG-Chartmodul, Backtest-Web-Worker
  data/          präkomputierte Artefakte — generiert, NICHT von Hand pflegen
  config/        market-universe.json, provider-profiles.json
  tests/         12 Testdateien, node:test
  <seite>/       index.html + app.js je Produktseite (10 Seiten)
providers/       Adapter + Lizenz-/PIT-Prüfpunkte je Anbieter (mock, twelve-data, intrinio, eodhd)
scripts/quant/   build-quant-data.mjs (Präkomputation), verify-quant-data.mjs (Konsistenzprüfung)
scripts/market/  Marktdatenabruf, Provider-Bewertung, Secrets-Prüfung
docs/            27 VU_*.md Fachdokumente (Detailtiefe zu jedem Thema unten)
```

### 4.5 Zwei Datenpfade — dieselbe Quelle

| Pfad | Wofür | Woher |
|---|---|---|
| präkomputiert | Home, Ranking, Screener, Radar, Stock Detail, Watchlist | `quant/data/**`, erzeugt von `build-quant-data.mjs` |
| live gerechnet | Backtests, aktuelles Modellportfolio | Mock-Dataset im Web Worker (`backtest-worker.js`) |

Beide leiten aus demselben deterministischen Generator und denselben Engines ab.
`verify-quant-data.mjs` prüft in der CI, dass sie nicht auseinanderdriften — **eine
stille Abweichung zwischen Übersicht und Backtest wäre der gefährlichste Datenfehler des
Systems.** Ein 20-Jahres-Backtest mit monatlichem Rebalancing über 511 Titel dauert ca.
19 Sekunden — deshalb der Web Worker.

### 4.6 Lokale Entwicklung

```bash
node scripts/quant/build-quant-data.mjs      # Mock-Daten erzeugen (~6 s)
node scripts/quant/verify-quant-data.mjs     # gegen Engines prüfen
node --test "quant/tests/*.test.mjs"         # Tests (~29 s, 232 grün)
python3 -m http.server 8765                  # Website lokal
```

Kein API-Key nötig. Kein `npm install` — kein `package.json` im Repository.

### 4.7 Bewusst nicht gebaut

Broker-Integration, Orderausführung, autonomes AI-Trading, native Apps, Realtime,
Optionen, Krypto, Intraday-Backtesting, Portfolio-Optimierer, historische
Analystenrevisionen ohne lizenzierte Daten.

---

## 5. Phase 1 — Foundation

Branch `claude/vision-universe-v1-build-uyp8qp`, gebaut 6.–7. September 2026, ~6.700
Zeilen in 23 Engine-Dateien.

**Financial Data Model** (`schema.js`): 26 kanonische Entitäten, Laufzeitvalidatoren,
bitemporaler Point-in-Time-Zugriff. **Field Catalog** (`catalog.js`): 52 Felder mit
Einheit, Richtung (`higherIsBetter`), Kategorie und VUQL-Token — ein Feld wird einmal
definiert und steht danach automatisch in Screener-UI, VUQL, Strategiefiltern und
AI-Tool-Beschreibung zur Verfügung.

**Mock Provider** (`mock-generator.js`, `mock-provider.js`): 511 synthetische
Securities (500 + 11 Edge-Case-Fixtures), deterministisch aus Seed
`vision-universe-quant-v1` über einen Mulberry32-PRNG — gleicher Seed erzeugt bitgleiche
Daten in Browser und Node. Zeitraum 2006-01-02 bis 2026-09-04, ~20.000 Corporate
Actions. Preismodell: `Kurs = Startkurs × Ertragsanker × exp(Rerating + OU-Abweichung +
Momentum-Rückkopplung)` — bewusst kein reiner Random Walk, weil Kurs sonst von der
Ertragslage entkoppelt und die Faktoren bedeutungslos würden (siehe §29 unten). Sieben
modellierte Krisenfenster; Benchmark ~12 % CAGR bei ~−54 % Max Drawdown.

**Quant Engine, VU Quant Score, Factor DNA, Quant Ranking, Quant Radar**: siehe
[§10–§12](#10-quant-engine--vu-quant-score).

**Screener + VUQL**: siehe [§18](#18-vuql).

**Strategy Engine + Strategy Lab**: siehe [§13](#13-strategy-engine).

**Backtest Engine + Trust Score + Current Strategy Holdings**: siehe
[§14](#14-backtest-engine) und [§16](#16-backtest-trust-score).

**AI Tool Layer + Mock AI**: siehe [§17](#17-ai-architecture).

**Watchlist Intelligence**: Deltas und Faktorbewegungen auf der Watchlist,
Intelligence Events (siehe [§12](#12-score-momentum--quant-radar)).

**11 Produktseiten** (10 aus V1 + `/quant/markt/` aus Phase 2): Quant Home, Ranking,
Screener, Radar, Stock Detail, Strategien, Strategy Lab, Backtests, Watchlist, Ask
Vision Universe, Marktdaten.

**Vier Entscheidungen, die das gesamte System tragen** (aus dem Implementation Report,
weiterhin gültig und Teil der [DO-NOT-BREAK-Regeln](#31-do-not-break-these-rules)):

1. **Ein kanonisches Datenmodell, kein Vendor-Modell.** Vendor-Felder existieren
   ausschließlich in Provider-Adaptern; ein Acceptance-Test scannt Product Layer und UI
   auf Vendor-Feldzugriffe.
2. **Point-in-Time ohne Ausweg.** `availableAt <= decisionTime` ist die einzige
   Zugriffsregel; kein Parameter schaltet sie ab.
3. **Eine Filterlogik, eine Strategy Engine.** Screener, VUQL-Editor, AI-Tool und
   Backtest erzeugen denselben typisierten AST und rufen dieselbe `Query.execute()` auf.
4. **Fehlende Daten sind fehlend.** Kein Ersatzperzentil, keine neutrale 50, keine 0 —
   stattdessen `INCOMPLETE` mit Begründung.

Am bestehenden Repository geändert: **zwei Zeilen** (Menüpunkt in
`assets/site-navigation.js`, Positionierungsregel in `assets/site-navigation.css`). Kein
bestehender Produktbereich wurde angefasst.

---

## 6. Phase 2 — Production Audit

Systematische Prüfung dessen, was unter echten Bedingungen bricht — nicht was fehlt,
sondern was falsch oder stillschweigend falsch ist. Grundlage: 134 Tests aus Phase 1,
danach 177 Tests.

**Ergebnis: 0 CRITICAL, 2 HIGH (beide behoben), 6 MEDIUM (5 behoben, 1 offen mit
Begründung), 4 LOW (1 behoben, 3 offen ohne Auswirkung auf Richtigkeit).**

### HIGH-1 — die wichtigste dauerhafte Qualitätsregel des Systems

**Ein Backtest ohne eine einzige gehaltene Position galt als gültiges Ergebnis.** Eine
Strategie mit nie erfüllbaren Filtern lief vollständig durch: null Titel je Rebalancing,
Kapital blieb in bar — Ergebnis CAGR 0,0 %, Trust Score **61** ("Eingeschränkt
belastbar"), plus die irreführende Aussage "Diese Unternehmen erfüllen aktuell die
Regeln der Strategie" über einer leeren Tabelle.

**Behoben** durch vier Maßnahmen, seither dauerhafte Regel (siehe auch [§16](#16-backtest-trust-score)):

1. `backtest.js` zählt `investedDays`, meldet `capabilities.everInvested`,
   `timeInvestedPct`, `emptyRebalances`, typisierte `warnings`.
2. Zwei harte Kappungen in `trust-score-v1.json`: `neverInvested`
   (`everInvested === false`) → **max. 5 Punkte**; `mostlyCash`
   (`timeInvestedPct < 50`) → **max. 40 Punkte**.
3. Der leere Fall wird explizit ausformuliert, keine leere Tabelle.
4. Warnungen erscheinen **vor** den Kennzahlen, kritische mit `role="alert"`.

Derselbe Backtest ergibt seitdem Trust Score **5** statt **61**.

> **Dauerhafte Qualitätsregel:** No-position / invalid result → drastisch reduzierter
> Trust Score → explizite Warnung → keine scheinpräzise Interpretation. Diese Regel darf
> in keinem künftigen Build aufgeweicht werden.

### HIGH-2 — Netzhänger-Resilienz

`shell.js` cachte auch abgelehnte Promises — ein einziger fehlgeschlagener Abruf machte
eine Seite dauerhaft unbrauchbar. Behoben: drei Versuche mit wachsendem Abstand,
Unterscheidung dauerhafter (4xx außer 408/429) von vorübergehenden Fehlern, kein
Konservieren von Fehlschlägen im Cache. Derselbe Fehler im Backtest-Worker (synchrones
XHR ohne Wiederholung) ebenfalls behoben.

### MEDIUM-Befunde (kurz)

| # | Fund | Status |
|---|---|---|
| 1 | Fehlgeschlagenes `localStorage.setItem` galt als Erfolg | behoben |
| 2 | Ungenutzte `innerHTML`-Hintertür in `el()` | entfernt |
| 3 | Adapter-Transport konnte echte Antworten nicht lesen (`res.body` statt geparstem JSON) | behoben |
| 4 | Veralteter Cache-Fallback löschte sich selbst beim Ablauf | behoben, `maxStaleMs` 4h |
| 5 | Capability-Matrix schrieb `null` (ungeprüft) fälschlich als `false` (nicht vorhanden) | behoben |
| 6 | Symbol-Mapping-Prüfung überging den häufigsten Fall (`"inferred"`) | behoben |
| **7** | **Alt-Pipeline (Dashboard) kennzeichnet ihre Bereinigungsstufe nicht** | **offen, siehe unten** |

**MEDIUM-7 — bis Phase 3 offen, dann behoben.** Das Dashboard rechnet auf splitbereinigten
(nicht dividendenbereinigten) Kursen und nannte das Ergebnis unspezifisch "Rendite". Kein
Rechenfehler — verifiziert an NVDA/AMZN-Splits, keine falschen Zahlen. Gelöst in Phase 3
(siehe [§7](#7-phase-3--data-qualification)).

### Sicherheitsbefunde: keine

Kein Schlüssel, Token oder Zugangsdatum im Repository gefunden. Acht dauerhafte Tests
(`quant/tests/secrets.test.mjs`) halten diesen Zustand:

| Test | Prüft |
|---|---|
| S1 | Kein schlüsselartiges Literal in ~400 committeten Dateien |
| S2 | Kein Browser-Code liest `process.env`/`import.meta.env` |
| S3 | Adapter ist Node-only, in keiner HTML-Seite eingebunden |
| S4 | Keine ausgelieferte JSON-Datei trägt URL oder Auth-Feld |
| S5 | Workflows reichen Credentials nur über `secrets.`/`github.token` |
| S6 | `.gitignore` deckt `.env`/`*.key`/`secrets.json`; `.env.example` leer |
| S7 | Keine echte Zugangsdatei im Arbeitsverzeichnis |
| S8 | Adapter reicht Schlüssel nicht durch, selbst wenn Anbieter ihn in Fehlermeldung spiegelt |

Zusätzlich: `scripts/market/assert-no-secrets.mjs` als letzte Prüfung vor jedem Commit.

**Neu in Phase 2 gebaut:** Fähigkeitsmatrix (`capabilities.js`), Symbolzuordnung
(`symbol-mapping.js`), Transportschicht mit Kontingentverwaltung (`market-client.js`),
Betriebsmodi mock/hybrid/live (`data-mode.js`), Twelve-Data-Adapter (serverseitig,
Node-only, `providers/twelve-data/adapter.js`), neue Seite `/quant/markt/`.

---

## 7. Phase 3 — Data Qualification

Branch `claude/vision-universe-v1-build-uyp8qp`, 7. September 2026, 22 Dateien, ~6.250
Zeilen, **232 Tests grün (177 aus Phase 2 + 55 neu)**.

### MEDIUM-7 endgültig behoben: eine gemeinsame Bereinigungssemantik

Beide Systemteile rechneten richtig und nannten zwei verschiedene Dinge gleich:

| | rechnet auf | nannte das Ergebnis |
|---|---|---|
| Quant-Bereich | total-return-bereinigt | „Rendite" |
| Dashboard | splitbereinigt | „Rendite" |

Gelöst über eine **gemeinsame Definition, nicht eine gemeinsame Bibliothek** (JS↔Python
wäre zu teuer gekoppelt):

```
quant/methodology/price-adjustment-v1.json    ← die Wahrheit
   ├── quant/engines/price-semantics.js        liest sie (JS)
   └── scripts/dashboard/price_semantics.py    liest dieselbe Datei (Python)
```

Vier Stufen, aufsteigend geordnet: **`UNKNOWN` (−1) < `RAW` (0) < `SPLIT_ADJUSTED` (1) <
`TOTAL_RETURN` (2)** — `UNKNOWN` liegt bewusst *unter* `RAW`: bei `RAW` weiß man
wenigstens, was fehlt. Je Kennzahl eine Mindeststufe: `RAW` genügt für Ordergröße/Volumen,
`SPLIT_ADJUSTED` für Momentum/Volatilität/Drawdown/Kursrendite, **`TOTAL_RETURN` ist
zwingend für `total_return`, `cagr` und jede Backtest-Evidenz.** Das Wort „Rendite" ohne
Zusatz ist ausschließlich für `TOTAL_RETURN` zulässig.

Die Migration änderte **keine einzige Zahl** — geprüft an NVDA (2021 4:1, 2024 10:1) und
AMZN (2022 20:1). Nachgelagerte Skripte verweigern seither die Berechnung, wenn die
Stufe fehlt.

### Die drei Gates als ausführbarer Code (`gate-tests.js`)

| Gate | Prüft | Bestehensbedingung |
|---|---|---|
| **A — Restatement** | Werden Original- und korrigierte Werte unterscheidbar geführt? | Wert zu zwei `asOf`-Zeitpunkten unterschiedlich UND der frühere trägt `restatementStatus: "original"` |
| **B — Delisting** | Bleiben delistete Titel mit Fundamentaldaten im historischen Universum? | Titel im historischen, nicht im aktuellen Universum, UND besitzt Fundamentaldatensätze (fängt "Kurse ja, Fundamentaldaten nein" ab) |
| **C — Future Data Leak / Verfügbarkeitszeitpunkt** | Trägt jede Tatsache `availableAt`/`filedAt`/`publishedAt`, und ist sie nie `> asOf`? | Kein fehlender Zeitstempel, kein Zeitstempel in der Zukunft des Abfragezeitpunkts, UND mindestens ein Zeitstempel liegt nach `periodEnd` (fängt "periodEnd als availableAt ausgegeben" ab) |

Der MockProvider besteht alle drei Gates. Sechs absichtlich fehlerhafte Adapter fallen
mit benanntem Grund durch (Gegenprobe).

### Der Qualifikationsprüfstand (`provider-qualification.js`)

Trennt **Befund** (`value`) von **Belegstufe** (`level`): `RUNTIME_VERIFIED` >
`DOCUMENTATION_VERIFIED` > `THIRD_PARTY_REPORTED` > `UNKNOWN`. Ein Gate gilt nur als
`PASSED`, wenn alle Anforderungen `true` sind **und** die Belegstufe mindestens
`DOCUMENTATION_VERIFIED` erreicht — sonst `UNKNOWN`, nie stillschweigend `false`.
Widerlegte Befunde werden `FAILED`, nicht `UNKNOWN`. Diese Schwelle war die wichtigste
Einzelentscheidung: ohne sie wären EODHD, FMP und Polygon auf Basis je eines
Blogartikels als qualifiziert durchgegangen.

### Ergebnis der Qualifikation (Stand 7. September 2026)

| Anbieter | Beste Rolle | Gate C (PIT) | Gate B (Delisted) | Gate A (Restatements) | Lizenz | Qualifikation | Laufzeit |
|---|---|---|---|---|---|---|---|
| Sharadar | Research | + | ? | ? | offen | `PARTIALLY_QUALIFIED` | 0/15 |
| Intrinio | Research | ? | ? | ? | offen | `PARTIALLY_QUALIFIED` | 0/15 |
| Twelve Data | Marktdaten | **−** | **−** | **−** | offen | `PARTIALLY_QUALIFIED` | 0/15 |
| EODHD | — | ? | +* | ? | offen | `UNKNOWN` | 0/15 |
| FMP | — | ? | ? | ? | offen | `UNKNOWN` | 0/15 |
| Polygon | — | ? | ? | ? | offen | `UNKNOWN` | 0/15 |

`*` EODHD führt delistete Fundamentaldaten nur ab 2018 — ein dokumentierter,
wahrscheinlicher Gate-B-Fehlerfall.

**Kein Anbieter besteht alle drei Gates. Kein einziger Befund ist `RUNTIME_VERIFIED`** —
gegen keinen der fünf externen Anbieter wurde in dieser Phase auch nur eine Anfrage
gestellt (Egress-Proxy blockierte `sharadar.com`, `data.nasdaq.com`,
`docs.intrinio.com`). Twelve Data ist der einzige mit **widerlegten** statt unbekannten
Befunden für die Evidenz-Rolle — ein Fortschritt gegenüber Unwissen, kein Mangel; die
Rolle, die er im System hat (Marktdaten für ein kleines Referenzuniversum), erfüllt er
weiterhin (`MARKET_DATA_PROVIDER: QUALIFIED`).

**Alle Lizenzfragen sind bei allen sechs Anbietern offen** (`LEGAL_REVIEW_REQUIRED`).

### Mehrere Anbieter nebeneinander (`data-precedence.js`)

Vorrangregeln, deren erstes Kriterium **nicht** die Anbietergüte ist, sondern die
Eignung für den Zweck — für eine historische Abfrage schlägt eine zeitpunktgenaue Quelle
jede aktuellere. Ein einzelner Kandidat wird nicht automatisch durchgewinkt. Dazu
`DataQualityScore` (ausdrücklich `internalOnly` — eine Zahl wie „Datenqualität 72" wirkt
präziser, als sie ist) und `dataSnapshotId` mit kalendarischer Prüfung.

### Empfohlener nächster Schritt (kostet nichts)

**Intrinio Developer Sandbox** (Dow 30) anfragen und Gate A + C gegen echte Daten laufen
lassen — schließt zwei von drei Gates kostenlos. **Gate B nicht**: die Dow 30 sind per
Definition Überlebende. Details und Kostenmodell: [§21](#21-sec-workstream),
[§28](#28-cost-philosophy).

---

## 8. Release-Status: PR #43

| Feld | Wert |
|---|---|
| Titel | „Vision Universe® Quant & AI — V1 Preview" |
| Quell-Branch | `claude/vision-universe-v1-build-uyp8qp` |
| Ziel-Branch | `main` |
| **Status** | **gemerged** (7. September 2026, 10:59 UTC, durch `dennismueller10x-sudo`) |
| Merge-Commit | `0499868` |
| Umfang | 152 geänderte Dateien, +29.873 / −99 Zeilen, 17 Commits |
| Teststatus zum Merge-Zeitpunkt | 232/232 grün |
| Enthält | Phase 1, 2, 3 |
| **Enthält ausdrücklich nicht** | Phase 4 / SEC Financial Data Core (siehe [§21](#21-sec-workstream)) |

Nach dem Merge liefen zwei weitere Commits auf `main` (`410df85` — Rücknahme einer
unbeabsichtigten Dashboard-Änderung vor dem Merge, dann reguläre
`chore: update dashboard news`-Läufe). Der aktuelle `main`-Stand (`9878cdc`) enthält
den vollständigen Quant-&-AI-Bereich; dieses Dokument wurde gegen genau diesen Stand
verifiziert (`git status` sauber, `origin/main` == lokaler Branch, 0 Commits Differenz).

**Änderungen an bestehenden Bereichen laut PR**, bewusst minimal:

| Datei | Änderung |
|---|---|
| `assets/site-navigation.js`/`.css` | je eine Zeile (Menüpunkt „Quant", Positionierung) |
| `dashboard/data/market_data.json` | Bereinigungsstufe ergänzt, keine Kurszahl geändert |
| `dashboard/data/backtest_results.json` | `return_semantics` ergänzt |
| `dashboard/data/technical_scores.json` | `return_semantics` ergänzt; 36 Werte um 6,5e-16 abweichend (Neuberechnung auf anderer Plattform, kein Logikunterschied) |
| `scripts/dashboard/*.py` | Bereinigungsstufe wird deklariert und geprüft; Berechnung verweigert, wenn sie fehlt |

Unverändert: ETF, Macro, Academy, Magazin, Reports, News, Morning, Hedgefonds,
Analysten, Budget, Guide, Content.

---

## 9. Release-Audit-Funde und Guardrails

Zwei Funde aus dem Freigabe-Audit vor dem Merge sind als **dauerhafte Engineering
Guardrails** zu behandeln, nicht als erledigte Einzelfälle:

### 1. `technical_scenarios.json` — beinahe unbeabsichtigt veröffentlichte Kursziele

Ein Verifikationslauf hätte **13 Szenarien mit Einstiegszonen, Invalidierungsmarken und
Kurszielen** in Produktion veröffentlicht — ein Nebenprodukt der eigenen
Verifikationsläufe, nicht Teil des beabsichtigten Release. `main` zeigt diese Datei
bewusst noch nicht. Dies wurde vor dem Merge erkannt und **zurückgenommen** (Commit
`410df85`).

> **Guardrail:** Ein Verifikations- oder Testlauf darf niemals Artefakte erzeugen, die
> versehentlich mitcommittet werden und in Produktion landen. Vor jedem Merge: `git
> diff` gegen den Zielbranch genau prüfen, nicht nur die eigenen beabsichtigten Dateien.

### 2. Tests dürfen Produktionsdatendateien nicht verändern

Verification-Läufe müssen auf temporären Kopien laufen, niemals auf den committeten
Produktionsdaten selbst.

> **Guardrail:** CI und lokale Verifikation laufen gegen Kopien oder generieren in ein
> Verzeichnis, das nicht committet wird, außer es ist der ausdrückliche Zweck des Laufs
> (z. B. `build-quant-data.mjs`, dessen Output bewusst committet wird). Ein Prüflauf, der
> „nur prüfen" soll, darf keine Datei verändern.

Diese beiden Regeln sind Teil von [§31 DO NOT BREAK](#31-do-not-break-these-rules).

---

## 10. Quant Engine — VU Quant Score

Konfiguration: `quant/methodology/quant-v1.json` (Version `quant-v1.0.0`, `effectiveFrom:
2026-09-06`). Implementierung: `factors.js`, `normalization.js`, `quant-score.js`.
**Diese Gewichte stammen direkt aus der Methodikdatei — Code ist Wahrheit, nicht
Erinnerung.**

### Was der Score ist — und was nicht

„Quality 94" heißt: besser als 94 % der Vergleichsgruppe. Es heißt **nicht**: 94 %
Wahrscheinlichkeit auf steigende Kurse.

### Pipeline

```
Rohkennzahl → Validierung (nicht endliche Werte → null, nicht 0)
   → Winsorization (2./98. Perzentil)
   → Peer-Normalisierung (Industry → Sector → Universe, min. Peer-Gruppe 12)
   → Perzentil je Komponente
   → Faktorscore (gewichteter Mittelwert der Komponenten)
   → Composite (gewichteter Mittelwert der Faktoren)
   → Universums-Perzentil
   → VU Quant Score 0–100
```

Der letzte Perzentilschritt ist notwendig: ein reiner gewichteter Mittelwert aus fünf
Perzentilen zieht sich durch den zentralen Grenzwertsatz zur Mitte zusammen — der beste
Titel läge bei ~78 statt 99. **Beide Werte werden ausgewiesen**: `compositeScore`
(Summe der Faktorbeiträge) und `score` (Perzentilrang).

### Faktorgewichte V1 (aus `quant-v1.json`)

| Faktor | Gewicht | Forschungsbasis |
|---|---:|---|
| Quality | 30 % | Novy-Marx (Gross Profitability), Asness/Frazzini/Pedersen (QMJ) |
| Momentum | 30 % | Jegadeesh/Titman, George/Hwang (52W-Hoch) |
| Growth | 20 % | Stock-Selection-Komponente, keine eigenständige akademische Faktorprämie |
| Value | 15 % | Fama/French |
| Risk | 5 % | Frazzini/Pedersen (Betting Against Beta) |
| *Revisions* | *0 % (vorgesehen: 15 %)* | *`available: false`, siehe unten* |

**Wichtige Entscheidung — Revisions-Gewicht:** Das Research sieht zusätzlich 15 %
Analyst Revisions vor. Ohne lizenzierte historische PIT-Konsensdaten wird dieses Gewicht
**nicht mit erfundenen Daten gefüllt**, sondern auf Quality, Momentum und Growth
verteilt. Sobald belastbare PIT-Estimates vorliegen, entsteht `quant-v2` mit eigener
Methodikversion — **keine stille Änderung**.

### Komponenten je Faktor

| Faktor | Komponenten (Gewicht) |
|---|---|
| Quality | ROIC 25 · Gross Profitability 20 · FCF-Marge 20 · Operative Marge 15 · Bilanzqualität 10 · Verschuldung 10 |
| Momentum | 12-1-Monats-Momentum 25 · 6M 20 · Relative Stärke 15 · Abstand 52W-Hoch 12 · 3M 10 · Kurs/200DMA 10 · Kurs/50DMA 8 |
| Value | FCF-Rendite 30 · Earnings Yield 25 · EV/EBITDA 20 · Kurs/FCF 15 · EV/Sales 10 |
| Growth | Umsatzwachstum 35 · EPS-Wachstum 25 · FCF-Wachstum 25 · Margenausweitung 15 |
| Risk | Volatilität 35 · Downside-Volatilität 25 · Max. Drawdown 25 · Beta 15 (höherer Score = geringeres Risiko) |
| Revisions | — (Schema vorhanden, `available: false`, keine Komponenten befüllt) |

### Normalisierung, Coverage, Bänder

- **Winsorization:** 2./98. Perzentil.
- **Peer-Gewichte:** 70 % Peer, 30 % Universum; Fallback-Kette Industry → Sector →
  Universe; Mindest-Peer-Gruppengröße 12.
- **Coverage:** mind. 50 % der Komponenten je Faktor, mind. 60 % Gesamtabdeckung, max.
  20 % Renormalisierung des Faktorgewichts. Konfidenzbänder: ≥90 % `high`, ≥75 %
  `medium`, ≥60 % `low`, darunter `insufficient`.
- **Rating-Bänder:** ≥90 „Top 10 %" · ≥75 „Überdurchschnittlich" · ≥45 „Durchschnittlich"
  · ≥25 „Unterdurchschnittlich" · sonst „Unteres Quartil". Hysterese: mind. 1,5 Punkte
  Bewegung für einen Bandwechsel (verhindert 89,9→90,1 als falsches Signal).

Ein Titel ohne ausreichende Faktorabdeckung bekommt `INCOMPLETE` statt einer Zahl — auch
im Hybridmodus, ohne Sonderregel.

---

## 11. Factor DNA

UI-Konzept auf der Stock-Detail-Seite: Zerlegung des Composite Score in die fünf
Faktoren (Quality, Momentum, Value, Growth, Risk), je mit:

- **Percentile** (Universums- und Peer-Rang)
- **Contributions** (gewichteter Beitrag zum Composite, aufsummierbar)
- **Raw Metrics** (die zugrundeliegenden Rohkennzahlen vor Normalisierung)
- **Methodology** (Version, Gewichte, Stand)
- **Data Coverage** (Anteil verfügbarer Komponenten, Konfidenzband)

AI-Tool `explainQuantScore()` liefert dieselbe Zerlegung als strukturierte Daten für die
KI-Erklärung (siehe [§17](#17-ai-architecture)) — **dieselbe Quelle**, nicht eine
zweite Berechnung.

---

## 12. Score Momentum / Quant Radar

Implementiert in `radar.js`, Parameter in `quant-v1.json` unter `scoreMomentum` und
`radar`:

- **Velocity:** `scoreVelocity30d`, `scoreVelocity60d` (Veränderung über 30/60 Tage)
- **Acceleration:** `scoreAcceleration` über ein 30-Tage-Fenster
- **factorVelocity:** dieselbe Bewegung je Einzelfaktor
- Snapshot alle 7 Tage, Historienfenster 365 Tage

**Radar-Schwellen** (aus `quant-v1.json`): Quant Upgrade ab Δ≥6, Downgrade ab Δ≤−6,
Momentum-/Quality-Leader ab Score ≥90, Nähe zum 52W-Hoch bei ≤3 % Abstand und
Quant-Score ≥70, Emerging Compounder ab Faktor-Δ≥4, Factor Breakout ab 2 Faktoren mit
Δ≥8.

**Event-Typen:** Quant Upgrade, Quant Downgrade, Momentum Acceleration, Quality
Deterioration, Factor Breakout, Near-52W-High, Emerging Compounder (sieben
Radar-Module laut Implementation Report). Watchlist Intelligence nutzt dieselbe Engine
für Deltas auf den beobachteten Titeln.

---

## 13. Strategy Engine

Implementiert in `strategy.js`, Constraints/Defaults in `methodology/backtest-v1.json`,
vordefinierte Strategien in `methodology/strategies-v1.json`.

### Schema

`StrategyDefinition = { schemaVersion, universe, filters[], ranking: { factors: [{factor,
weight}] }, portfolio, rebalance, execution }`.

- Rankbare Faktoren: Quality, Momentum, Value, Growth, Risk — Gewichte müssen auf 1,0
  (±0,005) summieren, keine Duplikate; **`revisions` wird explizit abgelehnt**, solange
  PIT-Estimates nicht lizenziert sind.
- Portfolio-Constraints: 5–200 Positionen; `positions × maxPositionWeight ≥ 1` (muss
  vollständig investierbar sein); `maxSectorWeight ≥ maxPositionWeight`; Gewichtung
  `equal` / `score` / `volatility`.
- Rebalancing: nur `monthly` oder `quarterly` (Default `quarterly`).
- Execution: Timing `next_open`/`next_close`; Transaktionskosten/Slippage je max. 200
  bps; eine Warnung (kein Fehler), wenn beide 0 sind.
- Unbekannte Top-Level-Felder werden abgelehnt.

### StrategyVersion, Lineage, Hash

- `createStrategy()` erzeugt V1 mit `parentVersion: null`.
- `addVersion()` **mutiert nie** eine vorherige Version, verlangt eine nicht-leere
  `changeReason`, lehnt eine zu ihrem Elternteil identische Version ab (Vergleich über
  `definitionHash`, stabil gegenüber Feldreihenfolge).
- `lineage()` baut einen Baum (nicht nur eine Kette) über `parentVersion`.
- `diff()` liefert exakte feldweise Unterschiede zwischen zwei Definitionen.

### Vordefinierte Strategien (aus `strategies-v1.json`)

| Strategie | Universe | Kernfilter | Ranking-Gewichte | Gewichtung | Positionen | Max. Pos./Sektor | Rebalancing |
|---|---|---|---|---|---|---|---|
| VU Quality Compounders | US_EQUITIES | MktCap≥1.000, AvgDollarVol≥5, FCF>0, ROIC≥10 | Quality 70 · Growth 30 | equal | 30 | 6 % / 30 % | quarterly |
| VU Momentum Leaders | US_EQUITIES | MktCap≥2.000, AvgDollarVol≥10, Kurs>200DMA | Momentum 100 | equal | 25 | 6 % / 35 % | monthly |
| VU Quality Momentum | US_EQUITIES | MktCap≥1.000, AvgDollarVol≥5, FCF>0 | Quality 50 · Momentum 50 | equal | 25 | 6 % / 30 % | monthly |
| VU GARP | US_EQUITIES | MktCap≥1.000, AvgDollarVol≥5, RevGrowth≥8 %, FCF>0, EV/EBITDA≤25 | Growth 40 · Quality 35 · Value 25 | equal | 30 | 6 % / 30 % | quarterly |
| VU Future Leaders | US_EQUITIES | MktCap≥500, AvgDollarVol≥5, RevGrowth≥15 %, FCF>0 | Growth 45 · Momentum 35 · Quality 20 | equal | 20 | 8 % / 40 % | monthly |

Alle fünf: `execution.timing: next_open`, Transaktionskosten 5 bps; Slippage 5 bps
(Momentum Leaders und Future Leaders: 8 bps).

### Warum eine gemeinsame Filterlogik

Der manuelle Strategy Builder, die AI und der Screener erzeugen **dasselbe**
`StrategyDefinition`- bzw. Query-AST-Objekt und benutzen denselben Validator
(`strategy.js` baut zur Validierung eine Probe-Query und ruft `Query.validate()` auf —
denselben Pfad wie Screener-UI, VUQL und AI-Tool). Zwei Implementierungen wären der
sicherste Weg, Screener-Ergebnis und Backtest-Universum auseinanderlaufen zu lassen.

---

## 14. Backtest Engine

Implementiert in `backtest.js`. **Nur tatsächlich vorhandene Merkmale sind hier als
implementiert gekennzeichnet.**

- **Long-only, Tagesdaten.** Gewichte sind stets nicht-negativ; kein Short-, Leverage-
  oder Derivate-Pfad.
- **Rebalancing:** monatlich oder quartalsweise, am letzten Handelstag der Periode; ein
  Termin außerhalb des Testfensters wird ausgelassen, nicht verschoben.
- **Ausführungszeitpunkt:** Signal am Schluss von T, Ausführung frühestens T+1. Zwei
  Preismodi: `next_close` (Schlusskurs T+1) oder `next_open` (Default) — Letzterer ist
  eine **deterministische Interpolation** (`prev + (close_T+1 − prev) × 0,35`), **kein
  echter Eröffnungskurs**, ausdrücklich als Mock-Daten-Vereinfachung dokumentiert.
- **Transaktionskosten + Slippage:** eine gemeinsame Rate (`(transactionCostsBps +
  slippageBps) / 10000`) auf den Bruttowert jeder Order sowie auf Delisting-Glattstellung.
  Kein separates Market-Impact-Modell.
- **Corporate Actions:** implizit über eine bereits total-return-adjustierte Kursreihe
  (`adjustedClose`), nicht über explizite Split-/Dividenden-Einzelbuchungen in dieser
  Datei.
- **Delisting:** eine Position, deren Kursreihe endet, wird zum letzten verfügbaren Kurs
  zwangsglattgestellt; Erlös bleibt in bar — kein Survivorship-Verlust im historischen
  Universum.
- **Current Strategy Holdings:** `currentHoldings()` wendet die Strategie auf den
  aktuellen Datenstand an — ausdrücklich als „erfüllt heute die Regeln", nicht als
  Anlageempfehlung; expliziter Leerzustand, wenn kein Titel qualifiziert.
- **Reproduzierbarkeit:** `reproductionHash` hasht ausschließlich die Eingaben
  (Strategie-Hash, `dataSnapshotId`, Engine-/Methodikversionen, Execution-Annahmen,
  Zeitraum, Rebalancing) — bewusst **nicht** aus dem Ergebnis abgeleitet, also ein
  Reproduktionsschlüssel, kein Ergebnis-Checksum.

### Implementierte Metriken

CAGR, Total Return, Volatilität (annualisiert), Max Drawdown, Sharpe, Sortino, Calmar,
bestes/schlechtestes Jahr, Recovery-Tage, jährliche Renditen, Drawdown-Serie,
Benchmark-Vergleich (Total Return/CAGR/Max Drawdown/Jahresrenditen), Excess Return
(CAGR ggü. Benchmark), Turnover (einseitig, annualisiert), durchschnittliche
Positionszahl, Rebalance-/Trade-Anzahl, Gesamtkosten, Hit Rate, `investedDays`,
`timeInvestedPct`.

**Nicht implementiert:** Deflated Sharpe Ratio, Probability of Backtest Overfitting
(PBO) — siehe [§16](#16-backtest-trust-score).

Typisierte Warnungen im Ergebnisobjekt: `never_invested`, `mostly_cash`,
`empty_rebalances`, `few_rebalances` — sie speisen direkt den Trust Score.

---

## 15. Point-in-Time (PIT)

**Dies ist der kritischste Abschnitt des gesamten Systems.**

Point-in-Time bedeutet: Ein Backtest darf ausschließlich Informationen verwenden, die am
damaligen Entscheidungszeitpunkt tatsächlich bekannt waren.

**Grundregel: `availableAt <= decisionTime`.**

Dies ist die **einzige** Zugriffsregel auf Fundamentaldaten im gesamten System. Es gibt
**keinen Parameter, der sie abschaltet** — der einzige Effekt wäre Look-Ahead Bias.
Faktoren, Scores und Filter laufen im Backtest über **dieselben Funktionen** wie die
heutige Anzeige; ein zweiter Pfad könnte versehentlich mehr sehen.

### Was konkret geprüft wird

- **Filing Dates:** Jede Fundamentaltatsache trägt `availableAt`/`filedAt`/`publishedAt`
  — fehlt das, ist die Tatsache für einen Backtest nicht nutzbar (Gate C).
- **Fundamental Publication Lag:** `periodEnd` (Ende der Berichtsperiode) und
  `availableAt` (tatsächliche Veröffentlichung) sind getrennte Felder — ein Anbieter, der
  `periodEnd` als `availableAt` ausgibt, fällt durch Gate C.
- **Restatements:** Originale und rückwirkend korrigierte Werte müssen unterscheidbar
  geführt werden (`restatementStatus: "original"` vs. korrigiert) — ein Backtest vor der
  Korrektur darf ausschließlich die Originalzahlen sehen (Gate A).
- **Amendments:** dieselbe bitemporale Behandlung wie Restatements.
- **Future Data Leakage:** kein Zeitstempel darf in der Zukunft des Abfragezeitpunkts
  liegen (Gate C, siehe [§7](#7-phase-3--data-qualification)).

### Mock-Fixtures, die genau das prüfen

`MOCK_RESTATEMENT` (VUF009, meldet 2017 zu hohe Zahlen, korrigiert 2018),
`MOCK_FUTURE_DATA_LEAK` (VUF010, trägt einen Datensatz mit `availableAt` in der Zukunft
— darf heute nirgendwo auftauchen), `MOCK_DELISTED` (VUF008, delistet 2019, bleibt im
historischen Universum).

**Diese Methodik darf in zukünftigen Builds nicht aufgeweicht werden** — sie ist Teil
der [DO-NOT-BREAK-Regeln](#31-do-not-break-these-rules) (Regel 3).

---

## 16. Backtest Trust Score

Konfiguration: `methodology/trust-score-v1.json` (Version `trust-score-v1.0.0`),
Implementierung `trust-score.js`.

> **Zweck:** Der Trust Score bewertet die **methodische Qualität** eines Backtests,
> nicht seine Rendite. Ein optisch starkes Ergebnis mit methodischen Mängeln darf keinen
> hohen Trust Score erhalten.

### Blöcke (0–100)

| Block | Punkte | Prüfungen |
|---|---:|---|
| Data Integrity | 35 | PIT-Fundamentaldaten (12) · Delistete Titel (7) · Original vs. korrigiert (6) · Corporate Actions (5) · Historische Universumszugehörigkeit (5) |
| Execution Realism | 20 | Transaktionskosten (7) · Slippage (5) · Liquiditätsgrenzen (5) · Ausführung nach Signalzeitpunkt (3) |
| Statistical Validation | 30 | Out-of-Sample/Walk-Forward (10) · Parameter-Sensitivität (7) · Multiple Testing/Deflated Sharpe/PBO (7) · Teilperioden-/Cross-Market-Validierung (6) |
| Sample Quality | 15 | Historie über mehrere Zyklen (6) · Ausreichende Beobachtungen (4) · Breite/Turnover-Qualität (5) |

### Harte Obergrenzen (Hard Caps)

| ID | Bedingung | Max. Score |
|---|---|---:|
| `noPointInTime` | keine PIT-Fundamentaldaten | 60 |
| `noDelisted` | keine delisteten Titel im Universum | 70 |
| `optimizedNoOos` | optimierte Strategie ohne Out-of-Sample | 75 |
| `neverInvested` | nie eine Position gehalten | **5** |
| `mostlyCash` | `timeInvestedPct < 50` | **40** |

**Wichtig:** Die letzten beiden Caps (`neverInvested`, `mostlyCash`) stammen aus dem
HIGH-1-Befund in Phase 2 ([§6](#6-phase-2--production-audit)) und sind im Code
first-class Hard Caps mit eigener `buildLimitations()`-Meldung — **das Prosadokument
`docs/VU_BACKTEST_TRUST_SCORE.md` listet in seiner Tabelle nur die ersten drei; dies ist
eine bekannte Doku-Lücke, kein Code-Fehler.** Wer diese Datei weiterpflegt, sollte die
Tabelle ergänzen.

### Bekannte Einschränkungen, weiterhin aktuell

- **Deflated Sharpe Ratio und PBO sind nicht implementiert** — der Block „Statistical
  Validation" vergibt für diese Prüfung **null Punkte statt sie zu überspringen**. Der
  Trust Score verschleiert damit keine Lücke, sondern bestraft sie sichtbar.
- Rating-Bänder: ≥85 „Hohe methodische Güte" · ≥70 „Solide, mit benannten
  Einschränkungen" · ≥50 „Eingeschränkt belastbar" · sonst „Nicht als Evidenz geeignet".

**Der Trust Score darf Datenlücken niemals verschleiern** — das ist der Leitsatz, der
die gesamte Konstruktion (Hard Caps statt Punktabzug allein, explizite Null-Punkte statt
Auslassung) begründet.

---

## 17. AI Architecture

> **AI ist nicht die Wahrheitsschicht.**
> Wahrheitsschicht: Financial Data Core + Quant Engine + Strategy Engine + Backtest
> Engine. AI ist Interpretation, Orchestrierung und Erklärung — sie berechnet keine
> einzige Kennzahl selbst.

### MockAIProvider (`ai-provider.js`)

Ist **explizit kein LLM** und behauptet das nicht zu sein (`healthCheck()` sagt es
wörtlich) — ein deterministischer, regelbasierter Parser ohne Netzwerkzugriff, ohne
API-Key:

```
Natürliche Sprache → detectIntent() (Regex/Keywords, DE+EN)
   → extractEntities() (Sektoren, Faktoren, Ticker, Zahlen inkl. ausgeschriebener
     deutscher Zahlwörter, Booleans)
   → buildQuery()/buildStrategy()
   → Schema-Validierung (Query bzw. Strategy)
   → planTools()
```

**10 Intents** (`INTENTS`): screen, strategy, backtest, explain, compare, rank,
watchlist, methodology, **forecast**, unknown. Ein zukünftiges reales LLM (Interface
`AI_PROVIDER_METHODS` bereits vorbereitet für `OpenAIProvider`/`ClaudeProvider`) würde
denselben Vertrag erfüllen müssen.

**Die "AI ist nicht die Wahrheitsschicht"-Regel ist im Code erzwungen, nicht nur
dokumentiert:**

- `explain()` komponiert Text **ausschließlich** aus `toolResults`, die `ok && data`
  sind; ohne Daten: `dataUnavailable: true` und eine feste Meldung, dass keine berechnete
  Quelle vorliegt — **nie eine Schätzung**.
- Fragen nach Kurszielen/Prognosen werden über `FORECAST_PATTERNS` erkannt und mit einer
  festen Ablehnung beantwortet, statt stillschweigend in den Screener-Fallback zu
  rutschen.
- `reviseStrategy()` kann nicht rückwärts nach besser aussehenden Parametern suchen —
  nur benannte, begründete Regeländerungen.

### Tool Registry (`ai-tools.js`) — 15 Werkzeuge

| Werkzeug | Kategorie | Zweck |
|---|---|---|
| `screenStocks` | discovery | strukturierte Abfrage ausführen (validierter Query-AST) |
| `getStockSnapshot` | discovery | Kennzahlen/Scores für einen Ticker |
| `compareStocks` | discovery | bis zu 8 Ticker vergleichen |
| `getQuantScore` | quant | Score/Faktoren/Coverage/Konfidenz |
| `explainQuantScore` | quant | Faktorbeiträge, die zum Composite aufsummieren |
| `getFactorHistory` | quant | Score-/Faktor-Zeitreihe |
| `rankStocks` | quant | Ranking nach Score oder Score-Velocity |
| `createStrategy` | strategy | Strategie aus validierter Definition |
| `validateStrategy` | strategy | validieren ohne auszuführen |
| `runBacktest` | strategy | Backtest ausführen (nur validierte Definition, nie ein String) |
| `compareBacktests` | strategy | zwei gespeicherte Backtests vergleichen |
| `getCurrentStrategyHoldings` | strategy | Strategie auf aktuelle Daten anwenden |
| `getWatchlistChanges` | monitoring | Score-/Faktor-Deltas und Events |
| `getMethodology` | meta | versionierte Methodikbeschreibung |
| `listFields` | meta | alle abfragbaren Felder |

**Guardrails, im Code erzwungen (nicht nur Konvention):**

- `FORBIDDEN_TOOL_NAMES` (`sql`, `exec`, `eval`, `shell`, `fetch`, `readFile`, `db`, …) —
  Registrierung wirft, wenn versucht.
- `validateArgs()` lehnt fehlende **und** unbekannte Argumente ab.
- Nicht registrierte Tool-Aufrufe werden abgelehnt, kein dynamischer Fallback.
- `runBacktest` wirft ausdrücklich, wenn `definition` ein String ist — natürliche
  Sprache erreicht nie die Backtest-Engine direkt.
- Der Datei-Header verbietet ausdrücklich, jemals SQL-, JS-Eval-, beliebige-URL- oder
  Datei-Zugriffs-Werkzeuge zu ergänzen — als Sicherheitsgrenze, nicht als Konfiguration.

**Keine willkürlichen SQL-Abfragen durch AI. Keine vom LLM erfundenen Finanzdaten.**

---

## 18. VUQL

**Vision Universe Query Language.** Grundsatz: **VUQL ist die menschenlesbare
Repräsentation, der typisierte JSON-AST (`query.js`) ist die kanonische interne
Repräsentation.**

```
Natural Language
   ↓ (AI, ai-provider.js)
Validated AST (query.js)
   ↔ VUQL (vuql.js, Parser + Serializer, nur Darstellung)
   ↓
Screener / Strategy Engine (Query.execute())
```

VUQL ist niemals das, was ausgeführt wird — nur eine austauschbare Textform des AST.

### Grammatik (zeilenbasiert, `#`/`--` Kommentare)

```
UNIVERSE <id>
<FIELD> [PCTL] <op> <value>
<FIELD> IN (...)
<FIELD> NOT IN (...)
<FIELD> BETWEEN x AND y
<FIELD> <value>              # Kurzform für "eq"
SORT <field> [ASC|DESC]
LIMIT <n>
```

Operatoren: `>= <= > < = != <>`. Zahlensuffixe: `%` (unverändert), `B` (×1000), `M`
(×1), `K` (×0,001) — gemappt auf die Katalog-Einheit `usd_m`. Felder werden über
`Catalog.fieldByToken` aufgelöst (derselbe 52-Felder-Katalog wie überall sonst im
System, siehe [§4.4](#4-repository-architektur)).

### Zweifache Validierung

Ein syntaktisch korrekter Parse durchläuft zusätzlich die **vollständige
`Query.validate()`** — Feld/Operator/Typ/Einheit/Bereich/Universum/Sort/Limit-Prüfung
sowie Widerspruchserkennung (z. B. `x >= 30` und `x <= 5` gleichzeitig). **Ungültiges
VUQL erzeugt niemals eine ausführbare Abfrage.**

Screener-UI, VUQL-Editor, Strategy Builder und AI-Tool erzeugen alle **denselben** AST
und rufen **dieselbe** `Query.execute()` auf — siehe [§13](#13-strategy-engine).

---

## 19. Provider Abstraction

Implementiert in `quant/engines/provider.js` (Interfaces + Registry),
`capabilities.js` (Fähigkeitsmatrix), `data-mode.js` (mock/hybrid/live),
`data-precedence.js` (Vorrangregeln bei mehreren Anbietern).

### Sieben Provider-Interfaces (`provider.js`), zur Laufzeit erzwungen

Keine TypeScript-Interfaces — `registry.register()` lehnt einen Adapter ab, dem eine
geforderte Methode fehlt:

| Interface | Methoden (Auszug) |
|---|---|
| `ReferenceDataProvider` | `getSecurities`, `getSecurity`, `getExchanges`, `getUniverse`, `getUniverseMembership`, `healthCheck` |
| `MarketDataProvider` | `getPriceBars`, `getLatestPrice`, `getBenchmarkBars`, `getPricePanel`, `healthCheck` |
| `FundamentalDataProvider` | `getFacts` (muss Point-in-Time unterstützen), `getFilings`, `getFactPanel`, `healthCheck` |
| `EstimateDataProvider` | `getEstimates`, `getRevisionHistory`, `healthCheck` — **bewusst ohne Daten in V1** |
| `CorporateActionsProvider` | `getCorporateActions`, `healthCheck` |
| `MacroDataProvider` | `getIndicator(s)`, `healthCheck` — **Erweiterungspunkt, nicht angebunden** |
| `NewsDataProvider` | `getNews`, `healthCheck` — **Erweiterungspunkt, nicht angebunden** |

Rückgabe-Umschlag durchgängig `ok(data, provenance)` / `unavailable(reason,
provenance)` — ein fehlender Wert wird nie zu `null`/`0` degradiert, sondern trägt eine
Begründung.

### Vendor-Leakage-Guard

`findVendorLeakage(value, path, out)` durchsucht rekursiv (bis 50 Array-Elemente tief)
ein kanonisches Objekt/Array nach Schlüsseln, deren kleingeschriebener Name eine
`VENDOR_MARKERS`-Teilzeichenkette enthält: `twelve_data`, `intrinio`, `eodhd`,
**`tiingo`**, `polygon`, `alphavantage`, `refinitiv`, `lseg`, `factset`, `bloomberg`,
`capitaliq`, `morningstar`, `yfinance` u. a. — **Tiingo taucht im gesamten Quant-Code
ausschließlich als Eintrag in dieser Sperrliste auf**, nirgends als Adapter (siehe
[§22](#22-tiingo-workstream)). Ein Acceptance-Test lässt diesen Scanner über Product
Layer und UI laufen.

### Capability-Matrix, Data Modes, Precedence

- **`capabilities.js`:** vier Fähigkeits-Sets (`market`, `fundamental`, `reference`,
  `estimate`), strikt dreiwertig (`true`/`false`/`null` — „nicht geprüft" wird nie zu
  „nicht vorhanden", MEDIUM-5-Lehre aus [§6](#6-phase-2--production-audit)).
  `capabilityMissing()` liefert einen eigenen Fehlertyp, getrennt von schlichter
  Datenabwesenheit — eine fehlende Fähigkeit ist nur durch Plan-/Anbieterwechsel lösbar,
  ein fehlender Wert nicht.
- **`data-mode.js`:** `mock` (V1-Default, nichts real) · `hybrid` (echte Marktdaten,
  synthetische Fundamentaldaten) · `live` (noch nicht erreichbar — kein lizenzierter
  Fundamentaldaten-Anbieter). Steuerung über `DATA_MODE`/`VU_DATA_MODE`; ein unbekannter
  Wert fällt auf `mock` zurück (der sichere Zustand). `resolveSources()` bestimmt die
  Herkunft je Datenklasse (`live`/`delayed`/`endOfDay`/`stale`/`mock`/`unavailable`/
  `capabilityMissing`) und markiert einen Live-Datenausfall sichtbar als `degraded`.
  `backtestEligibility()` markiert jeden Backtest auf synthetischen Fundamentaldaten als
  keine echte Evidenz — unabhängig davon, ob die Kurse echt sind.
- **`data-precedence.js`:** Entscheidungskette bei widersprechenden Anbietern:
  `pitSuitability → capability → confidence → freshness → providerPriority →
  timestamp` — die konfigurierte Anbieterpriorität steht bewusst fast am Ende, nicht am
  Anfang. Historische Abfragen schließen nicht-PIT-fähige Quellen ganz aus, statt sie nur
  abzuwerten. `dataQualityScore()` (`internalOnly`, Gewichte: PIT-Konfidenz 25,
  Vollständigkeit 20, Quellenzuverlässigkeit 15, Identifikator-Konfidenz 15, Aktualität
  15, Corporate-Actions-Abdeckung 10) und `createSnapshotId()` (Format
  `VU-US-EQUITY-2026-09-07-v1`) mit `evidenceEligible`-Flag.

### Transport, Qualität, Symbolzuordnung

- **`market-client.js`:** anbieterneutrale Transportschicht — Warteschlange mit
  Nebenläufigkeitsgrenze, Anfrage-Deduplizierung, TTL-Cache je Datenklasse,
  Retry/Backoff nur für als vorübergehend klassifizierte Fehler, Kontingentprüfung
  (pro Minute/Tag) **vor** dem Versand. Das Freikontingent ist der Normalfall, keine
  Ausnahme. `fetchImpl` ist injizierbar — das Modul selbst öffnet nie eine
  Netzwerkverbindung (testbar ohne Netzwerk).
- **`market-quality.js`:** prüft eingehende Kursreihen vor der Übergabe an die Quant
  Engine — unangekündigte Splits (Ratio-Abgleich gegen gängige Split-Verhältnisse),
  anomale Tagesbewegungen (>35 % Standardschwelle), Lücken in der Handelstagsfolge.
  Befunde als `error`/`warning`/`info`.
- **`symbol-mapping.js`:** bildet die kanonische `securityId` auf anbieterspezifische
  Symbole ab, disambiguiert über Exchange/MIC/Währung/Land/ISIN (ein blanker Ticker ist
  mehrdeutig, z. B. „SAN" = Sanofi oder Banco Santander). Konfidenz `verified` /
  `inferred` / `unverified` (Default `unverified`); Konflikte werden erfasst, nie
  stillschweigend überschrieben.

### Financial Data Core (`schema.js`)

Kanonische Entitäten in fünf Gruppen (Implementation Report nennt 26 Entitäten
insgesamt; namentlich verifiziert u. a.): Reference (`Security`,
`SecurityIdentifier`, `Exchange`, `Sector`, `Industry`) · Market (`PriceBar`,
`CorporateAction`) · Fundamentals (`Filing`, `FundamentalFact`, `EstimateSnapshot`) ·
Quant (`FactorDefinition`, `FactorSnapshot`, `QuantScoreSnapshot`) · Universe
(`Universe`, `UniverseMembership`) · Strategy (`StrategyDefinition`,
`StrategyVersion`) · Backtest (`BacktestRun`, `BacktestPosition`, `BacktestTrade`,
`BacktestMetric`) · Portfolio (`Portfolio`, `PortfolioHolding`, `Watchlist`,
`IntelligenceEvent`) · Provenance (`DataSource`, `DataProvenance`). Der
Validator lehnt unbekannte Felder ab.

### Provider-Vorbereitung unter `providers/` — tatsächlicher Stand

| Anbieter | README-Status | Realer Code |
|---|---|---|
| `mock/` | „nicht angeschlossen" (irreführende Kopfzeile) | **einzig aktiver, laufender Adapter** der gesamten App in V1 |
| `twelve-data/` | „gebaut, nicht scharf geschaltet" | vollständiger, getesteter 7-Methoden-Adapter (`adapter.js`) + Fetch-/Bewertungsskripte + Workflow; macht ohne `TWELVE_DATA_API_KEY` keine Anfrage; Node-only, aus ausgelieferten Seiten ausgeschlossen (Secrets-Test) |
| `intrinio/` | „nicht angeschlossen" | nur README/Vorbereitung, kein Adapter-Code |
| `eodhd/` | „nicht angeschlossen" | nur README/Vorbereitung, kein Adapter-Code |
| FMP, Finnhub, Polygon, **Tiingo** | — | **kein `providers/`-Ordner, kein Adapter, keine README** — trotz vorbereiteter `.env.example`-Variable |

Twelve Datas Selbstauskunft in der Fähigkeitsmatrix: Kurse 29 % (eingeschränkt),
Fundamentaldaten-für-Backtest 0 % (ungeeignet — kein PIT/Delisted-Support), Estimates
0 % (ungeprüft), Referenzdaten 60 % (geeignet). Kandidat für die Live-Produktschicht,
nicht für Backtests.

**Kleiner Doku-Widerspruch gefunden:** `providers/intrinio/README.md` dokumentiert
`INTRINIO_API_KEY` als benötigte Umgebungsvariable — sie fehlt in `.env.example`
vollständig (dort stattdessen `TWELVE_DATA_API_KEY`, `EODHD_API_KEY`,
`TIINGO_API_KEY`, `FMP_API_KEY`, `FINNHUB_API_KEY`, `POLYGON_API_KEY`).

---

## 20. Aktuelle Data Strategy

Strategischer Datenplan (Planungsstand, noch nicht umgesetzt — siehe [§21](#21-sec-workstream)/[§22](#22-tiingo-workstream) für den Realitätsabgleich):

```
SEC          → US Fundamentals, Filings, PIT, 13F / weitere öffentliche SEC-Daten
FRED / ECB   → Macro
Tiingo       → Market Data, Historical EOD, Raw/Adjusted Prices, Splits, Dividenden,
               Intraday/IEX für interne Entwicklung
Vision Universe → Derived Metrics: Quant, Technical Indicators, Backtests, Signals, Rankings
```

**Tatsächlich angebunden ist heute nur Twelve Data** (Marktdaten, Free-Plan, Phase 2),
und das ausschließlich für ein kleines Referenzuniversum im Hybrid-Modus. SEC- und
Tiingo-Anbindung existieren nicht als Code — siehe die beiden folgenden Abschnitte.

---

## 21. SEC-Workstream

**Stand nach Phase 4 (Branch `claude/sec-financial-data-core-qiizhj`, noch nicht
gemergt).** Der frühere Stand dieses Abschnitts — „es existiert kein dediziertes
SEC Financial Data Core-Modul" — galt für `main` zum Zeitpunkt von PR #43 und ist
durch Phase 4 überholt.

### Was gebaut wurde

Eine generische SEC/XBRL-Ingestion **unterhalb** der bestehenden
Provider-Abstraction, keine zweite Architektur daneben:

```
data.sec.gov → scripts/quant/sec/**  →  quant/data/sec/canonical/*.json
                (Python, Stdlib)         FundamentalFact · Filing · Security
                                                  ↓
                                    providers/sec/adapter.js
                                    FundamentalDataProvider (engines/provider.js)
                                                  ↓
                                    engines/schema.js · factors.js · backtest.js
```

- **`providers/sec/adapter.js`** implementiert `FundamentalDataProvider`
  (`getFacts`, `getFilings`, `getFactPanel`, `healthCheck`) plus
  `getFactsAsOf`/`getUniverseAsOf` für `gate-tests.js`. Serverseitig wie der
  Twelve-Data-Adapter; die SEC verlangt einen sich ausweisenden User-Agent, den ein
  Browser nicht setzen darf.
- **Die PIT-Regel bleibt `availableAt <= decisionTime` aus `engines/schema.js`.**
  Der Adapter bringt keine eigene mit; ein Test vergleicht seine Auswahl direkt
  gegen `Schema.latestKnownFact`.
- **Kein Duplikat entstanden.** Ein SEC-eigenes Faktor-Scoring, eine SEC-eigene
  Backtest-Bridge, SEC-eigene MOCK-Gates und eine SEC-eigene Capability-Konstante
  wurden im Zuge der Integration wieder **entfernt**; `factors.js`,
  `quant-score.js`, `backtest.js`, `gate-tests.js` und
  `quant/config/provider-profiles.json` sind und bleiben die jeweils einzige
  Instanz.
- **Was die Ingestion leistet:** Ticker→CIK, Submissions inkl. älterer
  Filing-Seiten, Company Facts, Fiskalkalender je Unternehmen (nicht-kalendarisch,
  52/53 Wochen, gelernter Label-Offset — die Felder `fy`/`fp` werden bewusst nie
  als Faktenperiode gelesen), Rekonstruktion von Standalone-Quartalen aus
  kumulierten Year-to-date-Werten innerhalb des PIT-Fensters, Revisionsreihen mit
  `revisionId`/`restatementStatus`, Provenance bis zur Accession Number,
  Data-Quality-Engine, Coverage-Matrix, Checkpointing und inkrementelle Updates.

### Was ausdrücklich NICHT belegt ist

**Es wurde keine einzige Anfrage an data.sec.gov gestellt.** Die Egress-Policy der
Entwicklungsumgebung blockiert die SEC-Domains (403 auf CONNECT); GitHub-Actions-
Runner sind nicht betroffen. Folglich:

- Gate A und Gate C bestehen **gegen eine synthetische Fixture**, nicht gegen echte
  Daten. Gate B fällt durch — richtigerweise, siehe unten.
- Coverage-Matrix, historische Reichweite und gemessene Gate-Ergebnisse je
  Unternehmen tragen `status: "not_generated"`.
- Das Provider-Profil `sec-edgar` steht durchgängig auf
  `RUNTIME_VERIFICATION_REQUIRED` oder `UNKNOWN`, nie auf `DOCUMENTATION_VERIFIED`
  oder `RUNTIME_VERIFIED`. Test Q15 stellt sicher, dass SEC dadurch **nicht** als
  qualifizierte Evidenzquelle gilt.

### Der ehrliche Negativbefund

SEC/EDGAR führt **keinen Security Master und keinen Delisting-Ereignisstrom**.
`company_tickers.json` listet nur Registranten mit aktuell zugeteiltem Ticker; ein
historischer Ticker lässt sich nicht auflösen. Der Adapter liefert für
`getUniverseAsOf` deshalb `unavailable`, und **Gate B fällt durch** statt das
heutige Universum als historisches auszugeben. Fundamentaldaten sind
PIT-korrekt — die Universumszugehörigkeit ist es nicht. Für ein
survivorship-freies Universum bleibt eine Indexhistorie (Sharadar, CRSP oder
gleichwertig) erforderlich.

### Nächster Schritt

Workflow **„Update SEC fundamentals"** per `workflow_dispatch` starten: Ingest →
`canonical` → `coverage` → Ingest-Prüfungen → `run-sec-gates.mjs` → `export`. Erst
danach lässt sich das Startjahr des Backtesters aus gemessenen Daten festlegen.

Details: `docs/SEC_DATA_ARCHITECTURE.md`, `docs/SEC_NORMALIZATION.md`,
`docs/SEC_PIT_METHODOLOGY.md`, `docs/SEC_COVERAGE_REPORT.md`,
`docs/SEC_PHASE4_REPORT.md`.

Unberührt bleibt `scripts/hedgefonds/fetch_edgar_data.py`: ein 13F-Scraper für den
eigenständigen `hedgefonds/`-Produktbereich, kein Teil der Quant-Provider-
Architektur.

## 22. Tiingo-Workstream

**Realitätsabgleich: Tiingo existiert im Repository ausschließlich als (a) eine leere
Platzhalter-Umgebungsvariable und (b) ein Eintrag in der Vendor-Leakage-Sperrliste.**

`grep` über das gesamte Repository (`docs/`, `quant/`, `providers/`) findet **keine
Doku- oder Adapter-Erwähnung von "Tiingo"** außer:

1. der Zeile `TIINGO_API_KEY=` in `.env.example` (zusammen mit `EODHD_API_KEY`,
   `FMP_API_KEY`, `FINNHUB_API_KEY`, `POLYGON_API_KEY` als „spätere Kandidaten, Phase 2
   nur dokumentiert, nicht angebunden"), und
2. dem String `"tiingo"` in `provider.js`s `VENDOR_MARKERS` — der Liste von
   Anbieter-Namensfragmenten, die der Vendor-Leakage-Scanner erkennt, falls sie
   *jemals* in einem kanonischen Objekt auftauchen (siehe [§19](#19-provider-abstraction)).
   Das ist vorsorgliche Sperrlisten-Pflege, **kein** Hinweis auf eine begonnene
   Integration.

Es gibt:

- **keinen** `providers/tiingo/`-Ordner,
- **keinen** Tiingo-Adapter,
- **keine** Tiingo-Erwähnung in einem `docs/VU_*.md`-Dokument,
- **keinen** Eintrag in `provider-profiles.json` (die sechs qualifizierten Kandidaten
  sind Sharadar, Intrinio, Twelve Data, EODHD, FMP, Polygon — Tiingo ist nicht
  darunter).

**GitHub Secret `TIINGO_API_KEY`:** Der Name der Umgebungsvariable ist in
`.env.example` als Vorlage vorgesehen. **Ob das Secret in den GitHub-Repository-Settings
tatsächlich hinterlegt ist, kann von hier aus nicht geprüft werden** — dieses Dokument
nennt ausschließlich den Namen, niemals einen Wert.

**Bekannte Free-Limits laut Planungsannahme** (nicht aus Repository-Dokumentation
verifiziert, nur als aktuelle Planungsannahme kennzeichnen): 50 Requests/Stunde, 1.000
Requests/Tag, 2 GB Bandbreite/Monat. Möglicher späterer Umstieg: „Commercial Internal"
Tarif, laut bisherigem (nicht im Repository verifiziertem) Stand ca. 50 USD/Monat.

**Ziel laut Planung** (noch nicht begonnen): Historical EOD, Raw/Adjusted Prices,
Volume, Splits, Dividenden, Intraday, IEX/Realtime soweit verfügbar, WebSocket soweit
verfügbar. Live-/Intraday-Chart darf intern entwickelt werden; Public Display ist ein
separates Licensing Gate mit eigenem Feature-Flag/Policy-Layer.

> **Für den nächsten Agenten:** Diese Diskrepanz zwischen der in Chat-Historie/Planung
> beschriebenen Tiingo-Aktivität und dem tatsächlichen Repository-Stand ist real und
> nicht dieses Dokument, das sich irrt. Vor jeder Tiingo-Arbeit: prüfen, ob seit diesem
> Stand (`9878cdc`, 7. September 2026) bereits Code entstanden ist.

---

## 23. Technical Intelligence & Elliott Wave

Vision Universe besitzt bereits einen Technical-/Chart-Bereich (`dashboard/charting`,
technische Scores im Dashboard). Langfristiges Ziel: **ein gemeinsamer Market Data
Core** für Charts, Technical Tool, Quant, Screener, Stock Detail, Reports und
Backtesting — Vision Universe berechnet selbst SMA, EMA, RSI, MACD, ATR, Bollinger,
Momentum, 52W High/Low, Volatilität, Drawdown, Trend Strength; der Provider liefert nur
Rohdaten (siehe auch [§29](#29-was-vu-kauft-vs-selbst-berechnet)).

**VU Elliott Wave / Technical Intelligence Engine** — Future Workstream, **nicht
begonnen**. Ziel jenseits reiner Linien: Pivot Detection, Swing High/Low, ZigZag,
Impulse 1–5, ABC-Korrektur, Fibonacci-Retracements/-Extensions, Invalidierungsregeln,
alternative Wellenzählungen, Confidence Score. Kein Code hierzu im Repository.

---

## 24. Data Licensing

**Aktuelle Provider-Lizenzfragen sind bei allen sechs geprüften Anbietern offen**
(`LEGAL_REVIEW_REQUIRED`, siehe [§7](#7-phase-3--data-qualification)). Zu
unterscheiden: Internal Use, External Display, Redistribution, Derived Data, Storage,
Post-Termination, Commercial Use. Die häufigste teure Überraschung: Sobald Daten
öffentlich angezeigt werden, gilt der Betreiber bei vielen Anbietern/Börsen als
professioneller Nutzer — unabhängig davon, ob damit Geld verdient wird
([§28](#28-cost-philosophy)).

**Aktuelle Strategie:** erst intern entwickeln, Public Display erst nach entsprechender
Lizenzentscheidung. Konkret bei Sharadar: professionelle Nutzer müssen über Nasdaq Data
Link beziehen; eine öffentliche Website ist mit hoher Wahrscheinlichkeit professionelle
Nutzung — die recherchierten 29/69 USD/Monat sind damit vermutlich **nicht** der
zutreffende Tarif.

Dieses Dokument ist **keine Rechtsberatung** und behauptet das nicht.

---

## 25. Mock / Hybrid / Live

Implementiert in `quant/engines/data-mode.js`, Betriebsmodi über `VU_DATA_MODE`:

| Modus | Bedeutung |
|---|---|
| `mock` | ausschließlich synthetische Daten (Standard, immer lauffähig, kein Netzwerk) |
| `hybrid` | echte Kurse für das Referenzuniversum, alles andere synthetisch |
| `live` | nur echte Daten; **scheitert bewusst**, wenn etwas fehlt |

**Grundregel: Datenherkunft wird pro Datenklasse ausgewiesen**, nicht pauschal fürs
ganze Produkt. Beispiel aus `/quant/markt/`: „Kurse: Demo / Fundamentaldaten: Demo" im
Mock-Modus; im Hybrid-Modus je Datenklasse einzeln. **Kein stiller Mock-Fallback als
echte Daten** — jeder Datensatz trägt `isMock: true`, jede Modellseite ein sichtbares
Demo-Banner, jeder Ticker-Präfix `VU Mock`.

`quant/data/market/status.json` steht produktiv auf `configured: false` — es sind keine
echten Kursdaten committet. Aktueller Datenumfang (`quant/data/meta.json`): 511
Securities (482 aktiv, 29 historisch delistet), 5.395 Handelstage (2006-01-02 bis
2026-09-04), Seed `vision-universe-quant-v1`.

---

## 26. Security

- **Keine API-Keys im Client.** Alle Abrufe laufen serverseitig (GitHub Actions); der
  Browser sieht nie einen Schlüssel — die Website ist statisch, alles im Browser ist
  öffentlich.
- **Keine Secrets im Repository, keine Secrets in JSON, keine Secrets in Logs.**
  Acht dauerhafte Tests plus eine Pre-Commit-Prüfung erzwingen das (Details in
  [§6](#6-phase-2--production-audit)).
- **Provider-Zugriff ausschließlich serverseitig/workflow-/proxyseitig.**
- **GitHub Secret `TWELVE_DATA_API_KEY`** ist aktiv genutzt (Phase 2), korrekt über
  `secrets.` in den Workflow gereicht. **GitHub Secret `TIINGO_API_KEY`** ist im
  `.env.example`-Template vorgesehen, aber im Code nirgends referenziert (siehe
  [§22](#22-tiingo-workstream)). **In diesem Dokument wird ausschließlich der Name
  dokumentiert, niemals ein Wert.**
- Kein `eval`, kein `document.write`, kein `new Function` im gesamten Quant-Bereich
  (geprüft).

---

## 27. Storage Strategy

**Aktueller Stand:** Alle Daten liegen als präkomputiertes, committetes JSON in
`quant/data/**` bzw. `dashboard/data/**` — kein Datenbanksystem. `quant/data/securities.json`
ist 945 KB unkomprimiert, 175 KB gzip-komprimiert (GitHub Pages liefert komprimiert
aus) — für 511 Titel × 60 Felder angemessen, ab ca. 2.000 Titeln wäre eine Aufteilung
wie bei der Factor DNA (`quant/data/dna/0.json`…`4.json`, geshardet) fällig.

**Prinzip für echte Daten (noch nicht umgesetzt):** einmal importieren → speichern/
cachen → danach nur Incremental Updates, keine tägliche Komplett-Neuladung.

**Langfristig mögliche Storage-Systeme** (Planung, nicht umgesetzt): Parquet, DuckDB,
PostgreSQL, Object Storage — passend zur in [§4](#4-repository-architektur)
beschriebenen späteren Migration.

---

## 28. Cost Philosophy

> **Vision Universe soll vor Product-Market-Fit keine hohen fixen Datenkosten
> produzieren.**

**Aktuelles Ziel:** ca. 50–100 EUR/USD monatliche externe Datenkosten während
Development/früher Phase. Kosten sollen mit Usage, Kundenzahl und Umsatz skalieren.
**Keine institutionellen Datenverträge ohne wirtschaftliche Begründung.**

### Drei Kostenkategorien (`docs/VU_DATA_PROVIDER_COST_MODEL.md`, Recherchestand
7. September 2026 — **keine dieser Zahlen ist eine Vertragsgrundlage**, alle vor jeder
Entscheidung neu zu erheben)

| Kategorie | Zweck |
|---|---|
| `DEVELOPMENT` | Bauen und prüfen, nicht veröffentlichen |
| `GROWTH` | Öffentlicher Betrieb, überschaubare Nutzerzahl |
| `SCALE` | Kommerzieller Betrieb |

**Der Sprung von DEVELOPMENT zu GROWTH ist meist kein Preissprung, sondern ein
Lizenzsprung** — derselbe Zugang, andere Nutzungsart, anderer Vertrag.

| Zweck | Zugang | Kosten (Stand 2026-09-07) |
|---|---|---|
| Gate A + C, kostenlos | Intrinio Developer Sandbox (Dow 30) | 0 USD |
| Sharadar, alle drei Gates | Full History Bundle | 69 USD/Monat bzw. 499 USD/Jahr (`THIRD_PARTY_REPORTED`, Lizenzfrage offen) |
| Twelve Data (aktiv) | Free Plan | 0 USD (`DOCUMENTATION_VERIFIED`) |

`SCALE` wurde bewusst nicht recherchiert — Skalierungspreise bei Finanzdaten hängen von
Nutzerzahlen, Anzeigeart, Rechtsordnung und Verhandlung ab und werden praktisch nie
öffentlich genannt. Nicht enthalten in den obigen Zahlen: Börsengebühren,
Professionell-Einstufung, Redistribution, abgeleitete Werte, Enterprise-Zwang.

---

## 29. Was VU kauft vs. selbst berechnet

**Wir kaufen möglichst nicht:** RSI, MACD, SMA, EMA, Momentum, 52W High, Volatilität,
Drawdown, Quant Score, Factor DNA, Rankings, Strategy Signals.

**Wir kaufen/beziehen:** Rohdaten (Kurse, Fundamentaldaten, Corporate Actions).

**Wir erzeugen:** Derived Intelligence — die gesamte Quant Engine, Factor DNA, Radar,
Backtest, Trust Score.

Dies ist bereits heute im Mock-Modus so umgesetzt: der Mock-Generator liefert nur
Rohkennzahlen und Kursreihen; jede Kennzahl (Faktoren, Score, Momentum, Radar-Events)
wird von den Engines aus diesen Rohdaten abgeleitet — genau der Pfad, der für echte
Anbieterdaten identisch bleiben soll.

---

## 30. Known Limitations

Ehrliche Liste, Stand 7. September 2026 — nichts beschönigt:

- **Alle Daten sind synthetisch**, solange kein Anbieterzugang konfiguriert ist. Auch
  mit echten Kursen blieben die Fundamentaldaten synthetisch, solange kein Anbieter Gate
  A/B besteht. `backtestEligibility()` gibt dafür `realEvidence: false` zurück.
- **Kein Anbieter ist als Evidenzquelle qualifiziert.** Jeder heutige Backtest ist eine
  Vorführung der Rechenlogik, kein Belastbarkeitsnachweis.
- **Die Kursreihen sind splitbereinigt, nicht total-return-bereinigt.** Momentum und
  Volatilität sind zulässig, Renditeaussagen nicht.
- **Revisions-Faktor ohne echte Daten** — Schema vorhanden, `available: false`.
- **Keine vollständige historische Analysten-Estimate-Datenbank.**
- **Kein professionell qualifizierter PIT-Market-Data-Provider.**
- **Delisting-/Universe-Coverage** ist im Mock-Datensatz sauber gelöst, bei echten
  Anbietern noch nicht (Gate B bei keinem Kandidaten bestanden).
- **SEC-Pipeline für den Quant-Bereich existiert nicht** — nur der unabhängige
  13F-Hedgefonds-Scraper (siehe [§21](#21-sec-workstream)).
- **Tiingo ist nicht mehr als eine Platzhalter-Umgebungsvariable** (siehe
  [§22](#22-tiingo-workstream)).
- **Public Live Chart Licensing ist offen.**
- **Elliott Wave Engine existiert nicht** (siehe [§23](#23-technical-intelligence--elliott-wave)).
- **Deflated Sharpe Ratio und PBO nicht implementiert** — Trust Score vergibt dafür 0
  Punkte statt die Prüfung zu überspringen.
- Ein Universum (`US_EQUITIES`), eine Währung, keine Makro-, News- oder
  Ownership-Daten im Quant-Bereich.
- Kein Nutzerkonto: Strategien, Backtests und Watchlist liegen im `localStorage`.
- Ein 20-Jahres-Backtest dauert ~19 Sekunden; der Web Worker hält die Oberfläche
  bedienbar, beschleunigt die Rechnung nicht.
- Ticker-Links in Datentabellen liegen bei Textzeilenhöhe (~15 px) — auf dem Telefon
  klein (LOW-3, nicht behoben).
- Tabellen ohne `<caption>`-Elemente (LOW-2, nicht behoben — keine Falschaussage).
- Regulatorische Prüfung (MiFID II, WpIG, WpHG, MAR, EU AI Act, Datenlizenzen) steht
  vollständig aus.
- **Dokumentationslücke:** `VU_BACKTEST_TRUST_SCORE.md` listet nur 3 der 5 Hard Caps
  (siehe [§16](#16-backtest-trust-score)) — im Code vorhanden und korrekt, im Prosadokument
  unvollständig.

---

## 31. DO NOT BREAK THESE RULES

Diese Regeln sind das Ergebnis konkreter, im Betrieb gefundener Fehler
([§6](#6-phase-2--production-audit), [§9](#9-release-audit-funde-und-guardrails)) — sie
sind keine Stilfragen.

1. **Kein Vendor Lock-in.** Der Provider-Wechsel berührt genau eine Adapterdatei.
2. **Keine Vendor-Payloads außerhalb des Adapters.** Erzwungen durch
   `Provider.findVendorLeakage()` + Acceptance-Test.
3. **Kein Future Data Leak.** `availableAt <= decisionTime` ohne Ausnahme, ohne
   Abschaltparameter.
4. **Kein stiller Mock-Fallback.** Jeder Mock-Datensatz trägt `isMock: true`, jede
   Modellseite ein sichtbares Banner.
5. **Missing ≠ Zero.** Ein fehlender Wert senkt die Coverage, wird nie durch 0 oder eine
   neutrale 50 ersetzt.
6. **Unknown ≠ False.** Die Capability-Matrix und die Belegstufen-Logik kennen drei
   Zustände; „nicht geprüft" darf nie zu „nicht vorhanden" werden (MEDIUM-5-Lehre).
7. **Keine erfundenen Revisionsdaten.** Der Revisions-Faktor bleibt `available: false`,
   bis lizenzierte PIT-Konsensdaten vorliegen.
8. **AI berechnet keine Finanzperformance selbst.** Sie ruft ausschließlich registrierte
   Tools auf und erklärt deren Ergebnisse.
9. **Backtest nutzt validierte Daten.** Ein Backtest ohne gehaltene Position ist ein
   Hard Cap (max. 5 Punkte Trust Score), keine normale Kennzahl.
10. **Tests dürfen Produktionsdaten nicht verändern.** Verifikationsläufe laufen auf
    Kopien, nie auf committeten Produktionsdateien (Lehre aus
    `technical_scenarios.json`, [§9](#9-release-audit-funde-und-guardrails)).
11. **Secrets niemals clientseitig.** Alle Abrufe serverseitig, acht dauerhafte Tests
    plus Pre-Commit-Prüfung.
12. **Existing Vision Universe architecture first.** Statisches HTML/CSS/JS, UMD-Module,
    `node --test`, GitHub Pages — kein Rewrite auf Next.js/FastAPI/PostgreSQL ohne
    expliziten, separaten Beschluss.
13. **Kein unnötiger Rewrite.** Erweiterung statt Parallelarchitektur.
14. **Provider-Abstraction erhalten.** Sieben Provider-Interfaces, eine Registry, ein
    Vendor-Leakage-Guard — nicht umgehen, auch nicht „nur für einen Test".
15. **Public Data Licensing getrennt von Internal Development betrachten.** Eine
    Fähigkeit intern zu nutzen heißt nicht, sie anzeigen zu dürfen.

---

## 32. Aktueller Status je Modul

| Modul | Status | Datenmodus | Teststatus | Bekannte Einschränkung | Nächster Schritt |
|---|---|---|---|---|---|
| Quant Score / Ranking | fertig (V1) | Mock | grün (`quant.test.mjs`, 25 Fälle) | Revisions-Faktor `available:false` | quant-v2 nach lizenzierten Estimates |
| Screener / VUQL | fertig (V1) | Mock | grün (`acceptance.test.mjs`, u. a.) | ein Universum, eine Währung | Universe-Modell ist bereits mehrmandantenfähig angelegt |
| Factor DNA | fertig (V1) | Mock | grün | — | — |
| Quant Radar | fertig (V1) | Mock | grün | — | — |
| Strategy Lab | fertig (V1) | Mock | grün (`strategy.test.mjs`, 22 Fälle) | 5 vordefinierte Strategien, kein User-Konto | Persistenz jenseits `localStorage` |
| Backtest Engine | fertig (V1), methodisch vollständig, evidenziell nicht belastbar | Mock | grün (`backtest.test.mjs`, 32 Fälle) | kein Deflated Sharpe/PBO; kein qualifizierter Evidenzanbieter | Kapitalmaßnahmen als erste produktive Datenklasse |
| AI (Ask Vision Universe) | fertig (V1), deterministisch | Mock | grün (`ai.test.mjs`, 24 Fälle) | kein reales LLM angebunden | `AI_PROVIDER_METHODS`-Interface steht für LLM-Anbindung bereit |
| Watchlist Intelligence | fertig (V1) | Mock | grün | `localStorage`-basiert | — |
| Technical (Quant-intern) | nicht begonnen | — | — | kein gemeinsamer Market Data Core | Elliott Wave / Technical Intelligence Engine |
| SEC Provider (Quant) | **nicht begonnen** | — | — | nur unabhängiger 13F-Scraper existiert | Intrinio-Sandbox, dann Sharadar-Lizenzfrage |
| Tiingo Provider | **nicht begonnen** (nur `.env`-Platzhalter) | — | — | kein Adapter, keine Doku im Repo | Realitätsabgleich vor jeder Aufnahme der Arbeit |
| Marktdaten (Twelve Data) | aktiv, Phase 2 | Hybrid (Referenzuniversum) | grün (`market-data.test.mjs`, 42 Fälle) | Free-Plan-Limits, nicht scharf geschaltet (`configured:false`) | Lizenzfragen klären |
| Macro (Quant-Anbindung) | nicht begonnen | eigenständig (`/macro/`, echte Daten) | — | kein `MacroDataProvider` angebunden | Interface bereits definiert |
| Hedgefonds (Quant-Anbindung) | nicht begonnen | eigenständig (`/hedgefonds/`, echte SEC-13F-Daten) | eigene CI (`hedgefonds-dashboard-ci.yml`) | völlig getrennt vom Quant-Bereich | keiner geplant vor SEC-Workstream |

Gesamt-Teststand: **232/232 grün**, verteilt auf 12 Dateien: `market-data.test.mjs` 42,
`backtest.test.mjs` 32, `acceptance.test.mjs` 31, `quant.test.mjs` 25, `ai.test.mjs` 24,
`strategy.test.mjs` 22, `provider.test.mjs` 21, `provider-qualification.test.mjs` 16,
`data-precedence.test.mjs` 16, `secrets.test.mjs` 15, `price-semantics.test.mjs` 13,
`gate-tests.test.mjs` 12.

---

## 33. Roadmap

**COMPLETED**
- Phase 1 — Foundation (6.–7. September 2026)
- Phase 2 — Production Audit (7. September 2026)
- Phase 3 — Data Qualification (7. September 2026)
- Preview Release, PR #43, gemerged

**CURRENT — nichts in Arbeit.** Alle drei geplanten Phasen sind abgeschlossen und
gemerged; der nächste Schritt ist eine bewusste neue Entscheidung (siehe
[§34](#34-decision-gates)), kein laufender Workstream.

**NEXT (nach Nutzen, nicht nach Aufwand sortiert)**
1. Intrinio Developer Sandbox anfragen, Gate A + C real verifizieren (kostenlos)
2. Sharadar-Lizenzfrage klären (kostenlos, nicht technisch)
3. Primärdokumentation ohne Egress-Beschränkung direkt lesen
4. Bezahlter Sharadar-Zugang für alle drei Gates (erst nach 1–3)
5. Kapitalmaßnahmen (Splits/Dividenden) als erste produktive Datenklasse
6. SEC Financial Data Core V1 (generische XBRL-Pipeline, Testuniversum NVDA/AAPL/MSFT/JPM/XOM)
7. Tiingo Market-Data-PoC (aktuell: 0 Code, siehe [§22](#22-tiingo-workstream))
8. Technical Engine Integration (gemeinsamer Market Data Core)
9. Live Chart intern
10. SEC → Quant Integration, Tiingo → Quant Integration
11. Backtest mit echten Daten

**LATER**
- AI-Anbindung an ein reales LLM
- Analyst Revisions (nach lizenzierten PIT-Konsensdaten)
- Europäische Fundamentaldaten
- Portfolio Intelligence
- Public Live Market Data
- Native Apps
- Advanced Elliott Wave

---

## 34. Decision Gates

Konkrete Entscheidungspunkte, an denen ein Mensch (nicht ein Agent) entscheiden muss:

| Gate | Frage | Heutiger Stand |
|---|---|---|
| **1** | Ist die SEC-Pipeline-Qualität ausreichend? | Pipeline existiert noch nicht |
| **2** | Ist Tiingo technisch geeignet? | Nicht evaluiert, kein Code |
| **3** | Tiingo Commercial-Internal-Upgrade? | Verfrüht — Free-Tier noch nicht getestet |
| **4** | Ist Derived-/Public-Display-Licensing geklärt? | Nein, bei allen 6 geprüften Anbietern offen |
| **5** | Sind Quant Scores mit echten Daten validiert? | Nein — kein Anbieter besteht Gate A/B |
| **6** | Sind Backtests mit echten Daten belastbar? | Nein — `realEvidence: false` bei jedem heutigen Lauf |
| **7** | Public Beta? | Verfrüht vor Gate 4–6 |

---

## 35. How to Continue This Project

Ein neuer Claude/Codex/ChatGPT-Agent soll, in dieser Reihenfolge:

1. **Diese Master-Datei vollständig lesen** — sie ersetzt nicht die 27 Fachdokumente
   unter `docs/`, verweist aber darauf, wo Detailtiefe gebraucht wird.
2. **Repository analysieren**, insbesondere `git log`, `git status`, aktuellen
   Branch-Stand gegen `origin/main`.
3. **Tatsächlichen Status verifizieren** — `node --test "quant/tests/*.test.mjs"`
   laufen lassen, nicht die hier genannte Zahl blind übernehmen, falls seither Zeit
   vergangen ist.
4. **Bestehende Architektur respektieren** — siehe [§31](#31-do-not-break-these-rules).
   Kein Next.js-/FastAPI-Umbau ohne expliziten, separaten Beschluss.
5. **Nur die aktuelle Phase bearbeiten.** Alle drei geplanten Phasen (Foundation,
   Production Audit, Data Qualification) sind fertig — der nächste Schritt ist einer der
   Decision Gates in [§34](#34-decision-gates), nicht eine Wiederholung von Phase 1–3.
6. **Keine alte Phase blind erneut implementieren.**
7. **Tests vor und nach jeder Änderung laufen lassen.** `verify-quant-data.mjs` nicht
   vergessen — er ist der Schutz gegen die gefährlichste Klasse von Datenfehlern in
   diesem System (Drift zwischen Übersicht und Backtest).
8. **Abschlussbericht erzeugen**, wie es die bisherigen Phasenberichte unter `docs/`
   vorgemacht haben.
9. **Diese Master-Datei nach wesentlichen Meilensteinen aktualisieren** — insbesondere
   nach jedem Decision Gate, jeder neuen Provider-Anbindung, jeder neuen Phase.

---

## 36. Changelog

Ausschließlich aus `git log` rekonstruiert — keine erfundenen Daten.

| Datum | Commit | Ereignis |
|---|---|---|
| 2026-09-06 | `2c865d6` | Quant V1 Phase 0–1: Audit, kanonisches Datenmodell, Provider-Abstraktion, Query/VUQL/Strategy |
| 2026-09-06 | `fec274b` | Quant V1 Phase 2: Mock Core — deterministisches synthetisches Universum, MockProvider |
| 2026-09-06 | `0a9706b` | Quant V1 Phase 3: Quant Core — Normalisierung, Faktoren, VU Quant Score, Radar |
| 2026-09-06 | `eb54a61` | Quant V1 Phase 4: Discovery — Quant Home, Ranking, Screener mit VUQL, Stock Detail, Radar |
| 2026-09-06 | `0d76fb0` | Quant V1 Phase 5+6: Strategy Engine UI, Backtest Engine, Trust Score |
| 2026-09-07 | `cccdbe2` | Quant V1 Phase 7+8: AI Foundation, Watchlist Intelligence |
| 2026-09-07 | `ad3849b` | Quant V1 Phase 9: Quality Pass, Abschlussbericht |
| 2026-09-07 | `e26c579` | Quant V1: Dokumentation, Provider-Vorbereitung, CI |
| 2026-09-07 | `2b08575` | Phase 2: Providerschicht, Schlüsselsicherheit, Auditkorrekturen |
| 2026-09-07 | `bafb625` | Phase 2: Datenherkunft in der Oberfläche, Marktdatenseite |
| 2026-09-07 | `d74a567` | Phase 2: Prüfstand, CI-Erweiterung, sieben Dokumente |
| 2026-09-07 | `eaaa956` | Phase 2: Zeitreihenantwort ohne `values` als Fehler behandelt |
| 2026-09-07 | `3316134` | Phase 3 §2: Zentrale Bereinigungssemantik — MEDIUM-7 behoben |
| 2026-09-07 | `e9cbecc` | Phase 3 §5–§13: Qualifikationsprüfstand, drei Gate-Tests |
| 2026-09-07 | `6c43ba1` | Phase 3 §18–§20: Vorrangregeln, Qualitätswert, Datenstandskennung |
| 2026-09-07 | `0e32110` | Phase 3 §25: sieben Dokumente, Paritätsprüfung, CI-Erweiterung |
| 2026-09-07 | `410df85` | Release-Vorbereitung: unbeabsichtigte Dashboard-Änderung zurückgenommen (`technical_scenarios.json`) |
| 2026-09-07 10:59 UTC | `0499868` | **Merge PR #43** „Vision Universe® Quant & AI — V1 Preview" nach `main` |
| 2026-09-07 | `9878cdc` | `main` aktuell (Stand dieses Dokuments), + reguläre `chore: update dashboard news` |

**SEC-Workstream:** kein Commit — nicht begonnen (siehe [§21](#21-sec-workstream)).
**Tiingo-Workstream:** kein Commit außer der `.env.example`-Vorlagenzeile — nicht
begonnen (siehe [§22](#22-tiingo-workstream)).

---

*Ende der Master-Dokumentation. Bei Widersprüchen zwischen diesem Dokument und dem
tatsächlichen Repository-Stand gilt immer: Code + Tests + Git vor diesem Dokument. Bitte
diese Datei nach jeder wesentlichen Änderung aktualisieren.*
