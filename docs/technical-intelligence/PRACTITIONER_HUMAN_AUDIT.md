# Practitioner Reference V1 — menschliches Extraktions-Audit

**PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.**

**HUMAN EXTRACTION AUDIT: READY (kein Reviewer verfügbar — keine Ergebnisse)**

Stand 05.10.2026. Die Infrastruktur ist vollständig. Es hat noch kein Mensch geprüft. Dieses Dokument enthält deshalb **keine** Prüfergebnisse. Alle Zahlen weiter unten beschreiben die Extraktion selbst (Übereinstimmung zwischen Durchgang A und B), nicht ihre Richtigkeit.

## 1. Zweck

`PRACTITIONER_REFERENCE_V1` (78 Fälle, 99 Zeilen) entstand mit der Methode `LLM_DUAL_INDEPENDENT_PRIMARY`: zwei unabhängige LLM-Durchgänge aus der Primärquelle, bei Abweichung ein Schiedsdurchgang (Protokoll, Nachträge 2–6). Bisher hat kein Mensch eine Zeile geprüft. Alle Ergebnisse tragen deshalb den Vermerk „Extraktion: LLM-dual aus Primärquelle, nicht menschlich geprüft“ (Nachtrag 2 Punkt 5).

Das Audit misst, **wie oft die extrahierte Zeile die Praktikerquelle falsch wiedergibt**. Es prüft nur den Weg Praktikerquelle → strukturierte Zeile. Es bewertet nicht, ob der Praktiker recht hatte und ob VU ähnlich zählt.

## 2. Blindheit und Grenzen

* **Blind gegenüber VU:** Prüfpaket, Seite und Skript lesen nichts aus `benchmark/` (Replay, Vergleich, Ergebnisstudie) und zeigen keine Engine-Ausgabe. Ein Test prüft das (`practitioner-human-audit.test.mjs`: keine VU-/Engine-Schlüssel, keine Verweise auf Benchmark-Dateien). `vuSymbol` ist nur die Abbildung des Instruments und keine VU-Ausgabe.
* **Holdouts versiegelt:** Grundlage sind nur die **35 geöffneten Fälle** (DEVELOPMENT 26, VALIDATION 9). Die 43 Holdout-Fälle (HOLDOUT_TEMPORAL 32, HOLDOUT_SOURCE `tiedje` 11) werden nur gezählt. Das Skript filtert jede Zeile **vor dem Parsen** über die `caseId` im Rohtext gegen `splits.byCase` im Manifest. Holdout-Zeilen werden nie geparst. Ein Test sichert ab, dass keine versiegelte `caseId` in Auswahl, Paket, CSV, Markdown oder Übereinstimmungsanalyse erscheint.
* **Zweite Welle:** Werden Holdouts entsiegelt (`--unseal-holdout`, je Holdout einmal), kann für sie eine zweite Auditwelle mit derselben Regel folgen (eigener Seed, z. B. `"<Datum>|human-audit-holdout|"`). Vorher nicht.
* **Urheberrecht:** keine Screenshots, Transkripte oder Volltexte. Gezeigt werden nur die Quell-URL, die Fundstellen (`locator`: Absatz, Bild, Videozeit) und die bereits vorhandenen Kurz-Notizen und eigenen Kurzfassungen der Extraktion. Die Prüfperson öffnet die Quelle selbst.
* **Zeitpunkt (offengelegt):** Die Auswahl wurde nach dem ersten Vergleichslauf auf DEVELOPMENT/VALIDATION festgelegt (Nachtrag 6). Sie benutzt nur Merkmale der Extraktion (Sicherheit, Quellenfamilie, Zeitrahmen, Musterfamilie, BTC) und einen Hash der `caseId`. VU-Ergebnisse gehen nicht ein.
* **Abweichung von Nachtrag 2 Punkt 5:** Dort war eine Stichprobe von ≥ 20 % über den ganzen Datensatz mit Seed `20261004` vorgesehen. Weil die Holdouts versiegelt bleiben, zieht das Audit nur aus den geöffneten Fällen, und zwar mit dem neuen Seed `20261005|human-audit|`. Es prüft 20 Fälle: 57 % der geöffneten Fälle, 26 % aller 78.

