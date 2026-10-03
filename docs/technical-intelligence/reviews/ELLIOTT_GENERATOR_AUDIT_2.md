# Elliott-Korpus-Generatoren: Audit 2 (Mission IV)

Stand: 03.10.2026. Unabhängiger Prüfer. Geändert wurde nichts außer dieser Datei, es gibt keinen Commit.

**Gegenstand** (HEAD `e298eed22`):
- `quant/tests/elliott-corpus.mjs`
- `quant/tests/elliott-corpus-c.mjs`
- `quant/tests/elliott-corpus-c2.mjs`
- `scripts/technical/elliott-corpus-eval.mjs`

Die Generatoren wurden zuletzt in `ae51cb54d` geändert.

**Daten:**
- Seeds 0–19: DEVELOPMENT 0–9 und VALIDATION 10–19.
- Die vorhandenen VALIDATION-Zeilen `corpus/corpus-validation-layoutC*-m4-research{,-322}.json`.
- 50 echte Wochenreihen aus `discover-series-long` (Hash-Auswahl, ≥ 400 Bars).
- 120 synthetische Random Walks (GARCH).

**Kein HOLDOUT:** Seeds 40–49 und 60–79 habe ich nicht erzeugt.

**Skripte:** Die Prüfskripte waren Wegwerfdateien im Session-Scratchpad. Ablationen liefen mit
`elliott-corpus-eval.mjs --v3 --split DEVELOPMENT --stages C_LATE --noise none,low --no-write`.

## 1. Wurden die Befunde aus Audit 1 behoben? (am Code geprüft)

| Audit 1 | Stand im Code | Messung jetzt (Rauschen none, wenn nicht anders angegeben) |
|---|---|---|
| H1: Unterwellen auf die Nettobewegung skaliert | **offen**. `build()` in `elliott-corpus.mjs:153-156` ist unverändert, C1/C3 rufen es in `elliott-corpus-c.mjs:101` auf | Wahrheitspivot nicht Extrem seiner Welle: A 93/320 (29,1 %), C1/C3 109/320 (34,1 %), C2 0/320 |
| H2: Negativfälle verletzen zwei Regeln | **offen** in `negImpulse` (`elliott-corpus.mjs:100-105`). Nur umgangen: G15 zählt nur C2 | mehr als eine Verletzung: A 19/60, C1/C3 23/60, C2 0/60 |
| H3: C2 schneidet am frischen Extrem | **behoben** (`c2:558-562`, Schnitt nach Zeit) | letzter Bar ist Extrem der Bestätigung: C2 34 % (C_EARLY) bzw. 47 % (C_LATE), vorher 100 %; C1 30–38 % |
| H4: Sprünge im Muster ohne Neu-Labeling (C1/C3) | **offen** (`elliott-corpus-c.mjs:149`). Nur über `gateObservable` umgangen | beobachtbare Wahrheit ungültig bei low: C1 37,5 %, C3 30,9 %, C2 20,0 % |
| M1: Rauschen mean-revertierend | **offen**: OU θ = 0,2 (`c.mjs:148,198`), C2 AR(1) im Fenster (`c2:523`) | siehe §3 |
| M3: C2-Flat mit B < 90 % | **behoben** (`c2:274,477`) | 0/20 mit B/A < 0,9 im Preisraum |
| M4: A/B-Skelett hängt vom Rauschen ab; C2 zieht bei low neu | A/B **offen** (`elliott-corpus.mjs:172`). C2-Neuziehung **entfernt** (`c2:543`) | – |
| M5: WXY/TZZ nie beobachtbar gültig | **teilweise behoben**, jetzt aber zirkulär (siehe §4) | WXY 20/20, TZZ 20/20 gültig (alle Layouts) |
| M6: Wahrheit in den P-Stufen | **teilweise behoben**: Regel „Folgewelle ≥ 25 % der Dauer“ (`eval:27`). Keine Mindest-Retracement-Regel. C2 `truth.completedWaves` ist weiterhin inkonsistent (38–42 Fälle bei P60, nur Diagnose) | P75: laufende Welle < 23,6 % der vorigen bei 47 % (C1/C3) und 40 % (C2) |
| M7: C1-Bestätigung als Flat | **offen** (`c.mjs:112`) | C_LATE: Musterende vor dem Schnitt überschritten in 6,3 % der Fälle |
| L1: Knotenkollisionen | **offen** (`c.mjs:120,124`) | – |
| Red-Team H4: `originOk`-Neuziehung in C2 | **behoben** (entfernt). Die Skelettbedingung bleibt bestehen: Ursprung ist Extrem über ±Dauer W1 (`c2:446`, `c.mjs:126-130`) | siehe §2 |

