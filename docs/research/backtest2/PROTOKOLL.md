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
- **R25 (ergänzt am 23.11.2026 nach Stufe 7, Regel wie §4j, vor dem ersten gezählten Monat):** unter den 1.000 größten Titeln
  das Mittel aus drei Bausteinen: die beiden Produkt-Scores und Rückkäufe (weniger Aktien als vor einem Jahr, aus
  `quant/data/sec/consumer` desselben Commits über `pit-fundamental-history.js#changeOver`, als Perzentil unter den wählbaren
  Titeln); 25 Titel; Haltepuffer: ein gehaltener Titel bleibt, solange er unter den besten 50 liegt; unter 10 Kandidaten Kasse.
- **L25 „laufen lassen“ (ergänzt am 24.11.2026 nach Stufe 9, vor dem ersten gezählten Monat):** Signal wie R25, nur Titel über
  der 200-Tage-Linie (Spalte `aboveSma200` des Technical-Tagesbestands desselben Commits, frische Reihe); bis zu 25 Positionen;
  ein gehaltener Titel bleibt, bis er am Stichtag nicht mehr über der 200-Tage-Linie liegt, unabhängig vom Rang; frei gewordene
  Plätze besetzen die besten Kandidaten; jeder Kauf ein Fünfundzwanzigstel des Depotwerts, kein Zurückstellen. Entsprechung
  zum Depot „kein Muster · laufen lassen“ der Stufe 9 mit monatlichem Stichtag.
- **Zählt ab Dezember 2026.** Urteil frühestens nach 12 Monaten; öffentlich nur mit Owner-Freigabe (Renditeaussage).

Abweichungen von der Studie, vorab benannt: (1) Die Baustein-Scores des Produkts sind zu 70 % Branchen- und zu 30 %
Universumsvergleich, die Studie rangierte im Universum. (2) Das Universum wird nach Börsenwert gebildet, in der Studie nach
durchschnittlichem Dollarumsatz. (3) Kursrendite statt Gesamtrendite, auf beiden Seiten gleich.

Stand der Daten am 20.11.2026 (kein Ergebnis, nur Abdeckung): 3.923 von 5.934 Titeln tragen einen Börsenwert; unter den 1.000
größten haben 514 beide Bausteine, unter den 500 größten 262. Daraus folgen 102 Titel (B1000) und 26 Titel (B500). Die Trendvorlage
erfüllen 74 der wählbaren Titel unter den 1.000 größten; M25 wählt daraus 25. Einen Rückkauf-Wert haben 505 der 514
wählbaren Titel; R25 wählt daraus 25.
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

**Ergebnis Stufe 5** (Lauf 45184443174, 01/2014 bis 09/2026, 153 Monate, nach Kosten, delistete Titel enthalten; SPY 14,1 % p. a.):
- **Alle drei neuen Muster: nicht belegt** (p nach Holm: Turtle 0,572, Darvas 0,928, Weinstein 0,586).
- Turtle: + Faktoren 16,6 % (+2,6 Pp, max. Verlust −29,5 %, 8 von 13 Jahren vorn), nur Muster 12,1 % (−2,0 Pp, −43,8 %).
- Weinstein: + Faktoren 14,5 % (+0,4 Pp, −31,1 %), nur Muster 10,9 % (−3,2 Pp, −64,5 %).
- Darvas (neues Zweijahreshoch): + Faktoren 10,1 % (−3,9 Pp, 5 Monate in Kasse), nur Muster 11,2 % (−2,8 Pp). Trägt in dieser
  Lesart in keinem Teilzeitraum.
- Minervini (Vergleich, wie Stufe 4): + Faktoren 18,4 % (+4,3 Pp, −24,1 %), nur Muster 18,1 % (+4,0 Pp, −40,9 %). Nur Faktoren
  16,3 % (+2,3 Pp, −34,6 %).
- Lesart: Die Muster allein liegen außer der Trendvorlage hinter SPY. Die Faktoren heben Turtle um 4,5 Pp und Weinstein um 3,6 Pp
  und senken den Maximalverlust deutlich; über „nur Faktoren“ kommt aber nur die Trendvorlage klar hinaus (+2,1 Pp), Turtle
  knapp (+0,3 Pp). Der Vorsprung aller Depots stammt überwiegend aus 2020–2022; 2014–2016 und seit 2023 liegen sie hinten.
- Folgerung: Für eine Auswahl mit Renditeangabe kommt aus dieser Familie nur „Trendvorlage + Faktoren“ in Frage (im
  Vorwärtstest als M25, §4e). Die Ein- und Ausstiegsregeln der Methoden bleiben ungeprüft, bis Kurse innerhalb des Tages
  vorliegen.

## 4h. Stufe 6: Ereignis-Methoden mit Faktoren (23.11.2026, vor dem ersten Lauf festgelegt)

