# Vision Universe® Quant 2.0 — Orchestrator State

Updated: 2026-09-25 UTC

## CURRENT_MAIN

- GitHub `main` at this state write: `7b08a6eec` (Intraday-Takt 16, Discovery-Takt, unrelated to Quant).
- Last merged Quant release: PR #173, merge `a0bb8742b684c4ebfe145b7b148d475b0c33b53d`, deployed 2026-09-22.
- This section's work branch: `claude/quant-2-orchestration-hmuo69`, branched from `7b08a6eec`.
- Production URL: `https://research.visionuniverse.de`.

## CURRENT_PHASE

`ONE_RULE_THREE_READERS_STORE_LAG_NAMED_AND_WIRED`

Stand 2026-09-25, zweite Hälfte: der Zuordnungswechsel ist veröffentlicht und gegen den
Alarmvertrag geprüft (6.357 Titel, keine Abweichung, ein `predicateHash`) — §20 ist damit nicht
mehr Absicht, sondern nachgerechnet. Jeder Titel ohne Kursstruktur nennt seinen eigenen Grund mit
Zahl statt viermal desselben Satzes. Und der Befund, der beim Nachsehen herausfiel: die
Produkt-Kursstruktur lag **zehn Handelstage** hinter ihrem eigenen Kursstand, weil
`sync-history-store.mjs --push` in keinem Workflow verdrahtet war. Der Abstand steht jetzt auf der
Seite, der Push nach Gate B im Refresh, und ein dispatchbarer Hebel schreibt die Ablage ohne einen
einzigen Provider-Abruf nach. Vorherige Phase:

Die Vergleichsreihe hängt nicht mehr an der Total-Return-Prüfung, die
Setup-Experience beantwortet „was würde diesen Zustand ändern", Strategy Match und Pattern Match
nennen ihren Nenner und ihre Gründe, die historische Evidenz wird gemessen statt konstant verneint,
und der Aktienchart trägt die Basis, die sein Vertrag bindet. Die Reise ist gezählt, nicht behauptet.
Vorherige Phase:

Factor Evidence, Change, Strategy Match and now the Setup Observation exist as versioned
product engines over the broad canonical universe, and the Quant Experience frontend renders
them. Quant V1 is untouched and marked LEGACY_IMMUTABLE; Quant V2 lives in its own catalog
namespace with no composite. The setup mapping is approved for the point-in-time
tier and materialized over 5,676 titles; the four course-of-events states sit behind their own
activation gate. Since this section the setup rules also *screen*: the published state index
answers "which titles stand here" from the cascade's own assignment, proven against each rule's
predicate. Backtest and Market Regime remain ahead, both for measured reasons recorded below.

## PRODUCT_MILESTONES

| Milestone | Scope | State |
|---|---|---|
| M1 | Factor + Change experience | **DONE** (this section) |
| M2 | Setup Engine + frontend | **LIVE (point-in-time tier)** — approved 2026-09-23; four course-of-events states behind their own gate |
| M3 | Strategy Match | **DONE** — 8 profiles over the V2 namespace, ranking and history withheld |
| M4 | Pattern Research Engine | **DONE** — two pre-registered families over 967k observations, 1992–2026 |
| M5 | Pattern Match product | **DONE** — 249 robuste Muster je Titel, Verlustseite neben Gewinnseite |
| M6 | Backtest integration | **BLOCKED, measured** — historical index membership only; the total-return half of this blocker was wrong and is corrected (see KNOWN_BLOCKERS) |
| M7 | Market Regime | **LIVE (point-in-time tier)** — six breadth measures, exact pre-set thresholds; transitions behind their own gate |
| M8 | Full Quant experience | OPEN |
| M13 | Option C · Kursstärke/Anlegerrendite getrennt | **DONE** — quant-v2.1.0 / vu-factor-evidence-2.0.0 ausgeliefert, Smoke 30/30 |
| M14 | Benchmark-Frische | **DONE** — `BENCHMARK_STALE` statt falscher Vorsprung; SPY-Erholung offen und benannt |
| M9 | Setup screening (state index + parity) | **DONE** (this section) — one artifact, 6.8 KB, Aktienseite/Radar/Screener |
| M15 | SPY-Benchmark ohne Total-Return-Abhängigkeit | **DONE** (2026-09-25) — `splitAdjustedReconstructible`, Prüfung unverändert, Ablehnungen verfallen mit ihrer Regel |
| M16 | Setup Experience | **DONE** (2026-09-25) — Bedingungen in Wörterbuchsprache, „was diesen Zustand ändern würde", Aktualität benannt |
| M17 | Strategy Match / Pattern Match: Nenner und Gründe | **DONE** (2026-09-25) — 810 bzw. 1.494 Titel bekamen eine falsche Auskunft, jetzt eine richtige |
| M18 | Historische Evidenz (Beständigkeit) | **DONE** (2026-09-25) — zweiter Snapshot da, `ASSIGNMENT_PERSISTENCE` live (Momentum Leader 92,9 %, 157 von 169) |
| M19 | Chart auf gebundener Basis | **DONE** (2026-09-25) — NVDA/AAPL-Splitsprung entfernt, Bildunterschrift folgt der Reihe |
| M20 | Kalenderdeckung: Titel ohne Technical/Setup/Muster | **DONE, gemessen** (2026-09-25) — +166 Technical, +162 Signals, +160 Elliott; Rest liegt vor 2022-01-01 |
| M23 | Kursstruktur zehn Handelstage hinter ihrem Kurs | **DONE, realisiert** (2026-09-25) — Ablage beschrieben, 5.470 Titel auf 2026-09-24; die 331 Zurueckgestellten haben keine Kursreihe, also auch keinen Abstand zu nennen |
| M21 | Zuordnungswechsel: eine Regel, drei Leser | **DONE** (2026-09-25) — 37 Wechsel zwischen zwei Staenden, Alarmvertrag deckungsgleich ueber 6.357 Titel |
| M22 | Grund je Titel statt vier gleicher Saetze | **DONE** (2026-09-25) — `technical-unavailable-1.0.0` im ohnehin geladenen Shard |

## OWNER_DECISION_2026-09-22 — METHODOLOGY NAMESPACES

Quant V1 stays LEGACY_IMMUTABLE. No silent re-pointing, no ambiguous dual-source behaviour.
Quant V2 gets its own explicitly versioned namespace. Implemented as decided:

- `quantV1` namespace: `quantScore`, `qualityScore`, `momentumScore`, `valueScore`,
  `growthScore`, `riskScore` keep their **exact field ids**, gain `immutable: true` and an
  explicit `QUANT_V1_*` alias token. A test carries the id list as a regression guard —
  those ids sit inside stored strategy `definitionHash` and signal `predicateHash` values.
- `quantV2.factorEvidence` namespace: seven factor fields plus `availableFactors`.
  `quantV2.factorEvidence.composite` **does not exist**; a rule written against it gets an
  unknown field from the catalog. That is the gate, and a test holds it.
- Consumers choose explicitly. The Screener has a methodology selector and refuses a query
  that mixes the two (`methodologyOf(query) === null` → `INVALID_SCREEN_RULES`). Switching
  resets the rules rather than carrying them across. Saved legacy links resolve unchanged.
- Row source follows the methodology, not the caller. Trading status comes from the Company
  Master in both cases; the evidence table never asserts it itself.

Documented in `docs/VU_QUANT_2_METHODOLOGY_NAMESPACES.md`.

## COMPLETED_2026-09-25 — SPY, SETUP EXPERIENCE, STRATEGY MATCH, PATTERN MATCH, HISTORY

### The benchmark: a refuted total return no longer blocks a reconstructible price series

The owner's question was whether SPY has to depend on the total-return check at all, given that
`RELATIVE_STRENGTH_RETURN_BASIS = SPLIT_ADJUSTED_PRICE` is binding. Measured answer: it does not.

- `validateAdjustmentConsistency` is **unchanged**. Its verdict is read more precisely: the total
  return is what failed, so the total return stays blocked; the raw close and the split factor did
  not fail, and from them the split-adjusted series is reconstructible without any dividend amount
  and without the adjusted column. The provider re-adjusts `adjClose` retroactively after an
  ex-day and never re-adjusts the raw close, which makes the reconstruction the more stable of the
  two series.
- Three conditions, all required, the third measured rather than assumed: the only error is the
  status contradiction; at most the *dividend* adjustment is refuted (a refuted split puts the
  split factor itself in question → no fallback); and raw close, split factor, ascending trading
  dates and 252 bars are complete. `return-series.splitAdjustedInputs()` names the missing input
  (`RAW_CLOSE`, `SPLIT_FACTOR`, `TRADING_DATES`, `HISTORY`, `NO_BARS`) instead of "something".
- The declaration is its own word, `splitAdjustedReconstructible`, because neither existing one is
  true: `splitAdjusted` would let `market-factors` read the refuted column, `unadjusted` would
  cost the series its split-adjusted metrics everywhere. Price-semantics places it at level
  SPLIT_ADJUSTED (what can be computed), return-semantics under RAW_PRICE (which column may be
  read) — different questions, different answers, both stated in the methodology file.
- **Second finding, same case:** the rejection that aged SPY was written under a rule that no
  longer exists. A cooldown protects the quota from repeated requests under the SAME rule; after a
  rule change the request is not a repeat. Rejections now carry `rule` and lose their hold when it
  changes; the confirmation count restarts, so a first rejection under a new rule is not instantly
  a 40-hour block.

**Measured on the run that followed (36090303116, commit `c0ea35d06c`, factors 04:35 UTC):**

```
SPY_SPLIT_ADJUSTED_BENCHMARK      = PASS   935 Bars bis 2026-09-24, returnBasis
                                           SPLIT_ADJUSTED_PRICE via
                                           RECONSTRUCTED_FROM_SPLIT_FACTOR
BENCHMARK_FRESHNESS               = PASS   state CURRENT, lagBehindNewestSessions 0,
                                           newestSecurityDate 2026-09-24
RELATIVE_STRENGTH_AVAILABLE_BROADLY = PASS securitiesWithoutRelativeStrength 0 (vorher 6.267);
                                           kein einziges BENCHMARK_STALE in 6.437 Zeilen,
                                           5.606 mit 12M-Wert, die 831 ohne aus eigener
                                           zu kurzer Historie
TOTAL_RETURN_VALIDATION_UNCHANGED = PASS   SPY: claimed TOTAL_RETURN, inferred TOTAL_RETURN,
                                           basis "dividend" - die Pruefung hat die
                                           Bereinigung positiv bestaetigt, nicht umgangen
DISCOVERY_CHANGED                 = false  verify-discover-data 63.930 Pruefungen, keine
                                           Abweichung; 26 Reihen, keine leer; 5.987 Titel
```

Zwei Dinge daran sind wichtiger als die Flaggen:

1. **SPY brauchte den Rueckfall nicht.** Es hat die Konsistenzpruefung diesmal regulaer
   bestanden, weil das gemischte Bereinigungsfenster reparariert ist und die Regelaenderung
   die 20-Stunden-Sperre aufgehoben hat - alle 6.876 Titel wurden gefragt, `skipped: 0`
   (vorher 529 zurueckgestellt). Die strukturelle Unabhaengigkeit ist damit vorhanden und
   heute unbenutzt: sie ist die Zusicherung fuer den naechsten Widerspruch, nicht die
   Erklaerung fuer diesen.
2. **20 Titel haben ihn genommen** - AG, BBD, CASH, CRS, DIT, FGBI, IBKR, IFLO, MUSA, NMM,
   PEGA, PLPC, RMCO, SXI, TECH, TER, TILE, TMO, TPB, TRI. Sie stehen mit 935 Bars bis
   2026-09-24 im Bestand, ihre relative Staerke ist CALCULATED, und ihre Anlegerrendite ist
   UNAVAILABLE mit `TOTAL_RETURN_SERIES_UNAVAILABLE`. Genau 20 von 6.437 Zeilen verlieren die
   Gesamtrendite, genau dieselben 20 - und keine verliert ihr Kursmomentum. Ohne die Trennung
   waeren sie abgelehnt worden und gealtert (345 Ablehnungen statt 365).

