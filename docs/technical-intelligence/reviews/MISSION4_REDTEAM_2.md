# Mission IV – Red Team 2 (adversarial)

Stand 03.10.2026, HEAD `642d564b6`. Geprüft wurden die Behauptungen und Entscheidungen, nicht der Stil. Nichts geändert außer dieser Datei, kein Commit. Kleine Prüfskripte lagen im Session-Scratchpad. Den laufenden Evidenz- und Produktneubau habe ich nicht angefasst.

## Ergebnis

1 CRITICAL, 3 HIGH, 5 MEDIUM, 4 LOW. Die Matrixzeile „Unmögliche Kursniveaus: DONE“ und die Aussage „3.2.2 = nur weniger Aussagen“ halten in der jetzigen Form nicht.

## CRITICAL

**C1 – Tote Kursreihen (übernommen, delistet, Handel ausgesetzt) erzeugen live Szenarien mit absurdem Chance/Risiko-Verhältnis.**
- Umfang: 245 von 5.292 Wochenreihen haben ≥ 6 identische Schlusskurse am Ende (z. B. ANSS, AL, ALPN, ADVM, VLCN, ALE).
- Bei flacher Reihe kollabiert die ATR. Die Invalidation rückt deshalb direkt an den Kurs, und die Rendite-Risiko-Zahl explodiert.
- Repro mit ti-scenario-**1.1.1**, also dem aktuellen Code:
  - ALPN: Ziel 457 bei Kurs 65 (Faktor 7), Chance/Risiko **392 : 1**
  - AL: 38 : 1
  - ANSS: 19 : 1
- Im veröffentlichten Index: `rr > 10` bei 156 Zeilen, `rr > 5` bei 461 Zeilen.
- Das Chartbild zeigt dazu „Chance gegen Risiko ≈ … : 1“ (`page-chartbild.js:94`). Als `asOf` erscheint das Lieferdatum, nicht der letzte echte Handelstag. `dataQuality` meldet nichts.
- Weder die Faktor-10-Grenze noch der ATR-Deckel greifen hier.
- Fix: Reihen mit eingefrorenem Kurs (k Wochen ohne Änderung) auf `NO_SCENARIO`/`STALE` setzen. Eine Untergrenze für die ATR einführen (z. B. Median-ATR der letzten 52 Bars). `rr` deckeln oder ausblenden.

## HIGH

**H1 – Enthaltung wird im Szenario umgangen. „3.2.2 senkt nur Aussagen“ stimmt auf Produktebene nicht.**
`scenario.js` liest an keiner Stelle `applicability`. Die enthaltene Hauptzählung wirkt trotzdem weiter:
- Sie liefert die Einstiegskandidaten `ELLIOTT_COMPLETION` mit Gewicht 1,0, dem höchsten aller Kandidaten (`:165`).
- Sie liefert die Invalidation `ELLIOTT_RULE` mit Vorrang (`:187, :200`) und Ziele `ELLIOTT_TARGET` (`:210`).
- Sie bestimmt das Template `PULLBACK`.
- Sie erzeugt den Text „Erwartete Struktur: …“ (`:257`), den `page-chartbild.js:91` auf jeder Szenariokarte anzeigt.

Daneben steht in der UI: „Vision Universe zeigt hier bewusst keine Wellen“.

Repro mit 41 Kollaps- bzw. Penny-Titeln, davon 39 enthalten:
- 76 Szenarien tragen Elliott-Strukturtext, z. B. ACON „Nach abgeschlossenem Doppelte Korrektur (W-X-Y) beginnt eine neue Bewegung abwärts“ bei Anwendbarkeit LOW.
- 12 Szenarien sind `elliottShaped`.
- 33 Texte widersprechen der Richtung ihres Szenarios: Die bullishe Alternative trägt „… abwärts“ (WHLR, DCX, PAVS, TRNR, HOLO).

Der WXY-Deckel ändert deshalb am Szenario nichts. Die Abwahl wirkt nur auf das Etikett. Die Methodik nennt Elliott „Konfluenzgewicht 0“ und verschweigt dabei, dass Elliott die Kursniveaus formt. Das Statistik-Audit §1.4 räumt das ein, Matrix und Kurzlimits tun es nicht.

