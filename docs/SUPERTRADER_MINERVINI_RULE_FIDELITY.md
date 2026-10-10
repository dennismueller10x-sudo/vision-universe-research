# Supertrader – Minervini Rule Fidelity (RF1)

Status: Forschungsdiagnose. **Keine Live-Änderung, kein Merge, keine Performanceoptimierung.** Live bleibt MINERVINI_VCP 2.0.0, der Freeze 1.1.0 und die eingefrorene Fallliste sind unverändert.
Die Forschungsversion `minervini-adaptation-1.2.0-rf1` ist nie live.

Leitfrage: Ist der Recall von 3/15 niedrig, weil Minervinis Regeln falsch formalisiert wurden, oder weil große Teile seiner Methode diskretionär oder nicht öffentlich reproduzierbar sind?

## Ergebnis auf einen Blick

| Frage | Antwort |
|---|---|
| Wie viele der 12 verpassten MAIN-Fälle behebt eine quellenbelegte Regelkorrektur? | **0 von 12** |
| MAIN-Recall nach ausschließlich quellenbelegten Korrekturen | **3/15 = 20 %**, unverändert (Wilson-95-%-Intervall 7–45 %) |
| Wurde ein echter Formalisierungsfehler gefunden? | **Ja, einer: MR-SEPA-10.** Das Buch erlaubt Turnarounds; die Umsetzung schloss sie pauschal aus. Er betrifft Verlust→Gewinn-Wenden, und die kommen unter den 15 MAIN-Fällen nicht vor |
| Woran scheitern die 12 Fälle? | 7 × Aktie **ohne Gewinn** (Verlust im Vorjahr *und* jetzt), für die in den abrufbaren Quellen **keine Eintrittsregel** steht · 3 × Daten bzw. Universum · 2 × Praxis jenseits der Regeln (Ermessen, Einstiegsart, RS-Proxy) |
| Ist die Basis-Mindestlänge falsch? | **Nein.** Die 3-Wochen-Untergrenze ist quellenbelegt. Falsch zugeordnet ist nur die Obergrenze (45 statt 60 Wochen) |
| GAAP oder bereinigt? | **Nicht entscheidbar.** Keine Primäraussage gefunden; bereinigte Zahlen stehen nicht in den öffentlichen PIT-Daten; die fortgeführte GAAP-Zahl ändert bei den 7 Fällen nichts |
| Fidelity vorher/nachher | Regel MR-SEPA-10: **LOW → MEDIUM**. Bereich Fundamental: **LOW → LOW**, Bereich Einstieg: **LOW → LOW**. Eine Replikation darf weiter nicht behauptet werden |
| Entscheidung | Replikation nicht möglich; High-Fidelity-Adaption der öffentlich reproduzierbaren Teilmenge möglich, bildet aber nur etwa jeden fünften seiner Käufe ab (Abschnitt 7) |

Der Befund beantwortet die Leitfrage mit **„überwiegend weder noch“**: Es ist nicht die Formalisierung der vorhandenen Regeln, die den Recall drückt (ein Fehler gefunden, ohne Wirkung auf die 15 Fälle). Es ist auch nicht allein Diskretion: Drei Fälle sind Datenlücken, und eine Klasse (Power Play, Cheat-Einstiege) ist in den Quellen belegt, aber **nicht umgesetzt**. Ob sie die Lücke schließen würde, ist **nicht gemessen** (Abschnitt 8).

## 1. Methode

1. **Quelle zuerst.** Jede Regel wurde gegen wörtliche Zitate geprüft (`MINERVINI-RULE-FIDELITY-SOURCES.json`, Zitate zeichengenau gegen die abgerufenen Seiten verifiziert, Seiten per SHA-256 festgehalten).
2. **Schriftliche Hypothese und erwartete Fallwirkung vor dem Test.** `MINERVINI-RULE-FIDELITY-PREREG.json` (H1–H5) wurde committet, bevor die neue Version ausgewertet wurde. Der Nachtrag A1 (zwei Präzisierungen der Klausel) entstand vor dem ersten Lauf und ändert keine Vorhersage.
3. **Eigene Version.** Die Forschungsversion umhüllt die eingefrorene `evaluateSepa` und greift nur bei MR-SEPA-10. Jeder andere Pfad ist bitgleich 1.1.0 (getestet). Es entsteht **kein neuer Parameter**.
4. **Regression.** 14 Tests (`minervini-rule-fidelity.test.mjs`) inkl. Nachweis, dass die eingefrorenen Dateien unverändert sind.
5. **Ground Truth nur als Validierung.** Die Fälle wurden nie zur Parameterwahl benutzt. Der Recall war kein Erfolgskriterium.
6. **Adversarialer Review** (Abschnitt 9).

