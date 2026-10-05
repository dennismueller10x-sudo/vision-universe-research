# Weinstein Stage Analysis – kanonisches Regelbuch und Abgleich mit Live 4.0.0 (R15)

Regelbuch `weinstein-canonical-1.0.0` · Details: `rulebook-WEINSTEIN.json` (33 Regeln, 19 Live-Bausteine, 19 Textprüfungen).
Quellen: Bulkowski „Trading Weinstein“ und „Weinstein Stops“ (mit Buchzitaten), stageanalysis.net-Checkliste
(nur das Forest-to-Trees-Zitat S. 75 stammt aus dem Buch). Das Buch (1988) liegt nicht vor; Buchwissen ist als
„Buch (nicht im Abruf verifiziert)“ markiert, Konfidenz höchstens MEDIUM, keine Seitenzahlen ergänzt.

## 1. Kanon (Schicht A) und Umsetzung

| Regel | Original (Kurzform) | Live 4.0.0 | Schwere |
|---|---|---|---|
| Stufen 1–4, 30-Wochen-Linie | Kauf nur in Stufe 2 | ±0,5 %/4 Wo-Schwellen (VU) | LOW |
| Basis/Widerstand | Basis, Kauf über Oberkante | ≥10 Wo, ±15 % um MA (VU) | LOW |
| Einstieg | Kauf-Stop über Widerstand | Kauf-Stop über Tageshoch der Basis | NONE |
| Kauftag-Prüfung | Kurs über nicht fallender MA30 | nur bei Entdeckung geprüft | LOW |
| Volumen | deutlicher Anstieg, sonst meiden | kein Filter vor dem Kauf (Kauf-Stop) | NONE |
| Volumenmaß | 2× vier Wochen bzw. Aufbau (Bulkowski) | nur 2× vier Wochen; fehlende Daten = ok | MEDIUM |
| Schwaches Volumen nach Kauf-Stop | schnell mit Gewinn verkaufen | erster Tagesschluss über Einstieg → raus | MEDIUM |
| Relative Stärke | nie mit negativer RS kaufen | Mansfield > 0; Steigung der Nulllinie fehlt | LOW |
| Markt (Forest) | negativer Markt: kaum kaufen | SPY über nicht fallender MA30, binär | LOW |
| Gruppen | nur beste Gruppen, Gruppenführer | fehlt | HIGH |
| Langfristindikatoren | gewichtete Breite usw. (Buch) | fehlt | MEDIUM |
| Halbposition + Rücksetzer | ½ beim Ausbruch, ½ beim Rücksetzer | fehlt | MEDIUM |
| Fortsetzungskauf | Trader-Methode in Stufe 2 | 8 Wo/≤25 %/MA10 (VU-Zahlen) | LOW |
| Anfangsstop | unter nächstem Zwischentief | 2 % unter tiefstem Basis-Wochenschluss | HIGH |
| Rundungsregel | nicht auf runden Zahlen | fehlt | LOW |
| Nachziehen | unter min(MA30, Zwischentief), bei neuem Hoch | fehlt | HIGH |
| Stufe 3 | Stop verengen, spätestens Stufe 4 raus | nur Warnung | MEDIUM |
| Hauptausstieg | Stop-Order (s. o.) | Wochenschluss < MA30 (VU) | HIGH |
| Positionsgröße | keine Zahl im Abruf | 0,5 % Risiko (Kullamägi) | CRITICAL |
| Portfolio | 1–2 beste Charts je bester Gruppe | 10 Plätze, 20 %, IBD-artiger RS-Rang | MEDIUM |
| Short Stufe 4 | im Buch | außerhalb des Umfangs (long-only) | LOW |

## 2. Was live tatsächlich läuft (Herkunft)
- **ORIGINAL:** Kauf-Stop über der Basis.
- **ORIGINAL_INTERPRETATION:** Marktfilter (SPY/MA30), Mansfield-RS > 0, Volumen-Schnellverkauf WEIN-VOL-04.
- **VU_FORMALIZATION:** Stufenschwellen, Basis, Fortsetzungsbasis, Anfangsstop am Basistief, Ausstieg per
  Wochenschluss < MA30, Stufe-3-Warnung.
- **VU_OWN:** Invalidation/60 Sitzungen, 5-Sitzungen-Sperre, 10 Plätze, 20 % Höchstgewicht,
  Liquidität (5 $, 5 Mio. $), IBD-artiger RS-Rang, Kosten 10 bp + 1 bp.
- **FOREIGN_RULE:** 0,5 % Risiko je Trade (`backtest.mjs:11`, Kommentar KK-RISK-01; `weinstein-v3.mjs:84`
  `portfolio: null`, von v4 geerbt; `model-portfolio.mjs:25`).
- Live-Stand 2026-10-02: 15 offene Stufe-1-Setups (Version 3.0.0), kein Einstieg, 100 % Cash.

## 3. Live-Texte: Abweichungen
- `process-chain.mjs:34` „Stop wöchentlich 2 % unter MA30 nachziehen … ORIGINAL“: weder im Code noch bei Weinstein.
- `process-chain.mjs:29`: Volumen ≥ 2× als Kandidatenfilter, im Code eine Ausstiegsregel.
- `process-chain.mjs:35`: Ausstieg per Wochenschluss < MA30 als ORIGINAL eingestuft, tatsächlich VU.
- `process-chain.mjs:28`: Die Buchzitate stammen hauptsächlich von Bulkowski, nicht von stageanalysis.net.
- `process-chain.mjs:33`: 0,5 % ist als „VU-Standard“ bezeichnet, stammt aber von Kullamägi.
- `registry.mjs` 255/258/260/269, Sektionen `hold` (560), `invalid` (563), `candidate` (555), `variants` (284),
  `how_it_thinks` (244) und `lifecycle_mapping` (282) beschreiben noch 1.1.0 (1,5× Volumen, Wochenschluss-Einstieg,
  Nachziehen 2 % unter MA). Sie stehen so im veröffentlichten `supertrader/data/registry.json`. Die Sektion
  `hold` widerspricht der Sektion `exit`.
