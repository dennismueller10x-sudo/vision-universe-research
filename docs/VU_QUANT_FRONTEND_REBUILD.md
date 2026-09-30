# Vision Universe Quant — Frontend Rebuild (Stand 30.09.2026)

Das sichtbare Quant-Frontend wurde vollständig neu aufgebaut. Engine, Daten,
Methodik, Services und Pipeline sind unverändert; neu ist die Produktschicht
darüber.

## 1. Architektur

```
Quant Engine            quant/engines/**          (unverändert)
Product Services        quant/api/product-services.js  (unverändert, nur Linkziele)
Product View Model      quant/app/view-model.js   NEU – übersetzt Verträge in Aussagen
Frontend                quant/app/*.js, app.css   NEU – rendert nur, was das View Model sagt
```

- Einstieg: `quant/index.html` → kanonisch `/quant/`. Im Release gebündelt zu
  `quant/release-bundle.js?v=<hash>` (`scripts/vu2/build-release.mjs`).
- `/vu2/` und `/Quant/` sind je **ein** Sprung auf `/quant/` (Query und Hash
  wandern mit). Alte `?view=`-Links bildet `legacyRoute()` in `quant/app/app.js`
  per `replaceState` auf die neue Route ab – keine Umleitungskette, kein
  zusätzlicher Verlaufseintrag.
- Das alte Frontend (`vu2/experience.js`, `vu2/experience.css`, die klassische
  Quant-Home `quant/app.js`) ist entfernt. Die klassischen Unterseiten
  (`/quant/stock/`, `/quant/screener/`, `/quant/data-inspector/`,
  `/quant/methodology/` …) bleiben als Profi-Werkzeuge erreichbar.

### Routen

| Route | Frage |
|---|---|
| `#/` Home | Was kann ich mit Quant machen? |
| `#/screener` (`?frage=`) / `#/screener/profi` (`?query=`) | Welche Aktien sind interessant? |
| `#/strategien`, `#/strategien/<id>` | Welche Art von Unternehmen sucht ein Stil – wer passt heute? |
| `#/aktien` | Welche Aktie möchte ich verstehen? |
| `#/aktie/<T>` | Wie gut ist die Aktie, warum, was verändert sich, was geschah früher? |
| `#/aktie/<T>/technik`, `#/aktie/<T>/zahlen`, `#/vergleich/<A,B>` | Vertiefung |
| `#/methodik[/<thema>]` | Warum kann ich dem vertrauen? |

### Wiederverwendete Discover-Komponenten (unverändert, nur gelesen)

- `discover/ui/microchart.js` – `renderRange` (Zeitraum-Chart), `renderIntraday` (Tagesverlauf)
- `discover/ui/live-hub.js` – Intraday-Snapshot und optionaler Live-Strom
- `/discover/data/meta.json` – dieselbe Realtime-Konfiguration wie Discover (erst auf der Aktienseite geladen)

Keine Datei unter `discover/` wurde geändert (`DISCOVER_CHANGED = false`).

## 2. Ein Chart

`quant/app/chart.js` ist der einzige Chart der Aktienseite: 1T 5T 1M 3M 6M YTD
1J 3J 5J 10J Max. 1T zeichnet den veröffentlichten Intraday-Snapshot; bei
offener Börse schreibt der Live-Strom denselben Chart fort. Die frühere
Kombination „1T nicht verfügbar“ plus separater Tageschart weiter unten gibt es
nicht mehr (`ONE_CHART_SYSTEM`). 5T zeigt Tagesschlusskurse, weil nur zwei
Intraday-Sitzungen aufbewahrt werden – die Bildunterschrift sagt das. Historische
Zeiträume: die splitbereinigte Tagesreihe der Product Services, für 10J/Max mit
vorangestellter Wochenreihe. Nach Börsenschluss bleibt im Kopf der offizielle
Schlusskurs stehen, nicht der letzte 5-Minuten-Kurs.

## 3. NVIDIA Quality Audit — `NVDA_QUALITY_EXPLAINED = PASS`

