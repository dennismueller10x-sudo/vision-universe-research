# Mission X: Elliott Setup Library V1, Evidenzschicht und prospektives Register

Stand: 07.10.2026. Engine eingefroren: `elliott-3.2.2` / `ti-scenario-1.2.1` (Hashes = Mission-VIII-Freeze). Mission VIII und IX bleiben eingefrorene Evidenz.

Unterlagen:
* [ELLIOTT_SETUP_LIBRARY_V1.md](ELLIOTT_SETUP_LIBRARY_V1.md), Spec `scripts/technical/elliott-setups/ELLIOTT_SETUP_SPEC.json`, Freeze [MISSION10_SETUP_FREEZE.md](MISSION10_SETUP_FREEZE.md);
* [ELLIOTT_SETUP_EVIDENCE.md](ELLIOTT_SETUP_EVIDENCE.md), Tabellen [hsab/MISSION10_SETUP_TABLES.md](hsab/MISSION10_SETUP_TABLES.md);
* [ELLIOTT_PROSPECTIVE_REGISTRY.md](ELLIOTT_PROSPECTIVE_REGISTRY.md), [ELLIOTT_PRODUCT_EVIDENCE_CONTRACT.md](ELLIOTT_PRODUCT_EVIDENCE_CONTRACT.md).

## Kurzfassung

* Die Library enthält **vier Setups**:
  * S1 Frühe Welle 3;
  * S2 Welle 4 → 5;
  * S3 Abgeschlossene Korrektur → Fortsetzung;
  * S4 Dreieck → Schlussstoß.

  Dazu kommt ein Modifikator „höherer Grad gleichgerichtet“; die Familie „Extension“ ist verworfen. Jedes Setup ist strukturell definiert (Bestätigung, Invalidation, Projektionszone der Engine, Alternative, Enthaltung). Jedes hat eine Pure-, eine +RS- und eine Confirmed-Variante (Trend UND RS26 UND Marktstruktur, ohne Gewichte).
* Die eingefrorene Engine **zeigt fast keine Setups an**. Eine laufende Welle 2/3 ist nie, Welle 4 kaum Primärzählung. Angezeigt werden fast nur abgeschlossene Korrekturen, rund 0,1 % der Wochen-Erkennungspunkte.
* **Historisch erreicht kein Setup positive oder inkrementelle Evidenz.**
  * S3 angezeigt: trifft so oft wie dieselbe Geometrie (36,8 % gegen 36,1 %) → STRUCTURAL ONLY.
  * S3 nicht angezeigt: systematisch schlechter (−2,2 Pp.) → REJECT.
  * S1, S2, S4 angezeigt: zu wenige Fälle → INSUFFICIENT EVIDENCE.
* Das **prospektive Register läuft** seit Woche 2026-09-25: 1.886 eingefrorene Ereignisse im Bestand, Hash-Kette, Revisionen, Auswertung nur abgelaufener Horizonte. Es ist der einzige Weg zu ROBUST EDGE.

## Antworten (§30)

1. **Setups in Library V1:** S1 Frühe Welle-3-Ausdehnung, S2 Welle 4 → Welle 5, S3 Abgeschlossene Korrektur → Trendfortsetzung, S4 Dreieck → Schlussstoß; Modifikator M_HD_ALIGNED.
2. **Warum diese?** Für genau diese vier Lagen hat der eingefrorene Code eine Regelbasis (`rules.js`) **und** eine Projektionsbasis (`patterns.js`). Die Projektionsbasis umfasst W3 = 1,0/1,618/2,618 × W1, die W5-Ziele, „Ursprung der Korrektur“ / 1,618 × und „Breite von Welle A“ beim Dreieck.
   * Höherer Grad ist eine Bedingung, keine Lage, deshalb ein Modifikator.
   * Extension gibt die Engine nicht aus. Sie ist erst nach Abschluss von Welle 3 erkennbar und wäre damit nicht kausal, deshalb verworfen.
   * Gewählt wurde vor jeder Ergebnisauswertung, auf Basis einer Rekonstruktion, welche Zustände die Engine überhaupt erzeugt.
