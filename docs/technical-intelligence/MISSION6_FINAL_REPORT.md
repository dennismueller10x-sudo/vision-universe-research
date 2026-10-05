# Mission VI — Abschlussbericht (Impuls-Forensik, OHLC-Studie, Human-Audit, Engine-3.3-Entscheidung)

Stand: 05.10.2026. Branch `claude/vision-universe-technical-intelligence-cxarnz`.

> Diese Mission sollte Elliott nicht besser aussehen lassen. Sie sollte drei Fragen klären: Bekommt die Engine die richtigen Marktdaten? Ist Elliott richtig umgesetzt? Taugen die Praktiker-Referenzen als Maßstab? **PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.**

## Status

| Bereich | Status |
|---|---|
| Elliott-Engine | **elliott-3.2.2 unverändert** (Ausgabe byte-identisch); Forensik-Zähler und Forschungsoptionen standardmäßig aus |
| Engine 3.3 | **NOT BUILT** — Kandidat `elliott-3.3.0-rc1` nicht eingefroren (Red-Team §57) |
| Practitioner-Holdout (43) | **VERSIEGELT** — nicht geöffnet |
| Impulsursache | **gefunden:** Impulse werden erzeugt, verlieren im Rang (Unterteilung, Vollständigkeit, Dominanz) |
| OHLC | **kein Gewinn**; Elliott in VU ist eine Schlusskurs-Methode; OHLC keine Voraussetzung |
| Human-Extraktions-Audit | **READY** (20 Fälle, blind, Seite + CSV/JSON + Import → V1.1) — kein Reviewer, keine Ergebnisse |
| Prognoseevidenz | **NOT ESTABLISHED** (kein neuer Prognosetest) |
| Produkt | EXPERIMENTAL STRUCTURE MODEL, Szenario zuerst, Elliott optional |

## Antworten auf §93

1. **Warum hat VU keine Impulse erkannt?** Erzeugt werden sie: In 25/25 Fällen gibt es gültige Impulslesarten, in 12 davon praktikernah. Sie verlieren aber im Rang gegen abgeschlossene Korrekturen (W-X-Y, Dreieck) oder laufende Zickzacks.
2. **Anteile:**

   | Ursache | Anteil |
   |---|---:|
   | Engine-Regeln | 0 % |
   | Pivots | 0 % |
   | Kandidatenbeschnitt | 0 % |
   | Rang: Unterteilung | 60 % |
   | Rang: Vollständigkeits-Heuristik | 24 % |
   | Rang: Dominanz | 16 % |
   | Grad | 0 % als alleinige Ursache |
   | Datenauflösung | nicht behebbar durch OHLC |
   | Enthaltung | sekundär |
   | Practitioner-Unsicherheit | nicht bezifferbar, Audit offen |

3. **Labeln Praktiker nach dem Audit wirklich ~62/78 als Impuls?** Unbekannt; es gibt noch keinen Audit. Bei den geöffneten Fällen sind es 27/35. Die Familie ist das stabilste Extraktionsfeld (LLM A↔B 95,7 %).
4. **Ändert HIGH-only das Ergebnis?** Nein. Bei 7/7 HIGH-Impulsfällen ist der Impuls zu niedrig gerankt; der Mechanismus verschiebt sich etwas zur Vollständigkeit.
5. **Ändert der Ausschluss von BTC das Ergebnis?** Nein (16/16).
6. **Ändert der Ausschluss einer dominierenden Quellenfamilie das Ergebnis?** Nein: ohne EWF 15/15, ohne TradingView 10/10.
7. **Verbessert OHLC die Motiv-/Impulserkennung wesentlich?** Nein: 0/25 → 0/25 mit Hoch/Tief-Pfad, 0/12 → 1/12 in Tagesauflösung mit Hoch/Tief.
8. **Welche OHLC-Komponente zählt am meisten?** Für Impulse keine. Am stärksten verändert die Tagesauflösung die gewählten Muster.
9. **Stützt sich die übernommene Elliott-Methodik auf Intrabar-Extreme oder Schlusskurse?**
   * EWP: Regeln auf dem Kursverlauf bis zu den Extremen, kein Schlusskurs-Modus vorgeschrieben.
   * NEoWave: Hoch und Tief jeder Periode (Monowellen).
   * Praktiker: OHLC-Charts.
   * VU: nur Schlusskurse.
   * Eine wörtliche EWP-Belegstelle ist offen.
10. **War die Engine zu streng?** Bei den klassischen Regeln nein. Bei VU-Heuristiken teilweise (Ähnlichkeitsschranke, Vollständigkeit).
11. **Gab es gültige Impulse, die beschnitten wurden?** Nein. Sie wurden niedrig gerankt, nicht beschnitten.
12. **Ist übertriebene Enthaltung das Hauptproblem?** Nein. Die enthaltenen Zählungen sind in keinem Fall Impulse.
13. **Ist der Grad noch das Hauptproblem?** Hier nicht. Die Skalen-Ablation ändert nichts.
14. **Sind laufende Impulse besonders problematisch?** Ja: 22/25 Practitioner-Fälle sind laufend, und synthetisch werden laufende Motivmuster nur zu ≈ 12 % als Motiv gelesen.
15. **Ist Engine 3.3 gerechtfertigt?** Ein Kandidat war begründbar (Fall B/C). Das Red-Team hat seinen Freeze aber zu Recht verhindert. **Nicht gebaut.**
16. **Falls ja, was hat sich geändert?** Entfällt. Zur Dokumentation: rc1 hat keine Ähnlichkeitsschranke und wertet laufende Gegentrend-Lesarten ab. Nur ein Forschungsprofil.
17. **Hat 3.3 die Entwicklungsdaten ohne neue Regelverletzungen verbessert?** Auf synthetischen DEV-Daten bei der Motivlesart ja (+13 Pp., G8 = 0). Die falsche Motivlesart stieg auf etwa das Dreifache; Practitioner-DEV: 3/20 Haupt-, 7 Alternativzählungen, budgetabhängig.
18. **Hat 3.3 das unabhängige Red-Team bestanden?** Nein: DO NOT FREEZE.
19. **Wurde der Practitioner-Holdout geöffnet?** Nein.
20. **Holdout-Ergebnisse?** Keine.
21. **Ist VU den Praktikern deutlich näher?** Nein. Die Ausgabe ist unverändert; VU enthält sich in allen geöffneten Fällen.
22. **Ändert das die Prognoseevidenz?** Nein: NOT ESTABLISHED.
23. **Braucht es weiterhin bezahlte menschliche Experten?** Ja, für zwei Dinge:
    * den Extraktions-Audit; das Paket ist fertig;
    * gleichzeitige, unselektierte Zählungen für die Übereinstimmung zwischen Praktikern.

