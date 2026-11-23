# Backtest 2.0 – Protokoll (Entwurf, Fassung 2 vom 21.11.2026)

**Forschung, nicht zertifiziert.** Status: **ENTWURF**. Eingefroren wird vor dem ersten Lauf (SHA-256 im Lauf-Manifest und hier).
Anlass: [BEFUND-POSITIONSGROESSE.md](BEFUND-POSITIONSGROESSE.md).

Fassung 2 (Owner 21.11.2026: „Wir müssen das machen, was funktioniert“): kein fester Depotrahmen mehr. Positionszahl, Gewichtung,
Haltedauer, Stopps und Marktfilter sind **freie Stellschrauben**, die die Suche selbst einstellt. Fassung 1 legte 10 Positionen zu
höchstens 10 % fest; das war eine Faustregel, kein Befund, und ist entfallen.

## 1. Frage

Welche Regel, gebaut aus den Methoden von Supertrader und Quant mit frei gewählter Depotführung, hätte nach Kosten mehr erzielt als ein
gewöhnlicher Index-ETF (SPY, QQQ), und **hält dieser Vorsprung auf Jahren, die die Suche nicht gesehen hat?**

## 2. Suchraum (frei)

| Stellschraube | Werte |
|---|---|
| Signalquelle | jede auf Tagesbalken rechenbare Methode aus C01–C13; jedes Quant-Profil; Referenz „Marktführer“ (relative Stärke 6 Monate, über der 200-Tage-Linie); Kombinationen aus zwei Quellen (Schnittmenge oder Vereinigung) |
| Positionen | 1, 3, 5, 8, 10, 15, 20, 30 |
| Gewichtung | gleich; nach Risiko bis zur Stopp-Marke; nach Signalstärke; Kappe je Titel 100 %, 50 %, 25 %, 15 % |
| Nachkauf | aus, wie Quelle |
| Ausstieg | Regel der Methode; nachgezogener Stopp 10 / 15 / 25 / 35 % ab Hoch; Schluss unter 50- bzw. 200-Tage-Linie; feste Haltedauer 1 Woche, 1, 3, 6, 12, 24 Monate |
| Marktfilter | keiner; SPY über SMA200; SPY über SMA50 |
| Universum | Top 500, 1.000, 3.000 nach Ø Dollarumsatz 20 Sitzungen; Kurs ≥ 5 $ oder ≥ 10 $ |

Fest bleiben nur Dinge, die keine Wahl sind, sondern Wirklichkeit: Kosten (1 bp Gebühr + 5 bp Slippage + halber Spread nach ADV20 je
Seite, `quant/engines/portfolio-construction.cjs#halfSpreadBps`), Endwerte delisteter Titel (Übernahme 100 %, unbekannt 70 %, Insolvenz 0 %),
kein Hebel, kein Blick in die Zukunft (Entscheidung zum Schluss, Ausführung zur nächsten Eröffnung), Tagesbalken-Mehrdeutigkeit in beiden
Lesarten (Urteil nur, wenn beide gleich ausfallen).

Die Suche ist ein Gitter über diese Werte, ergänzt um eine zufällige Stichprobe; die Zahl aller geprüften Kombinationen wird gezählt und
geht in die Korrektur (§4) ein.

## 3. Finden und Bestätigen (Walk-forward)

Die Suche darf alles einstellen, aber nur auf den Lernjahren. Bestätigt wird auf den folgenden Jahren, die sie nicht gesehen hat:

| Runde | Lernen | Bestätigen |
|---|---|---|
| 1 | 2008–2013 | 2014–2016 |
| 2 | 2008–2016 | 2017–2019 |
| 3 | 2008–2019 | 2020–2022 |
| 4 | 2008–2022 | 2023–Ende |

Je Runde wählt eine feste Regel die beste Kombination der Lernjahre (höchste Rendite nach Kosten über SPY bei einem maximalen Verlust,
der nicht schlechter als −50 % ist). Gezählt wird nur die aneinandergereihte Bestätigungskurve 2014–Ende: Sie zeigt, was ein Kunde mit
diesem Vorgehen tatsächlich erlebt hätte. Zusätzlich je Kombination die Ergebnisse über den Gesamtzeitraum, beschreibend.