- `fidelity.mjs:124`: Der Ausstieg ist als OPERATIONALIZATION eingestuft; wegen des fehlenden Nachziehens ist das zu mild.

## 4. Prüfung der R14-Aussagen
- 0,5-%-Fremdregel → etwa 3 % je Position: **BESTÄTIGT** (der Mittelwert von 17 % Stopabstand ist nur als Text belegt).
- Stop und Ausstieg weichen ab: **BESTÄTIGT**.
- Der Prozessketten-Text zum Nachziehen ist falsch: **BESTÄTIGT**, zusätzlich in `registry.mjs`.
- Volumen steht als Filter in der Liste, ist im Code aber ein Ausstieg: **BESTÄTIGT**.
- „VU-Volumenregel“: **TEILWEISE**. Inhaltlich ist es Weinsteins eigenes Zitat; VU ist nur die engste Formalisierung.
- „Beendet ~75 % der Trades“: **NICHT PRÜFBAR**. Die Zahl steht nur in versiegelten Läufen. Plausibel ist sie:
  Bulkowski meldet mit derselben Regel rund 75 % Gewinnquote bei rund 5–6 % durchschnittlichem Gewinn.

## 5. Methodentreue
Einstieg MEDIUM · Ausstieg LOW · Größe LOW · Portfolio LOW · Fundamentaldaten HIGH (nicht anwendbar:
keine gefordert, keine genutzt) · Marktregime MEDIUM.
**Replikationsanspruch zulässig: nein.**

## 6. Ausstiegsfrage
**Fall B (VU).** Weinsteins Investor-Ausstieg ist ein nachgezogener Stop unter dem tieferen Wert von MA30 und
Zwischentief. Angehoben wird er erst, wenn der Kurs das alte Hoch erreicht; in Stufe 3 wird er enger gesetzt.
„Wochenschluss < MA30“ ist eine Vereinfachung. Sie verkauft in Stufe-2-Rücksetzern früher und in Stufe 3 später.
Nur WEIN-VOL-04 ist im Kern original (Fall A), allerdings in der engsten Lesart.

## 7. Investitionsquote bei quellennahen Regeln (qualitativ)
- Die Größe richtet sich nach dem Kapital (Halbposition + Zukauf), nicht nach 0,5 % Risiko bei 15–27 % Stopabstand.
- Gewinner werden über Monate gehalten.
- Ausbrüche ohne Volumen werden eher gemieden als gekauft und gleich wieder verkauft.
- Ergebnis: hohe Quote in Stufe-2-Märkten, nahe null in Stufe-4-Märkten.
- Eine Zahl ist nicht ableitbar (Weinsteins Größenregeln: UNRESOLVED).
- Die heutige Obergrenze von etwa 30 % folgt aus der Fremdregel.

## 8. Replikationsdesign (Forschung, vorab registrieren, vorwärts prüfen)
1. Einstieg wie 4.0.0, zusätzlich am Kauftag prüfen: Kurs über nicht fallender MA30.
2. Halbposition beim Ausbruch, zweite Hälfte beim Rücksetzer (Parameter vorab festlegen).
3. Anfangsstop unter dem letzten Zwischentief, mit Rundungsregel.
4. Nachziehen auf min(MA30, Zwischentief), sobald das alte Hoch erreicht ist; in Stufe 3 enger.
   Kein Ausstieg nur per MA-Schluss.
5. WEIN-VOL-04 auch in Bulkowskis Lesart prüfen (Wochenbasis, Aufbau-Alternative).
6. Größe als ausgewiesene VU-Sensitivität: 1/N bzw. 1–2 % Risiko.
7. Gruppenfilter nur mit Point-in-Time-Branchendaten.
Bezeichnung: „VU-Variante nach Weinstein (Teilumfang, long-only)“.

## 9. Antworten
- **Original:** Stufen, MA30, Kauf-Stop, Volumen inkl. Schnellverkauf, RS, Forest-to-Trees, Halbposition + Rücksetzer,
  Zwischentief-Stop mit Rundung, Nachziehen, Verengung in Stufe 3, Shorts in Stufe 4.
- **Nicht reproduzierbar:** Gruppenstärke, Marktbreite, Größen- und Streuungsregeln des Buchs, Augenmaß, Trader-Stops.
- **Umgesetzt:** Stufen, Basis- und Fortsetzungskäufe, Kauf-Stop, Markt- und RS-Filter, WEIN-VOL-04,
  Basistief-Stop, MA-Schluss-Ausstieg.
- **Fehlt:** Gruppen, Halbposition, Pullback-Einstieg, Zwischentief-Stop, Rundung, Nachziehen, Stufe-3-Verengung,
  Widerstandsprüfung, Volumenaufbau, Steigung der RS-Nulllinie, Langfristindikatoren.
- **Fremd:** 0,5 % Risiko (Kullamägi), IBD-artiger RS-Rang, Fortsetzungs-Checkliste eines Dritten, 5-$-Minimum (Bulkowski).
- **Eigene VU-Regeln:** alle Zahlenschwellen, 2-%-Puffer, MA-Schluss-Ausstieg, Sperre, Plätze, Kosten.
- **Darf „Weinstein“ heißen?** Nur als „VU-Variante nach Weinstein (Einstiegsidee, Teilumfang)“, nie als
  Original oder Replikation.
