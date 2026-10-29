# V12 Strang MCAP – PIT-Marktkapitalisierung: XBRL-Skalenfehler, Split-Zeitpunkt, Spin-off-als-Split (P1)

Status: **NOT_CERTIFIED**, `productionApproved=false`, `evidenceKind` SOURCE_EVIDENCE (Register) / RECONSTRUCTION (Wirkung).
Kein Produktpfad, keine `*/data`-Datei, kein Workflow, kein Gate geändert. V10-/V11-Code unverändert; die Korrektur ist
opt-in über `quant/engines/research-pit-market-cap.cjs` (Funktion) + `quant/engines/research-pit-market-cap-register.cjs`
(generiertes Register, nie von Hand ändern).

## Ergebnis in Kürze

- **Gültige Regel: 1.0.8** (`rule-1.0.8.json`, sha256 `8e64d38f…f77d`). 1.0.0 wurde vor jeder Anwendung eingefroren; 1.0.1–1.0.8
  sind offengelegte Änderungen nach Sicht auf Klassifikationen bzw. SEC-Stichproben (nie nach Studienergebnissen), jede mit eigenem
  Hash, Befund und Begründung (`amendments`). Toleranzen blieben unverändert.
- **117.888** Aktienzahl-Beobachtungen (370.389 Panelzeilen, 3.131 Emittenten, 2010–2025): **129 korrigiert** (Skalenfehler
  10^±3/6/9), **768 ausgeschlossen** (fail-closed), Rest OK. Panelzeilen: 1.365 korrigiert (401 Skala, 944 Split-Zeitpunkt,
  20 Spin-off-als-Split), 3.067 ausgeschlossen. Zeilen > 5e12 USD: **149 → 0**. Beleg: `summary-1.0.8.json`.
- **Wirkung:** Keine Kernaussage kippt. V10-Faktorstudie: 0 geänderte Holm-Entscheidungen, 0 Vorzeichenwechsel (28 Zellen × 4
  Endpunkte), E1-Ablehnungen 9 → 9; Rang-IC ändert sich um höchstens 0,0011 (value:26). Top-50: CAGR 13,03 % → 12,98 %, Überrendite
  ggü. SPY +0,71 → +0,66 Pp p. a. (p 0,37 → 0,38). V11-Winners: Größen-AUC (3J, Top 5 %) 0,363 → 0,360, alle Bewertungsmerkmale
  |ΔAUC| ≤ 0,003. Beleg: `impact-1.0.0.json`.
- **SEC-Validierung** (frische Stichprobe aus Register 1.0.7, 56 Beobachtungen, Akzession/URL/sha256/Zitat): 34 Korrekturen –
  31 belegt richtig, 2 falsch (beide Faktor 10 → in 1.0.8 nicht mehr korrigiert, sondern ausgeschlossen), 1 unbestätigt
  (`sec-adjudication-validation.json`). 1.0.8 ist damit für die verbleibenden Korrekturen in-sample (29/30 richtig, 1 unbestätigt).
- **Python-Gegenprüfung** (stdlib, eigene Faktauswahl aus companyfacts.zip, eigene Regel): Statusübereinstimmung 99,6 %, korrigierte
  Werte 107/107 identisch, 366.436 Panelzeilen wertgleich (1e-9) (`python-check-1.0.8.json`).

## Klassen (Beobachtungen, `summary-1.0.8.json`)

| Klasse | Status | Beobachtungen | Emittenten | Bedeutung |
|---|---|---:|---:|---|
| OK | OK | 115.373 | – | keine Auffälligkeit |
| OK_NO_REFERENCE | OK | 476 | – | erste Meldung ohne Vergleichswert |
| ALTERNATIVE_CONCEPT_DEVIATES | OK | 956 | 400 | Alternativkonzept (meist CSSO/WASO „in Tausend“) falsch, Wert durch validierte Vorvintage bestätigt |
| PRIOR_VINTAGE_SCALE_ERROR | OK | 59 | 53 | Vorvintage war um 10^k falsch, aktuelle Zahl vom Filing bestätigt |
| GENUINE_CAPITAL_ACTION | OK | 127 | 110 | ≥ 5× gegen Vorvintage, Filing bestätigt (SPAC/Reverse Merger, Emissionen) |
| SCALE_ERROR | CORRECTED | 129 | 79 | 10^3: 75, 10^6: 23, 10^9: 1, 10^-3: 19, 10^-6: 11 (Stufe A 120 / B 8 / C 14 vor 1.0.8) |
| DECIMAL_SCALE_SUSPECTED | EXCLUDED | 13 | 13 | Faktor 10/100 – nicht von 1:10-Splits/Emissionen trennbar |
| UNRESOLVED | EXCLUDED | 750 | 291 | Auslöser ohne belegbare Korrektur (v. a. Microcaps mit Reverse-Splits/Verwässerung) |
| MCAP_ABSOLUTE_BOUND | EXCLUDED | 5 | 5 | > 8e12 USD |

