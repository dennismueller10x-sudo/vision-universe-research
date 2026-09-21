# Discover 2.1 Premium — Datenwahrheit und Vertragsaudit

Stand: 21. September 2026  
Scope: ausschließlich `/discover-v2/`, dessen QA und Dokumentation  
Der Isolation-Gate verwendet den aktuellen PR-Merge-Base als Integrations-Baseline (Graph-Start: `32b4796b51bcb95b7ef37bff36e18e34a85ad9c1`) und erzwingt davon unabhängig den geschützten Discover-1.0-Tree `de6baacf4c8c08891f7d4d2dc17ff40459517a8d`.

## Ergebnis

| Gate | Status | Nachweis |
|---|---|---|
| B1 Freshness | PASS | Home, Welten und Feed rendern über `discover/ui/cards.js` und `discover/ui/live-hub.js`. Sichtbare Karten tragen den kanonischen Freshness-Vertrag `LIVE / LAST_SESSION / STALE / UNAVAILABLE`. Die Aktienseite verwendet zusätzlich unverändert `SourceState.bestimme()` mit `REALTIME / SNAPSHOT / FINAL_SESSION / STALE`. |
| B2 Intraday / Home Charts | PASS | Sichtbare V2-Karten erlauben den bestehenden Snapshot-Pfad. `Cards.lazyArtwork` bindet nur sichtbare Karten über `LiveHub.subscribe`; Feed und Worlds verwenden denselben Renderer. Die fortlaufende WebSocket-Verbindung bleibt auf der geöffneten Stock Page. |
| B3 Structured Captions | PASS | Die sichtbare V2-Caption liest `rendered.range`, `rendered.asOf`, `data-freshness` und `data-session`. Es gibt weder `getAttribute('aria-label')` noch einen Regex auf Screenreader-Text. |
| B4 Realtime Payload | PASS, keine Änderung | `priceType` und `messageForm` sind ereignisspezifisch und können zwischen Ticks wechseln. Sie dürfen daher nicht in einen einmaligen Handshake verschoben werden. Nur `candlePriceType` ist konstant; dessen isolierte Entfernung rechtfertigt keine Änderung des produktiven Wire Contracts in diesem Frontend-Auftrag. |
| B5 Preview / Vergleich | PASS | `/discover-v2/` bleibt `noindex, nofollow`; die lokale Vergleichsaktion zu `/discover/` bleibt vorhanden. Kein Preview-Badge wird gezeigt. |
| B6 Isolation | PASS | `scripts/discover-v2/regression-gate.mjs` schützt 39.643 Baseline-Dateien und erlaubt nur die explizit aufgelisteten V2-, QA- und Dokumentationsdateien. Der Baseline-Tree von `discover/` ist `de6baacf4c8c08891f7d4d2dc17ff40459517a8d`. |
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

Die vorhandene Hygiene wird nicht umgangen: Feed-Karten sind Mitglieder der kanonischen Feed-Reihenfolge, und die ausgelieferte Eligibility bleibt maßgeblich. Das Audit hat jedoch einen explizit vom Owner genannten Grenzfall bestätigt:

| Titel | sichtbarer Wert | kanonischer Status |
|---|---:|---|
| PMI | +2.690 % in 3 Monaten | `discoveryEligible: true`, `dataQuality: WARNING`, Grund `large_move` |

Der Titel hat die bestehende kanonische Qualification durchlaufen und bleibt trotzdem im Feed. Ihn nur in V2.1 auszublenden wäre eine neue frontendseitige Eligibility-Regel und damit außerhalb des Auftrags. **Owner-Entscheidung erforderlich:** Sollen `dataQuality: WARNING`-Titel generell aus Consumer-Discovery entfernt werden, nur bei extremen Performancewerten zurückgehalten werden, oder weiterhin mit klarer Warnkennzeichnung erscheinen? Bis zu dieser Entscheidung bleibt die kanonische Reihenfolge unverändert.

Dieser Befund blockiert den Premium-Frontend-Build technisch nicht. Er verhindert aber, dass eine neue fachliche Ausschlussregel stillschweigend als Designänderung eingeführt wird.

## Ausführbarer Nachweis

```bash
node scripts/discover-v2/contract-qa.mjs
node scripts/discover-v2/regression-gate.mjs
```

Erwartung: `PASS_WITH_OWNER_REVIEW` für den Vertragsaudit und `PASS` für das Isolation-Gate. Der Owner-Review ist ein dokumentierter Datenregel-Befund, kein technischer Fehler und keine stillschweigende Regeländerung.
