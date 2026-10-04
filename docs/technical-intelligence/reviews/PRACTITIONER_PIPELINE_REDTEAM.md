# Red Team: Practitioner-Reference-Pipeline (Mission V §122)

Stand 04.10.2026 · unabhängige Prüfung **vor** der ersten echten Referenz (`references.jsonl` ist leer).
Geprüft: `PRACTITIONER_PROTOCOL.md`, `practitioner-v1/*`, `scripts/technical/practitioner/*.mjs`,
`quant/research/elliott-practitioners/*`, `quant/tests/practitioner-*.test.mjs`.
Tests: `node --test quant/tests/practitioner-*.test.mjs` → **44/44 grün**; der Arbeitsbaum blieb danach sauber
(auch `total-return-verification.json` unverändert). Grüne Tests decken die Befunde 1, 2 und 4 **nicht** ab, Befund 2 wird von
`practitioner-page.test.mjs:131` sogar festgeschrieben.

Kurzurteil: Die Grundtrennung trägt (Projektion → Replay, `assertNoLeak`, getrenntes `outcome.mjs`, Blindmodus mit Sperre).
Es gibt aber **einen Bug in der Messdefinition (CRITICAL)** und mehrere Lücken bei Stichtag, Splits, Statistik und Auswahl, die
vor der ersten Extraktion zu schließen sind.

## CRITICAL

**C1 · Kennzahl A/S vergleicht verschiedene Größen (Richtungsinversion).**
VU `nextMove` ist die Richtung **nach** Ende der laufenden Welle (`elliott-v2.js:397-398,407`: `nextDir = -curDir` bei laufender
Zählung). Praktiker `directionalBias` ist laut `README.md:50` die „nächste erwartete Bewegung“. Im README-Beispiel (`README.md:66`) ist das
die laufende (iii) aufwärts mit Ziel darüber. `compare.mjs:106,117` setzt beides gleich.
Repro: README-Beispiel gegen eine VU-Sicht mit **identischer** Zählung (IMPULSE, Welle 3 läuft aufwärts, Engine-`nextMove`=DOWN)
→ `B,C,F,G,K = MATCH`, aber `A = MISMATCH`, `S = MISMATCH`. Folge: A, S und κ(Richtung) sowie `outcome.mjs:420` (VU-Richtung =
`nextMove`, Praktiker = Bias) messen bei laufenden Wellen systematisch das Gegenteil. Dazu kommt: VU kennt kein SIDEWAYS,
deshalb ist jeder Praktiker-Wert SIDEWAYS automatisch ein MISMATCH.
*Fix:* Zwei Felder getrennt erfassen und vergleichen: `currentLegDirection` (laufende Bewegung, VU `currentWave.direction`) und
`nextLegDirection` (nach Abschluss, VU `nextMove`). S auf ein Paar definieren. Die Änderung als datierten Nachtrag in §12
eintragen, **bevor** extrahiert wird.

## HIGH

**H1 · Stichtag: Tiingo-Metalle schließen um 24:00 UTC, die Regel nimmt 17:00 New York an.** `cutoff.mjs:19` (US_COMMODITY)
nutzt 17:00 New York. XAUUSD/XAGUSD stammen aber von `tiingo-fx-metals`, und dort umfasst ein Bar einen UTC-Kalendertag
(`scripts/quality/audit-fx-provider-seam.mjs:39-41`). Repro: Gold-Beitrag 2024-03-12 18:30 EDT → `analysisCutoff 2024-03-12`.
Dieser Bar schließt erst um 20:00 EDT, VU sieht also bis zu 3 h Kurs **nach** der Veröffentlichung. *Fix:* Den Markt je
Reihenquelle festlegen (Metalle wie CRYPTO 24:00 UTC), nicht je Anlageklasse.

