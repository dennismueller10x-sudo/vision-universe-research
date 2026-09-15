# VU FUNDAMENTAL DATA EXPANSION — Company Master 7.803 / 7.004 und die Fundamentalschicht

Fortsetzung von `docs/VU_UNIVERSE_EXPANSION.md` und
`docs/VU_SEC_UNIVERSE_SCALE.md`. Dort wurde das Universum erweitert; hier
bekommt es eine Emittentenebene und eine gemessene Fundamentalschicht.

---

## 1. Quelle der Wahrheit: der US-Wertpapierstamm

Der 5.690er Stand ist abgelöst. Maßgeblich ist der bereits akzeptierte
Security-Master-/Eligibility-Stand:

| | |
|---|---:|
| Mitglieder | **7.803** |
| ELIGIBLE | 6.477 |
| SEPARATE_CLASS (Vorzüge) | 308 |
| REVIEW | 219 |
| **Produkttitel** | **7.004** |
| EXCLUDED (bestätigte Nicht-Aktien) | 799 |

Übernommen aus `claude/vu2-data-stack-integration`:
`quant/data/market/security-master/eligibility.json` (7.803 Entscheidungen),
`summary.json` und die zugehörige Mitgliedsdatei
`quant/data/market/scale/universe-FULL_UNIVERSE.json`.

**Nicht nachgerechnet.** Der Company Master ist Konsument dieser
Entscheidung, nicht ihr zweiter Urheber. Eine parallele Eignungslogik wäre
genau die Struktur, die der Auftrag ausschließt.

### Die Prüfsumme, die beides zusammenhält

`eligibility.json` nennt ihre Mitgliederliste **mit sha256**. Der Bau prüft
das und bricht ab, wenn es nicht stimmt:

```
Mitglieder-Pruefsumme: stimmt
8d4f64c6c750ee44f3d39569047469fcdd66183bc15d846973f71e3a9be69741
```

Eine Produktentscheidung auf einer anderen Mitgliederliste ist keine
Entscheidung.

### Produkttitel sind Mitglieder, nicht Listings

**BGC, COHR, DCOM, SGI, SUNE und TRAK** liegen je an zwei Börsen:

```
7.809 Instrumente   (Listings)
7.803 Mitglieder    (Wertpapierstamm)
7.004 Produkttitel  (Mitglieder ohne die 799 EXCLUDED)
```

Wer Listings zählt, kommt auf 7.010 und liegt um sechs daneben. Das
Instrument trägt deshalb `masterMemberId`, und der Deckungsbericht zählt
Mitglieder.

---

## 2. Drei Identitätsebenen (§8, §15)

```
instrumentId    vu_<14 hex>          ein Listing: Ticker, Börse, Aktienklasse
masterMemberId  ref_AAPL             ein Mitglied des Wertpapierstamms
issuerId        iss_cik_0000320193   eine Gesellschaft: CIK, Fundamentalhistorie
```

**Die CIK ist die Identität der Gesellschaft, und nichts sonst.** Kein
Firmenname, kein Ticker-Präfix, keine Heuristik. „Alphabet Inc Class A"
und „Alphabet Inc Class C" sind derselbe Emittent; „Berkshire Hathaway
Inc" und „Berkshire Hills Bancorp" sind es nicht — aus den Namen allein
ist dieser Unterschied nicht zu holen.

Ohne CIK gibt es deshalb **keine** Emittenten-ID, sondern einen Eintrag in
`CIK_UNRESOLVED`.

### Drei Zustände, nicht zwei (§3)

| Zustand | Bedeutung |
|---|---|
| `CIK_RESOLVED` | eine CIK, belegt |
| `CIK_UNRESOLVED` | die SEC kennt das Kürzel nicht |
| `CIK_AMBIGUOUS` | mehrere Kandidaten, keiner belegt |

`AMBIGUOUS` ist ausdrücklich nicht `UNRESOLVED`: das eine heißt „wir wissen
es nicht", das andere „wir hätten die Wahl und dürfen sie nicht treffen".