Zeilenklassen zusätzlich: SPLIT_TIMING 944 (Rohdatum der dei-Zahl = Deckblattdatum liegt auf der anderen Seite eines Splits als das
Periodenende der Pipeline, z. B. Citigroup 1:10 am 09.05.2011; inkl. V10-Randfall Split in derselben Woche), SPINOFF_AS_SPLIT 20,
SPLIT_BASIS_UNRESOLVED 228. Mehrklassen-Summen kamen im Bestand nicht vor (Emittenten mit mehreren Notierungen sind schon in V10
ausgeschlossen). Jahre/Emittenten: `factsByFiledYearAndClass`, `rowsByYearAndStatus`, `issuersByClass`.

Die vorab benannten Fälle: EEFT 10-K 2020 (5,28e16 → 52.752.851, Deckblatt bestätigt), ON 2012/13 (×1e6), ORCL Q1 FY13 (×1e6), YUM
Q3 2016 (×1e6, Stufe C), CB Q1/Q2 2010 (ganzes Filing ×1e6, Stufe B/A), CPK 2023/24 (×1000). **Citigroup Q3/2009 (22.863.947)
bleibt ausgeschlossen**: erste XBRL-Meldung, nur das Deckblatt (22.863.947.261) bestätigt, keine zweite Quellenfamilie, keine
Vorvintage – fail-closed nach Regel.

## Spin-off-Faktoren (Register `splits`)

1.362 Anbieter-Faktoren 2009–2025 nach Aktienzahl-Kontinuität: REAL_SPLIT 727, NOT_A_SPLIT 52, CONTRADICTED_SPLIT 37 (splitförmig,
aber Kontinuität ~1 → Zeilen ausgeschlossen), SMALL_FACTOR_ACCEPTED 119, UNRESOLVED 427. SEC-belegt (8-K, `spinoff-sources-1.0.0.json`):
GE 1,281 (GE HealthCare, 04.01.2023), GE 1,253 (GE Vernova, 02.04.2024), IBM 1,046 (Kyndryl, 03./04.11.2021; deckt sich mit dem
V10-TR-Register „IBM 1,046 = Kyndryl-Spin-off als Nicht-Split-Faktor“), ALV, T, EXC, FTV, WDC. Ein NOT_A_SPLIT-Faktor wird erst ab
Verfügbarkeit des Belegs (PIT) aus der Aktienbasis entfernt; die Kursreihe selbst bleibt unverändert (CA-Strang).

## PIT-Regel (Kurzfassung, verbindlich ist `rule-1.0.8.json`)

Belege nur aus demselben Filing oder früheren Filings; Vorvintage = zuletzt validierte Beobachtung des Emittenten. Auslöser: ≥ 5× gegen
Alternativkonzept oder Vorvintage oder > 8e12 USD. Korrektur 10^-k (|k| ≥ 3) nur mit Stufe A (Alternativwert ±2 % + Vorvintage ±25 %;
ohne Vorvintage Deckblatt **und** Abschlusstabelle), B (Vergleichsspalten des Filings = 10^k × bestätigter früherer Wert), C (±10 % zu
Filingwert und Vorvintage), Mehrheitsunterstützung, Preisplausibilität 1e6 ≤ Marktkap. ≤ 8e12. Sonst Ausschluss.

## Wirkung (vorher/nachher, `impact-1.0.0.json`)

„Vorher“ = V10-Code auf dem aktuellen Rahmen (unterscheidet sich vom publizierten V10-Lauf nur durch VSTS/CA-Register 1.1.2);
„nachher“ = derselbe Code mit korrigierter Marktkap. (`panel.cjs --mode after`, Wrapper um `factors.cjs#marketCapAt`).
V11-Winners „vorher“ reproduziert den publizierten reproHash exakt.