**H2 · Die Seite schreibt Stichtage, die die Pipeline ablehnt.** `reference-core.js:166-172` gibt bei 1W das Ende der letzten
abgeschlossenen Woche zurück und rastet auf VU-Handelstage ein. `lib.mjs:237-238` verlangt dagegen den Tages-Stichtag ohne
Einrasten. Repro: 1W, 2024-03-13 18:00 Berlin → Seite `2024-03-08`, lib `2024-03-12`. Karfreitag (Veröffentlichung
2024-03-30) → Seite `2024-03-28`, lib `2024-03-29`. Jede solche INCLUDED-Zeile bricht `run-benchmark` ab. Die Folge ist Druck,
den Stichtag „von Hand zu korrigieren“, was §5 widerspricht. *Fix:* Nur den Tages-Stichtag speichern; Woche und Einrasten
übernimmt ausschließlich `replay.mjs`. Einen Roundtrip-Test Seite→lib ergänzen.

**H3 · Splits lecken über das Marktfenster.** Der VU-Replay hängt nur von `(vuSymbol, timeframe, analysisCutoff)` ab
(`replay.mjs:188-190`). Ein DEVELOPMENT-Fall (HKCM, SPY, 12.03.2024) und ein HOLDOUT_SOURCE-Fall (SPY, 13.03.2024) erzeugen
deshalb dieselbe VU-Ausgabe. Wer die Engine auf DEVELOPMENT tuned, tuned also den Holdout mit. Gleiches gilt für DEV/VAL
(`lib.mjs:430`, Hash je caseId; Nachbartage derselben Quelle landen in verschiedenen Splits). Revisionen von 2025 zu
Originalen von 2024 bleiben in DEVELOPMENT (`lib.mjs:426-429`, Split nach Wurzel). *Fix:* Splits nach Block
`(vuSymbol, Kalendermonat)` bzw. Zeitblock bilden. Holdout-Fälle, deren Fenster sich mit DEV überschneidet, separat markieren.
Für den temporalen Split den spätesten Fassungszeitpunkt verwenden.

**H4 · Holdouts werden bei jedem Lauf ausgegeben.** `run-benchmark.mjs:96` schreibt für jeden Lauf `bySplit.HOLDOUT_*` in
`comparison.json`. „Genau einmal“ (§8) ist nicht durchgesetzt. Vor dem Freeze berechnet `assignSplits` die Holdout-Quelle bei
jedem Lauf neu (`lib.mjs:423-424`), sie kann also wandern. *Fix:* Ohne `--unseal-holdout` Holdout-Zeilen ausfiltern; die
Entsiegelung mit Hash protokollieren; die Holdout-Quelle mit dem Freeze fixieren.

**H5 · Kein Stichprobenrahmen, die Erfassungs-Warteschlange stammt aus der Suche.** §4 verlangt feste Fenster und jede k-te
Veröffentlichung. `source-registry.json` hat dafür aber keine Felder (Fenster, k, Archivliste), und es gibt keine
Nennerdatei. `discovery-queue.json` folgt der Suchreihenfolge und enthält Erfolgsbeiträge
(`:108` „…Presented to Members“, `:128` „Topp erwischt – Volltreffer“). Kommerzielle Anbieter wählen ihre freien Inhalte
zudem selbst aus (Publikationsverzerrung je Quelle). *Fix:* Je Quelle eine `sampling-frame-<id>.jsonl` mit **allen** Beiträgen
im Fenster und Ein-/Ausschlussgrund, festgelegt vor der Extraktion. Die Discovery-Queue nur als Hinweis auf Quellen nutzen.

**H6 · Ergebnis-Kontamination der Extraktion bleibt ungeregelt.** Die Extraktoren kennen den Ausgang (Rückblick 2022–2025).
Ein Risikopunkt ist die Wahl „Primär vs. Alternative“ bei unklarer Gewichtung. Der andere sind editierbare Beiträge
(EWI/EWF/EWT/Blogs). Dort ist `editedAfterPublication` nur ein Hinweis (`reference-core.js:293`), `lib.mjs` prüft es gar
nicht, und eine Archivkopie wird nicht verlangt. *Fix:* Primär = ausdrücklich so benannt oder zuerst gezeigt, sonst
`AMBIGUOUS`, und F/G werden nicht gewertet. Für editierbare Quellen einen Archiv-Snapshot (Wayback o. ä.) mit Datum ≤
Stichtag + 1 verlangen, sonst Sensitivitätsanalyse ohne diese Fälle. Den Grund für UNKNOWN-Felder protokollieren.