Ehrlicher Vermerk: Alle Jahre ab 2008 wurden in früheren Studien schon geöffnet (Holdout 06.11.2026, E3, Labor). Die Unabhängigkeit kommt
aus dem Walk-forward selbst: Die Auswahl jeder Runde sieht die Bestätigungsjahre nicht.

### Stresstest 1995–2007 und Langfrist-Faktoren (Owner 21.11.2026)

- **Stresstest 1995–2007** (Dotcom-Blase und -Crash): dieselbe Suche, gekennzeichnet „nur heutige Überlebende, zu gut gerechnet“,
  weil delistete Titel erst ab 2005 im Archiv liegen. Er fließt nicht ins Urteil ein und dient nur als Ausschluss: Verliert eine
  Kombination selbst mit diesem geschönten Datensatz stark, ist das ein Warnsignal.
- **Langfrist-Faktoren 1926–heute** aus der Kenneth R. French Data Library (frei verfügbar; Owner-Freigabe der Quelle 21.11.2026):
  eigene Auswertung auf Faktor-Ebene, getrennt von dieser Suche ([../longrun/BERICHT.md](../longrun/BERICHT.md)).

## 4. Urteil

- **schlägt den Index:** Die Bestätigungskurve 2014–Ende liegt nach Kosten über SPY, mit p ≤ 0,05 nach Korrektur für die Zahl aller
  geprüften Kombinationen (Deflated Sharpe und Monte-Carlo wie E3).
- **schlägt nur in Phasen:** Vorsprung belegt nur, wenn SPY über bzw. unter seiner 200-Tage-Linie liegt.
- **nur risikobereinigt:** Sharpe höher und Verlust kleiner, Rendite nicht.
- **schlägt nicht.**

Berichtet werden: die Bestätigungskurve, die je Runde gewählte Kombination (zeigt, ob die Wahl stabil ist), die besten 20 Kombinationen des
Gesamtzeitraums mit Spannweite, und welche Stellschrauben am meisten ausmachen. Alle Ergebnisse, auch die schlechten.

## 4a. Fassung 3: zweiter Versuch mit robuster Auswahl (21.11.2026, nach Einsicht)

**Offen gekennzeichnet als zweiter Versuch, nach Einsicht in das Ergebnis von Lauf 44918416065.** Dort wählte die Regel aus §3 in drei
von vier Runden Depots mit einer bis drei Aktien (Lern-Überrendite bis +54 % p. a.), die auf den Bestätigungsjahren zusammenbrachen
(Bestätigungskurve −19,9 % p. a.); Urteil Fassung 2: schlägt nicht. Dieses Urteil bleibt stehen.

Neue Auswahlregel (Owner 21.11.2026), gerechnet auf denselben Jahreskennzahlen, im selben Lauf neben Fassung 2 berichtet:
- nur Kombinationen mit mindestens 10 Positionen und max. Verlust in den Lernjahren ≥ −50 %;
- Wert = Median der Lern-Überrendite über SPY von Kombination und ihren Nachbarn (eine geordnete Stellschraube eine Stufe verschoben:
  Positionen, Gewichtung, Universum, Ausstieg innerhalb derselben Art; Signalquelle und Filter fest); höchster Wert gewinnt.

Begründung: Eine Einstellung, deren Nachbarn ebenfalls gut sind, ist weniger wahrscheinlich ein Zufallstreffer. Urteil und Statistik wie §4;
weil die Regel nach Einsicht festgelegt wurde, gilt ein positives Ergebnis nur als Hinweis, der vorwärts bestätigt werden muss.

**Datenprüfung im selben Lauf:** Sitzungssprünge ×2 bis ×5 (unterhalb DQ-K5) je Gruppe heutige / delistete Titel und die Spalten der
delisteten Rohreihen; dazu Modus `backtest2-survivors` ohne delistete Titel als Vergleich (zu gut gerechnet, nicht für das Urteil).

## 4b. Stufe 2 Ergebnis und Stufe 3: Faktor-Depots im Walk-forward (22.11.2026, vor dem ersten Lauf festgelegt)

