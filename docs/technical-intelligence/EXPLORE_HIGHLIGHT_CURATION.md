# Explore Highlights und Candidate Explorer (Kuratierung)

Stand 11.10.2026 · `explore-highlight-1.0.0` · `explore-candidates-1.0.0` · Kuratierung `explore-curation-1.0.0` · Projection Engine 1.3.0 · Register 1.5.0

**Kuratieren, nicht erzeugen.** Die Elliott-Engine (3.2.2, eingefroren) liefert je Titel einen Pool regelkonformer Zählungen. Explore Elliott 1.0.0 zeigte davon bis zu drei auf **74,4 % aller Titel**. Diese Schicht wählt nur aus dem unveränderten Pool aus, welche Lesarten dem Kunden als **Highlight** gezeigt werden und welche nur im technischen **Candidate Explorer** (Profi) stehen. Sie erzeugt keine Zählung, ändert keinen Rang, keine Regel, keine Projektionsformel, kein Gate und keine Grad-Logik.

## Vier Ebenen

| Ebene | Was | Sichtbar |
|---|---|---|
| 1 Primär | bevorzugte Zählung der Engine | wie bisher |
| 2 Alternative | Engine-Alternative bzw. Motiv-Alternative, besteht alle Produkt-Leitplanken | wie bisher |
| 3 **Explore Highlights** | höchstens 2 kuratierte, regelkonforme alternative Lesarten | alle, unter Primär und Alternative |
| 4 **Candidate Explorer** | weitere technische Lesarten (höchstens 6, strukturell verschieden) | nur Profi-Ansicht, eingeklappt |

Primär, Alternative, Motiv-Alternative, Formeln und Invalidation sind byte-gleich zum Stand vor der Kuratierung (Prüfung: Abschnitt „Identitätsprüfung“ am Ende).

## Eignung für ein Highlight (`explore-curation.js`, vor der Auswertung festgelegt)

Ein Kandidat kommt aus dem Pool (`ti-projection.mjs#exploreCandidateList`; Filter unverändert gegenüber Explore 1.0.0): alle Regeln erfüllt (erneut geprüft), nicht abgeschlossen, letzte Welle läuft, noch keine Grenze verletzt, gültige Invalidation, mindestens eine Zone offen, nicht schon angezeigt, Rang in der besseren Hälfte des Pools, saubere Daten, Wertpapierart `EQUITY_COMMON/ELIGIBLE`, mindestens eine Produkt-Leitplanke G2–G5 verfehlt. **Ein Highlight muss zusätzlich:**

1. **Struktur-Leitplanken bestehen.** G3 (Signal/Rauschen ≥ 3,0) und G4 (erste Welle ≥ 26 Wochen) messen, ob die Zählung eine reale, ausreichend große Struktur beschreibt. Verfehlt sie eines davon, ist sie Rauschen der Kandidatensuche oder zu klein für ein Wochenchart-Argument.
   * Diese Fehlschläge sind keine knappen Verfehlungen (Audit): beim Signal/Rauschen liegt der Median der G3-Verfehler bei **1,77** (Schwelle 3,0; **21 %** unter dem Rauschboden der Engine von 1,3); bei der ersten Welle liegt der Median der G4-Verfehler bei **8 Wochen** (Schwelle 26; 69 % unter 13 Wochen).
2. **Höchstens eine Deutungs-Leitplanke verfehlen: G2 (Grad kollidiert mit einer abgeschlossenen Struktur vergleichbarer Größe) oder G5 (gegen den gemessenen Trend).** Sie betreffen die Deutung einer sauberen Struktur; Elliott-Umkehrungen laufen legitim gegen den Trend. Zwei Deutungsunsicherheiten zugleich (G2 + G5) sind eine zu viel. Jede andere Kombination, insbesondere **G3 + G4** und **G2 + G3 + G4**, ist ausgeschlossen.
3. **Rangschwelle je Wellentyp** (Anteil im Pool, `(Rang + 1) / Poolgröße`): **Welle 3 ≤ 25 %, Welle 5 ≤ 25 %, Welle C ≤ 10 %.** Welle C ist mit 81 % des Pools die häufigste und unspezifischste Familie und wird deshalb strenger gehalten. Der Rang ist ein Platz im Pool, **keine Wahrscheinlichkeit**; er wird angezeigt.
4. **Wesentlich verschieden** von einem zweiten Highlight: Gegenrichtung oder anderer Wellentyp. Nahezu gleiche Leitern (Mitte der erweiterten Stufe innerhalb 10 %, gleiche Richtung, gleicher Typ) werden nie doppelt gezeigt, weder zu einer angezeigten These noch untereinander.
5. **Höchstens 2 Highlights je Titel**, lieber eines.

