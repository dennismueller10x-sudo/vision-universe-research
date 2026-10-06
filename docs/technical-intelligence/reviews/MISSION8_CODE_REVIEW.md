# Adversarial code review: Mission VIII HSAB (Stage 1 replay, Stage 2 evaluate, CI)

Branch `claude/vision-universe-mission-viii-7hjwma`. No repository files were modified.
Experiments ran in the scratchpad: `mini/` (6-series replay, `--perbar 3`), `mini-eval.json`, `daily-prefix.mjs`, `dpcausal.mjs`, `relab.mjs` and `stepq.mjs`.

## Findings

### HIGH-1: Display rounding depends on the split-adjusted price level. Records at t depend on future splits, and the rounding systematically favours PSS
- **Where:** `quant/engines/technical/ti/scenario.js:133-143` and `:209` (`priceStep`, `down`, `up`). These consume split-adjusted series from `scripts/technical/lib/ti-data.mjs:22-38`, and `replay-core.mjs:121` freezes the result.
- **Description:** `priceStep()` uses absolute price bands (<1 → 0.01, <10 → 0.05, …). Zones are rounded outward and the invalidation is rounded away from price. On a split-adjusted history, the price at t is the actual price divided by all splits after t. So both the size of the rounding step and the level the customer actually saw depend on future corporate actions.
  - Experiment (`daily-prefix.mjs`, golden NVDA): the record from a series truncated at t differs from the record from the full series, and the difference is not just a scale factor. Example: 2017-03-17, inv/px is 0.90505 (full series) against 0.90978 (truncated). For JPM, which has no later split, all 4 checkpoints were bit-identical.
  - The rounding direction is always favourable. For a bullish scenario, T1 near edge = `down(zoneLow)`, which pulls the target closer, and inv = `down(inv)`, which pushes the invalidation further away. A bearish scenario mirrors this. Both effects raise PSS.
  - Size (`stepq.mjs`, mini replay): `priceStep/ATR` has a median of 0.13 and a 90th percentile of 0.33. 17 % of directional records have a step above 0.25 ATR.
  - Old, heavily split-adjusted histories (AAPL in the 1990s at about $0.2: step 0.01 is 5 % of price) get much more generous geometry than the customer saw.
- **Failure scenario:** absolute PSS, TRIVIAL_TARGET counts, and the `era`, `historyLength` and `year` segments are inflated or confounded for names that split later. Section 8 of the methodology doc says the geometry change is only "scaling (prozentuale Geometrie unveraendert)", which is false. Lifts against B/C/D/E are mostly unaffected, because the rounded geometry is transferred in ATR units.
- **Fix:** In the replay, call the scenario engine with a "no display rounding" config, or round against the as-of-t unadjusted price (cumulative split factor after t from `return-series.js#splitFactors`, ADR-002). Report PSS both ways. Correct methodology section 8.

### HIGH-2: The relabel window includes the resolution bar, so invalidations are counted as relabels before resolution
- **Where:** `scripts/technical/hsab/evaluate.mjs:130`, `if (act && r.i <= act.end)`, with `act.end = r.i + o.bars` at `:146`.
- **Description:** The lifecycle check also covers the record at the resolution bar k. On an INVALIDATED event, the product at bar k has already seen the closing break, so it drops or flips the scenario, and this is flagged as `DIR_CHANGE` "before resolution".
- **Evidence (`relab.mjs`, per-bar mini sample):** 12 of 30 relabels happen exactly at the resolution bar, and all 12 are INVALIDATED events. Relabels hit 22 of 36 INVALIDATED events but only 4 of 42 TARGET1 events.
- **Failure scenario:** the outputs `successIfStable` (0.64) and `successIfRelabelled` (0.13), the `relabelPerBar` columns in the clarity and coverage tables, and `medianBarsToRelabel` all mechanically show "stable scenarios succeed". This makes the product's stability look predictive when it is an artefact.
- **Fix:** Evaluate the lifecycle on `r.i < act.end`, and use `r.i < act.t + o.bars` for relabel and shift detection. Keep `<= end` only for the non-overlap block.

