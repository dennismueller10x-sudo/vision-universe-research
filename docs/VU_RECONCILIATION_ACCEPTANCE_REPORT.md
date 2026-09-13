# ACCEPTANCE REPORT — FUNDAMENTALS × MARKET DATA RECONCILIATION

Abgleich der SEC-Fundamentalschicht mit dem akzeptierten
Marktdaten-/Technical-Universum, Lückenklassifikation, Backtest-Readiness
und Data Handoff.

Alle Zahlen **gemessen** (`cli.py reconcile`). Marktdaten wurden
ausschließlich **read-only** konsumiert: keine Kurse geladen, R2 nicht
verändert, keine Eligibility neu gerechnet, kein Provider integriert.

---

## 1 — UNIVERSE

| | Titel | Anteil |
|---|---:|---:|
| `PRODUCT_TITLES` | **7.004** | 100 % |
| `MARKET_HISTORY_AVAILABLE` | 5.397 | 77,056 % |
| `TECHNICAL_COVERED` | 5.378 | 76,7847 % |
| `FUNDAMENTAL_COVERED` | 5.813 | 82,9954 % |
| `PIT_READY` | 4.928 | 70,3598 % |

### Die Differenz zum abgenommenen R2-Stand

Der abgenommene Stand nennt **6.997** Titel mit Kurshistorie und
**5.963** technisch geeignete. Zuordnen lässt sich in diesem Zweig
**5.397** bzw. **5.378**.

| | Differenz |
|---|---:|
| Kurshistorie, nicht zuordenbar | 1.600 |
| Technical, nicht zuordenbar | 585 |

**Der abgenommene Stand liegt hier nur als Summe vor, nicht je Papier.**
Eine Summe lässt sich nicht schneiden. Jede Schnittmenge unten ist
deshalb gegen die belegbare Ableitung gerechnet — gegen die abgenommene
Summe zu schneiden hätte eine Schätzung mit zwei Nachkommastellen
ergeben. Die Differenz ist die Aufgabe, die der Anschluss an die
kanonische R2-Quelle löst; sie ist **kein Datenverlust**.

---

## 2 — OVERLAP

| | Titel |
|---|---:|
| `TECHNICAL_AND_FUNDAMENTAL` | **4.676** |
| `TECHNICAL_WITHOUT_FUNDAMENTALS` | 702 |
| `FUNDAMENTALS_WITHOUT_TECHNICAL` | 1.137 |
| `HISTORICAL_PRICE_AND_FUNDAMENTAL` | 4.683 |
| `PIT_AND_TECHNICAL` | 4.172 |
| `PIT_AND_HISTORICAL_PRICE` | 4.175 |
| `PIT_TECHNICAL_AND_HISTORY` | **4.172** |

Der Join läuft über `masterMemberId` → `issuerId` → CIK, **nie über das
Kürzel**: Kürzel werden nach einem Delisting wiederverwendet. Zwei
Aktienklassen referenzieren eine Historie und verdoppeln sie nicht.

---

## 3 — CORE METRICS

Basis: **5.378** technisch gedeckte Titel.

| Kennzahl | `COUNT` | Anteil |
|---|---:|---:|
| `TECHNICAL_WITH_REVENUE` | 3.747 | 69,6727 % |
| `TECHNICAL_WITH_NET_INCOME` | 4.160 | 77,3522 % |
| `TECHNICAL_WITH_EPS` | 4.008 | 74,5258 % |
| `TECHNICAL_WITH_OPERATING_CASH_FLOW` | 4.152 | 77,2034 % |
| `TECHNICAL_WITH_FCF` | 3.833 | 71,2718 % |
| `TECHNICAL_WITH_ASSETS` | 4.160 | 77,3522 % |
| `TECHNICAL_WITH_DEBT` | 2.413 | 44,868 % |
| `TECHNICAL_WITH_EQUITY` | 4.123 | 76,6642 % |

`TECHNICAL_WITH_DEBT` ist der Ausreißer nach unten. Die Ursache steht in
§6: Gesamtverschuldung wird selten als eigene Zeile gemeldet und muss aus
lang- und kurzfristigen Posten rekonstruiert werden.

---

## 4 — HISTORY

| Jahrestiefe | `COUNT` | Anteil |
|---|---:|---:|
| `TECHNICAL_WITH_ANNUAL_1Y` | 3.728 | 69,3194 % |
| `TECHNICAL_WITH_ANNUAL_3Y` | 3.601 | 66,958 % |
| `TECHNICAL_WITH_ANNUAL_5Y` | 3.319 | 61,7144 % |
| `TECHNICAL_WITH_ANNUAL_10Y` | 2.283 | 42,4507 % |
| `TECHNICAL_WITH_ANNUAL_15Y` | 1.694 | 31,4987 % |