Die CIK-Zuordnung ließ bei widersprüchlichen SEC-Verzeichnissen früher die
Börsendatei gewinnen. Das war eine Wahl und keine Auflösung. Ambige
Einträge bekommen jetzt **gar keine CIK**, tragen beide Kandidaten und
stehen in der Bilanz.

### Vorrang der Quellen

1. **SEC-Verzeichnisse** (`company_tickers.json`, `company_tickers_exchange.json`)
2. **`quant/config/sec-universe.json`**, wo eine Übersteuerung *erklärt* ist

XOM ist der reale Fall: der Ticker zeigt bei der SEC auf eine neue Holding
mit einem einzigen Filing, die gesamte Fundamentalhistorie liegt beim alten
CIK. Die Konfiguration übersteuert das mit belegter Begründung — dieselbe
Regel wie in `scripts/quant/cli.py`, und ein Test prüft, dass eine spätere
SEC-Zuordnung sie nicht stillschweigend kippt.

---

## 3. Zwei echte Befunde aus dem Abgleich

### 308 Vorzugspapiere galten als Stammaktien

Der Klassifikator kannte nur die zusammengezogene Schreibweise (`BAC-PB`).
Die getrennte (`CTA-P-B`, `WFC-P-Y`, `SLG-P-I`) endet auf `-<Buchstabe>` und
lief in die Aktienklassen-Regel: **alle 308** Vorzugspapiere wurden als
Stammaktien geführt.

Der Wertpapierstamm hatte das gesehen — seine Entscheidungen tragen dafür
eigens die Marke `BASE_CLASSIFIER_MISSED_SUFFIX`. Die Regel ist ergänzt;
`BRK-B`, `BF-A` und `CRD-B` bleiben Stammaktien.

### 2.119 Titel hätten einen Kursverlauf bekommen, den es nie gab

Die Mitgliedsdatei ist seit dem Tiingo-Gate-Lauf um 2.119 Titel gewachsen
(`selection: appendedFrom:US_SECURITY_MASTER`). Die Ableitung der stillen
PASS-Fälle liest die Mitgliedsdatei — und hätte allen Zugängen einen
geprüften Kursverlauf zugeschrieben. Die Bilanz wäre von 5.690 auf 7.809
gesprungen, ohne dass ein einziger Kurs geholt wurde.

Die Ableitung achtet jetzt auf die Laufgröße aus dem Gate-Bericht selbst
und auf die Herkunftsmarke. Ein Test prüft die Obergrenze:

```
gate-FULL_UNIVERSE:  3.446 mit Bericht + 2.238 stilles PASS = 5.684 = Laufgröße
                     2.119 nicht in diesem Lauf
```

### Und ein dritter: die Screenerfähigkeit

Sie folgt jetzt der Produktentscheidung statt der eigenen Klassifikation.
Sonst stünden **457 Optionsscheine, 290 Units und 129 Bezugsrechte** im
Aktienscreener, weil das Tickermuster sie nicht verrät.

Widersprüche zwischen eigener Klassifikation und Wertpapierstamm werden
**festgehalten statt still korrigiert**: 909, aufgeschlüsselt nach Gattung.
Eine Zahl, die still wächst, ist eine Regel, die etwas nicht mehr sieht.

---

## 4. Kanonische Taxonomie: 27 → 40 Kennzahlen (§5, §7)

`quant/config/sec-metric-registry.json`, Version **1.1.0**. Dreizehn
ergänzt:

| Bereich | Neu |
|---|---|
| GuV / Cashflow | `depreciation_and_amortization` |
| Bilanz | `current_assets`, `current_liabilities`, `inventory`, `receivables`, `retained_earnings`, `goodwill`, `intangible_assets` |
| Cashflow | `investing_cash_flow`, `financing_cash_flow`, `share_repurchases`, `debt_issued`, `debt_repaid` |