**Fazit:** Behoben sind nur die C2-Punkte und der Auswerter. Die strukturellen Mängel von A, B, C1 und C3 (H1, H2, H4,
M1, M7) sind unverändert und werden nur in der Auswertung umgangen. Die Korrekturen am „unabhängigen“ C2 stammen aus
derselben Session und demselben Commit wie die Engine-Fixes (`ae51cb54d`). Seitdem übernimmt C2 die Klassengrenzen der
Engine fast wörtlich: Flat-B 0,90 und Grenze regulär/expandiert 1,05–1,06 (`c2:477` gegenüber `patterns.js` `flatVariant`).
Die Unabhängigkeit von C2 ist damit weiter geschwächt.

## 2. Kopplung zwischen Generator und Engine

Ablation auf DEVELOPMENT, C_LATE, Rauschen none+low, 320 positive Fälle je Layout. Gemessen wird der Anteil, in dem die
Hauptzählung stimmt (strikt).

| Engine-Variante | C1 | C2 |
|---|---|---|
| Standard (3.2.2) | 30,9 % | 55,9 % |
| ohne Fibonacci-Richtlinien (`guidelines` 0) | 30,0 % | 53,8 % |
| Typ-Prior flach (alle 0,8) | 31,9 % | 54,7 % |
| ohne `anchor` und `dominance` | 28,4 % | **40,0 %** |
| ohne `subdivision` | **1,9 %** | **2,5 %** |

- **K1 (HIGH): Unterteilung.** Die Generatoren erzeugen genau eine Unterebene als stückweise lineare Strecken. Die
  Engine klassifiziert diese Unterebene mit demselben Zigzag-Schwellenverfahren (`classifySegment`), das auch die
  beobachtbare Wahrheit benutzt.
  - Bei Rauschen none werden 98–100 % der Motiv- und Korrekturwellen richtig gelesen (A, C1, C2, C3).
  - Die Erkennungsleistung hängt fast vollständig davon ab: ohne Unterteilung 2–3 %.
  - Die Unterwellen dauern nur 2–3 Bars. Schon bei low kippt die Lesung asymmetrisch: Motivwellen werden in C1 zu 36 %,
    in C3 zu 35 % und in C2 zu 20 % als Korrektur gelesen, Korrekturwellen dagegen nur zu 0–3 % als Motiv. Bei medium
    sind es 39–50 % gegenüber 3–7 %.
  - Der Korpus misst bei none also vor allem, ob die Engine die eigene Generator-Grammatik wiederfindet. Bei Rauschen
    misst er, wie schnell 5er-Unterteilungen verschwinden.
- **K2 (HIGH für C2, LOW für C1): Ursprung als Extrem.** Beide Generatoren erzwingen das Ursprungsextrem auf dem Skelett.
  C2 erzwingt zusätzlich, dass jedes Wellenende das strikte Extrem seiner Welle ist (`c2:447-450`). Ohne die passenden
  Engine-Priors fällt C2 um 15,9 Prozentpunkte, C1 nur um 2,5. Der Abstand zwischen C2 und C1 (56 gegen 31 %) ist daher
  zum großen Teil ein Generator-Effekt und keine Fähigkeit der Engine.
- **K3 (LOW): Fibonacci-Verhältnisse.** Die Ziehbereiche überlappen die Idealbänder der Engine, etwa W2 0,382–0,786
  gegen 0,5–0,618 oder Zigzag-B 0,382–0,8 gegen 0,382–0,786. Das Richtliniengewicht ist aber klein (0,06). Die Ablation
  kostet nur 0,9 bzw. 2,1 Prozentpunkte, die Inflation ist also gering.
- **K4 (MEDIUM): Pivots.** Die Engine nutzt Close-only-Pivots mit ATR-Schwelle. Die Generatoren legen ihre Pivots exakt
  auf monotone Knotensegmente. Bei none sind die Pivots damit trivial auffindbar; reale Charts haben diese Eigenschaft
  nicht.

## 3. Wie realistisch ist das Rauschen?

Mediane, Seeds 0–9, alle Klassen. „Rauschen“ ist log(Kurs mit Rauschen) − log(Kurs ohne Rauschen); das Skelett ist je
Fall fest.

