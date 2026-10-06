# SEC FUNDAMENTAL DATA STREAM — von fünf Emittenten auf das US-Universum

Fortsetzung von `docs/VU_UNIVERSE_EXPANSION.md`. Dort wurde das
Aktienuniversum erweitert; hier geht es um die Daten, die es füllen.

---

## 1. Warum die SEC-Pipeline fünf Titel abdeckt

Die naheliegende Vermutung — eine Begrenzung in der Pipeline — ist falsch.
Die Pipeline ist für viele Emittenten gebaut und trägt das auch:

| Was sie kann | Wo |
|---|---|
| Checkpoints je Emittent | `CheckpointStore`, nach jedem Titel geschrieben |
| Wiederaufnahme nach Abbruch | `ingest_universe(resume=True)` |
| Fehlerschlange mit Versuchszähler | `state["retry_queue"]`, `max_attempts` |
| Begrenzter Lauf | `--limit` |
| Ratenbegrenzung | Token Bucket, **5 Anfragen/s** — die Hälfte der von der SEC genannten Obergrenze |
| Backoff bei 429/503 | `SECHttpClient`, exponentiell mit Jitter |
| Zwischenspeicher | `DiskCache`, ein zweiter Lauf fragt nicht erneut |
| Änderungserkennung | `latest_filing_signature` — unveränderte Emittenten holen keine Fakten |

Der Grund steht in einer Konfigurationsdatei:
**`quant/config/sec-universe.json` führt fünf Unternehmen** — NVDA, AAPL,
MSFT, JPM, XOM. Ausgewählt nach Rechnungslegungsstruktur und
Fiskalkalender (Halbleiter mit Januar-Geschäftsjahr, Hardware mit
52/53-Wochen-Jahr, Software mit Juni-Jahr, Bank ohne Umsatzkosten, Energie
mit Kalenderjahr und einem realen Entitätswechsel).

**Das ist ein Validierungssatz und war nie ein Produktuniversum.** Genau
so steht es in der Datei: „Die fünf Emittenten decken unterschiedliche
Accounting-Strukturen und Fiskalkalender ab."

### Die zweite Grenze: eine CIK ohne Quelle

Selbst mit einem größeren Universum hätte die Pipeline nichts zu holen
gehabt. Die CIK kam bis hierher **von Hand** in die Konfiguration — für
fünf Titel machbar, für fünftausend nicht. Und die Tickerliste des
Kursanbieters führt keine CIK.

---

## 2. Was gebaut wurde

### CIK-Zuordnung für den ganzen US-Markt — zwei Anfragen

`scripts/universe/build-cik-map.mjs` liest die beiden offiziellen
SEC-Verzeichnisse:

```
https://www.sec.gov/files/company_tickers.json
https://www.sec.gov/files/company_tickers_exchange.json
```

Darin steht für praktisch jeden US-Einreicher: Kürzel, CIK, **Firmenname**,
Handelsplatz. Öffentlich, ohne Vertrag, ohne Kosten (§32).

Das schließt zwei Lücken auf einmal. Die CIK ist die Voraussetzung für
jeden Fundamentalabruf — und der **Firmenname** ist die Voraussetzung
dafür, dass eine Suche nach „NVIDIA" etwas findet (§17). Die
Kursanbieter-Tickerliste führt keinen Namen; nach der Erweiterung hatten
5.173 von 5.690 Instrumenten keinen.

### Das SEC-Universum kommt aus dem Company Master

`scripts/universe/build-sec-universe.mjs` erzeugt
`quant/data/universe/sec-universe.json` — schema-gleich mit der
handgepflegten Datei, damit die bestehende CLI es unverändert liest.

Aufgenommen wird, was überhaupt einreicht: `COMMON_STOCK`, `ADR`,
`PREFERRED`, US-Land, mit CIK. ETFs und Fonds bleiben draußen — für jeden
von ihnen eine Anfrage zu stellen, die sicher leer zurückkommt, wäre das
Gegenteil von Fair Access.

**Die Reihenfolge ist die eigentliche Entscheidung.** Ein Lauf über
tausende Emittenten wird abgebrochen, unterbrochen oder begrenzt. Was
zuerst geholt wird, entscheidet, was nach einem halben Lauf da ist:

1. **Validierungssatz** — die fünf. Eine Regression fällt weiterhin zuerst auf.
2. **Titel mit Aktienseite** — was heute jemand aufschlägt.
3. **Alles übrige** — nach Kürzel, damit zwei Läufe dieselbe Reihenfolge haben.

Eine CIK wird nicht zweimal geholt: Aktienklassen desselben Emittenten
teilen sie sich. Das zweite Kürzel steht als `alsoTickers` am Emittenten
und geht nicht verloren.

### Der Sammelweg für companyfacts (§25)

`iter_bulk_company_facts` lag seit jeher im Anbieteradapter — **verdrahtet
war es an keiner Stelle.** Jetzt schon:

```
python3 scripts/quant/cli.py ingest \
  --universe quant/data/universe/sec-universe.json \
  --skip-unresolved --bulk
```

| | Einzelweg | Sammelweg |
|---|---|---|
| companyfacts | 1 Anfrage je Emittent | **1 Anfrage insgesamt** |
| submissions | 1 Anfrage je Emittent | 1 Anfrage je Emittent |
| bei 5.000 Emittenten | ~10.000 Anfragen | ~5.001 Anfragen |