**Ergebnis Stufe 2** (Lauf 45004821417, 201 Monate 2010–09/2026, nach Kosten): phasenfest gegen das Universum sind nur
Momentum + Bruttogewinn je Bilanzsumme (17,0 % p. a., SPY 14,5 %), dieselbe Kombination mit Rückkäufen (16,3 %) und Rückkäufe allein
(15,2 %). Rule of 40, Bewertung, Wachstum, niedrige Schwankung, Nähe zum 52-Wochen-Hoch und kurzfristige Umkehr tragen nicht. Bei 30
Versuchen ist das ein Hinweis, kein Beweis: die Auswahl kannte alle Jahre.

**Stufe 3** prüft deshalb, ob eine Auswahl, die nur die Lernjahre kennt, SPY auf den folgenden Jahren schlägt
(`scripts/research/backtest2/faktor-wf.mjs`, Modus `merkmale-wf-smoke` / `merkmale-wf`). Festgelegt vor dem ersten Lauf:
- Raster 512 Depots: Signal (22 Merkmale, 7 Kombinationen der Stufe 2, Trend + Bruttogewinn/Bilanz, 52-Wochen-Hoch +
  Bruttogewinn/Bilanz, Näherung des Quant-Scores) × bestes Zehntel/Fünftel × Top 500/1.000 × gleich/nach Börsenwert gewichtet ×
  ohne/mit Marktfilter (SPY über 200-Tage-Linie, sonst Kasse ohne Zins). Monatlich neu, Kosten = Umschlag × Kosten je Seite.
- Runden: Lernen 2010–2013/2016/2019/2022, Bestätigen 2014–2016, 2017–2019, 2020–2022, 2023–Ende; Bestätigungsjahre verkettet.
- **Fassung A** (das Urteil): zugelassen sind Depots, die in den Lernjahren in beiden Hälften und in ≥ 60 % der Jahre vor SPY lagen und
  höchstens 50 % verloren; gewählt wird der höchste Median der Lern-Überrendite aus Depot und Nachbarn (eine Einstellung anders,
  Signal fest). Ohne Kandidat hält die Runde SPY.
- **Fassung B** (Hypothese, vor 2014 veröffentlicht: Momentum, Jegadeesh/Titman 1993; Bruttogewinn je Bilanzsumme, Novy-Marx 2013):
  Momentum + Bruttogewinn/Bilanz, bestes Fünftel, Top 1.000, gleich gewichtet, ohne Filter; dazu alle 16 Einstellungen dieses Signals.
- **Vergleich Quant:** Näherung von quant-v2.4.1 (Faktorgewichte des Vertrags, nur hier verfügbare Bausteine, ohne Revisionen).
- Urteil „schlägt SPY“ nur, wenn Fassung A auf den verketteten Bestätigungsjahren nach Kosten vor SPY liegt und der Block-Bootstrap
  p < 0,10 ergibt; sonst „nicht belegt“. Folgen für den Quant-Score nur in einem eigenen PR mit Vorher/Nachher.

**Ergebnis Stufe 3** (Lauf 45050488159, Bestätigung 2014–09/2026 verkettet, SPY 14,1 % p. a., QQQ 19,4 %, RSP 10,9 %):
- Fassung A 12,9 % p. a. (−1,1 Pp gegen SPY, p 0,44): **nicht belegt.** Aus vier bis dreizehn Lernjahren findet die Auswahl keine
  stabile Regel (Runde 2 ohne Kandidat, Runde 3 niedrige Schwankung).
- Fassung B 16,4 % p. a. (+2,3 Pp, max. Verlust −25,6 % gegen −23,9 %, 7 von 13 Jahren vorn, p 0,15): **Hinweis, nicht belegt.**
  Ohne Marktfilter liegen 7 der 8 Einstellungen vor SPY (+2,3 bis +5,5 Pp; bestes Zehntel der Top 500 p 0,07); **mit** Marktfilter
  liegen alle 8 dahinter (−2,8 bis −6,5 Pp).
