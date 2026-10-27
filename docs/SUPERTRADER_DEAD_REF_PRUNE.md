# Supertrader · Bereinigungsmodus für entfallene Titel

Stand 27.10.2026. Anlass ist BZH. Umsetzung in zwei Draft-PRs (Gate A trennt sie):
- **PR 1:** Modus und Speicher-Frühwarnung in der CI (Supertrader-Pfade).
- **PR 2:** Anstoß im Nachtlauf (`scripts/ci`, `market-data-refresh.yml`). Erst nach PR 1 mergen, weil der Anstoß sonst mit HTTP 422 an der unbekannten Eingabe scheitert. Der Alarm würde das melden.

## Was am 27.10. passiert ist

| Job im Nachtlauf (Run 40433301246) | Ergebnis | Folge |
|---|---|---|
| `refresh` | grün, Commit `f10afd9` 03:02 UTC | Universum ohne BZH auf `main` |
| `materialize` | rot (Quant-Test, behoben durch #988) | Produktdaten nicht aktualisiert |
| `freshness-contract` | rot (fail closed) | – |
| `supertrader` | übersprungen | Signale (Stand 23.10.) zeigen weiter auf BZH |

Das Ergebnis war ein toter Discover-Link. Außerdem war `core/tests/state/supertrader-discover.test.mjs` für jeden PR rot, bis zum Zeitplanlauf von `supertrader-signals.yml` (bisher 4–5 Stunden verspätet).

Die Sperre des vollen Laufs war richtig: Ohne validierte Produktdaten darf Supertrader keinen neuen Stand rechnen. Es fehlte ein Weg, nur den toten Verweis zu beheben.

## Der Modus (`scripts/supertrader/prune-dead-refs.mjs`)

**Eingaben:** ausschließlich `discover/data/stock-index/US_REAL.json`, `discover/data/meta.json` und die committeten Supertrader-Dateien `signals.json`, `signals-core.json`, `build.json` und `trend52.json`.
- Keine Kurse, keine Materialisierung, keine Quant-Daten.
- Kein Anbieterabruf, keine Secrets, keine API-Kosten.

**Wirkung:** Titel, die das gültige Universum nicht mehr führt, werden in `discoverAvailability.unavailable` ausgewiesen.
- Das ist derselbe Ausweis, den der volle Build schreibt (Owner-Regel 04.10.2026, LOGI). Die Aktienseite zeigt dann einen Hinweis statt des Links.
- Geschrieben werden nur `signals.json`, `signals-core.json` und `stock/<SYM>.json` der neu ausgewiesenen Titel, jeweils nur dieses eine Feld.
- Unverändert bleiben:
  - Signale, Zustände, Einstiege, Stops, Ränge und Scanner,
  - das Ledger, `asOf`, Zähler und `checked`.
- Das Skript prüft vor dem Schreiben jede Datei: Ohne den Ausweis muss sie byte-gleich zum Ausgangsstand sein.

**Warum ausweisen statt löschen:** Das Signalprotokoll ist append-only („werden nie gelöscht“). Ein Löschen würde die Referenzstruktur brechen. Außerdem würde der nächste volle Build das Signal wieder schreiben, sodass Bereinigung und Build gegeneinander arbeiten würden. Der Ausweis ist genau der Zustand, den Zustandstest und Kettenmonitor als korrekt anerkennen.

**Abbruch (Exit 2, nichts geschrieben), wenn:**

| Code | Bedingung |
|---|---|
| `UNIVERSE_INVALID` | Index fehlt, ist kein JSON, hat nicht `universeId` US_REAL, `count` ≠ Symbolzahl, oder ein Kürzel ist nicht kanonisch (`core/identity.js#normalizeTicker`) |
| `UNIVERSE_INCOMPLETE` | weniger als 1.000 Titel |
| `UNIVERSE_UNVALIDATED` | `meta.json` ohne US_REAL, `securities` oder `withPriceSeries` ≠ Indexgröße, `asOf`/`generatedAt` fehlen |
| `UNIVERSE_OLDER` | Universum älter als der Supertrader-Stand |
| `IDENTITY_AMBIGUOUS` | zwei Kürzel mit derselben kanonischen `securityId`, oder Kürzel fehlt, aber seine `securityId` steht im Universum (BRK.B/BRK-B) |
| `UNIVERSE_SHRINK_IMPLAUSIBLE` | mehr als 25 Signal-Titel bzw. mehr als 2 % auf einmal entfallen |
| `STATE_INCONSISTENT` / `STATE_INVALID` | Stand von `signals`, `build` und `core` verschieden; Ausweis in `core` ≠ `signals`; geprüfte Titelmenge ≠ `checked`; Ausschnitt passt nicht; Datei nicht im Build-Format |

**Identität:** Ausgewiesen wird nur, wenn das Kürzel exakt fehlt. So verlinkt die Seite, und so prüft der Zustandstest. Die kanonische `securityId` (ADR-001) dient als Gegenprobe: Deutet sie auf denselben Titel unter anderem Kürzel hin, bricht das Skript ab, statt zu raten.

Ein Ausweis wird nie zurückgenommen. Ein wieder geführtes Kürzel kann ein neues Listing sein (Kürzel-Neuvergabe), und der Stock-Index führt nur Kürzel. Der Ausweis (Hinweis statt Link) ist die sichere Richtung. Zurücknehmen darf nur der volle Build.

Ein veralteter Ausweis macht den Zustandstest bis zum nächsten vollen Lauf rot („veralteter Ausweis“). Dieser Fall war schon vor dem Modus so, und der Modus verschlimmert ihn nicht.

Grenze der Identität: Signale und Stock-Index tragen nur Kürzel. Die listing-genaue `instrumentId` (Company Master) steht in den Signaldatensätzen nicht. Eine Kürzel-Neuvergabe ist darum hier nicht erkennbar, genauso wenig wie im vollen Build. Erkennt das der Nachtlauf (Schritt „Listing-Kontinuität“), wirkt der Modus nur in die sichere Richtung. Listing-genaue Identität in den Signalen wäre eine Änderung am Signalformat und gehört in einen eigenen PR.

**Deterministisch, idempotent, atomar:**
- Das Ergebnis ist die sortierte Vereinigung aus bisherigen und neu fehlenden Titeln.
- Ein zweiter Lauf ohne Universumsänderung meldet `NOOP` und schreibt nichts.
- Zuerst werden alle Inhalte berechnet und geprüft. Dann werden sie in Temporärdateien geschrieben und umbenannt, `signals.json` zuletzt.
- Das ist atomar je Datei, nicht über alle Dateien. Bricht der Lauf zwischen zwei Umbenennungen ab, gilt ein schon ausgewiesener Ausschnitt als erledigt. Ein erneuter Lauf vervollständigt den Rest mit demselben Ergebnis (getestet).
- Veröffentlicht wird erst nach den Integritätstests in einem einzigen Commit (`commit-and-push.sh`).

## Auslösung

- **PR 1:** `supertrader-signals.yml` erhält die `workflow_dispatch`-Eingabe `mode` (`build` | `prune-dead-refs`), nur über `env:`. Zeitplan und `build`-Weg bleiben unverändert. Im Bereinigungsmodus entfallen Minutenabruf und voller Build; die Integritätstests laufen weiter vor dem Commit.
- **PR 2:** Die neue Stufe `supertrader-prune` in `market-data-refresh.yml` läuft nur, wenn `refresh` grün und `materialize` oder `freshness-contract` nicht grün ist.
  - `supertrader-chain.mjs prune` stößt den Modus nur an, wenn tote Verweise bestehen, das Universum die letzte abgeschlossene Sitzung trägt und kein Lauf wartet. Ein wartender Lauf würde in der Concurrency-Gruppe verdrängt.
  - Die Stufe `supertrader` und `planDispatch` bleiben unverändert: Ein voller Lauf braucht weiter validierte Daten.
  - `workflow_dispatch` mit `GITHUB_TOKEN` ist der Weg, den die Kette bereits nutzt. Ein Push mit `GITHUB_TOKEN` löst dagegen keine Workflows aus, deshalb kein Push-Trigger.

Mit beiden PRs wäre der 27.10. so verlaufen: Gegen 03:05 UTC wird BZH ausgewiesen, der Stand bleibt 23.10., und der Zustandstest ist grün. Später rechnet der volle Lauf auf validierten Daten den neuen Stand.

**Grenzen:**
- Scheitert `refresh` selbst, gibt es kein neues Universum und nichts zu bereinigen.
- Läuft der Nachtlauf gar nicht, bleibt der Zeitplanlauf der Rückfall.
- Kann der Anstoß die Warteschlange nicht lesen, stößt er nicht an (fail closed). Ein wartender voller Lauf würde in der Concurrency-Gruppe sonst verdrängt. Der Pipeline-Alarm meldet das, wie jeden anderen Fehlschlag der Stufe.

## Speicher des Builds

Gemessen am 27.10.2026 auf `main` `168d611`, Node 22, 15-GB-Maschine:

| Heap | Ergebnis |
|---|---|
| Standard (2.096 MB) | Abbruch: JavaScript heap out of memory |
| 2.304 MB | Abbruch |
| 2.560 MB | durchgelaufen, 54 s, ~2,65 GB RSS |
| 3.072 MB | durchgelaufen, 49 s, ~2,76 GB RSS |

Der Standard-Heap von Node hängt vom Speicher der Maschine ab. Gemessen auf dem echten GitHub-Runner (Supertrader-CI zu #992, 27.10.2026):

| Messpunkt | Wert |
|---|---|
| Standard-Heap des Runners | 4.144 MB |
| inkrementeller Build mit 3.072 MB (Grenze 3.120 MB) | durchgelaufen, 50,2 s |
| regulärer Signallauf 40501225836 mit dem Standard | durchgelaufen |

Eine feste Einstellung von 3.072 MB hätte den Spielraum also um rund 1 GB gesenkt. Der Speicherabbruch tritt nur auf Maschinen mit weniger als 16 GB auf, deren Standard bei 2.096 MB liegt.

Deshalb gilt:
- **Kein `NODE_OPTIONS` im Produktivlauf.** Der Signallauf behält den Runner-Standard, ohne Erhöhung und ohne Absenkung.
- **Frühwarnung statt Einstellung:** Die Supertrader-CI baut bei jedem Supertrader-PR inkrementell auf einer Kopie, wie im Produktivlauf und mit dem Runner-Standard. Sie protokolliert die Heap-Grenze. Wächst der Bedarf über den Standard, wird dort ein PR rot, bevor der Signallauf scheitert.
- **Lokal** auf kleineren Maschinen braucht ein Build `--max-old-space-size=3072`.
