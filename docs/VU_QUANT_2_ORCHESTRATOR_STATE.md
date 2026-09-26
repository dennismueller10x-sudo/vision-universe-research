# Vision Universe® Quant 2.0 — Orchestrator State

Updated: 2026-09-26 UTC

## M41 — DIE NAMEN LAGEN DA UND NIEMAND HAT SIE GELESEN

`COMPANY_NAME_COVERAGE = 6.857 von 6.875` · `TICKER_AS_NAME = 0` ·
`NAME_TYPE_EVIDENCE_AUDIT = PASS`

Punkt 9 verlangt, nach M40 mit dem nächsten **gemessenen** Product-Gap weiterzumachen. Die
Kohärenzmessung hat ihn benannt: die Übersicht schrieb bei **1.102 von 6.875 Zeilen** ihren Ticker
zweimal.

    AAAC | AAAC | 20,12 $        statt      AAAC | Columbia AAA CLO ETF | 20,12 $

Der Name war die ganze Zeit veröffentlicht. `quant/data/market/security-master/company-names.json`
(`company-names-1.0.0`, 15.09.2026) löst **6.855 der 6.875** Produkttitel auf — mit `displayName` in
gepflegter Schreibweise, `nameSource`, `nameAsOf`, den Kandidaten je Quelle und einer
Konfliktspalte. Genau **20** tragen überhaupt keinen Anbieternamen. Der Company Master las fünf
andere Quellen und **diese nicht**; die Aktienseite zeigte den Namen längst, weil der Konsum-Export
dieselbe Schicht überlagert. Nur der Stamm und die Liste wussten nichts davon.

**Das korrigiert eine Aussage aus M38.** Dort steht, die 1.100 namenlosen Titel hätten „in keiner
lokalen Quelle" einen Namen. Geprüft wurde damals das SEC-Kürzelverzeichnis — nicht diese Schicht.
Richtig ist: 18 im Produktuniversum haben keinen (`PROVIDER_HAS_NO_NAME`, erneuter Versuch ab
2026-10-14), die übrigen haben einen.

### Zwei Fehler auf dem Weg, beide vom Diff gefangen

**Der erste Block stand an der falschen Stelle.** Er landete vor der SEC-Quelle — und die ist die
letzte und breiteste. Gemessen hat er damit **5.066 bereits bekannte Namen überschrieben**: „Alcoa
Corp" wurde „Alcoa", weil `displayName` die Rechtsform weglässt. Das ist eine
Darstellungsentscheidung über jeden Namen im Produkt und kein Lückenschluss. Der Block steht jetzt
zuletzt; `merke` behält den ersten Treffer, also ist er reine Auffüllung.

**Und der Vergleich selbst war zuerst falsch gebaut.** Der Bauer führt eine persistente
Arbeitsablage (`.market-cache/universe`), und zwei Läufe hintereinander sind deshalb nicht
unabhängig: mein „Basislauf" hat die Namen des vorigen Kandidatenlaufs aus dem Speicher
übernommen und dabei behauptet, sie stammten aus dem Bestand. Erst zwei Läufe mit **eigener**
Ablage (`--work-dir`) ergaben den echten Vergleich.

Der geprüfte Diff, Feld für Feld über 7.809 Instrumente:

| Feld | Instrumente | Beispiel |
|---|---|---|
| `companyName` **neu** | **1.082** | AAAC: null → „Columbia AAA CLO ETF" |
| `companyName` geändert | **0** | — |
| `companyNameStatus` | 1.082 | SOURCE_MISSING → RESOLVED:…company-names.json |
| `adrEvidence` | 1.082 | „unavailable" → „nameChecked" (der Klassifikator hat jetzt einen Namen) |
| `securityType` | 10 | siehe unten |
| Instrumente verloren / dazu | **0 / 0** | Produktuniversum 6.881 unverändert |

### Ein Kürzel ist kein Name — aus keiner Quelle

`dashboard/config/universe.json` führt **AMD als „AMD"** und **ASML als „ASML"**. Weil diese Quelle
hoch steht, trug der Stamm das Kürzel als Firmennamen — mit dem Status `RESOLVED`, also mit der
Behauptung, der Name sei aufgelöst. `merke` weist jetzt jeden Namen ab, der sein Kürzel ist, und die
nächste Quelle antwortet: 4 Titel geheilt, **0 Instrumente mit Ticker-als-Name**. Dieselbe Regel
führt die Namensschicht als `TICKER_AS_NAME`-Ablehnung; sie gehört in den Stamm und nicht in einen
Sonderfall.

Dazu nimmt der Stamm jetzt auch `RESOLVED_OUTSIDE_PRODUCT` (37 Instrumente): er ist der **volle**
Wertpapierstamm, und ein aufgelöster Name gehört hinein, auch wenn das Produkt den Titel nicht
führt. Ohne Namen bleiben 223 von 7.809, davon 18 im Produktuniversum.

### Die Hülle entscheidet vor dem Inhalt

Mit Namen im Stamm belegte ein Name erstmals eine Gattung — und **6 von 11 Belegen waren falsch**.
Beide Fehler kamen aus der **Reihenfolge** der Namensregeln:

- *„Cohen & Steers Short Duration Preferred AND Income Active ETF"* → PREFERRED, weil die
  Vorzugsregel vor der Fondsregel stand. Das Papier **ist** ein Fonds; Vorzugsaktien sind, was es
  **hält**.
- *„Fifth Third Bancorp Depositary Shares … Perpetual Preferred Stock"* → ADR, weil „Depositary
  Share" in der ADR-Regel stand. Das ist eine Hinterlegung auf **eigene** Vorzugsaktien einer
  US-Bank, kein American Depositary Receipt.

Beide Korrekturen **verengen**: die Hülle (ETF/ETN) entscheidet zuerst, ein ADR ist nur durch
„ADR", „ADS" oder „American Depositary" belegt, und eine Hinterlegung ohne weitere Angabe bleibt
zuletzt eine Hinterlegung. Danach sind alle **10** Gattungswechsel richtig, jeder mit dem Namen, der
ihn belegt: 4 × ADR (der Name sagt ADR), 6 × PREFERRED (vier Vorzugs-Hinterlegungen, „Cum Red Pfd
Ser A", „Zacks Preferred Income"). `screenerEligible` bleibt bei 5.938.

### Was der Name über die Gattung sagt — und was nicht (`name-type-evidence-1.0.0`)

| Muster | Beleg | Titel | als Stammaktie geführt |
|---|---|---|---|
| **ETF** | eindeutig | 133 | **133** |
| PREFERRED | eindeutig | 28 | 1 |
| DEPOSITARY_SHARE | eindeutig | 11 | 0 |
| SENIOR_NOTES | eindeutig | 6 | 4 |
| ADR_ADS | eindeutig | 6 | 0 |
| TRUST | **mehrdeutig** | 188 | 135 |
| FUND | **mehrdeutig** | 57 | 43 |
| INDEX / PORTFOLIO / UNIT | **mehrdeutig** | 16 | 13 |

Die Mehrdeutigen bleiben unangetastet, jeder mit seinem Gegenbeispiel: „American Assets Trust" ist
ein REIT, also eine Aktie; „Altisource Portfolio Solutions" ist ein Betrieb. Eine Regel darauf
würde REITs umklassifizieren — das wäre geraten.

**Die offene Entscheidung: 133 Titel, deren Name ETF sagt, gelten als Stammaktie.** Der
Klassifikator lehnt das ausdrücklich ab, wenn der Anbieter `assetType = "Stock"` meldet — und M37
hat gemessen, dass dieses Feld für **7.801 von 7.803** Instrumenten „Stock" lautet und damit nahezu
nichts unterscheidet. Heutige Folge: 27 dieser Fonds tragen mindestens eine bewertete Eigenschaft,
5 einen berechneten Börsenwert, **keiner** eine bewertete Bewertung. Eine Umklassifizierung nimmt
Titel aus dem Screener-Umfang und verändert damit den Umfang des Produktuniversums — das ist eine
**Owner-Entscheidung** und kein Fix. Der Bericht legt die Zahlen hin und entscheidet nicht.

Das korrigiert M37 im gleichen Zug: „keine lokale Angabe trennt Nicht-Eigenkapital von
Stammaktien" war richtig über `assetType`, CUSIP, FIGI, ISIN und das SEC-Verzeichnis — und wurde
gemessen, **bevor** der Stamm Namen für diese Zeilen hatte.

### Oberfläche und Nachweis

Wo kein Name vorliegt, steht das da: die Zeile schreibt „Firmenname nicht veröffentlicht" statt des
Kürzels ein zweites Mal, und die Aktienseite überschreibt sich mit „Aktienanalyse" statt mit dem
Kürzel, unter dem dasselbe Kürzel steht.

Sechs neue Testfälle, sabotagegeprüft (Regelreihenfolge zurückgedreht → Fall 4 fällt). Zwei davon
haben sich zuerst selbst ausgelöst: die Engine heißt das Feld `ticker` und gibt `instrumentType`
zurück, und meine eigene Begründungsschwelle war länger als meine kürzeste Begründung — beides
behoben, indem die Prüfung richtig und die Begründung substanziell wurde, nicht indem die Schwelle
fiel.

Tests **1.945 grün** (quant) · **273 grün** (discover). Produktions-Smoke: **CLEAN**, 27 Ansichten ×
2 Breiten, Übersicht **100 von 100 Zeilen mit Namen** (die Namensschwelle des Smoke steigt deshalb
von 0,5 auf 0,95 — bei der alten fiel ein Rückfall nicht mehr auf).

## M40 — STOCK INTELLIGENCE COHERENCE

`CONTRADICTORY_STATEMENTS = 0` · `DUPLICATE_PRIMARY_STATEMENTS = 0` ·
`STATEMENTS_WITHOUT_EVIDENCE = 0` · `TECHNICAL_INFORMATION_WITHOUT_STATEMENT = 0`

Bis M39 wurde jedes Modul einzeln gemessen. Jede dieser Zahlen war richtig, und keine
beantwortete die Frage, ob eine Seite **zusammen** etwas sagt. M40 stellt genau die — auf zwölf
Archetypen und einer 500er-Stichprobe — und hat dabei drei echte Widersprüche gefunden, von denen
zwei im Bestand standen und einer beim ersten Lauf der neuen Engine entstand.

### Befund 1: 743 Titel nannten eine schwache Eigenschaft ihre „klarste Stärke"

`FactorEvidence.summarySentence` nahm die höchste der bewerteten Eigenschaften und nannte sie die
Stärke — unabhängig davon, wo sie liegt. Gemessen über **6.441 Titel** ergab das bei **743** den
Satz:

> Unternehmensqualität ist mit **schwach** die klarste Stärke. Risiko ist mit **schwach** die
> klarste Schwäche.

Aus richtigen Zahlen gebaut und trotzdem falsch: die schwächste Eigenschaft eines schwachen Titels
ist keine Stärke, und bei AACG lagen Stärke und Schwäche im **gleichen Band** — dann existiert die
Unterscheidung nicht bloß schief, sondern gar nicht.

