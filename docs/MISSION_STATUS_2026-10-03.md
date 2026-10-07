# Vision Universe: Missionsstand nach #386 (Zwischenabgleich)

**Stand:** 03.10.2026, Abend.
**Grundlage:** [PLATFORM_HARDENING_REPORT_2026-10-03.md](PLATFORM_HARDENING_REPORT_2026-10-03.md) (PR #386).

Dieses Dokument ist **kein Abschlussbericht.** Die Mission ist noch nicht abgeschlossen; der Grund steht im [DoD-Abgleich](#abgleich-gegen-die-definition-of-done) (Punkt 14).

---

## PR-Landkarte

Jedes Thema ist ein eigener PR. Gestapelte PRs nennen ihre Basis. Kein PR ist gemergt.

| PR | Thema | Basis | Art | Wirkung |
|---|---|---|---|---|
| #386 | Platform Hardening: Core, Health/DQ, Pipelines, Doku | main | Architektur | Grundlage aller folgenden PRs |
| #387 | Supertrader: Core-Identität, Links, Validierungs-Checkout | main | Korrektheit | BRK-B & Co. richtig verknüpft, keine 404 |
| #388 | Discover: eine Split-Bereinigung, Kurs aus der veröffentlichten Tagesreihe | main | Konsolidierung | bitgleich, 0 Datendiffs |
| #389 | Company Intelligence: Workflow-Eingaben über `env` | main | Sicherheit | |
| #390 | CI-Gates funktionieren auch im flachen Checkout | main (nach #386) | Gates | Discover-Modul- und SEC-Gate waren still wirkungslos |
| #391 | `CLAUDE.md` (Arbeitsregeln) | #386 | DX | |
| #393 | CI: PR-Läufe verdrängen keine Produktionsläufe mehr; `ci-config.yml` | main | Reliability | belegter Fall: Pages-Deploy 38 min verzögert |
| #394 | Core-Adoption-Matrix (gemessen), Identität in Quant-Vertrag und 9 Erzeugern | #386 | Core | 25 Share-Class-Titel hatten falsche `securityId` |
| #395 | Discover: Source-State-Abdeckung über Core-Identität | #394 | Korrektheit | 11 Titel waren unsichtbar |
| #396 | News auf `core/client.js` | #394 | Core | Text identisch |
| #397 | Supertrader: Signal-Ausschnitte statt 3,3 MB je Seite | #387 | Performance | Start 3,68 → 1,80 MB, Aktie 3,65 → 0,37 MB |
| #398 | Discover: 52W-Overlay nach kanonischer Definition | main | Korrektheit (versioniert) | |
| #399 | 52W-Wortlaut („Tageshoch“) | main | Text | |
| #400 | Markets-Movers auf EOD-Basis (`movers-eod-1.0.0`) | main | Korrektheit (versioniert) | ADR-002 |
| #401 | Discover: Vortagesschluss aus der Tagesreihe (Split-Tag) | main | Korrektheit | BGM +3.928 % → +33,4 % |
| #402 | Quant: dasselbe im Quant-Chart, Splitbereinigt-Kennzeichen | main | Korrektheit | „nicht splitbereinigt“ stand fast überall falsch |
| #403 | Quant: Faktor-Projektion und Shards | main | Performance | Aktienseite 9,0 → 5,46 MB, alle 8 Budgets grün |
| #405 | Materialisierung erkennt neuere Faktoren | main | **Main-Rot-Fix** | behebt `launch-gates`/`screener-surface` |
| #406 | Scroll-Position bei Zurück | main | UI | außerhalb des Discover-View-Budgets |
| #407 | PWA Stufe 1: Manifest, Icons, Offline-Hinweis ohne Daten-Cache | main | App-Readiness | |
| #408 | Markets: Movers-Überschrift nennt das Sitzungsdatum | main | Text/Korrektheit | |
| #409 | Market Pulse: 52W-Hochs/-Tiefs symmetrisch (`breadth-extremes-close-1.0.0`) | main | Korrektheit (versioniert) | 116/59 → 46/59, Aussage kehrt sich um |
| #410 | Test: Technical-Split = Core-Definition | main | Konsolidierung (Nachweis) | |
| #411 | Supertrader: `registry-core.json` | #397 | Performance | 323 → 178 KB je Seite, Text identisch |
| #413 | Workflows: Dispatch-Eingaben über `env` (9 Workflows) + Wächter | main | Sicherheit | |

### Merge-Reihenfolge

1. **#405 zuerst.** `main` ist seit dem Faktor-Refresh `cf23c42766` rot. Die zwei Quant-Tests scheitern auf `main` genauso wie auf jedem PR, der die Quant-Suite auslöst. Danach (oder alternativ) einmal `product-intelligence-materialization` mit `force` starten (Owner).
2. **#386.** Danach #390, #391 und #394 → #395, #396.
3. **#387** → **#397** → **#411** (Supertrader-Kette, Gate A je PR).
4. Alle übrigen sind unabhängig voneinander. **#393** vor #413, damit `ci-config.yml` den neuen Wächter sofort ausführt.

---

## Core-Adoption nach Merge aller PRs (projiziert)

Gemessen ist der Stand in [CORE_ADOPTION.md](architecture/CORE_ADOPTION.md). Die Spalte „nach PRs“ zeigt, was die offenen PRs ändern; Grundlage sind die Code-Änderungen in diesen PRs, nicht eine Absicht.

| Bereich | Identity | Prices | Fundamentals | Corporate Actions | Health/DQ | Core Client |
|---|---|---|---|---|---|---|
| Discover | 🟢 (+#395) | 🟡 → 🟢 (#388, #401) | 🟢 | 🔴 → 🟢 (#388) | 🟢 | – |
| Quant | ✅ | 🟢 (#402, #403) | 🟢 | 🟢 | 🟢 (#405) | – |
| Markets | – | 🔴 → 🟢 (#400: EOD-Reihe) | – | – | 🟢 (#409) | – |
| Screener | ✅ | ⚪ | ⚪ | – | – | – |
| Supertrader | 🔴 → ✅ (#387) | ⚪ | ⚪ | – | – | – |
| Technical | ✅ | – | – | – → 🟢 äquivalent, testgesichert (#410) | – | – |
| News | – | – | – | – | 🔴 → ✅ (#396) | – → ✅ (#396) |
| Company Pages | – | 🟡 → 🟢 (#388, #401, #402) | 🟢 | 🔴 → 🟢 (#388) | – | – |
| Status | ✅ | – | – | – | ✅ | ✅ |

**Danach bleiben als Parallelwelten:**
- Supertrader-Validierung: Split-Schleife, semantisch identisch, versiegelte Forschung.
- Quant V1: Legacy, Mock-Universum, unveränderlich.
- `core/client.js` nur in Status und News. Nächste Kandidaten: Discover-Detail `getLatestPrice`, Screener `getPriceSeries`.

---

## Abgleich gegen die Definition of Done

| # | Kriterium | Stand | Beleg / Lücke |
|---|---|---|---|
| 1 | Reale Architektur verstanden und dokumentiert | erfüllt | Bericht §Architektur, `docs/architecture/*`, ADR-001…005 |
| 2 | Kritische Architekturprobleme gefunden | erfüllt | Bericht §Gefundene Bugs; seitdem dazu: Concurrency-Verdrängung, stille Gates, Materialisierungs-Noop, Split-Tag-Vortag, 52W-Asymmetrie, Script-Injection-Pfade |
| 3 | Sichere relevante Refactorings | erfüllt, wartet auf Merge | #388, #394, #396, #403; jeweils mit Vorher/Nachher |
| 4 | Zentrale Core-Struktur erkennbar | erfüllt | `core/` + gemessene Matrix |
| 5 | Zentrale Daten mit Source of Truth | weitgehend | Kurse ADR-002 (Movers #400), Identität ADR-001; **offen:** Universum bis zur Tiingo-2.0-Freigabe |
| 6 | Kritische Pipelines robuster | erfüllt, wartet auf Merge | #386, #390, #393, #405, #413 |
| 7 | Datenqualität systematisch prüfbar | erfüllt | `core/data-quality.mjs`, DQ-Regeln, `/status/` |
| 8 | Systemzustand/Frische sichtbar | erfüllt | `/status/`, `diagnose.mjs`, Frische-Kennzeichen |
| 9 | UI geprüft, relevante Fehler behoben | weitgehend | #398, #401, #402, #406, #408; Browser-Smoke 16 Seiten |
| 10 | UI-Logik vereinheitlicht, wo sinnvoll | teilweise | Scroll-Memory als gemeinsames Modul (#406). Weitere Vereinheitlichung bewusst nur bei inhaltlichem Fehler (FRONTEND.md). |
| 11 | App Readiness vorbereitet | erfüllt (Stufe 1) | APP_READINESS, ADR-004, PWA #407 |
| 12 | Kritische Regressionstests | erfüllt | je PR; Wächter für Identität, Split-Definition, Concurrency, Eingaben |
| 13 | Architektur und Betrieb dokumentiert | erfüllt | Bericht, ADRs, `CLAUDE.md` (#391), dieses Dokument |
| 14 | **Main bzw. vorgesehene PRs stabil** | **nicht erfüllt** | `main` rot seit `cf23c42766`; Fix #405 + Owner-Lauf. Die PRs sind lokal und in ihren eigenen Jobs grün; Quant-Jobs erben das Main-Rot. |
| 15 | Klare Liste verbleibender Risiken | erfüllt | unten |

**Ergebnis:** Die Mission ist **nicht abgeschlossen**, solange Punkt 14 offen ist. Alle anderen Punkte sind erfüllt oder warten nur noch auf den Merge.

---

## Owner-Schritte (nicht von Claude ausgeführt)

1. #405 mergen oder `product-intelligence-materialization` manuell mit `force` starten.
2. Nach #387: `supertrader-signals.yml` und `market-data-refresh.yml` einmal starten. Nach #397/#411 erzeugt der nächste Supertrader-Lauf die Ausschnitte.
3. Tiingo-2.0-Publikation freigeben (Universum: Delistings, Neuzugänge).
4. Vercel-Free-Tier-Limit: externer Status auf allen PRs, kein Code-Thema.

---

## Verbleibende Risiken und technische Schulden

| Thema | Schwere | Nächster Schritt |
|---|---|---|
| Identität tickerbasiert (Umbenennungen, keine ISIN/FIGI) | High | Umbenennungspfad mit Eingaben füllen (ADR-001 Stufe 2) |
| Universum veraltet bis Tiingo-2.0-Freigabe | High | Owner-Freigabe |
| `discover/data/`: sechs Schreiber, Build löscht das Verzeichnis | Medium | Erzeugerhoheit je Unterpfad (ADR-005) |
| Social-Workflows: nackte Pushes, Eingaben im Shell-Text (5 Workflows, Ausnahmeliste in #413), Admin-Schlüssel per `?key=` | Medium | Workstream Social |
| Keine SHA-Pins, `wrangler@4` floatet | Medium | Dependabot + Pins |
| `factors-FULL_UNIVERSE.json` 20 MB im Repo, Produktseiten laden es bis #403 | Medium | #403; danach Intraday-Variante `newLow52w` möglich |
| Social `NEW_52W_HIGH` feuert bei ≤ 2 % Abstand | Low (ruhend) | Pfad läuft nur auf dem Mock-Universum und erzeugt keine Signale. Bei Reaktivierung umbenennen oder kanonisch definieren. |
| Quant-V1-52W (Mock, Legacy) | Low | bleibt bis zur Abschaltung von V1 |
| `core/client.js` nur in 2 Produkten | Low | Discover-Detail, Screener |
| News ohne Zeitplan | Low | Owner-Entscheidung (externe RSS-Abfragen) |

---

## Empfohlene nächste Produktentwicklung

1. **Watchlist auf `instrumentId`** (Schema liegt vor, APP_READINESS §4). Sie ist die erste Funktion, die PWA, späterer App und Notifications gemeinsam nutzen. Heute gibt es zwei Watchlists mit Ticker-Referenz.
2. **Discover-Detail auf `core/client.js`**, damit Tagesänderung und Vortagesschluss nur noch an einer Stelle definiert sind (#401/#402 haben die Regel zweimal gleich umgesetzt).
3. **Notifications Stufe 1** auf dem Ereignisschema: 52W-Hoch (kanonisch) und Signalwechsel Supertrader, zunächst nur in der App-Oberfläche, ohne Push.