3. **Strukturelle Definitionen:** vollständig in [ELLIOTT_SETUP_LIBRARY_V1.md](ELLIOTT_SETUP_LIBRARY_V1.md) (Musterfamilie, Wellenzustand, Richtung, Grade, höherer Grad, Bestätigung, Invalidation, Projektion, Alternative, Enthaltung). Maschinenlesbar in der Spec; eine Implementierung für Historie und Register.
4. **Pure Elliott:** alle vier (Variante PURE = angezeigte Primärzählung, nur Elliott-Information). Zusätzlich ENGINE_PRIMARY (auch enthaltene Zählungen) als Forschungsvariante.
5. **Confirmed-Varianten:** alle vier haben PURE_RS und CONFIRMED.
6. **Bestätigungen:**
   * einfacher Trend (40-Wochen-Durchschnitt mit Steigung);
   * RS26 Top/Bottom 20 % im Universum am selben Datum;
   * Marktstruktur (Vorzeichen der STRUCTURE-Stimme);
   * Volumen: auf Wochenbasis nicht verfügbar.

   Logisches UND, keine Gewichte.
7. **Verbessert RS die Setups?** Nicht belegbar. Mit RS werden die Setups so selten (S3: 39/40 Fälle), dass DEV und VAL entgegengesetzte Vorzeichen zeigen (Lift −9,7 gegen +6,5 Pp.). Mission IX bleibt gültig: RS26 allein ist ein stärkeres Langfrist-Merkmal als jedes VU-Signal.
8. **Fügt Elliott etwas über RS, Trend und Struktur hinzu?** Historisch nein.
   * S3 angezeigt gegen Trend+RS: +0,5 Pp. [−5,6; +6,7]; nicht angezeigt −2,2 Pp.
   * Die internen Welle-3-Kandidaten (Mission IX) sind innerhalb RS26 Top 20 % nicht gesichert besser: 1,40 [0,84; 2,04].
9. **Positiver Nutzen (LEVEL 1)?** Kein Setup. Die strukturelle Erwartung ist überall ≤ 0, z. B. S3 angezeigt −0,15 R. Einzige Ausnahme ist die nicht angezeigte S4-Primärzählung mit E[R] +0,01 [−0,07; +0,09], ohne gesicherte Untergrenze.
10. **Inkrementeller Nutzen (LEVEL 2)?** Kein Setup.
11. **Robuster Edge (LEVEL 3)?** Keiner. Historisch ist LEVEL 3 gar nicht erreichbar, weil alle Wochendaten verbraucht sind. Nur das Register kann ihn zeigen.
12. **Höchste historische Trefferquote (n ≥ 100):** S3 PURE, 40,1 % (DEV) bzw. 36,8 % (VAL), Ziel 1 vor Invalidation in 26 Wochen.
13. **Geometrie:** Ziel 3,7–3,8 ATR, Invalidation 4,5–5,2 ATR, Chance/Risiko 0,63–0,75.
14. **Basis:** gleiche Geometrie am selben Datum 40,9 % / 36,1 %. Lift −0,8 / +0,7 Pp.
15. **Payoff:** 0,87 / 0,91 (Ø Gewinner / |Ø Verlierer| in R).
16. **Abdeckung:** 0,09–0,10 % der Erkennungspunkte. Im ersten Registerlauf waren 16 von 4.975 Titeln (0,3 %) angezeigte Setups.
17. **Asymmetrischer Wert der frühen Welle 3?**
    * Angezeigt existiert sie nicht.
    * Die interne Forschungskohorte zeigt explorativ 1,35–1,4× häufiger 5× in 24 Monaten, aber keinen gedeckelten Renditevorteil, einen Median unter der Basis und nichts über RS hinaus.
    * Antwort: höhere Streuung, kein belegter Mehrwert. Prospektiv registriert (278 Kandidaten im Bestand).
18. **Welle 4 → 5?** Angezeigt nie, nicht angezeigt 51–58 Fälle je Hälfte → INSUFFICIENT EVIDENCE.
19. **ABC-Abschluss?**
    * Angezeigt: Szenario-Logik funktioniert als Struktur, aber kein Vorteil gegenüber derselben Geometrie → STRUCTURAL ONLY.
    * Nicht angezeigte Primärzählung: messbar schlechter (Lift −2,2 Pp. auf DEV und VAL; langfristig 24M −2,6 % gegen den Markt) → REJECT als Forschungsvariante.
20. **Dreiecke?**
    * Angezeigt 15/17 Fälle → INSUFFICIENT.
    * Nicht angezeigt (2.081): Lift +1,5 [−0,4; +3,3], Chance/Risiko 2,4, Payoff 3,0, E[R] ≈ 0 → STRUCTURAL ONLY.
21. **Höherer Grad?**
    * Wie definiert (laufende Welle des höheren Grades gleichgerichtet) bei abgeschlossenen Mustern praktisch nie erfüllt, weil diese Welle die gerade beendete Korrektur enthält.
    * INSUFFICIENT EVIDENCE. Nicht umdefiniert; eine andere Lesart ist V2-Hypothese.
