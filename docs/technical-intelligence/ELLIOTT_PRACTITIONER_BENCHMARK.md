# Elliott Practitioner Benchmark — Bericht (Mission V)

Stand: 04.10.2026. **Status: NICHT DURCHGEFÜHRT — keine Practitioner-Referenzen.** Grund: Die Build-Umgebung erreicht keine Primärquelle (Netzwerk-Policy, siehe [PRACTITIONER_REFERENCE_V1.md](PRACTITIONER_REFERENCE_V1.md) §1). Der blinde VU-Lauf (`node scripts/technical/practitioner/run-benchmark.mjs`) liefert mit leerem Datensatz `NO_REFERENCES` — es wird nichts erfunden.

> Diese Mission sollte nicht beweisen, dass HKCM recht hat oder dass Elliott funktioniert, sondern messen, wie nah VU erfahrenen Praktikern kommt. Diese Messung steht aus.

## Antworten auf §113

| # | Frage | Antwort |
|---|---|---|
| 1 | Wie viele Practitioner Cases? | **0** (14 Fundstellen nur als Metadaten in der Discovery-Queue) |
| 2 | Welche Quellen? | 12 im vorläufigen Quellenverzeichnis (HKCM, Phantom by HKCM, EWI, ElliottWave-Forecast, More Crypto Online, ElliottWaveTrader, André Tiedje, Stockstreet, Thomas Antczak, TradingView-Autoren, NEoWave [REJECT: Bezahlschranke], Aggregatoren [REJECT]) — keine am Primärmaterial geprüft |
| 3 | Welche Jahre? | geplant 2022–06/2026; keine Daten |
| 4 | Welche Assets? | geplant: US-Aktien und -Indizes zuerst, DAX/Euro Stoxx, Krypto, Gold, Öl; DAX ohne VU-Reihe (UNMAPPED) |
| 5 | Wie sicher war die Extraktion? | nicht messbar; Doppelextraktion 25 % vorgesehen |
| 6 | Wie oft stimmen Praktiker untereinander überein? | nicht messbar |
| 7 | Wie oft stimmt VU mit einem Praktiker überein? | nicht messbar |
| 8–15 | Grad exakt / ±1, Musterfamilie, laufende Welle, Richtung, Invalidation, Ziele, Enthaltung | nicht messbar; Kennzahlen A1/A2–K und S implementiert und an markierten Testfällen geprüft |
| 16 | Neuzuordnungen | nicht messbar (Revisionsketten werden versioniert, nie überschrieben) |
| 17 | Erkennungslatenz | nicht messbar (implementiert) |
| 18 | Wo versagt VU systematisch? | gegenüber Praktikern unbekannt. Aus Mission III/IV bekannt (synthetisch): laufende Muster, Gradwahl, WXY-Lesart laufender Impulse |
| 19 | Wo sind Praktiker uneinig? | unbekannt |
| 20 | Konsequenz für Engine 3.3 | keine Entscheidung möglich; nach §100 kein automatischer Bau → **kein Engine 3.3** |

## Bereitschaft der Messung

Alles außer den Daten ist gebaut und getestet. Vor der ersten Extraktion wurde ein unabhängiges Red-Team durchgeführt ([reviews/PRACTITIONER_PIPELINE_REDTEAM.md](reviews/PRACTITIONER_PIPELINE_REDTEAM.md)). Dessen kritischer Befund wird behoben (Stand dieses Commits: in Arbeit): Die Richtung des Praktikers („ab jetzt“) wurde mit der VU-Richtung *nach* der laufenden Welle verglichen. Ebenso die schweren Befunde: Stichtag Gold/Silber, Formular vs. Pipeline, Leck zwischen Aufteilungen, unversiegelte Holdouts, fehlender Stichprobenrahmen, Ergebniswissen der Extrahierenden, Mindestgrößen. Die Protokollseite ist im Nachtrag 1 festgehalten; die Code-Korrekturen folgen. Beides liegt zeitlich vor jedem Fall.

## Ergebnisstudie

`PRACTITIONER_OUTCOME_STUDY.md` wird nicht angelegt: ohne Fälle keine Ergebnisse. Die Ergebnisschicht ist als separater, erst nach versiegeltem Methodenvergleich lauffähiger Schritt gebaut. Pflichtgrenzen stehen im Protokoll §11.

## UI-Implikation (§118)

Ohne Mensch–Mensch-Daten nicht belegbar. Unabhängig davon ist das Produkt bereits szenariozentriert (Struktur → Hauptszenario → Alternative → Zone → Invalidation → Evidenz → Elliott-Lesart optional) und enthält sich bei Elliott in 99 % der Titel. Das entspricht der Hierarchie aus §119, die Mission V nur bestätigen oder widerlegen könnte.