Alle **optional**: ein Emittent ohne Goodwill hat keinen Goodwill, das ist
kein Fehlerfall.

Jede Kennzahl mappt auf mehrere us-gaap-Konzepte mit **eindeutiger,
aufsteigender Priorität** — die Registry weist gleiche Prioritäten beim
Laden zurück, weil eine nicht-deterministische Auswahl genau der
`AMBIGUOUS_MAPPING`-Fall ist, den diese Pipeline nicht rät.

### EBITDA ist ableitbar

EBITDA war als `UNSUPPORTED` geführt, und der Grund stand ehrlich dabei:
die Abschreibungen fehlten in der Registry. Sie stehen fast nie in der GuV,
sondern in der Kapitalflussrechnung.

```
ebitda = operating_income + depreciation_and_amortization
```

Ohne Abschreibungen bleibt EBITDA **null mit Grund** (`MISSING_INPUT`).
Das operative Ergebnis als EBITDA auszugeben wäre eine Behauptung über eine
Größe, die nie gemessen wurde — ein Test prüft genau diesen Fall.

### Versionsdisziplin

`NORMALIZATION_LOGIC_VERSION` 1.5.0 → **1.6.0**, `FORMULA_VERSION` 1.0.0 →
**1.1.0**, Quelldigest neu. Ohne diesen Schritt gilt jeder gespeicherte
Factbook weiter als aktuell, und EBITDA fehlte dort für immer. Das ist
kein hypothetisches Risiko: `test_version_discipline.py` existiert, weil
es einmal passiert ist.

---

## 5. Speicherentwurf (§16)

Ein kanonisches Bündel ist **404 KB** (gemessen an AAPL, 962 Fakten). Mal
7.004 Emittenten sind das **2,8 GB**. Ein Git-Repository ist kein
Datenspeicher.

```
quant/data/fundamentals/          committed, kompakt
  manifest.json
  issuers/<cikLast3>.json         eine Bilanzzeile je Emittent (~1 KB)
  coverage-report.json            §11
  history-coverage.json           §12
  overlap.json                    §13
  quality.json                    §14
  gaps.json                       §20

quant/data/sec/facts/             Arbeitsablage, gitignored
  vollständige Factbooks mit Herkunft je Wert
```

Die volle Historie gehört langfristig in dieselbe Objektablage wie die
Kursreihen (`docs/VU_HISTORY_STORAGE_ARCHITECTURE.md`, Cloudflare R2). Das
ist eine Anbindung, kein Umbau — und sie ist ausdrücklich **nicht** Teil
dieses Workstreams (§18).

Inkrementell: der Emittentenstamm und die Fundamentalbilanz werden in
Scherben geschrieben, und nur geänderte Scherben landen im Commit.

---

## 6. Coverage wird gemessen, nicht behauptet (§11, §19)

**Der Nenner ist das Produktuniversum, nicht der eigene Bestand.** Eine
Pipeline, die fünf Emittenten vollständig abdeckt und gegen fünf
Emittenten zählt, meldet 100 Prozent Coverage und liegt um 6.999 Titel
daneben. Ein Test prüft genau das.

Zwei Dinge, die dabei stimmen müssen:

1. **Gezählt wird über den `PeriodResolver`**, nicht über die rohen
   Zeitreihen. Die Rohdaten führen `Q1`, `YTD2`, `YTD3` und `FY`, weil
   Emittenten kumuliert melden — wer diese Schlüssel zählt, zählt
   Meldungen statt vergleichbarer Perioden (§8).
2. **Eine Periode ohne auflösbaren Wert zählt nicht.** Sonst wäre jede
   leere Hülle eine Deckung.

### Zwei Quellen, getrennt ausgewiesen

Der Faktenspeicher ist gitignored — auf einem frischen Checkout ist er
leer. Was im Repository liegt, sind die kanonischen Bündel der Golden
Five. Beide werden gelesen, und die Herkunft steht im Bericht
(`BY_SOURCE`), damit „nicht vorhanden" nicht mit „nicht in der
Arbeitsablage" verwechselt wird.