Eine große Projektion ist **kein** Kriterium und sortiert nie nach vorn. Trend und Marktstruktur sperren nie; die Relative Stärke wird gezeigt, geht aber nicht in die Reihenfolge ein.

## Reihenfolge (lexikographisch, kein Punktwert)

Kein Gewicht, keine 100-Punkte-Zahl, keine Wahrscheinlichkeit, keine Projektionsgröße, keine Zukunftsdaten:

1. weniger verfehlte Leitplanken;
2. Wellentyp: **Welle 3 vor Welle 5 vor Welle C**;
3. Rang-Stufe im Pool (≤ 10 %, ≤ 25 %, ≤ 50 %);
4. Kontext hinter der These (0–2: Trend und Marktstruktur stehen in Thesenrichtung; unbekannt zählt nicht als Gegenkontext. Die Relative Stärke ist ein Querschnittsrang des Laufs; Produkt-Build und Register rechnen ihn getrennt, daher bliebe sie aus der Reihenfolge heraus, damit beide dieselben Highlights wählen). Er senkt nur die Reihenfolge innerhalb gleich guter Lesarten;
5. größere Struktur (längere erste Welle);
6. genauer Rang; 7. stabile Kennung.

Der Candidate Explorer verwendet dieselbe Reihenfolge ohne die Highlight-Eignung und enthält die besten, strukturell verschiedenen Lesarten, die kein Highlight sind (höchstens 6, keine nahezu gleichen Leitern).

## Audit des Pools (Universum 11.10.2026, 5.035 Titel; nur beschreibend, ohne Renditen)

Reproduktion des Standes vor der Kuratierung: 3.747 Titel (74,4 %) mit Explore, 6.679 Lesarten (veröffentlicht: 3.745 / 6.678).

Pool: **31.611** zulässige Kandidaten auf 3.803 Titeln. Welle C 25.714 (81 %) · Welle 3 4.648 (15 %) · Welle 5 1.249 (4 %). Verfehlte Leitplanken je Kandidat: eine 3.636 (11,5 %) · zwei 11.228 (35,5 %) · drei 12.852 (40,7 %) · vier 3.895 (12,3 %). **53 % des gesamten Pools verfehlen drei oder mehr Leitplanken.**

| verfehlt | Kandidaten | Anteil | Titel | Welle 3 / 5 / C | Rang Median [P25–P75] | ≤ 10 % | ≤ 25 % | in bisherigem Explore |
|---|---|---|---|---|---|---|---|---|
| G2 | 560 | 1,8 % | 331 | 52 / 5 / 503 | 32,2 % [22,2–41,1] | 35 | 174 | 92 |
| G3 | 1.698 | 5,4 % | 851 | 352 / 9 / 1.337 | 25,8 % [15,2–37,5] | 245 | 812 | 371 |
| G4 | 1.010 | 3,2 % | 628 | 146 / 57 / 807 | 25,2 % [14,9–36,5] | 151 | 501 | 243 |
| G5 | 368 | 1,2 % | 229 | 48 / 0 / 320 | 23,3 % [11,6–35,4] | 80 | 197 | 113 |
| G2 + G3 | 3.444 | 10,9 % | 1.528 | 649 / 21 / 2.774 | 30,4 % [19,6–39,8] | 263 | 1.299 | 745 |
| G2 + G4 | 1.680 | 5,3 % | 838 | 274 / 64 / 1.342 | 28,3 % [17,3–38,9] | 165 | 718 | 351 |
| G2 + G5 | 407 | 1,3 % | 279 | 63 / 2 / 342 | 30,7 % [20,9–39,8] | 38 | 142 | 110 |
| G3 + G4 | 3.877 | 12,3 % | 1.855 | 394 / 187 / 3.296 | 23,3 % [12,1–35,0] | 800 | 2.103 | 941 |
| G3 + G5 | 1.234 | 3,9 % | 572 | 80 / 6 / 1.148 | 20,5 % [9,2–34,6] | 341 | 752 | 187 |
| G4 + G5 | 586 | 1,9 % | 375 | 73 / 18 / 495 | 22,3 % [10,5–36,4] | 140 | 323 | 119 |
| drei oder mehr | 16.747 | 53,0 % | 3.371 | 2.517 / 880 / 13.350 | 28,5 % [16,5–39,5] | 2.242 | 7.106 | 3.744 |

