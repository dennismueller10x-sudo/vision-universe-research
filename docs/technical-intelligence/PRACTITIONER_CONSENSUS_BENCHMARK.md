# Multi-Practitioner Consensus Benchmark (Mission VII)

Stand: 05.10.2026. Branch `claude/vision-universe-technical-intelligence-cxarnz`.

> **PRACTITIONER CONSENSUS REFERENCE, NOT EXPERT GROUND TRUTH.** Die Frage ist nicht „Wer hatte recht?“, sondern: Worin stimmen unabhängige Elliott-Praktiker zum selben historischen Marktzustand überein, worin nicht, und wo steht Vision Universe dazu?
> * Kein Prognosetest.
> * Keine Suche nach Erfolgen.
> * Der Practitioner-Holdout (43 Fälle) bleibt versiegelt.
> * Engine `elliott-3.2.2` ist unverändert.

## Grundlagen

| Was | Wo |
|---|---|
| Design (vor dem Mining) | `PRACTITIONER_PROTOCOL.md`, Nachtrag 7 (Commit `26ce816b6`) |
| Korrektur Zeitrahmen | Nachtrag 8: Eltern/Kind-Zeitrahmen werden nicht bewertet, neue Klasse `E_TIMEFRAME_ONLY` |
| Red-Team-Korrekturen | Nachtrag 9: Aliase, Trennung versiegelter Dateien, URL-Schutz und -Deduplikation, Sensitivität |
| Mining-Protokoll | [PRACTITIONER_CONSENSUS_MINING_LOG.md](PRACTITIONER_CONSENSUS_MINING_LOG.md) |
| Werkzeuge | `scripts/technical/practitioner/consensus-match.mjs`, `consensus.mjs`, `run-consensus.mjs` |
| Freeze | `practitioner-v1/freeze/PRACTITIONER_CONSENSUS_V1_2.{jsonl,manifest.json}`, SHA-256 `a33999d1…0d66ed61` (Commit `7beb66de1`) |
| VU-Vergleich | `practitioner-v1/benchmark/consensus-benchmark.json` (Commit `7beb66de1`) |
| Vorversionen | `PRACTITIONER_CONSENSUS_V1` / `_V1_1` mit `consensus-benchmark-v1.json` / `-v1_1.json`, archiviert |
| Red-Team | [reviews/CONSENSUS_REDTEAM.md](reviews/CONSENSUS_REDTEAM.md) |
| Tests | `quant/tests/practitioner-consensus.test.mjs` |

## 1. Vorgehen

1. **Ausgangsbasis:** die 78 eingefrorenen Fälle aus PRACTITIONER_REFERENCE_V1. Geöffnet sind DEVELOPMENT + VALIDATION = 35 Fälle. Für die 43 versiegelten Fälle gibt es nur Metadaten-Abgleich und Anzahlen.
2. **Quellenrahmen:**
   * die bestehenden Familien;
   * dazu 11 neue TradingView-Autoren, jeweils eine eigene Familie `tv-<autor>`, mit 2.053 Ideen;
   * nur öffentliche Metadaten, kein Login, keine Volltexte.
3. **Abgleich per Skript, ohne Handauswahl:**
   * gleiches Instrument und gleicher Zeitraum;
   * je fremder Familie die nächste Fundstelle;
   * Fenster 1D ±5, dann ±10 Handelstage; 1W/1M ±10, dann ±20; Krypto in Kalendertagen;
   * die Fenster sind fest im Nachtrag 7 und wurden nicht je Fall erweitert.
4. **Extraktion:** zwei unabhängige LLM-Durchgänge A/B, Schiedsdurchgang C. Die Extrahierenden sahen weder den Ausgangsfall noch VU noch spätere Kurse.
5. **Klassen:** nur auf dem Zeitrahmen des Ausgangsfalls (Nachtrag 8), ohne Mehrheitsentscheid.

   | Klasse | Bedingung |
   |---|---|
   | A_STRONG | ≥ 2 Familien, gleiches Szenario (L2) und gleiche Familie (L1) |
   | B_PARTIAL | gleiches Szenario, aber verschiedene Familie |
   | C_DISAGREEMENT | ein Paar mit verschiedenem Szenario |
   | D_SINGLE | keine unabhängige Referenz |
   | E_TIMEFRAME_ONLY | unabhängige Referenz nur auf Eltern/Kind-Zeitrahmen |