Gates gegen die neuen Daten: PRE 2.022/2.022, INTEGRITY 113/113.

### Setup Experience

- **The condition rows were unreadable.** They printed the English catalog label plus the raw enum
  plus the operator as a word. 46 dictionary terms now cover every field the cascade compares and
  every value those fields can carry; internals moved to a folded line (layer METHODOLOGY), and a
  value without a term is left out rather than shown raw.
- **"What would change this state"** is answered from the published row, which the shard now
  carries (`setup-observation-product-1.1.0`, ten technical catalog fields; both schemas stay
  readable so nothing goes UNAVAILABLE between deploy and materialization). The engine uses the
  same two functions that assigned the state, and a test asserts the two cannot disagree.
  Course-of-events rules without a previous observation report `unanswerable`, not `unmet`.
- **The state is two weeks older than the chart beside it** (setup 2026-09-10 against prices
  2026-09-24) because the canonical history this workstream only reads ends there. The distance is
  now named on the surface instead of only the date.
- 426 titles carry a setup state without a factor row, 47 of them a state other than "no setup".
  The quant page ended for all of them after the notice while the stock page showed the same
  situation. A missing factor row now hides the factors, not the situation, the patterns and the
  style match.

### Strategy Match, Pattern Match, historical evidence

- 6,358 titles measured: 2,738 get a best style ≥ 40 %, 2,810 a stated non-fit, **810 have no
  measurable profile at all** — and those 810 were told the profiles "could not be loaded or
  checked". Each engine reason now says what it means and that it is a data gap, not a verdict.
  The lead sentence names the measurable denominator and what left it (1,049 titles).
- **The pattern denominator claimed checks that never ran.** 3,471 of 5,569 covered titles have
  unmeasurable patterns, 1,494 of them 181 of 250. Both surfaces now count checkable patterns with
  the not-checkable count and its reason, from one coverage figure in the service.
- **`historicalEvidence` was a constant** in the strategy index. It measures now: 1 of 2 published
  snapshots under `vu-factor-evidence-2.0.0`, dates named, versions never mixed (1.0.0 computed on
  total return). What two snapshots do answer is assignment persistence — implemented in the
  engine, falsified with a synthetic pair, and explicitly `isNot: [RETURN, HIT_RATE, BACKTEST,
  PROBABILITY]`.
- **The profile contract declared the wrong evidence version.** It said
  `vu-factor-evidence-1.0.0` while the table was 2.0.0, and the page printed the 1.0.0 to the
  reader; nothing compared the two. Now `strategy-profiles-1.1.0` with the version it reads, no
  profile or threshold changed, the measured membership impact linked, and a build-time abort on
  mismatch.

### The stock chart showed a 90 % crash that never happened

NVDA's 10:1 split of 2024-06-10 sits inside the 3Y, 5Y, 10Y and Max windows; the delivered series
has 1,208.88 the day before and 121.79 on the split day, and the page drew exactly that. AAPL the
same with its 4:1 of 2020-08-31. Option C binds the chart to SPLIT_ADJUSTED_PRICE, so the series is
reconstructed where the artifact is validated, with the same canonical reconstruction the factor run
uses. The last price stays the traded one; a test asserts that and that every return across a
split-free day is unchanged to 1e-9. If a building block is missing the series stays raw and says
so, and the caption is derived from the series' state instead of asserted.

### M20 — die Kalenderdeckung war der Grund, nicht die Daten

Die Reise-Messung zeigt ihre drei schwaechsten Stationen bei setup 83,2 %,
technical 85,2 % und patterns 80,0 %. Alle drei haengen an derselben Materialisierung, und
deren Zaehlwerk benennt die Ursache genau:

```
productUniverse       6.875
historiesFound        6.874   (1 SOURCE_MISSING: GLMD, bekannt)
historiesValidated    6.874   ALLE bestehen Provenienz, Bars und observedAt
lookbackCovered       5.977   897 haben weniger als 261 Bars - echte Datengrenze
signalsCapable        5.772   205 SIGNAL_INVALID_SIGNAL_SESSION
technicalFullBundles  5.676   208 TECHNICAL_CALENDAR_INVALID
elliottCapable        5.590
```

Zwei Pruefungen, eine Ursache: `market-signal-contract.js:29` und
`materialize-product-intelligence.mjs#validateTechnicalCalendar` laufen die letzten 261 bis
270 Bars durch und verwerfen den Titel VOLLSTAENDIG, wenn eine Bar auf einem Datum ohne
Kalenderdeckung liegt. Beide haben recht: ausserhalb der Deckung meldet der Kalender
2024-07-04 als Handelstag, weil dort nur der Wochentag entscheidet. Eine unsichere
Sitzungsaussage ist keine.

Also wurde die Deckung erweitert und die Pruefung NICHT gelockert. Sie begann 2025-01-01,
waehrend 270 Bars eines duenn gehandelten Titels weiter zurueckreichen: **152 der 6.482
veroeffentlichten Tagesreihen beginnen ihr Fenster vor 2025-01-01, die frueheste am
2023-01-03.** Neu: ab 2022-01-01.

Damit entscheidet diese Datei, welche Bars gueltig sind, und ein falscher Feiertag wuerde
echte Bars verwerfen. Jeder Eintrag ist deshalb zweifach belegt, und der Test rechnet beides
nach: aus der veroeffentlichten **Regel** (dritter Montag im Januar, letzter Montag im Mai,
vierter Donnerstag im November, Karfreitag ueber Gauss, beobachtete Verschiebung) und an den
**Daten** (an einem Feiertag traegt keine der fuenf tiefen Referenzreihen eine Bar, an jedem
anderen Wochentag mindestens eine - 40 Feiertage und ueber 900 Handelstage geprueft, keine
Abweichung). 2022 hat neun Eintraege und nicht zehn, weil Neujahr auf einen Samstag fiel.

Die Gegenprobe an den Daten hat einen Eintrag gefunden, den keine Regel hergibt:
**2025-01-09**, der nationale Trauertag fuer Praesident Carter, fehlte, obwohl die Boerse
geschlossen war. Er ist jetzt als Sonderschliessung mit Begruendung eingetragen, und der Test
verlangt diese Kennzeichnung fuer jeden nicht regelbasierten Eintrag.

Verkuerzte Handelstage fuer 2022 bis 2024 fehlen absichtlich, mit der Asymmetrie
danebengeschrieben: ein fehlender verkuerzter Schluss kann keine Bar ungueltig machen (er
betrifft nur eine Phasenaussage innerhalb des Tages, und Intraday-Daten gibt es fuer den
Zeitraum nicht), ein falsch eingetragener Feiertag wuerde echte Bars verwerfen.

Geprueft, dass die Erweiterung nichts NEU verschaerft: `validateBars` zaehlt fehlende
Handelstage nur gegen eine ausdruecklich uebergebene Liste, die der Import nicht uebergibt;
`realtime-source` liest die Deckung nur fuer die heutige Sitzung. Kein neuer Ablehnungspfad.

### M23 — die Kursstruktur war zehn Handelstage hinter ihrem eigenen Kurs

Beim Nachsehen, warum die Setup-Beobachtung auf dem 2026-09-10 steht, waehrend der Kursstand
2026-09-24 ist, kam der Grund heraus — und er ist keine Analysegrenze, sondern eine fehlende
Zeile in einem Workflow.

`sync-history-store.mjs` beschreibt seinen Vertrag selbst: **„--pull Ablage → .market-cache
(vor Faktoren und Technical), --push .market-cache → Ablage (nach dem Gate-Lauf)"**. Der Pull
ist in der Materialisierung verdrahtet. **Den Push gab es in keinem Workflow.** Der taegliche
Abruf hielt seine frischen Bars nur im GitHub-Actions-Cache; die Materialisierung liest die
dauerhafte Ablage und sah sie nie.

Gemessen am 25.09.2026:

```
Produkt-Technical (aus der Ablage)        dataCutoff 2026-09-10
veroeffentlichte Kursreihen (im Repo)     asOf       2026-09-24   6.483 Titel
Rueckstand                               10 Handelstage bei 5.646 von 5.676 Titeln
golden-preview (5 Referenzreihen)         2026-09-24
quant/data/technical/instruments (18)     2026-09-24  ← frischer als das Produktartefakt
```

Die Aktienseite zeigte beides untereinander: einen aktuellen Kursverlauf und darunter einen
Trend von vor zwei Wochen, jedes fuer sich richtig, und nichts sagte, dass sie nicht denselben
Tag beschreiben. Zwei Dinge sind daraus geworden:

1. **Der Abstand steht jetzt auf der Seite.** `getTechnicalIntelligence` vergleicht den
   Analysestand mit dem veroeffentlichten Kursstand DIESES Titels (aus derselben Reihe, die
   die Seite zeichnet — `stock.asOf` taugt nicht, es traegt den Stand der Geschaeftszahlen),
   gerechnet mit `freshness.js#lagSessions`, also demselben Sitzungsbegriff wie die
   Kursfrische. Der Satz: „Diese Auswertung steht auf dem Stand 2026-09-10 und liegt damit 10
   Handelstage hinter dem veroeffentlichten Kursstand (2026-09-24)." Gepruefte Oberflaeche
   1440 px und 390 px.
2. **Der fehlende Halbsatz ist verdrahtet.** `market-data-refresh.yml` zieht die dauerhafte
   Ablage nach Gate B nach (`--push --gate FULL_UNIVERSE --operation DAILY_UPDATE`), hinter
   einer eigenen Vorabrechnung. Kosten rechnet der Waechter, nicht der Schritt: ~6.900
   Class-A-Operationen je Lauf gegen eine Decke von 750.000 im Monat; reicht das Budget nicht,
   bricht er mit „OWNER DECISION REQUIRED" ab. Fehlt ein Zugang, bleibt der Abgleich aus und
   sagt es als `::warning`.

Der Rueckstand verschwindet damit nicht rueckwirkend — er verschwindet mit dem naechsten
Abruf, und bis dahin steht er auf der Seite.

### M20 — realisiert: 166 Titel mehr, und zwei Waechter, die zu Recht ansprangen

Lauf 36115714241 hat die Kalenderdeckung gegen die echten Reihen gerechnet:

```
                       vorher    nachher
technicalFullBundles    5.676      5.842   (+166)
calendarValidated       5.772      5.934   (+162)
elliottCapable          5.590      5.750   (+160)
TECHNICAL_CALENDAR_INVALID  208        42
SIGNAL_INVALID_SIGNAL_SESSION 205       43
```

Die geschaetzten 413 waren die Summe beider Pruefungen; realisiert sind 328 Wiederherstellungen
(166 + 162), und die restlichen 85 Faelle liegen mit ihrem Fenster vor 2022-01-01 — das ist
eine Datengrenze und keine Deckungsluecke mehr.

Zwei Waechter derselben Familie sind dabei angesprungen, und beide hatten in der Sache recht:

```
Lauf 36115714241  Setup-Beobachtung  dieselbe Stichtagsdatei haette mehr ZEILEN
Lauf 36118389993  Markt-Regime       dieselbe Stichtagsdatei haette andere ZAHLEN
```

Der erste Versuch war, die harmlose Form zuzulassen: nur Zeilen hinzufuegen, keine aendern.
Entschieden ist die Frage aber schon, und zwar in `build-factor-evidence.mjs`, wo sie einmal
einen ganzen Lauf gekostet hat: **„a comparison point has to be a value that was PUBLISHED on
that date, not one recomputed today."** Danach ist auch eine Erweiterung eine Neuberechnung der
Vergangenheit — die 166 Titel wurden an diesem Stichtag nicht veroeffentlicht. Sie treten mit
dem naechsten Stichtag in die Reihe ein, und das ist ihr richtiges Datum.

Deshalb jetzt **dieselbe Antwort an allen drei Stellen**: die veroeffentlichte Datei bleibt
unberuehrt, der Lauf laeuft weiter, und die Abweichung wird gemessen und ausgewiesen —
`recomputationDrift` (Faktoren, bestand schon), `observationDrift` (Setup, neu),
`publishedObservation` (Regime, neu). Was weiterhin abbricht: eine korrupte Datei, und eine
andere Methodik- oder Mapping-Version unter demselben Datum.

