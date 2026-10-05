# Turtle-Regelwerk R15 (turtle-canonical-1.0.0)

Geprüft: DONCHIAN_TURTLE 2.0.2 (live; = 2.0.0-Signale/-Portfolio ohne Marktampel), Forschung 2.1.0 (Stärke-Rang) und 2.0.1 (Marktampel, zurückgenommen).
Quelle: *The Original Turtle Trading Rules* (tradingblox-PDF, Scan, 27 Seiten). In R15 wurden die Seitenbilder gelesen; Seitenangaben beziehen sich auf die gedruckten Seitenzahlen 7–33. Faith, *Way of the Turtle*, diente nur als Ergänzung (MEDIUM). Maschinenlesbar: `rulebook-TURTLE.json`.

## 1. Original: Turtle Futures (kanonisch)
| Bereich | Regel | S. | 2.0.2 |
|---|---|---|---|
| Märkte | ~20 liquide US-Futures (Zinsen, Währungen, Softs, Metalle, Energie, S&P-Future), ohne Getreide und Fleisch | 10–11 | **fremd** (US-Aktien) |
| N | EMA 19/20 der True Range, Start mit dem 20-Tage-Mittel | 13 | exakt |
| Unit | 1 % des Kontos / (N × $ je Punkt), Wochenblatt | 14–15 | Formel exakt |
| Grenzen | 4 je Markt, 6 eng / 10 lose korreliert, 12 je Richtung | 16 | nur „12 Titel“, bindet nie |
| Notionelles Konto | −20 % je 10 % Verlust (Beispiel: 1 Mio → 800k → 640k nach weiteren 80k) | 17 | beispielgetreu |
| Systeme | S1 20/10, S2 55/20, Kapitalaufteilung frei | 18 | nur S1 (zulässig) |
| Einstieg | intraday am Ausbruch, bei Gap zur Eröffnung | 18 | exakt (Kauf-Stop) |
| S1-Filter | Ausbruch auslassen, wenn der letzte ein Gewinner gewesen wäre; **Richtung egal** | 19 | nur Long-Ausbrüche |
| Failsafe | 55-Tage-Ausbruch nach ausgelassenem Signal | 19 | ja, Ausstieg nach S1 (Interpretation) |
| Aufstocken | ½ N vom letzten Fill bis 4 Units | 19–20 | **fehlt** |
| Konsistenz | jedes Signal nehmen | 20 | **verletzt** (Lebenszyklus, Cash) |
| Stop | 2N, max. 2 % Risiko; ältere Stops beim Aufstocken um ½ N anheben | 21–23 | 2N ja, Nachzug entfällt |
| Whipsaw | ½-N-Stop als Option | 23–24 | entfällt (optional) |
| Ausstieg | S1 10-Tage-, S2 20-Tage-Extrem, alle Units | 26 | S1 exakt |
| Gleichzeitig | Signale nehmen, wie sie kommen; sonst **die stärksten**: (C − C[3 Mon.])/N | 28–29 | **alphabetisch** |
| Long/Short | beide Seiten symmetrisch | 16, 19 | nur Long |
| Markt/Fundamental | keine Regeln | – | treu |

## 2. Was an Futures hängt
- **Unit = 1 %/N:** Bei Futures ist das ein kleiner Margin-Anteil. Bei Aktien ist es Kassa-Nominal von 1 %/(N/Kurs) des Kontos. Live liegen die Gewichte etwa zwischen einem Fünftel und einem Drittel. Synthetisch nachgerechnet: bei N/Kurs 1,35 % ergibt sich **74,1 %** (entspricht dem DESP-Fall aus R14). Ohne Hebel passen nur 2–5 Units.
- **4/6/10/12 Units:** setzen ~20 unkorrelierte Märkte voraus. Alle US-Aktien bilden mindestens eine lose korrelierte Gruppe; nach der Logik des Originals wären es also ≤ 10 Units.
- **Aufstocken und Stop-Nachzug:** brauchen Nominalspielraum. Mit einer kleineren Unit geht das auch ohne Hebel. Die Aussage in process-chain.mjs:70 („nicht abbildbar“) ist deshalb zu stark.
- **Short:** Bei Aktien kommen Leihe, Locate und Dividendenausgleich hinzu. Long-only verändert auch den S1-Filter.
- **Rollen:** entfällt bei Aktien. An seine Stelle treten Übernahme-, Delisting- und Gap-Risiken. Der ADR-Filter von 1 % schützt nicht vor Riesen-Units.
- **Gleichzeitige Signale:** Bei hunderten Aktien-Signalen am Tag bestimmt die Auswahlregel das Ergebnis.