### HIGH-3: The holdout "once only" and preregistration guards are tautological or bypassable
- **Where:** `.github/workflows/technical-intelligence-mission8.yml:61-65, 99-105, 138-142, 175-179`; `evaluate.mjs:187-193, 471`.
- **Problems:**
  1. CI computes `sha256sum` of the preregistration file in the same checkout and passes it as `--open-holdout`. The hash check therefore always passes. The preregistration can be edited, or created in the same commit that flips `protocol.status` to PREREGISTERED and carries `[hsab-holdout]`. Nothing enforces that the preregistration came first.
  2. "Once only" means only that `$OUT/*-holdout-eval.json` exists on the checked-out branch. A push with the marker to any other `claude/**` branch, for example one cut from `main` before the bot commit was merged, opens the holdout again. Deleting the file also reopens it.
  3. `evaluate.mjs` prints PSS, base and lift to the job log (`:480`) before the hygiene check and the commit. If the hygiene check, `assert-public-data-hygiene` or `push-with-retry` fails, the result has been seen but not recorded, and the guard allows a re-run.
  4. `--protocol` accepts any file (`:471`). A local copy with `status: "PREREGISTERED"` or `DEV_FROZEN` (or without the bucket) opens W_VAL immediately. With `preregistration.file` pointing at any repository file whose hash you compute yourself, it also opens the holdouts. I did this to run W_DEV with no bucket. Only `protocolSha256` in the output reveals it after the fact.
  5. `W_UNION` contains `DELISTED_W` and requires only PREREGISTERED, with no once-only check. That is a second, unguarded look at the delisted holdout.
  6. The holdout run re-replays from R2. It does not compare its seal (`sealHash`, `engine.files`, `symbols.sha256`, `dirtyEngineFiles`) with the dev-mode Stage 1 seal that was already published, or with hashes in the preregistration. Engine or data drift between preregistration and the opening goes undetected. `evaluate.mjs` never checks `man.engine`.
  7. Test HSAB-S1 (third assertion) accepts `ENOENT`, so the hash-mismatch branch is not tested.
- **Fix:**
  - Store the expected preregistration SHA-256 (plus hashes of `protocol.json`, `evaluate.mjs`, `lib/*` and the engine files) in a committed lock file before the holdout commit. Have CI verify against that file instead of recomputing.
  - Require the lock commit to be an ancestor that is at least N hours older than the opening commit.
  - Keep a holdout ledger on `main` (or as a repository variable or artifact) and check it, not a per-branch file.
  - Write the result to a file before printing anything, and do not print metrics.
  - Ignore `--protocol` for phases that have `requires`.
  - Give W_UNION the same once-only guard.
  - Compare the replay seal with the preregistered seal and data-snapshot hash.

### HIGH-4: The persistence sample is structurally empty (`--perbar 20 --persist 40`)
- **Where:** `scripts/technical/hsab/replay.mjs:60-61, 75` (`persist && !perBar`); CI line 98; the background run uses the same flags.
- **Description:** `h % 40 === 0` implies `h % 20 === 0`, so every persist-sampled symbol is also per-bar, and per-bar symbols are excluded from the check. `checks` stays empty and `manifest.persistenceCheck` is `null`.
- **Failure scenario:** The main run computes records without state (`elliottPrevious = null`). The product uses a 52-bar Elliott chain. The only measurement of how far the replay deviates from the product (methodology section 2) silently never runs. The evidence would claim "what the customer saw" without the stated check.
- **Fix:** Use independent hashes for the two samples (for example `symHash("persist|"+s)`), or `h % persist === k` with k not divisible by the per-bar modulus. Assert `persistenceCheck.n > 0` whenever `--persist` is set.

### MEDIUM-5: Events without controls count toward the rate but not the base; the base is draw-weighted
- **Where:** `evaluate.mjs:269` (`rowsD` keeps `x[ctl]` when it is `[0,0]`, which is truthy), `:88` (`draw`), `:93-98` (`[0,0]` for thin cells), `:156-163`.
- **Description:** `rate = Σy / n_events` covers all events. `base = Σhits / Σdraws` covers only the events that got at least one resolved draw, weighted by the number of draws.
  - In the mini run, D coverage was 0.80 and E coverage 0.13.
  - In the full run, E (trend × ATR-tercile cells) and late-sample dates are most affected. Near the data end, controls are censored while fast-resolving events stay, so the events without a base are exactly the quick resolutions.
- **Failure scenario:** the lift compares different populations. The direction is data-dependent, and it is invisible except through `controlCoverage`.
- **Fix:** Compute the lift only on events with `cd > 0`. Better, use the per-event control mean `ch/cd` (equal weight per event) and report `n` with and without controls. Never mix.