**Offenlegung.** Die Fallergebnisse (welche Fälle woran scheitern) waren mir vor der Präregistrierung aus den eingefrorenen Berichten bekannt. Die Vorhersagen sind daher *logische Folgerungen aus der Regeldefinition*, keine blinden Prognosen. Sie schützen vor nachträglichem Zurechtlegen, nicht vor Vorwissen.

## 2. Quellenlage (was abrufbar war)

| Quelle | Stufe | Zugang |
|---|---|---|
| Kindle-Highlights aus *Trade Like a Stock Market Wizard* (Goodreads, Position 33 %, 42–43 %) | BOOK_HIGHLIGHT | abgerufen |
| Blognotizen 2014 (whatheheckaboom) und 2019 (tradershall) | NOTES_VERBATIM_STYLE | abgerufen; geben Buchtext offenbar wörtlich wieder, aber nur die Turnaround-Stellen sind unabhängig bestätigt |
| MarketWatch-Interview (Sincere) | INTERVIEW_FIRST_PERSON | abgerufen |
| Stockopedia-Interview 2018, Seeking Alpha, Wayback, SEC-Archive, x.com | – | **nicht erreichbar** (403 bzw. gesperrt) |
| Die Bücher selbst | – | **nicht im Volltext gelesen** |

**Nicht gefunden:** (a) eine Aussage Minervinis, ob SEPA-Gewinne nach GAAP oder bereinigt zu lesen sind; (b) eine Aussage zum Kauf von Aktien ohne jeden Gewinn außer dem Power Play und der Amazon-1997-Bemerkung; (c) eine Mindestlänge für Cheat-/Low-Cheat-Einstiege.

## 3. Regel für Regel

### 3.1 MR-SEPA-10: negativer Vorjahresgewinn (Priorität 1)

**Was das Buch sagt** (Kindle-Highlights):
- *„With turnaround situations, investors should insist that the current earnings be very strong (+100 percent or better in the most recent one or two quarters). If the previous results were dismal, the company should be doing significantly better percentagewise in light of easy comparisons. You could also insist that earnings and margins be at or close to a new high …“* (Position 42–43 %)
- *„In purchasing a turnaround situation, you should look for companies that have very strong results in the most recent two or three quarters. You should see at least two quarters of strong earnings increases or one quarter that is up enough to move the trailing 12-month earnings per share to near or above its old peak. …“* (Position 33 %)

**Befund 1: Formalisierungsfehler.** Die Umsetzung („Vorjahres-EPS ≤ 0 → kein Einstieg“) widerspricht beiden Stellen und der eigenen Regelbeschreibung. Sie war eine bewusste, dokumentierte Auslassung (Fidelity LOW), um keine Lesart zu erfinden. Das Buch erlaubt Turnarounds, also ist der pauschale Ausschluss **keine Minervini-Regel**.

**Korrektur in RF1** (`sepa-turnaround.mjs`), nur wenn die eingefrorene Prüfung mit MR-SEPA-10 endet:
- **T-A (Wende):** Vorjahres-EPS ≤ 0 und aktuelles EPS > 0. Die Verbesserung gegenüber |Basis| liegt dann über 100 %.
- **T-B (Altgipfel):** aktuelles EPS besser als im Vorjahr, und das TTM-EPS liegt auf oder über dem höchsten früheren TTM-EPS, der positiv sein muss. „near“ wird bewusst **nicht** formalisiert.
- Umsatzregel (MR-SEPA-04) bleibt. Die Beschleunigung entfällt im Turnaround-Zweig (V1), weil g₀ auf nichtpositiver Basis nicht definiert ist; die Variante V2 verlangt sie nach Swing-Konvention. Beide liefern auf den Fällen dasselbe.