| Statistik | echt, volle Historie (50) | echt, letzte 300 Wochen | C1-Rauschen (medium) | C3-Rauschen | C2-Rauschen gesamt | C2 im Musterfenster |
|---|---|---|---|---|---|---|
| sd je Woche | 6,8 % | 5,9 % | 2,9 % | 2,7 % | 2,4 % | 2,3 % |
| Exzess-Kurtosis | 5,3 | 2,0 | 6,1 | 2,1 | 4,8 | 2,7 |
| AC(1) der Renditen | −0,05 | −0,04 | −0,11 | −0,11 | +0,01 | −0,05 |
| AC(1) von \|r\| (Cluster) | 0,19 | 0,07 | 0,19 | 0,16 | 0,13 | 0,07 |
| Varianzverhältnis 13 | 0,84 | 0,75 | 0,37 | 0,35 | 0,75 | 0,36 |
| Varianzverhältnis 52 | 0,80 | 0,61 | **0,12** | **0,07** | 0,43 | **0,07** |

- **R1 (HIGH): Das Rauschen ist im Muster stationär** (M1 aus Audit 1, unverändert).
  - Das Varianzverhältnis über 52 Wochen liegt im Musterfenster bei 0,07–0,12, real bei 0,61–0,80.
  - C2 ist im Fenster 2,3-mal ruhiger als davor: Niveau-sd 0,0138 gegen 0,0312 bei low, 0,0337 gegen 0,0778 bei medium.
  - C3 nutzt echte Renditen, schickt sie aber durch einen OU-Filter und verliert so deren Persistenz.
  - Folge: Rauschen erzeugt nie konkurrierende Trends vom Grad des Ziels.
- **R2 (MEDIUM): Rauschstärke.** Erst „high“ (noise-only 4,3–5,3 %) entspricht einer typischen Aktie. „low“ und „medium“
  sind idealisiert. Die Gates G2–G8 messen auf none/low/medium, also unterhalb realer Volatilität.
- **R3 (LOW):** Kurtosis und Cluster liegen in der richtigen Größenordnung. C1 ist leicht überdifferenziert (AC(1) −0,11).

## 4. Wahrheitsdefinition

- **W1 (HIGH): Die beobachtbare Wahrheit ist weiterhin selektionsverzerrt und jetzt auch zirkulär.** Daten: VALIDATION,
  3.2.2, abgeschlossene Stufen.
  - Auf den ausgeschlossenen Fällen trifft die Hauptzählung in 0,0–0,7 % (alle Layouts und Stufen).
  - Auf den gültigen Fällen ist strikt ≈ beobachtbar, zum Beispiel C2 low 56,3 gegen 56,6 %.
  - Der Gewinn entsteht also nur über den Nenner. Der gültige Anteil fällt mit dem Rauschen: C1 98 / 62 / 39 / 19 %,
    C2 100 / 80 / 56 / 34 % (none / low / medium / high).
  - Seit dem Fix für M5 entscheidet `EV3.classifySegment` (`eval:102-105`), also der Unterteilungsklassifikator der
    Engine selbst, ob WXY/TZZ-Wahrheiten gültig sind. Fälle, deren Unterteilung die Engine nicht sieht, werden damit
    per Konstruktion ausgeschlossen.
  - Der Klassenmix verschiebt sich: gültig sind bei n/l/m z. B. C1 DZZ 87 % und WXY 83 %, aber Ending Diagonal 40 % und
    IMPULSE_EXT1 43 %.
- **W2 (MEDIUM): Laufende Stufen haben keine Beobachtbarkeitsprüfung.** `observableTruth` gibt für `mid` `null` zurück
  (`eval:98`). Laufende Wahrheiten zählen also auch dann, wenn das Muster im Kursbild nicht mehr sichtbar ist.
- **W3 (MEDIUM): Die P-Stufen sind Zeitbruchteile, keine Wellenstadien.**
  - P60 enthält nur 5-Wellen-Klassen (200/320, keine 3-Leg-Klasse).
  - Bei P75 gilt eine Welle in 40–47 % der Fälle als abgeschlossen, obwohl die Folgewelle weniger als 23,6 % davon
    zurückgelaufen ist.
  - Für 8,1 % (C1) bzw. 8,3 % (C2) der laufenden VALIDATION-Fälle ist der sichtbare Präfix per Konstruktion ein gültiger
    abgeschlossener W-X-Y: Ending Diagonal (3-3-3-3-3), Triple Zigzag und kontrahierendes Dreieck mit drei
    abgeschlossenen Wellen. Das Label „läuft noch“ ist in diesen Fällen aus den Daten nicht identifizierbar.