**H7 · Cluster-CIs mit wenigen Quellen.** `clusterBoot` liefert bei einem Cluster ein Intervall der Breite null (Repro:
12 Fälle, 1 Quelle → `{est:0.75, lo:0.75, hi:0.75}`), bei 2 Clustern nur Grobwerte. κ hat keine Mindest-n
(`compare.mjs:179-185`). *Fix:* Unter 5 Clustern kein CI angeben, sondern `INSUFFICIENT_CLUSTERS` ausweisen. κ erst ab n ≥ 20
und mit Prävalenzangabe.

## MEDIUM

* **M1 Zeitstempel-Semantik.** Bei DAY gilt 00:00 in `publication.timezone` (`cutoff.mjs:87`). Ein Datum, das in der Zeitzone
  des Betrachters abgelesen wird, verschiebt das. Repro: Beitrag 11.03.2024 15:30 NY, von Tokio aus als 12.03. eingetragen →
  Stichtag 11.03. statt 08.03. *Fix:* DAY konservativ ab 00:00 UTC+14. Weitere offene Punkte: EWT-Regel „sonst
  öffentliches Datum“ (`source-registry.json:209 ff.`) gibt VU bis zu 72 h mehr Information als der Praktiker hatte, ist also
  nicht konservativ für den Vergleich. Aufnahme vor Upload, Premiere/Live wird nicht erfasst. *Fix:* Feld `lastVisibleBar` aus
  dem Praktiker-Chart; Stichtag = min(berechnet, lastVisibleBar).
* **M2 Grad D/E.** Die VU-Seite nutzt den Median aller bestätigten Teilwellen in Kalendertagen (`replay.mjs:257-261`), die
  Praktiker-Seite ein von Hand vergebenes Label. Die Notationen sind praktikerspezifisch: `(iii)` ist nach EWP Minuette und
  liegt **unter** der Skala 0..5, im README-Beispiel aber als 0 eingetragen. Bei 6 Rängen und gehäuften Werten ist E (±1) fast
  trivial. *Fix:* Eine Abbildungstabelle je Quelle; D/E nur mit Permutations-Basisrate berichten, nicht in die Headline.
* **M3 Mensch–Mensch.** `hkcm` und `phantom-hkcm` gelten als „verschiedene Quellen“ (`compare.mjs:220`), obwohl sie zum
  selben Haus gehören. Das bläht die Praktiker-Übereinstimmung auf. Bis zu 5 Handelstage Abstand heißt außerdem
  unterschiedliche Informationsstände. *Fix:* Paarbildung nach `organisation`; nach Abstand der Stichtage schichten.
* **M4 Instrumente.** Futures (ES/NQ) haben fest `levelScale` 0,1 bzw. 0,0244 (`instrument-map.json:10,13`). Basis und
  rückwärts angepasste Rollsprünge liegen im Bereich 1–5 %. Unbereinigte Aktien-Charts mit Split ≤ 1,6:1 fallen durch die
  ±60-%-Prüfung (`lib.mjs:294`): Ein 3:2-Split ergibt +50 % und wird nicht erkannt. Ein 1D-Fall auf Einzelaktien vor ~06/2026
  ist immer INSUFFICIENT_DATA, weil die Tagesreihe nur ~1 Jahr umfasst. Das erzeugt eine stille Auswahl nach Instrument.
  *Fix:* Bei Futures und UNADJUSTED `levelScale` aus dem Chart-Schluss verlangen, sonst Niveaus als nicht vergleichbar führen.
  1D-Aktien als eigene Kategorie berichten.
