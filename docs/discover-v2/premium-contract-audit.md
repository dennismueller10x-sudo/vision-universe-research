# Discover 2.1 Premium — Datenwahrheit und Vertragsaudit

Stand: 22. September 2026

Scope: `/discover-v2/` plus die vom Owner freigegebene gemeinsame Consumer-Discovery-Eligibility.

Der Isolation-Gate verwendet den aktuellen PR-Merge-Base als Integrations-Baseline und vergleicht die Discover-1.0-Frontenddateien einzeln. Gemeinsame generierte Daten dürfen sich durch die freigegebene kanonische Regel ändern; Layout, CSS, App-Code und UI-Renderer von `/discover/` bleiben bytegleich.

## Ergebnis

| Gate | Status | Nachweis |
|---|---|---|
| B1 Freshness | PASS | Home, Welten und Feed rendern über `discover/ui/cards.js` und `discover/ui/live-hub.js`. Sichtbare Karten tragen den kanonischen Freshness-Vertrag `LIVE / LAST_SESSION / STALE / UNAVAILABLE`. Die Aktienseite verwendet zusätzlich unverändert `SourceState.bestimme()` mit `REALTIME / SNAPSHOT / FINAL_SESSION / STALE`. |
| B2 Intraday / Home Charts | PASS | Sichtbare V2-Karten erlauben den bestehenden Snapshot-Pfad. `Cards.lazyArtwork` bindet nur sichtbare Karten über `LiveHub.subscribe`; Feed und Worlds verwenden denselben Renderer. Die fortlaufende WebSocket-Verbindung bleibt auf der geöffneten Stock Page. |
| B3 Structured Captions | PASS | Die sichtbare V2-Caption liest `rendered.range`, `rendered.asOf`, `data-freshness` und `data-session`. Es gibt weder `getAttribute('aria-label')` noch einen Regex auf Screenreader-Text. |
| B4 Realtime Payload | PASS, keine Änderung | `priceType` und `messageForm` sind ereignisspezifisch und können zwischen Ticks wechseln. Sie dürfen daher nicht in einen einmaligen Handshake verschoben werden. Nur `candlePriceType` ist konstant; dessen isolierte Entfernung rechtfertigt keine Änderung des produktiven Wire Contracts in diesem Frontend-Auftrag. |
| B5 Preview / Vergleich | PASS | `/discover-v2/` bleibt `noindex, nofollow`; die lokale Vergleichsaktion zu `/discover/` bleibt vorhanden. Kein Preview-Badge wird gezeigt. |
| B6 Isolation | PASS | `scripts/discover-v2/regression-gate.mjs` schützt alle Dateien außerhalb der exakten Allowlist und prüft `discover/index.html`, `discover/app.js`, `discover/discover.css` sowie sämtliche `discover/ui/*`-Dateien bytegenau gegen die Integrations-Baseline. |
| Extreme Consumer Discovery | PASS | Die freigegebene Regel nutzt `ranking-hygiene-2.0.0`: Nur `WARNING`-Titel mit bereits kanonisch als `IMPLAUSIBLE_VALUE` bewerteten Renditen werden aus Feed, Rankings und Collections quarantänisiert. Suche und Stock Page bleiben erhalten. |
| Zero Cost | PASS | Home/Worlds/Feed verwenden 5-Minuten-Snapshots. `meta.realtime.stream.scope` bleibt `stockPage`, `maxSymbolsPerClient` bleibt 5, und der vorhandene `FreeBudget`-Schutz mit `PROTECT/EXHAUSTED` bleibt unverändert. |

## B1 — zwei bestehende Zustandsverträge, keine neue Ableitung

Der Bestand trennt zwei Ebenen bewusst:

- `Freshness.assess`: `LIVE`, `LAST_SESSION`, `STALE`, `UNAVAILABLE`. Dieser Vertrag gilt für Snapshot-Verfügbarkeit und Aktualität auf Home, Worlds und Feed.
- `SourceState.bestimme`: `REALTIME`, `SNAPSHOT`, `FINAL_SESSION`, `STALE`. Dieser Vertrag gilt auf der geöffneten Stock Page und verbindet Session, Snapshot und gegebenenfalls frischen Stream-Tick zu genau einer sichtbaren Aussage.

Discover 2.1 benutzt dieselben Module und Renderer wie Discover 1.0. Eine V2-eigene Mapping-Tabelle zwischen beiden Zustandsräumen wurde ausdrücklich nicht gebaut, weil sie eine zweite Freshness-Logik wäre.

## B2 — Kosten- und Sichtbarkeitsgrenze