Beim Regime kommt eine eigene Begruendung hinzu, die beim Setup nicht gilt: dort ist jede Zeile
die Aussage EINES Titels, hier ist die Aussage ein ANTEIL an einer Grundgesamtheit. **Einen
Prozentsatz kann man nicht erweitern** — eine groessere Grundgesamtheit aendert die Zahl selbst.

### M22 — vier „derzeit nicht verfuegbar", die vier verschiedene Sachverhalte waren

1.199 der 6.875 Titel haben keine Kursstruktur. Alle lasen denselben Satz. Gemessen verbergen
sich darunter:

```
5.590  vollstaendig
  990  INSUFFICIENT_HISTORY    COOL: 20 Bars, notiert seit sechs Wochen
  208  TECHNICAL_CALENDAR_INVALID
   86  nur Elliott fehlt
    1  SOURCE_MISSING          GLMD
```

Der Grund war vorhanden — je Titel in `summary.json#rows`. Die Datei ist 813 KB gross und
damit fuer eine Aktienseite unbrauchbar; er kam nie an. Er steht jetzt in dem Shard, den die
Seite fuer genau diesen Titel ohnehin laedt, als **eigener Block mit eigener Version**
(`technical-unavailable-1.0.0`): in `instruments` prueft ein Leser Bundle-Felder und wuerde an
einem Grund-Eintrag scheitern. `validateShard` bleibt gruen, `instruments` Byte fuer Byte.

Damit ein Titel OHNE Bundle ueberhaupt einen Ort hat, steht der Shard jetzt vor der Analyse
fest statt auf dem Erfolgspfad. Belegt, nicht gehofft: an 6.875 Titeln nachgerechnet sind die
Schluessel zusammenhaengend — 646 Shards, kein Wiedereintritt — und ein Wiedereintritt bricht
den Lauf ab (`SHARD_REOPENED`), statt still eine fertige Datei zu ueberschreiben.

Die Oberflaeche sagt jetzt „Diese Auswertung benoetigt 300 Handelstage; fuer diesen Titel
liegen 20 vor". Bei einem sechs Wochen alten Titel fehlt nichts, was gleich kommt — „derzeit"
war dort das falsche Wort. Ein unbekannter Code fuehrt bewusst zum alten Satz, ein roher
Enum-Wert erscheint nie, und eine Forderung, die die vorhandene Zahl nicht uebersteigt, wird
zurueckgehalten statt sich selbst zu widersprechen. Der Test liest die Codes aus der Quelle
des Produzenten, damit ein neuer Code ohne Satz auffaellt.

### M21 — eine Regel, drei Leser: der Zuordnungswechsel

§20 verlangt, dass Screening-Regel, Signal-Regel, Alarm-Regel und Strategie-Regel **eine**
Regel sind. Das stand als Absicht im Vertrag. Jetzt ist es an dem Punkt gepruefbar, an dem
zwei Leser dasselbe sagen muessen.

Der zweite veroeffentlichte Faktor-Snapshot (`2026-09-23`, `2026-09-24` unter
`vu-factor-evidence-2.0.0`) hat M18 von `PENDING_HISTORY` auf `AVAILABLE` gedreht — die
Bestaendigkeitsquote je Profil steht auf der Aktienseite (Momentum Leader 92,9 %, 157 von
169). Die andere Haelfte derselben Rechnung fehlte: **hat sich MEIN Titel bewegt?**

Gemessen zwischen diesen beiden Staenden:

```
Wechsel gesamt        37     11 neu erfuellt, 26 nicht mehr
betroffene Titel      36     von 6.437
quality-compounder    +0 / -1     momentum-leader   +6 / -12
quality-momentum      +0 / -2     garp              +0 / -3
future-leader         +2 / -2     defensive-quality +0 / -0
value-momentum        +3 / -6     earnings-revision +0 / -0  (Eingabe nicht gedeckt)
Nutzlast              394 komprimierte Bytes   Index 3,4 KB von 128 KiB
```

Die Gegenprobe, auf die es ankommt: derselbe Wechsel, einmal von der Profil-Engine und
einmal von `quant/api/alert-rule-contract.js` ueber dasselbe Praedikat gerechnet — **6.357
vergleichbare Titel, keine einzige Abweichung, identischer `predicateHash`
(`rule_ed367bba35016006`)**. Ein Alarm auf diese Regel wuerde genau die 37 Wechsel melden,
die der Index veroeffentlicht. Das ist kein Alarmsystem: `delivery` bleibt `NOT_CONFIGURED`,
es gibt keine Zustellung, keine Planung und keine Abonnementspeicherung.

Drei Ehrlichkeiten sind mitgeprueft:

1. **Ein Titel, der im vorigen Stand fehlt, wechselt nicht.** Sonst waere jeder neu
   aufgenommene Titel ein „neu erfuellt", das nie gemessen wurde. `notComparable` weist die
   Zahl aus.
2. **„Nichts geaendert" ist eine Antwort.** 6.401 Titel bekommen sie ausdruecklich, statt
   dass die Zeile fehlt.
3. **Ein Wechsel ist eine Beobachtung zwischen zwei veroeffentlichten Staenden** — die Zeile
   nennt beide Daten und sagt, dass es kein Ereignis von heute, kein Signal und keine
   Prognose ist.

Gelesen wird auf der Aktienseite und auf der Watchlist: dort steht die Zeile nur bei einem
Wechsel (gepruefte Saat ASML/CNXN/NVDA: zwei von drei Karten tragen sie, 1440 px und 390 px,
kein Overflow, kein Seitenfehler). Der Dienst schlaegt den Wechsel in der veroeffentlichten
Liste nach, statt ihn ein zweites Mal auszurechnen — eine zweite Auswertung des Praedikats in
der Dienstschicht waere eine zweite Formulierung derselben Regel.

Neue Reise-Station `assignmentChange`, damit die Zahl nicht behauptet wird.

### M23 — realisiert: die zehn Handelstage sind weg, und 331 nennen ihren eigenen

Lauf 553 des Marktdaten-Refresh hat die dauerhafte Ablage zum ersten Mal beschrieben. Alle vier
neuen Schritte gruen: Zugang, Vorabrechnung (der Waechter gab DAILY_UPDATE frei), Push, Bericht.
Die Materialisierung danach (Lauf 36132044957) liest daraus:

```
                       vorher     nachher
technical asOf         2026-09-10 fuer 5.646   2026-09-24 fuer 5.470
                                              2026-09-10 fuer  331  (Ablehnungs-Cooldown)
technicalFullBundles        5.676      5.842
signalsCapable              5.772      5.967
elliottCapable              5.590      5.754
lookbackCovered             5.977      6.007
TECHNICAL_CALENDAR_INVALID    208         42
SIGNAL_INVALID_SIGNAL_SESSION 205         40
```

Der Abruf selbst: 6.876 Titel angefragt, 6.531 ok, 0 fehlgeschlagen, 345 an der
Qualitaetspruefung abgelehnt, **343 durch den Ablehnungs-Cooldown zurueckgestellt** — das sind
die 331, die ihren Stand vom 2026-09-10 behalten. Kontingent: 6.533 von 50.000 am Tag.

Zu diesen 331 eine Korrektur an mir selbst: sie bekommen KEINE Abstandszeile, und das ist
richtig. Nachgemessen: **alle 331 haben gar keine veroeffentlichte Kursreihe** (`SOURCE_MISSING`
bei `getHistoricalPriceHistory`). Ohne zweiten Stand gibt es keinen Abstand zu nennen, und der
Dienst erfindet keinen — genau die Regel, nach der `analysisLag` ohne eines der beiden Daten
schweigt. Ihre Lage ist eine andere Aussage: keine Kursreihe, und die macht die Chart-Station der
Reise sichtbar (19 von 500 `SOURCE_MISSING`), nicht die Abstandszeile. Die Zeile greift dort, wo
zwei Staende NEBENEINANDER stehen und verschieden sind.

**Was mit dem frischen Stichtag von selbst gefallen ist:** die Setup-Beobachtung hat ihren
ZWEITEN veroeffentlichten Stand (`2026-09-10`, `2026-09-24`), und damit steht die
Uebergangsmatrix des Aktivierungs-Gates nicht mehr auf `NOT_EVALUABLE`, sondern auf **PASS**.
Offen bleiben die Pruefungen, die zwoelf Beobachtungen und neunzig Tage brauchen — das ist Zeit,
keine Arbeit. Das Markt-Regime hat einen neuen Stichtag geschrieben (BROAD_WEAKNESS am
2026-09-24, `written: true`, kein Umschreiben), und die Faktorreihe weist ihre Neuberechnung aus:
**3.144 von 6.437 Zeilen** wuerden heute anders lauten als im veroeffentlichten 09-24-Snapshot,
weil Faktoren Perzentile sind und die Technical-Eingaben von 5.470 Titeln sich bewegt haben. Die
veroeffentlichte Zeile bleibt; die Abweichung steht mit beiden Hashes im Artefakt.

### The journey, re-measured against its baseline

Gegen die Grundlinie vom 2026-09-25T04:18 (500 von 6.875, deterministisch dieselbe Stichprobe):

```
Station            vorher  nachher  Delta   davon ausdrueckliches Nein
identity              500      500      0
chart                 480      481     +1
factorStrength        476      479     +3
change                471      474     +3
setup                 416      425     +9
setupChange           416      425     +9
patterns              400      400      0   79
strategy              415      418     +3   217
assignmentChange        –      500    neu   496
technical             426      426      0
business              500      500      0
```

28 Zugewinne, kein Verlust. 381 von 500 Titeln bekommen jetzt alle elf Stationen (vorher 370 von
zehn). **`technical` bewegt sich nicht**, und das ist kein Widerspruch zu +166 Bundles: die
Station zaehlt, ob eine Antwort kommt, und die Titel mit Kalenderfehler haben vorher ueber den
reduzierten Pfad geantwortet. Gewonnen hat die GUETE (FULL_WORKSPACE statt REDUCED_EVIDENCE),
nicht die Quote — wer nur die Quote liest, sieht diesen Ertrag nicht.

Nebenbefund, behoben: `journey-coverage-v1.json` stand nicht in der `git add`-Liste des
Workflows. Die Messung lief in jedem Lauf, druckte ihre Zahlen ins Log und wurde verworfen; das
ausgelieferte Artefakt war das vom letzten Handlauf. Jetzt wird es mitveroeffentlicht.

### The journey, counted

Over a deterministic sample of 500 of 6,875 titles: identity 100 %, chart 96.0 %, factorStrength
95.2 %, change 94.2 %, setup 83.2 %, setupChange 83.2 %, patterns 80.0 %, strategy 83.0 %,
technical 85.2 %, business 100 %. 370 titles get all ten stations, 26 get nine. An explicit no
counts as an answer and is reported separately (79 patterns, 217 styles); every gap carries a named
reason. `scripts/vu2/measure-journey.mjs`, run in the materialization workflow.

## COMPLETED_THIS_SECTION

- **The backtest blocker was half wrong, for the third time in this pattern.** Two inputs were
  recorded missing; only one is. Historical index membership genuinely does not exist (1
  snapshot per index, and no measurement creates it retroactively). Total-return prices *do* —
  the provider delivers `adjClose` and `divCash`, the adapter nulls `adjustedClose` only because
  the capability was never verified, and the qualification file said so in plain words:
  `"Nicht geprueft."` Verified arithmetically from committed files: **234/234 dividend events
  across five series, 2015–2026, worst error 0.051 %**. The check is reproducible, reads only
  committed data, makes no provider call, and writes nothing but its own report — a test asserts
  that by inspecting what it writes rather than what it mentions, because the first version of
  that assertion matched the script's own comment and proved nothing.
  The user-facing backtest copy and the completeness check were corrected with it. Switching the
  published price basis is now an OPEN decision with its consequence stated, not a BLOCKED gap.