## Finaler Status (§129)

| Bereich | Status |
|---|---|
| Practitioner Dataset | **BLOCKED** — 0 Fälle; Schema, Protokoll, Werkzeuge und Erfassungsseite fertig |
| HKCM Coverage | **0** (Quelle registriert, Inhalte nicht erreichbar) |
| Independent Sources | **0 geprüft** (11 weitere registriert) |
| Human-Human Agreement | **NOT MEASURED** |
| VU-Human Agreement | **NOT MEASURED** |
| Engine 3.3 Needed | **UNKNOWN** |
| Engine 3.3 Built | **NO** |
| HOLDOUT-4 Ready | **NO** (Definition steht: Practitioner-Holdout + annotierter Real-Chart-Satz + kleiner synthetischer Regelsatz) |
| Forecast Test | **NOT RUN** |

## Entscheidung (§130)

**Keine der drei Wege ist mit Daten begründbar.**
* **PATH A** (3.2.2 schon praktikernah) — nicht belegt.
* **PATH B** (Engine 3.3 nötig) — nicht belegt; nach §100 kein automatischer Bau.
* **PATH C** (Elliott zu mehrdeutig, Szenario-Ebene priorisieren) — nicht durch Praktikerdaten belegt.

Vorläufige Arbeitsannahme bis zur Messung: **Produkt bleibt bei PATH-C-Verhalten.** Begründung aus den bisherigen Missionen, nicht aus Praktikerdaten:
* Elliott hat das eigene Qualitäts-Gate nicht bestanden.
* VU enthält sich in 99 % der Fälle.
* Die Szenarien haben keinen belegten Vorteil.
* Konsequenz: keine einzelne Zählung als Wahrheit, Szenario zuerst, Elliott optional.

Diese Annahme wird mit dem ersten eingefrorenen Practitioner-Datensatz überprüft.

## Selbstkritik (§131)

1. **Vollständig genug?** Nein — leer.
2. **Welche Quellen dominieren?** Keine; das Quellenverzeichnis ist HKCM-lastig priorisiert (Auftrag), die 40-%-Grenze ist festgeschrieben, HKCM + Phantom zählen als eine Familie.
3. **Wie stark ist Publication Bias?** Unbekannt, vermutlich erheblich: HKCM wirbt mit Trefferquoten, ElliottWave-Forecast und Tiedje veröffentlichen sichtbar viele Erfolgsrückblicke (in der Discovery-Queue erkennbar). Die Ausschlussregeln für Rückblicke und der Stichprobenrahmen sind die Gegenmaßnahme.
4. **Wie sicher ist die Extraktion?** Nicht gemessen; die Doppelextraktion ist vorbereitet.
5. **Wie häufig widersprechen sich Praktiker?** Nicht gemessen — die wichtigste offene Zahl dieser Mission.
6. **Ist die exakte Zählung ein sinnvolles Ziel?** Wahrscheinlich nicht als einziges. Deshalb messen die Kennzahlen A1/A2, B und S die Struktur getrennt von der exakten Zählung (F/G).
7. **Wo unterscheidet sich VU am stärksten?** Erwartung, nicht Befund:
   * Enthaltung: VU schweigt dort, wo Praktiker fast immer zählen.
   * Grad.
   * Laufende Impulse.
8. **Ist VU zu konservativ?** Gegenüber Praktikern sehr wahrscheinlich ja (99 % Enthaltung). Ob das falsch ist, kann erst der Vergleich zeigen; die Kennzahl J ist dafür gebaut.
9. **Systematisch falscher Grad?** Synthetisch ja (Mission III/IV); gegenüber Praktikern unbekannt. Die VU-Gradabbildung auf Praktiker-Grade ist nur eine Näherung über die Wellendauer.
10. **Sind Praktiker instabil?** Unbekannt; die Revisionsrate je Quelle ist implementiert.
11. **Brauchen wir trotzdem bezahlte Blind-Annotatoren?** Ja — umso mehr, da öffentliches Material selektiert ist und hier nicht einmal erreichbar war. Die Experten-Werkbank (Mission IV) und die Practitioner-Seite ergänzen sich: Blindannotation liefert unselektierte Urteile zu denselben Fällen.
12. **Wissenschaftlich sauberster nächster Schritt?**
    1. Zugang herstellen (Netzwerkfreigabe oder menschliche Extraktion).
    2. Je Quelle den Stichprobenrahmen vorab committen.
    3. Pilot mit 20–30 Fällen und 25 % Doppelextraktion.
    4. Freeze von V1.
    5. Einmaliger blinder Lauf mit elliott-3.2.2.
    6. Erst dann Fehleranalyse und die Entscheidung über 3.3 und HOLDOUT-4.