- Quant-Näherung 12,7 % p. a. (−1,3 Pp): Bewertung, Wachstum und niedrige Schwankung ziehen den Score auf diesen Jahren nach unten;
  Bruttogewinn je Bilanzsumme trägt heute nur 3 % des Gesamtgewichts.
- Folgerung (eigene PRs): Quant-Variante „Momentum + Profitabilität“ gegen quant-v2.4.1 auf den PIT-Dokumenten vergleichen;
  Supertrader-Marktfilter und Profitabilitätsfilter prüfen; Kurssignale allein (200-Tage-Linie, 52-Wochen-Hoch, Umkehr) schlagen
  SPY nicht.

## 4c. Quant-Varianten auf PIT-Dokumenten (22.11.2026, Owner „Ok“ zum Plan; vor dem ersten Lauf festgelegt)

Frage: Trennt ein Gesamtscore mit mehr Gewicht auf Momentum und Profitabilität die künftigen Gewinner mindestens so gut wie die
heutigen Gewichte? `scripts/research/quantscore/variant-pit.cjs`, `research.yml` Teil `quality-marge-pit`, Modus `quant-varianten`.
Gleiche Titel und gleiche Faktor-Scores (V10-Rekonstruktion der Produktfaktoren auf neu gebauten PIT-Dokumenten, 2010–2025,
wöchentliche Stichtage wie quality-marge-pit), nur die Gewichtung des Gesamtscores ändert sich:
- `live` Q .10 G .15 V .15 P .15 M .25 R .05 (heute, ohne Revisionen renormiert);
- `tilt` Q .10 G .05 V .05 P .30 M .45 R .05;
- `mp` Momentum .50 + Profitabilität .50;
- `mgpa` Momentum .50 + Bruttogewinn je Bilanzsumme .50 (Hypothese B der Stufe 3).

Kennzahlen je Horizont (3 und 12 Monate): IC, Q5−Q1, oberes Fünftel und dessen Abstand zu SPY (Kursrendite, Einstieg einen Balken
später, ohne Kosten); gepaarte Differenzen gegen `live` mit Newey-West-t, Holm über alle Vergleiche. Dazu Vorher/Nachher am letzten
Stichtag (Rangkorrelation, Überlappung der oberen 10 %).

**Entscheidungsregel:** Eine Variante wird für das Produkt vorgeschlagen, wenn ihr IC gegen `live` bei 3 **und** 12 Monaten nicht
kleiner ist (Punktschätzer ≥ 0) und ihr oberes Fünftel bei 12 Monaten weiter vor SPY liegt als das von `live`. Erfüllen mehrere die
Regel, gewinnt die mit der höchsten Rangkorrelation zu `live` (die kleinste Änderung für Nutzer). Der Umbau des Produkt-Scores folgt in
einem eigenen PR (neue Fassung von quant-v2.json, Vorher/Nachher auf den Produkt-Eingängen); Revisionen behalten ihr Gewicht.
Grenzen: heutige Survivors, Kursrendite, keine Kosten – deshalb nur die Rangfolge der Varianten, keine Renditeaussage.

**Ergebnis** (Lauf 45054479353; 176 Stichtage 2012–2025, im Median 822 Titel): IC 3/12 Monate live 0,036/0,046, tilt 0,038/0,049,
mp 0,036/0,047, mgpa 0,028/0,040; oberes Fünftel − SPY (12 Monate) live +1,35 %, tilt +1,55 %, mp +1,75 %, mgpa +3,67 %.
Δ IC gegen live: tilt +0,0014/+0,0025, mp −0,00003/+0,0009, mgpa −0,0078/−0,0062 (alle Holm 1,0). **Nach der Regel gilt tilt**
(mp verfehlt den 3-Monats-IC knapp, mgpa trennt im oberen Fünftel am stärksten, im IC aber schwächer). Vorher/Nachher am 26.12.2025:
Rangkorrelation tilt–live 0,95, Überlappung der oberen 10 % 78 %. Auffällig: Q5−Q1 ist bei allen Varianten negativ (live −11 % über
12 Monate) – auf heutigen Survivors erholen sich schwache Titel, die überlebt haben; deshalb zählt hier das obere Fünftel, nicht die Spanne.
Folge: eigener PR für den Produkt-Score (quant-v2.json, Gewichte von tilt, Revisionen behalten 0,15, die übrigen mit 0,85 skaliert).