("in bisherigem Explore": von der alten Drei-Plätze-Regel gewählt, 7.016 vor der Anzeige-Bereinigung.) Mehr als die Hälfte dessen, was Kunden bisher sahen, verfehlte drei oder mehr Leitplanken.

### Welle 3 (alle laufenden, regelkonformen Lesarten des Pools)

31.647 Lesarten auf 4.830 Titeln (aufwärts 13.141, abwärts 18.506); im oberen Viertel des Pools 2.950 auf 1.949 Titeln. Davon verfehlen drei oder mehr Leitplanken 1.088, G3 oder G4 (allein oder mit anderen) die Mehrheit; **genau eine Deutungs-Leitplanke** (G2 83, G5 37) nur 120. 209 haben keine verfehlte Leitplanke; 208 davon werden nirgends gezeigt: 130 haben keine offene Zone mehr, 47 stehen auf Titeln mit gesperrter Wertpapierart oder Datenlage, 17 auf Titeln, die bereits eine Motiv-Alternative zeigen, **14** auf Titeln, bei denen die (eingefrorene) Motiv-Alternative nur die bestplatzierte Kandidatin prüft. Die vollständige Tabelle des oberen Viertels (Symbol, Richtung, Rang, Leitplanken, Kurs, Basis/Erweitert/Extrem, Invalidation, Trend, RS26, Strukturstimme, Split-Beleg) steht in `data/wave3-top-quartile-2026-10-11.csv`.

## Wirkung der Richtlinie (Audit-Simulation, dieselbe Funktion wie im Build)

| Kennzahl | vorher (bisher) | nachher |
|---|---|---|
| Titel mit Explore bzw. Highlight | 3.747 (74,4 %) | **114 (2,3 %)** |
| Lesarten | 6.679 | **118** (1 je Titel: 110 · 2: 4) |
| Mittel je Titel mit Lesart | 1,78 | 1,04 |
| Typ | Welle 3 2.404 · Welle C 3.994 · Welle 5 281 | Welle 3 **25** · Welle C **92** · Welle 5 **1** |
| Richtung | 3.253 auf · 3.426 ab | 52 auf · 66 ab |
| verfehlt | (Mehrfach; 53 % mit drei oder mehr) | G5 72 · G2 46 (je genau eine) |
| Rang im Pool | – | ≤ 10 %: 95 · 10–25 %: 23 |
| Candidate Explorer | – | 3.801 Titel · 15.874 Einträge (1: 342 · 2: 512 · 3: 527 · 4: 526 · 5: 541 · 6: 1.353) |

Projektionsgröße der Highlights (Mitte der erweiterten Stufe, **nur beschreibend**): aufwärts < 50 % 8 · 50–100 % 13 · 100–250 % 19 · 250–500 % 7 · 500–1.000 % 3 · > 1.000 % 2; abwärts < 50 % 19 · 50–100 % 4 · 100–250 % 2 (nur Highlights mit erweiterter Stufe). Große Zahlen sind weder Grund noch Hindernis.

### Empfindlichkeit (Zählungen, nie Auswahlkriterium)

| Variante | Titel | Anteil | Highlights |
|---|---|---|---|
| Richtlinie | 114 | 2,3 % | 118 |
| Rangschwelle 10 % für alle Typen | 94 | 1,9 % | 95 |
| Rangschwelle 25 % für alle Typen | 265 | 5,3 % | 274 |
| Rangschwelle 50 % für alle Typen | 525 | 10,4 % | 578 |
| zusätzlich G2 + G5 erlaubt | 154 | 3,1 % | 165 |
| zusätzlich G4 allein erlaubt | 269 | 5,3 % | 286 |
| zusätzlich G3 allein erlaubt | 380 | 7,5 % | 401 |
| nur G5 | 72 | 1,4 % | 72 |
| nur G2 | 44 | 0,9 % | 46 |