Anlass (Owner 23.11.2026): Kullamägi und die übrigen Methoden fehlen noch. Berichtigung zu §4g: Die Auswahl dieser Methoden lässt
sich auf Tagesbalken mit Umsatz abbilden (das Marktmodell führt dafür jetzt den Stückumsatz `v`); nur ihr Einstieg im
Tagesverlauf nicht. `scripts/research/backtest2/trader-ereignis.mjs`, Modus `merkmale-ereignis-smoke` / `merkmale-ereignis`.
Ein Muster gilt, wenn das Ereignis in den letzten 21 Sitzungen eintrat und noch hält:
- **Kullamägi (Ausbruchs-Setup):** mindestens +30 % in 63 Sitzungen, Schluss höchstens 10 % unter dem 63-Tage-Hoch, Spanne der
  letzten 10 Sitzungen höchstens 15 % des Schlusses, Schluss über dem 20-Tage-Durchschnitt.
- **Pocket Pivot:** Aufwärtstag, dessen Umsatz über dem höchsten Umsatz aller Abwärtstage der 10 Sitzungen davor liegt, Schluss
  über der 50-Tage-Linie; Schluss heute nicht unter dem Tief dieses Tages.
- **Buyable Gap-Up:** Tief über dem Vortageshoch, Eröffnung mindestens 4 % über dem Vortagesschluss, Umsatz mindestens das
  1,5-Fache des 50-Tage-Durchschnitts; Schluss heute nicht unter dem Tief dieses Tages.
- **Holy Grail:** ADX(14) über 30 mit +DI über −DI, in den letzten 5 Sitzungen ein Tief am oder unter dem 20-Tage-EMA, Schluss
  heute am oder über dem EMA.
- **Darvas-Kasten (zweiter Versuch, nach Einsicht in Stufe 5):** Schluss höchstens 10 % unter dem höchsten Hoch der gesamten
  verfügbaren Historie (mindestens 756 Balken), in den letzten 5 Sitzungen ein Schluss über dem höchsten Hoch der 15 Sitzungen
  davor mit Umsatz mindestens das 1,5-Fache des 50-Tage-Durchschnitts. Weil nach Einsicht festgelegt, gilt ein positives
  Ergebnis hier nur als Hinweis auf einen Hinweis.

Elf feste Depots mit je 25 Titeln (je Muster „+ Faktoren“ und „nur Muster“, dazu „nur Faktoren“); Urteil je Muster wie §4g,
Holm über die fünf Hypothesen. Episodic Pivot und Parabolic Short bleiben offen (Tagesverlauf bzw. Leerverkauf).

**Ergebnis Stufe 6** (Lauf 45211526160, 01/2014 bis 09/2026, 153 Monate, nach Kosten; SPY 14,1 % p. a.):
- **Alle fünf Muster: nicht belegt** (p nach Holm jeweils 1,0).
- Pocket Pivot: + Faktoren 16,0 % (+2,0 Pp, max. Verlust −32,7 %, 7 von 13 Jahren vorn), nur Muster 12,2 % (−1,8 Pp, −50,4 %);
  praktisch gleichauf mit „nur Faktoren“ (16,3 %). Im Mittel 278 Kandidaten: das Muster ist häufig und schränkt kaum ein.
- Kullamägi 3,5 % / 5,5 %, Gap-Up 3,8 % / 3,5 %, Holy Grail 4,3 % / 2,5 %, Darvas-Kasten 10,0 % / 7,7 % (+ Faktoren / nur Muster).
- **Einschränkung, die das Ergebnis dieser vier Muster erklärt:** Sie sind selten. Im Mittel gibt es 17 bis 46 Kandidaten unter
  den 1.000 liquidesten Titeln, und das Depot „+ Faktoren“ stand bei Kullamägi 43, bei Holy Grail und Darvas-Kasten je 40 von
  153 Monaten in Kasse (0 %). Die Form „monatliches Depot mit 25 Titeln“ misst bei seltenen Ereignissen vor allem die Zeit ohne
  Kandidaten, nicht die Güte des Ereignisses. Gap-Up war fast immer investiert und liegt trotzdem in allen Teilzeiträumen hinten.
- Folgerung: Für seltene Ereignisse ist die richtige Messung eine Ereignisstudie (Verlauf nach dem Ereignis gegen die
  Vergleichsgruppe desselben Tages, wie die Technical-Evidenz), kein Monatsdepot. Eigener Schritt, vorab festzulegen.

## 4i. Stufe 7: Walk-forward über Trader-Muster und Faktoren (23.11.2026, vor dem ersten Lauf festgelegt)

Anlass (Owner 23.11.2026): weiterrechnen, bis eine Methode den Markt belegbar schlägt. Stufe 4 bis 6 haben feste Depots geprüft,
deren beste im Rückblick bekannt sind; wer danach wählt, behauptet einen Zufallstreffer. Der saubere Weg ist derselbe wie in
Stufe 3 (Fassung A): eine Auswahl, die je Runde nur die Lernjahre kennt, tritt auf den folgenden ungesehenen Jahren an.
`scripts/research/backtest2/trader-wf.mjs`, Modus `merkmale-traderwf-smoke` / `merkmale-traderwf`.
- **Raster, 240 Depots:** Muster (keines, die vier aus Stufe 5, die fünf aus Stufe 6) × Rang (Momentum; Momentum +
  Bruttogewinn/Bilanz; dazu Rückkäufe; relative Stärke) × 15/25/50 Titel × ohne/mit Haltepuffer (ein gehaltener Titel bleibt,
  solange er das Muster erfüllt und unter den besten 2N liegt). Übrige Depotführung wie Stufe 4.