## 3. Auswahlregel (vorab festgelegt)

`node scripts/technical/practitioner/human-audit.mjs select` → `quant/data/technical-intelligence/practitioner-v1/human-audit/selection.json`

1. Alle geöffneten Fälle mit `extraction.confidence = HIGH` werden aufgenommen.
2. Danach werden Mindestbelegungen in fester Reihenfolge aufgefüllt. Es kommt jeweils der erste zulässige Fall in der Reihenfolge aufsteigend SHA-256(`"20261005|human-audit|"` + caseId) zum Zug:
   * je vorhandener Quellenfamilie ≥ 2,
   * je vorhandenem Zeitrahmen (1D/1W/1M) ≥ 1,
   * CORRECTIVE ≥ 3,
   * MOTIVE ≥ 60 % (12 von 20), jeweils soweit vorhanden.
3. Der Rest bis 20 wird in derselben Hash-Reihenfolge aufgefüllt.
4. Ein Fall ist zulässig, solange BTC ≤ 6 bleibt und die Nicht-MOTIVE-Fälle ≤ 20 − MOTIVE-Minimum bleiben. Die zweite Grenze hält die MOTIVE-Quote erreichbar.
5. Geprüft wird die Fassung `ORIGINAL_PUBLISHED`. Spätere Revisionen desselben Falls werden nur als Kontext gezeigt.

Alle Bedingungen sind erfüllt (`checks.allOk = true`). 1M kommt unter den geöffneten Fällen nicht vor.

| Schicht | geöffnet (35) | Auswahl (20) |
|---|---:|---:|
| Quellenfamilie ewf | 18 | 13 |
| Quellenfamilie tv-cryptoknee | 7 | 3 |
| Quellenfamilie tv-thefifthwave | 5 | 2 |
| Quellenfamilie tv-yuchaosng | 5 | 2 |
| Zeitrahmen 1D | 15 | 8 |
| Zeitrahmen 1W | 20 | 12 |
| Familie MOTIVE (alle IMPULSE) | 27 | 16 (80 %) |
| Familie CORRECTIVE | 8 | 4 |
| Sicherheit HIGH | 9 | 9 |
| Sicherheit MEDIUM | 26 | 11 |
| BTC | 11 | 4 |
| Nicht-BTC | 24 | 16 |
| DEVELOPMENT | 26 | 14 |
| VALIDATION | 9 | 6 |

Auswahlgründe: 9 × HIGH, 4 × Mindestbelegung Quellenfamilie (tv-cryptoknee 2, tv-thefifthwave 1, tv-yuchaosng 1), 2 × Mindestbelegung CORRECTIVE, 5 × Auffüllen.

## 4. Prüfpaket und Ablauf für die Prüfperson

`node scripts/technical/practitioner/human-audit.mjs export` erzeugt im Ordner `human-audit/`:

* `audit-pack.json`: Paket für die Seite. `packId` ist ein Hash über Freeze-Hash, Zeilen-IDs und extrahierte Werte.
* `audit-pack.csv`: eine Zeile je geprüftem Feld je Fall (20 × 13 = 260 Zeilen). Die Prüfspalten `verdict`, `correctedValue`, `reviewerNote`, `reviewerId` und `reviewDate` sind leer.
* `AUDIT_PACK.md`: druckbare Fassung mit Ankreuzfeldern.

Je Fall werden gezeigt:

* Quell-URL, Veröffentlichungszeitpunkt (Genauigkeit, Grundlage, Bearbeitungshinweis), Praktiker bzw. `sourceId`
* Instrument (`asShown` → `vuSymbol`), Zeitrahmen
* Primärmuster, Familie, `degreeLabel`/`degreeRank`, laufende Welle, Zustand, `directionalBias` (A1), `nextMoveAfterCurrent` (A2)
* Zielzonen, Invalidierung, Alternativen
* Sicherheit, Unklarheiten, alle Fundstellen und die A/B-Übereinstimmung je Kernfeld