- **The materialization pipeline was blocked by its own immutability guard, and the guard was
  right about the principle and wrong about the consequence.** Run `35898992415` failed at the
  factor evidence step. Reproduced locally: `a published snapshot for 2026-09-21 already exists
  with different content`.
  The cause is worth recording. The snapshot is keyed by the **market data cutoff**, but its
  values also depend on the **fundamentals vintage**, which the SEC export refreshes on its own
  schedule — and the factors are *percentiles*, so when anyone's inputs move, everyone's rank
  moves with them. Measured: 2,653 of 6,403 rows differed, by hundredths (50.38 → 50.33).
  So a later run recomputing a past cutoff differently is the normal case, not a defect. The
  module's own rule already said what to do with it: *"a comparison point has to be a value that
  was published on that date, not one recomputed today."* The published snapshot now stands
  untouched and the recomputation is simply not a snapshot. Corruption — a stored file failing
  its own hash — still stops the run, because writing past that would launder it.
  It does not pass in silence either: the drift is measured and carried into
  `summary.snapshotHistory.recomputationDrift`, because a line in a CI log is not somewhere
  anybody looks. Two tests pin it, verified against the aborting version.
- **A second finding from the same failure:** the materializer writes its artifacts *before* the
  immutability check, so the failed run left `factor-evidence-v1/` half-written — 640 modified
  shards and no `summary.json`. Restored rather than committed.

- **Production smoke over the built release, in the release workflow.** The previous browser QA
  ran against the repository. Production is a different thing: the page runs there as one
  bundled script, the artifacts sit under their delivery paths, and `.gz` is served opaquely —
  the browser does *not* transparently decompress it. A smoke against the repository tests a
  path that does not exist in production. `scripts/vu2/production-smoke.mjs` runs 15 views at
  1440px and 390px against `$RUNNER_TEMP/site` and fails on a recover page, a missing or
  duplicated `h1`, horizontal overflow, a forbidden term in primary copy, or any page error.
  Measured on this branch's build: **30/30 clean**.
  It also confirmed the release bundle picks up new engines automatically — it reads the
  `<script>` tags out of `vu2/index.html`, so there is no second list to keep in step — and that
  `market-regime-v1.json` and `strategy-index-v1.json.gz` are actually delivered.

- **`CRITICAL_PRODUCT_GAPS = 0`, measured rather than asserted.**
  `scripts/quant/assert-product-completeness.mjs` checks the published artifacts and exits
  non-zero while a critical gap stands; it runs in the materialization workflow. Three
  severities, and the difference is the point: **CRITICAL** is a defect (a surface reads an
  artifact that is missing, a published state has no user label), **BLOCKED** is a capability
  deliberately shut because an input does not exist — measured, named, and not a defect —
  and **OPEN** is informational. Each BLOCKED entry re-measures its own blocker rather than
  trusting a flag, and flips to an OPEN "this entry is stale" the moment the blocker clears.
  That guard exists because this section hit a stale gate twice before catching it.
  It found five real CRITICAL gaps on its first run: five setup reason codes had no user label.
  Four of them were only in a local `SETUP_CLOSED` map in the frontend — a second text source
  beside the dictionary — and the newer stock-page section bypassed it and called `LB(reason)`
  directly. A title with incomplete technical evidence would have crashed that page. Today no
  title has incomplete evidence, which is exactly what kept the defect invisible. The map is
  gone and the four reasons live in the dictionary.
  Standing state: 0 CRITICAL, 4 BLOCKED (backtest, revisions, regime transitions, setup path
  states), each with its missing input named.

- **M12 — Market Regime, as far as it is certifiable.** It had stood as a blanket owner gate
  (`MARKET_REGIME_NOT_CERTIFIED`). Measured, the split is the same one the setup engine already
  proved: a point-in-time description of market breadth **is** decidable from one cutoff; only
  transitions, hysteresis and persistence need ordered history. So the methodology is written
  with two tiers and the first one is live. Six measures over 5,676 titles, each published with
  its own denominator: 44.0 % above the 200-day line, 34.8 % above the 50-day, 25.3 % in an
  up-trend, 36.3 % down, 23.2 % within 10 % of the 52-week high, 16.5 % in a high volatility
  regime — today `MIXED`. Thresholds are round pre-set shares and deliberately asymmetric
  (strength needs 60 % above the line, weakness triggers at 40 %): claiming breadth is held to a
  higher bar than denying it, and the gap between them is where `MIXED` lives instead of a coin
  flip. A test pins both directions and the exact boundary. A thin input is named, never counted
  as a zero share. The observation history appends immutably; `REGIME_SHIFT`,
  `REGIME_PERSISTING` and `REGIME_WEAKENING` stay closed behind their own activation gate.
- **A defect only browser QA could find, and the guard that now catches it.** `market-regime.js`
  was written, wired into the services and covered by unit tests — and its `<script>` tag was
  never added to `vu2/index.html`. The service returned `SOURCE_MISSING` because its engine was
  `undefined`, and the page rendered the unavailable copy, which looks exactly like missing data.
  A test now checks that every engine the frontend or the services reach for is loaded by the
  page, and in an order that puts it before `product-services.js`; verified by removing the tag
  and watching it fail.
- **Two pieces of copy that had become false** were corrected with the change that made them
  false: the radar's "Quant V2 und Market Regime bleiben geschlossen", and the dictionary's
  "die Methodik dafür ist noch nicht freigegeben". The regime term also stopped saying
  "Gesamtmarkt" — the scope is the measured product universe, and saying otherwise oversells it.
- **A stray fetch I had introduced in M11** was removed: the radar was fetching the strategy
  index and discarding it. Invisible when reading the code, a wait for the user.

- **M11 — strategy profiles screen, and the reason they carry no history is now the true one.**
  `BACKTEST_NOT_CERTIFIED` stood on every profile. It is too coarse: it says a backtest is
  missing and leaves open whether somebody merely has to run one. What is actually missing is
  narrower and not a certification step — profile conditions are stated on percentile scores of
  *today's* comparison universe, and there is no historical factor panel against which
  "Qualität ≥ 75" could be evaluated at a past date. Now `FACTOR_HISTORY_NOT_AVAILABLE`, with a
  user-facing sentence that names the missing data rather than a missing approval.
  What *is* possible today needed no new data at all: a profile is a canonical predicate, so it
  screens. `strategy-index-v1.json.gz` (2.7 KB) publishes profile → titles, and the materializer
  re-runs each predicate through the query engine and refuses to write a list that is not its
  answer. Measured over 6,403 titles: quality-compounder 5, momentum-leader 163,
  quality-momentum 18, garp 99, future-leader 10, defensive-quality 12, value-momentum 119 —
  374 titles match at least one, 42 match several. `earnings-revision-leader` publishes
  `count: null` with `PROFILE_INPUT_NOT_COVERED` and names the field: Revisions is 0 of 6,403,
  so that zero is a data gap and not a finding about the market. Surfaces: the strategies page
  (all eight, closed ones dimmed with their reason) and the strategy section of a stock.

- **M10 — the entry page answers its own headline questions.** Measured gap: `view=stock` is
  where a person lands, and it carried no answer to *"Wie stark ist diese Aktie?"* and none to
  *"Chance gegen Risiko"*. Both sat one click away on `view=quant`; somebody who did not click
  saw a price and some figures. The page now carries the seven-factor strip — **the watchlist's
  component, reused**, because a second set of factor names is the double language the
  dictionary exists to remove — and a both-sided pattern balance read from the published
  artifact. NVDA: 12 of 249 patterns hold, 4 where the chance was historically larger than the
  risk, 8 where it was not. AAPL matches none, which renders as a statement rather than an empty
  box. The patterns overlap, so they are counted separately and never combined into one rate; a
  test rejects an aggregation. Depth stays on the quant page.
- **Two untranslated terms in primary copy, and the guard that missed them.** `Technical
  Intelligence` stood as an `h2` on the entry page and `vollständiger Intelligence` on the home
  page. Both passed the forbidden-term test because the list did not contain them — a guard is
  only as wide as its list. The list now carries `Intelligence`, `Technical Intelligence`,
  `Pattern Match` and `Setup State V1`, and it rejected both on the first run after widening.
- **A singular/plural defect in counted copy**, found by browser QA rather than by reading:
  JPM matches exactly one pattern and the page said *"1 von 249 Mustern **treffen** zu"*. Fixed
  for the lead sentence and both column captions, with a test.

- **Two stale gates found and corrected, both by measuring rather than trusting the text.**
  The lesson had already cost one wrong blocker entry (M4), so the reasons the product gives
  were swept against current reality:
  - `setup-state-contract.js` returned `SETUP_STATE_HISTORY_NOT_MATERIALIZED`. That stopped
    being true on 2026-09-23 — the mapping is approved and 5,676 titles carry a published state
    with an ordered history behind them. It now says `SETUP_STATE_MAPPING_NOT_ACTIVE`, which is
    true of *its own* setup-state-1.0.0 mapping and was already in its vocabulary, so no enum
    changed. `AVAILABLE_OBSERVATIONS_ALLOWED` stays false.
  - **The stock page**, the more visited surface, told users "Dafür braucht es eine geordnete
    Historie veröffentlichter Beobachtungen und eine freigegebene Methodik; beides ist noch
    nicht aktiv" — while the state stood one click away on the quant page. It now reads the
    same published observation, with the same peer list.
- **The backtest gate explains rather than only refuses.** Five checks said "nicht validiert";
  two are now the measured facts (one membership snapshot per index; split-adjusted series with
  no distributions), and the other three say why too. The benchmark line claimed none was
  "freigegeben"; what is actually the case is that the repository publishes equity price series
  and no index levels at all — `ref_SPXC` is SPX Technologies, an equity, not the S&P 500. A
  test holds the bar and caught that line on its first run.
- **The ten rule texts are spelled in German.** They were ASCII-only and rendered straight at a
  reader, so "Der Trend traegt" sat beside the dictionary's "Die Rahmenlage trägt". Seven were
  rewritten; `setup.watch.bullish-trend` still hashes to `rule_5c480d3b784b077f`, because a
  predicate is built from filters and not from prose. A test rejects ASCII shorthand in copy a
  reader sees; ids, versions and enum values stay ASCII on purpose.
- **The `total_debt` concept census had never run.** The step was committed 2026-09-22 19:53;
  the last SEC run started 19:17 and its job list does not contain the step. The owner gate was
  waiting on a measurement nothing had produced. Dispatched as run `35862972083`.

- **Setup screening (M9)** — the other half of the same question, with no new engine and no new
  pipeline. `SetupEngine.screenIndex()` publishes the cascade's assignment per state;
  `reconcile()` / `assertParity()` run each rule's predicate over the very rows the cascade saw
  and account for every difference. Measured at 2026-09-10: the `setup.watch.bullish-trend`
  predicate matches **1,436** titles while the state holds **620** — 816 were claimed by a
  higher-priority rule. Shipping the predicate as the state list would have been wrong by a
  factor of 2.3, and every extra title is one that is actually further along. Artifacts:
  `screen-index.json.gz` (6.8 KB, one fetch instead of 634 shards) and `screen-parity.json`.
  A drifted index throws in the materializer rather than publishing with a warning. Surfaces:
  Aktienseite (*Situation*), Radar (*Lage im Markt*), Screener `?setupRule=`. The screener link
  opens a **result**, not an editable query — loading the rule into the editor would run the
  predicate and reproduce exactly the 816-title error. A closed tier publishes `null`, never a
  count of zero, because "INVALIDATED: 0" is a claim about the universe.

- **Factor Evidence Engine** `vu-factor-evidence-1.0.0`, derived from `quant-v2.0.0`:
  `quant/engines/factor-evidence.js` (normalization, assembly, bands, confidence, publication gate).
- **Change Engine** `vu-change-1.0.0`: `quant/engines/change-engine.js`, eleven measured positions,
  change measured on inputs and never on scores.
- **Broad materialization**: `scripts/quant/build-factor-evidence.mjs` →
  `quant/data/product/factor-evidence-v1/` (637 shards + summary, 7.5 MB).
  Reads only existing artifacts: `factors-FULL_UNIVERSE.json`, `quant/data/sec/consumer/`,
  `technical-signals-v1`, `sic-peer-taxonomy-v1`. No provider call, no R2 write, no second pipeline.