- **Runden und Auswahl** wie Stufe 3: Lernen 2010–2013/2016/2019/2022, Bestätigen 2014–2016, 2017–2019, 2020–2022, 2023–Ende;
  zugelassen in beiden Lernhälften und in ≥ 60 % der Lernjahre vor SPY, höchstens 50 % Verlust; gewählt der höchste Median der
  Lern-Überrendite aus Depot und Nachbarn (gleiches Muster, eine Einstellung anders). Ohne Kandidat hält die Runde SPY.
- **Urteil „schlägt SPY“** nur, wenn die verketteten Bestätigungsjahre nach Kosten vor SPY liegen und der Block-Bootstrap
  p < 0,10 ergibt. Die Rangliste aller 240 Depots auf den Bestätigungsjahren wird als Rückschau berichtet und ist kein Beleg.

**Ergebnis Stufe 7** (Lauf 45218341763, Bestätigung 01/2014 bis 09/2026 verkettet, nach Kosten; SPY 14,1 % p. a., max. Verlust −23,9 %):
- **Auswahl nur aus den Lernjahren: 13,1 % p. a. (−1,0 Pp gegen SPY, max. Verlust −32,1 %, 7 von 13 Jahren vorn, p 0,394):
  nicht belegt.** Gewählt wurden Turtle · Momentum · 25 (2014–2016: 6,2 % gegen 11,0 %), Turtle · relative Stärke · 15 mit Puffer
  (2017–2019: 5,8 % gegen 14,1 %), kein Muster · Momentum + Bruttogewinn/Bilanz · 50 (2020–2022: 19,7 % gegen 9,8 %) und kein
  Muster · Momentum + Bruttogewinn/Bilanz + Rückkäufe · 15 (2023–Ende: 19,8 % gegen 20,1 %). Wie in Stufe 3 findet die Auswahl
  aus vier bis sieben Lernjahren keine stabile Regel; ab 2020 liegt sie richtig.
- **Rückschau (kein Beleg, 240 Depots, 35 % vor SPY):** Median gegen SPY je Muster: Trendvorlage +2,9 Pp (21 von 24 vor SPY),
  kein Muster +2,5 Pp (18 von 24), Turtle +1,6 Pp, Weinstein und Pocket Pivot +0,8 Pp; Darvas, Darvas-Kasten, Kullamägi,
  Gap-Up und Holy Grail in allen 24 Einstellungen hinter SPY (seltene Muster, viel Kasse, siehe §4h).
- **Auffällig und über alle Muster gleich:** 13 der 15 besten Depots rangieren nach Momentum + Bruttogewinn/Bilanz +
  Rückkäufe. Ohne Muster, 15 Titel, mit Haltepuffer: 25,4 % p. a. (+11,4 Pp, max. Verlust −23,6 %, 10 von 13 Jahren vorn,
  p 0,080, Umschlag 30 % je Monat); 25 Titel mit Puffer 22,1 % (+8,1 Pp, p 0,084, Umschlag 26 %); mit Trendvorlage, 15 Titel,
  Puffer 23,0 % (+9,0 Pp, max. Verlust −17,7 %, p 0,096). Die p-Werte sind nicht für 240 Versuche korrigiert.
- Haltepuffer: Median +0,1 Pp Rendite, besser in 68 von 120 Paaren; er halbiert etwa den Umschlag, ohne Rendite zu kosten.
- Folgerungen (eigene PRs, vorab festzulegen): (1) Das Signal Momentum + Bruttogewinn/Bilanz + Rückkäufe war schon in Stufe 2
  festgelegt und dort phasenfest; neu ist die Konzentration auf 15 bis 25 Titel. Als feste Hypothese mit Haltepuffer in den
  Vorwärtstest aufnehmen; dafür braucht das Produkt die Veränderung der Aktienzahl als Baustein. (2) Keine Renditeaussage nach
  außen aus der Rückschau. (3) Seltene Muster über eine Ereignisstudie messen.

## 4j. Stufe 8: feste Hypothese Momentum + Bruttogewinn/Bilanz + Rückkäufe (23.11.2026, vor dem Lauf festgelegt)

Herkunft, offen benannt: Das Signal steht seit Stufe 2 fest; die Depotform (25 Titel, Haltepuffer) wurde nach Einsicht in die
Rückschau der Stufe 7 gewählt. Der Lauf beschreibt genau diese eine Regel und bestätigt sie nicht; bestätigen kann nur der
Vorwärtstest. `scripts/research/backtest2/rueckkauf-hypothese.mjs`, Modus `merkmale-rueckkauf-smoke` / `merkmale-rueckkauf`.
- **R25:** kein Muster, Rang nach Momentum 12-1 + Bruttogewinn je Bilanzsumme + Rückkäufe, 25 Titel, Haltepuffer (ein Titel
  bleibt, solange er unter den besten 50 liegt), übrige Depotführung wie Stufe 7. Gewählt ist 25 statt der in der Rückschau
  besten 15 Titel, weil 25 weniger an Einzelwerten hängt.