**Geprüfte Felder** (Kernfeld = wie `dual-extraction.mjs` `CORE_FIELDS`): `instrument`\*, `timeframe`\*, `publication.timestamp`, `primary.pattern`, `primary.family`\*, `primary.degree`, `primary.currentWave`\*, `primary.state`, `directionalBias`\*, `primary.nextMoveAfterCurrent`, `targetZones`, `invalidation`\*, `alternatives` (\* = Kernfeld).

**Urteile je Feld:**

| Urteil | Bedeutung |
|---|---|
| `CORRECT` | Der Wert entspricht der Quelle. |
| `INCORRECT` | Der Wert widerspricht der Quelle. `correctedValue` ist **Pflicht**: der Wert laut Quelle oder `UNKNOWN`. |
| `PARTIALLY_CORRECT` | Teilweise richtig. `correctedValue` ist optional. |
| `UNKNOWN` | Aus der Quelle nicht entscheidbar, oder die Quelle ist nicht erreichbar. |

Format von `correctedValue`:

* Aufzählungsfelder: der Wert selbst, z. B. `UP`, `1W`, `ZIGZAG`.
* `currentWave`: das Label wie gezeigt.
* Strukturfelder als JSON, z. B. `{"price":14,"direction":"below","basis":"CLOSE"}` oder `[{"low":1,"high":2,"label":"…"}]`.

Notizen schreibt die Prüfperson in eigenen Worten, ohne Zitate. Als Kennung dient nur ein pseudonymer Code.

**Interne Seite** `quant/research/practitioner-audit/` („Extraktions-Audit — blind, ohne VU-Ausgaben“):

* zeigt einen Fall nach dem anderen, mit Quell-Link, Fundstellen, Revisionen als Kontext und je Feld Urteil, korrigiertem Wert und Notiz
* speichert Entwürfe je `packId` in `localStorage` (Fehler werden abgefangen, Hinweis: regelmäßig exportieren)
* exportiert die Prüfung als CSV oder JSON, beide direkt für `import` geeignet, und kann einen Entwurf aus einer exportierten Datei wieder laden
* lädt nur `audit-pack.json`, ist für Mobilgeräte geeignet und bindet `/quant/ui/shell.js` ein wie die anderen Forschungsseiten

Wer ohne die Seite arbeitet, füllt `audit-pack.csv` direkt aus. Auch Excel mit „;“ als Trennzeichen wird erkannt.

## 5. Import und Versionierung (V1.1)

```
node scripts/technical/practitioner/human-audit.mjs import <review.csv|review.json>
node scripts/technical/practitioner/human-audit.mjs status
```

**Validierung.** Bei einem Fehler wird nichts geschrieben. Die Prüfung muss diese Bedingungen erfüllen:

* passende `packId` und unveränderter `extractedValue`
* alle 260 Zeilen genau einmal
* nur zulässige Urteile, kein leeres Urteil
* bei `INCORRECT` ein `correctedValue`, und jeder `correctedValue` ist für sein Feld gültig (Schema-Enums 1.2.0)
* genau eine `reviewerId` (pseudonym, 2–24 Zeichen) und ein gültiges `reviewDate` (JJJJ-MM-TT)

**Ausgaben** (alle in `human-audit/`):

* `results.json` mit den Kennzahlen aus Abschnitt 6.
* `PRACTITIONER_REFERENCE_V1.1.candidate.jsonl`: eine **neue** Datei. `freeze/` wird nie verändert, und der Import prüft den SHA-256 von V1 vorher und nachher. Korrigierte Zeilen bekommen den neuen Wert und einen Vermerk in `extraction.ambiguities`. Alle anderen Zeilen, auch Revisionen und versiegelte Holdout-Zeilen, werden ungelesen und byte-identisch übernommen.
* `PRACTITIONER_REFERENCE_V1.1.candidate.changes.json`: die Änderungsliste mit Feld, Urteil, alt → neu und Notiz, dazu SHA-256 von Basis und Kandidat. `PARTIALLY_CORRECT` ohne Korrektur wird nur vermerkt.

Der Kandidat ist **kein Freeze**. Ein `PRACTITIONER_REFERENCE_V1.1` entsteht erst durch einen eigenen Freeze mit neuem Manifest. Danach braucht es einen neuen Vergleichslauf, der getrennt von V1 berichtet wird.