22. **Nur strukturell anzeigen:** alle vier Setups. S3 mit belegter Struktur-Rolle, S1/S2/S4 wegen fehlender Evidenz. Elliott bleibt strukturelle Lesart mit Invalidation und Projektionszone, ohne Erfolgszahl.
23. **Kundenevidenz heute vertretbar?** Nein. Alle Evidenzdatensätze tragen `publishable: false`. Vertretbar ist nur die Verfahrensaussage, dass jedes Setup vorab unveränderlich registriert und später geprüft wird (Claim 26).
24. **Läuft das prospektive Register?** Ja.
    * Erster Lauf: Woche 2026-09-25, 4.975 Titel, 1.886 Ereignisse (16 angezeigte Setups, 1.592 nicht angezeigte Primärzählungen, 278 Forschungskandidaten), als Bestand markiert.
    * CI-Lauf für Woche 2026-10-02 mit frisch gebauten Wochenschlüssen: in CI gelaufen und veröffentlicht (Commit `8f2eb44`): 5.122 Titel, 329 neue Ereignisse (1 angezeigtes Produkt-Setup, 219 nicht angezeigte Primärzählungen, 109 Forschungskandidaten) und 425 Revisionen der Bestandsereignisse (130 Umdeutungen, 127 Ziel erreicht, 72 Bestätigungen, 70 erweiterte Projektion, 26 Invalidationen); Kette und „nur anhängen“ geprüft. Ein erster CI-Versuch registrierte dieselbe Woche, wurde aber wegen Push-Fehlern von GitHub nicht veröffentlicht und zählt nicht.
    * Zeitplan: samstags auf dem Default-Branch. Bis zum Merge läuft das Register per Marke `[elliott-registry]`.
25. **Wie funktioniert die 12/24/36-Monats-Validierung?**
    * `evaluate-registry.mjs` wertet je Ereignis 3/6/12/24/36 Monate erst aus, wenn die Woche „Registrierung + h“ abgeschlossen ist.
    * Verglichen wird mit der zeitgleichen Kontrollkohorte aus dem Snapshot derselben Woche: alle, gleicher Trend, gleicher RS-Status, Trend × RS, Marktstruktur.
    * Bestand und Neuzugänge werden getrennt.
    * Erste 12-Monats-Auswertung ab 2027-09-24, 24 Monate ab 2028-09-22, 36 Monate ab 2029-09-21.
    * Vor einer Aussage wird eine eigene Präregistrierung mit festen Schwellen committet.

## Einstufung je Setup (§31)

| Setup | Produkt (angezeigt, PURE) | Forschung (nicht angezeigt) | Begründung |
|---|---|---|---|
| S1 Frühe Welle 3 | **INSUFFICIENT EVIDENCE** | Primärzählung 2 Fälle; interne Kohorte explorativ (Mission IX) | Engine zeigt die Lage nie an |
| S2 Welle 4 → 5 | **INSUFFICIENT EVIDENCE** | 51–58 Fälle, kein Befund | wie S1 |
| S3 Abgeschlossene Korrektur | **STRUCTURAL ONLY** | **REJECT** | kein Lift gegen dieselbe Geometrie; nicht angezeigt systematisch negativ |
| S4 Dreieck → Schlussstoß | **INSUFFICIENT EVIDENCE** | STRUCTURAL ONLY | angezeigt n < 20 |
| M_HD_ALIGNED | **INSUFFICIENT EVIDENCE** | — | strukturell fast nie erfüllt |
| F Extension | **REJECT** (nicht aufgenommen) | — | keine kausale Engine-Ausgabe |

ROBUST EDGE, INCREMENTAL UTILITY und POSITIVE UTILITY: keines.

## Fallstudie Palantir (nach der Universumsauswertung, nur Erklärung)

Öffentliche Praktiker-Sicht (in Mission IX verifiziert):
* TradingView, 21.01.2023, ≈ 7 $: bärische Wellen beendet, langfristig 80 $;
* Elliottwave-Forecast, 04.04.2023: Welle (II) bei 5,97 $ beendet, Invalidation darunter.

Was das eingefrorene VU am selben Datum zeigte:

| Datum | Primärzählung | Setup | Trend | RS26-Rang | Marktstruktur | danach 104 W |
|---|---|---|---|---|---|---|
| 30.12.2022 | WXY abgeschlossen, weiter **abwärts**, enthalten | S3 abwärts, nicht angezeigt | −1 | 0,17 | −1 | 12,3× |
| 20.01.2023 | wie oben | S3 abwärts, nicht angezeigt | −1 | 0,14 | −1 | 10,2× |
| 31.03.2023 | WXY Welle Y läuft, enthalten | — (intern: Welle 3 offen, Rang 19 → Forschungskohorte) | 0 | 0,50 | −1 | 10,2× |
| 30.06.2023 | WXY Welle Y, enthalten | — | +1 | **0,98** | −0,3 | 8,5× |
| 28.03.2024 | WXY abgeschlossen, weiter **aufwärts**, enthalten | S3 aufwärts, nicht angezeigt; Trend ✓, RS ✓, Marktstruktur ✓ | +1 | 0,86 | +1 | 6,2× |