### MEDIUM-6: Censoring at the end of the sample conditions on fast resolution (events and B/C are asymmetric)
- **Where:** `structural-outcomes.cjs:65-66`; `evaluate.mjs:146, 228`.
- **Description:** Events whose horizon runs past the last bar enter the main PSS only if they resolved early. TIMEOUT failures are impossible for them. D and E controls on the same date are censored in the same way, so that part is symmetric. B and C draw mostly from the middle of the history, where TIMEOUTs exist, so they are not. The mixed data end in the daily holdout (to 2026-09-30, H = 126) affects about 5 % of events. For the delisted cohort, censoring at delisting is informative.
- **Fix:** In the main metric, exclude administratively censored windows (`t + H > lastDate` of the panel), whatever the outcome, for events and all controls alike. Keep the current rule as a sensitivity. For delisted series, report "delisted within H" as its own outcome.

### MEDIUM-7: The ablation and attribution tables have no paired inference
- **Where:** `evaluate.mjs:364-365`, with events built per variant at `:225`.
- **Description:** Each variant builds its own non-overlapping event set and its own D draws from the shared RNG stream. `T.ablation[v].lift` values are reported side by side, but a difference between FULL and a variant has no confidence interval, and the event sets differ (selection differs by variant). The variant draws also shift FULL's D/B/C/E draws: FULL is drawn first per symbol, but the stream advances across symbols, so changing the variant list changes every control.
- **Fix:**
  - Run a paired analysis on common detection points: score each point with both geometries, take a joint bootstrap of ΔPSS and Δlift, and use the existing `pairedDiff`.
  - Seed the control RNG per event and variant (`seedOf(phase|s|i|v)`) so FULL controls do not depend on the variant list.

### MEDIUM-8: The product's TRIVIAL_TARGET and ALREADY_INVALID scenarios are removed from the PSS denominator
- **Where:** `evaluate.mjs:145, 268`.
- **Description:** If the product names a "Target 1" that is already reached, or shows an already-invalidated primary scenario, the customer received a useless or false statement. Both are excluded from PSS. Coverage still counts the point as "spoken" (`:279`). The mini sample had 14 of 126 events TRIVIAL (11 %). This is disclosed, but the headline PSS is flattering.
- **Fix:** Add a preregistered "customer-view" sensitivity that counts TRIVIAL and ALREADY_INVALID as failures, or as non-actionable in coverage. Show the share next to the headline.

### MEDIUM-9: The weighted analysis points mix stateless and chained Elliott records
- **Where:** `replay.mjs:59-73`.
- **Description:** Per-bar symbols (5 %) use an Elliott chain that runs without limit from their first bar. Every other symbol is stateless. Events and segments (`ELLIOTT_SPEAKS`, `T.elliott.*`, clarity) pool both methodologies. The per-bar chain also differs from the product's 52-bar warm-up.
- **Fix:** Either report per-bar symbols separately, or emit both a stateless and a chained record for them and use the stateless one for pooled tables.

### MEDIUM-10: The DEV evaluation touches holdout-period prices (B/C controls); DEV symbols are a subset of the holdout symbols
- **Where:** `evaluate.mjs:91-92` (B: whole history; C: ±504 days); CI line 166 (`--sample-symbols 600`) against line 173 (`1200`); `replay.mjs:48`.
- **Description:**
  - In `D_DEV` (events up to 2016-06-30), B controls draw times from the whole canonical history, including the 2017–2026 holdout window. C controls can reach 2018. Base rates partly built on holdout-period outcomes are published in `d-dev-eval.json`.
  - The sampling order is deterministic (`symHash("sample|"+s)`), so the 600 DEV symbols are exactly the first 600 of the 1200 holdout symbols. The daily holdout is only a time split for the same names (also already seen weekly).
- **Fix:** Clamp B and C to the phase window plus H. Declare the symbol overlap in the preregistration, or draw the holdout sample disjoint from DEV.