---

## 7. Gemessener Stand

Ohne Netzzugang (`sec.gov` und `api.tiingo.com` sind aus der Bauumgebung
mit **403** am Egress-Proxy gesperrt — protokolliert im Proxy-Status):

| | |
|---|---:|
| Produkttitel | **7.004** |
| Emittenten im Produktuniversum | 5 |
| CIK_RESOLVED | 5 |
| CIK_UNRESOLVED | 7.804 |
| CIK_AMBIGUOUS | 0 |
| Emittenten mit Geschäftszahlen | **5** |
| davon aus ausgelieferten Bündeln | 5 |
| Historientiefe je Emittent | 18,25 – 18,75 Jahre |
| Quartalsperioden je Emittent | 73 – 76 |

**Marktdatendeckung ist nicht Gegenstand dieses Workstreams.** Der
abgenommene Stand kommt aus dem R2-Workstream — `R2_SERIES_AVAILABLE
7.802`, `HISTORICAL_CHART_AVAILABLE 6.997 / 7.004 = 99,90 %` — und ist
hier nur als benannte Fremdquelle vermerkt
(`overlap.marketDataSource`, Status `NOT_CONNECTED`). Was sich aus den
Tiingo-Gate-Läufen ableiten ließe, ist eine andere und ältere Größe; sie
steht unter `fromGateRuns` und ist ausdrücklich **keine**
Marktdatendeckung. Der Overlap wird erst berechnet, wenn die kanonische
Quelle eingebunden ist.

Die vollständigen Zahlen stehen in
`docs/VU_FUNDAMENTAL_ACCEPTANCE_REPORT.md` und maschinenlesbar unter
`quant/data/fundamentals/`.

---

## 8. Was ein Lauf mit Zugang ändert

```
Actions → "SEC Fundamentals — Universum" → backfill: true
```

1. Zwei Anfragen holen CIK **und Firmennamen** für den ganzen US-Markt.
2. Der Company Master bekommt 7.291 fehlende Firmennamen und die CIKs.
3. Der Emittentenstamm wächst von 5 auf mehrere Tausend.
4. Der Ingest läuft über den **Sammelweg**: eine Anfrage für alle
   companyfacts statt einer je Emittent (§4, §25).
5. `coverage-universe` misst danach, was tatsächlich angekommen ist.

Anfragebudget bei 7.000 Emittenten: ~7.000 Einreichungsübersichten plus
**eine** für das Sammelarchiv, bei 5 Anfragen/s rund **25 Minuten** reine
Anfragezeit. Die Zahl steht im Artefakt (`requestBudget`), nicht in einer
Annahme.

---

## 9. Was die SEC strukturell nicht liefern kann (§20)

`quant/data/fundamentals/gaps.json` führt fünf Ursachen mit der Frage, ob
die SEC sie grundsätzlich liefern kann:

| Ursache | SEC kann liefern | |
|---|---|---|
| `CIK_UNRESOLVED` | teilweise | Der Abruf fehlt, nicht die Daten. |
| `CIK_AMBIGUOUS` | ja | Über die Einreichungsübersicht je Kandidat. Eine Vorrangregel wäre Raten. |
| `NOT_INGESTED` | ja | Emittenten mit CIK, für die noch kein Abruf lief. |
| `FOREIGN_PRIVATE_ISSUER` | eingeschränkt | 20-F und 40-F sind geführt, IFRS-Taxonomien sind nicht gemappt. |
| `NO_SEC_FILER` | **nein** | ADRs ohne eigene Einreichung, ausländische Emittenten ohne US-Registrierung. |

**Die Providerentscheidung bleibt offen.** Sie auf ungemessenen Lücken zu
treffen wäre eine Ausgabe auf Verdacht. Die CI prüft, dass dieser Satz im
Artefakt steht.