- **Gegenproben**, je genau eine Einstellung anders: ohne den besten bzw. die zwei besten Titel jedes Monats (im Nachhinein
  entfernt, Härtetest gegen „hängt an wenigen Gewinnern“), ohne Haltepuffer, 15 Titel, 50 Titel, nur mit Trendvorlage, ohne
  Rückkäufe.
- Berichtet: Rendite, Abstand zu SPY, max. Verlust, Jahre vorn, p, Umschlag; Kalenderjahre und Teilzeiträume für R25.

**Ergebnis Stufe 8, erster Lauf** (Lauf 45233282094, 01/2014 bis 09/2026, nach Kosten; SPY 14,1 % p. a.):
- R25 22,1 % p. a. (+8,1 Pp, max. Verlust −22,7 %, 8 von 13 Jahren vorn, p 0,084, Umschlag 26 % je Monat).
- **Das Ergebnis hängt an einem Jahr:** 2020 +128,9 % gegen 17,2 %. Teilzeiträume gegen SPY: 2014–2016 +0,1 Pp, 2017–2019
  +3,3 Pp, 2020–2022 +31,2 Pp, 2023–Ende +1,0 Pp. Ohne das Jahr 2020 gerechnet rund 15,7 % gegen 13,8 % p. a. Hinten lag R25
  2016 (−12,8 Pp), 2019 (−5,6 Pp), 2021 (−4,4 Pp), 2025 (−8,0 Pp).
- Gegenproben: 15 Titel 25,4 %, 50 Titel 18,5 %, ohne Haltepuffer 21,4 %, mit Trendvorlage 18,4 % (max. Verlust −18,7 %), ohne
  Rückkäufe 18,3 % (max. Verlust −31,2 %). Ohne den besten Titel jedes Monats 6,4 %, ohne die zwei besten −0,5 %: dieser
  Härtetest trifft jedes Depot mit 25 Titeln hart und trennt deshalb nicht; er wird um Kappung, Median-Vergleich und die Liste
  der größten Einzelbeiträge ergänzt (zweiter Lauf, gleiche Regel, nur zusätzliche Auswertung).
- Lesart bis dahin: kein belastbarer Vorsprung außerhalb von 2020–2022; vor einer Aussage nach außen muss geklärt sein, welche
  Titel 2020 getragen haben und ob die Kurse stimmen.

**Ergebnis Stufe 8, zweiter Lauf** (Lauf 45239682418, gleiche Regel, zusätzliche Auswertung):
- **Der Vorsprung hängt an einem Titel:** GameStop (GME), gehalten am Ultimo 12/2020, +1.625 % im Januar 2021; bei 4 % Gewicht
  rund 65 Prozentpunkte in einem Monat. GME steht dreimal unter den 15 größten Einzelbeiträgen (dazu +86,6 % und +58,2 %). Der
  Kurs ist echt, kein Datenfehler; die Regel wählte GME wegen Kursstärke und starker Rückkäufe. Von 3.825 Titel-Monaten lagen
  zwei über +100 %.
- **Mit Kappung jeder Monatsrendite je Titel bei +30 %: 15,8 % p. a. (+1,7 Pp gegen SPY, p 0,201).** Das ist die ehrliche
  Größenordnung der Regel ohne Glückstreffer.
- Median der gehaltenen Titel gegen Median aller Titel des Universums: in 89 von 153 Monaten vorn, typischer Monat +0,9 Pp,
  im Mittel +0,5 Pp. Die Auswahl trifft im Schnitt die besseren Titel; gegen einen kapitalgewichteten Index reicht das für rund
  zwei Prozentpunkte p. a.
- Lesart: R25 ist eine vernünftige Regel mit kleinem, nicht gesichertem Vorsprung und gutem Verhalten in schwachen Jahren
  (2015, 2018, 2022 vor SPY). Die 22,1 % bzw. 25,4 % der Rückschau sind nicht verwendbar. Für jede künftige Studie gilt: neben
  der Rendite immer die gekappte Rendite und die größten Einzelbeiträge berichten.

## 4k. Stufe 9: Gewinner laufen lassen und Gewinner-Erkennung (24.11.2026, vor dem ersten Lauf festgelegt)