## 4d. Vorwärtstest (registriert am 22.11.2026)

`scripts/research/vorwaerts/forward.mjs` (nur lesend, beliebig wiederholbar: `node scripts/research/vorwaerts/forward.mjs`). Er braucht
keinen eigenen Speicher: die Faktor-Snapshots `quant/data/product/factor-evidence-history/vu-factor-evidence-2.0.0/<datum>.json.gz`
werden nie überschrieben. Festgelegt:
- Je Monat der erste Snapshot; je Variante (`live` mit Revisionen, wo vorhanden; `tilt`; `mp`, Gewichte wie §4c) das obere Fünftel der
  Titel mit allen Pflichtfaktoren, gleich gewichtet; Einstieg und Ausstieg zum Schluss des ersten Handelstags nach dem Snapshot
  (`quant/data/market/discover-series`, Kursrendite), 6 bp je Seite auf den Umschlag; Vergleich SPY aus derselben Reihe.
- **Zählt ab Dezember 2026.** Oktober und November 2026 sind Vorlauf (nach dem Ende des Studienfensters 09/2026, aber vor der
  Registrierung). Urteil frühestens nach 12 Monaten; öffentlich nur mit Owner-Freigabe (Renditeaussage).
- Erster Stand (Vorlauf, ein Monat Okt.–Nov.): live −1,5 %, tilt −2,5 %, mp −1,6 %, SPY −2,0 % – ein Monat sagt nichts.

## 4e. Vorwärtstest Fassung B (registriert am 23.11.2026, vor dem ersten gezählten Monat)

Anlass: Der einzige phasenfeste Hinweis der Stufen 2 und 3 ist Momentum + Bruttogewinn je Bilanzsumme (§4b: Fassung B +2,3 Pp p. a.
vor SPY, p 0,15; bestes Zehntel der Top 500 p 0,07; ohne Marktfilter 7 von 8 Einstellungen vor SPY). Der Vorwärtstest §4d schreibt
nur `live`, `tilt` und `mp` mit, den stärksten Kandidaten nicht. `scripts/research/vorwaerts/forward-b.mjs` holt das nach (nur
lesend, beliebig wiederholbar). Festgelegt:
- **Quelle:** die veröffentlichten Faktor-Scherben `quant/data/product/factor-evidence-v1/` (Börsenwert, Bausteine
  `priceReturn12m1m` und `grossProfitabilityTtm`). Unveränderlich ist ihre Git-Historie: je Monat gilt der erste Commit des
  Monats, der `summary.json` der Scherben geändert hat. Der Lauf braucht die vollständige Historie (`git fetch --unshallow`).
- **Universum zuerst:** die 1.000 bzw. 500 größten Titel nach Börsenwert am Stichtag. Wählbar sind darin nur Titel mit beiden
  Bausteinen (Banken und andere Titel ohne Bruttogewinn bleiben im Universum, sind aber nicht wählbar).
- **Signal:** Mittel der beiden Baustein-Scores. **B1000** = bestes Fünftel der wählbaren Titel unter den 1.000 größten (die
  Entsprechung zu Fassung B), **B500** = bestes Zehntel unter den 500 größten (die Einstellung mit p 0,07). Gleich gewichtet.
- **Handel:** wie §4d: Einstieg und Ausstieg zum Schluss des ersten Handelstags nach dem Stichtag (`discover-series`,
  Kursrendite), 6 bp je Seite auf den Umschlag, Vergleich SPY aus derselben Reihe. Kein Marktfilter (§4b: mit Filter liegen alle
  Einstellungen hinter SPY).