**H2 – Einstiegszonen bis +100 % vom Kurs bleiben möglich.**
- Mechanik: Der ATR-Deckel liegt bei 25 % des Kurses, `entry.maxDistanceAtr` bei 4. Zusammen erlauben sie eine Einstiegszone bis zum Zweifachen des Kurses bzw. nahe 0.
- Repro mit 1.1.1: VLCN, Kurs 10,57 (eingefroren), bearishe Einstiegszone 16,30–18,00 (+54–70 %), Ziel 3,7. Alternative: Einstieg 3,70–5,35, Invalidation 0,13 (−99 %).
- Im veröffentlichten Index liegt die Einstiegszone bei 222 Zeilen mehr als 40 % vom Kurs entfernt, z. B. AEHL 7,63 → 29–34,6. Das sind noch 1.1.0-Daten.
- Alternativziele bis Faktor 9,9 (HCTI 0,74 → 7,35; ZNB 9,5×; CHSN 9,3×).
- Faktor 10 ist eine Grenze für „unmöglich“, aber keine für „plausibel“.

**H3 – 3.2.2 ist eine Engine-Änderung nach dem Holdout, die gegen die eigene Präregistrierung verstößt. Ihr Nutzen ist nur in-sample belegt.**
- `ELLIOTT_HOLDOUT3_PREREG.md:74` legt fest: „Keine Änderung an Engine … nach Schritt 2 … eine neue Engine braucht einen neuen Holdout.“
- 3.2.2 verändert eine gegatete Größe, nämlich D2 („laufende Muster mit HOCH“). Ausgewählt und gemessen wurde auf demselben VALIDATION-Split: 84,2 → 89,0 %, 182 → 45.
- Ohne HOLDOUT-4 bleibt die Verbesserung unbelegt. Die Holdout-Seeds 60–79 sind noch unberührt, ein gezielter Test nur dieser Kennzahl wäre billig. „HOLDOUT-4 wäre vorhersehbar FAIL“ begründet nur den Verzicht auf ein Gesamt-Gate, nicht den Verzicht auf diesen Test.
- Der Deckel opfert 96 richtige abgeschlossene WXY, um 170 falsche zu entfernen.
- Das analoge `TRIPLE_ZIGZAG` bleibt ungedeckelt. Repro: HCTI, `TRIPLE_ZIGZAG:done`, Anwendbarkeit **HIGH**.
- `methodology/index.html:169` schreibt „seit Mission III elliott-3.2.2 … hat HOLDOUT-3 NICHT bestanden“. Tatsächlich ist 3.2.2 aus Mission IV und wurde nie auf HOLDOUT-3 gerechnet.

## MEDIUM

**M1 – TIMING_EARLY „Bestätigt / VALIDATED“ stammt von Engine 2.2.**
- Quelle: `report-confirmatory-v22-sticky.json`, `meta.engine = elliott-2.2.0`.
- Unter 3.x gibt es kaum noch laufende Impulse (W3: n = 3 statt 14.160, Statistik-Audit §4b). Die H6-Bedingung, also späte Bestätigung durch die Engine, ist für das Produkt nicht neu gemessen.
- Statistisch ist die Bestätigung in Ordnung: Cluster nach Titel und Jahr, Holm. Sie gilt aber für eine abgelöste Engine.
- Die Karte `elliottValidationCard` folgert daraus „Ein Prognosevorteil wird nur behauptet, wenn er hier bestätigt ist“ und dazu „Wer früh … einsteigt, lag historisch besser“. Das ist Handlungssprache.
- Empfehlung: Kennzeichnen als „bestätigt für Engine 2.2, nicht für 3.2.2“.

**M2 – Evidenz und Produkt laufen erneut auseinander.**
- Die Evidenz ist auf `ti-scenario-1.1.0` gerechnet, das Produkt und der Code auf 1.1.1, mit geänderter Geometrie bei Titeln mit hoher Volatilität.
- Der veröffentlichte Index ist ebenfalls 1.1.0 und widerspricht damit dem aktuellen Code.
- Das wiederholt genau Befund 4 des Statistik-Audits.
- Außerdem fallen durch „kein Szenario bei ≤ 0“ und die Grenzen 1.242 Signale weg (110.631 → 109.389). Diese Signale stammen selektiv aus Kollapsfällen, ihre Ergebnisse sind nicht ausgewiesen.
- Bedingung für DONE: Evidenzlauf auf 1.1.1 und Tabelle der entfallenen Signale samt Ergebnis.
- Ein Tuning am TEST sehe ich nicht. Die Änderungen sind durch Fehler motiviert, nicht durch TEST-Ergebnisse. Der vierte Blick bleibt offengelegt.

**M3 – Mehrzeitebenen-Audit: Die Kennzahl ist nicht robust spezifiziert. G13 wird dadurch aber nicht schöngerechnet.**
- 70 % der Wochenzählungen sind abgeschlossene Muster. Dort vergleicht `compat` mit der Richtung der letzten Welle (`wDir`), obwohl das Tagesmuster nach dem Ende im `nextMove` liegt.
- Nachrechnung auf den m4-audit-Zeilen:
  - Referenz `nextMove`: 40–44 %, also unter der Permutationsbasis.
  - Nur verschachtelte Paare: 63–69 %.
  - Berichtet: 52–59 %.