## 3. Was eine VU-Equity-Adaptation festlegen MUSS
1. **Hebel: keiner**, ausdrücklich als Abweichung deklariert.
2. **Höchstgewicht je Aktie** (z. B. 10 %). Live: `maxPositionPct 1.0` → **CRITICAL**.
3. **Unit-Skalierung** k %/N, sodass 12 Units in 100 % passen. Alternativ 1 %/N beibehalten und offen „max. 3–5 Units“ sagen.
4. **Heat-Zähler** je Richtung statt Cash als stiller Grenze (live 108× NO_CASH).
5. **Gruppen:** Industrie ≤ 6, Sektor ≤ 10, gesamt ≤ 12 Units, mit Sektordaten zum Stichtag (PIT).
6. **Aufstocken** um ½ N bis 4 Units mit Stop-Nachzug innerhalb des Deckels, sonst offene Abweichung.
7. **Rang** (C − C[63])/N am Vortag, Gleichstand alphabetisch. Der Code dafür existiert (2.1.0).
8. **Short:** dokumentiert auslassen oder mit Leihkosten. In beiden Fällen bekommt der Filter hypothetische Short-Ausbrüche.
9. **Signalvollständigkeit:** kein 3 %-Nähe-Gate, kein Verfall nach 10 Sitzungen, keine 5-Sitzungen-Sperre.
10. **Notionelles Konto:** Jahresstart am ersten Handelstag. Ab ~50 % Jahresverlust keine Neueinstiege, statt Fast-Null-Positionen.

## 4. Befunde im Code (über R14 hinaus)
- **Filter-Richtung:** `breakoutState` (donchian-v2.mjs:54-76) zählt nur Long-Ausbrüche. Das Original sagt wörtlich: „direction … irrelevant“ (S. 19). MEDIUM.
- **Signalverlust durch den VU-Lebenszyklus:** Ein Signal entsteht nur, wenn der Vortagesschluss ≤ 3 % unter dem Trigger liegt (nur ENTRY_READY gilt als PENDING). Danach greifen der Verfall (10 Sitzungen bzw. Schluss < 10-Tage-Tief bzw. Abdriften über 3 %) und 5 Sitzungen Sperre, auch nach jedem Ausstieg. Synthetisch belegt: Ein Gap-Ausbruch aus 12 % Abstand wird verpasst, das Modell kauft 2 Tage später 13 % höher. HIGH. Die R14-Einschätzung „geringe Wirkung“ ist nicht gemessen; lokal liegen keine Kursdaten vor.
- **Notionelles Konto:** Die Schwellen 10 / 18 / 24,4 % … konvergieren gegen 50 %, so wie im Original-Beispiel. Die Endlosschleife folgte also aus der Originalformel; der R14-Fix (≤ 60 Kürzungen) ist korrekt. Nebenwirkung: Nach > 50 % Verlust entstehen Fast-Null-Positionen, die Plätze belegen. Der Jahresstart wird erst beim ersten Einstieg des Jahres gesetzt. Beides LOW.
- **Rangquelle:** Neben dem Kommentar (model-portfolio.mjs:21-22) ist auch der **kundensichtbare** Text `config.simultaneousEntries` „keine Rangregel in der Quelle“ (model-portfolio.mjs:36) für Turtle falsch. HIGH.
- **Gewicht im Beispiel:** Nur durch die Reihenfolge bekommt AAA 74 % und MMM 26 %; ZZZ geht leer aus (NO_CASH).

## 5. Prüfung der R14-Aussagen
| Aussage | Urteil |
|---|---|
| Signale nahe am Original | **teilweise** (Mechanik ja; Filter-Richtung und Signalverlust nein) |
| Portfolio-Übertragung strukturell falsch | **bestätigt** |
| Einzelpositionen mit sehr hohem Gewicht | **bestätigt** (Mechanik; DESP nicht neu gerechnet) |
| Alphabet entscheidet | **bestätigt** |
| „keine Quelle für Rang“ falsch | **bestätigt**, zusätzlich im Live-Text |
| Endlosschleife und Fix | **bestätigt**; Ursache: Originalformel |

## 6. Fidelity
Einstieg: mittel bis hoch · Ausstieg: hoch · Größe: niedrig · Portfolio: sehr niedrig · Fundamental und Marktregime: originaltreu (keine Regeln).

## 7. Antworten
- **Original:** vollmechanisches Futures-System mit S1/S2, Long/Short, Units, Aufstocken, 2N, Grenzen 4/6/10/12, notionellem Konto und Stärke-Rang.
- **Nicht reproduzierbar:** Dennis' Jahresanpassung, Ordertaktik, genaue Korrelationsgruppen, individuelle Allokation.
- **Umgesetzt:** S1-Einstieg und -Ausstieg, Filter (nur Long), Failsafe, N, 2N, Unit-Formel, notionelles Konto, kein Marktfilter.
- **Fehlt:** S2, Short, Aufstocken und Stop-Nachzug, Gruppen und Heat, Rang, richtungsfreier Filter, Signalvollständigkeit.
- **Fremd:** Anlageklasse Aktien, Kassa-Units ohne Deckel, Cash als Positionsgrenze.
- **VU-eigen:** Liquiditäts-, ADR- und Kanalfilter; Lebenszyklus 3 %/6 %/10/5; Alphabet; maxPositionPct 1; OPEN als Gewinner; Failsafe-Ausstieg nach S1; 10 bp Slippage.
- **Replikationsanspruch: NEIN.** Zulässige Bezeichnung: „Turtle-System-1-Signale auf US-Aktien (VU-Variante; Portfolio VU-eigen)“, und das erst nach Korrektur des Rangtexts. Eine echte Replikation geht nur über das Futures-Design (JSON `replicationDesign` A).