## 6. Kennzahlen, die berichtet werden (vorab festgelegt)

* **Feld-Fehlerquote** = INCORRECT / (Felder − UNKNOWN), insgesamt, je Feld und nur für Kernfelder. Zusätzlich die strenge Variante, die PARTIALLY_CORRECT mitzählt.
* **Fall-Fehlerquote:** Ein Fall ist fehlerhaft, wenn mindestens ein Kernfeld INCORRECT ist. Nenner sind die Fälle mit mindestens einem entscheidbaren Kernfeld.
* **HIGH- und MEDIUM-Fehlerquote** jeweils auf Feld-, Kernfeld- und Fallebene; dazu je Quellenfamilie.
* **A/B-Übereinstimmung gegen menschliches Urteil:** Fehlerquote der Kernfelder, getrennt nach AGREE, DISAGREE (nach Schiedsdurchgang) und NOT_STATED.
* Zu jedem Anteil ein Wilson-95-%-Intervall. Bei n = 20 sind die Intervalle breit; Aussagen je Quellenfamilie sind nur beschreibend.

**MEDIUM-Regel (Entscheidung vor jedem Ergebnis):** MEDIUM-Fälle bleiben für die Entwicklung (DEVELOPMENT/VALIDATION) nutzbar, wenn ihre **Fall-Fehlerquote ≤ der Fall-Fehlerquote von HIGH + 10 Prozentpunkte** ist. Sonst gelten sie als nicht nutzbar. Dann wird jede Auswertung mit MEDIUM als Sensitivitätsanalyse gekennzeichnet, und Kernaussagen stützen sich auf HIGH. Fehlt für HIGH oder MEDIUM ein entscheidbarer Fall, lautet das Ergebnis `UNDECIDABLE`. Umgesetzt ist die Regel in `human-audit.mjs` (`MEDIUM_POLICY`), das Ergebnis steht in `results.json` → `metrics.mediumPolicy.decision`.

## 7. Extraktions-Übereinstimmung A↔B (§15/§16) — nur geöffnete Fälle

`node scripts/technical/practitioner/human-audit.mjs agreement` → `human-audit/extraction-agreement.json`

Grundlage ist `references.jsonl`, eingeschränkt auf die geöffneten `caseId`s: 46 Zeilen (35 Originale und 11 Revisionen; 43 INCLUDED und 3 CANDIDATE-Revisionen). Die 288 versiegelten Zeilen wurden nicht gelesen.

Die Werte stammen aus `extraction.passes.coreFieldAgreement`. Dort gibt es je Kernfeld drei Werte: true (gleich), false (abweichend) und NOT_STATED (in beiden Durchgängen nicht genannt). Übereinstimmung = gleich / (gleich + abweichend). Außer `a`, `b`, `adjudication` und `coreFieldAgreement` enthält `passes` keine Angaben je Feld.

| Kernfeld | gleich | abweichend | nicht genannt | Übereinstimmung |
|---|---:|---:|---:|---:|
| family | 44 | 2 | 0 | 95,7 % |
| currentWave | 32 | 13 | 1 | 71,1 % |
| direction (A1) | 45 | 1 | 0 | 97,8 % |
| invalidation | 21 | 5 | 20 | 80,8 % |
| timeframe | 45 | 1 | 0 | 97,8 % |
| instrument | 46 | 0 | 0 | 100 % |

16 von 46 Zeilen (34,8 %) weichen in mindestens einem Kernfeld ab. Alle 16 gingen in den Schiedsdurchgang. Bei den Originalen allein sind es 12 von 35.

**HIGH gegen MEDIUM.**

* HIGH: 12 Zeilen, 0 Abweichungen, 0 Schiedsdurchgänge. Das folgt aus der Definition: HIGH setzt Übereinstimmung voraus (Nachtrag 2 Punkt 3).
* MEDIUM: 34 Zeilen, 16 mit Abweichung, 16 Schiedsdurchgänge. Übereinstimmung je Kernfeld:
  * family 32/2 (94,1 %)
  * currentWave 20/13 (60,6 %)
  * direction 33/1 (97,1 %)
  * invalidation 14/5 (73,7 %)
  * timeframe 33/1 (97,1 %)
  * instrument 34/0 (100 %)