6. **Freeze vor jedem VU-Lauf.** Danach Vergleich mit `elliott-3.2.2` je Mitglied, getrennt nach Klassen.

### Offenlegung V1 → V1.1 → V1.2

Der erste Freeze `PRACTITIONER_CONSENSUS_V1` hat Eltern/Kind-Paare (z. B. 1D gegen 1W) bei Familie und Szenario bewertet. Das widerspricht §15 der Mission. Bemerkt wurde es nach dem ersten VU-Lauf auf V1.

* **Behebung:** Nachtrag 8 wurde geschrieben und committet, bevor die betroffenen Daten erneut verwendet wurden. Danach wurde V1.1 eingefroren.
* **Archiv:** V1 bleibt mit seinem Benchmark erhalten.
* **Folgen der Korrektur:**
  * die Klassen verschieben sich: C 5 → 4, B 2 → 1, neu E 2;
  * die Mensch-Mensch-Quoten sinken: L1 6/9 → 3/5, L2 3/9 → 1/5;
  * V1 hatte Übereinstimmung also überschätzt.
* **Einfluss von VU:** Die VU-Ergebnisse auf V1 spielten für die Korrektur keine Rolle. VU enthält sich in beiden Läufen überall, und die Klassen enthalten keine VU-Felder.

Das unabhängige Red-Team zu V1.1 bestätigte vier weitere Mängel ([reviews/CONSENSUS_REDTEAM.md](reviews/CONSENSUS_REDTEAM.md)). Sie wurden mit Nachtrag 9 behoben, der vor jeder Verwendung committet wurde, und V1.2 wurde eingefroren:
* **Alias-Lücke:** `SPXUSD`, `SPX500USD`, `NAS100USD` u. a. fehlten. Der Abgleich lief für alle Fälle neu. Ergebnis: 2 neue Fundstellen, beide Intraday → EXCLUDED, sowie 1 eingefrorene V1-Fundstelle. Damit wird cryptoknee SPY 06.12.2022 von D zu C.
* **Versiegelte Daten:** Abgleich- und Referenzzeilen, die nur an versiegelten Fällen hängen, lagen in offenen Dateien. Sie liegen jetzt unter `consensus/sealed/`. Die Git-Historie enthält sie weiter; das ist offengelegt.
* **Duplikate:** Ist eine Fundstelle selbst ein geöffneter V1-Fall, vertritt sie die eingefrorene V1-Zeile. Paare und Summen werden je URL gezählt.
* **Plausibilitätsband:** Ausgewiesen ist jetzt eine Sensitivität (Abschnitt 2.2).

## 2. Ergebnisse

### 2.1 Überdeckung

| Kennzahl | Wert |
|---|---:|
| Ausgangsfälle mit ≥ 1 Kandidat einer fremden Familie | 35 / 78 (geöffnet 21, versiegelt 14) |
| … mit ≥ 1 INCLUDED unabhängigen Referenz | **12 / 78** (geöffnet 8 / 35, versiegelt 4 / 43, nur Anzahl) |
| … davon auf gleichem Zeitrahmen (bewertbar) | geöffnet 6 / 35 |
| … mit ≥ 2 unabhängigen fremden Familien | geöffnet 1 / 35 |

**Hauptgrund für die dünne Überdeckung:** 53 von 81 extrahierten Fundstellen zählen im Intraday-Chart und sind nach § 2.2 ausgeschlossen. Dazu kommen 8 CANDIDATE-Zeilen (Plausibilitätsband, fehlende VU-Tagesreihe) und 3 unerreichbare HKCM-Videos. Die Sperre wurde nicht umgangen.

### 2.2 Konsensklassen (geöffnet, 35)

| Klasse | Fälle |
|---|---:|
| A_STRONG | **0** |
| B_PARTIAL | 1 |
| C_DISAGREEMENT | 5 |
| E_TIMEFRAME_ONLY | 2 |
| D_SINGLE | 27 |
| CONSENSUS_IMPULSE_SET | **0** |

**Sensitivität (Nachtrag 9 e):** Zusätzlich gelten CANDIDATE-Referenzen als INCLUDED, wenn sie nur am Plausibilitätsband oder an der fehlenden VU-Reihe scheitern.
* Ergebnis: C 6, B 1, E 4, D 24, A 0, Impuls-Set 0.
* Neu C ist cryptoknee BTC 26.03.2022: Aufwärts gegen stevetan abwärts.
* Spanne der Hauptaussage: **C 5–6, D 24–27, A 0, Konsens-Impuls 0.**