| Größe | vorher | nachher |
|---|---:|---:|
| Panelzeilen mit geänderter Marktkap. | – | 4.809 von 528.969 |
| Value-Score verfügbar | 222.316 | 221.561 |
| Composite verfügbar | 101.925 | 101.685 |
| Top-50-Auswahl (Jaccard je Stichtag, Mittel) | – | 0,981 |
| value IC 1M/3M/6M/12M | 0,0230/0,0344/0,0395/0,0453 | 0,0221/0,0339/0,0384/0,0443 |
| composite IC 1M (Holm) | 0,0397 (0,035) | 0,0391 (0,035) |
| Top-50 BASE CAGR / Sharpe / MaxDD | 13,03 % / 0,706 / −35,4 % | 12,98 % / 0,703 / −35,6 % |
| V11 3J Top-5 %-AUC logMarketCap | 0,363 | 0,360 |

Lesart: Die groben Fehler betrafen wenige, meist große Emittenten; die Querschnittsränge (Perzentile, Winsorisierung) dämpften sie
bereits. Die V10-/V11-Aussagen (Faktor-IC, keine signifikante Überrendite, Größe/Volatilität als Gewinner-Trenner) bleiben.

## Erzeuger-Vorschlag (nicht angewandt)

`producer-patch-market-cap-1.2.0.diff` (prüft mit `git apply --check` sauber): `market-cap.js` 1.2.0 mit Skalenwächter
`shareScaleSuspect` (Aktienzahl um 10^k, |k| ≥ 3, ±25 % gegen den Median der bis zu vier vorherigen Quartalszahlen) und Grenze 8e12 USD →
Börsenwert zurückhalten (`SHARE_COUNT_SCALE_SUSPECT`), nie umskalieren; dazu `build-factor-evidence.mjs`, `factor-evidence.js`,
`product-services.js`. UI-Text (`quant/app/view-model.js`) fehlt bewusst (Frontend-Sperre) und muss im Produkt-PR ergänzt werden.
Erwartete Wirkung auf dem Forschungspanel (`producer-effect-1.0.0.json`): 558 von 370.389 Zeilen zurückgehalten, 141 der 149 Zeilen
> 5e12 erfasst; 134 Zeilen mit korrektem Wert werden mit zurückgehalten (Vorquartal falsch skaliert – fail-closed); am letzten
Stichtag (≈ heutiger Produktstand) nur LTM (3,3e13). Stufe 2 (eigener PR in `scripts/quant/sec/`): die Registerregel in der
Konsumschicht anwenden (Korrektur statt Zurückhalten), dann factor-evidence und Discover mit dem Erzeuger neu bauen.

## Reproduktion

```bash
P=<scratchpad>/v12-private/mcap
node scripts/quant/v12/mcap/observations.cjs --private $P --panel <v10-private>/factor/panel.jsonl.gz   # 2,6 min
node scripts/quant/v12/mcap/sharefacts.cjs --private $P                                                  # 3,5 min, companyfacts.zip
node scripts/quant/v12/mcap/classify.cjs --private $P --register-out quant/engines/research-pit-market-cap-register.cjs --summary-out docs/quant-recovery/v12/mcap/summary-1.0.8.json
python3 -I scripts/quant/v12/mcap/sec_evidence.py <fact-log-dir> docs/quant-recovery/v12/mcap --tag validation   # SEC, <= 2/s
python3 -I scripts/quant/v12/mcap/verify_mcap.py $P <companyfacts.zip> quant/engines/research-pit-market-cap-register.cjs docs/quant-recovery/v12/mcap/python-check-1.0.8.json
node scripts/quant/v12/mcap/panel.cjs --private $P --mode before|after; node scripts/quant/v10/factor/study.cjs $P/<mode> --out $P/impact-<mode>; node scripts/quant/v10/factor/strategy.cjs $P/<mode> --out $P/impact-<mode>
node -r ./scripts/quant/v12/mcap/winners-preload.cjs scripts/quant/v11/winners/build.cjs --private $P/winners-after   # dann analyze.cjs
node scripts/quant/v12/mcap/impact.cjs --private $P --out docs/quant-recovery/v12/mcap/impact-1.0.0.json
node scripts/quant/v12/mcap/producer-effect.cjs --private $P --out docs/quant-recovery/v12/mcap/producer-effect-1.0.0.json
node --test quant/tests/v12-mcap.test.mjs
```

Grenzen: Register gilt für die Beobachtungsmenge mit `observationsHash` (andere Eingaben: Builder neu laufen lassen; nicht klassifizierte
Fakten gelten im Wrapper per Default als OK; fail-closed mit `strict`, siehe Korrektur unten). Ausschlüsse (3.067 Zeilen) betreffen überwiegend Microcaps → leichte Größenverschiebung der Population.
Spin-off-Kontinuität nutzt die erste Meldung nach dem Ereignis (Verfügbarkeit entsprechend gesetzt). Das automatische Deckblatt-Prüfskript
ist unvollständig (Tabellen „in Tausend“, Tippfehler im Dokument selbst, z. B. ARW „87,973 shares“, SNDX „68,442.572“); jede
nicht automatisch bestätigte Korrektur der Validierungsstichprobe ist einzeln adjudiziert. SEC-Abrufe: 311 (Cache privat).