## Selbstkritik (§95)

1. **Könnte das Impulsversagen doch ein Extraktionsartefakt sein?** Nur teilweise.
   * Gegen ein Artefakt spricht: Die Familie ist das stabilste Feld (96 %).
   * Gegen ein Artefakt spricht: Das Versagen zeigt sich auch synthetisch mit bekannter Wahrheit (laufende Motivmuster ≈ 12 %).
   * Offen bleibt: Ein menschlicher Audit fehlt. Bei MEDIUM stimmt die laufende Welle nur zu 61 % überein.
2. **Ist der Practitioner-Satz zu impulslastig?** Ja, 77 % der geöffneten Fälle. Das ist Publikationsauswahl; die Fälle sagen nichts über Marktfrequenzen. Für die Frage „warum kein Impuls“ schadet es nicht, für jede Quote schon.
3. **Überanpassen wir an das, was Praktiker veröffentlichen?** Diese Gefahr war real: Die Ähnlichkeitsschranke wurde auf Practitioner-Fällen gefunden. Das Red-Team hat genau das gestoppt.
4. **Löst OHLC die Strukturerkennung oder ändert es nur Regelergebnisse?** Es ändert Wellenenden und Muster (60 %), kaum die Familie (9 %), und die Impulserkennung gar nicht. Auf dieser Engine löst es nichts.
5. **Hat eine 3.3-Änderung Praktiker-Stil statt Elliott-Methodik nachgeahmt?** Die Ähnlichkeitsschranke: ja, faktisch. Der Trendkontext: methodisch begründet, aber mit einem Generator geprüft, der die Regel selbst einbaut. Deshalb kein Freeze.
6. **Sind Abweichungen zwischen Datenquellen noch relevant?** Kaum. Die Wochenschlüsse stimmen exakt, außer bei älteren NVDA- und TSLA-Wochen (Split-Rekonstruktion, offen). Unterschiede zwischen Futures, CFD und Kasse der Praktiker bleiben unvermeidbar.
7. **Ist die Enthaltung zu konservativ?** Für die Ausgabe nicht. Solange die Rangfolge Korrekturen bevorzugt, wäre weniger Enthaltung schlechter.
8. **Sind die Grad-Etiketten noch unzuverlässig?** Ja, aber hier nicht der Engpass. Praktiker nennen selten einen Grad, die VU-Abbildung bleibt eine Näherung.
9. **Sind Praktiker konsistent genug als Referenz?** Unbekannt. Es gibt nur 1 Mensch–Mensch-Paar und keinen Audit. Als Maßstab für die Familie (Motiv/Korrektur) taugen sie eher als für die genaue Welle.
10. **Größte verbleibende Unsicherheit:** Ob die Motivwellen auf realen Kursen tatsächlich eine sichtbare 5er-Struktur haben (dann ist es ein VU-Messfehler) oder ob Praktiker Impulse zählen, die die Kurse nicht hergeben (dann wäre VUs Zurückhaltung richtig). Ohne unabhängige menschliche Blind-Annotation ist das nicht entscheidbar.

## Wichtigste Artefakte

| Was | Wo |
|---|---|
| Forensik-Zähler (neutral), Profile, Optionen | `quant/engines/technical/elliott/elliott-v3.js` |
| Forensik, Taxonomie, OHLC, Varianten, Debug-Daten | `scripts/technical/elliott-forensics/` |
| Ergebnisse (ohne lizenzierte Kurse) | `quant/data/technical-intelligence/elliott-forensics/` |
| CI-Studie (runner-privat) | `.github/workflows/elliott-ohlc-study.yml` |
| Impuls-Debug-Ansicht | `quant/research/elliott-impulse-debug/` |
| Human-Audit (blind) | `quant/research/practitioner-audit/`, `practitioner-v1/human-audit/`, `scripts/technical/practitioner/human-audit.mjs` |
| Berichte | ELLIOTT_IMPULSE_FORENSICS.md, OHLC_ELLIOTT_STUDY.md, PRACTITIONER_HUMAN_AUDIT.md, ELLIOTT_ENGINE33_REPORT.md, ELLIOTT_ENGINE33_PREREG.md, reviews/ELLIOTT_33_REDTEAM.md |
| Tests | `quant/tests/elliott-forensics.test.mjs` (11), `practitioner-human-audit.test.mjs`, `elliott-impulse-debug-page.test.mjs` |

**Kosten:** keine neue Sammlung. Ein CI-Lauf mit ≈ 31 Anfragen beim bestehenden Anbieter. Alles Übrige lokal.