### 2.3 Die acht Fälle mit unabhängiger Referenz

| Fall | Zeitrahmen | Praktiker A (Ausgang) | Praktiker B / C | Klasse | VU 3.2.2 |
|---|---|---|---|---|---|
| ZM 16.08.2022 | 1W | EWF: Zickzack, Welle c abwärts | Tiedje (22.07.): Impuls, Welle (3) aufwärts | C | enthält sich (W-X-Y) |
| SPY 03.12.2022 | 1D | thefifthwave: Impuls, ((3)) aufwärts | cryptoknee (06.12.): Impuls, 3 abwärts | C | enthält sich (Flat) |
| SPY 06.12.2022 | 1D | cryptoknee: Impuls, 3 abwärts | thefifthwave (03.12., V1-Zeile): Impuls, ((3)) aufwärts — dasselbe Postpaar, Mensch-Mensch einmal gezählt | C | enthält sich (Flat) |
| BTC 29.01.2023 | 1D | thefifthwave: Impuls, ((4)), aufwärts | cryptoknee (26.01.): Impuls, 4, seitwärts | C | enthält sich (Zickzack) |
| SPY 20.07.2024 | 1D | yuchaosng: Impuls abwärts („SPY Short“) | discobiscuit (24.07.): Impuls, 5 aufwärts; EWF 1M ((3)) aufwärts (Eltern, nicht bewertet) | C | enthält sich (Dreieck) |
| BTC 16.09.2023 | 1W | cryptoknee: Impuls, ((5)) abwärts | stevetan (21.09.): Korrektur, (B) abwärts | B | enthält sich (W-X-Y) |
| BTC 04.09.2022 | 1W | cryptoknee: Zickzack C abwärts | digitalsurftrading 1D: Leading Diagonal, 4 abwärts → Eltern/Kind, nicht bewertet | E | enthält sich |
| TSLA 28.12.2022 | 1W | cryptoknee: Impuls 3 abwärts | stevetan 1M: Impuls 5 aufwärts → Eltern/Kind, nicht bewertet | E | enthält sich |

Auffällig: In drei der vier verschiedenen Postpaare der C-Fälle sind sich beide Praktiker einig, dass ein **Impuls** läuft, und sogar bei der Wellennummer (L3, L4 stimmen). Sie widersprechen sich aber in der **Richtung** des laufenden Zugs. Gleiche Etiketten bedeuten also nicht gleiche Lesart.

### 2.4 Mensch-Mensch-Übereinstimmung (nur gleicher Zeitrahmen)

| Ebene | Übereinstimmung |
|---|---:|
| L1 Familie (Motiv/Korrektur) | 3 / 5 |
| L2 strukturelles Szenario (Richtung des laufenden Zugs) | **1 / 5** |
| L3 Muster | 3 / 4 |
| L4 aktuelle Welle | 2 / 4 |
| L5 Grad | nicht vergleichbar (kaum genannt) |
| L6 Invalidation | nicht vergleichbar (keine gemeinsame Angabe) |
| L6 Ziele | 0 / 2 |

Gezählt sind 9 verschiedene Postpaare; vor der URL-Deduplikation waren es 10. Dazu kommen 4 Eltern/Kind-Paare, die nach Nachtrag 8 nicht bewertet werden.

**Test-Retest der Extraktion:** Zwei Fundstellen sind zugleich geöffnete V1-Zeilen: cryptoknee SPX 06.12.2022 und die Revision cryptoknee BTC 26.01.2023. Für den Konsens wurden sie unabhängig neu extrahiert. Beide Neuextraktionen stimmen mit V1 in Familie, Muster, Welle und Richtung überein (n = 2). Im Freeze vertritt die V1-Zeile die Fundstelle.

### 2.5 Schuldifferenzen (§16)