Artefakt `quant/data/product/factor-evidence-v1/NV.json.gz`, Methodik
`vu-factor-evidence-2.0.0` (aus `quant-v2.2.0`), Stand 28.09.2026,
Geschäftszahlen FY2027 Q2 (bis 26.07.2026, gemeldet 26.08.2026). Keine
Branchenvorlage; Vergleichsgruppe SIC 3674.

Normierung: Kappung 2 %/98 %, Rangplatz 0–100 (bei „niedriger ist besser“
umgekehrt), Branchen-Rang (≥ 20 Emittenten) sonst Wirtschaftszweig (≥ 40) sonst
Gesamtmarkt (≥ 200), Komponentenwert = 0,7 · Branche + 0,3 · Gesamtmarkt,
Faktor = Σ(Gewicht · Wert) / Σ(vorhandene Gewichte).

| Komponente | Rohwert | Branche (n) | Gesamt | Wert | Gewicht | Zustand |
|---|---|---|---|---|---|---|
| Abstand Gewinn ↔ Zahlungsfluss (niedriger besser) | 0,368 | 0,68 (75) | 1,00 | **0,77** | 25 % | vorhanden, über der 98-%-Kappung |
| Nettoverschuldung / Bilanzsumme | – | – | – | – | 20 % | **fehlt** (INPUT_NOT_MATERIALIZED) |
| Eigenkapitalquote | 0,761 | 68,09 (95) | 85,45 | 73,29 | 15 % | vorhanden |
| Jahre mit positivem FCF (5 J.) | 5/5 | 79,31 (88) | 81,21 | 79,88 | 20 % | vorhanden (Maximum durch Gleichstände) |
| Schwankung der operativen Marge | 0,083 | 37,93 (88) | 30,86 | 35,81 | 20 % | vorhanden |

(0,25·0,77 + 0,15·73,29 + 0,20·79,88 + 0,20·35,81) / 0,80 = **42,905** → Stufe
„Schwach“ (25 ≤ x < 45). Nachgerechnet und identisch mit dem Artefakt; stabil
seit 18.09.2026 (keine PIT-Drift). Position unter allen 3.621 bewerteten
Quality-Werten: 26,9 %.

**Klassifikation: E** – methodisch korrekt, aber das Nutzeretikett
„Unternehmensqualität“ war zu breit. Der Faktor misst laut `quant-v2.json`
„Durability, accounting quality and balance-sheet resilience; no profitability
levels are reused“. NVIDIAs Ertragskraft steht in Profitabilität (98,3, sehr
stark). Schwach sind (1) der Abstand zwischen Nettogewinn (192,9 Mrd.) und
operativem Cashflow (134,4 Mrd.) über die letzten zwölf Monate – rund 32 Mrd.
nicht-operative Erträge plus Aufbau von Umlaufvermögen – und (2) die
„Stabilität“ der operativen Marge, die einen strukturellen Anstieg von 16 % auf
62 % als Schwankung zählt. Beitragend: **B** (Nettoverschuldung fehlt – nur
468 von 5.347 allgemeinen Titeln haben sie, bekanntes Gate
`NET_DEBT_PERIOD_ALIGNMENT`; mit dem Geschäftsjahreswert läge NVDA bei ≈ 49,8,
„Durchschnittlich“) und **D** (siehe Band-Audit). Kein Rechenfehler (**nicht A**).

Umgesetzt – ohne eine Schwelle oder Grenze zu verschieben:

- Der Faktor heißt im Produkt **„Bilanz- & Ergebnisqualität“** (Methodik-Name
  bleibt „Quality“) und sagt ausdrücklich, was er nicht misst.
- Die Begründung nennt die tragenden Komponenten (stark und schwach) statt
  pauschal „angreifbare Bilanz“.
