# PRACTITIONER_REFERENCE_V1 — Datensatzbericht

Stand: 04.10.2026. **Status: EINGEFROREN — Kennzeichnung „PRACTITIONER REFERENCE — PILOT“** (Qualitätsgate §107 verfehlt, siehe §4).

> Eine Praktiker-Zählung ist **PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH**.
> Extraktion: **LLM-dual aus Primärquelle, nicht menschlich geprüft** (Protokoll-Nachtrag 2). Der vorgesehene menschliche Audit (≥ 20 %) ist **BLOCKED**.

## 1. Freeze

| Feld | Wert |
|---|---|
| Datei | `quant/data/technical-intelligence/practitioner-v1/freeze/PRACTITIONER_REFERENCE_V1.jsonl` |
| Manifest | `…/freeze/PRACTITIONER_REFERENCE_V1.manifest.json` |
| SHA-256 | `7af25c9b5d61f0268f7049103076839e1dd43b3a2d9d24bc942290dd1133f489` |
| Schema | `practitioner-reference-1.2.0` |
| Zeilen / Fälle | 99 Zeilen = 78 Originalfälle + 21 spätere Fassungen (Revisionsketten) |
| Freeze-Commit | `8985c6a06`, **vor** jedem VU-Vergleich |
| Holdout-Quellenfamilie (im Manifest festgeschrieben) | `tiedje` (zweitgrößte Nicht-HKCM-Familie) |
| Aufteilung (Fälle) | DEVELOPMENT 26 · VALIDATION 9 · HOLDOUT_TEMPORAL 32 · HOLDOUT_SOURCE 11 · QUARANTINE 0 |

Korrekturen nach dem Freeze nur als neue Version (V1.1 …) mit Änderungsliste.

## 2. Entstehung

| Schritt | Beleg |
|---|---|
| Protokoll, Schema, Werkzeuge, Red-Team, Nachtrag 1 — vor jedem Fall | `PRACTITIONER_PROTOCOL.md`, `reviews/PRACTITIONER_PIPELINE_REDTEAM.md` |
| Nachtrag 2 (LLM-Doppelextraktion) — vor jeder Zeile | Protokoll |
| Pilot: 27 Elemente, 5 INCLUDED; Nachträge 3–4 vor Verwendung der betroffenen Daten | `PRACTITIONER_PILOT_LOG.md` |
| Nachtrag 5 (Rahmen EWF/Tiedje/TradingView, Stopp-Regel) **vor** der Ziehung (3bd4f414e → b9f3a4f1f) | Protokoll |
| Phase 2: 323 gezogen, 307 bearbeitet, 16 NOT_PROCESSED; Stopp am Budget (≈ 415 USD) | `PRACTITIONER_SCALING_LOG.md` |

Die Ziehung war systematisch und vorab festgelegt (Schrittweite, Start aus SHA-256, quellenübergreifende Reihenfolge aus SHA-256). Es wurde **nicht** nach Erfolg ausgewählt. Die Extrahierenden sahen keine späteren Kurse und keine VU-Ausgaben.

Die Mission wurde zwischen zwei Sitzungen aufgeteilt:
* Erfassung in einer eigenen Sitzung mit Netzzugang.
* Freeze, Vergleich und Ergebnisstudie in der koordinierenden Sitzung.

## 3. Zusammensetzung (78 Originalfälle)

| Merkmal | Verteilung |
|---|---|
| Quellenfamilie | ElliottWave-Forecast 45 (57,7 %) · André Tiedje 11 · TradingView cryptoknee 8 · yuchaosng 7 · thefifthwave 7 · **HKCM 0** |
| Zeitrahmen | 1W 47 · 1D 23 · 1M 8 |
| Jahr (Veröffentlichung) | 2022 14 · 2023 20 · 2024 12 · 2025 20 · 2026 12 |
| Instrumente | 44 (Aktie 52, Krypto 17 — alle BTC; BTC insgesamt 26 Zeilen (17 Originale + 9 Revisionen) —, ETF 3, CFD 2, Kassaindex 2, Future 1, Rohstoff 1) |
| Musterfamilie | MOTIVE 62 · CORRECTIVE 15 · UNKNOWN 1 |
| Extraktionssicherheit | HIGH 23 (29,5 %) · MEDIUM 55 |
| Abbildungsgüte (Zeilen) | EXACT 84 · PROXY_SAME_UNDERLYING 6 · PROXY_DIFFERENT_INSTRUMENT 9 |

**A↔B-Übereinstimmung der unabhängigen Durchgänge** (Phase 2, n = 290):

| Feld | Übereinstimmung |
|---|---:|
| Familie | 92,7 % |
| laufende Welle | 75,6 % |
| Richtung | 94,6 % |
| Invalidation | 92,4 % |
| Zeitrahmen | 96,4 % |
| Instrument | 99,0 % |