- **Quant Experience frontend**: `/vu2/?view=quant` rebuilt as Meaning → Explanation → Evidence →
  Workspace (Stock Hero, Factor DNA with per-component evidence, "Was verändert sich gerade?",
  Setup journey with observable conditions, data-provenance panel).
- **Explain Quant**: new `/vu2/?view=explain` beginner surface.
- **Publication gate is enforced, not documented**: `publicationViolations()` runs on write for every
  security and on read in the browser. No `quantScore`, no `rank`, no score on a closed factor.
- **Derived input added honestly**: `downsideVolatility252d` computed from the published 270-bar
  series, labelled `SPLIT_ADJUSTED` per component. This is what opened the Risk factor.
- **Operating income wired into the factors**: `operatingMarginStability`,
  `operatingMarginExpansion3y` and `operatingMarginTtm` now compute from data that was already
  in the repository. Profitability opened (0 → 1,154), Growth rose to 3,188 and Quality to 2,732.
  Six of seven factors are now broadly available; only Revisions is fully closed.
- **SEC consumer export widened**: `depreciation_and_amortization`, `pretax_income`,
  `income_tax_expense` and the already-derived `ebitda` now leave the SEC layer. The readers for
  `ebitdaYield`, `roicTtm` and `roicMedian3y` are wired and unit-tested; the ROIC tax rate is the
  issuer's reported effective rate, and a loss year or a tax benefit leaves the value empty
  rather than substituting a flat rate.
- **Fundamental inputs extracted** into `quant/engines/fundamental-inputs.js` so that a formula
  deciding whether a factor opens is testable on its own. Behaviour-preserving: identical counts
  before and after.
- **Three input gates closed at the engine**: `market-factors-1.0.0` now computes
  `downsideVolatility252d`, `beta252d` and `relativeStrength12M1M`. Beta pairs security and
  benchmark **by trading date** — a day without a counterpart is dropped, never shifted, because
  positional zipping would misprice every return after the first holiday. The three fields appear
  in the artifact on the next market-data run; until then the materializer derives downside
  volatility from the published bar series and leaves the other two typed-closed.
- CI: factor evidence materialization wired into `product-intelligence-materialization.yml`
  right after the technical bundles it reads; new tests run in Quant CI and in that workflow.
- **Strategy Match** `strategy-profiles-1.0.0`: `quant/methodology/strategy-profiles-v1.json` +
  `quant/engines/strategy-match.js`. Eight profiles, each condition a filter of the canonical
  rule predicate — no second rule engine, and a profile carries a stable `predicateHash`.
  Match = met weight / measurable weight; an unmeasurable condition leaves the denominator
  instead of counting as a failure. `ranking.state = WITHHELD` and
  `historicalEvidence = UNAVAILABLE / BACKTEST_NOT_CERTIFIED` on every profile.
- **Compact evidence table** `factor-evidence-screening-1.0.0` (6,404 rows, 90 KB gzipped).
  Its column names ARE the canonical catalog field ids, so no second naming scheme can drift
  from the one a rule is written against; the materializer aborts if catalog and published
  factor set disagree.
- **Snapshot history started** (`factor-evidence-snapshot-1.0.0`). It lives beside the
  rebuildable artifact rather than inside it, is versioned by methodology, and refuses two
  distinct failures: a stored file that no longer matches its own content hash (corrupt), and
  a run that would give a published date different content (a changed past). Both abort.
  This is the precondition the owner named for M2 and the only honest way `scoreMomentum`
  can open — a comparison point must be a value that was published on that date.
- **`change.scoreMomentum` wired** to that history with a 30-day velocity window from
  `quant-v2.0.0 temporal.scoreMomentum`. Still closed today with one snapshot, and it now
  distinguishes "no history yet" from "history too short" instead of reporting both as one.
- **A strategy rule also screens** (§20). `StrategyMatch.screenQuery(profile)` returns the same
  predicate as a screener query — same `predicateHash`, same filters. Wired both ways: each
  profile on the stock page opens the screener with its rule, and the screener loads a profile's
  rule into the editor. A test checks the two against each other: every title the predicate
  selects must score 100 % on that profile, and no unselected title may.
- **Watchlist carries the evidence**: a compact seven-factor strip per member in canonical
  order, plus "x von 7 bewertet" and a link into the Quant analysis. One fetch of the evidence
  table for the whole list, not one per title. A factor without a value stays visibly empty —
  six of seven must not look like seven.
- Browser QA extended to the rebuilt `quant` view, the new `explain` view, the Strategy Match
  section, the screener methodology switch, the profile round trip and the watchlist strip,
  both widths.

### M2 — Setup Observation (`setup-mapping-1.0.0`, engine `vu-setup-1.0.0`)

- **The mapping is written and machine-checked**, not described. Ten ordered rules, first match
  wins, ending in a catch-all. `validateMapping()` refuses a cascade that leaves one of the
  eight states unreachable, that would decide a path-dependent state without a history
  condition, that names a field the catalog does not have, or that does not end in a rule that
  always matches. The materializer runs it before evaluating a single title.
- **Every point-in-time rule IS a screener query.** Each is one canonical rule predicate over
  catalog fields; a test asserts the predicate and the query carry the same `predicateHash` in
  both directions. §20 holds here without a second evaluator: the rule that assigns the state
  screens for it.
- **Two tiers, never conflated.** `classification` answers "what does today's evidence look
  like"; `lifecycle` answers "where does this title stand in its course". `ACTIVE`,
  `RISK_RISING`, `INVALIDATED` and `EXIT` are skipped — reported `NOT_EVALUABLE`, not as a
  negative — while the ordered observation history is short. They are never reconstructed from
  a single cutoff.
- **A repainting input was found and replaced.** The catalog only exposed
  `technicalStructure`, whose regime counts close breaks a later pivot confirmation can take
  back; a state built on it would change retroactively. `technicalConfirmedStructure`
  (`technical.confirmed_structure`) now carries the pivot-confirmed regime the structure engine
  already computes, and a test asserts no state-deciding rule reads the revisable one.
- **Invalidation is measured against the level that was published then.** The analysis
  invalidation price and the first target zone are frozen into each observation; a later run
  compares today's close against those, never against levels recomputed today.
- **Immutable observation history** beside the rebuildable artifact, per mapping version, with
  the same two aborts as the factor snapshots: a stored file that no longer matches its own
  content hash, and a run that would give a published date different content.
- **Materialized over the full technical-capable breadth**: 5,676 instruments, 0 without
  complete evidence — NO_SETUP 4,017 · WATCH 843 · SETUP_FORMING 800 · CONFIRMED 16, path tier
  0 and closed. Both WATCH paths are used (620 via trend, 223 via confirmed structure near the
  52-week high). Largest shard 4.6 KB gzipped.
- **The frontend stopped carrying its own definition.** The Setup section on `/vu2/?view=quant`
  previously listed seven conditions written in `experience.js`. It now renders the rule that
  actually decided the state, its conditions, the mapping version and the rule id. The journey
  steps come from the cascade, not from a hard-coded list.
- Wired into `product-intelligence-materialization.yml` right after the bundles it reads, with
  its tests and its summary in the run log and the retained evidence.

### M4 — Pattern Research (`pattern-research-1.0.0` + `pattern-research-fundamentals-1.0.0`)

- **The blocker entry was wrong, and measuring beat assuming.** M4 was recorded as needing deep
  canonical history from private R2. `quant/data/market/discover-series-long/` already held
  **6,308 titles of weekly split-adjusted closes at MAX range** — 618 starting in 1990, average
  763 weekly points, up to 1,915. No R2 restore, no credentials, no new pipeline. Discovery's
  artifacts are read and never written.
- **Two pre-registered hypothesis families, separately versioned and separately corrected.** The
  price family (15 candidates + their pairs) and the PIT fundamental family (15 candidates +
  pairs + cross pairs with the price family). The fundamental family is a separate file and a
  separate version precisely so the price study's hypothesis count was not changed after it had
  been measured — a correction over a retroactively changed count is not a correction.
- **Leakage is a check, not a comment.** Truncating the series after `t`, poisoning everything
  after `t` with `1e9`, and poisoning everything before `t` must each leave the numbers
  untouched; three tests hold it. There is deliberately **no size feature**, because market cap
  at a historical `t` needs that date's share count and no such series exists here.
- **A missing outcome is not a loss.** A series ending before the horizon closes is
  `OUTCOME_UNAVAILABLE` — neither winner nor non-winner — and its count is published.
- **Walk-forward folds are purged**: an observation whose outcome window still runs when the test
  block opens leaves the training block. A test asserts the embargo actually removed something.
- **Point-in-time means the filing date.** `pit-fundamental-history-1.0.0` reads a fiscal year
  only once it was filed, keeps the newest filing at or before `t`, and selects growth pairs
  **by fiscal year rather than list position** — a gap in a filed history would otherwise turn a
  three-year growth rate into a four-year one. A test caught exactly that during development.
- **Every finding carries its downside.** `conditionalLossRate`, `lossLift`, `asymmetry`
  (lift ÷ loss lift), the median outcome and the median worst drawdown. This is not decoration:
  the highest-lift patterns raise the chance of a double *and* of a halving by the same factor.
- **The fast path proves itself against the readable one** on real published series, field by
  field, for every candidate and an interaction. A boolean-only pattern is recorded as
  `NOT_APPLICABLE_NO_THRESHOLD` rather than "stable", because an absent test and a passed test
  must not look alike.
- Wired into `product-intelligence-materialization.yml` with both studies, their tests and their
  summaries in the run log and the retained evidence.

### M5 — VU Pattern Match (`pattern-match-1.0.0`)

- Per title: which of the 249 `ROBUST` patterns its current configuration satisfies, with the
  population statistics for those patterns. 5,569 titles, 1,496 of them without a visible
  filing (published as such, not silently treated as failing the fundamental conditions).
- **Only `ROBUST` findings appear beside an instrument.** A pattern that did not hold out of
  sample would read as evidence about that title. What was withheld is published as counts
  rather than disappearing.
- Every card shows the loss side beside the win side and the tilt ratio. A pattern under which
  titles double more often and halve more often renders as "beide Seiten gleich stark", not as
  a finding.
- A title satisfying none of them gets that as a full answer, not an empty section.
- Product copy is derived from the pre-registration rather than copied out of the study, so the
  wording a reader sees has one home; the materializer throws if a pattern names a candidate
  that has none.
- Largest browser shard 17.8 KB gzipped / 0.17 MiB uncompressed, inside the artifact caps.

### Product Language (`product-language-1.0.0`)

- **Ein Wörterbuch, das die Oberfläche wirklich liest.** 58 Begriffe in sieben Kategorien in
  `quant/methodology/product-language-v1.json`, gelesen über `quant/engines/product-language.js`.
  `docs/VU_QUANT_2_PRODUCT_LANGUAGE.md` wird daraus **erzeugt**; ein Test regeneriert das
  Dokument und vergleicht es. Eine handgepflegte Kopie eines Wörterbuchs ist ein zweites
  Wörterbuch, und zwei Wörterbücher widersprechen sich binnen eines Monats.
- **Fail-closed statt Slug.** Ein fehlender Begriff wirft, statt seine eigene id vor einem
  Leser auszugeben. Lädt die Textquelle nicht, sagen die betroffenen Ansichten das — es werden
  keine Ersatzworte erfunden.
- **Drei parallele Beschriftungslisten sind verschwunden.** `SETUP_LABELS` in `experience.js`,
  die Faktornamen der Strategie-Seite (`momentum: 'Momentum'`) und die Faktorlabel der Engine
  liefen nebeneinander. Jetzt gibt es eine Quelle; ein Test hält Engine und Wörterbuch auf
  demselben Wort, und `quality` heißt überall „Unternehmensqualität".