Anlass (Owner 24.11.2026): Die Depots der Stufen 4 bis 8 stellen jeden Monat auf gleiche Gewichte zurück. Das stutzt jeden
Gewinner und lässt bei seltenen Mustern Geld liegen; die Bücher halten dagegen wenige Positionen, solange der Trend läuft.
`scripts/research/backtest2/laufen-lassen.mjs`, Modus `merkmale-laufen-smoke` / `merkmale-laufen`.
- **Teil A, Depot ohne Zurückstellen:** bis zu 25 Positionen; freie Plätze besetzen die besten Kandidaten des Monats (Muster als
  Schranke, Rang nach Signal, nur Titel über der 200-Tage-Linie); jeder Kauf ein Fünfundzwanzigstel des Depotwerts, höchstens
  die Kasse; kein monatliches Angleichen. Verkauf nur, wenn der Monatsschluss nicht mehr über der 200-Tage-Linie liegt oder der
  Titel endet. Kasse 0 %, Kosten je Kauf und Verkauf. Acht feste Depots: kein Muster, Minervini, Turtle, Darvas-Kasten,
  Kullamägi je mit Momentum + Bruttogewinn/Bilanz + Rückkäufen; Minervini, Darvas-Kasten, Kullamägi zusätzlich „nur Muster“.
- **Ehrlichkeitsproben je Depot** (Lehre aus Stufe 8): derselbe Lauf ohne die Aktie mit dem größten Gewinnbeitrag, Anteil der
  fünf größten Positionen am Gesamtgewinn, die größten Positionen mit Namen.
- **Teil B, Gewinner-Erkennung:** Gewinner = Titel des Universums mit mindestens +100 % in den folgenden 12 Monaten. Je Muster
  und für das beste Fünftel nach Signal: Ausbeute (Anteil der Markierten, die Gewinner wurden), Faktor gegenüber der Grundquote
  und Anteil aller Gewinner, der am Stichtag markiert war.
- Kein Urteil nach fester Schranke: Die Depotform ist neu und nach Einsicht in Stufe 2 bis 8 gewählt; berichtet wird
  beschreibend, ein gutes Ergebnis ist ein Hinweis für den Vorwärtstest.

**Ergebnis Stufe 9** (Lauf 45411433777, 01/2014 bis 09/2026, nach Kosten; SPY 14,1 % p. a.):
- **Teil A, laufen lassen mit Faktoren:** kein Muster 18,8 % p. a. (+4,8 Pp, max. Verlust −34,2 %, 8 von 13 Jahren vorn, p 0,114;
  ohne den größten Gewinner 17,6 %), Minervini 18,3 % (+4,3 Pp, −27,7 %, p 0,084; ohne größten Gewinner 16,2 %), Turtle 18,0 %
  (+4,0 Pp, −34,1 %; ohne GME 14,7 %). Darvas-Kasten 11,1 % (−2,9 Pp, −19,1 %), Kullamägi 11,9 % (−2,2 Pp; ohne NVDA 8,8 %).
- **Nur Muster, laufen lassen:** Minervini 15,7 % (+1,7 Pp, max. Verlust −49,4 %), Darvas-Kasten 15,7 % (+1,6 Pp, −23,7 %),
  Kullamägi 14,5 % (+0,5 Pp, −36,7 %). Für Darvas ist das die erste Form, in der das Muster vor SPY liegt.
- Die fünf größten Positionen tragen 29 % bis 62 % des Gewinns; mittlere Haltedauer 8 bis 9 Monate, rund 400 bis 450 Käufe in
  12,75 Jahren. Größte Positionen: GME ×14,2, APP ×6,8 bis ×15,1, RNG ×7,0, FTI ×8,3, NVDA ×7,6 (2015–2018) und ×4,3 (2023–2025),
  ENPH ×9,9, PLTR ×9,2, TSLA ×6,7.
- Gegenüber dem monatlichen Zurückstellen (Stufe 8, gekappt 15,8 %) hält das Laufenlassen den Vorsprung auch ohne den größten
  Gewinner (16 % bis 18 %), bezahlt ihn aber mit größeren Verlustphasen.
- **Teil B, Gewinner-Erkennung** (139.567 Titel-Monate, Grundquote für „mindestens +100 % in 12 Monaten“ 3,1 %): Ausbeute
  Kullamägi 6,2 % (×2,0), Gap-Up 6,8 % (×2,2), Holy Grail 4,1 % (×1,3), Turtle 3,0 % (×1,0), Pocket Pivot 2,9 %, Trendvorlage
  2,6 % (×0,8), Weinstein 2,6 %, bestes Fünftel nach Signal 2,6 %, Darvas 1,6 %, Darvas-Kasten 1,3 % (×0,4). Kein Muster hebt
  die Ausbeute über 7 %: von 100 markierten Titeln verdoppeln sich höchstens 7. Die breiten Muster (Weinstein, Pocket Pivot,
  Turtle) hatten rund 40 % aller späteren Gewinner markiert, aber auch rund 40 % aller Titel.
- Lesart: Die Muster „springen an“, aber bei sehr vielen Titeln; sie sagen einen Verdoppler kaum besser voraus als der Zufall.
  Der Vorsprung der Faktor-Depots kommt nicht aus mehr Verdopplern, sondern aus weniger schwachen Titeln und daraus, Gewinner
  nicht zu stutzen.