Was der Sammelweg **nicht** löst: die Einreichungsübersicht. Sie
entscheidet, welche Fakten vergleichbar sind und wann jede öffentlich
wurde, und es gibt sie nicht als Sammelform. Wer weiter skalieren will,
muss dort ansetzen — nicht bei den Fakten.

Bei 5 Anfragen/s sind 5.000 Emittenten rund **17 Minuten reine
Anfragezeit**. Die Zahl steht im Artefakt (`requestBudget`), nicht in
einer Annahme.

### `--skip-unresolved`

Mit fünf kuratierten Emittenten ist ein Kürzel, das die SEC nicht kennt,
ein Konfigurationsfehler und muss den Lauf stoppen. Mit fünftausend aus
einer Kursdatenquelle ist es der **Normalfall** — ETFs, ausländische
Emittenten ohne 20-F, frisch delistete Hüllen. Ohne diese Option könnte
die Pipeline nie im großen Maßstab laufen.

Die übersprungenen Einträge werden **gemeldet, nicht geschluckt**: sie
stehen mit Grund im Lauf-Ergebnis (`unresolved`).

---

## 3. Wo die Grenze in dieser Umgebung liegt

`sec.gov` ist aus der Bauumgebung **nicht erreichbar** — der Egress-Proxy
weist `CONNECT www.sec.gov:443` mit 403 ab. Gemessen, nicht vermutet:

```
recentRelayFailures: [{ kind: "connect_rejected", host: "www.sec.gov:443",
                        detail: "gateway answered 403 to CONNECT" }]
```

Folge: `quant/data/universe/cik-map.json` trägt `status: "UNAVAILABLE"`
mit dem HTTP-Befund, und das SEC-Universum bleibt bei den fünf. **Es wird
ausdrücklich keine ersatzweise CIK-Zuordnung gebaut** — eine geratene CIK
zöge eine falsche Fundamentalbilanz nach sich.

### Was trotzdem geprüft ist

Ein Weg, der nur im CI läuft, ist ungeprüft, solange er nicht läuft.
Deshalb sind beide Stufen ohne Netz testbar gemacht:

| Test | Was er beweist |
|---|---|
| `quant/tests/sec-universe-scale.test.mjs` | Mit einer untergeschobenen CIK-Zuordnung wächst das SEC-Universum von 5 auf **über 1.000** Emittenten. Reihenfolge, Begrenzung, CIK-Dedupe und Anfragebudget werden mitgeprüft. |
| `scripts/quant/tests/test_bulk_ingest.py` | Der Sammelweg stellt **null** companyfacts-Einzelabfragen, liefert denselben Factbook wie der Einzelweg, fällt für einen im Archiv fehlenden Emittenten auf die Einzelabfrage zurück, und Wiederaufnahme funktioniert weiter. |

8 Python-Tests neu (257 insgesamt grün), 7 JS-Tests neu.

### Der eine Lauf, der noch fehlt

```
Actions → "Company Master — Universum, Suchindex, CIK" → sync: true
```

Er holt das vollständige Anbieterverzeichnis und die CIK-Zuordnung, baut
den Master neu und committet. Danach steht in
`quant/data/universe/coverage-report.json`, wie viele Titel eine CIK
haben — gezählt, nicht geschätzt.

---

## 4. Die Fundamental-Pipeline dahinter — unverändert

Was §26–§29 verlangen, steht seit Phase 4 und wurde **nicht angefasst**:

| Anforderung | Wo |
|---|---|
| SEC RAW → XBRL → Canonical → Derived | `scripts/quant/sec/{provider,normalize,canonical,derived}.py` |
| Mehrere XBRL-Tags je Kennzahl mit Priorisierung | `quant/config/sec-metric-registry.json` |
| Quarter / Annual / TTM getrennt | `scripts/quant/sec/periods.py`, `fiscal.py` |
| Restatements und Point-in-Time | `restatements.py`, `docs/SEC_PIT_METHODOLOGY.md` |
| Datenherkunft je Wert | `raw_companyfacts_sha256`, `versions`, `_retrieved_at` |
| Fehlende Werte bleiben null | `quality.py`, `docs/SEC_NORMALIZATION.md` |

Der Datenstrom war nie das Problem. Das Universum war es.

---

## 5. Abnahme §56 — Stand

| | Stand | |
|---|---|---|
| US-Titel besitzen CIK Mapping, soweit verfügbar | **Pipeline steht, Lauf fehlt** | `build-cik-map.mjs`, sec.gov aus dieser Umgebung geblockt |
| SEC-Pipeline ist nicht mehr künstlich auf fünf Titel begrenzt | **erledigt** | Universum kommt aus dem Master; im Test >1.000 Emittenten |
| Fundamental Facts werden normalisiert | **war schon erledigt** | `normalize.py`, unverändert |
| Perioden werden korrekt behandelt | **war schon erledigt** | `periods.py`, `fiscal.py` |
| Derived Metrics funktionieren | **war schon erledigt** | `derived.py` |
| Data Provenance bleibt erhalten | **erledigt** | auch auf dem Sammelweg — geprüft |
| Stock Page kann neue Fundamentals konsumieren | **erledigt** | `getFundamentals()` im Frontend-Vertrag |
| fehlende Daten bleiben null | **erledigt** | die Aktienseite sagt, was fehlt und warum |
| keine fundamentalen Werte werden erfunden | **erledigt** | kein Ersatzdatensatz, nirgends |