| Quartalstiefe | `COUNT` | Anteil |
|---|---:|---:|
| `TECHNICAL_WITH_QUARTERLY_1Y` | 3.388 | 62,9974 % |
| `TECHNICAL_WITH_QUARTERLY_3Y` | 3.264 | 60,6917 % |
| `TECHNICAL_WITH_QUARTERLY_5Y` | 3.048 | 56,6753 % |
| `TECHNICAL_WITH_QUARTERLY_10Y` | 2.145 | 39,8847 % |

---

## 5 — GAPS

**3.824** von 7.004 Titeln haben ausreichende Fundamentaldaten
(mindestens ein auflösbarer Wert und mindestens drei Jahre Historie).
**3.180** haben eine Lücke, jede mit Grund:

| Grund | Titel | Anteil | Zuordnung |
|---|---:|---:|---|
| `VERY_YOUNG_LISTING` | 852 | 12,1645 % | `RESOLVES_WITH_TIME` |
| `INSUFFICIENT_HISTORY` | 701 | 10,0086 % | `EXTERNAL_PROVIDER_CANDIDATE` |
| `FOREIGN_ISSUER` | 561 | 8,0097 % | `SEC_RECOVERABLE` |
| `NO_CIK` | 389 | 5,554 % | `REQUIRES_REVIEW` |
| `SPECIAL_SECURITY_STRUCTURE` | 312 | 4,4546 % | `BY_DESIGN` |
| `MISSING_CANONICAL_TAG_MAPPING` | 205 | 2,9269 % | `SEC_RECOVERABLE` |
| `SEC_DATA_PRESENT_BUT_NOT_NORMALIZED` | 97 | 1,3849 % | `SEC_RECOVERABLE` |
| `NO_SEC_COMPANY_FACTS` | 42 | 0,5997 % | `SEC_RECOVERABLE` |
| `UNIT_OR_CURRENCY_CONFLICT` | 21 | 0,2998 % | `SEC_RECOVERABLE` |

### Wer schließt die Lücke?

| Gruppe | Titel | Bedeutung |
|---|---:|---|
| `SEC_RECOVERABLE` | **926** | Daten liegen bei der SEC, unsere Pipeline mappt sie nicht |
| `EXTERNAL_PROVIDER_CANDIDATE` | **701** | ein zweiter Anbieter könnte tatsächlich helfen |
| `RESOLVES_WITH_TIME` | 852 | Notierung zu jung — kein Anbieter verkauft Historie, die es nicht gibt |
| `BY_DESIGN` | 312 | Vorzüge, Einheiten, Bezugsrechte melden keinen eigenen Abschluss |
| `REQUIRES_REVIEW` | 389 | von hier aus nicht entscheidbar |

**Ein Befund, der die Anbieterfrage gedreht hat.** Ein früherer Entwurf
führte 838 Titel ohne CIK als `IDENTITY_MAPPING_GAP` und damit als
`SEC_RECOVERABLE` — „die SEC führt jeden Einreicher". Nachgesehen: von
1.146 Produkttiteln ohne CIK steht **kein einziger** in den beiden
SEC-Verzeichnissen (10.426 Kürzel); unter den Beispielen sind
NASDAQ-Testsymbole (`ZXZZT`), Vorzüge und Schuldverschreibungen. `SEC_RECOVERABLE` fiel damit von 1.764 auf 926.

### Priorität

| # | Gruppe | Titel | davon SEC | davon Provider |
|---|---|---:|---:|---:|
| 1 | Technisch gedeckt, aber keinerlei Fundamentaldaten | 702 | 34 | 0 |
| 2 | Fundamentaldaten vorhanden, aber zentrale Kennzahlen fehlen | 1.612 | 884 | 496 |
| 3 | Fundamentaldaten vorhanden, Historie zu kurz | 1.104 | 0 | 701 |
| 4 | Nicht zeitpunktgenau abfragbar | 885 | 884 | 0 |
| 5 | Spezial- und Randfaelle | 531 | 54 | 26 |

Die Gruppen überschneiden sich bewusst; jede beantwortet eine eigene
Frage. Ihre Summe ist **keine** Titelzahl.

---

## 6 — BACKTEST READINESS

| Stufe | Titel |
|---|---:|
| `BACKTEST_PRICE_READY` | 5.397 |
| `BACKTEST_TECHNICAL_READY` | 5.378 |
| `BACKTEST_FUNDAMENTAL_READY` | 4.172 |
| `BACKTEST_PIT_READY` | **4.172** |
| `BACKTEST_5Y_READY` | 3.319 |
| `BACKTEST_10Y_READY` | 2.283 |
| `BACKTEST_15Y_READY` | 1.694 |