- Weitere Schwächen:
  - n ≈ 80 je Split, ohne Konfidenzintervall. ±5,5 Pp. Standardfehler machen 52 gegen 50 % ununterscheidbar.
  - `whenBothApplicable n = 0`: Gemessen wird nur, was das Produkt gar nicht zeigt.
  - Gerechnet mit elliott-3.2.1.
- Das Urteil „schwach“ bleibt richtig. Die Zahl „52–59 %“ sollte aber mit Spezifikationsspanne berichtet werden.

**M4 – „Chance gegen Risiko ≈ x : 1“ fehlt im regulatorischen Sprachaudit.**
Die Angabe ist die handlungsnächste Größe im Produkt (Trade-Metrik), wird aber in `REGULATORY_LANGUAGE_AUDIT.md` nicht genannt. Dasselbe gilt für „Erwartete Struktur“ (siehe H1).

**M5 – Strukturelle Konfidenz nutzt `clarityLevel`, nicht die Anwendbarkeit.**
- `scenario.js:328` setzt `structuralLevel` aus `clarityLevel`.
- Eine enthaltene Zählung kann deshalb „strukturell HIGH“ zur Gesamtkonfidenz beitragen. Beispiele: HOLO und SUNE mit `clarity` HIGH bei Anwendbarkeit LOW.
- Heute begrenzt `NO_HISTORICAL_EDGE` das Ergebnis. Das ist aber eine Abhängigkeit, die die Enthaltung bricht.

## LOW

- **L1 – Cluster-KI (`twoWayBoot`).** Die CGM-Umsetzung ist korrekt: V_Titel + V_Zeit − V_Zelle als Bootstrap-Analog, mit Untergrenze max(V_Titel, V_Zeit). Die Regel „breitestes Intervall“ ist konservativ und kein p-Hacking. Inkonsistent ist nur zweierlei: Perzentil-KI (SYMBOL/TIME) werden mit Normal-KI (TWO_WAY) verglichen, und der p-Wert kommt aus dem SE des gewählten Schemas. Mit 31 Quartalen und überlappenden Fenstern ist das Intervall eher zu schmal; das ist offengelegt.
- **L2 – Kennzeichnung PREREGISTERED / DESCRIPTIVE / EXPLORATORY.** Sie ist plausibel. `PREREGISTERED_PRODUCT_LOOKUP` ist gepoolt über TRAIN+VAL+TEST und deshalb kein Test. Das ist benannt.
- **L3 – Matrix.**
  - „Earnings-Hinweis BLOCKED“: Für Titel mit SEC-Daten (`quant/data/sec`, Filing-Rhythmus 10-Q/10-K) ist ein Näherungshinweis intern möglich, also eher PARTIAL.
  - „Tagesstudie BLOCKED“: Die Ursache ist eine Owner-Aktion (Merge), keine externe Abhängigkeit.
  - FIBONACCI meldet „Verhältnis ≈ 1“, obwohl 50 % mit q = 0,008 signifikant ist (1,05).
- **L4 –** `riskAtr` und der Text „±0,5 ATR“ beziehen sich nach 1.1.1 auf die gedeckelte ATR, ohne dass das markiert ist.

## Ohne Befund

- Keine Behauptung „Elliott automatisiert“ und keine Expertenvalidierung in App, Ask, Discover, Screener oder Methodik (grep).
- „Kein 3.3“ ist ehrlich begründet, weil Muster, Grad und Rauschen ohne Gewinn blieben. Kritik dazu siehe H3.
- Generator-Audit 2 und Code-Review werden korrekt zitiert.

## Repro (Kurzform)

```
node --input-type=module -e 'import fs from "fs";import{analyzeProduct,PRODUCT_METHODOLOGY}from"./scripts/technical/lib/ti-product.mjs";import{weeklySeriesFromPoints}from"./scripts/technical/lib/ti-data.mjs";for(const t of["ALPN","VLCN","ACON","HCTI"]){const j=JSON.parse(fs.readFileSync("quant/data/market/discover-series-long/ref_"+t+".json"));const s=weeklySeriesFromPoints(j.points,t);const{res}=analyzeProduct(s,{symbol:t,methodology:PRODUCT_METHODOLOGY});const p=res.scenarios[0],E=res.methods.elliott;console.log(t,s.close[s.length-1],E.primary.pattern,E.applicability.level,p.entryZone&&[p.entryZone.zoneLow,p.entryZone.zoneHigh],p.rewardRiskT1,p.expectedStructure)}'
```