* **M5 Urheberrecht/Schema.** Verschachtelte Objekte haben kein `additionalProperties:false`. Freitextfelder ohne `maxLength`
  (`structuralScenario`, `ambiguities`, `alternatives[].note`, `editNote`, `exclusionReason`) nehmen beliebig viel Text auf.
  Repro: `publication.transcript` und `extraction.fullText` mit je 20 000 Zeichen → `validateSchema` meldet **0 Fehler**.
  *Fix:* `additionalProperties:false` überall setzen; Längengrenzen 200–400 Zeichen.
* **M6 Doppelextraktion/LLM.** Die Zufallsauswahl mit Seed 20261004 ist nirgends implementiert (nur als Text in
  `practitioners.js:628`). Die Feld-Übereinstimmung berechnet nur die Seite, nicht die Pipeline. Für LLM-Entwürfe gibt es keine
  Regeln zu Eingabe, Modell und Prompt-Log. Das LLM kennt den späteren Kursverlauf, und als Eingabe kommen Transkripte infrage.
  *Fix:* Deterministischen Ziehungsschritt einbauen, κ je Feld im Benchmark berechnen, Eingabe und Prompt für LLM-Entwürfe
  protokollieren.
* **M7 Vorbelastung der Engine.** Bei der Entwicklung von 3.x wurden bereits 74 Praktiker-Referenzen genutzt, davon 31 von
  EWF (`elliott-validation/practitioner/practitioner-refs.json`, `elliott-practitioner-benchmark.mjs:19`). Wird EWF zur
  Holdout-Quelle, ist der Holdout nicht „ungesehen“. *Fix:* Bekannte Quellen und Fälle aus HOLDOUT_SOURCE ausschließen.
* **M8 Ergebnis zeitgleich mit dem Vergleich.** `run-benchmark.mjs:116` schreibt `outcome.json` standardmäßig im selben Lauf.
  Laut §10 wird erst eingefroren, dann ausgewertet. *Fix:* Ergebnis nur nach Freeze mit Hash von `comparison.json`.
* **M9 Gewichtung.** Raten werden gepoolt (`compare.mjs:154-160`), und Quellen mit vielen Beiträgen dominieren. Die
  40-%-HKCM-Grenze wird nur berichtet (`lib.mjs:468`). *Fix:* Zusätzlich je Quelle gleich gewichtete Raten.

## LOW

Kein Persistenzverlauf (`previous`) im Haupt-Replay (`replay.mjs:312`), obwohl der Replay „wie im Produkt“ sein soll. Die
Seite verlangt live mindestens 300 Bars, der Benchmark 200 (`practitioners.js:136` vs. `replay.mjs:179`). Krypto-Wochen werden
auf der Seite Mo–Fr gruppiert (`reference-core.js:183`), im Benchmark Mo–So. Die Gold-Wochenschlüsse nutzen den Sonntagsbar.
Die ATR auf Schlussbasis liegt unter der echten ATR. Das caseId-Format unterscheidet sich zwischen Seite (`|s1`) und README
(`|1`). Sperre und Blindmodus liegen nur im localStorage. Die HKCM-Stufe A ist „laut Auftrag“ vergeben, nicht über die Matrix.
Die Dynamik nutzt Daten nach dem Stichtag; das ist gekennzeichnet und nicht in den Headline-Kennzahlen.

## Produktaussagen (9)

Ich habe keine Formulierung gefunden, die eine HKCM-Treffsicherheit oder „VU analysiert wie HKCM“ nahelegt. Seite, Protokoll
und Manifest tragen durchgehend „PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH“ und „keine Trefferquoten“. Risiko: Die
`headline.S` in `benchmark-summary.json` wäre wegen C1 falsch, und ihr fehlt die Kennzeichnung „intern“. Sie darf nicht
ins Produkt übernommen werden.

## Reihenfolge vor der ersten Extraktion

C1 → H2 → H1 → H5/H6 (Protokoll-Nachtrag §12) → H3/H4 → H7 → M5. Danach ein Pilot mit 20–30 Fällen.