- Die fehlende Komponente wird mit Gewicht ausgewiesen („4 von 5 Kennzahlen“).
- Methodik-Seite „Die sieben Eigenschaften“ erklärt den NVDA-Fall.
- Dokumentationsdrift behoben: Die Stabilitätsnotiz sagte „Mittlere absolute
  Abweichung“, gerechnet wird der Median (`fundamental-inputs.js:289`); die
  Notiz in `scripts/quant/build-factor-evidence.mjs` ist korrigiert (wirkt mit
  der nächsten Materialisierung).
- Regressionstest: `quant/tests/quant-app-view-model.test.mjs` (VM2, VM3).

## 4. Band-Audit

- Faktorwerte sind **keine Perzentile**, sondern gewichtete Mittel aus
  (Branchen-/Markt-)Rangplätzen. Mittelung staucht zur Mitte.
- Die Stufen sind **feste Wertgrenzen** (90/75/45/25) aus
  `quant-v2.json score.ratingBands`. Dort sind sie für den (nicht aktiven)
  Composite-`quantScore` definiert, der *ein* Perzentil ist.
  `factor-evidence.js` verwendet sie für Faktorwerte und beschrieb sie als
  „stärkste 10 %“ / „schwächstes Viertel“ – Methodik und Beschreibung sind
  auseinandergelaufen.
- Referenzpopulation: das veröffentlichte Produktuniversum (6.297 Zeilen am
  28.09.2026), nicht das Contract-Universum (Marktwert ≥ 300 Mio., ADV ≥ 5 Mio.);
  Drift 6.404 → 6.441 → 6.297 (ETF-Ausschluss 28.09.). Branchenzuordnung
  `CURRENT_ONLY` (nicht PIT).
- Branchenvorlagen (Banken 529, Versicherer 126, REITs 200) ranken in eigener
  Kohorte; die Verteilung ist ähnlich gestaucht.

Gemessene Anteile je Stufe (Behauptung: 10 / 15 / 30 / 20 / 25 %):

| Faktor | n | sehr stark | stark | durchschn. | schwach | sehr schwach | Max |
|---|---|---|---|---|---|---|---|
| Quality | 3.621 | 0,0 % | 2,0 % | 66,3 % | 26,8 % | 4,9 % | 89,7 |
| Growth | 3.206 | 1,7 % | 9,1 % | 47,7 % | 31,4 % | 10,1 % | 98,8 |
| Momentum | 5.569 | 3,0 % | 13,2 % | 42,5 % | 24,2 % | 17,0 % | 98,2 |
| Value | 2.519 | 1,5 % | 11,2 % | 49,5 % | 28,0 % | 9,7 % | 99,0 |
| Profitability | 1.961 | 2,9 % | 14,3 % | 44,1 % | 25,4 % | 13,4 % | 98,3 |
| Risk | 5.569 | 7,3 % | 18,7 % | 34,9 % | 20,8 % | 18,4 % | 98,6 |

Umgesetzt (keine Neukalibrierung – das wäre eine neue, versionierte Methodik
und bleibt eine **Owner-Entscheidung**):

- Das Frontend beschreibt Stufen als Wertgrenzen, nie als Anteile.
- Jede Aktienseite nennt zusätzlich die **gezählte** Position („höher als bei
  27 % der 3.621 bewerteten Aktien“) aus den veröffentlichten Faktorwerten.
- Die Methodik-Seite zeigt die gemessene Verteilung live aus denselben Daten.

Offen für den Owner: Faktor-Stufen quantil-kalibrieren (z. B. auf den wahren
Rang des Faktorwerts) als neue Methodikversion; Engine-Text `bandPlain` in
`factor-evidence.js` („stärksten 10 %“) anpassen; Nettoverschuldung freischalten
(`NET_DEBT_PERIOD_ALIGNMENT`); Periodenabgleich der durchschnittlichen
Bilanzsumme im Accrual-Verhältnis; 21 veröffentlichte Faktoren mit Konfidenz
< 60 trotz `VU_QUANT_2_METHODOLOGY.md:92`.

## 5. Historical Replay