Jede Stufe ist eine echte Teilmenge der vorigen.

**`BACKTEST_PIT_READY` und `BACKTEST_FUNDAMENTAL_READY` sind gleich — und
das ist kein Rechenfehler.** Von 4.627 Emittenten mit mindestens einem
auflösbaren Wert sind alle 4.627 `PIT_READY`, `PIT_PARTIAL` ist 0.
XBRL-Fakten der SEC tragen `accn` und `filed` **immer**. Die Prüfung
bleibt, weil sie bei einem zweiten Anbieter die erste Frage wäre;
folgenlos ist sie nur hier.

**Was diese Zahl nicht sagt:** dass ein Backtest look-ahead-frei *ist*.
Sie sagt, dass die Daten alles tragen, um ihn so zu *rechnen*. Ob eine
Abfrage das nutzt, entscheidet ihre Restatement-Politik
(`POLICY_AS_OF_LATEST` statt `POLICY_LATEST_KNOWN`) — und die gehört der
Engine, nicht diesem Bericht.

`SURVIVORSHIP_FREE_UNIVERSE` bleibt **false**: SEC/EDGAR führt keinen
Delisting-Ereignisfeed.

---

## 7 — QUALITY

Drei Ebenen, drei Nenner. **Sie dürfen nicht addiert werden.**

**Je aufgelöstem Wert** (1.813.323):

| Zustand | Werte |
|---|---:|
| `VALID` | 1.649.267 |
| `WARNING` | 164.056 |

**Je rohem XBRL-Fakt mit Befund**
(51.400.511):

| Zustand | Fakten |
|---|---:|
| `AMBIGUOUS` | 1.272.985 |
| `RESTATED` | 290.387 |
| `NON_COMPARABLE` | 185.884 |
| `MISSING` (nicht gemappt) | 49.633.988 |

`UNKNOWN_CONCEPT` heißt **„von der Registry nicht gemappt"**, nicht
„fehlerhaft". Ein Emittent meldet Tausende Konzepte, von denen die
wenigsten gebraucht werden. Ein früherer Entwurf addierte diese Ebene mit
der obigen und meldete 49,6 Millionen `MISSING` gegen 1,6 Millionen
`VALID` — ein Kategorienfehler, der wie eine Katastrophe aussah.

**Je Titel** (7.004):

| Zustand | Titel |
|---|---:|
| `AVAILABLE` | 3.824 |
| `PARTIAL` | 1.104 |
| `MISSING` | 885 |
| `UNAVAILABLE` | 1.191 |

Höchste Fehlquote: `total_debt` — bei 46,38 % der Emittenten mit Werten
lässt sie sich nicht auflösen.

---

## 8 — DATA HANDOFF

`docs/VU_FUNDAMENTAL_DATA_CONTRACT.md` ist der verbindliche Vertrag für
Stock Intelligence, Fundamental History, Quant, Screener, Compare,
Rankings, Strategy Lab, Backtesting, Portfolio Intelligence, Atlas/AI und
Reports.

17 Tests prüfen ihn gegen die **ausgelieferten** Bündel — darunter der,
auf den es ankommt: kein Wert darf vor dem Ende seiner eigenen Periode
eingereicht worden sein. Das ist die Definition eines Leaks.

---

## 9 — WAS NICHT GETAN WURDE

- **Kein Provider integriert.** Die größte einzelne Gruppe heißt
  `SEC_RECOVERABLE`; ein Zukauf wäre Geld für Daten, die bereits bei der
  SEC liegen.
- **Keine Frontend-Arbeit.** Keine VU2-Seite, kein Chart, kein Discover.
- **Keine Market-Data-Pipeline verändert**, kein R2-Schreibzugriff, keine
  Kursdaten geladen.
- **Keine neue Eligibility-Logik.** Der Wertpapierstamm blieb unberührt.

---

## 10 — NÄCHSTER SCHRITT, NICHT GETAN

Der Anschluss an die kanonische R2-Quelle je Papier. Er schließt die 1.600 nicht zuordenbaren Titel und
macht aus der belegbaren Ableitung den abgenommenen Stand. **Erst
danach** ist die Anbieterfrage entscheidbar — und auch dann erst, wenn
die 926 `SEC_RECOVERABLE`-Titel abgearbeitet sind.

---

*Gemessen am 2026-09-13 aus
`quant/data/fundamentals/`. Fundamentalstand: Lauf 34716547144.*