* **EWF** zählt nach eigener Schule (Dreier-Korrekturen, 7-/11-Swing-Sequenzen). Tiedje (stock3) und die TradingView-Autoren zählen klassisch nach EWP.
* **ZM:** EWF liest einen Zickzack, Tiedje einen Impuls. Das ist der typische Unterschied zwischen beiden Schulen.
* **Schulen der übrigen Fälle:** Alle Paare sind TradingView-Autoren derselben (klassischen) Schule. Dort liegt der Widerspruch in der Richtung, nicht in der Schule.
* **Einordnung:** Wegen n ≤ 5 ist keine Aussage über Schulen belastbar.

### 2.6 VU 3.2.2 gegen die Klassen

| Gruppe | Fälle | VU enthält sich | Richtung A1 | Familie B | Szenario S |
|---|---:|---:|---:|---:|---:|
| D_SINGLE | 27 | 27 | 17/25 | 4/12 | 13/25 |
| B_PARTIAL | 1 | 1 | 0/2 | 1/2 | 0/2 |
| C_DISAGREEMENT | 5 | 5 | 7/10 | 1/5 | 5/10 |
| E_TIMEFRAME_ONLY | 2 | 2 | 2/4 | 1/4 | 1/4 |
| A_STRONG / Impuls-Set | 0 | – | – | – | – |

* **Enthaltung:** VU enthält sich in allen 35 geöffneten Fällen; die Hauptzählung wird nie ausgegeben. A1/B/S vergleichen die interne, nicht ausgegebene Hauptzählung (wie in Mission V).
* **C-Fälle:** Bei widersprüchlichen Praktikern stimmt VU zwangsläufig mit dem einen überein und mit dem anderen nicht. 7/10 ist deshalb **keine** Leistungskennzahl.
* **Impuls-Forensik der Ausgangsfälle:** In allen 5 bewertbaren B/C-Fällen mit Motiv-Ausgang erzeugt VU eine gültige Impulslesart, rankt sie aber niedrig (Position 15, 40, 48, 70, 105). Praktikernah ist sie in 2 Fällen. Unter D_SINGLE gilt dasselbe für 19 Fälle (9 praktikernah).

## 3. Antworten auf §26

1. **Wie viele der 78 Fälle haben mindestens eine unabhängige überlappende Referenz?** 12 mit INCLUDED-Referenz (geöffnet 8, versiegelt 4). Mit irgendeinem Kandidaten sind es 35.
2. **Wie viele haben 2+ unabhängige Quellenfamilien?** 8 geöffnete Fälle haben Ausgang + ≥ 1 fremde Familie, davon 1 mit drei Familien. Auf gleichem Zeitrahmen sind es 6.
3. **Starker Konsens:** 0.
4. **Teilkonsens:** 1 (BTC 16.09.2023).
5. **Widerspruch:** 5 (Sensitivität 6).
6. **Nur eine Referenz:** 27 (Sensitivität 24). Dazu 2 Fälle, deren einzige Fremdreferenz auf anderem Zeitrahmen liegt (E).
7. **Wie oft stimmen Praktiker in der Richtung überein?** Beim strukturellen Szenario (Richtung des laufenden Zugs) 1/5.
8. **Wie oft bei Motiv gegen Korrektur?** 3/5.
9. **Wie oft bei der Musterfamilie?** 3/4.
10. **Wie oft bei der aktuellen Welle?** 2/4.
11. **Wie oft beim Grad?** Nicht messbar; Grade werden fast nie explizit genannt.
12. **Wie oft bei der Invalidation?** Nicht messbar; kein Paar nennt beide.
13. **Wie oft bei den Zielen?** 0/2.
14. **Wie oft zählen Praktiker selbst um?** Aus Mission V (nur in gezogenen Elementen erkannt): ewf 0/18, thefifthwave 0/5, cryptoknee 2/7, yuchaosng 2/5 der geöffneten Fälle wurden revidiert; yuchaosng mit 6 Revisionen auf 5 Fälle. Für Konsensreferenzen wurden keine Revisionen gesucht.
15. **Welche Familien stimmen am meisten/wenigsten überein?** Mit n ≤ 2 je Paar nicht belastbar.
    * thefifthwave + cryptoknee: 2/2 bei der Familie, 0/2 beim Szenario.
    * cryptoknee + stevetan: 1/1 beim Szenario, 0/1 bei der Familie.
    * discobiscuit + yuchaosng: 1/1 bei der Familie, 0/1 beim Szenario.
    * EWF + Tiedje: 0/1.