- **M25 „Marktführer“ (ergänzt am 23.11.2026 nach dem Ergebnis der Stufe 4, vor dem ersten gezählten Monat):** unter den 1.000
  größten Titeln nur solche, die die Trendvorlage erfüllen (Spalten des Technical-Tagesbestands `technical/data/screener-v1.json`
  desselben Commits: Kurs über SMA 50, SMA 50 über SMA 150, SMA 150 über SMA 200, SMA 200 steigend, mindestens 30 % über dem
  52-Wochen-Tief, höchstens 25 % unter dem 52-Wochen-Hoch, frische Reihe), davon die 25 mit dem höchsten Signal; unter 10
  Kandidaten Kasse. Das ist die Entsprechung zu H1 der Stufe 4 auf Produktdaten.
- **Zählt ab Dezember 2026.** Urteil frühestens nach 12 Monaten; öffentlich nur mit Owner-Freigabe (Renditeaussage).

Abweichungen von der Studie, vorab benannt: (1) Die Baustein-Scores des Produkts sind zu 70 % Branchen- und zu 30 %
Universumsvergleich, die Studie rangierte im Universum. (2) Das Universum wird nach Börsenwert gebildet, in der Studie nach
durchschnittlichem Dollarumsatz. (3) Kursrendite statt Gesamtrendite, auf beiden Seiten gleich.

Stand der Daten am 20.11.2026 (kein Ergebnis, nur Abdeckung): 3.923 von 5.934 Titeln tragen einen Börsenwert; unter den 1.000
größten haben 514 beide Bausteine, unter den 500 größten 262. Daraus folgen 102 Titel (B1000) und 26 Titel (B500). Die Trendvorlage
erfüllen 74 der wählbaren Titel unter den 1.000 größten; M25 wählt daraus 25.
**Befund zur Datenqualität, eigener PR:** Der Börsenwert fehlt bei 2.011 Titeln (784 ohne Aktienzahl zum Stichtag, 360
Berichtswährung ungleich Handelswährung, 248 Aktienzahl nicht dem Listing zuordenbar), darunter sehr große Werte; einzelne Werte
sind offensichtlich falsch (AKTX mit über 1 Billion $). Der Bruttogewinn fehlt bei 238 der 500 größten Titel, auch bei
Nicht-Banken (z. B. XOM, ORCL, UNH, DIS, MCD, VZ). Beides begrenzt jede Aussage über „die größten Werte“ und gehört vor einer
Produktnutzung behoben.

## 4f. Stufe 4: Trader-Muster mit Faktoren (23.11.2026, vor dem ersten Lauf festgelegt)

Anlass (Owner 23.11.2026): Die Trader-Regeln allein lagen in jedem Test hinter SPY (Stufe 1, SF6-Referenzen, Holdout). Die Bücher
kaufen aber nicht jedes Muster, sondern wenige Marktführer mit starkem Geschäft. Stufe 3 nennt die Prüfung der Muster zusammen
mit dem Profitabilitätsfilter als offene Folgerung. `scripts/research/backtest2/trader-faktor.mjs`, Modus
`merkmale-trader-smoke` / `merkmale-trader`, gleiche Daten wie Stufe 2 und 3.

Frage: Liegt ein konzentriertes Depot aus Aktien, die das Muster UND die tragenden Faktoren erfüllen, nach Kosten vor SPY, und
trägt die Kombination mehr als jeder Teil allein? Kein Raster, keine Auswahl, acht feste Depots:
- **H1 (die Hypothese):** Trendvorlage (veröffentlichte Lesart nach Minervini, wie `signals.mjs#TREND_TEMPLATE`) als Schranke,
  darin die 25 Titel mit dem höchsten Mittel aus Momentum 12-1 und Bruttogewinn je Bilanzsumme.
- **H2:** Trendvorlage, darin die 25 Titel nach Momentum, Umsatzwachstum (1 Jahr) und Eigenkapitalrendite (Minervinis
  Geschäftskriterien, soweit mit unseren Daten abbildbar).
- **K1 (Kontrolle Muster):** nur Trendvorlage, 25 Titel nach relativer Stärke 6 Monate.
- **K2 (Kontrolle Faktoren):** ohne Trendvorlage, 25 Titel nach Momentum + Bruttogewinn je Bilanzsumme.
- Jedes Depot zusätzlich mit 50 Titeln.
- Monatsultimo, die 1.000 liquidesten Titel ≥ 5 $, gleich gewichtet, Kosten = Umschlag × Kosten je Seite, kein Marktfilter,
  Kasse ohne Zins; unter 10 Kandidaten Kasse. Ausgewertet 2014 bis Ende gegen SPY (Gesamtrendite), dazu die vier Teilzeiträume
  der Stufe 3.