- **W4 (MEDIUM): WXY und DOUBLE_ZIGZAG sind nicht disjunkt.**
  - Wahrheit DZZ erwartet `["DOUBLE_ZIGZAG","WXY"]`, Wahrheit WXY erwartet `["WXY"]`.
  - Die WXY-Regeln der Engine verlangen nur „W und Y korrektiv“ und X < 100 %. WXY ist damit die Obermenge von Double
    Three und Double Zigzag.
  - Eine Engine-Antwort DOUBLE_ZIGZAG (7 Legs, 8 Punkte) kann gegen eine 3-Leg-Wahrheit nie EXACT sein, nur NESTED.
  - Die Gültigkeit von DZZ prüft in `observableTruth` mit 3 Legs faktisch die Zigzag-Regeln auf W-X-Y.
  - Folge: Die Engine wird für die unspezifischste Antwort (WXY) belohnt, für die spezifischere (DZZ) nicht.

## 5. Laufende Muster als abgeschlossenes WXY mit Sicherheit: Generator oder Engine?

Grundlage sind die 137 Fälle aus 3.2.1 auf VALIDATION: laufende Stufe, Hauptzählung WXY(C), Anwendbarkeit HOCH oder
MITTEL (C1 53, C2 42, C3 42). Ich habe sie neu gerechnet; die Zählung ist in 3.2.2 unverändert.

1. **Rauschen none: 20/20 sind Generator- bzw. Label-Artefakte.**
   - Alle 20 Fälle sind ENDING_DIAGONAL oder TRIPLE_ZIGZAG mit drei oder vier abgeschlossenen Wellen.
   - Die WXY-Zählung trifft exakt die Wahrheitspivots 0–3.
   - Die sichtbare Unterteilung stimmt mit der erwarteten überein (KKK, 20/20).
   - Ein 3-3-3-Präfix mit W3 jenseits von W1 *ist* ein regelkonformer W-X-Y. Die laufende vierte Welle (Retracement
     0,23–0,54) ist zugleich die Bestätigung.
   - Bei Rauschen none wurde kein einziger laufender Impuls (Unterteilung 5-3-5) sicher als WXY gelesen.
2. **Mit Rauschen: 117 Fälle, überwiegend ein Engine-Defekt, verstärkt durch den Generator.**
   - 100 der 137 Zählungen liegen nicht auf den Wahrheitspivots. 79 davon beginnen vor dem Ursprung und enden vor der
     letzten abgeschlossenen Welle. Die Engine liest eine andere Struktur aus Kontext und Musteranfang.
   - Bei den Impulsklassen ist in 37 von 39 Fällen die wahre Unterteilung im Kursbild nicht mehr sichtbar (siehe K1).
   - **Ursache auf Engine-Seite: WXY wirkt als Attraktor für Rauschen.** Mit 3.2.1-Verhalten (`capPatterns` leer):
     - Auf 120 reinen GARCH-Random-Walks ist die Hauptzählung in 45 % der Fälle WXY.
     - Auf 59 echten Reihen (letzte 300 Wochen) sind es 46 %.
     - Bei hohem Rauschen wählt die Engine WXY in 38–52 % der abgeschlossenen Fälle, unabhängig von der wahren Klasse
       (Motiv, Zigzag/Flat, Dreieck, Kombination).
   - Das Anwendbarkeitsmodell ist nur auf abgeschlossenen Mustern geeicht (`elliott-v3.js:76`). Die Sicherheit auf
     laufenden Fällen liegt daher außerhalb der Eichverteilung.
   - Der Generator verstärkt das: Unterwellen von 2–3 Bars, Motivwellen kippen asymmetrisch zu K, und es gibt keine
     Beobachtbarkeitsprüfung (W2).
3. **Urteil: überwiegend Engine-Defekt.**
   - Engine-Defekt: Die WXY-Definition ist zu schwach und die Sicherheit ist nicht kalibriert. Die Kappe
     `capPatterns:["WXY"]` behandelt nur das Symptom.
   - Etwa 15 % (20/137) sind echte, per Konstruktion unentscheidbare Präfixe. Dort ist die Zählung legitim; falsch ist
     nur die Sicherheit.
   - Die übrigen 85 % sind Lesungen von Rauschen, bei denen die Wahrheit im Kursbild oft nicht mehr existiert. Dass dort
     etwas anderes als „unsicher“ ausgegeben wurde, ist der Engine-Fehler.