**Befund 2: Die 7 MAIN-Fälle sind keine Turnarounds.** Alle sieben sind **Verlust→Verlust**. Ihr aktuelles Quartal ist nicht „very strong“, sondern negativ. Die Turnaround-Klausel, auch richtig formalisiert, lässt sie nicht durch.

| Fall | GAAP-EPS Quartal / Vorjahr | Verlust | Umsatz gg. Vorjahr | Einzige Sperre (Kern 1.23.0) |
|---|---|---|---|---|
| ZGNX | −0,87 / −0,86 | gleich | kein Umsatz (0 gegen 2,7 Mio.) | SEPA-10 |
| ROKU | −0,09 / −0,07 | weiter | +51 % | SEPA-10 |
| ACAD | −0,38 / −0,51 | enger | +46 % | SEPA-10 |
| SG | −0,13 / −0,24 | enger | +21 % | SEPA-10 |
| REPL | −0,44 / −0,30 | weiter | kein Umsatz | SEPA-10 |
| TNDM | −0,25 / −0,40 | enger | +48 % | SEPA-10 und VCP (7 Sitzungen) |
| RVNC | −1,12 / −0,86 | weiter | 0,3 Mio. gegen 0 | SEPA-10 und VCP (9 Sitzungen) |

Ein „Verlust wird kleiner“-Maß erklärt nur 3 der 7 (ACAD, TNDM, SG). Ein umsatzgetriebenes Maß erklärt höchstens 4 (ROKU, ACAD, TNDM, SG). Für ZGNX, REPL und RVNC bleibt weder Gewinn noch Umsatz.

**Dass er solche Titel kauft, ist belegt** (eigene Beiträge der 7 Fälle; außerdem *„I bought Amazon off its IPO base back in 1997“*, wobei Amazon nach Sekundärberichten damals noch ohne Gewinn war; nicht SEC-belegt). **Warum, ist nicht belegt.** Die einzige geschriebene Ausnahme ist das Power Play: *„This is the only situation I will enter with a dearth of fundamentals.“* Das Buch sagt außerdem: *„Many superperformers … had a proven track record of earnings and growth.“*

**GAAP, fortgeführt oder bereinigt?**

| Definition | Quelle | Öffentlich/PIT | Wirkung auf die 7 Fälle |
|---|---|---|---|
| GAAP gesamt | – | ja | Ausgangslage |
| GAAP fortgeführt („earnings from core operations“, Einmalposten raus) | Q-CORE | Tag nur bei 7 von 32 Fällen | keine; das Vorzeichen ändert sich nie |
| bereinigt (Non-GAAP) | keine Primäraussage | nein (nur 8-K-Anlagen, nicht in XBRL) | **nicht prüfbar** |

Die Frage „GAAP oder bereinigt“ bleibt offen. Sie ist für das Ergebnis aber nicht ausschlaggebend: Selbst eine Umstellung auf fortgeführte Zahlen verändert keinen der 7 Fälle.

**Wirkung von RF1 auf die Ground Truth:**
- MAIN: **0 Änderungen**. Das SEPA-Ergebnis ist in allen 15 MAIN-Fällen **an jedem Tag des ±12-Tage-Fensters** identisch zu 1.1.0, auf den Kern-Daten 1.23.0 und auf den P9-Daten.
- Außerhalb von MAIN wechseln drei Fälle von „abgelehnt“ auf „SEPA bestanden“: **MU** (EPS 0,71 gegen −2,12), **DXCM** (0,21 gegen −0,30; Entry-Typ Pullback, nicht modelliert) und **AVGO** (0,85 gegen −0,40; bleibt wegen BASE_TOO_SHORT abgelehnt). Ob MU und DXCM dadurch erkannt werden, hängt am Signal im Zeitfenster und ist ohne private Kurse **nicht gemessen**. Bei beiden bestehen Universum, Trend und VCP an t\*.

**Populationstest** (504 Emittenten, 12.790 Auswertungen, 0 Fehler, 0 Verletzungen der Eigenschaften): Von den SEPA-10-Ablehnungen sind **84 % Verlust→Verlust**, **9 %** werden durch die Klausel zugelassen, 7 % scheitern danach am Umsatz. Der Fehler ist real, aber klein im Verhältnis zur Klasse, die er nicht trifft.