**Nach Quellenfamilie** (nur beschreibend, keine Bewertung der Praktiker):

| Familie | Zeilen | mit Abweichung | currentWave gleich/abw. | invalidation gleich/abw./n. g. |
|---|---:|---:|---:|---:|
| ewf | 18 | 4 | 16/2 | 17/0/1 |
| tv-cryptoknee | 9 | 6 | 3/6 | 3/1/5 |
| tv-thefifthwave | 8 | 2 | 6/2 | 0/2/6 |
| tv-yuchaosng | 11 | 4 | 7/3 | 1/2/8 |

Am subjektivsten ist die **laufende Welle** (Gradwahl, Label-Ebene), vor allem bei den TradingView-Autoren. Invalidierungen nennt ewf fast immer und beide Durchgänge lesen sie gleich. Bei den TradingView-Autoren fehlen sie meist oder werden unterschiedlich gelesen.

**Fundstellen nach Durchgang:** 236 Notizen von A, 138 von B. 230 „A/B:“-Unklarheiten in 46 Zeilen.

### Beschreibende Zählung der geöffneten Fälle (§45 „Impuls-Quote“)

Grundlage: die 35 eingefrorenen Originale.

* Muster: IMPULSE 27 (77,1 %), ZIGZAG 5, FLAT 1, WXY 1, DOUBLE_ZIGZAG 1.
* MOTIVE besteht vollständig aus IMPULSE; es gibt keine Diagonalen.

| Gruppe | n | IMPULSE | Anteil |
|---|---:|---:|---:|
| ewf | 18 | 12 | 66,7 % |
| tv-cryptoknee | 7 | 5 | 71,4 % |
| tv-thefifthwave | 5 | 5 | 100 % |
| tv-yuchaosng | 5 | 5 | 100 % |
| 1D | 15 | 13 | 86,7 % |
| 1W | 20 | 14 | 70,0 % |
| BTC | 11 | 9 | 81,8 % |
| Nicht-BTC | 24 | 18 | 75,0 % |
| HIGH | 9 | 8 | 88,9 % |
| MEDIUM | 26 | 19 | 73,1 % |

CORRECTIVE nach Familie: ewf 6 (ZIGZAG 4, FLAT 1, WXY 1), tv-cryptoknee 2 (ZIGZAG 1, DOUBLE_ZIGZAG 1), tv-thefifthwave 0, tv-yuchaosng 0.

## 8. Dateien und Befehle

| Datei | Inhalt |
|---|---|
| `scripts/technical/practitioner/human-audit.mjs` | `select`, `export`, `import <datei>`, `agreement`, `status` (Optionen `--out`, `--freeze`, `--manifest`, `--refs`, `--pack`) |
| `quant/data/technical-intelligence/practitioner-v1/human-audit/selection.json` | Auswahl, Regel, Seed, Schichten, Prüfungen |
| `…/human-audit/audit-pack.json`, `audit-pack.csv`, `AUDIT_PACK.md` | Prüfpaket |
| `…/human-audit/extraction-agreement.json` | A↔B-Übereinstimmung, beschreibende Zählungen |
| `…/human-audit/results.json`, `PRACTITIONER_REFERENCE_V1.1.candidate.*` | entstehen erst beim Import einer echten Prüfung |
| `quant/research/practitioner-audit/` | interne Prüfseite |
| `quant/tests/practitioner-human-audit.test.mjs` | Tests: Determinismus, Schichtung, Holdout-Ausschluss, keine VU-Felder, CSV-/JSON-Rundlauf (nur Temp-Verzeichnis, synthetische Testurteile), Fehlerquoten, MEDIUM-Regel, V1.1-Kandidat mit Änderungsliste und unverändertem V1-Hash, Ablehnung ungültiger Prüfungen |

**Status:** HUMAN EXTRACTION AUDIT: READY (kein Reviewer verfügbar — keine Ergebnisse)