- **Der Guard ist ein Test, keine Konvention.** Er liest die Primärpositionen aus
  `vu2/experience.js` — h1/h2/h3, Eyebrow, Chip, Badge — und schlägt fehl, sobald einer der 30
  internen Begriffe dort steht. Ein zweiter Test verbietet jeden rohen Enum-Wert als Copy. Die
  Browser-QA prüft dasselbe am gerenderten DOM.
- **Die Lesereihenfolge folgt der Frage, die ein Nutzer stellt**: wie stark → warum → was
  ändert sich → baut sich etwas auf → was spricht dafür und dagegen → wie sah das früher aus →
  welcher Anlagestil passt → wie belastbar ist das alles. Ein Test hält die Reihenfolge fest.
- **Zwei neue Sektionen, kein neuer Motor.** „Was spricht dafür, was dagegen?" sortiert
  ausschließlich, was Faktorevidenz, Veränderungsmessung und Musterabgleich bereits berechnet
  haben, und zeigt nie eine Seite ohne die andere. „Wie belastbar ist die historische Evidenz?"
  benennt Herkunft, Out-of-Sample-Prüfung, Überlebende-Verzerrung und Kursbasis und führt die
  Backtest-Schicht bereits in Einsteigersprache — fünf Größen oben, die Fachwerte eingeklappt,
  ohne eine einzige erfundene Zahl, weil das Gate geschlossen ist.
- **Interne Begriffe bleiben auffindbar.** Sie stehen in der eingeklappten Methodik-Ebene und
  als Beisatz — ein Profi soll `setup-mapping-1.0.0` oder `quantV2.factorEvidence` finden
  können, ein Anfänger soll nicht damit anfangen müssen.

## PRODUCTION_REALITY

Counts measured from the materialized artifact at data cutoff `2026-09-21`, after the
owner-authorized market-data and SEC consumer-export runs.

| Measure | Count/state |
|---|---:|
| Product Universe | 6,875 |
| `FACTOR_EVIDENCE_PUBLISHED` | 6,403 |
| `FACTOR_QUALITY_AVAILABLE` | 2,734 |
| `FACTOR_GROWTH_AVAILABLE` | 3,189 |
| `FACTOR_MOMENTUM_AVAILABLE` | 5,581 |
| `FACTOR_VALUE_AVAILABLE` | 2,003 |
| `FACTOR_PROFITABILITY_AVAILABLE` | 1,188 |
| `FACTOR_REVISIONS_AVAILABLE` | 0 (gate `PIT_ANALYST_CONSENSUS`) |
| `FACTOR_RISK_AVAILABLE` | 5,581 |
| `FACTOR_NOT_APPLICABLE_INDUSTRY` | 967 (banks, insurers, REITs) |
| `WITH_PIT_FUNDAMENTALS` | 5,010 |
| `WITH_MARKET_CAP` | 3,921 |
| `FACTORS_BROADLY_AVAILABLE` | 6 of 7 (Revisions is the exception) |
| `QUANT_V1_STATUS` | LEGACY_IMMUTABLE, field ids unchanged |
| `QUANT_V2_NAMESPACE` | `quantV2.factorEvidence`, 8 fields, no composite field |
| `STRATEGY_MATCH_PROFILES` | 8 (Earnings Revision Leader permanently UNAVAILABLE) |
| `STRATEGY_MATCH_RANKING` | WITHHELD |
| `STRATEGY_MATCH_HISTORICAL_EVIDENCE` | UNAVAILABLE / BACKTEST_NOT_CERTIFIED |
| `SCREENER_METHODOLOGIES` | 2, mixed queries refused |
| `STRATEGY_RULE_SCREENS` | yes — same predicate hash in both directions |
| `WATCHLIST_FACTOR_EVIDENCE` | seven-factor strip per member |
| `SNAPSHOT_HISTORY` | 2 snapshots (`2026-09-18`, `2026-09-21`), immutable, per-methodology |
| `SCORE_MOMENTUM` | closed — the two snapshots are 3 days apart, the window is 30 ± 10 |
| `CHANGE_ENGINE_STATE` | AVAILABLE, 9 of 11 positions measurable for a typical covered title |
| `COMPOSITE_SCORE` | WITHHELD |
| `QUANT_V2_STATUS` | SPECIFIED_NOT_ACTIVE |
| `STRATEGY_RANKING_STATUS` | UNAVAILABLE |
| `SETUP_OBSERVATION_UNIVERSE` | 5,676 observed, 0 without complete evidence |
| `SETUP_CLASSIFICATION` | NO_SETUP 4,017 · WATCH 843 · SETUP_FORMING 800 · CONFIRMED 16 |
| `SETUP_LIFECYCLE_STATUS` | FAIL_CLOSED — `SETUP_MAPPING_NOT_APPROVED` (owner gate) |
| `SETUP_OBSERVATION_HISTORY` | 1 observation (`2026-09-10`), immutable, per mapping version |
| `MARKET_REGIME_STATUS` | FAIL_CLOSED |
| `REVISIONS_STATUS` | BLOCKED_EXTERNAL |
| `RADAR_SIGNALS_CAPABLE_UNIVERSE` (20 EOD) | 5,888 |
| `WATCHLIST_SELECTABLE_UNIVERSE` | 6,875 |
| `WATCHLIST_TECHNICAL_CAPABLE_UNIVERSE` | 5,676 |
| `WATCHLIST_ELLIOTT_CAPABLE_UNIVERSE` | 5,590 |
| `FIVE_SCOPE_REMAINS` | false |
| `DISCOVERY_CHANGED` | false |

## VERIFICATION

### 2026-09-25

- Quant suite 1,687/1,687 and Discover 233/233 locally, after each step rather than at the end.
  New files: `refuted-adjustment-fallback` (19), `stock-chart-basis` (5), `strategy-history` (7),
  `journey-coverage` (3), plus cases in `rejection-lifecycle`, `market-eod-cli`, `setup-engine`,
  `product-services` and `product-language`.
- The adjustment fallback was proven at the running import, not only at its parts: the CLI test
  serves a refuted ex-dividend window over 300 stored bars and asserts the store ends up declared
  `splitAdjustedReconstructible` with the refutation recorded — and the counter-test, with 40 bars,
  asserts the rejection stands and names `HISTORY` as the missing input.
- `TOTAL_RETURN_VALIDATION_UNCHANGED` is asserted by reading `market-quality.js` and finding neither
  the fallback vocabulary nor the decision function in it. A later "helpful" loosening has to edit
  that test, and then it shows in the diff.
- The chart fix carries a numeric proof rather than a caption check: over the five preview series,
  no reconstructed day moves more than 60 %, the last value equals the traded close, and every
  return across a split-free day is identical to 1e-9.
- Served markup at 1440 px and 390 px: the setup section for a WATCH, a SETUP_FORMING and a
  CONFIRMED title (block present, three rules explained, no raw enum in the primary copy); the
  style match for all three of its cases; the pattern denominator on both pages for a title without
  fundamentals; the chart caption for NVDA and AAPL on Max. No page error, no horizontal overflow.
- The local QA harness sent `Content-Encoding: gzip` for `.json.gz` again and every compressed read
  failed again — the exact defect recorded further down this section from an earlier day. Reading
  this file first would have saved the detour.
- Discover rows measured shape-aware: 26 rows, 0 empty, minimum 10 cards. A naive count reports
  `sector-leaders` as empty because its cards sit under `sectors[].cards` — the same class of
  mis-read that produced a false "empty home page" claim earlier, so the earlier note that
  "Discover's self-check accepts empty rows" stands as a latent hardening item and not as a defect.

### Earlier

- Full Quant suite: 1,513/1,513 passed locally (1,501 before, +12 product-language).
  SEC Python suite: 474/474 locally.
- Browser-QA über `quant` (NVDA, JPM, AAPL), `explain`, `strategies`, `watchlist` (mit
  gesetzter Auswahl) und `radar` bei 1440 px und 390 px: kein interner Begriff in einer
  Überschrift, einem Eyebrow, einem Chip oder einem Badge, kein horizontaler Überlauf, keine
  Seitenfehler.
- The shared study runner refactor was verified, not assumed: 1,482 fields across 114 findings
  compared against the pre-refactor run, zero differences. The only intended change was three
  boolean-only patterns moving from "stable" to `NOT_APPLICABLE_NO_THRESHOLD`.
- Public data hygiene guard: passed against the new artifact.
- A harness defect was found and fixed while doing this: the local QA server sent
  `Content-Encoding: gzip` for `.json.gz`, so the browser decompressed transparently and every
  compressed-artifact read failed. Production serves those files as opaque bytes and the page
  decompresses itself. The harness now does the same. Worth recording because the symptom
  looked exactly like a broken Quant page.
- Headless Chromium at 1440 px and 390 px, `quant` (NVDA, JPM, AAPL), `explain` and `screener`:
  one `h1` per page, no horizontal overflow, seven factors in canonical order, change groups
  rendered, setup conditions rendered, eight Strategy Match profiles rendered, the screener
  methodology switch offering only Quant V2 fields and returning Quant V2 rows, no page errors.
- Largest shard: 41 KB gzipped, 0.46 MiB uncompressed — inside the browser artifact caps.
- Production acceptance for this section is not yet claimed: it needs a merged release and a
  Pages deploy of the exact commit.

## OPEN_INPUT_GATES

Machine-readable in `quant/data/product/factor-evidence-v1/summary.json` → `openInputGates`.
Every gate a run can settle by itself is now **measured from that run's coverage**, not
asserted in a hand-written list. Three gates in the previous version of this file
(`CONSUMER_EXPORT_MATERIALIZATION`, `BETA_252D`, `RELATIVE_STRENGTH_12M1M_MATERIALIZATION`)
had already been cleared by the workflow runs and would have kept claiming a blockade that no
longer existed. A stale gate is worse than no gate, because someone acts on it.

| Gate | Blocks | Owner |
|---|---|---|
| `COMPONENT_INPUT_NARROW` | `profitability.roicTtm` (58), `value.ebitdaYield` (83), `value.salesYield` (97), `quality.netDebtToAssets` (462), `profitability.roicMedian3y` (535) | SEC normalization — see below |
| `PIT_ANALYST_CONSENSUS` | `revisions.*` | external licence |
| `INDUSTRY_TEMPLATES_BANKS_INSURERS_REITS` | Quality, Value, Profitability for 967 titles | quant-v2 methodology |
| `FACTOR_SNAPSHOT_HISTORY` | `change.scoreMomentum` | this materializer; two snapshots exist, they need to be ~30 days apart |

No component is fully closed any more. `COMPONENT_INPUT_NOT_MATERIALIZED` is absent from the
artifact because nothing in the contract is at zero coverage.

### What the narrow components actually trace back to — measured

`total_debt`, not the metrics that were just exported. Across the 5,068 consumer files:

| Metric | annual | quarterly | TTM |
|---|---:|---:|---:|
| `operating_income` | 4,021 | 3,213 | 2,969 |
| `pretax_income` | 4,330 | 3,210 | 2,949 |
| `income_tax_expense` | 4,492 | 3,397 | 3,008 |
| `ebitda` | 3,502 | 2,886 | 2,661 |
| `stockholders_equity` | 4,848 | 0 | 0 (balance-sheet instant) |
| **`total_debt`** | **2,645** | **2,182** | **854** |

Of 5,068 issuers, exactly **325** carry all six ROIC inputs at once, and `total_debt` is the
first missing input for **4,214** of the rest — equity for 8, operating income for 484, the tax
pair for 37. The 325 then fall to 58 through period alignment and the positive-invested-capital
check. So `roicTtm` at 58 is not a wiring gap; it is `total_debt` TTM breadth in the SEC
normalization layer, and that is the next real input gate for Profitability and Value.

The cause is one line of the metric registry. `total_debt` maps to exactly two concepts —
`us-gaap:DebtLongtermAndShorttermCombinedAmount` and `ifrs-full:Borrowings` — and the first is
an optional combined disclosure most US filers do not tag. `long_term_debt`, which maps to
three commonly-used concepts, reaches 3,265 issuers.