## Korrektur nach unabhängiger Prüfung (Befunde MAJOR 1, m2, m3)

Beleg: `review-correction-1.0.0.json` (Erzeuger `scripts/quant/v12/mcap/review-correction.cjs`, liest nur die committeten
Stichproben/Adjudikationen und die privaten Vorher/Nachher-Panels). Regel, Register und Studienergebnisse bleiben unverändert.

- **Validierung ohne Überschneidung mit den Entwicklungsstichproben (MAJOR 1):** Die Validierungsstichprobe enthielt die 6 vorab
  benannten Fälle (in jeder Stichprobe) und weitere Akzessionen aus den beiden Entwicklungsstichproben. Ohne diese
  (Beobachtungsebene) bleiben 23 Korrekturen der Regel 1.0.7: 20 bestätigt, 2 falsch, 1 unbestätigt. **Unter 1.0.8 bleiben 19
  davon korrigiert, 18 bestätigt, 1 unbestätigt, 0 falsch: 18/19 = 94,7 %, Wilson-95-%-Untergrenze 75,4 %.** Strenger
  (zusätzlich ohne jeden Emittenten aus einer Entwicklungsstichprobe): 14/15, Untergrenze 70,2 %. 1.0.8 wurde nach dieser
  Stichprobe beschlossen (nur Ausschlüsse); die 1.0.8-Anteile sind in-sample, die Untergrenze ist die ehrliche Kurzform.
- **Falsche Angabe in `rule-1.0.8.json`:** Dort steht „32/32 confirmed“ für die unter 1.0.8 verbleibenden Korrekturen. Richtig:
  von 34 gezogenen Korrekturen bleiben 30 korrigiert, 29 bestätigt, 1 unbestätigt (LOCO 10-Q 2022), 0 falsch
  (`sec-adjudication-validation.json` → `summary.underRule1_0_8`). Die Regeldatei ist eingefroren (sha256) und wird nicht
  geändert; diese Notiz ersetzt den Satz. Die Kurzfassung oben („29/30 richtig, 1 unbestätigt“) war bereits richtig.
- **Dateinamen (m3):** Die Regeldateien nennen `sec-sample-1.0.0.json` (= `sec-sample-development.json`, Register 1.0.5) und
  `sec-sample-final.json` (= `sec-sample-development-2.json`, Register 1.0.6); `panel.jsonl.gz` liegt privat (sha256 in
  `impact-1.0.0.json`).
- **Beschriftung `rowsValueScoreChanged` (m3):** Der Zähler (222.316) zählt jede Zeile, deren Value-Score sich um irgendeinen
  Betrag ändert. Der Score ist ein Querschnitts-Perzentil (0,9–99,1): ein korrigierter oder ausgeschlossener Börsenwert verschiebt
  die Ränge aller Zeilen des Stichtags. Tatsächlich: 755 Zeilen verlieren den Score, 221.561 verschieben sich, davon nur
  **689 um > 1 Punkt, 559 um > 5, 412 um > 10**; Zeilen mit geänderter Marktkap. und geändertem Score: 893. Die Wirkungszahlen
  (IC, Top-50, AUC) sind davon unberührt.
- **Wrapper für nicht registrierte Fakten (m2):** `research-pit-market-cap.cjs#marketCapAt(args, base, register, options)`.
  **Default unverändert:** ein Fakt, der nicht im Register steht, gilt als OK – das ist nur für die klassifizierte
  Beobachtungsmenge richtig (`observationsHash`). **Neu `strict`:** `marketCapAt(…, { strict: true, observed })` mit
  `observed = bindObservations(rows)`; `bindObservations` hasht die Beobachtungszeilen zur Laufzeit genau wie der Erzeuger und
  wirft `PIT_MCAP_OBSERVATIONS_HASH_MISMATCH`, wenn der Hash nicht dem Register entspricht; ein Fakt, der weder im Register noch
  in der gebundenen Menge steht, wird `EXCLUDED` (`NOT_IN_CLASSIFIED_OBSERVATIONS`). Die private Beobachtungsmenge bindet
  (117.888 Schlüssel, Hash `f96a8dcc…`). Test: `quant/tests/v12-mcap.test.mjs` („runtime strict mode“).