**Bekannte Schwäche von T-A:** Es ist großzügig. 25 % der Zulassungen haben ein aktuelles EPS unter 0,05 USD, bei 18 % liegt die Nettomarge unter 2 %. Das Buch verlangt „very strong“. Jede Verschärfung bräuchte eine ungequellte Zahl und wurde deshalb nicht vorgenommen.

### 3.2 Basis- und VCP-Länge (Priorität 2)

| Aussage | Zitat-ID | Verdikt |
|---|---|---|
| Untergrenze 3 Wochen / 15 Sitzungen | Q-BASE-TOO-SHORT: *„Too Short a Time Period is Hazardous … a proper basing period can last anywhere from 3 weeks to as long as 65 weeks.“* · Q-IPO-BASE: *„at least 3 to 5 weeks“* | **quellenbelegt**, keine Korrektur |
| Obergrenze 225 Sitzungen (45 Wochen) | Q-VCP-DURATION: *„3 to as many as 60 weeks“* · Q-3C-DURATION: *„as few as 3 weeks to as many as 45 weeks“* (Cup des 3C-Cheat) | **falsch zugeordnet**: Das Regelbuch stützt 45 auf tradershall; dort steht die Zahl in der abrufbaren Fassung nicht. 45 gehört zum 3C-Cup, für die VCP gilt 60. Nur dokumentiert |

Die 5 Fälle mit zu kurzer Basis haben 3, 7, 9, 9 und 13 Sitzungen. Zwei Einschränkungen:
- Die Prüfung bricht **vor** der Kontraktionsanalyse ab. Aus den Ergebnissen ist nicht erkennbar, ob in diesen Fällen gültige Kontraktionen vorliegen.
- Das Buch beschreibt kürzere Strukturen für **andere Einstiege**: Power Play („some can emerge after only 12 days“), 3C-Cheat-Bereich (5–10 %). RICK nennt er selbst „Low Cheat“. Diese Einstiege sind in 1.1.0 nicht umgesetzt.

Zwei dieser fünf Fälle (TNDM, RVNC) sind zugleich Verlust→Verlust und scheitern an beiden Sperren. Das passt formal zu einem Power Play (einzige Ausnahme von den Fundamentaldaten), **ist aber nicht belegt**.

### 3.3 Weitere harte Regeln (Priorität 3)

| Regel | Befund | Betroffen | Korrektur |
|---|---|---|---|
| MR-SEPA-02 Beschleunigung | als Filterkriterium belegt (Q-ACCEL-SCREEN: mindestens drei Quartale); die „90 %“ sind eine Aussage über Gewinner. Die Ein-Schritt-Fassung ist schwächer als die Quelle | DECK (26 % gegen 32 %) | keine |
| MR-SEPA-04 Umsatz > Vorjahr | Richtung belegt (Q-SALES-BACKED), Schwelle 0 ist VU | RICK (−21 %, EPS +78 %) | keine |
| MR-TT-08 RS ≥ 70 | VU-Proxy für den proprietären IBD-Wert | DECK (65) | keine |
| MR-RSK-01/02 Stopp ≤ 10 % | belegt | – (AMD 22.07. wird trotzdem erkannt) | keine |
| MR-ENT-04 Power Play | **belegt, nicht umgesetzt**; alle Zahlen stehen in der Quelle | unbekannt | nicht umgesetzt (Abschnitt 8) |
| MR-ENT-03 Cheat/Low Cheat | teils belegt, Lage der „Pause“ diskretionär | RICK | keine |
| MR-UNI-01 / Daten | Auslandsemittent (MTLS, AEM), Personengesellschaft (DKL) | 3 | keine |

## 4. Die 12 verpassten Fälle

`rf1-classify.mjs` ordnet jeden Fall nach einer vorab festgelegten Reihenfolge genau einer Hauptklasse zu (Daten → kein Gewinn → übrige). Daten: Universum/Trend/VCP aus dem eingefrorenen Replay, SEPA auf Kern 1.23.0.

| Hauptklasse | Fälle | Anzahl |
|---|---|---:|
| Aktie ohne Gewinn (SEPA-10 Verlust→Verlust) | ZGNX, ROKU, ACAD, SG, REPL; TNDM, RVNC (zusätzlich Basis zu kurz) | 7 |
| Daten / Universum | MTLS (20-F), AEM (40-F), DKL (Personengesellschaft, Dollarumsatz) | 3 |
| Praxis jenseits der Regeln | RICK (Low Cheat, Umsatz −21 %, Basis 13), DECK (RS 65, Basis 3, keine Beschleunigung) | 2 |