Die Grenze ist jetzt das **Band** und nicht die Reihenfolge: über dem Mittelfeld eine Stärke,
darunter eine Schwäche, im Mittelfeld keines von beidem — und dass nichts heraussticht, ist selbst
eine Aussage („Keine der 6 bewerteten Eigenschaften liegt über oder unter dem Mittelfeld"). Beide
Module lesen dieselbe Liste; ein Test prüft den **ganzen Bestand**, weil eine Stichprobe von zwanzig
diesen Satz mit Glück nicht getroffen hätte.

### Befund 2: 266 zurückgehaltene Bewertungen standen trotzdem auf der Seite

Von den **465** Titeln, deren Börsenwert M34 ausdrücklich zurückhält, zeigten **266** drei Zeilen
tiefer doch eine Bewertungszahl:

| Titel | Faktorschicht | Kennzahlenschicht |
|---|---|---|
| GOOGL | Bewertung bewusst zurückgehalten | Kurs-Gewinn-Verhältnis 17,27 · Kurs-Umsatz 9,32 |
| T | zurückgehalten | 8,4 · 1,52 |
| SO (6 Notierungen) | zurückgehalten | 21,2 · 3,18 |
| JPM | zurückgehalten | Ertragsrendite 4,62 % aus 1.408 Mrd. Börsenwert |

Drei Wege führten zu einer Bewertung, und nur einer hielt sich an die Semantik: die Faktorschicht.
Der Konsum-Export und das SEC-Panel rechnen beide weiter — **nachgerechnet, nicht vermutet**:
`f_ps` ist „Kurs × Aktien / Umsatz", `f_fcfYield` ist „Free Cashflow / (Kurs × Aktien)", und `f_pe`
ist „Kurs / (Gewinn / Aktien)", also ebenfalls Kurs × Aktien / Gewinn. **Alle drei tragen die
Aktienzahl des Emittenten** — genau die Zuordnung, die nicht in den Unterlagen steht.

Also fällt die Bewertung jetzt geschlossen, in derselben Form, die diese Schicht für eine fehlende
Freigabe schon kennt: Wert null, Zustand UNAVAILABLE, Grund dabei. Das kostet Deckung — 266 Titel,
bis zu drei Kennzahlen je Titel — und ist der ausdrücklich gewählte Preis: **Korrektheit vor
Reichweite.**

Statt der Zahl steht der Grund, und zwar als Satz: *„Diese Kennzahl braucht den Börsenwert genau
dieser Notierung. Das Unternehmen hat mehrere börsennotierte Wertpapiere, und die veröffentlichte
Aktienzahl gilt für das Unternehmen als Ganzes …"* Der Wert selbst liest „Bewusst nicht genannt"
und nicht „Nicht verfügbar" — das Wörterbuch verlangt für die beiden Lagen zwei verschiedene Texte.

**NICHT betroffen** ist `NO_PIT_SHARE_COUNT` (801 Titel). Dort fehlt der Faktorschicht ein
zeitpunktsicherer Anteilsbestand; das ist eine andere Aussage als „die vorhandene Zahl gilt nicht
für diese Zeile", und eine Zahl auf anderer Grundlage ist keine Fehlzuordnung.

Die Entscheidung erreicht die Seite über das Verzeichnis, das sie ohnehin lädt: `universe-list-1.1.0`
führt `v` (den Grund) und `il` (die Zahl der notierten Zeilen) — 1.266 Einträge, davon 465 mit
zurückgehaltener Zuordnung. Der Dienst liest beide Fassungen; ein älteres Artefakt verliert nichts.

### Befund 3: eine Geschichte stand in zwei Spalten (beim ersten Lauf der neuen Engine)

Die erste Kohärenzmessung fand bei **95 von 120** Titeln dieselbe Eigenschaft auf beiden Seiten:
„Eine schwache Kursentwicklung" dagegen und „Kurstempo verbessert sich" dafür. Beides ist wahr und
gemessen — das eine ist die Lage, das andere ihre Richtung. Als zwei Spalteneinträge liest es sich
trotzdem wie ein Widerspruch.

Die Veränderung tritt jetzt **neben** die Eigenschaft, die sie betrifft, und nicht in die
Gegenspalte. Keine Aussage geht verloren; sie steht an der Stelle, an der sie etwas erklärt. AAPL
bekam dadurch statt zehn Dafür-Zeilen vier — sieben der zehn hatten dieselbe Sache gesagt.

Dabei war auch meine eigene Prüfung zu grob: zwei **verschiedene** Messungen derselben Familie, die
auseinanderlaufen („Bruttomarge verbessert sich" / „Free-Cashflow-Marge verschlechtert sich"), sind
kein Widerspruch, sondern der Befund. Die Identität einer Aussage ist deshalb ihre **Messung** und
nicht ihre Familie.

### Die Auskunft: eine versionierte Engine, kein generativer Text

`intelligence-brief-1.0.0` bildet aus der bereits veröffentlichten Evidenz **eine** Auskunft:

> **Die Aktie zeigt eine hohe Ertragskraft und kräftiges Wachstum, dagegen eine hohe Bewertung.
> Ein Setup ist im Aufbau, aber noch nicht bestätigt.**

Regelbasiert, deterministisch, ohne Prognose und ohne Empfehlung. Sie rechnet nichts: sie bekommt
die Antworten der Dienste und ordnet sie. **Jede** einzelne Aussage trägt ihren Beleg
(`evidence: [{source, field, value, unit}]`), und `statementsWithoutEvidence` prüft das gegen die
echten Artefakte statt gegen eine Konvention.

Keine neuen Schwellen: die Bänder kommen aus `quant-v2.json` (ratingBands), die Asymmetriegrenzen
aus dem Musterartefakt, die Stilschwelle von 40 % aus der Reisemessung. Ein zweiter Satz Schwellen
wäre eine zweite Methodik.

**Dafür / Dagegen / Noch nicht bewertbar** — drei Gruppen, nicht zwei Sortierungen derselben Liste.
Die dritte trägt, was ausdrücklich *nicht* bewertet wurde; ohne sie liest sich eine kurze
Dafür-Liste wie ein Urteil. Und sie ist keine Wiederholung der Faktorwerte: „Eine hohe Bewertung"
steht in der ersten Zeile, die Zahl in der zweiten.

**Das Setup als Handlungslogik** — vier Fragen, vier Antworten, aus derselben Kaskade:

> **Bestätigt** — Ein bestätigtes Setup liegt vor.
> *Warum?* Struktur, Trend und Volumen bestätigen am selben Stichtag dieselbe Lage.
> *Was müsste als Nächstes passieren?* In der entscheidbaren Stufe gibt es über diesem Zustand
> keine weitere Regel; die Verlaufszustände darüber verlangen eine geordnete Beobachtungshistorie
> und sind noch nicht freigeschaltet.
> *Was würde es beenden?* Dieser Zustand trägt 5 erfüllte Bedingungen. Fällt eine davon weg, gilt
> er nicht mehr.

Dass in der entscheidbaren Stufe ein früherer Vorrang den **stärkeren** Zustand bedeutet, ist eine
Eigenschaft dieser Zuordnung und keine allgemeine Wahrheit. Ein Test hält sie gegen die
veröffentlichte Methodik — ändert sie sich, fällt der Test und nicht der Leser.

**Der Anlagestil als Satz**: „Am ehesten passt die Aktie derzeit zum Stil Momentum Leader." Passt
keiner über der Schwelle: „Kein Anlagestil passt derzeit klar. Am nächsten kommt Quality
Compounder." Dazu erfüllt / offen / **nicht messbar** — das Letzte getrennt, weil es der Grund für
eine schlechtere Passung ist und weder als erfüllt noch als verletzt zählt.

**Chance gegen Risiko als Primärsprache**: „Ähnliche Situationen hatten historisch mehr Aufwärts-
als Abwärtsasymmetrie." Darunter die Aufwärts- und die Abwärtsseite gegen die Grundgesamtheit, die
Stichprobe (118.376 vergleichbare Beobachtungen) und die Belastbarkeit (3 von 3 Mustern hielten
außerhalb ihres Fundzeitraums). Chance nie ohne Kehrseite — als Struktur, nicht als Konvention.

### Die obere Hälfte einer Aktienseite (390 px)

Gemessen am gebauten Release: die erste Bildschirmhöhe zeigte Name, Etikett, Kurs,
Aktualitätszeile — und dann einen Chart. Die fünf Einstiegsfragen wurden in Abschnitt vier, sechs
und sieben beantwortet, die Abwägung überhaupt erst auf der Quant-Ansicht.

Die Auskunft steht jetzt **zwischen Kurs und Chart**, bei 390 px **443 px** vom Seitenanfang. Der
Smoke prüft die Reihenfolge im DOM (`compareDocumentPosition`) und nicht nur, *dass* es die
Auskunft gibt — ein Abschnitt hinter dem Chart wäre derselbe Befund nochmal.

Ein Leseweg für die ganze Seite: `getIntelligenceBrief` ruft die sechs Dienste einmal, die Seite
nimmt `brief.sources` für alles Weitere. Auch die Quant-Ansicht liest dieselbe Engine — vorher
bildete sie ihren eigenen Zusammenfassungssatz, und zwei Zusammenfassungen desselben Titels sind
zwei Wahrheiten, sobald eine sich ändert. Der Setup-Abschnitt unten nennt Etikett und Regelsatz
nicht mehr doppelt; er heißt jetzt „Woran dieser Zustand hängt".

### Zwei Nebenbefunde, die dabei auffielen

- Die Auswahl der Kennzahlenkästen kannte nur `earningsYield`/`priceToFcf` (den Panelweg). Für jeden
  Titel außerhalb des Panels stand die Frage „Welcher Preis steht dem Geschäft gegenüber?" über
  einem **leeren Kasten** — der breite Weg liefert `priceEarnings`/`priceSales`. Beide sind jetzt
  ausgewählt, und ein Kasten entsteht nur mit wenigstens einer Zeile.
- Ein Titel ohne eine einzige bewertete Eigenschaft sagt jetzt den Grund im Kopfsatz: *„Für eine
  Einordnung dieses Titels werden 252 Handelstage benötigt; aktuell liegen 116 vor."* Gemessen
  betrifft das 784 der 786 Titel ohne Faktorwert — es ändert sich von selbst, und das ist eine
  andere Auskunft als „nicht bewertbar".

### Die zwölf Archetypen

Nicht handverlesen: jede Klasse hat ein Prädikat über die veröffentlichten Artefakte, und gewählt
wird der erste Treffer der alphabetisch geordneten Liste. Eine handverlesene Liste würde messen,
was ich sehen will.

| Archetyp | Titel | Fragen | Setup | Stil | Muster |
|---|---|---|---|---|---|
| starke Aktie | NVDA | 11/11 | im Aufbau | passt | Asymmetrie |
| schwache Aktie | AAME | 11/11 | kein Setup | passt | Asymmetrie |
| Momentum-Titel | AEHR | 10/11 | kein Setup | passt | Asymmetrie |
| Value-Titel | ABR | 10/11 | kein Setup | passt | Asymmetrie |
| Bank | WSBCO | 5/11 | keine Beobachtung | nächstliegend | keine Wochenreihe |
| REIT | AAT | 10/11 | kein Setup | passt | kein Muster trifft zu |
| Wachstumsunternehmen | AMPX | 11/11 | kein Setup | passt | Asymmetrie |
| datenarme junge Aktie | AAAC | 4/11 | keine Beobachtung | — | — |
| Multi-Class / zurückgehalten | GOOGL | 11/11 | kein Setup | passt | Asymmetrie |
| Titel mit Setup | ACA | 10/11 | **bestätigt** | passt | Asymmetrie |
| Titel ohne Stil | ACAA | 3/11 | keine Beobachtung | — | — |
| Titel ohne Setup | ABAT | 11/11 | kein Setup | passt | Asymmetrie |

Die drei schwachen Zeilen sind **ehrliche Datengrenzen**, keine Produktfehler: AAAC (198
Handelstage) und ACAA (117) tragen keine Eigenschaft, kein Setup und keinen Mustervergleich, und
sie sagen es mit der Zahl — *„Für eine Einordnung dieses Titels werden 252 Handelstage benötigt;
aktuell liegen 198 vor."* WSBCO hat zwei bewertete Eigenschaften und keine veröffentlichte
Wochenreihe. Kein Titel der Probe zeigt
einen Widerspruch, eine doppelte Hauptaussage oder eine Aussage ohne Beleg.

### Die Messung (500er-Stichprobe, jeder 13. Titel, deterministisch)

| Kennzahl | Titel von 500 |
|---|---|
| `STOCKS_WITH_COMPLETE_INTELLIGENCE_SUMMARY` | **408** (+ 28 teilweise) |
| `STOCKS_WITH_PRO_CONTRA_UNKNOWN` (alle drei Gruppen) | **357** (475 mit mindestens zwei) |
| `SETUPS_PUBLISHED` · davon entscheidbarer Zustand | 426 · **123** |
| `SETUPS_WITH_NEXT_CONDITION` | **122 von 123** |
| `SETUPS_WITH_INVALIDATION` | **123 von 123** |
| `STRATEGY_MATCH_WITH_EXPLANATION` | **418** |
| `PATTERN_MATCH_WITH_ASYMMETRY` | **322** (+ 80 mit dem ausdrücklichen „kein Muster trifft zu") |
| `METHODOLOGY_SWITCH_VISIBLE` | **70** |
| `CONTRADICTORY_STATEMENTS` | **0** |
| `DUPLICATE_PRIMARY_STATEMENTS` | **0** |
| `TECHNICAL_INFORMATION_WITHOUT_STATEMENT` | **0** |
| `STATEMENTS_WITHOUT_EVIDENCE` | **0** |
| `FULL_INTELLIGENCE_JOURNEY` / `REDUCED` / `UNUSABLE` | **407 / 42 / 51** |

Die eine Ausnahme ist ehrlich: der eine entscheidbare Zustand ohne nächste Bedingung ist ein
**bestätigtes** Setup — über ihm gibt es in der entscheidbaren Stufe keine Regel mehr, und die
Verlaufszustände darüber sind geschlossen. Das steht als Satz da und nicht als leere Liste.

**Zwei Lineale, kein Fortschritt.** Dieselbe Stichprobe ergibt nach der Formmessung
(`journey-shape-1.0.0`, gehaltvolle **Stationen**) unverändert **409 / 89 / 2** und nach dieser
Messung (beantwortete **Fragen**) **407 / 42 / 51**. Oben stimmen sie fast überein, unten nicht: ein
Titel kann elf Stationen zeigen und trotzdem nur drei Fragen beantworten. Beide Reihen stehen
deshalb im Artefakt nebeneinander (`journeyShapeOnSameSample`) — die neue Zahl ist kein besseres
Ergebnis, sondern eine andere Frage.

Am Wenigsten beantwortet wird „Was treibt die Stärke oder Schwäche?" (392) — sie verlangt eine
bewertete Eigenschaft **mit** einer Einzelkennzahl darunter. Am meisten „Wie belastbar ist diese
Evidenz?" (500): sie ist immer beantwortbar, weil auch „hierzu liegt nichts vor" eine Auskunft über
Belastbarkeit ist.

### Tests und Produktionsnachweis

17 neue Fälle in zwei Dateien, beide sabotagegeprüft: die Bandregel zurückgedreht → Fall 2 fällt;
die Zurückhaltung entfernt → Fall 2 der Bewertungsdatei fällt; wiederhergestellt → grün. Der
Bestandstest läuft über **alle 6.441** Titel, nicht über eine Stichprobe.

Tests **1.939 grün, 0 rot** (quant) · **273 grün** (discover). Produktions-Smoke gegen das gebaute
Release: **CLEAN**, 27 Ansichten × 2 Breiten, mit der Auskunft bei 443 px, der Zurückhaltung auf
JPM und der Branchenvorlage auf WSBCO.

### Was bleibt

Unverändert und ausdrücklich: keine neue Datenquelle, kein Provider-Kauf, keine neue Pipeline,
keine neue Datenarchitektur. Discovery unberührt. Backtest fail-closed (Mitgliedschaftshistorie),
Revisions fail-closed (lizenzierte PIT-Daten), `data.sec.gov` extern blockiert (CONNECT 403) für
die 161/183 Zuordnungsfälle und die klassenspezifische Aktienzahl. Die Owner-Entscheidung zur
Schuldenzusammensetzung liegt entscheidungsreif.

## M39 — DIE BRANCHENVORLAGE STAND AUF KEINER SEITE

`INDUSTRY_TEMPLATE_DISCLOSED = PASS`

Punkt 8 verlangt, nach erschöpfter Deckungsarbeit den nächsten Meilenstein **nach gemessener
Nutzerwirkung** zu wählen. Also wurde zuerst geprüft, ob der größte Ertrag der letzten Läufe
überhaupt bei einem Leser ankommt: M33 hat 2.325 Faktorzellen für 901 Titel geöffnet — sind die
Bankkennzahlen auf der Seite sichtbar?

Sie sind es. WSBCO zeigt Eigenkapitalquote (0,30), Rendite auf Bilanzsumme und Eigenkapital,
Schwankung dieser Rendite; ADAMO die REIT-Kennzahlen auf dem Zahlungsfluss; AAPL unverändert die
generischen. Die vorlagenbezogene Auflösung in `hydrate` funktioniert.

**Dabei fiel die eigentliche Lücke auf.** WSBCO zeigt „Eigenkapitalquote · Gewicht 0,30", AAPL
zeigt „Eigenkapitalquote · Gewicht 0,15" — dieselbe Beschriftung, eine andere Methodik, und **kein
Wort dazu**. Gemessen betrifft dieser lautlose Methodikwechsel **974 Titel**. Wer beide Seiten
vergleicht, hält es für einen Fehler; wer nur eine sieht, hält eine Bankkennzahl für die
allgemeine.

Die Seite sagt es jetzt, in der Reihenfolge des Wörterbuchs:

> **Für diesen Titel gilt eine eigene Branchenvorlage.**
> Eine Bankbilanz besteht aus Einlagen und Krediten. Rohertrag, Nettoverschuldung und operative
> Marge — die Kennzahlen eines Industrieunternehmens — sagen darüber nichts. Gemessen wird
> deshalb, was hier zählt: Eigenkapitalquote, Rendite auf Bilanzsumme und Eigenkapital,
> Verlässlichkeit dieser Rendite über die Jahre.
> *Verlässlichkeit, Bewertung und Ertragskraft folgen dieser Vorlage; Wachstum, Kursstärke und
> Schwankungsbreite werden für alle Titel gleich gemessen. Grundlage: Banks, savings institutions,
> lenders and brokers (SIC 6020–6220) · Fassung quant-v2-balance-sheet-financial-1.0.0.*

Der interne Fassungsname steht in der letzten Zeile — nie allein und nie zuerst, wie das
Wörterbuch es verlangt. Der Dienst reicht dafür `template`, `marketCapReason`,
`marketCapPriceSource` und `issuerListings` durch; vorher endete die Vorlage an der
Projektionsgrenze von `getFactorEvidence`.

Geprüft: ein Unit-Test hält die Verdrahtung und dass jede der drei Vorlagen einen Satz in
Alltagssprache trägt; der Produktions-Smoke besucht jetzt auch `quant&ticker=WSBCO` und prüft, dass
der Hinweis steht, eine Fassung nennt und **keinen internen Code vor dem Nutzersatz** trägt. Beide
sabotagegeprüft.

Zweimal hat dieser Test sich selbst ausgelöst, bevor er stimmte: sein Prüffenster lief über den
nächsten Schlüssel der Erklärungstabelle hinaus, und die Namen der übrigen Vorlagen sind selbst
interne Codes. Jetzt grenzt er den Block ab, statt eine Zeichenzahl zu raten.

Tests **1.921 grün, 0 rot**. Produktions-Smoke: **CLEAN**, 20 Ansichten × 2 Breiten.

## M38 — WAS NOCH VON HIER AUS GEHT: DIE VOLLSTÄNDIGE HEBELMESSUNG

`AUTOMATICALLY_REPAIRABLE_REMAINING = 0`

Nach M34 bis M37 war die Frage nicht mehr „wo fehlt etwas", sondern „wo fehlt etwas, das
bereits veröffentlichte Artefakte hergeben". Jede gemessene Lücke steht jetzt in genau einer von
fünf Lagen (`coverage-levers-1.0.0`), und **keine** ist mehr Fall A oder B.

| Bereich | Lage | Titel | Befund |
|---|---|---|---|
| MARKET_CAP | C | 465 | Ein Emittent, mehrere Zeilen — fail-closed |
| MARKET_CAP | D | 566 | Die SEC führt überhaupt keinen Anteilsbestand |
| MARKET_CAP | D | 235 | Bestand vorhanden, jenseits der 400-Tage-Regel |
| MARKET_CAP | E | 1.405 | Keine Fundamentaldaten (kein CIK / kein Export / `mapped = 0`) |
| MARKET_CAP | **A** | **0** | Kurs fehlte trotz veröffentlichter Reihe — **in M36 geschlossen** |
| VALUE | C | 465 + 1.236 | Börsenwert zurückgehalten · Mindestanforderung nicht erreicht |
| VALUE | D | 2.221 | Eingabe in keinem Artefakt |
| QUALITY | C | 1.207 + 24 | Mindestanforderung · zwingende Komponente fehlt |
| GROWTH | C | 1.063 | Mindestanforderung (davon 345 Banken ohne Umsatzreihe) |
| PROFITABILITY | C | 2.073 + 1 | Mindestanforderung · zwingende Komponente |
| FUNDAMENTAL_INPUTS | A | 6 | Kennzahlen, die die Exporte führen und niemand liest |
| TECHNICAL / SETUP | D | 964 / 858 | Kursreihe zu kurz — wächst täglich |
| TECHNICAL | E | 82 | Fenster reicht vor die Kalenderdeckung (von 413 auf 82 gefallen) |
| STRATEGY_MATCH | E | 1 | `earnings-revision-leader` — ohne lizenzierte PIT-Analystendaten |
| PATTERN_MATCH | D | 1.502 | Musterabgleich ohne Fundamentalüberlagerung |
| STOCK_IDENTITY_NAMES | D | 1.100 | Ohne Namen — **und 0 davon** stehen im SEC-Kürzelverzeichnis |
| SECURITY_CLASSIFICATION | D | 7.494 | Gattung ohne positiven Beleg |
| SEC_MAPPING | B | 161 | Rohe Tatsachen, keine Zuordnung — extern blockiert |
| DEBT_CONCEPTS | C | 2.929 | Owner-Entscheidung, Material liegt vollständig vor |

**Die sechs ungenutzten Kennzahlen** (Fall A auf Kennzahlebene): `diluted_weighted_average_shares`
4.448, `capital_expenditures` 4.295, `depreciation_and_amortization` 4.070,
`stock_based_compensation` 3.985, `long_term_debt` 3.265, `research_and_development` 2.142
Jahresreihen. Keine davon schaltet eine **bestehende** Komponente frei — geprüft: die
EBITDA-Ableitung ist vollständig (**2.661 von 2.661**), und `long_term_debt` ist nicht
`total_debt`. Sie würden neue Komponenten verlangen, und das ist eine Methodikänderung mit eigener
Fassung, kein Repair.

**Die Verschuldungsfrage ist entscheidungsreif.** Der Konzeptzensus ist gelaufen (2026-09-23,
5.148 Emittenten) und liefert fünf Zusammensetzungen mit Reichweiten: A (nur Sammelangabe) 864,
**B (Sammelangabe, sonst LT+ST) 2.929 = heutiger Zustand**, C (nur langfristig) 3.456 — „eine
ANDERE Kennzahl", D (mit Finanzierungsleasing) 1.281, E (Ersatz durch Leasing) 3.401. Das ist ein
Owner-Gate, keine Messung: jede Alternative ändert, was eine veröffentlichte Kennzahl bedeutet.

### Point 3 — `SHARE_COUNT_PROVENANCE`: ein Ort trägt den Beleg

Von den geforderten Herkunftsangaben führt die Konsumschicht **`filed`, `accn`, `fp`** und die
Einheit (je Kennzahl im Kopf). Sie verwirft **`concept`, `form`, `dimensions`, `frame`,
`sourceTag`** → `DATA_CONTRACT_GAP = OPEN`.

Aber `quant/data/sec/primary_source_audit.json` vergleicht kanonische Werte gegen neu abgerufene
SEC-Primärdaten und führt je Prüfung `secConcept`, `accession`, `form`, `filingDate`. Damit ist
die Vermischung **belegt statt erschlossen** — und ein zweiter Fall fiel dabei auf:

| Reihe | vermischte Konzeptklassen |
|---|---|
| **JPM `shares_outstanding`** | `CommonStockSharesIssued` + `EntityCommonStockSharesOutstanding` |
| **XOM `shares_outstanding`** | dieselbe Mischung |
| **JPM / XOM `stockholders_equity`** | `StockholdersEquity` + `…IncludingPortionAttributableToNoncontrollingInterest` |
| AAPL / MSFT / NVDA | zwei Konzepte, beide OUTSTANDING — harmlos |

Die Eigenkapital-Mischung ist neu und trifft `bookToMarket` und `equityToAssets`. Die
Konzeptklassen sind im Artefakt **deklariert**, nie aus Werten erschlossen. Reichweite: **5 von
5.069** Emittenten — die Vermischung ist belegt, ihre universumsweite Reichweite nicht.

### Point 4 — `SECURITY_TYPE_PROVENANCE_AUDIT`: `HIGH_CONFIDENCE_WITHOUT_EVIDENCE = 0`

Der Klassifikator gab `COMMON_STOCK` + **HIGH**, sobald der Anbieter „Stock" sagte und nichts
sonst griff. Seine eigene Begründung sagte, was das ist: „kein Sondergattungsmuster im Ticker" —
die **Abwesenheit** eines Befundes. Ein echter positiver Befund (Vorzugsaktie aus dem Tickermuster)
stand mit MEDIUM darunter: die Skala war verkehrt.

| Konfidenz | Beleg | Instrumente |
|---|---|---|
| LOW | `RESIDUAL_NO_SPECIAL_PATTERN` | 7.494 |
| MEDIUM | `TICKER_PATTERN` | 308 |
| HIGH | `SECURITY_NAME` | 5 |
| HIGH | `PROVIDER_ASSET_TYPE` | 2 |
| — | mit ISIN / CUSIP / FIGI | **0** |

Der **Typ** blieb unangetastet — er hängt an den Universumstoren, und eine erfundene Gattung wäre
schlimmer als eine gekennzeichnete. Der Neubau wurde Feld für Feld gegen HEAD geprüft: 7.803
Instrumente, **0 neu, 0 verloren**, ein neues Feld, `securityTypeConfidence` auf 7.488 geändert,
alles andere identisch. Die Konfidenz wird von **keinem Tor gelesen** — deshalb konnte sie
jahrelang HIGH behaupten, und deshalb bewegt ihre Korrektur keine Deckung.

### Point 6 — das Dossier ist ohne Zugang benutzbar

`sec-mapping-dossier-1.0.0`: **182 Emittenten**, 43.953 ungenutzte Tatsachen, jeder mit
abrufbereiter CIK und Kürzel; die heutige Registry (40 Kennzahlen, 118 Konzepte) zum Abgleich; die
Zweigipfeligkeit als Befund (4.884 Exporte mit 20+ zugeordneten Kennzahlen, 183 mit genau null,
**zwei** dazwischen); und ein fünfschrittiges Verfahren für den Moment, in dem Zugang besteht. Was
es **nicht** enthält: eine Zuordnungsregel. `BLOCKED_EXTERNAL_NETWORK` bleibt.

### Point 7 — nachgemessen

| Größe | Wert |
|---|---|
| `MARKET_CAP_COVERAGE` | 3.770 von 6.441 |
| `VALUE_FACTOR_COVERAGE` | 2.519 |
| `ZERO_FACTOR_ROWS` | 781 |
| `FULL_JOURNEY` / `REDUCED_JOURNEY` / `UNUSABLE` | 409 / 89 / 2 |
| `WITHHELD_VALUATION` | 465 |
| `SECURITY_TYPE_UNCERTAIN` | 7.494 ohne Beleg · 308 nur Konvention · 7 belegt · **0 HIGH ohne Beleg** |

**Prominente Titel:** `AAPL` 4.978 Mrd, `NVDA` 5.424 Mrd, `MSFT` 3.833 Mrd — verfügbar. `JPM`,
`T`, `SO`, `GOOG`, `GOOGL`, `AGNC` — **kein** Börsenwert, alle sechs mit
`SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING` und der Zahl ihrer Geschwisterzeilen. Korrektheit vor
Reichweite: die Deckung ist gleich geblieben, die Nachprüfbarkeit ist besser geworden.

Tests **1.920 grün, 0 rot**. Produktions-Smoke: **CLEAN**.

## M36 — DER KURS, DEN DIE SEITE SCHON ZEICHNET

`PUBLISHED_CLOSE_USED_FOR_MARKET_CAP = PASS`

Nach M35 war der grösste verbleibende, intern lösbare Posten benannt: **131 Zeilen mit dem Grund
`NO_PUBLISHED_CLOSE`**. Gemessen tragen alle 131 einen zeitpunktsicheren Anteilsbestand, sind
**einzelnotiert** (die Zuordnungsregel aus M34 greift also nicht) und haben einen
veröffentlichten Schlusskurs vom 2026-09-25 — denselben, den die Aktienseite zeichnet und die
Universumsliste führt. Der Börsenwert fehlte allein deshalb, weil der Faktorlauf seinen Kurs
**nur** aus den Technical-Bündeln las.

Dass dieser Schritt jetzt sicher ist, ist ein Ergebnis von M34: vorher hätte er 171 Zeilen
getroffen, darunter `ADAMH`, `AGNCZ` und `AMPGZ` — Vorzugs- und Sonderlinien, die den
Anteilsbestand ihres Emittenten geerbt hätten. Seit die Zuordnungsregel steht, bleiben genau die
131 übrig, bei denen der Bestand der Zeile wirklich gehört.

**Eine Regel, zwei Leser.** Die Vertragsprüfung der Tagesreihe stand im Bauer der
Universumsliste. Sie ist jetzt eine geteilte Engine (`published-close.js`), weil zwei Kopien
derselben Prüfung zwei Verträge sind, sobald einer ergänzt wird. Nur der **letzte** Punkt darf
eine Aktienzahl multiplizieren: die Splitbereinigung normiert auf den jüngsten Stand, dort sind
bereinigter und roher Schluss derselbe Wert — bei AAPL, dessen Reihe einen 4:1-Split von 2020
trägt, auf den Cent (341,07).

| Größe | vorher | nachher |
|---|---|---|
| `MARKET_CAP_COVERAGE` | 3.639 | **3.770** (+131) |
| `NO_PUBLISHED_CLOSE` | 131 | **0** |
| `VALUE_FACTOR_COVERAGE` | 2.490 | **2.519** (+29) |
| `ZERO_FACTOR_ROWS` | 786 | **781** |
| `FACTOR_COVERAGE_GAIN` | — | +29 Faktorzellen |

Der Zugewinn an Bewertungsfaktoren (29) ist kleiner als der an Börsenwerten (131), und das ist
richtig: die übrigen 102 Titel erfüllen die Mindestanforderung des Faktors weiterhin nicht. Jeder
Börsenwert nennt jetzt seine Kursquelle (`marketCapPriceSource`), und wo keiner existiert, steht
dort `null` statt einer Behauptung über eine Zahl, die es nicht gibt.

Ein Test, der dabei rot wurde, war zu Recht rot und aus dem falschen Grund: er prüfte, dass der
**Quelltext** des Bauers die Zeichenketten `discover-series-1.1.0`, `SPLIT_ADJUSTED` und
`publishBasis` enthält. Die sind in die geteilte Engine gewandert — die Regel war unverändert,
nur ihr Ort nicht. Der Test prüft jetzt das Verhalten: der Bauer benutzt die Engine, und die
lehnt eine Reihe ab, die den Vertrag nicht erfüllt. Welche Bedingung einzeln greift, hält
`published-close.test.mjs` mit 17 Einzelfällen, zweifach sabotagegeprüft.

Tests **1.915 grün, 0 rot**. Produktions-Smoke: **CLEAN**. Reise unverändert (409 volle, 89
reduzierte, 2 zu dünn).

## M35 — P0: KLASSENSPEZIFISCHER BÖRSENWERT, GEPRÜFT UND BEANTWORTET

`PER_CLASS_MARKET_CAP_AVAILABLE = FAIL` · `VALUATION_WITHHELD_WITH_REASON = PASS`

Die Frage war, ob sich aus den **vorhandenen** Daten eine klassenspezifische
Börsenwert-Logik bauen lässt. Die Antwort ist nein, und jeder Zweig ist gemessen statt vermutet.

### Klassenspezifische Aktienzahl: nicht vorhanden, und zwar bauartbedingt

Die SEC meldet Aktienzahlen je Gattung auf dem Deckblatt unter der Gattungsachse. Der
**Massendatensatz `companyfacts`**, den dieses Haus liest, führt nur Tatsachen **ohne**
Dimensionen. Der Fingerabdruck steht in unseren eigenen Daten:

| Emittent | einzige Beobachtung | lesbar? |
|---|---|---|
| Alphabet | 12.230 Mio zum 2026-06-30 | ja — eine undimensionierte **Summe** über alle Gattungen |
| AT&T | 6.852 Mio zum 2026-06-30 | ja — Summe |
| Berkshire Hathaway | **1 Mio zum 2011-03-31** | nein — vordimensional, nur Klasse A |
| Accenture | **637 Mio zum 2010-02-28** | nein — vordimensional |

Wer je Gattung meldet, verschwindet also aus diesem Datensatz. Die Gattungszahl zu bekommen
heißt, die dimensionierten Tatsachen zu holen — Extraktionsarbeit in der bestehenden
SEC-Schicht gegen die bestehende Quelle, kein Anbieterkauf. Von hier aus gesperrt
(`data.sec.gov`, CONNECT 403).

### Nicht-Eigenkapital-Linien: mit vorhandenen Feldern nicht erkennbar

Der Wertpapierstamm ist reicher als der Suchindex (`securityType`, `shareClass`, `subtype`,
`primaryListing`, `assetTypeRaw`, `isin`, `cusip`, `figi`) — und **trägt die Antwort nicht**.
Gemessen über alle 7.803 Instrumente:

- `assetTypeRaw` = „Stock" für **7.801**, darunter `FNGU` (ein gehebeltes Indexpapier) und
  `AMJB` (eine Schuldverschreibung); `instrumentType` = `COMMON_STOCK` für alle;
  `securityClass` = `EQUITY_COMMON` auch für beide.
- `CUSIP`, `FIGI`, `ISIN`: **0 von 7.803**. Damit fällt jede identifikatorbasierte Typisierung weg.
- `company` in den Universumsdateien: **null für alle**. Die Namensregeln des Klassifikators
  (`ETN`, `PREFERRED`, `WARRANT`, …) existieren, können aber nie feuern — der einzige
  verfügbare Name ist der des **Emittenten** aus dem SEC-Verzeichnis.
- `sector` fehlt bei `GOOGL` (Eigenkapital) genauso wie bei `FNGU` (Indexpapier).
- Die Tickerregeln erfassen die Bindestrichformen (311 `PREFERRED`). `AGNCL`, `AMJB`, `TBB`,
  `SOJC` haben keinen Bindestrich — und eine Suffixregel ohne Trennzeichen ist auf genau
  diesem Universum **beweisbar falsch**: `GOOGL` würde zur Vorzugsserie von `GOOG`.
- `securityTypeConfidence` lautet für 7.495 Instrumente `HIGH`, obwohl die einzige Grundlage
  die pauschale Anbieterangabe „Stock" ist. Das ist eine Konfidenz ohne Deckung — als Befund
  notiert, nicht in diesem Lauf repariert (siehe offene Punkte).

### Die Semantik ist jetzt versioniert

`valuationSemantics` (`quant-v2-valuation-level-1.0.0`) hält fest: jede Bewertungskomponente
teilt eine **Emittenten**-Größe durch einen Börsenwert, ein Börsenwert je Notierung braucht
eine Aktienzahl je Notierung, und für echte Mehrklassen-Stammaktien darf der Emittentenwert
**nicht einmal je Zeile** ausgegeben werden — das wäre ein Unternehmen zweimal.

### Was dieser Lauf konkret verbessert hat

**Die Begründung erreichte vier prominente Titel nicht.** Die Prüfung, ob eine Komponente am
Börsenwert hängt, sah in die Formelzeile des Vertrags — und die ist Prosa: dort steht „market
capitalization", nicht `marketCap`. Gefunden wurden deshalb nur die Vorlagenkomponenten, die
ich selbst so geschrieben hatte. `T`, `SO`, `GOOG` und `GOOGL` sagten weiter „Eingabe nicht
materialisiert", obwohl ihr Börsenwert zurückgehalten wurde. Die Abhängigkeit kommt jetzt aus
der Engine, in der sie entsteht, und ein Test leitet sie aus dem **Verhalten** ab (einmal mit,
einmal ohne Börsenwert rechnen und die Schlüssel vergleichen).

| Größe | vorher | nachher |
|---|---|---|
| Faktorzellen mit `SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING` | 222 | **465** |
| `VALUE_FACTOR_COVERAGE` | 2.490 | 2.490 (unverändert — nur die Sprache) |

**Die Oberfläche trennt jetzt zwei Zustände.** „Kein Wert für diesen Faktor" stand über beidem.
Jetzt:

| Zustand | Überschrift |
|---|---|
| Börsenwert nicht zuordenbar | **„Bewertung bewusst zurückgehalten"** |
| noch zu kurze Kursgeschichte | „Noch nicht genug Kursgeschichte" |
| keine Geschäftszahlen | „Noch keine Geschäftszahlen veröffentlicht" |
| Branche nicht abgedeckt | „Für diese Branche nicht anwendbar" |
| sonst | „Kein Wert für diesen Faktor" |

Die Überschrift steht in der Engine, nicht in der Oberfläche — sonst kennen zwei Stellen den
Code. Und die Reise hat eine eigene Ursachengruppe dafür; ohne sie wäre der Code in der
Auffanggruppe als Hauptsprache gelandet.

### Die 22 ohne Eintrag übergangenen Emittenten — kein stilles Skip mehr

Jeder trägt jetzt maschinenlesbare Gründe im Artefakt. Das Ergebnis ist eindeutig: **alle 22
haben weniger als 252 Handelstage**, 16 eine CIK von 2024 oder später, drei einen
Branchenschlüssel ohne operatives Geschäft. `EXPORT_RUN_NO_RECORD` steht als eigener Grund
dabei — er sagt, was wahr ist: der Lauf hat nichts notiert, und warum, steht in seinem
Protokoll und nicht in diesen Daten.

### Coverage neu gemessen (`valuation-coverage-1.0.0`)

| Größe | Wert |
|---|---|
| `VALUE_FACTOR_COVERAGE` | 2.490 verfügbar · 3.951 zu |
| `MARKET_CAP_COVERAGE` | 3.639 von 6.441 (4.862 mit Fundamentaldaten) |
| `MULTI_CLASS_OR_NON_EQUITY_WITHHELD` | **465 Zeilen · 182 Emittenten · 497 Zeilen in Gruppen** |
| `MARKET_CAP_WITHHELD_BY_REASON` | Zuordnung 465 · kein Anteilsbestand 801 · kein Kurs 131 |
| `ZERO_FACTOR_ROWS` | 786 |
| `SECTOR_TEMPLATE_MISSING` | 0 |
| `SEC_MAPPING_GAPS` | 161 intern · 22 still übergangen · 25 mit gemeldetem Fehlschlag |

`MULTI_CLASS` und `NON_EQUITY` stehen bewusst als **eine** Zahl: sie sind nicht trennbar, und
das ist der Befund. Eine Aufteilung wäre geraten und stünde dann neben gemessenen Zahlen.

**Die Stichprobe, wie verlangt:** `JPM`, `T`, `SO`, `GOOG`, `GOOGL`, `AGNC` bekommen **keine**
Bewertung zurück — sie tragen jetzt alle sechs den richtigen Grund statt eines falschen.
`AAPL` (4.978 Mrd), `NVDA` (5.424 Mrd), `MSFT` (3.833 Mrd) sind unverändert verfügbar. Keine
Erfolgsmeldung wegen höherer Deckung: die Deckung ist gleich geblieben, die Wahrheit ist besser
geworden.

### Eine eigene Korrektur

In M34 hatte ich Booking Holdings als Beleg für vermischte Konzepte geführt — 751 Mio gemeldete
Aktien gegen 33 Mio aus der eigenen Rechnung, Faktor 23. **Das war falsch.** BKNGs
veröffentlichter Schlusskurs ist 163,95 USD auf splitbereinigter Basis; 751,4 Mio × 163,95 USD
= 123,2 Mrd ist in sich stimmig, und der Börsenwert ist richtig. Ein Aktiensplit hebt die
Aktienzahl, während die historische Durchschnittsreihe vorsplit bleibt — von außen sieht das
genauso aus wie ein vermischtes Konzept. Damit ist auch die Zahl „228 abweichende
Börsenwerte" nur eine **obere Grenze** des Defekts und keine Zählung davon. Verifiziert bleibt
JPMorgan: 4.105.933.895 wiederholt sich über neun Geschäftsjahre zeichengleich, die Reihe
wechselt quartalsweise zwischen zwei Niveaus, und die Kursreihe trägt **keinen Split**.

### Offen, mit Zahl

- **Aktienzahl je Gattung** — die eine Größe, die `JPM`, `T`, `SO`, `GOOG`, `GOOGL`, `AGNC` und
  459 weitere Zeilen zurückholt. Braucht die dimensionierten Tatsachen; `data.sec.gov` ist hier
  gesperrt.
- **`securityTypeConfidence` = HIGH ohne Deckung** für 7.495 Instrumente. Die Klassifikation
  selbst ist aus vorhandenen Daten nicht reparierbar; ihre *behauptete Konfidenz* ist es. Nicht
  in diesem Lauf gemacht, weil ein Neubau des Wertpapierstamms 7.803 Instrumente, den
  Suchindex und die Kapazitätsdatei berührt.
- **161 Zuordnungslücken** (43.953 rohe Tatsachen, `mapped = 0`) — unverändert extern blockiert.
- **801 Zeilen ohne zeitpunktsicheren Anteilsbestand**, 131 ohne veröffentlichten Kurs.

Tests **1.911 grün, 0 rot**. Produktions-Smoke gegen das gebaute Release: **CLEAN**.

## M34 — EIN ANTEILSBESTAND JE EMITTENT, ABER MEHRERE NOTIERTE ZEILEN

`FABRICATED_MARKET_CAPS_WITHDRAWN`

Beim Weiterarbeiten am größten verbleibenden internen Gap — 909 Titel mit Fundamentaldaten und
ohne Börsenwert — fiel etwas Schlimmeres auf als eine Lücke: **veröffentlichte Zahlen, die es
nicht gibt.**

Der Börsenwert entstand als *Anteilsbestand des Emittenten* × *Kurs dieser Zeile*. Gemessen im
veröffentlichten Artefakt führten **110 Emittenten 304 notierte Kürzel, 210 davon mit einem
Bewertungsfaktor** — und jede dieser Zeilen bekam den vollen Bestand des Emittenten:

| Zeile | was sie ist | getragener Börsenwert |
|---|---|---|
| `AMJB` | Schuldverschreibung von JPMorgan | 1.408 Mrd — JPMs |
| `TBB` | Anleihe von AT&T | 173,9 Mrd — AT&Ts |
| `SOJC`–`SOJF` | Vorzüge/Junior Notes von Southern | je 93,4 Mrd |
| `BERZ`, `BULZ`, `FNGU`, `GDXU`, `JETU`, … | 14 gehebelte Indexpapiere von BMO | je 122 Mrd |
| `AGNCL`–`AGNCP` | Vorzugsserien von AGNC | je ~30 Mrd, während AGNC selbst 11,4 Mrd trug |
| `GOOG` + `GOOGL` | zwei Gattungen einer Gesellschaft | je 4.206 Mrd, also Alphabet zweimal |

Diese Zeilen standen im Screener neben echten Unternehmen, mit Bewertungskennzahlen, die aus
diesen Zahlen folgen. Der Strategie-Index zeigt es: `value-momentum` hatte 122 Treffer und hat
jetzt **104**, `garp` 99 und jetzt **93** — 24 Treffer beruhten auf einem erfundenen Börsenwert.

**Es gibt keinen Unterscheider im Haus.** Der Consumer-Export listet alle Kürzel eines CIK
gleichrangig. Das SEC-Verzeichnis (`company_tickers_exchange`) nennt für jede Zeile denselben
Firmennamen. Und der Company-Master typisiert **FNGU — ein gehebeltes Indexpapier — als
`COMMON_STOCK` mit dem Namen „Bank Of Montreal /Can/"**; von 3.953 Titeln mit Börsenwert trugen
3.952 den Typ `COMMON_STOCK`. Genau deshalb ist das nie aufgefallen.

**Die Regel.** Kein Börsenwert, wo der Bestand keiner Zeile zuzuordnen ist — mit eigenem,
benanntem Grund `SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING`, und jede betroffene Zeile nennt ihre
Geschwisterzeilen. Keine Kürzel-Sonderlogik, keine Suffix-Heuristik: die nächste Zeile ist immer
die, die sie widerlegt (GOOG/GOOGL und BRK-A/BRK-B sind beide Stammaktien, AGNCL ist es nicht).
Welche Bewertungskomponente betroffen ist, entscheidet ihre **Formelzeile im Vertrag** — enthält
sie `marketCap`, trägt sie diesen Grund — und nicht eine zweite Liste, die davon abdriften könnte.

| Größe | Wert |
|---|---|
| betroffene Emittenten / Kürzel | 110 / 304 |
| Bewertungsfaktoren vorher auf erfundenem Börsenwert | 210 |
| Bewertungsfaktor verfügbar | 2.707 → **2.490** (−217) |
| Faktorzellen mit dem neuen Grund | 222 |
| Strategietreffer entfernt | `value-momentum` −18, `garp` −6 |

**Der Preis, offen genannt.** JPM, T, SO, GOOG, GOOGL, AGNC und WSBCO verlieren ihren
Bewertungsfaktor, weil eine Anleihe oder eine zweite Gattung denselben CIK teilt. Das ist ein
echter Verlust — und die Alternative wäre, eine Schuldverschreibung weiter als
Billionen-Unternehmen zu führen. Die Hausdoktrin ist an dieser Stelle eindeutig und steht schon
im Code: EBITDA bleibt leer, statt unter falschem Namen zum operativen Ergebnis zu werden.

**Was sie zurückbringt, und was es nicht ist.** Ein Anteilsbestand **je Gattung**. Die
Deckblattangabe `dei:EntityCommonStockSharesOutstanding` wird je Gattung eingereicht, und der
Export fasst sie zu einer Zahl zusammen. Das ist Extraktionsarbeit in der SEC-Schicht — **kein
Anbieterkauf**.

**Und eine Abkürzung, die die Messung verworfen hat.** Für die 285 Titel mit veraltetem
Anteilsbestand (ACN: Bestand vom 28.02.2010) lag der Ersatz nahe, die verwässerten
Durchschnittsaktien des letzten Geschäftsjahres zu nehmen — bei ACN wären es 632,4 Mio statt
637,0 Mio, also 0,7 % Abweichung. Über die 3.800 Titel, bei denen **beide** Größen aktuell
vorliegen, gemessen: Median **4,0 %**, 75. Perzentil **13,0 %**, 90. Perzentil **44,4 %**, 95.
Perzentil **82,6 %**; nur 2.096 von 3.800 liegen unter 5 %. Ein Börsenwert, der um 13 % falsch
ist, macht jede Bewertungskennzahl um 13 % falsch. **Abgelehnt — auf Messung, nicht auf
Prinzip.** ACN ist nicht die Grundgesamtheit.

Tests 1.908 grün, 0 rot; die Regel ist sabotagegeprüft (ausgeschaltet → Test 29 fällt).
Produktions-Smoke gegen das gebaute Release: CLEAN.

## M33 — BRANCHENVORLAGEN, BERICHTSPERIODE UND DIE SPRACHE FÜR JUNGE TITEL

`INTERNAL_COVERAGE_GAPS_CLOSED_WHERE_THEY_WERE_CLOSABLE`

### Priorität A — die Branchenfälle, und wie viele es wirklich waren

Die Aufgabe nannte zwölf Titel mit `SECTOR_TEMPLATE_MISSING`. Gemessen im veröffentlichten
Faktor-Artefakt waren es **974 Titel und 2.922 Faktorzellen**: für jede Bank, jeden
Versicherungsträger und jeden REIT im Universum waren Verlässlichkeit, Bewertung und Ertragskraft
`NOT_APPLICABLE`. Die zwölf waren nur die Spitze — die Titel, bei denen zusätzlich Momentum und
Risiko ausfallen und deshalb gar kein Faktor übrig blieb.

| Branchentor | SIC | Titel | vorher verfügbar | Vorlage |
|---|---|---|---|---|
| Banken, Sparinstitute, Kreditgeber, Broker | 6020–6220 | 601 | Momentum/Risiko 575, Wachstum 256 | `quant-v2-balance-sheet-financial-1.0.0` |
| Versicherungsträger | 6300–6399 | 130 | Momentum/Risiko 129, Wachstum 98 | `quant-v2-insurance-carrier-1.0.0` |
| REITs | 6798 | 218 | Momentum/Risiko 211, Wachstum 127 | `quant-v2-real-estate-trust-1.0.0` |
| Versicherungsvermittler | 6400–6411 | 25 | Momentum/Risiko 23, Wachstum 20 | **keine — Tor korrigiert** |

**Was ableitbar war.** Gemessen über die Consumer-Exporte derselben Kohorten: Bilanzsumme und
Eigenkapital 98–100 %, Jahresergebnis 98–100 %, operativer Zahlungsfluss 97–100 %,
Dreijahres-Rendite auf die Bilanzsumme 92–98 %, Vorsteuerergebnis 57–80 %, Ausschüttung 48–79 %.
Damit sind genau die Kennzahlen darstellbar, mit denen diese Branchen wirklich gemessen werden.
Die generischen Formeln scheitern nicht am Tor, sondern an den Tags: Rohertrag 15 %, operatives
Ergebnis 25 %, Umsatz 60 % bei den Banken.

**Was nicht ableitbar war — und deshalb fehlt.** Kein FFO: die Größe lebt davon, Gewinne aus
Immobilienverkäufen aus dem Ergebnis herauszurechnen, und genau diese Position kommt in keinem
Export vor (Abschreibungen 89 %, Verkaufsgewinne 0 %). Die REIT-Vorlage arbeitet deshalb mit dem
operativen Zahlungsfluss und nennt ihn so; das ergebnisbasierte Maß trägt bei ihr das kleinste
Gewicht, weil die Abschreibung auf einer Immobilienbilanz das Ergebnis dominiert — was der Grund
für FFO ist. Keine Kombinierte Schadenquote für Träger: Schäden und Betriebskosten stehen nicht
als eigene Tags in den Exporten.

**Das Versicherungstor reichte zu weit.** 6411 ist „Insurance agents, brokers & service" — keine
Risikoträger. Die 25 Titel darin melden Umsatz 100 %, operatives Ergebnis 72 %, EBITDA 72 %;
LIFE (Ethos Technologies) berichtet wie ein Softwarehaus, weil es eines ist. Für sie ist die
generische Formel nicht unpassend, sondern richtig. Das ist die SIC-Systematik selbst.

**Eine Vorbedingung, die unterwegs auffiel.** Die Berichtsperiode hing am Umsatz-Tag: gemessen
über alle 5.036 Titel mit Consumer-Export führten **741** eine vollständige Bilanz und hatten
trotzdem keine Berichtsperiode und eine Historientiefe von 0 — in 741 von 741 Fällen allein wegen
des fehlenden `revenue`-Tags. Nicht nur Finanztitel: 101 Banken (6022), 57 (6021), 50 REITs, dazu
**93 Pharma- und 30 Biotech-Titel**, die vor der ersten Zulassung keinen Umsatz haben. Die Periode
kommt jetzt aus der jüngsten Periode, die das Dokument wirklich berichtet. Das schloss zugleich
ein Loch: ohne Referenzperiode war nie etwas veraltet, und zwei Übernahmehüllen bildeten einen
Börsenwert aus einem Anteilsbestand, der 546 Tage alt war.

### Priorität A — gemessen gegen jeden veröffentlichten Datensatz

| Größe | Wert |
|---|---|
| `SECTOR_TEMPLATE_MISSING_BEFORE` | 2.922 Faktorzellen in 974 Titeln |
| `SECTOR_TEMPLATE_MISSING_AFTER` | **0 in 0 Titeln** |
| `FACTOR_ROWS_OPENED` | 2.325 Faktorzellen in 901 Titeln, **0 verloren** |
| `FACTORS_OPENED_BY_TYPE` | Banken/Broker: Verlässlichkeit 529, Ertragskraft 444, Bewertung 391 · REITs: 199 / 199 / 186 · Träger: 126 / 119 / 103 · generisch (Tor korrigiert): 19 / 1 / 9 |
| Titel ohne jeden Faktor | 795 → **786** |
| Berichtsperiode gefüllt | 4.110 → **4.862** Titel (+752) |
| bestehende Werte neu rangiert | 4.744, Mittel 0,029 Punkte, Maximum 1,71 |
| Wechsel der Einordnung | 2, beide auf der Grenze (39,98 / 80,01) |
| geänderte Veränderungsaussagen | **0 von 6.441** |

Die Neurangierung ist der unvermeidliche Preis dafür, 25 Broker-Titel in den generischen
Querschnitt zurückzugeben — man kann einer Rangliste keine Emittenten hinzufügen, ohne die Ränge
zu bewegen. Die Evidenz-Version behält deshalb ihre Snapshot-Reihe: die Veränderungs-Engine nennt
eine Faktorbewegung erst ab 3 Punkten wesentlich, und gemessen ändert **kein einziger** der 6.441
Titel seine Veränderungsaussage. Eine neue Reihe zu beginnen hätte jedem Titel den Vergleich
genommen, um eine Bewegung zu verbuchen, die die Engine selbst nicht als eine zählt.

Von den zwölf Ursprungstiteln tragen **neun** jetzt mindestens einen Faktor (WSBCO, NEWTO, RWTQ,
RWTS, ADAMO je Verlässlichkeit und Ertragskraft; AXG, ELLA Verlässlichkeit; CBK, HYNE
Ertragskraft). Bei allen zwölf bleibt die Bewertung zu, und zwar aus einem Grund, der keine
Vorlage heilt: **der Börsenwert fehlt allen zwölf**, weil keine veröffentlichte Kursreihe einen
Schlusskurs für sie trägt. Drei bleiben ganz ohne Faktor: CSHR (123 Handelstage), FRMI und LIFE.

### Priorität B — die Kette, und ein Ergebnis, das überwiegend negativ ist

Nachvollzogen für alle 786 Nullzeilen: Company Master → Security/Issuer-Mapping → CIK → SEC
Factbook → Consumer Export → Faktoreingang → Faktorevidenz.

| Stelle in der Kette | Titel |
|---|---|
| keine SEC-Verbindung (kein CIK, Master sieht nichts) | 407 |
| **Rohfakten vorhanden, nichts zugeordnet** | **161** |
| NOT_APPLICABLE (Hülle, Fonds) | 87 |
| Historie zu kurz | 78 |
| Factbook ohne Consumer-Export | 47 |
| CIK ohne Factbook | 5 |
| alle Stufen geliefert, Faktormindestanforderung | 1 |
| CIK im Verzeichnis, aber nicht am Datensatz | **0** |
| Consumer-Export vorhanden, aber nicht gejoint | **0** |
| Identifikatorfall (Master sieht SEC, kein CIK) | **0** |

| Größe | Wert |
|---|---|
| `SEC_LINKED_ZERO_FACTOR_BEFORE` | 52 |
| `SEC_LINKED_ZERO_FACTOR_AFTER` | 52 |
| `CIK_JOIN_FIXED` | 0 — es gab keine Join-Lücke; gemessen, nicht angenommen |
| `CONSUMER_EXPORT_FIXED` | 0 — extern blockiert, siehe unten |
| `FACTOR_ROWS_OPENED` (Priorität B) | 0 |
| `INTERNAL_MAPPING_GAP` | 161 |

**Das eigentliche Ergebnis.** 183 Emittenten im ganzen Universum (161 davon Nullzeilen) tragen
zusammen **43.953 rohe SEC-Tatsachen und `mapped = 0`** — darunter Cerebras Systems, Bob's
Discount Furniture, Fervo Energy, Generate Biomedicines, SpaceX. Die Quelle hat geliefert; die
Kennzahl-Registry hat keine einzige Tatsache zugeordnet. Die Verteilung ist zweigipfelig: 4.884
Exporte mit 20 und mehr zugeordneten Kennzahlen, 183 mit genau null, zwei dazwischen. Das spricht
gegen „ein paar fehlende Tags" und für einen strukturellen Grund.

Welcher es ist, steht in den rohen Fakten — und die liegen nicht im Repository. Lokal gibt es
keine Rohablage: `quant/data/sec/canonical` und `inspector` führen nur die fünf goldenen Titel,
die 120 MB unter `consumer/` **sind** die SEC-Schicht. Der Abruf von `data.sec.gov` ist durch die
Netzwerkpolitik dieser Umgebung gesperrt (CONNECT 403). Damit ist die Zuordnungslücke exakt
lokalisiert und benannt, aber nicht von hier aus behebbar.

Zwei weitere Befunde derselben Prüfung: von den 47 Titeln ohne Export hat der Export-Lauf für
**25** einen eigenen Fehlschlag notiert (`NO_PERIODIC_FACTS` — ein Factbook ohne eine einzige
Periodentatsache, also ein Quellenbefund). Für die anderen **22** gibt es weder einen Export noch
einen Fehlschlagseintrag: der Lauf hat sie stillschweigend übergangen. Das ist eine Lücke im Haus
und steht als `EXPORT_RUN_SILENTLY_SKIPPED` im Artefakt.

### Der Zeit-Gap bleibt offen, aber er wird jetzt gesagt

Keine verkürzten Fenster, keine Methodikabsenkung. Was fehlte, war die Sprache: für einen zu
jungen Titel stand als erster Satz „Zu wenige Einzelkennzahlen erfüllen die Methodik" — wahr, und
für einen Leser nicht von einem Defekt zu unterscheiden. Gemessen tragen **784 der 786**
Nullzeilen weniger als 252 Handelstage.

Die Faktorzeile nennt jetzt ihre eigene Zahl, und die Zahlen kommen aus den Fenstern des Vertrags
statt aus einer zweiten Quelle: die Pflichtkomponente entscheidet, ab wann ein Kursfaktor rechnen
kann — Schwankungsbreite auf 252 Sitzungen, das Momentumfenster „12 Monate ohne den letzten
Monat" auf 252 plus die 21 ausgelassenen, also 273. Ein Test leitet beide Zahlen aus
`quant-v2.json` ab und hält sie gegen die Engine.

Gemessen auf der Aktienseite von AACO (116 Handelstage, kein Faktor):

> Die Kursgeschichte ist noch zu kurz — Diese Auswertungen brauchen einen längeren Kursverlauf.
> Für diesen Titel liegen 116 Handelstage vor, gebraucht werden 252. Das ändert sich von selbst,
> sobald der Titel länger gehandelt wird.

Die Zahl musste dafür erst ankommen: die Screening-Zeile trägt keine Handelstage, und die
Bar-Zahl der Kapazitätsdatei ist eine **andere** Größe — gemessen weicht sie in allen 6.441
Fällen ab (bei AA 936 gegen 0), weil sie den Bestand im Speicher zählt und nicht die Reihe, auf
der gerechnet wurde. Sie hier zu nehmen wäre eine falsche Zahl in einem richtigen Satz gewesen.
Die Zahl kommt deshalb aus dem Faktor-Artefakt über das Universumsverzeichnis, das die Liste schon
liest.

### Oberfläche und Coverage nachgemessen

Reise auf demselben 500er-Sample: **409 volle Reisen, 89 reduzierte, 2 zu wenig für eine Reise**;
Absagekästen 610 → 251, schlimmste Seite 4 Kästen. Produktions-Smoke gegen das gebaute Release:
19 Ansichten × 2 Breiten plus die Methodikseite, **PRODUCTION SMOKE CLEAN**. Tests: **1.907
grün, 0 rot** (vorher 1.890).

| Coverage-Bucket | Wert |
|---|---|
| `TOTAL_ZERO_FACTOR_ROWS` | 786 (vorher 795) |
| `RAW_FUNDAMENTALS_PRESENT` | 166 |
| `PARTIAL_FUNDAMENTALS` | 2 |
| `INSUFFICIENT_HISTORY` | 784 |
| `NOT_APPLICABLE` | 177 |
| `SEC_SOURCE_UNAVAILABLE` | 459 |
| `SECTOR_TEMPLATE_MISSING` | **0** |
| `INTERNAL_MAPPING_GAP` | 161 |
| `TRUE_NO_FUNDAMENTALS` | 161 |
| `EXTERNAL_PROVIDER_CANDIDATE` | 407 |
| `ZERO_FACTOR_ROWS_CLOSED_WITHOUT_NEW_PROVIDER` | 9 |
| `FACTOR_COVERAGE_GAIN` | +2.325 Faktorzellen (22.712 gesamt) |
| `EXTERNAL_PROVIDER_DECISION` | `DEFERRED` |

Kein Titel wurde durch eine fremde Quelle geöffnet. Was sich bewegt hat, bewegte sich durch
Methodik und Zuordnung im Haus.

### Was offen bleibt, mit Zahl

- **161 Zuordnungslücken** (183 universumsweit, 43.953 Rohtatsachen): lokalisiert, nicht behebbar
  ohne die Rohfakten — `data.sec.gov` ist durch die Netzwerkpolitik gesperrt.
- **22 still übergangene Emittenten** im Export-Lauf.
- **674 Titel mit Fundamentaldaten ohne Börsenwert** (303 ohne Anteilsbestand, 274 mit einem
  Bestand jenseits der 400-Tage-Grenze — ACN von 2010 —, 97 ohne Kurs aus einem
  Technical-Bündel). Das schließt die Bewertung für sie vollständig, auch für alle zwölf
  Branchenfälle.
- **Wachstum bleibt generisch**: 345 Banken ohne Umsatzreihe tragen deshalb keinen
  Wachstumsfaktor. Bewusst nicht ersetzt — es hätte bestehende Werte neu gerechnet statt
  geschlossene geöffnet.
- **Zwei Titel** (IRAB, XSLL) führen nur Quartalsreihen und haben deshalb weiter keine
  Berichtsperiode. Bewusst nicht repariert: es sind zwei Übernahmehüllen, bei denen kein Faktor
  aufgehen würde, und der Anker dafür anzufassen wäre ein Eingriff in eine geteilte Engine für
  zwei Datensätze.


## CURRENT_MAIN

- GitHub `main` at this state write: `3f521b4ac` (Materialisierung nach dem Ablage-Push; davor
  `88efa82a` Refresh, `27737bad` Wochenreihen, `2769663e8` PR #222).
- Last merged Quant release: **PR #182**, merge `a0f827ac090ae605275c2ce1041b32036b97f253`,
  2026-09-25 14:01 UTC — die Ablage-Reparatur ist damit auf dem Default-Branch. Davor: PR #173,
  `a0bb8742b684c4ebfe145b7b148d475b0c33b53d`, deployed 2026-09-22.
- This section's work branch: `claude/quant-2-orchestration-hmuo69`, nach dem Merge von #182 neu
  von `origin/main` aufgesetzt (ein gemergter PR traegt keine Folgearbeit).
- Production URL: `https://research.visionuniverse.de`.

## CURRENT_PHASE

`STORE_AUTOMATION_ON_MAIN_SIX_OF_SEVEN_OBSERVED`

Stand 2026-09-25 abends: #182 und #222 sind auf main und in Produktion, und die Ablage-Automatik
ist auf dem Default-Branch **gelaufen**, nicht nur verdrahtet — ein vollständiger Refresh mit
grünem Ablage-Push (13:22), danach Wochenreihen und Materialisierung, alle drei Läufe grün, der
Stand nach dem Lauf gemessen statt übernommen (5.470 Titel auf 2026-09-24, `pattern-match`
`asOf 2026-09-24`, Reise 382 von 500). Sechs der sieben geforderten Punkte sind damit beobachtet;
und seit dem 26.09. ist auch der siebte beobachtet: der **planmäßige** Abendlauf 36206072592 hat
die Ablage ohne jedes Zutun auf den 2026-09-25 gebracht (Push-Schritte ausgeführt, nicht
übersprungen). `STORE_REFRESH_AUTOMATION = PASS`. Dabei fiel derselbe Fehler eine Ebene höher auf
und ist behoben: die Materialisierung der Produktschicht hatte keinen Zeitplan und hängt jetzt am
erfolgreichen Abruf. Details in `MERGED_2026-09-25`. Vorherige Phase
(`STORE_CURRENT_BOTH_LAYERS_GAPS_NAMED_PER_TITLE`):

Abschluss der Kette: die dauerhafte Ablage ist beschrieben, **beide** Schichten
stehen auf dem 2026-09-24 (täglich Technical/Signals/Elliott/Setup, wöchentlich
Musterstudie/Mustervergleich/Belastbarkeit), die Reise ist gegen ihre Grundlinie neu gemessen
(28 Zugewinne, kein Verlust, 381 von 500 Titeln mit allen elf Stationen), und der schwächste
gemessene Bereich hat seinen Satz: jede der 1.284 Musterlücken nennt jetzt ihren Grund mit Zahl.
Vorher, zweite Hälfte: der Zuordnungswechsel ist veröffentlicht und gegen den
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
| M24 | Musterluecke erklaert sich selbst | **DONE** (2026-09-25) — 1.306 Titel, vollstaendig zerlegt; Setup borgt den technischen Grund |
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

## M32_2026-09-26 — DIE ÜBRIGEN 17 PFADE GEMESSEN, UND DIE KLASSE GESCHLOSSEN

M31 endete mit einem Befund statt einer Behauptung: die übrigen 17 verlinkten Pfade waren inhaltlich
nicht gemessen. Nachgeholt, mit der Server-Semantik des Smoke:

| Pfad | Zeichen | Befund |
|---|---:|---|
| `/hedgefonds/` | 20.532 | Inhalt, aber **keine Überschrift** |
| `/discover/` | 14.187 | gesund, 58 Zahlen |
| `/macro/` | 9.609 | gesund, 11 Überschriften, 44 Zahlen |
| `/quant/screener/` · `/quant/ranking/` · `/quant/data-inspector/` | 7.322–7.772 | gesund |
| `/etf/` | 6.023 | Inhalt, aber **keine Überschrift** |
| `/academy/` · `/quant/watchlist/` · `/quant/strategies/builder/` | 2.169–3.663 | gesund |
| `/analysten/` | 1.510 | Inhalt, aber **keine Überschrift** |
| `/guide/` · `/morning/` · `/news/` · `/quant/ai/` · `/quant/backtests/` | 967–2.169 | gesund |
| `/magazin/` | 381 (Rumpftext) | gesund — Kartenseite mit Ausgaben |

**Alle 17 vorhanden.** Zwei Dinge, die in meiner Messung nach Befund aussahen und keiner waren: die
`ERR_CERT_AUTHORITY_INVALID`-Fehler kommen durchweg von **`fonts.googleapis.com`** — die TLS-Sperre
dieser Umgebung, nicht das Produkt. Und `/magazin/` ist nicht leer; die 381 Zeichen waren der
Rumpftext einer Kartenseite.

Offen und klein: **`/etf/`, `/analysten/` und `/hedgefonds/` tragen keine einzige Überschrift** — ein
strukturelles Manko dreier Altseiten (Screenreader, Gliederung), nicht der Quant-2.0-Fläche. Als
Befund notiert, nicht nebenbei umgebaut.

### Und die Klasse ist jetzt geschlossen

M31 fand den toten Knopf **durch eine Messung von Hand**. Ohne Test findet ihn beim nächsten Mal
wieder niemand. `quant/tests/internal-links.test.mjs` liest die Ziele aus dem Quelltext (`href:`,
`link(label, ziel)`, die Navigationsliste) und prüft nach der Regel von GitHub Pages, ob das Release
sie ausliefert — plus, dass sie **in git verfolgt** sind, weil das Release `git ls-files` kopiert
(genau daran war die neue Engine in M26 beim ersten Bauversuch gescheitert).

Zwei eigene Fehler, bevor der Test hielt: der Standardpuffer von `git ls-files` reicht für dieses
Repository nicht (`ENOBUFS`), und ich hatte `"quant/stock/" + "/index.html"` gerechnet — der doppelte
Schrägstrich ließ drei **vorhandene** Seiten als fehlend erscheinen. Ein Test, der sich selbst einen
Befund baut, ist schlimmer als keiner.

Gegenproben: Knopf auf eine erfundene Seite → Fälle 1–3 rot · Methodik-Seite gelöscht → Fälle 1 und 3
rot.

### Damit ist die Oberflächen-Achse ausgemessen

19 Ansichten (M30) + die Methodik-Seite (M31) + 17 verlinkte Pfade (M32), alle unter einem Wächter:
Inhaltsboden und Abdeckung im Smoke, Linkziele im Test. Was an gemessenen Lücken bleibt, ist
**Datengrenze** — 964 Titel mit zu kurzer Historie, 795 Screening-Zeilen ohne einen Faktorwert, 740
ohne 104 Wochen, 1.100 ohne veröffentlichten Namen. Dafür braucht es Daten, nicht Code.

## M31_2026-09-26 — „METHODIK IM DETAIL" FÜHRTE INS LEERE

Nächste unbemessene Achse: die App verlinkt **zwanzig Pfade außerhalb von `/vu2/`** (die
professionellen Workspaces, Discover, ETF, Macro, Hedgefonds …) — und **keiner davon stand je im
Smoke**. Gemessen am gebauten Release: 18 vorhanden, zwei sahen leer aus.

Einer war ein Messfehler meiner eigenen Suche: **`/shares`** ist keine Seite, sondern eine
Einheit (`unit.endsWith('/shares')`, „je Aktie"). Der andere war echt:

```js
main.append(actions([… {label:'Methodik im Detail',href:'/quant/methodology/'}]))
```

Dort liegen 18 Vertragsdateien und **keine index.html**. Auf GitHub Pages ist ein Verzeichnis ohne
Indexdatei ein 404 — der Knopf auf der Erklärseite führte ins Nichts, während die Reise „wie
belastbar ist das alles" als ihre **letzte Station** führt. (Die Vercel-Bereitstellung liefert nur
die API-Funktionen und eine Platzhalterseite; das Live-Frontend kommt aus dem Pages-Release, also
war der 404 echt.)

### Gebaut: die Seite entsteht aus dem Verzeichnis

Je Vertrag: Nutzerbegriff, Fassung, Status, Zweck und der Weg zur vollständigen Datei. Gemessen
nennen **13 der 18** ihren Zweck in Worten; bei den anderen fünf sagt die Seite genau das, statt
einen zu erfinden. Erzeugt statt handgeschrieben, damit ein neuer Vertrag nicht stillschweigend
fehlt — ein Test hält, dass jede Datei des Verzeichnisses vorkommt.

### Zwei Hausregeln haben die erste Fassung zu Recht zurückgewiesen

1. **Der Smoke.** Zwei Verträge heißen „VU Technical Intelligence V1" und „VU Backtest Trust Score
   V1", und ich hatte deren `label` als Überschrift genommen. Das Wörterbuch erlaubt einen internen
   Namen in der Methodik-Ebene, aber *„nie allein und nie zuerst"* — und eine Überschrift ist
   zuerst. Jetzt kommt sie aus dem Wörterbuch („Was der Kursverlauf zeigt", „Wie belastbar ist die
   historische Evidenz?"), der interne Name steht als Beisatz darunter.
2. **§94.** Jede Seite unter `quant/` bindet die gemeinsame Shell ein, die synthetische Daten
   kennzeichnet. Diese Seite zeigt keine Kurse — aber die Regel ist zu Recht kategorisch: wer hier
   später eine Zahl hinzufügt, soll sie nicht unbeschriftet ausliefern können.

Der Smoke prüft den Pfad jetzt mit, als **erste Ansicht außerhalb von `/vu2/`** (40 Prüfungen).

Gegenproben: erfundener Zweck → Fall 2 rot · interner Name in der Überschrift → Fall 3 rot · ein
Vertrag fehlt auf der Seite → Fall 1 rot.

### Offen, als Befund notiert

Die **übrigen 17 verlinkten Pfade** (`/discover/`, `/etf/`, `/macro/`, `/hedgefonds/`,
`/analysten/`, `/quant/ranking/`, `/quant/screener/` …) existieren als Dateien, sind aber
**inhaltlich nicht gemessen**. Einige sind auffällig klein (`/guide/` 626 Bytes, `/news/` 689) —
das kann eine Weiterleitung sein oder eine leere Hülle. Das ist die nächste Messung, nicht die
nächste Behauptung.

## M30_2026-09-26 — WAS DER SMOKE NICHT ANSCHAUT, VERFÄLLT

Dreimal an einem Tag dasselbe Muster, jedes Mal eine unbrauchbare Fläche **ohne eine einzige
Fehlermeldung**:

| | Was der Smoke prüfte | Was niemand sah |
|---|---|---|
| M26 | nur NVDA, AAPL, JPM | ein Stapel Absagen auf datenarmen Seiten |
| M28 | nur Fehlerfreiheit der Übersicht | 5 von 6.875 Kursen, kein einziger Name |
| M29 | nur Fehlerfreiheit des Screeners | 50 richtige Treffer, in jeder Zeile ein Strich |

Deshalb die Frage, die sich daraus ergibt: **welche Ansichten sieht der Smoke überhaupt an?**
Gemessen: von **19 Ansichten im Router standen 12** in seiner Liste. Ungeprüft liefen `atlas`,
`discover`, `elliott`, `markets`, `portfolio` und `research` — und in genau dieser Lücke lagen die
beiden Befunde des Tages.

### Zuerst gemessen, dann aufgenommen

Alle sieben einzeln nachgemessen, bevor sie in die Liste kamen — **alle gesund**:

| Ansicht | Zeichen im `main` | Befund |
|---|---:|---|
| `atlas` | 182.354 | gesund; der vermeintliche 404 war das Favicon |
| `elliott&ticker=NVDA` | 183.591 | gesund |
| `discover` | 4.699 | gesund, 202 Zahlen |
| `home` | 2.880 | gesund |
| `markets` | 1.210 | dokumentierte Regime-Absage (fail-closed), dazu der Trendradar |
| `research` | 889 | Hub-Seite mit Links |
| `portfolio` | 562 | leerer Anfangszustand — die dünnste berechtigte Ansicht |

### Und drei eigene Verdachtsfälle waren Messfehler

Die Sweep-Messung aus M29 zählte nur `.row`-Elemente. Damit sahen drei Ansichten leer aus, die es
nicht sind:

- **`signals`**: 200 Ereignisse als `.signal-event` (von **8.637** im 20-Tage-Fenster).
- **`radar`**: 48 `.radar-item` in sechs Abschnitten.
- **`strategies`**: acht Stil-Karten mit Trefferzahlen und Tickern (Quality Compounder 5, Momentum
  Leader 168, GARP 100 …), und die achte Karte sagt von sich aus: „Dieser Stil verlangt eine
  Eigenschaft, die für keinen einzigen Titel erhoben ist."
- Dazu: der Strategie-Index hat **nicht** „0 Einträge", sondern acht Profile — ich hatte nach dem
  falschen Schlüssel (`rows`) gelesen, das Feld heißt `profiles`.

Vier Verdachtsfälle, vier Messfehler meinerseits. Festgehalten, weil eine Messung, die das Markup
einer Ansicht voraussetzt, das Markup misst und nicht den Inhalt.

### Gebaut: der Boden, der die Klasse fängt

- Alle 19 Ansichten stehen in der Smoke-Liste (**38 Prüfungen**: 19 × zwei Breiten).
- **Inhaltsboden**: unter 400 Zeichen im `main` fällt eine Ansicht durch. Bewusst niedrig — eine
  Seite aus Titel und Untertitel allein kommt auf **54** Zeichen, die dünnste berechtigte Ansicht
  auf **562**. Gemessen werden soll ein Rückschritt, nicht der Tagesstand.
- Ein Test hält beides plus die inhaltlichen Prüfungen aus M26–M29 (`VERDICHTUNG_FEHLT`,
  `KURSE=`, `NAMEN=`, `LEERE_ZEILEN=`, `UNDEFINED_IM_SATZ`, `KEIN_KURSDATUM`) und die gemessenen
  Fälle ACAA, EDVA, AHT-P-D. Eine neue Ansicht, die nicht im Smoke steht, lässt ihn fallen.

Gegenproben: Ansicht aus der Liste entfernt → Fall 1 rot · Inhaltsboden entfernt → Fall 2 rot ·
M28-Namensprüfung entfernt → Fall 3 rot · eine Ansicht, die nur ihre Überschrift setzt →
`ZU_WENIG_INHALT=54` im Smoke.

## M29_2026-09-26 — INHALTSMESSUNG ÜBER ALLE ANSICHTEN, UND DER SCREENER WAR DER AUSREISSER

M28 hat eine Lehre hinterlassen: der Smoke prüfte nur auf **Fehlerfreiheit**, deshalb konnte eine
Liste aus Kürzeln ohne Preis unbemerkt bleiben. Also dasselbe Instrument über **alle dreizehn
Ansichten** gelegt — nicht „gibt es Fehler", sondern „steht da etwas":

| Ansicht | Sektionen | Zeilen | Absagen | „nicht verfügbar" | Zahlen |
|---|---:|---:|---:|---:|---:|
| `/vu2/` | 5 | 5 | 1 | 0 | 16 |
| `stocks` | 0 | 100 | 1 | 15 | 185 |
| **`screener`** | 1 | **50** | 0 | **50** | **0** |
| `radar` | 6 | 0 | 1 | 0 | 100 |
| `strategies` | 6 | 0 | 0 | 0 | 1 |
| `signals` | 0 | 0 | 1 | 0 | 0 |
| `compare` | 1 | 0 | 0 | 0 | 36 |
| `quant&ticker=A` | 10 | 3 | 4 | 2 | 144 |
| `fundamentals` / `technical` / `stock` | 1 / 5 / 7 | 0 | 0 | 0 / 0 / 4 | 13 / 24 / 11 |

Ein Ausreißer: **der Screener — 50 Zeilen, 50 mal „nicht verfügbar", null Zahlen.**

### Die Dienstschicht war die ganze Zeit richtig

`api.screen()` liefert 50 Treffer aus 6.875 Titeln, sauber sortiert: VIVKD 145,5 % · CATG 51,7 % ·
QHUOY 49,6 % · MSFT 41,6 %, jede Zeile mit Wert und Kurs. Die Seite zeigte:

```
VIVKD | VIVKD | – / 7 | Nicht verfügbar
```

fünfzig Mal, und darüber: `50 Treffer in 6875 verfügbaren Unternehmen · undefined · kein
Gesamtmarkt-Ranking`.

**Das `undefined` war die Spur.** In `screenPage` gibt es eine äußere Variable `current` — die
gewählte Methodik — und der Abschluss `apply()` begann mit `const current=++request`, dem Zähler für
verworfene Anfragen. Damit war in `apply()` `current.label` undefined und `current.id==='legacy'`
**immer falsch**: die Seite zeichnete die Faktor-Tabelle der V2-Methodik über Zeilen einer
V1-Abfrage, und dort gibt es kein `evidence`-Feld. Ein Name, ein verschluckter Zustand, eine
unbenutzbare Hauptfunktion — und keine einzige Fehlermeldung.

### Realisiert

| Messung | Vorher | Nachher |
|---|---:|---:|
| Screener-Zeilen mit Zahl | **0** von 50 | **50** von 50 |
| Kopfzeile bei V1 | `BEWERTETE FAKTOREN` (falsche Tabelle) | `SCHLUSSKURS \| KURSENTWICKLUNG · 6 MONATE` |
| Trefferzeile | `· undefined ·` | `· Quant V1 & Marktdaten ·` |
| V2-Methodik | dieselbe Tabelle, leer | `6 / 7 · 98,8 %`, Namen aus M28 |

Beide Breiten geprüft. Die **übrigen fünf Stellen** mit demselben Muster (`const current=++request`
in `openSearch`, `comparePage`, `atlasPage`, `portfolioPage`, `fundamentalsPage`) habe ich
nachgesehen: dort gibt es kein äußeres `current`, also keine Verdeckung.

Der Smoke prüft den Screener jetzt inhaltlich mit (50 von 50 Zeilen mit Zahl, kein `undefined` im
Satz) — zum dritten Mal dasselbe Muster: **was der Smoke nicht anschaut, verfällt.**

### Was die Messung sonst noch zeigt, als Befund notiert

`signals` steht mit 0 Zeilen und einer Absage da, `strategies` mit einer einzigen Zahl, `radar` mit
0 Zeilen bei 100 Zahlen. Das kann richtig sein (keine belegten Wechsel im Fenster ist eine Antwort)
oder dieselbe Klasse Fehler wie hier. Noch nicht gemessen, also noch nicht behauptet — das ist der
nächste Kandidat.

## M28_2026-09-26 — DIE LISTE ALLER UNTERNEHMEN: 5 KURSE, KEIN NAME

M27 hielt fest, dass die Listenansichten für die betroffenen Titel weiter keinen Kurs zeigen. Die
Messung an der **gebauten** Liste war deutlich schlimmer als diese Notiz:

```
A     | A    | Nicht verfügbar | 0,5
AA    | AA   | Nicht verfügbar | -0,3
AAAC  | AAAC | Nicht verfügbar | 0,0
```

| | |
|---|---:|
| Zeilen mit Kurs | **5** von 6.875 (0,07 %) |
| Zeilen mit Namen | **0** von 6.875 |
| Zeilen mit 6-Monats-Wert | 5.964 |

Der Name ist das Feld, das `broadRow` mit dem **Ticker** füllt — deshalb stand er zweimal in der
Zeile. Auf der Einstiegsseite stehen Name und Kurs für fünf handverlesene Titel; für die anderen
6.870 war die Übersicht eine **Liste von Kürzeln ohne Preis**. Das ist nach der Aktienseite die
zweitwichtigste Fläche des Produkts.

### Beides war veröffentlicht — nur nicht in lesbarer Form

| Was | Wo | Deckung |
|---|---|---:|
| Letzter Schlusskurs | `discover-series` (dieselbe Reihe, die die Aktienseite zeichnet) | **6.482** (6.429 zum 25.09.) |
| Name | Company-Master-Suchindex, **646 Shards** nach Symbolpräfix | **5.775** |

Eine Liste kann keine 646 Namensshards und keine 6.487 Kursdateien laden. Deshalb schreibt der
Materialisierungslauf jetzt **ein** verdichtetes Verzeichnis
(`quant/data/product/universe-list-v1.json.gz`, **99 KB gzip**) aus genau diesen Quellen: kein
Anbieterzugriff, keine Rechnung, keine neue Quelle, kein neuer Workflow — ein zusätzliches Artefakt
eines Schrittes, der ohnehin läuft.

**Die Quelle bestätigt sich selbst:** für die fünf Paneltitel trifft der letzte Punkt der Reihe den
Panelkurs auf den Cent (AAPL 341,07 / MSFT 516,17 / NVDA 225,07 / JPM 343,06 / XOM 160,59). Genau
deshalb kann die Liste denselben Kurs zeigen wie die Detailseite, statt einen zweiten zu erfinden.

### Realisiert

| Messung | Vorher | Nachher |
|---|---:|---:|
| Zeilen mit Kurs | 5 | **6.482** von 6.875 |
| Zeilen mit Namen | 0 | **5.773** |
| Im Release sichtbar | `A \| A \| Nicht verfügbar` | **`A \| Agilent Technologies, Inc. \| 172,79 $`** |

Das Verzeichnis überschreibt **nichts**, was schon einen Wert hat, verwirft einen Kurs mit Datum in
der Zukunft, benutzt keinen Eintrag, der zu einem anderen Titel gehört, und lässt
`DISPLAY_NOT_PERMITTED` unberührt. Fehlt es, ist die Liste genau so wie vorher — kein Absturz, keine
erfundene Lücke. Für Titel ohne geprüfte Reihe sagt die Liste jetzt dasselbe wie die Aktienseite
(`NO_PUBLISHED_PRICE_SERIES`) statt eines eigenen Codes; zwei Namen für einen Befund sind für einen
Leser zwei Befunde.

1.100 Titel haben in keiner Quelle einen Namen (`n: null` im Master) — dort steht weiter das Kürzel,
und das ist die Datengrenze, nicht die Darstellung.

### Zwei eigene Tests waren zu schwach — beide prüfen jetzt Verhalten statt Zeichen

1. „Ein vorhandener Kurs wird nicht überschrieben" las den Quelltext auf das Vorhandensein der
   Bedingung — und blieb **grün**, als ich die Bedingung aus der Zuweisung entfernte, weil derselbe
   Ausdruck zwei Zeilen tiefer noch einmal vorkommt. Jetzt liegt ein Verzeichnis im Test, das AAPL
   einen falschen Kurs anbietet; gewinnen muss der veröffentlichte.
2. Die Freigabeprüfung aus M27 las die 600 Zeichen vor der **ersten** Fundstelle von
   `PUBLISHED_CLOSE_FROM_SERIES`. Als M28 eine zweite Fundstelle schuf, sah sie an der falschen
   Stelle nach und fiel, obwohl beide Wege die Prüfung haben. Jetzt verweigert eine eigene
   Anzeigepolitik einen Titel, und der darf weder auf der Seite noch in der Liste einen Kurs tragen —
   mit Gegenprobe im selben Fall, dass ein offener Titel seinen Kurs behält.

### Und der Smoke hat es nie gesehen

Er prüfte die Liste nur auf Fehlerfreiheit, nicht auf Inhalt — deshalb konnte eine Übersicht aus
Kürzeln ohne Preis unbemerkt bleiben. Jetzt verlangt er **99 von 100 Zeilen mit Kurs und 77 mit
Namen**. Dasselbe Muster wie bei ACAA/EDVA in M26: was der Smoke nicht anschaut, verfällt.

## M27_2026-09-26 — „WAS KOSTET DIESE AKTIE?" — DIE KOPFZAHL STAND IM CHART DARUNTER

Der nächste Milestone kam aus der M26-Messung: `identity` war nur für **448 von 500** Titeln
gehaltvoll. 52 Titel bekamen keinen letzten Kurs — die erste Frage, die jeder Mensch stellt.

### Gemessen

| | |
|---|---:|
| Titel ohne letzten Kurs | **52** von 500 (≈ 715 im Universum) |
| … davon mit vertragskonformer, **veröffentlichter** Kursreihe | **33** (31 mit Stand 25.09.) |
| … davon ohne jede Reihe | 19 |
| Grund, den alle 52 nannten | `PRICE_LEVEL_WITHHELD` |

Beispiele: AHT-P-D (270 Handelstage bis 25.09., letzter Punkt **5,17**), ALL-P-B (25,71),
BAC-P-N (18,46), C-P-N (26,55) — überwiegend Vorzugsaktien, also Titel außerhalb des Panels.

**Die Seite sagte „nicht verfügbar" und zeichnete dieselbe Zahl zwei Zentimeter darunter.**

Und der Grund war ein Misnomer: `PRICE_LEVEL_WITHHELD` heißt „zurückgehalten". Zurückgehalten hat
niemand etwas — die Breitzeile (`broadRow`, für Titel außerhalb des Panels) führt einfach kein
Kursniveau, weil die Legacy-Fundamentalzeile keines hat. Ein Grund, der eine **Entscheidung**
behauptet, wo eine **Lücke** ist, schickt jeden in die falsche Richtung: den Leser, der auf eine
Freigabe wartet, und den Entwickler, der nach einer Policy sucht, die es nicht gibt.

### Gebaut — ohne zweiten Leseweg

Genommen wird der **letzte Punkt derselben Reihe, die der Chart trägt**. Die hat ihren Vertrag
(`discover-series-1.1.0`, `dataMode: real`, `source: tiingo`, `priceSeriesType: SPLIT_ADJUSTED`,
`publishBasis`, Datum ≤ heute) beim Zeichnen schon bestanden — es gibt keine zweite
Herkunftsprüfung und keine zweite Quelle, und ein Leser kann die Zahl **mit den Augen** nachprüfen.

Drei Dinge, die dabei nicht passieren:

- **Kein falsches Datum.** Der Kurs bringt sein eigenes `asOf` mit, weil `stock.asOf` den Stand der
  *Geschäftszahlen* trägt und für diese Titel leer war. BCAR steht auf 4,72 vom **27.08.** — das
  Datum steht dabei, statt den Kurs von heute vorzugeben.
- **Keine Sperre wird zum Wert.** `DISPLAY_NOT_PERMITTED` bleibt unberührt; der Weg füllt nur, was
  aus Datenmangel leer war. Ein Test hält genau das (Fall 4), und die Gegenprobe ohne die
  Freigabeprüfung fällt.
- **Keine Behauptung ohne Reihe.** Die 19 Titel ohne Reihe sagen jetzt `NO_PUBLISHED_PRICE_SERIES`.

### Realisiert

| Messung | Vorher | Nachher |
|---|---:|---:|
| Titel mit letztem Kurs | 448 / 500 | **481 / 500** (≈ +450 im Universum) |
| davon aus der gezeichneten Reihe | — | **33** |
| Absagen in der Stichprobe | 643 | **610** |
| Absagen nach Verdichtung | 281 | **248** |
| Formen (voll / reduziert / zu dünn) | 409 / 89 / 2 | **unverändert** |

**Bemerkenswert und ehrlich gesagt: 30 der 33 lagen auf datenREICHEN Seiten.** AHT-P-D hat 3.008
Handelstage, einen veröffentlichten Setup-Zustand und eine volle Kursstruktur — es fehlte nur die
Kopfzahl. Deshalb verschiebt dieser Milestone **keine** Seite von reduziert nach voll: er nimmt 33
Absagekästen von Seiten, die ansonsten vollständig waren. Wer „+33 datenarme Titel gerettet" daraus
machen wollte, würde die Messung falsch lesen.

Der Produktions-Smoke prüft AHT-P-D jetzt mit: eine Zahl im Kopf **und** ein Datum dazu
(`5,17 $ · 2026-09-25 · Schlusskurs der Reihe, die unten gezeichnet ist`).

### Was an dieser Stelle offen bleibt

Die **Listenansichten** (Übersicht, Screener, Radar) zeigen für diese ~715 Titel weiter keinen Kurs:
sie bauen auf `broadRow` ohne Einzelreihe-Lesung, und 1.450 Dateilesungen pro Liste wären kein
Zustand. Das bräuchte einen **Kursindex** über das Universum — also ein neues Artefakt in der
Materialisierung. Als gemessener Befund festgehalten, nicht nebenbei gebaut.

## M26_2026-09-26 — DIE VERSTÄNDLICHE REISE FÜR DATENARME TITEL

Auftrag: ein Titel mit nur drei bis sieben verfügbaren Stationen darf nicht wie eine kaputte Seite
wirken. Verfügbares zuerst, Nicht-Verfügbares gruppiert, Ursache verständlich, keine elf
Einzelboxen, keine Fachsprache, keine erfundenen Aussagen, keine neuen Pipelines.

### Erst gemessen — und die Messung selbst war der Befund

Die bisherige Reisemessung zählte, ob eine Station **antwortet**. Diese hier zählt, ob sie
**etwas zeigt** (mindestens ein konkreter Wert):

| Gehaltvolle Stationen | Titel | Form |
|---:|---:|---|
| 11 | 352 | **volle Reise: 409** |
| 10 | 56 | |
| 9 | 1 | |
| 7 | 9 | **reduzierte Reise: 89** |
| 6 | 2 | |
| 5 | 34 | |
| 4 | 37 | |
| 3 | 7 | |
| 1 | 2 | **zu wenig für eine Reise: 2** (EDVA, GLMD) |

Der Unterschied ist nicht akademisch: **ACAA gilt an vier Stationen als beantwortet und zeigte dort
0 von 7 Faktoren und 0 von 16 Kennzahlen.** Für einen Leser ist das keine Antwort, sondern eine
Überschrift über einer leeren Fläche.

Und die Form der datenarmen Seite war das eigentliche Problem: 91 Titel der Stichprobe hatten im
Median **fünf Absagen** — bei nur **drei Ursachen** (2 Ursachen bei 13 Titeln, 3 bei 68, 4 bei 9,
5 bei einem). Die häufigsten gemeinsamen Ausfälle tragen sogar denselben Grund, Titel für Titel:

```
setup + setupChange          73 mal zusammen aus · 73 mal identischer Grund
setup + technical            73 mal zusammen aus · 73 mal identischer Grund
setupChange + technical      73 mal zusammen aus · 73 mal identischer Grund
factorStrength + strategy    21 mal zusammen aus · 21 mal identischer Grund
```

### Gebaut: ein Vertrag, zwei Halbseiten der Reise

`quant/engines/journey-shape.js` entscheidet zwei Dinge und sonst nichts: welche **Form** eine Seite
hat und wie die Absagen zu **Ursachengruppen** zusammenfallen. Oberfläche und Messung rufen
dieselbe Funktion — eine zweite Kopie der Regel wäre eine Zahl, die nichts über die Seite aussagt,
und ein Test hält genau das (Fall 10).

Die Schwelle ist in **Absagen** formuliert, nicht in Stationen: bis zu zwei sind Beiwerk in einer
vollen Reise, ab der dritten ist die Seite ein Stapel. Auf allen elf Stationen ist das genau die
gemessene Grenze (409/89/2); und weil die Aktienseite acht der elf Stationen trägt, wäre eine
Schwelle „mindestens neun gehaltvoll" für jede Teilansicht falsch. Eine Station, die der Aufrufer
nicht übergibt, ist **keine Absage** — sonst gibt eine Teilseite ihre eigene Unvollständigkeit als
Datenmangel des Titels aus.

Verdichtet wird auf **beiden** Hälften: die Quant-Ansicht zeigte für ACAA sieben leere
Eigenschaftszeilen, eine Tabelle ohne Zahlen und vier Absagen — weil ein Zustand `AVAILABLE` noch
kein Wert ist. Der Orientierungssatz dort versprach acht Abschnitte; er sagt jetzt, was wirklich
folgt.

### Drei Dinge, die erst die echten Daten gezeigt haben

1. **`SOURCE_MISSING` heißt nicht überall dasselbe.** An den Zahlenstationen bedeutet es „keine
   Kennzahlen", an den Kursstationen „keine Kursreihe". Die erste Fassung erklärte ACAA und ANV
   damit die falsche Ursache — plausibel klingend und falsch, also schlimmer als elf Boxen.
2. **Zwei Nenner dürfen nicht zu einem werden.** „Von 7 Kennzahlen ist keine veröffentlicht"
   mischte die sieben Faktoren mit den sechzehn Kennzahlen. Beide Zahlen sind gemessen, der Satz
   war trotzdem erfunden. Jeder Bereich trägt jetzt seine eigene Zahl, der Gruppensatz keine.
3. **`NO_WEEKLY_SERIES` braucht eine eigene Gruppe.** „Für diesen Titel liegt keine Kursreihe vor"
   widersprach dem Tagesverlauf, der drei Zentimeter darüber zu sehen ist. Jetzt: „Diese Auswertung
   vergleicht Wochenverläufe … der Tagesverlauf oben bleibt davon unberührt."

Dazu, im Nebenblock der Aktienseite gefunden: drei Zeilen „Nicht verfügbar" untereinander und der
Satz „Die langfristige Kursstruktur verdient einen genaueren Blick" — eine Beurteilung ohne Zahl.
Beides ist weg; ohne Durchschnittswerte steht da jetzt, dass sie fehlen und wo der Grund steht.

### Realisiert, gemessen am gebauten Release

| Messung | Vorher | Nachher |
|---|---:|---:|
| volle Reisen | — | **409** von 500 |
| reduzierte Reisen | — | **89** |
| zu wenig für eine Reise | — | **2** |
| Absagekästen insgesamt | 643 | **281** |
| … auf den 91 datenarmen Seiten | 585 | **223** |
| schlimmste Seite | 8 | **4** |
| ACAA (Aktienseite) | 6 Absagen + leeres Kennzahlengitter | **3 Gruppen + 1 Charthinweis** |
| ACAA (Quant-Ansicht) | 4 Absagen + 7 leere Zeilen | **3 Gruppen, 0 Einzelabsagen** |
| EDVA (kein Kurs) | leere Seite mit Hinweisen | **4 Gruppen, 0 Einzelabsagen** |

**Stoßen Nutzer noch auf leere oder fragmentierte Seiten?** In der reduzierten Form wird kein
Abschnitt ohne Wert mehr gesetzt — gerendert wird genau, was gehaltvoll ist. Der einzige
Einzelhinweis, der auf ACAA bleibt, kommt aus dem Chart selbst (117 Handelstage, der 1-Jahr-Bereich
ist nicht gefüllt). Gehalten wird das nicht durch eine Konstante im Bericht — eine Null, die nichts
messt, stand dort einen Commit lang —, sondern durch den Produktions-Smoke am gebauten Release:
**ACAA und EDVA stehen jetzt in seinen Ansichten**, mit Prüfung auf Gruppen, benannte Bereiche,
höchstens einen Einzelhinweis und Alltagssprache im Haupttext. Vorher kannte er nur NVDA, AAPL und
JPM — Titel, bei denen alles da ist, weshalb ein Stapel Absagen dort nie auffallen konnte.

### Nebenbefund auf main, nicht von dieser Änderung verursacht

Der **Backtest-Blocker war aus der Blockerliste verschwunden**. Grund: der wöchentliche Workflow
`index-membership.yml` hat den **zweiten** Zugehörigkeitsstand je Index geschrieben, und die Stelle
im Prüfskript hatte sich selbst die Aufgabe gestellt, beim zweiten Stand nachgezogen zu werden.
Die Folge war, dass der Backtest sich näher an offen las — genau das, was die Zeile verhindern
sollte. Zwei Stände sind keine Historie: ein Point-in-Time-Lauf braucht die Zugehörigkeit an
**jedem** Rebalancing-Datum seines Fensters. Der Blocker steht wieder, nennt den gemessenen Stand
und was ihn schließt; dass die Reihe wächst, steht daneben. Der Test prüft jetzt den Vertrag statt
der Zahl 1 — dieselbe Reparatur wie beim Versionspin aus M25.

## M25_2026-09-26 — DIE DREI SCHWÄCHSTEN STATIONEN, ZUERST GEMESSEN

Auftrag: Strategy, Setup/SetupChange, Technical — je Station **messen**, warum Titel fehlen
(Daten? Capability? Consumer-Verknüpfung? Darstellung? falscher Gate? echter methodischer
Ausschluss?), und nur dort bauen, wo Code den Gap schließt.

### Die Messung, vor dem ersten Handgriff

| Station | Beantwortet (500er-Stichprobe) | Woran es liegt |
|---|---:|---|
| **Strategy** | 418 | 434 Titel ohne Screening-Zeile · 795 mit Zeile, aber `availableFactors: 0` · 22 mit genau **einer** messbaren Bedingung bei mindestens zwei verlangten → **Datengrenze** und ein dokumentiertes Gate. Die Oberfläche unterscheidet die drei Fälle bereits mit eigenen Sätzen. |
| **Setup / SetupChange** | 425 | **Kein eigener Gap.** Das Setup-Universum *ist* das technische (`inputs.technical.instruments`, `unavailable: 0`). Setup fällt genau dann aus, wenn die Kursstruktur ausfällt. |
| **Technical** | 426 | 1.033 ohne Bundle: **964** zu kurze Historie (Balken min 1, Median 121, max 299 gegen 300 verlangt) → Datengrenze · **42** `TECHNICAL_CALENDAR_INVALID` · **26** `NOT_TECHNICAL_READY` · 1 ohne Reihe. |

Die 42 und die 26 sahen nach Datengrenze aus und waren keine — beide Zahlen haben nachgemessen
eine andere Ursache:

**Die 26 waren ein veralteter Vormerk-Wert.** Ihre Balkenzahl stand im Deckungsbericht
`technical-coverage-ELIGIBLE_US_EQUITY.json` vom **11.09.** (Lauf 34611793308) bei 290–298; heute
haben dieselben Titel **301–309**, also mehr als die 300, die die Materialisierung **selbst**
verlangt. Sie bekamen trotzdem kein Bundle, weil `member.t` ein Veto sprach — und mit ihnen keine
Setup-Zeile. Jeder Titel, der die Schwelle nach dem Berichtsdatum überschreitet, blieb bis zum
nächsten Bericht draußen. Der Kommentar über der Bedingung sagte seit Langem „Die Zahl entscheidet,
nicht die Vormerkung"; die Bedingung tat es nicht.

**Die 42 waren zwei Lagen unter einem Namen.** 40 Titel werden so dünn gehandelt, dass ihre letzten
270 Kurstage **1,1 bis 4,0 Jahre** zurückreichen (AAAP: 67 Balken im Jahr) und aus der
Kalenderdeckung (ab 2022-01-01) herauslaufen; 2 Titel tragen eine Kursbar an einem Tag mit
geschlossener Börse (2026-02-16, 2026-04-03, 2026-05-25). Der Ausschluss ist in beiden Fällen
**richtig** — 270 Sitzungen über vier Jahre beschreiben keine „aktuelle Kursstruktur" —, der Grund
war es nicht: er klang nach einem Defekt unseres Kalenders.

### Gebaut wurde dreierlei, plus ein Nachzug

1. **`bundleGate(capabilityState, bars)`** — nur Zustände, die dieser Lauf **nicht** selbst
   nachmisst, dürfen vetoen. `INSUFFICIENT_HISTORY` misst er an der Reihe, `SOURCE_MISSING` an der
   Datei; `TECHNICAL_PARTIAL` und `TECHNICAL_FAILED` bleiben ein Veto und nennen sich im `detail`.
2. **Zwei Gründe statt einem**: `TECHNICAL_WINDOW_OUTSIDE_CALENDAR` (mit Fensterspanne,
   Sitzungszahl und Deckungsgrenze) und `TECHNICAL_SESSION_NOT_A_TRADING_DAY` (mit dem Datum),
   Block `technical-unavailable-1.1.0`; der Leser akzeptiert 1.0.0 und 1.1.0.
3. **Ein Nein mit Richtung**: der No-Fit-Satz nennt den nächsten Stil, seinen Prozentwert,
   erfüllte von messbaren Bedingungen und die offenen **mit Namen**. Alles war gerechnet; keine
   neue Schwelle, keine Prognose. Betroffen: 217 von 500 Titeln — der häufigste Satz des
   Abschnitts.
4. **Der Nachzug, den erst die Re-Messung zeigte**: nach Fix 1 lagen die 26 Bundles im Artefakt,
   und die Aktienseite zeigte sie *trotzdem* nicht — `getTechnicalIntelligence` prüfte `member.t`
   ein zweites Mal, **vor** dem Lesen. Sichtbar wurde es daran, dass die Setup-Station stieg (sie
   liest das Artefakt) und die Technical-Station nicht. Jetzt entscheidet das Artefakt; die
   Vormerkung spricht erst, wenn nichts veröffentlicht ist, und dann mit dem Grund je Titel. Die
   reduzierte Auskunft bleibt genau den Titeln, die sie heute schon bekommen.

### Realisiert, nicht vorhergesagt (Lauf 36226116267, Commit `91c39e1487`)

| Messung | Vorher | Nachher |
|---|---:|---:|
| `technicalFullBundles` | 5.842 | **5.868** (+26) |
| `elliottCapable` | 5.755 | **5.777** (+22) |
| Setup-Universum / beobachtet | 5.842 | **5.868** (+26) |
| `NOT_TECHNICAL_READY` | 26 | **0** |
| Kalendergrund, aufgeteilt | 42 unter einem Code | **40** Fenster · **2** Feiertagsbar |
| Bundles, die der Dienst verschwieg | 26 | **0** (ALM, ANPA, HERZ … liefern `FULL_WORKSPACE` auf 2026-09-25) |

Reise, dieselbe 500er-Stichprobe wie die Grundlinie: **technical 426 → 427**, **setup 425 → 426**,
**setupChange 425 → 426**, alle elf Stationen weiter 382. Der Zugewinn ist im Universum 26 Titel an
drei Stationen; in einer 1-von-13-Stichprobe ist das ein Titel, und mehr behauptet diese Zeile
nicht. Aus der Messung verschwunden ist der Sammelcode `TECHNICAL_EVIDENCE_NOT_PUBLISHED`: die
Station nennt jetzt `INSUFFICIENT_HISTORY 68 · TECHNICAL_WINDOW_OUTSIDE_CALENDAR 4 ·
SOURCE_MISSING 1`.

Ein gemessener Unterschied bleibt und ist keiner zu viel: Technical beantwortet **427**, Setup
**426**. Der eine Titel ist AEC — er hat kein Bundle (Fenster-Fall), ist aber als
`TECHNICAL_READY` vorgemerkt und bekommt deshalb die **reduzierte** Auskunft
(`evidenceLevel: REDUCED_EVIDENCE`, `fullWorkspace: false`, mit Grund je Titel). Setup hat für ihn
keine Zeile und sagt das. Zwei Evidenzstufen, zwei Antworten — kein stiller Fallback.

### Was an diesen drei Stationen jetzt übrig ist

Alles Datengrenze, nichts davon in Code schließbar: Strategy 61 Zeilen ohne einen einzigen
Faktorwert und 21 ohne Zeile; Setup/Technical 68 mit zu kurzer Historie; dazu die 40 dünn
gehandelten und die 2 mit einer Feiertagsbar, beide methodisch richtig ausgeschlossen und jetzt
richtig benannt.

### Die Gegenprobe über die ÜBRIGEN Stationen: kein verdeckter Riegel mehr

Zweimal an einem Tag lautete der Befund „die Daten sind da, etwas anderes hält sie zurück". Danach
ist die Frage berechtigt, ob dieselbe Signatur noch woanders steckt. Über dieselbe 500er-Stichprobe
gemessen, je Station gegen ihre eigene Eingangslage:

| Prüfung | Befund |
|---|---:|
| `chart` sagt `SOURCE_MISSING`, obwohl die kompakte Kursreihe im Repository liegt | **0** |
| `factorStrength` nicht gedeckt, obwohl eine Screening-Zeile existiert | **0** |
| `change` nennt `NO_COMPARABLE_OBSERVATION`, obwohl zwei veröffentlichte Stände vorliegen | **0** von 5 Kandidaten |

Die fünf Kandidaten (GYGY, MFP, OCAC, REF, VCRE) stehen in **allen drei** Snapshots
(2026-09-23/24/25) — und tragen dort je **sieben `null`**. Es gibt zwei Stände und nichts zu
vergleichen; die Station sagt genau das. Damit ist der Satz belegbar:

> **Nach den beiden Fixes hält keine Station mehr etwas zurück, dessen Eingangsdaten vorliegen.**
> Jede verbleibende Lücke der Reise ist eine Datengrenze, keine Code-Lücke.

### Der nächste Milestone folgt daraus, nicht aus einer Rangliste

Wenn Deckung nicht mehr an Code hängt, ist der schwächste *echte* Product-Gap nicht die Deckung,
sondern die **Verständlichkeit für die datenarme Kohorte**. Gemessen an der Stichprobe: 382 von 500
Titeln bekommen alle elf Stationen, aber **56 bekommen genau sechs**, 26 sieben, sechs fünf, zwei
drei. Für diese rund 18 Prozent besteht die Seite überwiegend aus Absagen — jede einzelne richtig
und benannt, in der Summe aber kein Durchlauf, sondern ein Stapel. Das ist in Code schließbar
(Darstellung und Sprachschicht, keine neuen Daten) und deckt sich mit dem Ziel: *möglichst viele
Titel vollständig **und verständlich***.

## MERGED_2026-09-25 — #182 AUF MAIN, DER PRODUKTIONSWEG, DIE ABLAGE-AUTOMATIK

### Der Merge

PR #182 war `mergeable_state: dirty`. `origin/main` (`2e7409888e`) in den Branch gemergt: 26
Konflikte, **alle** in erzeugten Artefakten unter `quant/data/fundamentals/` und
`quant/data/universe/`. Aufgelöst mit der Seite, die nachweislich neuer ist — mains Fassungen
tragen `generatedAt 2026-09-25T12:02:22` gegen `2026-09-23T14:15:15` auf dem Branch, bei gleicher
Mitgliederzahl (6.875). Es sind die Ausgaben der Tagespipelines, und die laufen auf main. Von Hand
editiert wurde keine Zeile. 1.837 quant-Tests und 273 Discover-Tests grün auf dem
zusammengeführten Baum. Merge: `a0f827ac090ae605275c2ce1041b32036b97f253`.

### Der Befund, der den Merge fast wertlos gemacht hätte

Ein Merge auf main ist **nicht** Produktion. Lauf 36144719141 (pages-release auf dem
Merge-Commit) brach im Schritt *Production smoke over the built release* ab; *Enforce delivery
contract*, `configure-pages`, `upload-pages-artifact` und der ganze `deploy`-Job wurden
übersprungen. `research.visionuniverse.de` stand damit weiter auf dem Release von Lauf 36132298539
(11:58 UTC) — die ganze Kette lag auf main und war für keinen Nutzer sichtbar.

Ursache war eine eigene Zeile aus `2e6f25a435`:

```
node -e "require('playwright').chromium.executablePath()" >/dev/null 2>&1 || npx playwright install …
```

`chromium.executablePath()` liefert den **erwarteten** Pfad und prüft nicht, ob die Datei
existiert. Die Bedingung war also nie falsch, die Installation wurde in **jedem** Lauf
übersprungen, und `chromium.launch()` scheiterte an einem Binary, das nie geladen wurde
(`chromium_headless_shell-1187`). Alle anderen sieben Workflows dieses Repositories installieren
unbedingt; genau dieser Schritt war die Ausnahme — und es war der Schritt, der über die
Auslieferung entscheidet.

Behoben in PR #222 (`2769663e8`): die gepinnte CLI installiert Chromium unbedingt. Nachweis vor
dem Merge: lokal gegen dasselbe gebaute Release 29 von 29 Ansichten sauber (1440 px und 390 px,
`PRODUCTION SMOKE CLEAN`), in CI Lauf 36149278192 Smoke grün in 95 Sekunden, Liefervertrag grün,
Pages-Artefakt gebaut.

Die Lehre gehört ins Protokoll, nicht nur der Fix: **eine Prüfung, die nie fehlschlagen kann, ist
keine Prüfung.** Ein `|| install` hinter einem Aufruf, der nur einen Pfad *berechnet*, sieht aus
wie Vorsorge und ist eine Zusicherung ohne Messung.

### Warum ein abgewiesener Repo-Push die Ablage nicht mehr einfriert

Der letzte planmäßige Refresh vor dem Merge (Lauf 36078691085, 25.09. 01:30–02:44) war bis Gate B
grün und starb im letzten Schritt: `Commit und Push`. Der Rebase auf ein zwischenzeitlich
gewachsenes main hatte fünf Konflikte; drei löste `scripts/ci/push-with-retry.sh` nach
Erzeugerhoheit auf, zwei nicht — `quant/data/product/capabilities-v1.json` und
`capabilities-summary-v1.json` standen nicht auf der Liste, obwohl **derselbe Lauf** sie schreibt.
Nach 68 Minuten Abruf und grünen Gates war der Commit verloren. Dieser Fix ist nicht von hier: er
liegt seit `ff4c55a6c1` (25.09. 03:20) auf main, ist im Merge-Commit enthalten und durch
`quant/tests/push-with-retry.test.mjs` festgehalten (PR3: jeder Pfad, den Refresh **und** ein
Intraday-/Taktlauf committen, steht unter Erzeugerhoheit).

Für die Ablage-Automatik zählt die Reihenfolge, und die ist nachlesbar in
`market-data-refresh.yml`: Gate B (215) → Zugang (218) → **Vorabrechnung (256)** → **Push (268)** →
Bericht (286) → Arbeitsablage (298/310) → `Commit und Push` (317). Die dauerhafte Ablage wird also
geschrieben, **bevor** der Repo-Push überhaupt versucht wird. Ein abgewiesener Push kostet den
Commit des Tages — er friert die Ablage nicht ein. Das war vor dieser Kette genau umgekehrt: es gab
keinen Push in die Ablage, und nichts anderes konnte das ausgleichen.

Die drei Push-Schritte hängen einzig an `steps.history_store.outputs.ready == 'true'` — an keiner
Ereignisart. Ein `schedule`-Lauf führt sie deshalb genauso aus wie ein `workflow_dispatch`; der
Zeitplan (`cron: '30 22 * * 1-5'`) liegt mit dem Merge auf dem Default-Branch, wo GitHub ihn
überhaupt erst auswertet.

### Die Automatik, auf dem Default-Branch gemessen

Ein vollständiger Durchlauf auf `main`, nicht auf einem Branch, nicht von Hand nachgeholfen.
`market-data-refresh.yml` als Dispatch auf main (Lauf **36144793708**, `workflow_dispatch` — aber
über genau die Schritte, die ein `schedule`-Lauf nimmt, weil keiner davon an der Ereignisart hängt):

| Schritt | Ergebnis |
|---|---|
| Gate A (Code-Regression vor dem Abruf) | grün, 1:21 |
| Tageskurse + Discover-Reihen | grün, 14:03:55 → 15:47:05 |
| Gate B (Data-Integrity) | grün, 15:50:40 |
| Zugang zur dauerhaften Ablage | `ready=true` |
| Vorabrechnung (`preflight-zero-cost`, DAILY_UPDATE) | grün |
| **Dauerhafte Ablage auf den frischen Stand bringen** | **grün, 15:50:57 → 16:04:19 (13:22)** |
| Stand der dauerhaften Ablage (Gegenprobe) | grün |
| Commit und Push | Versuch 1 abgewiesen (`b39d7aa5` von einer anderen Pipeline), Rebase, **Versuch 2 erfolgreich** → `88efa82a`, 12.501 Dateien |
| Gate C (Beobachtung) | 1.997 bestanden, 0 fehlgeschlagen |

Der abgewiesene Push ist hier der Beleg, nicht der Makel: er geschah **nach** dem Ablage-Push und
kostete nichts. Genau diese Stelle hat den planmäßigen Lauf der Nacht noch zerrissen.

Danach, in dieser Reihenfolge, beide Verbraucherschichten:

- `long-series.yml` auf main (Lauf **36159622919**, grün): Wochenreihen in 6:40 aus der frischen
  Ablage, 6.333 Reihen, `{"requested":6876,"written":0,"unchanged":6333,"missing":2,"tooShort":541,"failed":0}`.
  **`written: 0` ist hier Aktualität, nicht Stillstand:** der jüngste abgeschlossene Handelstag in
  der Ablage ist der 2026-09-24, die laufende Sitzung schließt erst um 20:00 UTC — es gibt keinen
  neuen Wochenbalken anzuhängen. Der Abendlauf um 22:30 ist der, der den 25. anfügt.
- `product-intelligence-materialization.yml` auf main (Lauf **36161139949**, grün): Ablage gezogen
  16:32:02 → 16:34:39, Technical/Signals/Elliott 16:36:04 → 16:49:47, danach Factor Evidence,
  Setup, Musterstudie, Mustervergleich, Strategieindex, Regime, Reisemessung; Commit `3f521b4a`.

Auf dem so entstandenen main gemessen (nicht übernommen):

| Messung | Wert |
|---|---:|
| `technicalFullBundles` | 5.842 |
| `signalsCapable` | 5.967 |
| `elliottCapable` | 5.754 |
| `calendarValidated` | 5.967 |
| letzter Balken **2026-09-24** | **5.470** Titel |
| letzter Balken 2026-09-10 (Kohorte ohne veröffentlichte Kursreihe) | 331 |
| `pattern-match` `asOf` | 2026-09-24 |
| Musterlücke, je Titel benannt | 1.284 (740 `INSUFFICIENT_WEEKLY_HISTORY`, 542 `NO_WEEKLY_SERIES`, 2 `NO_MEASURABLE_FEATURES`) |
| Reise: Titel mit allen elf Stationen | 382 von 500 (`evidenceAsOf 2026-09-24`) |

Dieselben Zahlen wie vor dem Merge — und das ist die Aussage: die Automatik hat den Stand ohne
Zutun reproduziert, nichts ist wieder eingefroren. Nebenbei erledigt: `journey-coverage-v1.json`
wird jetzt von CI committet (`generatedAt 2026-09-25T16:56:58`); vorher entstand die Messung im
Lauf und blieb dort.

### Der Test, den es vorher nicht gab

Das Verhalten von `sync-history-store.mjs` war durchgehend geprüft — `history-sync-boundary`
deckt 14 Fälle ab, bis zu „push refuses a foreign existing durable identity". Nur **rief es
niemand**, und kein Test hat je gefragt, ob ein Workflow den Aufruf ausführt. Deshalb neu:
`quant/tests/history-store-automation.test.mjs` (6 Fälle) prüft den *Aufruf*:

1. irgendein Workflow ruft `sync-history-store.mjs --push` (der Zustand, der zehn Handelstage
   gekostet hat, wird rot),
2. der Abruf hat einen Zeitplan,
3. Vorabrechnung und Push hängen an `steps.history_store.outputs.ready`, **nicht** an
   `github.event` — sonst überspringt ein planmäßiger Lauf sie,
4. der Push steht nach Gate B und **vor** `Commit und Push`,
5. der Push läuft nur mit der Vorabrechnung, die der Schritt davor schreibt,
6. `history-store-sync.yml` ist dispatchbar und fragt keinen Anbieter (kein `TIINGO`).

Gegenprobe, weil eine Prüfung, die nicht fehlschlagen kann, keine Prüfung ist: mit
`&& github.event_name == 'workflow_dispatch'` am Push fällt Fall 3; ohne den Push-Schritt fallen
die Fälle 1, 3, 4 und 5. Die Datei liegt im Muster `quant/tests/*.test.mjs` und damit in Gate A —
der nächste Abruf prüft seinen eigenen Ablage-Vertrag, bevor er eine Anfrage stellt.

### STORE_REFRESH_AUTOMATION

| # | Punkt | Stand |
|---|---|---|
| 1 | scheduled market refresh läuft auf main | **belegt** — `cron: '30 22 * * 1-5'` liegt auf dem Default-Branch, die Job-Bedingung nimmt `schedule`, die Push-Schritte hängen an keiner Ereignisart (Test Fall 2 und 3) |
| 2 | durable history push wird ausgeführt | **beobachtet** — Lauf 36144793708, Schritt grün, 13:22 |
| 3 | daily canonical history bleibt aktuell | **gemessen** — 5.470 Titel auf 2026-09-24 nach dem Lauf |
| 4 | weekly long-series bleibt aktuell | **gemessen** — Lauf 36159622919, 6.333 Reihen, kein neuer Wochenbalken fällig |
| 5 | Technical / Signals / Elliott / Setup lesen den aktuellen Stand | **gemessen** — 5.842 / 5.967 / 5.754 aus dem gezogenen Store |
| 6 | Pattern Match liest den aktuellen Wochenstand | **gemessen** — `asOf 2026-09-24`, Lücke 1.284 je Titel benannt |
| 7 | kein erneutes Freeze nach dem nächsten **planmäßigen** Lauf | **beobachtet (26.09.)** — Lauf **36206072592**, `event: schedule`, main, 00:46:36 → 02:16:32 grün; Schritt 25 (Vorabrechnung) und Schritt 26 (Ablage-Push, 15:22) **ausgeführt, nicht übersprungen**; danach gemessen: die veröffentlichten Tagesreihen enden auf **2026-09-25** (3.960 von 4.000 gelesenen Titeln) |

**Verdikt: `STORE_REFRESH_AUTOMATION = PASS`** (26.09.2026, Beleg Lauf 36206072592).

Zwei Dinge, die die Beobachtung nebenbei geklärt hat, und die kein Zeitplan-Kommentar hergibt:

- **„22:30" ist nicht 22:30.** GitHub startet diesen Workflow rund zwei Stunden nach der
  Cron-Zeit: 2026-09-23 um 00:50:46, 09-24 um 00:44:27, 09-25 um 00:41:26, 09-26 um 00:46:32 —
  also `+2h11m` bis `+2h20m`. Der erste Check-in um 23:50 UTC fand deshalb **keinen** Lauf; das war
  keine ausgefallene Automatik, sondern eine Warteschlange. Wer die Abendkette plant, rechnet mit
  ~00:45 UTC, nicht mit 22:30.
- **Gate A des planmäßigen Laufs hat den neuen Vertragstest schon mitgeprüft**
  (`history-store-automation`, im Muster `quant/tests/*.test.mjs`): der Lauf hat seinen eigenen
  Ablage-Vertrag bestätigt, bevor er eine Anfrage gestellt hat.

Nebenbefund, nachgesehen und **nicht** offen: der `freshness-monitor` war auf main bei jedem
planmäßigen Lauf bis zum Abend des 25.09. rot („Die veroeffentlichte Seite zeigt nicht den letzten
Handelstag", z. B. Läufe 36173774823 und 36178586940). Das gehört nicht zu dieser Kette und ist
auch nicht von hier behoben: seit **2026-09-26 03:38 UTC ist der Monitor grün** (Lauf 36215442014),
nach der Freshness-P0-Arbeit einer anderen Sitzung (#224, „Live-Stand 2026-09-25 = letzte
abgeschlossene Sitzung"). Festgehalten, weil ein Dauerrot aufhört, ein Signal zu sein — und weil
diese Zeile sonst als offener Befund weitergetragen würde, den es nicht mehr gibt.

### Derselbe Fehler eine Ebene höher — und dort behoben

Beim Nachmessen von Punkt 7 fiel auf: die **Ablage** stand planmäßig auf dem 2026-09-25, die
**Produktschicht** auf dem 2026-09-24. Ursache ist die exakte Wiederholung des Befunds, der diese
Kette ausgelöst hat: `product-intelligence-materialization.yml` hatte **keinen Zeitplan**, und ihr
einziger automatischer Auslöser war ein `push`-Filter auf `codex/**` plus eine Commit-Marke
`[materialize-product-intelligence]` — beides erfüllt kein Lauf auf main. Die Produktschicht
entstand also nur, wenn ein Mensch oder ein Agent sie dispatcht. Eine aktuelle Ablage, die kein
Leser sieht, ist kein aktueller Stand.

Behoben mit dem Mechanismus, den dieses Repository für solche Ketten schon benutzt
(`pages-release`): die Materialisierung hängt jetzt per `workflow_run` am **erfolgreichen** Abruf
auf main (`conclusion == 'success'`, `head_branch == 'main'`), Job-Bedingung inklusive — ein
Auslöser in `on`, den die Job-Bedingung nicht zulässt, startet einen Lauf, der nichts tut, und das
ist derselbe stille Ausfall in neuer Kleidung. Keine Schleife: der Abruf reagiert nicht auf Pushes
nach main. Kein Anbieter-Abruf.

Der Vertragstest deckt das jetzt mit ab (`die Produktschicht folgt dem Abruf von selbst, nicht auf
Zuruf`, Fall 6 von 7). Gegenprobe: ohne `workflow_run` fällt der Fall; **und** mit `workflow_run`
in `on`, aber ohne die Job-Bedingung, fällt er ebenfalls.

Der Rückstand selbst ist eingeholt, nicht nur verdrahtet — Materialisierung **36219419775** auf
main, danach gemessen (Commit `b978266b6d`):

| Messung | Vorher (24.09.) | Jetzt |
|---|---:|---:|
| Bundles mit letztem Balken auf dem jüngsten Handelstag | 5.470 (2026-09-24) | **5.466 (2026-09-25)** |
| `calendarValidated` / `signalsCapable` | 5.967 | **5.976** |
| `elliottCapable` | 5.754 | **5.755** |
| `lookbackCovered` | 6.007 | **6.016** |
| Setup-Beobachtungsstichtage | 2 | **3** (`2026-09-10`, `2026-09-24`, `2026-09-25`) |
| Reise `evidenceAsOf` | 2026-09-24 | **2026-09-25** (382 von 500 mit allen elf Stationen) |

Die 331 ohne veröffentlichte Kursreihe stehen unverändert auf dem 2026-09-10 — dieselbe Kohorte,
dieselbe Begründung, kein neuer Befund. `pattern-match` bleibt korrekt auf `asOf 2026-09-24`: die
Wochenreihen schreibt `long-series.yml` nach ihrem eigenen Zeitplan (`cron: '40 7 1-7 * 6'`,
Samstag), und die Woche bis zum 25.09. ist erst mit diesem Lauf dran. Das ist die Kadenz der
Wochenschicht, kein Rückstand der Tagesschicht.

### Produktionsweg, ehrlich benannt

`pages-release` Lauf **36149630151** auf main: Smoke grün, Liefervertrag grün,
`upload-pages-artifact` grün, `deploy` grün. Produktion trägt damit #182 und #222.

Was hier **nicht** belegt ist: ein Abruf der laufenden Seite aus dieser Sitzung. Die
Netzrichtlinie dieser Umgebung antwortet auf `CONNECT research.visionuniverse.de:443` mit 403.
Die Produktionsabnahme ist deshalb der Smoke des Runners gegen **dasselbe gebaute Release**
(29 von 29 Ansichten, 1440 px und 390 px) plus der erfolgreiche Deploy — nicht ein Blick auf die
Seite. Gegen die veröffentlichte Seite messen im Repository die Läufe, die auf Runnern laufen
(`freshness-monitor`, `discover-live-smoke`, `realtime-production-smoke`).

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

### Was der Zuordnungswechsel vergleicht — nachgetragen, weil es nicht zwei Snapshots sind

Beim Auswerten des frischen Laufs aufgefallen: der Wechsel ist mit `from 2026-09-23` und
`to 2026-09-24` beschriftet, aber die zweite Seite ist **nicht** die eingefrorene
Snapshot-Datei des 24., sondern die Tabelle, die der Index heute veroeffentlicht. Das ist
Absicht — die Mitgliederlisten stammen aus derselben Tabelle, und zwei verschiedene
„Jetzt"-Seiten liessen Liste und Wechsel sich widersprechen.

Es ist aber nicht dasselbe: **3.144 von 6.437 Zeilen** unterscheiden sich zwischen dem
veroeffentlichten 09-24-Snapshot und der heutigen Neuberechnung, weil Faktoren Perzentile sind
und die Technical-Eingaben von 5.470 Titeln sich mit dem Ablage-Abgleich bewegt haben. Wer die
67 Wechsel aus den zwei Snapshot-Dateien nachrechnet, bekommt eine andere Zahl.

Deshalb steht es jetzt am Artefakt: `toBasis: "CURRENT_PUBLISHED_TABLE"` und ein Hinweis, der
auf `recomputationDrift` zeigt. Kein Zahlenwert geaendert — nur die Angabe, was verglichen wurde,
damit eine fehlgeschlagene Nachrechnung nicht wie ein Widerspruch aussieht.

### Ein fehlender Halbsatz hielt DREI Schichten zurueck

Beim Auswerten des M24-Laufs aufgefallen: `pattern-match` steht auf `asOf 2026-09-10`, obwohl der
Tagesbestand jetzt auf dem 24. ist. Nachgesehen statt vermutet — `long-series.yml`
veroeffentlicht die Wochenreihen **direkt aus der Historienablage** (es verlangt die
S3-Zugaenge und ruft `publish-long-series.mjs`). Gemessen ueber 900 Wochenreihen: 896 stehen auf
2026-09-10.

Damit hat der fehlende `--push` nicht eine Schicht zurueckgehalten, sondern drei:

```
taeglich    Technical / Signals / Elliott / Setup   Ablage -> Materialisierung
woechentlich Pattern Research / Pattern Match / Belastbarkeit   Ablage -> Wochenreihen
```

Die Ursache ist mit dem Abgleich behoben, und die Wochenreihen haben es nachgeholt (Lauf 372 von
`long-series`, dispatchbar). Gemessen danach:

```
                         vorher     nachher
Wochenreihen               6.308      6.333
davon asOf 2026-09-24          0        848 von 900 gepruefte (46 bleiben auf 09-10)
genug Historie (104 Wo.)   5.571      5.593
pattern-match asOf    2026-09-10 2026-09-24
pattern-match Eintraege    5.569      5.591   (+22)
ohne Mustervergleich       1.306      1.284   NO_WEEKLY_SERIES 567 -> 542
Reise-Station patterns   400/500    402/500
```

5.591 + 1.284 = 6.875: die Rechnung geht weiter genau auf. Kein weiterer Eingriff — es war
dieselbe Reparatur, eine Schicht weiter.

### M24 — die Musterluecke erklaert sich selbst (gewaehlt aus der Messung)

Nach dem Ablage-Abgleich ist `patterns` die schwaechste gemessene Station: **100 von 500** Titeln
ohne Auskunft, mehr als setup (75), technical (74) oder strategy (82) — und die einzige grosse
Luecke, deren Grund den Leser nie erreichte. `getPatternMatch` antwortete mit
`NOT_COVERED_BY_PATTERN_MATCH` und `coverage: null`: ein Code, kein Satz.

Vorher zerlegt, dann gebaut. Ueber 6.875 Titel:

```
5.569  mit Eintrag
  737  Wochenreihe kuerzer als die vorregistrierten 104 Wochen
        276 mit 26-51 · 267 mit 52-77 · 194 mit 78-103 · sechs bei genau 103
  567  gar keine Wochenreihe veroeffentlicht
    2  keine messbaren Merkmale
-----
6.875  vollstaendig, kein unerklaerter Rest
```

Die Luecke enthaelt keinen Defekt — 104 Wochen sind die Anforderung der Studie. Der Grund steht
jetzt in dem Shard, den die Seite fuer genau diesen Titel schon laedt
(`pattern-unavailable-1.0.0`, eigener Block, `instruments` unberuehrt), und die Seite sagt „Dieser
Vergleich braucht 104 Wochen Kurshistorie; fuer diesen Titel liegen 103 vor." Der genaue Grund
ERSETZT den allgemeinen Hinweis: „keine Wochenreihe veroeffentlicht" und „die Kurshistorie reicht
nicht aus" sind zwei verschiedene Aussagen, und die zweite waere dort falsch. Beide
Musterflaechen sagen es — die Vergleichsstation und die Belastbarkeitsstation lesen dasselbe
Artefakt, und ein Grund an nur einer Stelle liesse zwei Abschnitte derselben Seite verschieden
klingen.

Dazu die Setup-Luecke, die keine eigene Ursache hat: die Beobachtung ist eine Projektion ueber die
technischen Bundles, also **borgt sie den technischen Grund** statt einen zweiten Satz fuer
dieselbe Ursache zu bilden — der Test vergleicht beide Felder und verlangt Gleichheit. Gepruefte
Oberflaeche 1440 px und 390 px: MEVO (30 Wochen), AMTM (103), COOL (keine Reihe, 30 von 300
Handelstagen), NVDA ohne jede Begruendung; kein roher Code, kein Overflow, kein Seitenfehler.

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

−1. **Erledigt (2026-09-25).** Die Ablage ist beschrieben, beide Schichten sind auf dem
   2026-09-24, die Reise ist gegen ihre Grundlinie neu gemessen und der schwaechste gemessene
   Bereich (patterns) hat seinen Satz bekommen. **Der Merge ist erfolgt** (#182 → `a0f827ac`),
   der frühere Vorbehalt hier — „bis zum Merge muss der Refresh auf diesem Branch dispatcht
   werden" — ist damit gegenstandslos: der Zeitplan liegt auf dem Default-Branch, die
   Push-Schritte hängen an keiner Ereignisart, und ein vollständiger Lauf auf main hat es gezeigt
   (Abschnitt `MERGED_2026-09-25`). Offen ist nur noch die Beobachtung des ersten **planmäßigen**
   Abendlaufs; bis dahin gilt `STORE_REFRESH_AUTOMATION = SIX_OF_SEVEN_OBSERVED` und der nächste
   Product-Milestone bleibt zu. `history-store-sync.yml` ist als Hebel jetzt dispatchbar (ein
   Workflow wird erst dispatchbar, wenn seine Datei auf dem Default-Branch liegt).

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