16. **Wie viele Practitioner-Impulsfälle haben eine unabhängige Impulsbestätigung?** Keiner.
    * Fünf Impuls-Ausgangsfälle haben eine fremde Motivlesart auf gleichem Zeitrahmen. Das sind vier verschiedene Postpaare, davon dreimal mit **entgegengesetzter Richtung** und einmal aufwärts gegen seitwärts.
    * Auch die Sensitivität ergibt 0.
    * Nach der vorab festgelegten Regel (gleiches Szenario) ist das Set leer.
17. **Was macht VU 3.2.2 auf Konsens-Impulsfällen?** Entfällt; das Set ist leer. Auf den Impuls-Ausgängen mit Widerspruch enthält sich VU.
18. **Enthält VU intern eine passende Impulslesart?** Ja, in allen bewertbaren B/C-Fällen mit Motiv-Ausgang (Taxonomie aus Mission VI).
19. **Rankt VU sie zu niedrig?** Ja, Position 15–105 statt 1.
20. **Enthält sich VU?** Ja, in 35/35 geöffneten Fällen.
21. **Stärkt der Konsens die Begründung für Engine 3.3?** Nein. Es gibt keinen einzigen Fall, in dem unabhängige Praktiker übereinstimmend einen Impuls sehen, den VU niedrig rankt.
22. **Oder stützt der Praktiker-Widerspruch VUs zurückhaltende Enthaltung?** Teilweise.
    * **Dafür:** In 4 von 5 verschiedenen bewertbaren Postpaaren widersprechen sich die Praktiker im Szenario. Eine sichere Einzelzählung wäre dort gegen mindestens einen Praktiker falsch.
    * **Dagegen:** Die Stichprobe ist sehr klein (n = 5) und publikationsselektiert.
    * **Fazit:** VUs Enthaltung beweist sie nicht, steht aber auch nicht im Widerspruch zur Praxis.

## 4. Engine-3.3-Entscheidung (§27)

| Fall | Zutreffend? | Begründung |
|---|---|---|
| A — starker Konsens für Impulse, die VU niedrig rankt | **nein** | Konsens-Impuls-Set = 0 |
| B — Praktiker widersprechen sich stark | **ja** | 5 von 6 bewertbaren Fällen C, L2 1/5 |
| C — Konsens im Szenario, nicht in Wellenetiketten | nein, eher umgekehrt | Etiketten (L3/L4) stimmen öfter als das Szenario |
| D — keine ausreichende Überdeckung | **ja** | 6/35 bewertbar, 0 A-Fälle |

**Entscheidung: Fall B + D.**
* **Kein Engine 3.3**, keine neue Mission zum Bau. Die Rangfolge wird nicht auf einzelne Praktiker abgestimmt.
* **Öffentliche Praktikerdaten reichen nicht aus**, um eine Rangänderung zu begründen.
* **Practitioner-Holdout:** bleibt versiegelt; er wurde nicht geöffnet.
* **Voraussetzung für eine künftige Mission:** gleichzeitige, unselektierte Zählungen mehrerer bezahlter menschlicher Analysten zum selben Stichtag, auf gleichem Zeitrahmen und blind. Öffentliches Material liefert das nicht.

## 5. Produktfolge (§29)

**Szenario zuerst bleibt richtig.**
* **Begründung:** Praktiker stimmen bei exakten Etiketten nur teilweise überein, und beim Szenario fast gar nicht. Eine exakte Wellenzählung in der Verbraucheroberfläche hätte keine Referenz, gegen die sie sich bewähren könnte.
* **Nutzeroberfläche:**
  * Im Vordergrund bleiben Szenario, Richtung, Schlüsselzone und Invalidation.
  * Elliott bleibt **EXPERIMENTAL STRUCTURE MODEL**, optional, ohne Prognosegewicht, ohne Wahrscheinlichkeit, ohne „expert validated“.
  * Keine Aussage „Praktiker sind sich einig“.
* **Mehrdeutigkeit zeigen:** Gerade die C-Fälle sprechen dafür, Mehrdeutigkeit sichtbar zu machen: Alternativszenario und Invalidation statt einer einzigen Zählung.

## 6. Interne Vergleichsansicht (§30)

Nicht gebaut.
* Mit 8 Fällen trägt eine eigene Seite wenig.
* Die Tabelle in 2.3 enthält Asset, Datum, Praktiker A/B/C und VU. Die Ebenen je Paar stehen im Freeze (`pairs`) und im Benchmark (`rows`).
* Eine Ansicht lohnt erst bei mehr bewertbaren Fällen.