## 6. Befundliste

| # | Klasse | Befund |
|---|---|---|
| K1 | HIGH | Die Unterteilung ist generator-engine-gekoppelt (98–100 % lesbar bei none; ohne sie 2–3 % Treffer). Asymmetrischer Kollaps M→K unter Rauschen |
| R1 | HIGH | Das Rauschen im Musterfenster ist stationär (Varianzverhältnis 52: 0,07–0,12 gegen 0,61–0,80 real). C2 ist im Fenster 2,3-mal ruhiger |
| W1 | HIGH | Die beobachtbare Wahrheit wählt die Treffer aus (0–0,7 % Treffer auf ausgeschlossenen Fällen) und nutzt den Klassifikator der Engine |
| A1 | HIGH | Audit-1-Befunde H1, H2, H4, M1 und M7 sind in A/B/C1/C3 nicht behoben, nur in der Auswertung umgangen |
| K2 | HIGH (C2) | Das Ursprungs- und Endpunkt-Extrem in C2 passt zu den Priors `anchor`/`dominance` der Engine (−15,9 Punkte bei Ablation) |
| X1 | HIGH (Engine) | WXY ist ein Attraktor für Rauschen (45 % auf Random Walks und echten Reihen). Die Sicherheit auf laufenden Fällen ist nicht kalibriert |
| W2–W4 | MEDIUM | Laufende Stufen ohne Beobachtbarkeit, P-Schnitte nach Zeit, 8 % unentscheidbare Präfixe, WXY/DZZ nicht disjunkt |
| R2, K4 | MEDIUM | Nur „high“ hat reale Volatilität; die Pivots liegen exakt auf Knoten |
| I1 | MEDIUM | Die C2-Korrekturen kommen aus derselben Session wie die Engine-Fixes und übernehmen deren Klassengrenzen; C2 ist kaum noch unabhängig |
| K3, R3, M6-Rest, L1 | LOW | Fibonacci-Kopplung gering (≤ 2,1 Punkte), Kurtosis plausibel, C2-Wahrheitsfelder inkonsistent (nur Diagnose), Knotenkollisionen |

## 7. Urteil

**Als Qualitäts-Gate für fachliche Elliott-Qualität ist der Korpus nicht geeignet.** Als Regressions- und
Plausibilitätstest bleibt er brauchbar: harte Regeln (G1), Determinismus, grobe Rückschritte, Negativfälle aus C2.

Begründung:
- Bei none misst er die Rückgewinnung der eigenen Grammatik.
- Mit Rauschen misst er vor allem, wie schnell 2–3-Bar-Unterwellen zerfallen.
- Die beobachtbare Korrektur entfernt genau die Fehlschläge.
- Die Spanne der Layouts (C1 31 % gegen C2 56 % bei sonst gleichen Bedingungen) zeigt: Das Ergebnis hängt stärker vom
  Generator als von der Engine ab.

**Mit Code-Arbeit behebbar:**
- extremtreue Skelette (H1)
- saubere Negativfälle (H2)
- integriertes Rauschen, gleich innerhalb und außerhalb des Fensters (R1)
- Unterwellen mit realistischer Dauer
- P-Stufen nach Wellenstadium
- unabhängiger Gültigkeitsprüfer ohne `classifySegment`
- WXY und DZZ disjunkt definieren
- Beobachtbarkeitsprüfung für laufende Stufen

**Ohne externe Daten oder Experten strukturell nicht behebbar:**
1. Ob echte Märkte überhaupt der Generator-Grammatik folgen: Klassenhäufigkeiten, Proportionen, Unterteilungstiefe.
2. Die Basisraten, die eine kalibrierte Sicherheit bei unentscheidbaren Präfixen erst definieren (laufende ED/TZZ/Dreieck
   gegen abgeschlossenes WXY).
3. Eine Wahrheit, die nicht vom Klassifikator der Engine abhängt. Dafür braucht es unabhängige, doppelt annotierte
   Experten-Labels auf echten Charts (Workbench: Status BLOCKED).
4. Echte Unabhängigkeit des Generators: ein Autor ohne Kenntnis von Engine, Audit-Befunden und Klassengrenzen.
