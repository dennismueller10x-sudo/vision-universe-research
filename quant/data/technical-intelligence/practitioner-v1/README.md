# Practitioner Reference V1 — Erfassung durch Menschen

**PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.** Eine Praktiker-Zählung ist eine Vergleichsgröße, keine Wahrheit.
Verbindlich ist das vorab registrierte Protokoll `docs/technical-intelligence/PRACTITIONER_PROTOCOL.md`.

## Dateien

| Datei | Zweck |
|---|---|
| `schema/practitioner-reference-1.0.0.json` | Schema einer Referenzzeile (nicht ändern; Änderungen nur als neue Schema-Version) |
| `references.jsonl` | **Erfassungsdatei.** Eine Zeile = eine Fassung eines Falls (JSON-Objekt). Derzeit leer. |
| `instrument-map.json` | Abbildung Praktiker-Instrument → VU-Reihe (Abbildungsgüte, `levelScale`) |
| `source-registry.json` | Quellenverzeichnis; jede `sourceId` muss hier stehen |
| `freeze/` | eingefrorene Datensätze (`PRACTITIONER_REFERENCE_V1.jsonl` + Manifest mit SHA-256), entsteht erst beim Freeze |
| `benchmark/` | Ausgaben von `run-benchmark.mjs` (ohne Referenzen: `status: "NO_REFERENCES"`) |

## Ablauf

1. **Quelle sichten** (Primärquelle, öffentlich ohne Login). Nur Analysen, deren Veröffentlichung nachweislich vor dem Ergebnis lag.
2. **Zeile anfügen** in `references.jsonl` – nie eine bestehende Zeile ändern. Korrekturen eines Praktikers sind **neue** Zeilen
   (`viewKind: "LATER_REVISION"`, `revisionOf: <referenceId der Vorfassung>`, `version` = Vorfassung + 1, gleiche `caseId`).
   Eine verschobene Invalidation ersetzt nie die ursprüngliche.
3. **Stichtag berechnen lassen**, nie von Hand setzen:
   ```
   node -e 'import("./scripts/technical/practitioner/cutoff.mjs").then(m=>console.log(m.computeAnalysisCutoff({timestamp:"2024-03-12T18:00:00+01:00",timestampPrecision:"MINUTE",timezone:"Europe/Berlin",basis:"YouTube"},"US_EQUITY")))'
   ```
   Märkte: `US_EQUITY` (16:00 New York), `XETRA` (17:30 Berlin), `CRYPTO` (00:00 UTC), `US_COMMODITY` (17:00 New York), `JP_EQUITY`.
   Der Markt ergibt sich aus `instrument-map.json`; die Validierung vergleicht `analysisCutoff` mit dem berechneten Wert.
4. **Prüfen**: `node scripts/technical/practitioner/run-benchmark.mjs --out /tmp/pr-check` validiert alle `INCLUDED`-Zeilen
   und bricht bei Fehlern laut ab.
5. **Freeze** (erst wenn die Erfassung abgeschlossen ist) über `freezeReferences()` in `lib.mjs`; danach Korrekturen nur als
   neue Version (V1.1 …).

## Felder – Hinweise

* `referenceId`: `pr_<quelle>_<jjjjmmtt>_<instrument>[_<n>]`, nur Kleinbuchstaben, Ziffern, `_`, `-`.
* `caseId`: `sourceId|vuSymbol|Veröffentlichungsdatum des Originals (lokal, JJJJ-MM-TT)|Szenario-Nr.` – z. B.
  `hkcm|SPY|2024-03-12|1`. Nicht abbildbare Instrumente: `hkcm|UNMAPPED:DAX|2024-03-12|1`. Cross-Posts (Video + X + Blog
  derselben Analyse) sind **ein** Fall: weitere Fundstellen in `crossPosts`, nicht als eigene Zeile.
* `publication.timestamp`: ISO-8601 **mit Offset**, der zur IANA-Zone passt (Berlin im Sommer `+02:00`, im Winter `+01:00`).
  `timestampPrecision`: `MINUTE` / `HOUR` / `DAY` (bei `DAY`: `T00:00` lokaler Zeit; der Stichtag ist dann der letzte Schluss **vor** dem Datum).
  `basis`: woher der Zeitstempel stammt (Plattform-Metadaten, Artikelkopf …).
* `instrument`: `asShown` wie im Chart (`"NQ1!"`, `"S&P 500"`, `"GER40"`), `instrumentType`, `priceAdjustment`,
  `vuSymbol`/`mappingQuality` wie in `instrument-map.json`. **`levelScale`**: liegt der Chart-Schlusskurs am Stichtag vor,
  `levelScale = VU-Schluss / Chart-Schluss` eintragen (genauer als der Kartenwert). Aktien mit späterem Split und unbereinigtem
  Chart: kumulierten Splitfaktor als `levelScale` eintragen und in `extraction.ambiguities` begründen.
  DAX & Co. ohne VU-Reihe: `vuSymbol: null`, `mappingQuality: "UNMAPPED"` – wird gezählt, nicht gerechnet.