- **Urteil „Hinweis“** nur, wenn H1 nach Kosten vor SPY liegt, der Block-Bootstrap p < 0,10 ergibt und H1 über K1 und K2 liegt;
  sonst „nicht belegt“. Berichtet werden alle acht Depots, auch die schlechten.

Grenzen, vorab benannt: (1) Die Regeln stehen vor dem ersten Lauf fest, aber nach Einsicht in Stufe 2 und 3; dass Momentum +
Bruttogewinn/Bilanz dort vorn lag, war bekannt. Ein positives Ergebnis ist ein Hinweis und wird im Vorwärtstest bestätigt, nicht
aus dem Rückblick behauptet. (2) Geprüft wird die Auswahl der Aktien in monatlichen Depots, nicht die Ein- und Ausstiegsregeln
der Methoden. (3) Folgen für Supertrader oder den Quant-Score nur in einem eigenen PR mit Vorher/Nachher.

**Ergebnis Stufe 4** (Lauf 45150388492, 2014 bis Ende, nach Kosten, delistete Titel enthalten; Bericht als Artefakt beim Owner):
- **H1 18,4 % p. a. (+4,3 Pp gegen SPY, max. Verlust −24,1 %, 7 von 13 Jahren vorn, p 0,157): nicht belegt.** H1 liegt vor SPY und
  vor beiden Kontrollen, verfehlt aber die vorab gesetzte Schranke p < 0,10. Das Urteil bleibt stehen.
- Kontrollen: nur Muster (K1) 18,1 % (+4,0 Pp, max. Verlust −40,9 %, p 0,149); nur Faktoren (K2) 16,3 % (+2,3 Pp, −34,6 %, p 0,215).
  Die Kombination bringt gegenüber dem Muster allein kaum mehr Rendite, aber rund den halben Maximalverlust.
- Mit 50 Titeln: H1 16,3 % (+2,3 Pp), K1 16,8 % (+2,8 Pp), K2 17,9 % (+3,8 Pp, p 0,102). Die Reihenfolge der drei hängt an der
  Titelzahl; alle sechs Depots aus Muster und/oder Momentum + Bruttogewinn/Bilanz liegen vor SPY.
- H2 (Umsatzwachstum und Eigenkapitalrendite): 13,7 % (−0,3 Pp) und 12,4 % (−1,7 Pp). Diese Geschäftskriterien tragen nicht.
- Teilzeiträume H1 gegen SPY: 2014–2016 −5,1 Pp, 2017–2019 +5,1 Pp, 2020–2022 +21,0 Pp, 2023–Ende −1,3 Pp. Der Vorsprung
  stammt überwiegend aus 2020–2022.
- Umschlag: H1 und K1 rund 100 % bis 120 % je Monat (das Depot wechselt fast vollständig), K2 rund 55 % bis 62 %.

## 4g. Stufe 5: die übrigen Trader-Muster mit Faktoren (23.11.2026, vor dem ersten Lauf festgelegt)

Anlass (Owner 23.11.2026): auch Darvas, Turtle und die übrigen Methoden so prüfen wie die Trendvorlage in Stufe 4.
`scripts/research/backtest2/trader-familie.mjs`, Modus `merkmale-familie-smoke` / `merkmale-familie`, Daten und Depotführung wie
Stufe 4. Muster als Tageszustand am Monatsultimo (einfache veröffentlichte Lesarten, nicht die zertifizierten SF-Module):
- **Turtle:** in den letzten 21 Sitzungen ein Schluss über dem höchsten Hoch der 55 Sitzungen davor.
- **Darvas:** in den letzten 21 Sitzungen ein Schluss über dem höchsten Hoch der 504 Sitzungen davor (neues Zweijahreshoch), und
  der Schluss heute höchstens 5 % unter dem höchsten Hoch seit dem Ausbruch.