Der tatsächliche Pfad lautet:

| Surface | Datenpfad | Netzwerkgrenze |
|---|---|---|
| Home | `Home.stock → Cards.lazyArtwork → LiveHub.subscribe` | Snapshot nur für sichtbare Karte; sonst historische kanonische Reihe |
| Collection / World | `Cards.grid → Cards.lazyArtwork → LiveHub.subscribe` | wie Home |
| Immersive Feed | `Feed.render → Cards.lazyArtwork → LiveHub.subscribe` | aktueller Screen und kleiner Sichtbarkeitsrand |
| Stock Page | `Detail → LiveHub.live` mit Snapshot-Fallback | bestehender Stream; höchstens 5 Titel je Client |

Damit werden weder hunderte unsichtbare Karten gestreamt noch ein zweiter Worker oder eine zweite Verbindungsschicht erzeugt.

## B3 — Regression gegen Accessibility-Kopplung

Vor dem Fix wurde sichtbarer Caption-Text aus dem deutschen `aria-label` des SVG mit Regex rekonstruiert. Dadurch konnte eine reine Accessibility-Textänderung die sichtbare Datenbeschreibung beschädigen.

Jetzt stammen die Felder aus strukturierten Quellen:

- Zeitraum: `Artwork.verlauf(...).range`
- Datenstand: `Artwork.verlauf(...).asOf`
- Snapshot-Zustand: `data-freshness`
- Sitzung: `data-session`

`scripts/discover-v2/contract-qa.mjs` verweigert eine Rückkehr zu `aria-label` als sichtbarem Datenvertrag und läuft transitiv im bestehenden Regression-Gate der CI.

## B4 — Messung des Wire Payloads

Gemessen an einem Einzeltitel-Update, kompakt als JSON:

| Variante | Bytes |
|---|---:|
| aktueller Frame mit Ereignis-Semantik | 194 |
| ohne sämtliche Semantik | 94 |
| nur ohne konstantes `candlePriceType` | 155 |

Die 100 Bytes Differenz sind nicht vollständig konstant: `priceType` und `messageForm` gehören zum konkreten Anbieterereignis. Ein Tick kann ein bestätigter typisierter Trade sein, der nächste ein nicht typisierter Referenzwert. Der bestehende Worker hält diese Semantik positionsgleich zur jeweiligen Update-Zeile; bestehende Tests sichern Mischereignisse und Coalescing ab. Das Verschieben in `hello` oder `subscribe` würde Datenwahrheit verlieren. Der konstante Einzelwert `candlePriceType` bleibt aus Kompatibilitätsgründen im versionierten Payload. Ergebnis: gemessen, fachlich abgelehnt, keine Runtime-Änderung.

## Plausibilität und extreme Discovery-Ergebnisse

Die Owner-Entscheidung wurde umgesetzt: Extremwerte sollen nicht als Consumer-Empfehlung inszeniert werden, solange die vorhandene Datenhygiene sie als auffällige Bewegung einstuft. Dafür wurde **keine neue Ranking Engine** gebaut. `discover-eligibility-1.0.0` delegiert die Plausibilitätsprüfung an die vorhandene `ranking-hygiene-2.0.0` und verändert weder Renditen noch Rangberechnung.

| Titel | sichtbarer Wert | kanonischer Status |
|---|---:|---|
| PMI | +2.690 % in 3 Monaten | `discoveryEligible: false`, `ineligibleReason: DATA_QUALITY_REVIEW`; weiter über Suche und Stock Page erreichbar |

Der präzise Filter quarantänisiert im aktuellen Build 16 von 5.954 Titeln. Ein pauschaler Ausschluss aller `WARNING`-Titel wurde verworfen, weil er 1.774 Titel entfernt und damit die Consumer-Discovery unverhältnismäßig verengt hätte. Normale Warnungen, etwa begrenzte Historie, bleiben zulässig, solange keine kanonische Renditegrenze verletzt ist.

Der Contract-Gate prüft für jeden quarantänisierten Titel: nicht in Feed-Karten, nicht in Feed-Reihenfolge, nicht in Collection Rows, weiterhin in der Suche und mit sichtbarem Prüfhinweis auf der Detailseite.

## Ausführbarer Nachweis

```bash
node scripts/discover-v2/contract-qa.mjs
node scripts/discover-v2/regression-gate.mjs
```

Erwartung: `PASS` für Vertragsaudit und Isolation-Gate. Der frühere Owner-Review `EXTREME_DISCOVERY_RESULTS` ist geschlossen.