### MEDIUM-11: The bootstrap falls back to one-way clustering with few symbols; quarter blocks are shorter than the horizon
- **Where:** `scripts/technical/lib/validation-stats.cjs:504-506`; `evaluate.mjs:154`.
- **Description:**
  - When S < 10 (small segments, `top10`, sector rows, the 3-symbol mini run where `ciBy` was `TIME`), the SYMBOL scheme is unusable and the "widest" CI silently ignores symbol dependence. `minN.segment` = 300 events does not guarantee 10 symbols.
  - H = 26 weeks or 126 days spans 2–3 quarters, so neighbouring quarter clusters share outcome windows, and TIME and TWO_WAY understate the variance. The methodology says quarter clusters "absorb overlapping horizons".
- **Fix:** Suppress a row if S < minClusters or T < minClusters. Use HALF or YEAR blocks, or block length ≥ H, for the time dimension.

### MEDIUM-12: The documented multiplicity corrections (Holm, BH) are not implemented
- **Where:** methodology section 7 against `evaluate.mjs`. `VS.bhAdjust` is exported but never called.
- **Description:** Dozens of segments, families, Elliott groups and tiers report raw `p` values. Many will show "significant" lifts by chance.
- **Fix:** Apply Holm to the preregistered secondary family and BH-q to every exploratory table before publishing.

### MEDIUM-13: There is no check that the Stage 2 panel is the same data that Stage 1 saw
- **Where:** `evaluate.mjs:198, 222-225`; `panel.mjs:177-204`.
- **Description:**
  - Records carry an index `r.i` and absolute levels. Stage 2 reloads `--weekly-dir` or `--work-dir` and indexes by position, but never checks that `e.dates[r.i] === r.d` or that `e.close[r.i] ≈ r.px`.
  - A `git pull` of `discover-series-long`, a vendor history revision, or a new split re-adjustment between Stage 1 and Stage 2 makes the frozen levels inconsistent with the panel. This silently corrupts outcomes and can even produce look-ahead-like effects.
  - In my run alignment was perfect (0 of 2111 mismatches), but nothing enforces it. The seal covers the records, not the price inputs.
- **Fix:** In Stage 2, assert date and price alignment per record. Drop and count the symbol on a mismatch. Put a per-symbol input hash (last date plus SHA of the closes) into the manifest and verify it.

### MEDIUM-14: Pivot-confirmation timing is not matched by any control
- **Where:** `evaluate.mjs:91-98`; methodology section 5.
- **Description:** Events occur only at scale-2 pivot confirmations. That is a price-selected moment, right after a confirmed swing reversal, with its own short-term drift and volatility profile. B/C/D/E are random times or random symbols on the same date, so the lift partly measures "pivot-confirmation timing" rather than the VU method. The simple models are tested at the same points only on the barrier and direction metrics, not on PSS.
- **Fix:** Add a control F: other symbols' scale-2 confirmations within ±k bars of the same date and the same swing direction, with the same ATR geometry. Also evaluate PSS for the simple models with their own (or the transferred) geometry at the same points.

### LOW-15: The public-artifact check is shallow
- **Where:** `scripts/technical/hsab/publish-ci.mjs:13-15`.
- **Description:**
  - It is not recursive and only covers `.json`. A `.jsonl`, `.csv`, `.md` or gz file, or a subfolder, passes.
  - The key list misses `price`, `atr`, `zoneLow`/`zoneHigh`, `adjustedClose`, `tr`, `level`, `center` and `ret`, and does not inspect numeric arrays at all.
  - It also gives false positives on harmless short keys (`c`, `e`). If an eval file trips it during a holdout run, see HIGH-3 point 3.
- **Fix:**
  - Walk the directory recursively.
  - Allow-list the file names and top-level schemas, for example `*-stage1.json` and `*-eval.json` with `schemaVersion`.
  - Validate the eval schema rather than grep for keys.

### LOW-16: Events are not filtered by `eligible()`, but controls and analysis points are
- **Where:** `evaluate.mjs:139-146` against `:82, 253`.
- **Description:** Events on stale bars (`r.stale`; audit-records counts them) are scored, while stale candidates are excluded from controls. `coverageOfPoints` uses only eligible points, so its denominator differs from the events.
- **Fix:** Apply the same `eligible()` check to events, or report the stale events separately.

### LOW-17: The `historyLength` segment labels are wrong for daily data
- **Where:** `evaluate.mjs:402`.
- **Description:** The thresholds 260/520/1040 bars mean 5/10/20 years only for weekly data. For daily data "<5y" can never occur (minBars = 520), and "5-10y" actually means 2–4 years.
- **Fix:** Scale the thresholds by `prof.year`.