* `primary.currentWave` wie gezeigt (`"(iii)"`, `"[C]"`, `"4"`); `degreeLabel` wie gezeigt; `degreeRank` normalisiert
  (0 Minute, 1 Minor, 2 Intermediate, 3 Primary, 4 Cycle, 5 Supercycle) oder `null`.
* `directionalBias`: **nächste** erwartete Bewegung des Primärszenarios.
* Beispiel Stichtag: 12.03.2024 18:00 Berlin = 13:00 New York (US-Sommerzeit seit 10.03.) → US-Börse noch offen → `analysisCutoff` 2024-03-11.
* Niveaus (`invalidation`, `targetZones`, …) im Preis des **Praktiker-Charts**; die Skalierung übernimmt die Pipeline.
* Unklares heißt `UNKNOWN` / `null` – nichts ergänzen. Widerspruch Text ↔ Chart → `extraction.ambiguities`.
* `commentarySummary` ≤ 400 Zeichen, **eigene** Kurzfassung, kein Zitat. Keine Screenshots, Transkripte oder Volltexte.
* `evidence`: mindestens ein Eintrag mit Fundstelle (`locator`: Videozeit `mm:ss`, Absatz, Bildnummer) und kurzer Notiz (≤ 200 Zeichen).
* `extraction.method`: `HUMAN_FROM_PRIMARY` oder `LLM_DRAFT_HUMAN_REVIEWED`. **`LLM_DRAFT_UNREVIEWED` zählt nie.**
  `confidence: "LOW"` → nur `CANDIDATE`, nie `INCLUDED`.
* `status`: `CANDIDATE` (erfasst, nicht geprüft) → `INCLUDED` (geprüft, zählt) oder `EXCLUDED` (mit `exclusionReason`).
  `TEST_FIXTURE` ist ausschließlich für automatische Tests (`sourceId: "test-fixture-*"`, URL `https://example.invalid/…`)
  und gehört **nie** in diese Datei – ein Freeze mit Testdaten wird verweigert.
* `split` setzt der Freeze (§8) – nicht von Hand.

## Beispielzeile (Struktur, erfundene Werte – nicht übernehmen)

```json
{"referenceId":"pr_quelle_20240312_spx","caseId":"quelle|SPY|2024-03-12|1","version":1,"revisionOf":null,"viewKind":"ORIGINAL_PUBLISHED","sourceId":"quelle","sourceType":"YOUTUBE","sourceUrl":"https://www.youtube.com/watch?v=…","crossPosts":[],"publication":{"timestamp":"2024-03-12T18:00:00+01:00","timestampPrecision":"MINUTE","timezone":"Europe/Berlin","basis":"YouTube-Metadaten","editedAfterPublication":"UNKNOWN","editNote":null},"instrument":{"asShown":"S&P 500","instrumentType":"INDEX_CASH","priceAdjustment":"UNKNOWN","vuSymbol":"SPY","mappingQuality":"PROXY_DIFFERENT_INSTRUMENT","levelScale":0.1},"timeframe":"1D","analysisCutoff":"2024-03-11","elliottSchool":"PRACTITIONER_SPECIFIC","primary":{"pattern":"IMPULSE","family":"MOTIVE","degreeLabel":"(iii)","degreeRank":0,"currentWave":"(iii)","currentWaveRole":"MOTIVE","state":"DEVELOPING","waveStartDate":null,"waveStartPrice":null},"alternatives":[],"directionalBias":"UP","structuralScenario":"…","keySupportZones":[],"entryZones":[],"targetZones":[{"low":5300,"high":5400,"label":"Ziel (iii)"}],"invalidation":{"price":5000,"direction":"below","basis":"CLOSE"},"commentarySummary":"…","extraction":{"confidence":"HIGH","extractor":"x1","method":"HUMAN_FROM_PRIMARY","secondPass":null,"ambiguities":[]},"evidence":[{"field":"primary.currentWave","locator":"04:12","note":"Zählung im Chart sichtbar"}],"referenceQuality":"A","status":"CANDIDATE","exclusionReason":null,"split":"UNASSIGNED"}
```

## Was die Pipeline daraus macht

`scripts/technical/practitioner/`: `lib.mjs` (Validierung, Plausibilität ±60 %, Abbildung, Duplikate, Revisionen, Aufteilung,
Freeze), `cutoff.mjs` (Stichtag), `replay.mjs` (blinde VU-Wiedergabe – sieht nur Instrument, Zeitrahmen, Stichtag),
`compare.mjs` (Kennzahlen A–K, S, Mensch–Mensch, κ, Cluster-Bootstrap), `outcome.mjs` (getrennte Ergebnisstudie),
`run-benchmark.mjs` (Gesamtlauf). Es werden keine Trefferquoten einzelner Praktiker veröffentlicht.