**This is an owner decision, not a fix to make in passing.** Falling back to `long_term_debt`
would be a silent substitution: long-term debt excludes the current portion and short-term
borrowings, so `total_debt`, `net_debt`, `debt_to_equity` and every factor reading them would
quietly start meaning something else for 726 issuers — the same shape of change the owner
rejected for Quant V1. Widening the concept list properly needs to know which tags issuers
actually use, and that cannot be measured from this checkout: `companyfacts.zip` only exists
inside the SEC workflow.

So the measurement was built instead of the guess. `python3 scripts/quant/cli.py concept-census`
counts, per issuer, which mapped and which unmapped debt concepts the product universe tags,
and writes `quant/data/sec/concept-census.json`. It runs in the SEC workflow off the archive
already in the runner cache, downloads nothing, is `continue-on-error`, and changes no value,
no mapping and no metric. The next scheduled SEC run (Monday 07:30 UTC) produces the numbers;
the mapping decision is then taken against measurement rather than against a plausible guess.

## OWNER_DECISIONS

### 2026-09-24 — Return Semantics

```
RETURN_SEMANTICS_CONTRACT_ACTIVE = PASS
PRICE_MODULES_BASIS              = SPLIT_ADJUSTED_PRICE   (chart, technical, setup, elliott)
PERFORMANCE_MODULES_BASIS        = TOTAL_RETURN           (backtest, portfolio, benchmark)
QUANT_V1                         = LEGACY_IMMUTABLE
QUANT_V2_MOMENTUM_BASIS          = PENDING_METHODOLOGY_DECISION
```

`quant/methodology/return-semantics-v1.json`, enforced by
`quant/tests/return-semantics.test.mjs`. **Nothing published was redefined**: the contract is
enforced where a module names itself, and an unnamed caller keeps computing exactly what it
computed before — changing every caller at once would have been the silent redefinition the
decision forbids.

**What this closes.** `market-factors.priceBasis()` took `adjustedClose` whenever a trustworthy
adjusted column existed and did **not** distinguish split-adjusted from total-return. The
provider reports `splitAdjusted` today, so nothing looked wrong. Raising that capability to
`adjusted` would have switched technical structure, setup states and the momentum factor to
total return with no code change and no published number announcing it. A module now declares
its basis and a series that cannot serve it is refused. Verified in both directions and by
breaking the contract three separate ways — flipping `technical` to total return, deciding
momentum silently, disabling the enforcement — each caught.

**Quant V2 momentum: two unknowns, and neither is guessed.** The future decision is open
(`PENDING_EVIDENCE`). What is published *today* turned out to be **unmeasured**: the factor
artifact recorded the column (`adjustedClose`) and not its content, and `adjustedClose` can be
split-adjusted or total-return adjusted. The only committed price series report `"adjusted"`,
the commercial plan reports `adjustedPrices: true`, and the production bar store lives in R2.
So `currentPublishedBasis` is `UNKNOWN_UNTIL_MEASURED`, asking for the basis **throws** rather
than returning one, and the module is explicitly `boundToContract: false` — binding it would
impose the answer, changing either every momentum figure or none, and which of the two is
precisely what is not yet known. `build-market-factors` now records `adjustmentStatus` and
`returnBasis` per title, which is what makes the question answerable at all.

I had bound it before measuring. The scale-gate tests caught it — the stub provider reports
`adjusted`, so the binding refused and the pipeline stopped, which is the contract working and
the binding being wrong. Withdrawn.

**The evidence gathered for the eventual decision**
(`quant/data/providers/momentum-return-basis-study.json`). Measured over the five series that
carry both columns: every one is higher on total return, and the gap follows the payout —
Spearman ρ = 0.90 between dividend yield and the 12m1m difference; XOM (2.20 % yield) +4.44
percentage points, NVDA (0.18 %) +0.16. **Direction, not magnitude**: momentum is a percentile
among peers, so what decides it is whether the *ranking* moves, and a ranking study needs both
columns across the universe — they exist for 5 of 6,403 titles. The report says so itself
(`canDecideTheFactor: false`) rather than implying a conclusion. Until then the published basis
is unchanged.

**Historical universe membership stays its own certification gap** and is not substituted by
current membership: the backtest's basis being settled does not move it closer to open. A test
asserts that the completeness checker still reports it separately.

### 2026-09-24 — Option C: Kursstärke und Anlegerrendite getrennt (APPROVED, umgesetzt)

```
QUANT_V2_MOMENTUM_RETURN_BASIS = SPLIT_ADJUSTED_PRICE
TOTAL_RETURN_EVIDENCE          = SEPARATE
METHODOLOGY_DECISION           = APPROVED
```

Owner-Entscheidung auf Grundlage der Full-Universe-Studie. Methodik versioniert:
`quant-v2.0.0 → quant-v2.1.0`, `vu-factor-evidence-1.0.0 → 2.0.0`. Die alten Beobachtungen
stehen unverändert unter ihrer eigenen Reihe; die Snapshot-Historie schlüsselt nach
Methodikversion.

| Was | Stand |
|---|---|
| Komponenten umbenannt | `totalReturn12m1m/6m/3m` → `priceReturn*` — ein Name, der etwas anderes behauptet als der Inhalt, war der eigentliche Fehler |
| `distanceTo52wHigh`, `distanceToSma200` | laufen endlich auf der Basis, als die sie immer beschrieben waren |
| Kursreihe | **konstruiert**, nicht ausgewählt: der Anbieter liefert keine splitbereinigte Spalte |
| Ausgelieferte Zeilen | 6.358, davon **6.358** auf `SPLIT_ADJUSTED_PRICE / RECONSTRUCTED_FROM_SPLIT_FACTOR` |
| wegen Return-Basis verworfen | **0** |
| Anlegerrendite | eigene Größe, `isFactorComponent: false` |

**Gemessene Wirkung** (`quant/data/product/methodology-change-v1.json`): Momentum ρ 0,9812,
Median 121 Ränge, P95 603, 1.312 Titel ≥5 Perzentilpunkte, Dezilwechsel 50.
Strategien: `momentum-leader` 163 → 169, `future-leader` 10 → 13, `value-momentum` 119 → 123.

**Die Gegenprobe hat angeschlagen — und das ist der Punkt.** Auch Qualität, Wachstum, Wert,
Profitabilität und Risiko haben sich bewegt. Kein Leck: die Beobachtungen stammen vom 21. und
vom 23., das Universum ging von 6.403 auf 6.358. Perzentile sind relativ. Die sechs nicht
geänderten Faktoren sind der Kontrollversuch — ihr Median liegt bei **2,5 Rängen**, der des
Momentums bei **121** (48-fach). Der Bericht führt das als eigenen Block und verweist auf die
unkonfundierte Messung (beide Basen, selber Stichtag, selbes Universum).

**Frontend.** „Kursstärke" und „Anlegerrendite" nebeneinander, nur für Zeiträume mit beiden
Zahlen. Production Smoke prüft, dass dort **verschiedene** Werte stehen — falsifiziert:
gleiche Werte melden `RETURN_KIND_IDENTISCH` an allen vier Stellen. 30/30 sauber, 1440px und
390px.

### 2026-09-24 — Benchmark-Frische: gemessen, gegated, nicht überspielt

**Warum SPY zurückliegt.** Er steht im Abrufumfang (`resolveScope` nimmt den Benchmark
ausdrücklich auf, 6.876 Titel) und wird jeden Lauf angefragt — und jeden Lauf abgelehnt:
`adjustment_status_contradicted`, Klasse `TEMPORARY_REJECT`, Frist 20 h. Die
Bereinigungsprüfung widerlegt seine deklarierte Stufe, weil eine Dividende nicht in der
bereinigten Spalte ankam. **531 Titel** stehen aus demselben Grund im Register. Diese Prüfung
bleibt unangetastet — sie hat recht, und eine rückwirkende Methodikänderung war ausgeschlossen.

**Der Produktfehler lag woanders.** Die Ausrichtung nahm den letzten Benchmarktag *bis* zum
Stichtag des Titels. Das schützt vor „alter Kurs gegen frischen Index" und ließ die
Gegenrichtung offen: ein Titel bis zum 23. gegen einen Index vom 17. Sechs Tage Marktbewegung
landeten als Vorsprung in jeder Zeile, ohne dass etwas es ansagte.