Jede Lockerung öffnet Strukturen, die nach dem Audit mehrheitlich Rauschen oder sehr klein sind (G3/G4), oder eine zweite Deutungsunsicherheit (G2 + G5). Die Richtlinie wurde vor dieser Auswertung festgelegt und danach nicht verändert.

## Oberfläche

* **Explore Highlights** unter Primär und Alternative, nicht eingeklappt: Kopf „Explorative Elliott-Chance“, darunter „Regelkonforme alternative Lesart“, Status „Explorativ“, „Nicht als reguläre Alternative freigegeben“ mit der verfehlten Leitplanke, Rang („Rang 6 von 171 gültigen Interpretationen“, nie als Wahrscheinlichkeit), Begründung der Kuratierung, Leiter Basis/Erweitert/Extrem, Invalidation, Bestätigung, Fahrplan („Was diese Lesart stärken würde“) und „Im Chart zeigen“.
* **Candidate Explorer** nur in der Profi-Ansicht, eingeklappt: „Weitere technische Elliott-Lesarten (n)“, Karten mit Muster, Richtung, Rang, verfehlten Leitplanken mit Werten, Grund „Kein Highlight, weil …“, Invalidation, Bestätigung, Leiter und „Im Chart zeigen (nachrangig)“. Im Chart ein ausdrücklicher Hinweis auf die Nachrangigkeit.
* Es wird immer genau eine Lesart im Chart gezeigt.

## Register und Lebenszyklus

* Rollen: `EXPLORE_HIGHLIGHT` (kundensichtbar, verfolgt und registriert) und `EXPLORE_CANDIDATE` (technisch, **nicht** verfolgt, **nicht** registriert).
* Register 1.5.0: neue Kohorte `CUSTOMER_PRODUCT_EXPLORE_HIGHLIGHT`. Bestehende Ereignisse der Kohorte `CUSTOMER_PRODUCT_EXPLORE_ELLIOTT` (1.4.0) bleiben unverändert stehen; das Register wird nur angehängt (Hash-Kette, `--against-git`).
* Der Candidate Explorer wird bewusst nicht registriert: Er ist eine technische Zusatzansicht, keine Produktaussage; bis zu sechs Ereignisse je Titel ohne Produktbezug würden das Register und den Lebenszyklus-Speicher (16 MB) aufblähen. Die Register-Schnappschüsse enthalten nur die für Highlights geeigneten Kandidaten (Ergebnis identisch zur Produktrechnung, Test X-16).
* Lebenszyklus: Wird ein bisheriges Explore-Highlight (oder die breite Fassung 1.2.0) nicht mehr als Highlight gezeigt, aber weiter im Candidate Explorer geführt, entsteht in der angehängten Geschichte `ROLE_CHANGED` (von → nach `EXPLORE_CANDIDATE`), `NOT_PROMOTED` und `ARCHIVED`; nicht `RELABELLED` (die Zählung besteht ja weiter). Frühere Ereignisse und Revisionen bleiben unverändert.

## Leistung

Alles wird im Build vorberechnet (`Projection.build` je Titel). Der Browser liest nur das Ergebnis: Highlights als volle These (~5 KB), Candidate-Explorer-Einträge schlank (~1–2 KB, ohne Fahrplan und Fingerabdruck). Die Seite führt keine Kandidatensuche aus.

## Grenzen

* Die Richtlinie ist bewusst streng: 2,3 % der Titel. Die Hebel mit Zahlen stehen oben; die Entscheidung über eine Lockerung liegt beim Produkt, nicht bei Ergebnissen.
* 78 % der Highlights sind Welle C: Welle C ist 81 % des Pools. Die Priorität Welle 3 > 5 > C wirkt innerhalb eines Titels. G5 (gegen den Trend) ist für korrigierende Muster ihrer Natur nach häufig verfehlt; das ist ein Merkmal der eingefrorenen Leitplanke, nicht dieser Schicht.
* Welle-3-Lesarten ohne verfehlte Leitplanke, die nirgends erscheinen (14, siehe Audit), liegen in der eingefrorenen Motiv-Alternative (prüft nur die bestplatzierte Kandidatin). Das ist eine eigene Produktentscheidung.
* „Chance“ in „Explorative Elliott-Chance“ ist die vorgegebene Produktbezeichnung; sie meint Gelegenheit zur Beobachtung, nicht Wahrscheinlichkeit. Der Satz „Projektion ≠ Wahrscheinlichkeit“ steht auf jeder Karte.