**Nachtrag Ausreißerprobe Marktführer-Depot (Stufe 4, H1; Lauf 24.11.2026, Forschung, nicht zertifiziert).** Dieselbe Probe
wie in Stufe 8 für das Depot Trendvorlage + Momentum + Bruttogewinn/Bilanz, 25 Titel, monatlich gleichgewichtet:

- Ungekappt 18,4 % p. a. (+4,3 Pp zu SPY, p 0,157). Monatsrendite je Titel bei +30 % gekappt: **10,7 % p. a. (−3,4 Pp,
  p 0,805)**, größter Verlust −24,7 %.
- Größte Einzelbeiträge: GME 12/2020 +1.625 %, ein delisteter Titel 07/2021 +291 %, APP 10/2024 +99 %, AGNT 12/2020 +69 %,
  TNDM 07/2018 +66 %, AEHR 09/2021 +66 %.
- Lesart: Der Vorsprung des monatlich zurückgestellten Marktführer-Depots hängt an wenigen Extremmonaten, voran GameStop.
  Die Kappe ist streng (sie schneidet auch echte Trendgewinner), aber das Ergebnis reicht nicht für eine Aussage „schlägt den
  S&P 500“. Belastbarer bleibt das Laufenlassen (Stufe 9): dort hält der Vorsprung auch ohne den größten Gewinner. Im
  Vorwärtstest zählen M25, R25 und L25 ab 12/2026 nebeneinander.

## 4l. Stufe 10: Laufen lassen im Walk-forward (24.11.2026, vor dem ersten Lauf festgelegt)

Anlass (Owner 24.11.2026: „zu kurz daran gearbeitet“, Ziel deutlich höher): Stufe 9 hat acht feste Depots nach Einsicht gerechnet.
Stufe 10 prüft, ob eine Regel, die nur aus den Lernjahren gewählt wird, in ungesehenen Jahren hält, und welcher Hebel trägt.
Code: `scripts/research/backtest2/laufen-wf.mjs`. Forschung, nicht zertifiziert.

- **Gitter (216 Depots):** Muster {keines, Trendvorlage, 55-Tage-Ausbruch} × Rang {Momentum; Momentum + Bruttogewinn/Bilanz;
  dazu Rückkäufe} × Plätze {10, 15, 25, 40} × Ausstieg {200-Tage-Linie; Position 25 % unter ihrem höchsten Ultimo-Wert seit
  Kauf; was zuerst greift} × Universum {größte 500, größte 1.000}. Depotführung wie Stufe 9 (kein Zurückstellen, Kosten je Seite).
- **Auswahl nur aus den Lernjahren:** Kennzahl = Minimum aus eigener Rendite ohne den größten Gewinner und dem Median der
  Rendite der Nachbarn (genau eine Dimension anders). Höchste Kennzahl gewinnt.
- **Runde A (maßgeblich):** lernen 2014–2019, prüfen 2020–09/2026 mit frischem Start. **Runde B (Gegenprobe):** umgekehrt.
- **Belegt** nur, wenn in Runde A im Prüfzeitraum: Vorsprung zu SPY > 0, Vorsprung auch ohne den größten Gewinner > 0 und
  Block-Bootstrap-p < 0,10.
- Dazu berichtet: Anteil der Depots, die in beiden Hälften vor SPY liegen (auch ohne größten Gewinner), Median je Hebelwert,
  Bestenliste im Nachhinein (ausdrücklich kein Beleg).

**Ergebnis Stufe 10 (Lauf 24.11.2026, Forschung, nicht zertifiziert): nicht belegt.**

- **Runde A:** Aus 2014–2019 gewählt: 55-Tage-Ausbruch · Momentum + Bruttogewinn/Bilanz + Rückkäufe · 10 Titel · 25 % nachlaufend
  (Lernjahre 19,8 %, ohne größten Gewinner 19,0 %). Prüfjahre 2020–09/2026: **13,7 % p. a. (−1,7 Pp zu SPY)**, ohne größten
  Gewinner 10,6 %, größter Verlust −25,6 %, p 0,562. Der Median aller 216 Depots lag im Prüfzeitraum bei +1,0 Pp: die Auswahl
  hat nichts geleistet.
- **Runde B (Gegenprobe):** aus 2020–2026 gewählt (kein Muster · Momentum · 15 Titel · Top 500; 32,3 %), in 2014–2019 nur 3,7 %
  (−8,9 Pp).
- Von 216 Depots lagen 59 in beiden Hälften vor SPY, nur 10 auch ohne ihren größten Gewinner; alle 10 ranken mit Rückkäufen.
- **Hebel (Median, ganzer Zeitraum):** Rang mit Rückkäufen 16,1 % (ohne größten Gewinner 14,3 %) gegen 12,6 % (Momentum) und
  11,7 % (Momentum + Bruttogewinn/Bilanz). Weniger Titel bringt im Median **nicht** mehr: 10 Titel 11,6 % (max. Verlust −41,9 %),
  15: 13,6 %, 25: 14,7 %, 40: 14,3 % (−27,7 %). Ausstieg 200-Tage-Linie 15,4 % gegen 12,5 % nachlaufend. Top 500: 15,2 %,
  Top 1.000: 11,9 %.