### LOW-18: Control geometry drops high-volatility candidates
- **Where:** `structural-outcomes.cjs:112`.
- **Description:** If `inv <= 0` (bullish) or `t1 <= 0` (bearish), the candidate is dropped. For wide-geometry events this removes high-ATR% stocks from D, E, B and C, which selects calmer controls.
- **Fix:** Count the drops, and report them by ATR% tercile.

### LOW-19: Minor items
- `replay.mjs:98-102`: one engine exception or REBUILD_MISMATCH drops the whole symbol, including records before the failure. Only the count is published. Log the date and continue, or report the dropped symbols by cohort.
- `sealHash` (`replay.mjs:186`) does not cover `args`, `bucket`, `sampleSymbols`, `delisted` or `commit`.
- `directionAgeAtDisplay` (`evaluate.mjs:413`) is causal, but its unit differs between per-bar symbols (bars) and dp-only symbols (gaps between detections). Runs started with `--from` (D_HOLDOUT) have no earlier records, so they show "NEW".
- The lifecycle in `D_DEV` is truncated at the replay `--to`, so relabels of late events are undercounted.
- The `sector` segment uses today's SIC taxonomy (disclosed).
- `elliottPSC` (`evaluate.mjs:453-461`) builds the geometry from the rounded `r.px`/`r.atr` (r4). For sub-cent split-adjusted prices this distorts or zeroes ATR. Use `e.close` and `e.atr`.
- `T.secondary.target2` is P(T1 first and T2 before inv), not conditional on T1. Label it that way.
- `mfeAtr`/`maeAtr` are truncated at resolution, so the medians mix different window lengths.
- Tests leave `/tmp/hsab-*` directories behind (`mkdtempSync` without cleanup).

## Verified as correct
- **Detection points are causal.** `dpcausal.mjs` compared full-series scale-2 confirmations with confirmations from a series truncated at t, at 1,294 dates (AAPL, JPM, A weekly). There were 0 differences in either direction.
- **Daily causality holds without later splits.** The JPM daily prefix identity was bit-identical at 4 detection points, including the HTF path: `completedWeek` always uses the previous completed week because `closedLast` is never set, which is conservative. The failures with later splits are covered in HIGH-1.
- `node --test quant/tests/hsab-mission8.test.mjs`: 12 of 12 pass (C1 prefix identity, C2 poisoned future, C3 FULL rebuild, seals, outcome rules).
- **The outcome function is correct:**
  - The horizon is bars t+1 … t+H inclusive, and TIMEOUT applies only if t+H ≤ n−1, otherwise CENSORED.
  - The target is a touch on the near edge of the zone and the invalidation is a close.
  - Same-bar AMBIGUOUS counts as a failure for events and controls alike.
  - The bearish mirror is right: T1 near edge = `t1Hi`, `lo <= t1`, invalidation `c > inv`.
  - On weekly O=H=L=C data everything reduces to the close.
  - The T2 search starts on the T1 bar and is bounded by H.
  - `confirmed` is evaluated only up to resolution.
  - The barrier is symmetric and counts a timeout as 0 in both events and the pool rate.
- **ATR-geometry transfer** (`atrGeometry` and `applyAtrGeometry`) is consistent in raw-ATR units for events and controls. Panel ATR equals the record ATR: 0 of 2,111 mismatches; dates and closes also align.
- **VFIELDS order** `[dir,tpl,inv,t1,t2,e,o,a]` matches `VF` in `evaluate.mjs`. `Sc.build` deep-merges `familyWeights` and `entry`, so variant overrides do not wipe the defaults.
- **Non-overlap:** a new event starts only at a dp strictly after the resolution bar. CENSORED blocks the rest of the series. TRIVIAL and ALREADY_INVALID do not block.
- **D and E exclude the event's own symbol.** The tercile is per date over eligible pool symbols at that date, which is causal. E matches on the event's own `trend[t]` and `atrPct[t]`. Pool rates are per date.
- **The simple models are causal:** MA_TREND uses SMA ≤ t, MOM52, BREAKOUT and PULLBACK use bars < t, and the stale flag uses the flat run up to t.
- **`directionAgeAtDisplay` uses only earlier records. `marketRegime` uses SPY ≤ date.** `liquidity` is the median of the past 20 days of raw dollar volume (≤ t).
- **Statistics:**
  - Lift is a ratio of sums inside the cluster bootstrap, so control sampling variance is included.
  - `pairedDiff` is a difference of means on the same rows.
  - TWO_WAY uses the CGM formula `sS²+sT²−sC²`, floored at the larger of the two one-way variances.