Drei Ebenen aus bestehenden Engines (`historical-cases.js`, `pattern-match`):
dieselbe Aktie in derselben Kurslage (Episoden, nicht Wochen), was danach
geschah (Median 3/6/12 Monate, Anteil im Plus, typischer Rückgang – erst ab 10
abgeschlossenen Fällen, sonst „Zu wenige historische Vergleichsfälle“), und der
Gesamtmarkt (vorregistrierte, out-of-sample gehaltene Muster gegen die
Grundgesamtheit). Kein Einzelfall wird herausgegriffen, keine Prognose.

## 6. Discover-Angleichung (30.09.2026, zweiter Durchgang)

Owner-Rueckmeldung nach dem ersten Release: das Frontend war eine eigene,
Discover nur aehnliche Gestaltung ("nur eine kleine Optik-Aenderung von
Quant"). Der Auftrag war die Angleichung an Discover. Umgesetzt wird sie
deshalb nicht als Nachbau, sondern mit Discovers eigenen Bausteinen:

- **Dieselben Stylesheets.** `quant/index.html` laedt, was
  `discover/index.html` laedt: `quant/ui/quant.css`, `discover/discover.css`,
  `discover/app.css`, `discover/home.css`, `discover/detail.css` (ohne
  `markets.css`/`featured.css`, die Quant nicht braucht). Discover selbst
  bleibt unveraendert (0 Zeilen Diff unter `discover/`).
- **Dieselben Klassen.** Rahmen `v2-bar` / `v2-main` / `v2-footer` /
  `v2-dock` (eine Leiste: Desktop oben mittig, Handy unten); Aktienseite
  `article.dv2-stock` mit `dx-dhero` (Firmenlogo aus `discover/ui/logos.js`),
  Discovers Chartaufbau (`dx-tf`, `dx-chart-hero`, `dx-scrub`),
  `dv2-stock-context`, `dv2-research-entry`, `dx-chapter` mit Kicker,
  `dx-zahlen`, das goldene Band `dx-chapter--journey`, `dv2-stock-valuation`,
  `dx-waage`, `dx-bewertung-zeile`; Home mit `v2-intro`, `v2-market-kpi`,
  `v2-world-door`, `dx-poster`-Schienen und `v2-pulse-teaser`; Strategien mit
  `v2-collection-link` und Discovers Perspektiven-Fotografie.
- **`quant/app/app.css`** enthaelt nur Quant-eigene Bausteine (Faktor-
  Aufklapper, Setup-Stufen, Bedingungslisten, Screener-Fragen,
  Regel-Editor) in Discovers Tokens (`--v2-*`, `--discover-*`).
- **qx-/qc-Klassen** bleiben als Anker fuer Tests und QA, ohne Gestaltung.

Inhaltliche Verbesserungen im selben Zug: Die Aktienkarten auf Home und
unter Aktien tragen jeweils eine eigene Aussage (staerkste gemessene
Eigenschaft als Zahl, Quant-Einordnung als Satz); "Neu in einer Strategie"
steht als eine Reihe je Strategie mit dem Datum EINMAL im Kopf statt an
jeder Zeile. Lange Trefferlisten zeigen Discovers Buchstaben-Marke statt
vierzig Einzel-Logos; die 1,7 MB grosse Logo-Lizenzliste wird erst geladen,
wenn der Seitenfuss in Sichtweite kommt.

## 7. Post-Launch-Backlog

- Stufen-Kalibrierung, Nettoverschuldung, Accrual-Periodenabgleich (Owner).
- „Quant-Einordnung ansehen“ in Discover und „In Discover entdecken“ in Quant –
  verlangt eine Discover-Änderung, deshalb nicht Teil dieses Umbaus.
- `screener/app.js` (eigenständiges Produkt) verlinkt noch `/vu2/?view=…`; das
  funktioniert über den Weiterleitungs-Stub, sollte aber im Screener-Produkt auf
  `/quant/#/…` umgestellt werden.
- Dunkles Farbschema für Quant.
- Die Abfrage „Abstand 52W-Hoch“ ist im Katalog als Prozent beschrieben, in den
  Zeilen aber ein Verhältnis; der einfache Screener liest den Wert deshalb direkt.