- **Rückschau (kein Beleg):** bestes Depot 55-Tage-Ausbruch + alle drei Faktoren, 10 Titel, 200-Tage-Linie: 26,1 % p. a.
  (ohne APP 24,8 %), größter Verlust −44,8 %. Die Variante mit nachlaufendem Ausstieg ist genau die, die Runde A gewählt hat
  und die danach hinter SPY lag.
- Lesart: Hohe Zahlen (über 20 %) entstehen nur in stark konzentrierten Depots und halten der Auswahl-Probe nicht stand. Der
  einzige Hebel, der über das Gitter hinweg trägt, sind die Rückkäufe im Rang; das stützt R25/L25 im Vorwärtstest, mehr nicht.

## 4m. Stufe 11: Ereignisstudie je Muster (24.11.2026, vor dem ersten Lauf festgelegt)

Anlass: Seltene Muster lassen ein Monatsdepot oft leer (Stufe 6: 40 bis 43 von 153 Monaten in Kasse). Stufe 11 misst das
Ereignis selbst. Code: `scripts/research/backtest2/ereignis-studie.mjs`. Forschung, nicht zertifiziert.

- Je Monatsultimo ab 2014 und Horizont 1, 3, 6, 12 Monate: Rendite der markierten Titel minus Rendite aller Titel der größten
  1.000 am selben Ultimo, als Mittel und als Median; mindestens 3 markierte Titel je Monat. Jeder Monat zählt gleich.
- Zehn Muster, jeweils allein und als Teilmenge „markiert und bestes Fünftel nach Momentum + Bruttogewinn/Bilanz + Rückkäufe“.
- t-Wert mit um die Überlappung gekürzter Monatszahl (n / Horizont). Ohne Kosten (kein Depot).
- **Auffällig** nur, wenn nach 3 und nach 12 Monaten: Vorsprung im Mittel und im Median > 0, t > 2, und in beiden Hälften
  (2014–2019, ab 2020) > 0. Nicht für die Zahl der Versuche korrigiert: ein auffälliges Muster ist ein Kandidat, kein Beleg.
- Grenze: gemessen am Monatsultimo; ein Einstieg am Ereignistag ist nicht abgebildet (dafür Minutendaten, eigene Stufe).

**Ergebnis Stufe 11 (Lauf 24.11.2026, Forschung, nicht zertifiziert): kein Muster auffällig.**

- **Muster allein:** Nach 1, 3, 6 und 12 Monaten liegt kein Muster verlässlich vor dem Durchschnitt aller Aktien. Trefferanteil
  („besser als die mittlere Aktie“) 47 % bis 53 %, t durchweg unter 1,3. Nach 12 Monaten: Trendvorlage +0,4 Pp (Median 0,0),
  Turtle +0,6 Pp, Weinstein 0,0 Pp, Pocket Pivot +0,3 Pp, Darvas-Zweijahreshoch +0,9 Pp, Darvas-Kasten +0,2 Pp, Holy Grail −0,4 Pp.
- **Kullamägi und Gap-Up:** Mittel nach 12 Monaten +3,6 Pp und +2,9 Pp, Median aber −1,2 Pp und −1,6 Pp, Trefferanteil 47 % und
  48 %: wenige sehr große Gewinner, die typische markierte Aktie läuft schlechter als der Durchschnitt. Gap-Up nach 1 Monat
  −0,5 Pp (t −2,0).
- **Muster + bestes Fünftel Faktoren:** durchweg besser als das Muster allein. Nach 12 Monaten: Darvas-Zweijahreshoch +5,1 Pp
  (Median +4,5 Pp, Trefferanteil 58 %), Turtle +3,8 Pp (55 %), Trendvorlage +3,1 Pp (55 %), Pocket Pivot +3,0 Pp, Weinstein
  +2,8 Pp, Kullamägi +8,3 Pp (Median +3,2 Pp; nur 715 Ereignisse in 85 Monaten). t überall unter 1,5; ab 2020 meist deutlich
  kleiner als 2014–2019 (Trendvorlage +5,9 Pp → +0,2 Pp, Weinstein +5,2 Pp → +0,4 Pp).
- Lesart: Der Vorsprung kommt aus den Faktoren, nicht aus dem Muster. Das bestätigt Stufe 4 bis 10 aus einer anderen
  Messrichtung. Offen bleibt nur der Einstieg am Ereignistag selbst (Minutendaten), den diese Stufe nicht abbildet.

## 4n. Stufe 12: Ziel 20 % p. a. – Marktphase, Verlustbegrenzung, Nebenwerte, Hebel (27.11.2026, vor dem ersten Lauf festgelegt)

Anlass (Owner 27.11.2026): Vermutung, dass viele schlechte Trades die Rendite auffressen, und Frage, ob nur in bestimmten
Marktphasen investiert zu sein hilft; Zielvorgabe mindestens 20 % p. a. Code: `scripts/research/backtest2/ziel20.mjs`.
Forschung, nicht zertifiziert.