- **CI basics:**
  - S3 secrets are set only as env vars on the S3 steps.
  - The commit message reaches the gate only via env (no injection).
  - Replay and price data stay in `$RUNNER_TEMP`.
  - `git add` is limited to `historical-accuracy/ci`.
  - `publish-ci` publishes only counts and per-year aggregates, and drops the `persistenceCheck.rows` and survivorship `rows`.
  - Checkout uses `ref: ${{ github.ref }}`, pushes go through `push-with-retry.sh`, and the concurrency group includes `-${{ github.ref_name }}`.
  - The mini eval output passes `--check`.

---

## Disposition (Mission VIII, vor jeder Holdout-Öffnung)

| # | Befund | Status | Umsetzung |
|---|---|---|---|
| H1 | Anzeigerundung auf split-bereinigten Kursen (späte Splits) begünstigt PSS | OFFENGELEGT + SENSITIVITÄT | Engine eingefroren (keine Modelländerung in dieser Mission). Lift ist über ATR-Geometrie geschützt; Sensitivität „ohne Rundungsschritt > 0,25 ATR“, Segment `roundingStepAtr`; Methodik §8 korrigiert |
| H2 | Invalidation als Umdeutung gezählt | BEHOBEN | Umdeutung nur `r.i < end` |
| H3 | Holdout-Schutz umgehbar | BEHOBEN (soweit technisch möglich) | Repository-Protokoll erzwungen; `preregistration.sha256` + `freeze.engineFiles`; CI: Präregistrierung im Eltern-Commit, Öffnungs-Commit ohne Code-/Protokolländerung; kein Ergebnis im Log; W_UNION entfernt; Test ohne ENOENT-Ausweg. Branch-übergreifendes „nur einmal“ bleibt Verfahrensregel |
| H4 | Persistenzprüfung lief nie | BEHOBEN | eigener Hash-Strom; separater Persistenzlauf auf den Überlebenden-Daten |
| M5 | Ereignisse ohne aufgelöste Kontrolle | BEHOBEN | Filter `x[ctl][1] > 0` |
| M6 | Datenende: nur schnelle Auflösungen | BEHOBEN | Überlebende: nur volle Horizonte (`INCOMPLETE_HORIZON`); Delisted: Zensur + Sensitivität |
| M7 | Ablation ungepaart, geteilter Zufallsstrom | BEHOBEN | Zufallsstrom je (Variante, Titel, Ereignis, Kontrolle); gepaarte Ablation `ablationPaired` mit Cluster-KI |
| M8 | TRIVIAL/ALREADY_INVALID als „gesprochen“ | BEHOBEN | zusätzliche Spalte `coverageScorable` |
| M9 | Per-Bar- und zustandslose Titel gemischt | SENSITIVITÄT | `excludingPerBarSymbols` |
| M10 | D_DEV-Kontrollen greifen in den Holdout | BEHOBEN | B/C nur mit Ergebnisfenster in der Phase |
| M11 | Wenige Cluster / Quartal < H | SENSITIVITÄT | Halbjahres- und Jahresblöcke für die Hauptgröße |
| M12 | BH/Holm nicht umgesetzt | BEHOBEN | BH je Segmenttabelle; Holm für die präregistrierte Nebenfamilie im Bericht |
| M13 | Panel nicht gegen Stage 1 geprüft | BEHOBEN | Datum/Schluss je Record, Abbruch bei > 0,1 % Abweichung |
| M14 | keine timing-gematchte Kontrolle | BEHOBEN | Kontrolle P (gleiches Datum, ebenfalls Pivot bestätigt) |
| LOW | publish-check, eligible für Ereignisse, historyLength (Tag) | BEHOBEN | rekursiv, mehr Schlüssel; `eligible()` für Ereignisse; Jahre je Zeitrahmen |
| LOW | negative Kontrollniveaus, Einzel-Fehler, Seal-Umfang, gerundete PSC-Eingaben | OFFENGELEGT | KNOWN_LIMITATIONS |