Die laufende Welle ist das unsicherste Feld. Bei 8 INCLUDED-Fällen wichen zwei oder mehr Kernfelder ab. Alle 8 wurden im dritten Durchgang C geschlichtet und tragen deshalb höchstens MEDIUM.

## 4. Freeze-Qualitätsgate (§107)

| Kriterium | Ziel | Wert | erfüllt |
|---|---|---:|---|
| unabhängige Quellenfamilien | ≥ 2 (besser 3) | 5 | ja |
| nutzbare Fälle | ≥ 100 | 78 | **nein** |
| HIGH-Anteil | ≥ 70 % | 29,5 % | **nein** |
| Instrumente / Jahre / Musterfamilien | ≥ 2 | 44 / 5 / 2 | ja |
| HKCM-Anteil | ≤ 40 % | 0 % | ja |

**Gate verfehlt → nach §9 „ehrlich berichten, Benchmark nur als Pilot kennzeichnen“.**

## 5. Ausschlüsse (Phase 2, 307 bearbeitete Elemente)

| Grund | Anzahl |
|---|---:|
| EXCLUDED: Zeitrahmen MIXED | 49 |
| EXCLUDED: Zeitrahmen INTRADAY | 34 |
| EXCLUDED: keine Prognose (Rückblick, Werbung, Lehrbeispiel) | 25 |
| EXCLUDED: Quelle unerreichbar (YouTube-Bot-Prüfung; nicht umgangen) | 14 |
| EXCLUDED: Zeitrahmen unbekannt | 2 |
| CANDIDATE: VU-Tagesreihe deckt den Stichtag nicht ab (US-Aktien 1D vor 05.09.2025) | 59 |
| CANDIDATE: Plausibilitätsband (Nachtrag 4) | 25 |
| CANDIDATE: sonstige | 5 |

## 6. Bekannte Verzerrungen und Grenzen

1. **Keine HKCM-Abdeckung.** YouTube blockiert den Abruf per Bot-Prüfung, hkcm.de ist nur für Mitglieder, das trading-treff-Archiv endet 2021. Entscheidung des Auftraggebers: ohne HKCM weiter. Jede Aussage über HKCM bleibt unbelegt.
2. **Quellenschwerpunkt.** ElliottWave-Forecast stellt 57,7 % der Fälle, knapp unter der 60-%-Grenze. Viele davon sind Impulsfortsetzungen bzw. „blue box“-Käufe, daher die MOTIVE-Schieflage.
3. **Publikationsverzerrung.** Die Beiträge sind öffentlich und von den Autoren selbst ausgewählt. Gelöschte Inhalte sind unsichtbar, Erfolgsrückblicke wurden ausgeschlossen.
4. **Zeitrahmen-Selektion.** Intraday- und gemischte Zählungen sind ausgeschlossen (83 Elemente). Der Datensatz zeigt nur die Teilmenge der Praktiker-Arbeit, die sich auf VU-Tages- und Wochenreihen abbilden lässt.
5. **Datenlücke.** VU-Tagesreihen für US-Einzelaktien beginnen am 05.09.2025. Ältere 1D-Aktienfälle blieben CANDIDATE (59), dadurch sind Wochencharts überrepräsentiert.
6. **Extraktion ohne Menschen.** Gemessen ist nur die Reproduzierbarkeit zwischen zwei LLM-Durchgängen, nicht die Richtigkeit gegenüber dem Autor.
7. **Revisionen** wurden nur unter gezogenen Elementen erkannt, es gab keine gezielte Nachextraktion (offen gelegte Abweichung, Skalierungsprotokoll).
8. **BTC-Häufung.** 26 von 99 Zeilen (17 der 78 Fälle) betreffen BTC. Es gibt keine Obergrenze je Instrument im Protokoll.

## 7. Nutzung

Der Vergleich (`run-benchmark.mjs --refs freeze/PRACTITIONER_REFERENCE_V1.jsonl`) rechnet nur DEVELOPMENT und VALIDATION. **Beide Holdouts bleiben versiegelt.** Sie sind für die Prüfung einer künftigen Engine 3.3 reserviert. Ergebnisse: [ELLIOTT_PRACTITIONER_BENCHMARK.md](ELLIOTT_PRACTITIONER_BENCHMARK.md), [PRACTITIONER_OUTCOME_STUDY.md](PRACTITIONER_OUTCOME_STUDY.md).

## 8. Nachtrag nach dem finalen Red-Team

* Der Datensatz selbst ist unverändert.
* Protokoll-Nachtrag 6 korrigiert Auswertungsfehler: Kennzahl B/F/G bei abgeschlossenen VU-Mustern, Ergebnisschicht ohne Folgedaten, zensierte Latenz.
* Der erste Lauf liegt unverändert unter `benchmark/archive-v1.0/`.
* Die Holdouts sind weiterhin versiegelt.