Lesart:
* Die Elliott-Primärzählung lag 2023 auf der falschen Seite.
* Der interne Kandidat erkannte die Aufwärtsstruktur im März 2023, verworfen auf Rang 19.
* Relative Stärke zeigte die Führung ab Mitte 2023, also vor dem größten Teil der Bewegung.
* Keine Definition wurde wegen PLTR geändert.

## Selbstkritik (§32)

1. **Definitionen auf historische Gewinner getunt?** Nein. Gewählt wurde nach Regel- und Projektionsbasis des Codes. Freeze vor VAL (`82f7456`); DEV nur für Implementierungsfehler. Offen bleibt: Die Mission-IX-Definition der internen Welle 3 (`earlyUp`) entstand nach Sichtung des PLTR-Falls (offengelegt) und wird nur prospektiv geprüft.
2. **Zu breit?** Die nicht angezeigte Variante von S3 ist breit (≈ 8 % der Erkennungspunkte) und genau dort negativ.
3. **Zu selten?** Ja, die angezeigten Setups. Die Engine zeigt kaum etwas an. Als Kunden-Setups sind S1/S2 leer, S4 fast leer; selbst S3 hat nur rund 180 Fälle je Hälfte über 30 Jahre.
4. **Erklärt Geometrie hohe Trefferquoten?** Ja. Die wenigen höheren Quoten (50–58 %) liegen bei Chance/Risiko 0,27–0,44 und bei winzigem n.
5. **Treiben wenige Ausreißer den Payoff?** Langfristig ja (Mission IX). Für die Setups gibt es keinen Payoff-Vorteil, der verschwinden könnte.
6. **Erklärt RS das Ergebnis?** RS ist das stärkere Merkmal (Mission IX). Mit RS werden die Setups zu selten für eine Aussage.
7. **Erklärt Trend das Ergebnis?** Die Lifts gegen Trend-gematchte Kontrollen gleichen denen gegen die Geometrie-Kontrolle (≈ 0 bzw. negativ).
8. **Trägt Elliott inkrementelle Information?** Historisch nicht nachweisbar. Die nicht angezeigten Korrekturzählungen tragen eher negative Information.
9. **Woche nützlicher als Tag?** In V1 nur Woche. Mission VIII zeigte für den Tag dieselbe Geometrie-Dominanz; die Tages-Zählung spricht noch seltener.
10. **Was scheitert prospektiv am ehesten?** Der explorative Befund der internen Welle-3-Kandidaten (mehr 5×-Fälle). Er ist nach der PLTR-Sichtung definiert, nicht über RS hinaus gesichert und könnte ein Volatilitätsmerkmal sein.
11. **Noch durch frühere Forschung kontaminiert:**
    * alle historischen Wochendaten (DEV und VAL);
    * die Forschungskohorte (Mission IX);
    * die Auswahl der Bestätigungen (RS wurde in Mission IX gesehen);
    * die Kenntnis, dass abgeschlossene Korrekturen dominieren.
12. **Was nur das Register beantworten kann:**
    * ob ein Setup gegen zeitgleiche Kontrollen (Trend × RS) besteht;
    * ob RS oder die volle Bestätigung ein Setup verbessert;
    * ob die interne Welle 3 außerhalb der verbrauchten Historie mehr Extremgewinner liefert;
    * Revisions- und Umdeutungsraten in Echtzeit.
13. **Was noch nicht vermarktet werden darf:**
    * jede Erfolgsquote eines Elliott-Setups;
    * „VU erkennt frühe Welle 3“;
    * „Elliott plus RS bestätigt“;
    * jede Projektionswahrscheinlichkeit;
    * Galerien erfolgreicher Fälle.

## Was Mission X nicht getan hat

* Keine Änderung an Engine, Grammatik, Rang, Grad, Pivots, Konfidenz, Enthaltung, Szenario-Gewichten oder Produktions-Prognosegewichten.
* Kein Elliott 3.3.
* Kein Wiederöffnen eines Mission-VIII/IX-Holdouts.
* Keine Suche über viele Setup-Varianten.
* Keine Web-Recherche (die PLTR-Quellen stammen aus Mission IX).