## Wiederholung des Audits

```
node scripts/technical/build-technical-intelligence.mjs --workers 4 --out DIR --dump-candidates DUMP.jsonl
node scripts/technical/explore-curation-audit.mjs DUMP.jsonl --out AUSGABE --titles SE,OSCR,VTEX,XPEV,CGC
```

## Identitätsprüfung

`node scripts/technical/compare-identity.mjs --new <Build-Ausgabe>` vergleicht einen vollständigen Build mit den veröffentlichten Shards. Erlaubt verschieden sind nur `projection.explore*`, `exploreCandidates`, `projection.lifecycle`, `projection.relations` und `projection.version`. Alle übrigen Felder (Primär, Alternativen, Motiv-Alternative, Hochpotenzial, Formeln, Leitplanken, Kontext, Nachweise, `pro.elliott`) müssen byte-gleich sein; jede Abweichung beendet das Skript mit Fehlercode. Das Ergebnis des Laufs mit dem endgültigen Code steht im PR.

## Bekannte Eigenschaft: RS26-Rang driftet um eine Stufe

Zwischen zwei Builds weicht `context.rs.rank` bei einzelnen Titeln um genau eine Rangstufe ab (1/5.033 ≈ 0,0002; gesehen bei STHO, TSHA, UPXI und RLJ-P-A, dort auch `rankPrev`). Die Ursache liegt in `rsRanks` (`scripts/technical/lib/ti-projection.mjs`): Der Rang ist die Position nach einer Sortierung allein nach dem 26-Wochen-Ergebnis. Bei gleichem Ergebnis entscheidet die Eingabereihenfolge (stabile Sortierung), und die hängt davon ab, in welcher Reihenfolge die Worker die Titel abliefern, sowie von Kursaktualisierungen zwischen zwei Läufen. Per Titel ist das nicht nachgerechnet, weil die Eingänge nicht veröffentlicht werden.

Auswirkung: keine auf die Auswahl. Die Relative Stärke geht nicht in die Kuratierung ein (nur Anzeige und VU-Bestätigung), Primär, Alternativen und Motiv-Alternative lesen sie nicht. Sichtbar wird eine Stufe nur als vierte Nachkommastelle oder an der Grenze von „obere/untere 20 %“. Die RS-Logik wurde deshalb nicht verändert; ein Gleichstand-Schlüssel (z. B. nach Ticker) wäre eine eigene, kleine Änderung, wenn bitgleiche Läufe verlangt werden.

## Export der Welle-3-Highlights

`node scripts/technical/export-explore-highlights.mjs` schreibt `data/wave3-explore-highlights.csv` und `.json` aus den veröffentlichten Produktdaten (nur lesend, keine Auswahländerung). Sortierung: aufwärts vor abwärts, dann Pool-Rang aufsteigend, dann Rang-Anteil, dann Ticker. Das Feld „Grad“ ist der Analyse-Grad der Projektion (`ANALYSIS`); die Engine vergibt für Explore-Lesarten keinen feineren Wellengrad.

## Shard-Hygiene

Der Build schrieb nur die Shard-Schlüssel des aktuellen Laufs und räumte nie auf. Wertpapiere, die aus dem Produkt fielen (UZD, UZE, UZF: als Anleihen ausgeschlossen), ließen ihre Datei `shards/UZ.json.gz` zurück. Der Build entfernt jetzt nach einem vollständigen Lauf (ohne `--limit`/`--only`) Shards ohne Schlüssel (`scripts/technical/lib/ti-shards.mjs`); `quant/tests/ti-shard-hygiene.test.mjs` prüft, dass das veröffentlichte Verzeichnis weder verwaiste Dateien noch Titel ohne Index-Zeile enthält.

Beobachtung im Export (Stand 2026-10-09, keine Auswahländerung): 24 der 25 Lesarten haben noch mindestens die Basis-Zone offen oder in Reichweite; BUR (abwärts) hat Basis- und erweiterte Zone bereits durchlaufen, nur die Extrem-Zone ist offen. Der Zustand je Zone steht im Export (`[OPEN|INSIDE|PASSED]`).