## 7. Nachverfolgbarkeit und Deduplikation (§31–§32)

* **Angaben je Referenz im Freeze:**
  * Quellen-URL
  * Veröffentlichungszeitpunkt
  * Familie bzw. Autor
  * Belegstellen (Bild/Absatz)
  * Extraktionssicherheit
* **Keine synthetischen Konsensfälle.**
* **Unabhängigkeit:** Sie gilt nur zwischen verschiedenen Familien; HKCM, Hopf und Phantom zählen als eine Familie.
* **Duplikate:** Dieselbe Fundstelle an zwei Ausgangsfällen wurde einmal extrahiert und wird je Fall nur einmal gezählt. Reposts derselben Familie werden verworfen (Test).
* **Offenlegungen:**
  * Die Tiedje-Referenz (ZM) stammt aus der Familie des Holdout-Splits HOLDOUT_SOURCE, ist aber kein V1-Holdout-Element.
  * Zwei Konsens-Fundstellen sind geöffnete V1-Zeilen. Die eingefrorene V1-Zeile vertritt sie (Nachtrag 9 b). Derselbe Autor wird nie mit der eigenen Familie verknüpft.
  * Die Autorenwahl aus dem Elliott-Feed (≥ 40 Ideen, ≥ 3 Jahre) bevorzugt 2026 noch aktive und fleißige Autoren. Erfolgswörter wurden nicht verwendet.
  * Die Ideenlisten von Mehdi_Abbasi_EWP und pejman_zwin sind durch die API-Grenze von 1.000 Ideen abgeschnitten.
  * 3 HKCM-Videos sind unerreichbar.

## 8. Red-Team (§33)

Siehe [reviews/CONSENSUS_REDTEAM.md](reviews/CONSENSUS_REDTEAM.md).

| Risiko | Urteil |
|---|---|
| Falsche Unabhängigkeit | verworfen; Autorverbindungen offline nicht prüfbar |
| Fenster-Missbrauch | verworfen; Handelstage ohne Feiertage dokumentiert |
| Zeitrahmen | verworfen nach Nachtrag 8 |
| Familien-Leck | verworfen |
| Duplikate | bestätigt, behoben |
| Extraktion | plausibel, 2 Einzelfälle offengelegt |
| Mehrheitsentscheid | verworfen |
| Auswahlverzerrung | bestätigt (Alias-Lücke, Plausibilitätsregel), behoben bzw. als Sensitivität |
| Versteckte Erfolgsauswahl | verworfen |
| Holdout-Kontamination | bestätigt (indirekt über offene Dateien), behoben; Git-Historie offengelegt |

Keine Behebung ändert die Hauptaussage.

## 9. Statustabelle (§35)

| Bereich | Status |
|---|---|
| Bestehende Practitioner-Fälle | 78 eingefroren (PRACTITIONER_REFERENCE_V1, unverändert) |
| Unabhängige Überdeckung gefunden | 12 / 78 mit INCLUDED-Referenz (geöffnet 8 / 35; gleicher Zeitrahmen 6 / 35) |
| Starker Konsens | 0 (Sensitivität 0) |
| Teilkonsens | 1 |
| Widerspruch | 5 (Sensitivität 6) |
| Nur eine Referenz | 27 (Sensitivität 24) + 2 nur Eltern/Kind-Zeitrahmen |
| Konsens-Impulsfälle | 0 |
| VU-Übereinstimmung auf Konsensfällen | nicht messbar (0 A-Fälle); VU enthält sich in 35/35 |
| Konsens-Datensatz | PRACTITIONER_CONSENSUS_V1_2 eingefroren (`a33999d1…`), V1/V1.1 archiviert |
| Mensch-Mensch-Übereinstimmung | Familie 3/5, Szenario 1/5, Muster 3/4, Welle 2/4, Ziele 0/2 |
| Engine 3.3 gerechtfertigt | **NEIN** (Fall B + D) |
| Practitioner-Holdout | versiegelt, nicht geöffnet |
| Prognoseevidenz | **NOT ESTABLISHED** |

**Kosten:** Mining ≈ 107 USD (Budget 150 USD). Freeze, Benchmark und Red-Team liefen lokal.