- **Sechs Grunddepots** (laufen lassen wie Stufe 9, 25 Plätze): Faktoren ohne Muster; Trendvorlage, 55-Tage-Ausbruch und
  Darvas-Kasten je mit Faktoren; Darvas-Kasten allein; Kullamägi allein.
- **Zwölf Varianten je Depot:** unverändert; Käufe nur bei SPY über 200-Tage-Linie; zusätzlich alles verkaufen, wenn SPY
  darunter; Käufe nur bei Marktbreite ≥ 50 %; täglicher Stopp 8 % unter Einstand; täglicher Stopp 25 % unter Höchststand;
  Marktphase raus + Stopp 8 %; Nebenwerte (Rang 1.001–3.000); 10 statt 25 Titel; Hebel 1,5-fach (Kredit 4 % p. a.); Hebel nur
  in guter Marktphase; Marktphase raus + Hebel in guter Phase.
- **Trade-Statistik** je Grunddepot (unverändert, Stopp 8 %, Marktphase raus): Anteil Verlierer, Ø Gewinn/Verlust, Summe der
  Verluste gegen Summe der Gewinne, Zahl der Verdoppler.
- **Ziel erreicht und robust** nur, wenn: Rendite ≥ 20 % p. a., ohne größten Gewinner ≥ 17 %, beide Hälften vor SPY, größter
  Verlust nicht schlechter als −40 %. 72 Varianten nach Einsicht: ein Treffer ist ein Kandidat für den Vorwärtstest, kein Beleg.

**Ergebnis Stufe 12 (Lauf 27.11.2026, Forschung, nicht zertifiziert): keine der 72 Varianten erreicht das Ziel robust.**

- **Marktphase verschlechtert fast alles.** Faktoren ohne Muster: 18,8 % → 16,6 % (Käufe nur bei SPY über 200-Tage-Linie) →
  11,7 % (zusätzlich alles verkaufen; 26 von 153 Monaten leer), Marktbreite 16,1 %. Trendvorlage + Faktoren 18,3 → 15,1 → 11,2 %;
  Turtle + Faktoren 18,0 → 15,9 → 12,8 %; Darvas-Kasten allein 15,7 → 14,0 → 6,9 %. Einzige Ausnahme: Kullamägi allein mit
  Kaufsperre 14,5 → 16,4 %. Der größte Verlust sinkt durch die Marktphase kaum (−34,2 → −36,6 %), weil der Wiedereinstieg
  nach der Erholung zu spät kommt.
- **Verlierer fressen die Rendite nicht.** Faktoren ohne Muster: 53 % der 451 Positionen sind Verlierer, Ø Verlust −11,7 %,
  Ø Gewinn +49,3 %; Summe Gewinne 11,6 gegen Summe Verluste −3,6 (Vielfache des Startkapitals). Gleiches Bild bei allen sechs
  Depots (Gewinne 2,5- bis 4-mal so groß wie Verluste).
- **Stopps kosten Rendite.** Stopp 8 %: 18,8 → 17,4 % (Faktoren), 18,3 → 14,3 % (Trendvorlage), 15,7 → 11,2 % (Darvas-Kasten),
  14,5 → 11,1 % (Kullamägi); der Anteil der Verlierer steigt auf 62 bis 73 %, weil spätere Gewinner ausgestoppt werden.
  Nachlaufender Stopp 25 %: Faktoren 17,6 % bei größtem Verlust −24,0 % statt −34,2 % (die einzige Variante, die Risiko spürbar
  senkt, ohne viel Rendite zu kosten).
- **Nebenwerte (Rang 1.001–3.000) sind schlechter:** 10,5 % (Faktoren), 7,1 % (Trendvorlage), 13,0 % (Turtle).
- **Darvas-Kasten:** mit Faktoren 11,1 % (schlechter als allein 15,7 %); keine Variante hebt ihn über 18 % außer Hebel (20,0 %,
  erste Hälfte −2,6 Pp hinter SPY).
- **Über 20 % kommen nur zwei Wege:** Hebel 1,5-fach (Faktoren 23,1 %, größter Verlust −51,4 %; Trendvorlage + Faktoren
  23,3 %, ohne größten Gewinner 20,1 %, beide Hälften vor SPY, p 0,028, größter Verlust −41,7 % – verfehlt nur die
  Verlustgrenze von −40 %) und Konzentration auf 10 Titel (Turtle + Faktoren 26,1 %, −44,8 %; in Stufe 10 aus den Lernjahren
  nicht erkennbar). Beides ist mehr Risiko, keine bessere Auswahl.
- Lesart: Die Rendite kommt aus wenigen großen Gewinnern (19 bis 24 Verdoppler je Depot); jede Regel, die früher verkauft oder
  zeitweise draußen bleibt, schneidet diese ab. 20 % sind in der Rückrechnung nur mit Hebel oder starker Konzentration zu
  haben, also mit Verlustphasen von 40 bis 50 %.

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