Sechs Fälle haben genau eine Sperre: ZGNX, ROKU, ACAD, SG, REPL (alle SEPA-10) und AEM (Daten). Kein Fall wird durch RF1 behoben.

## 5. Validierung

| Prüfung | Ergebnis |
|---|---|
| Vorab registrierte Vorhersagen (H1) | **33 von 33** bestätigt (P9- und Kern-Daten, V1 und V2) |
| SEPA-Ergebnis MAIN an jedem Tag im ±12-Tage-Fenster | in allen 15 Fällen identisch zu 1.1.0 |
| Wechsel „abgelehnt → SEPA bestanden“ | genau MU, DXCM, AVGO (wie vorhergesagt) |
| Alle Fälle ohne MR-SEPA-10-Ergebnis | bitgleich 1.1.0 (27 Fälle auf P9-Daten; auf Kern-Daten dieselbe Prüfung) |
| Regressionstests | 14 von 14 |
| Populationstest | 504 Emittenten, 12.790 Auswertungen, 0 Fehler, 0 Verletzungen |

Ein erster Lauf zeigte eine Lücke: Mit dem alten P9-Parser enden TNDM, RVNC, REPL, RICK schon bei `SEPA_STALE` (Tag-Priorität-Fehler) und erreichen SEPA-10 gar nicht. Die Aussage „bleibt abgelehnt“ wäre dort trivial gewesen. Deshalb wurde zusätzlich auf den korrigierten Kern-Daten 1.23.0 geprüft; dort erreichen alle sieben SEPA-10 und bleiben abgelehnt.

## 6. Recall und Fidelity vorher/nachher

| | vorher (1.1.0) | nachher (RF1, nur quellenbelegte Korrekturen) |
|---|---|---|
| MAIN-Recall | 3/15 = 20 % (7–45 %) | 3/15 = 20 % (7–45 %) |
| MAIN_A (eigener Einstieg) | 2/13 = 15 % (4–42 %) | 2/13 = 15 % (4–42 %) |
| Fidelity MR-SEPA-10 | LOW | MEDIUM |
| Fidelity Bereich Fundamental | LOW | LOW |
| Fidelity Bereich Einstieg | LOW | LOW |
| `replicationClaimAllowed` | false | false |

Der Bereich Fundamental bleibt LOW, weil seine Kernregeln (MR-SEPA-07 Überraschungen, -08 Schätzungsrevisionen, -11 institutionelle Nachfrage, -12 Branchenführerschaft) nicht öffentlich oder nur Protokoll sind. Der Bereich Einstieg bleibt LOW, solange Cheat, Power Play, „tight and light“ und die Ausbruchsvolumen-Bedingung fehlen. Berechnet mit der Mechanik des Repos (`fidelityByArea`/`classify`) auf einer Kopie des Regelbuchs, in der nur MR-SEPA-10 geändert ist.

## 7. Entscheidung

Maßstab sind die Schwellen der ursprünglichen Präregistrierung: Recall ≥ 70 % (Fall A), < 40 % (Fall B), überwiegend Ermessen/nicht reproduzierbar (Fall F).

- **Eine Minervini-Replikation ist mit öffentlichen Regeln nicht möglich.** Kernregeln des Bereichs Fundamental sind nicht öffentlich (Überraschungen, Revisionen, Katalysator), die Bücher sind nicht im Volltext verfügbar, die RS ist proprietär.
- **Eine High-Fidelity-Adaption der öffentlich reproduzierbaren Teilmenge** ist möglich und mit 1.1.0 (plus RF1) bereits weitgehend erreicht. Sie bildet aber nur etwa **jeden fünften** seiner dokumentierten Käufe ab (Intervall 7–45 %): Fall B.
- **Der niedrige Recall ist kein Formalisierungsproblem, das sich quellenbelegt beheben lässt.** Gut die Hälfte der Differenz (7 von 12) sind Aktien ohne Gewinn, für die keine abrufbare Regel existiert.
- **Offen** ist, ob das belegte, aber nicht umgesetzte Power Play (und teilweise der Cheat) einen Teil der Lücke schließt. Das ist die einzige quellenbelegte Ergänzung mit erkennbarem Potenzial.