Jetzt wird der Abstand in **Handelstagen des Titels** gezählt — ein Wochenende ist keine
Veralterung. Über `MAX_BENCHMARK_LAG_SESSIONS = 1` gibt es keine relative Stärke mehr, sondern
`BENCHMARK_STALE` mit Grund und Nutzertext („Vergleich noch nicht möglich"). Das Gate kostet
**nur** die relative Stärke: ein veralteter Index sagt nichts über die Kursentwicklung des
Titels selbst.

Der Faktorbau weist die Frische aus: `lagBehindNewestSessions`,
`securitiesWithoutRelativeStrength`, `state: CURRENT|STALE`. Sieben Regressionstests, darunter
der reale SPY-Fall (vier Sitzungen) und der Grenzfall (eine Sitzung, erlaubt); durch
Falsifikation belegt.

**Offen und benannt:** ob SPY sich über den bestehenden Refresh-Pfad fängt. Solange nicht,
fehlt die relative Stärke universumsweit — 0,20 Gewicht der Momentumnote, das der
Faktorengine innerhalb des Faktors renormalisiert. Sichtbar statt still.

### 2026-09-24 — Full-universe return-basis audit (running)

The owner **stopped** the methodology decision: five Golden-Preview titles are a technical
direction finding, not a basis for the Quant V2 momentum method. The audit measures over the
canonical product universe instead. `QUANT_V2_MOMENTUM_RETURN_BASIS` stays
`PENDING_METHOD_DECISION` throughout, and a test holds that the study does not set it in
passing.

**Built and pushed** (no new pipeline, no new provider, no new R2 API, Discovery untouched —
everything reads the canonical bar store the materialization already restores):

| Piece | What it does |
|---|---|
| `quant/engines/return-series.js` | Builds both series from **one** set of bars. `SPLIT_ADJUSTED_PRICE` is reconstructed backwards from `close` and `splitFactor`, deliberately **not** from the provider's `adjClose` — that column is total-return adjusted and carries exactly what a price series must not. The split jump comes out, the dividend gap stays in. |
| `quant/engines/return-basis-comparison.js` | Ranks, Spearman, shift distribution, decile churn, segment statistics. Compares only the **intersection** of both bases: if A ranked 6,000 titles and B 5,800, the measured difference would be an artifact of coverage, not of method. |
| `scripts/market/study-return-basis-universe.mjs` | Sections 2–9 in one pass over the store. |
| `scripts/quant/render-return-basis-study.mjs` | Section 10. Renders the document from the artifacts and **refuses to write** when the canonical store was absent. |

**Three things the work already established, independent of the run:**

1. **The published Quant V2 momentum basis is no longer unknown.** All **6,403** factor-evidence
   entries carry `priceBasis: "adjustedClose"` — measured across every shard, not sampled. What
   remains to confirm over the universe is that this column is total-return adjusted everywhere
   (proven for five series so far), which the study now checks per title rather than
   extrapolating.
2. **The methodology text and the computation disagree on two components.**
   `momentum:distanceTo52wHigh` and `momentum:distanceToSma200` (0.20 of the momentum factor
   between them) are published as *"split-adjusted close"* and are computed on `adjustedClose`.
   While that column was believed split-adjusted this was invisible. It is not a silent fix —
   it goes into the decision.
3. **No look-ahead in the historical cutoffs.** The strategy simulation mixes published quality,
   growth and risk scores with a simulated momentum. Those scores exist for one date only, so at
   any earlier cutoff the report carries `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME`
   instead of a number. Proven by falsification: forcing the contemporaneity flag true fails the
   test.

**Pending the materialization run**: `CANONICAL_HISTORY_UNIVERSE`,
`RETURN_BASIS_IDENTIFIABLE_UNIVERSE`, `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE`, every rank
correlation, both bias tables, the strategy impact and `METHODOLOGY_DECISION_READY`. A local run
sees five titles and says so in its own report (`scope: "REPOSITORY_ONLY"`); it is not a universe
audit and is not read as one.

### 2026-09-23 — `total_debt` = OPTION_B

```
TOTAL_DEBT_METHOD          = OPTION_B
LONG_TERM_DEBT_FALLBACK    = false
FINANCE_LEASE_SILENT_MERGE = false
```

Machine-readable in `quant/methodology/fundamentals-debt-v1.json` (`gateStatus`), enforced by
`quant/tests/fundamentals-debt-contract.test.mjs`. Option B was already the code's behaviour;
what was missing was a written, versioned, machine-checked decision. Without one a later
registry edit drifts the metric into a different meaning under the same name, and nobody
notices, because the name does not change. The test reads the registry and `derived.py`
directly and was verified against both forbidden edits — adding `us-gaap:LongTermDebt` to
`total_debt`, and adding a finance lease concept to `short_term_debt` — each of which fails it.

Each prohibition carries its measured price, so it can be revisited against evidence rather
than re-argued: refusing the long-term substitution costs 527 issuers; requiring finance leases
would cost 1,648.

Finance leases stay `NOT_MODELLED` (measured reach 1,753) — the owner permitted a separately
named metric, did not commission one. The 1,692 issuers with no debt concept at all are
recorded as an open measurement with `blocksProduct: false`.

### 2026-09-23 — Setup State V1

Already in place from the previous section and re-verified against the owner's wording, not
re-applied: `SETUP_MAPPING_V1_APPROVED = PASS`, `SNAPSHOT_STATES_ACTIVE = PASS`,
`PATH_DEPENDENT_STATES_ACTIVE = false`, `PATH_DEPENDENT_STATES_GATE = PENDING_HISTORY`;
`approval.state = APPROVED`, owner `info@visionuniverse.de`, `2026-09-23`; the seven named
checks are the ones the activation gate measures.


- GitHub/main, reviewed release artifacts and Production are the source of truth; chat history is not.
- Discovery is a separate product and remains a hard no-change gate.
- No second data pipeline, Fundamentals layer, Tiingo integration, realtime infrastructure,
  public R2 API or market-data architecture.
- A title receives intelligence by canonical identity and explicit capabilities, never by
  Legacy-Five membership.
- Browsers consume bounded materialized Product Data.
- Quant V2 composite, Revisions, Market Regime, Strategy ranking, SetupState activation and
  Backtesting stay fail-closed until their own contracts are certified.
- Per-factor evidence under an independently versioned contract is explicitly **not** the Quant V2
  composite and does not open that gate.
- Market Regime methodology remains an Owner gate; implementation must not invent thresholds.

## KNOWN_BLOCKERS

### Reported 2026-09-25, deliberately not acted on

- **`assessSeries` can never raise the contradiction it checks for.** It passes
  `payload.adjustmentStatus` straight into `validateAdjustmentConsistency` as `claimedStatus`, but
  the rank table there is keyed on the canonical levels. The store always carries the provider
  token, so `RANG["adjusted"]` is `undefined`, the guard skips, and only the warning survives.
  Reproduced exactly: the same refuted ex-dividend window returns
  `warning:dividend_not_in_adjusted` under `"adjusted"` and additionally
  `error:adjustment_status_contradicted` under `"TOTAL_RETURN"`. The consequence is that the
  series-level assessment `build-market-factors` uses to skip FAIL titles is blind to this class.
  Not fixed here, and the reason is the blast radius rather than caution: normalizing would turn an
  unknown number of titles into FAIL and strip their factors, and the store is runner-private, so
  the size of that wave cannot be measured from this environment. The safe order is to measure the
  wave in a workflow run first and only then enable the normalization. After the fallback landed the
  class is smaller anyway: a refuted dividend adjustment now stores as
  `splitAdjustedReconstructible`, for which the check correctly finds no contradiction.
- **The Discover self-check accepts an empty row.** Latent, not current: measured shape-aware,
  26 rows, none empty, minimum 10 cards. Worth hardening, and worth hardening carefully - a naive
  count reports `sector-leaders` as empty because its cards sit under `sectors[].cards`, and that
  same mis-read once produced a false "empty home page" claim in this file.
- **SPY remains a single point of failure for the universe's relative strength.** The structural
  dependency on the total-return check is gone, and the freshness gate now withholds rather than
  publishing a false lead. What is unchanged: one series decides whether 6,358 titles get a
  relative-strength component at all. A second benchmark would be a methodology decision (which
  index, and how a title is assigned to it), not a build task.

- Market Regime: no certified versioned method with exact thresholds, minimum breadth, state
  transitions/hysteresis, missing-data behaviour, benchmark/calendar rules.
- Revisions: no licensed, immutable historical PIT analyst-consensus source.
- **Backtesting (M6): blocked, and this time the blockade was measured rather than inherited.**
  Two of the required inputs do not exist in this repository at all:
  - ~~**No total-return series.**~~ **This half was wrong and is corrected.** The published
    product series are `SPLIT_ADJUSTED`, which is true — but "no total-return series exists"
    was not. `quant/data/providers/qualification.json` carried `"Nicht geprueft."` for both
    `dividends` and `totalReturnPrices`, so the capability stood at UNKNOWN, so the adapter
    nulled `adjustedClose`, so the pipeline only ever published a split-adjusted basis. The
    question had never been asked. Every bar carries `splitFactor` and `dividend` precisely so
    it can be settled from evidence, and the adapter says so itself.
    Measured (`scripts/market/verify-total-return-capability.mjs`): on an ex-dividend day the
    ratio `adjClose/close` must step by exactly `1 − dividend/previousClose` if the series is
    total-return adjusted, and stay flat if it is split-only. **234 of 234 dividend events
    across five series, 2015–2026, match — worst relative error 0.051 %.** Verdict:
    `TOTAL_RETURN_CONFIRMED`. A dividend-adjusted basis is therefore *obtainable*; switching the
    published basis changes every momentum and drawdown figure the product shows, so that is a
    versioned decision, **not a missing input**. It no longer counts against M6.
  - **No point-in-time universe.** `quant/data/market/index-membership/history/{DJIA,NDX,SP500}/`
    each hold **exactly one** file (`2026-09-15.json`; 498 members for SP500). A backtest over a
    single membership snapshot applies today's constituents to the whole past — the textbook
    survivorship and look-ahead error §40 forbids.
  Corporate actions, benchmark and execution methodology remain uncertified on top of that.
  A backtest built on this basis would be exactly the "falsche Backtests" the hard-safety rule
  names, so M6 stays shut on evidence, not on caution.
- ~~**Pattern Research (M4)**: needs deep canonical history from private R2.~~ **This entry was
  wrong and is corrected.** It reasoned from the 270-bar technical bundles and never checked
  what else the repository holds. `quant/data/market/discover-series-long/` carries **6,308
  titles of weekly split-adjusted closes at MAX range** — 618 of them starting in 1990, an
  average of 763 weekly points (about 14.7 years) and up to 1,915 (about 36.8 years). That is
  the Discovery workstream's canonical output, committed and read-only here. M4 needed no R2
  restore and no credentials; it needed someone to measure what was already there. Built this
  section.
- `GLMD` is the only canonical Product Universe member without a restored history object.
- Direct custom-domain reads remain blocked in this orchestration environment; production
  acceptance uses the exact Pages artifact, deploy job and CI probes.

## NEXT_DEPENDENCY_CORRECT_STEP

−1. **Die Ablage muss einmal nachgezogen werden, und das ist der naechste Schritt.** Der Push ist
   verdrahtet (`market-data-refresh.yml`, nach Gate B) und als Hebel dispatchbar
   (`history-store-sync.yml`) — aber `workflow_dispatch` greift erst, wenn die Datei auf dem
   Default-Branch liegt, und der Zeitplan des Refresh laeuft ebenfalls nur dort. Bis dahin
   bleibt die Kursstruktur des Produkts auf dem 2026-09-10, und die Aktienseite sagt das.
   Zwei Wege, beide ohne Owner-Entscheidung:
   (a) `market-data-refresh.yml` auf diesem Branch dispatchen — es ist dort dispatchbar, weil es
   auf `main` existiert, und laeuft mit der Branch-Fassung samt Push. Kostet einen zusaetzlichen
   inkrementellen Abruf (eigenes Anfragebudget, Waechter faellt zu).
   (b) Nach dem Merge laeuft der Zeitplan mit dem Push von selbst.
   Danach eine Materialisierung, und die zehn Handelstage sind weg — mitsamt dem zweiten
   Setup-Beobachtungsstichtag, an dem der Pfad-Tier haengt.

0. **One owner gate is open** and it does not block the next build: the `total_debt` concept
   mapping, which waits on the measurement the SEC workflow now produces.
1. **`setup-mapping-1.0.0` was approved on 2026-09-23** for the point-in-time tier; the four
   course-of-events states sit behind `PATH_DEPENDENT_STATES_ACTIVATION`, which opens only when
   its seven measured checks pass **and** the owner flips the contract. Nothing here waits on a
   person: the checks resolve as observations accumulate.
2. **Let both histories accumulate.** The factor snapshot series has `2026-09-18` and
   `2026-09-21`; `change.scoreMomentum` opens when one sits ~30 days back. The setup
   observation series has `2026-09-10`; the path tier (ACTIVE, RISK_RISING, INVALIDATED, EXIT)
   opens on the second one. Both append by themselves on each materialization run — there is
   nothing to build.
3. **`total_debt` is measured and lies with the owner.** The earlier entry here was wrong twice
   over and is corrected: there is no silent substitution to undo — `derived.py` already
   reconstructs `total_debt = long_term_debt + short_term_debt` with a per-row `derived` flag —
   and the concept census (5,148 issuers, `census_logic 1.1.0`, registry mapping `1.5.0`) shows
   there is **no composition that materially widens the metric without changing what it means**:

   | Option | Coverage | Δ | |
   |---|---:|---:|---|
   | A combined amount only | 864 | −2,065 | not the current state |
   | **B combined, else LT+ST** | **2,929** | — | **the current state** |
   | C long-term alone | 3,456 | +527 | a DIFFERENT metric under the same name |
   | D B and finance leases | 1,281 | −1,648 | requiring leases COSTS coverage |
   | E B, else leases alone | 3,401 | +472 | semantically weakest |

   Refusing the forbidden substitution C costs exactly 527 issuers — a measured price, not a
   guess. The five highest-coverage unmapped concepts are maturity schedules, cash-flow items
   and per-instrument disclosures: more reach than today's mapping and none of them a balance
   sheet total. Full write-up: `docs/VU_QUANT_2_TOTAL_DEBT_CENSUS.md`.

   1,692 issuers tag no long-term debt concept at all. That cohort is not only financials —
   Lumen Technologies and MasTec carry no debt metric in the export either. Which concepts that
   cohort does use is the one open measurement, and it is not blocking.
4. **Setup screening (M9) is built** — the point-in-time rules now answer both directions of
   the same question. Next in the same §20 direction and needing no new data: the same
   assignment as a watchlist filter and as an alert predicate, since a state change on a
   `predicateHash` is already what the alert contract describes.
5. **M6 (Backtest) is shut on measured grounds** (see KNOWN_BLOCKERS) and is not the next step.
   **One** input would have to be acquired first: a historical index-membership series. The
   second half of this entry — "no total-return series" — was wrong and is struck in
   KNOWN_BLOCKERS: the basis is obtainable and now verified over the universe, not over five
   titles. Acquiring a membership history is not a build task.
6. Market Regime stays on the Owner gate.

## RESUME_STATE

1. Re-read this file and current GitHub/main. Measure, do not assume the counts above.
2. Do not rebuild Technical/Signals/Elliott materialization, canonical history, the factor
   evidence artifact's inputs, or the serving architecture.
3. `vu-factor-evidence-1.0.0` is a published contract. Changing a formula means a new version,
   not a silent reinterpretation.
4. Keep `QUANT_V2_STATUS = SPECIFIED_NOT_ACTIVE`, composite WITHHELD, Revisions fail-closed,
   Market Regime fail-closed, Strategy ranking unavailable, Backtesting closed.
5. Preserve `DISCOVERY_CHANGED = false` and `DISCOVERY_REGRESSION = false`.