- **Weinstein:** Stufe 2: Schluss über der 150-Tage-Linie, diese mindestens 0,5 % höher als vor 21 Sitzungen.
- **Minervini:** Trendvorlage wie Stufe 4, zum Vergleich neu gerechnet.

Neun feste Depots mit je 25 Titeln: je Muster „+ Faktoren“ (Rang nach Momentum 12-1 + Bruttogewinn je Bilanzsumme) und „nur
Muster“ (Rang nach relativer Stärke 6 Monate), dazu „nur Faktoren“. **Urteil je neuem Muster** (Turtle, Darvas, Weinstein):
„Hinweis“ nur, wenn „+ Faktoren“ nach Kosten vor SPY liegt, der Bootstrap-p nach Holm über die drei Hypothesen unter 0,10 bleibt
und das Depot über „nur Muster“ und „nur Faktoren“ liegt; sonst „nicht belegt“.

Grenzen, vorab benannt: (1) Geprüft wird die Auswahl in monatlichen Depots, nicht Stopps, Kästen oder Einheiten der Methoden;
dafür braucht es bei den Kauf-Stopp-Methoden Kurse innerhalb des Tages. (2) Festgelegt nach Einsicht in Stufe 2 bis 4. (3) Pocket
Pivot, Gap-Up, Episodic Pivot und Holy Grail sind Ereignis-Methoden mit Volumen- oder Tagesverlaufsregeln und in dieser Form
nicht abbildbar; sie bleiben offen.

## 5. Ausführung und Veröffentlichung

- Umsetzung: `scripts/research/backtest2/` (Markt, Signale, Depotführung, Suche, Lauf mit Workern). Workflow `research.yml`, Teil
  `portfolio`, Modus `backtest2-smoke` (400 Titel, kleines Gitter, nur Funktionsprobe) und `backtest2` (voller Lauf).
- **Stufe 1** (dieser Stand): Signalquellen nur aus Kursen: Marktführer (relative Stärke), Trendvorlage nach Minervini in
  veröffentlichter Lesart, Ausbruch 20 und 55 Tage (Turtle-Einstieg auf Schlussbasis), Trendvorlage mit 55-Tage-Ausbruch.
  **Stufe 2** (Owner 22.11.2026, „den Spieß umdrehen“; eigener PR, eingefrorener Datenstand, eine Woche): zuerst eine
  **Merkmals-Studie** auf unseren Daten (Point-in-Time, delistete Titel, liquide Top 1.000): je Merkmal monatlich das beste Fünftel
  gegen das Universum und gegen SPY, getrennt 2008–2016 und 2017–Ende, mit Kosten. Merkmale: die 11 Bestandteile der Quant-Profile
  und neu Rule of 40 (Umsatzwachstum + FCF-Marge), Bruttogewinn je Bilanzsumme, Eigenkapitalrendite, Bilanzwachstum, Accruals,
  Nettoemission/Rückkäufe, Abstand zum 52-Wochen-Hoch, Lage zur 200-Tage-Linie, kurzfristige Umkehr, „S&P-ähnlich“ (groß und
  profitabel). Vorrang nach dem Merkmals-Atlas 1963–heute ([../longrun/MERKMALE.md](../longrun/MERKMALE.md)). Danach die
  Merkmale, die in beiden Hälften halten, als Signalquellen im Gitter dieser Suche, dazu die zertifizierten Supertrader-Module.
- Vorher: Gegentests der Depotführung auf künstlichen Kursen mit bekanntem Ergebnis (`scripts/research/backtest2/backtest2.test.mjs`:
  Kauf zur Folgeeröffnung, Kosten, Stopp-Kurs, Insolvenz, Filter, Positionszahl, Universum, Walk-forward sieht nur Lernjahre).
- Läufe über GitHub Actions auf dem eingefrorenen Snapshot (R2); Ergebnisse zuerst versiegelt an den Owner.
- Öffentliche Renditezahlen nur nach Owner-Freigabe und Abstimmung mit der Rechtsberatung; Rechte an abgeleiteten Kennzahlen (Tiingo) vorher klären.