Formal: Fall B trifft zu. Fall F trifft zu, soweit „nicht reproduzierbar“ heißt „durch keine abrufbare Regel reproduzierbar“ (9 von 12: 7 ohne Gewinn, 2 Praxisfälle); **nicht** für die 3 Datenfälle. Ob dahinter Ermessen oder eine nicht abrufbare Regel steht, ist offen.

## 8. Nicht gemessen und nächste Schritte

1. **Power-Play-Diagnose (H3), vorab spezifiziert, nicht ausgeführt.** Für die 12 Fehlfälle und MU/DXCM an t\*: Erfüllen sie die wörtlichen Zahlen (≥ +100 % in < 8 Wochen; Flagge 12 Tage bis 6 Wochen; Korrektur ≤ 25 % bzw. ≤ 20 %; ≤ 10 % oder VCP-Merkmale)? Reine Klassifikation, kein Einstieg, kein Parameter. Vorhersage: höchstens 3 der 7 Fälle ohne Gewinn. Erfüllen 4 oder mehr, ist „diskretionär“ für diese Fälle deutlich geschwächt. **Braucht die privaten Kurse** (Lauf im Actions-Workflow mit Secrets), deshalb nicht ohne Freigabe gestartet.
2. **Entscheidung bei MU und DXCM** (Signal im Zeitfenster): dieselbe Voraussetzung.
3. **Obergrenze 300 Sitzungen**: quellenbelegt, Wirkung nur mit Kursen messbar.
4. **H-NEW** (umsatzgetriebene Ausnahme für Titel ohne Gewinn): erklärt höchstens 4 von 7, ist eine Post-hoc-Beobachtung an 4 Datenpunkten und braucht eine unabhängige Quelle und eine eigene Stichprobe, bevor sie eine Regel werden darf.
5. **Bessere Ground Truth**: Kaufdatum und Fundamentalbasis der Käufe (Buchbeispiele, Wettbewerbs-Tradelisten) würden mehr klären als jede weitere Regelarbeit.

## 9. Grenzen

- **n = 15.** Ein Recall von 3/15 hat ein Intervall von 7–45 %; kleine Unterschiede sind nicht belegbar.
- **Die Ground Truth** besteht aus Suchausschnitten von X-Beiträgen (Quellenstärke MEDIUM). „Er ist positioniert“ nennt nicht den Kaufstag. Kein Fall nennt die Fundamentalbasis seines Kaufs.
- **Zitate** stammen aus Leserhighlights und Blognotizen, nicht aus den Büchern; die Positionsangaben (33 %, 42–43 %) sind keine Seitenzahlen. Die Stellen zu Basisdauer und Power Play sind nur durch die Blognotizen belegt.
- **Trend- und VCP-Schicht** lassen sich nur mit den privaten Kursen neu rechnen. Lokal wurde nur die SEPA-Schicht geprüft; Universum, Trend und VCP an t\* stammen unverändert aus dem eingefrorenen Replay.
- **Split-Verhältnis 1** in der Fallvalidierung (kein Split zwischen den verglichenen Einreichungen laut Ground-Truth-Bericht); im Populationstest ebenfalls, dort nur als Robustheitstest.
- **Die Amazon-1997-Verluste** sind hier nicht SEC-belegt (EDGAR-Archiv gesperrt).

## 10. Reproduktion

```bash
node --test scripts/supertrader/tests/minervini-rule-fidelity.test.mjs
node scripts/supertrader/ground-truth/rf1-validate.mjs <cf-dir> <out.json> [<core-sepa-fund.json>]
node scripts/supertrader/ground-truth/rf1-classify.mjs <rf1-validation.json> <out.json>
node scripts/supertrader/ground-truth/rf1-population-check.mjs <cf-dir> <out.json>
```

Artefakte (`scripts/supertrader/fidelity/`): `MINERVINI-RULE-FIDELITY-SOURCES.json`, `-PREREG.json`, `-RF1-VALIDATION.json`, `-RF1-POPULATION.json`, `-CASE-CLASSES.json`, `-CASE-FUNDAMENTALS.json`, `-VERDICT.json`.
