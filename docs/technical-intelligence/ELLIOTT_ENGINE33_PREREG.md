# Engine 3.3 — Vorab festgelegte Abnahme (Mission VI)

Stand: 05.10.2026. Festgelegt **vor** dem einmaligen VALIDATION-Lauf des Kandidaten. Auf DEVELOPMENT wurden bereits mehrere Varianten gemessen (`elliott-forensics/variants-development.json`, Skript `variant-eval.mjs`). Keine Holdouts gelesen, weder synthetisch noch Practitioner.

## Kandidat

`elliott-3.3.0-candidate`, ausschließlich zwei Änderungen gegenüber elliott-3.2.2, jede mit Methodenbasis:

| Änderung | Problem (Forensik) | Methodenbasis |
|---|---|---|
| Ähnlichkeitsschranke der Suche aus (`noSimilarity`) | Die Suche verwirft Pfade, deren benachbarte Wellen weder im Preis noch in der Zeit mindestens 1/3 erreichen. Die Schranke stammt aus NEoWave, ist aber in der VU-Quellenmatrix ausdrücklich **keine** VU-Regel (`sources.js`, priceSimilarity: „VU nutzt sie nicht als Regel“). Sie entfernt praktikernahe Impulslesarten. | EWP kennt keine solche Regel. Die Proportion bleibt als Richtlinie bzw. Rangmerkmal erhalten. |
| Trendkontext `COUNTER_DEVELOPING`, Gewicht 0,2 | Ein laufender Impuls verliert auf denselben Wellenenden systematisch gegen einen laufenden Zickzack: 1-2-3 gegen A-B-C, VU-Vollständigkeitsheuristik. | EWP: Korrekturen laufen gegen den Trend des nächsthöheren Grades. Nur laufende Lesarten, die eine Korrektur gegen den Trend unterstellen, werden abgewertet; alles andere bleibt neutral. |

## Abnahmekriterien (synthetischer Korpus VALIDATION, Layouts A und C1, einmaliger Lauf)

Bestanden, wenn **alle** Kriterien erfüllt sind:
1. G1 (A und C1) ≥ Ausgangslage 3.2.2 im selben Lauf.
2. G8 (Regelverletzungen innerhalb der Wellen) = 0. G6 (falsche Annahme negativer Fälle) ≤ Ausgangslage.
3. Motiv-Wahrheit als Motiv gelesen (A und C1): mindestens 5 Prozentpunkte über der Ausgangslage.
4. Korrektur-Wahrheit fälschlich als Motiv gelesen (A und C1): höchstens 3 Prozentpunkte über der Ausgangslage.
5. Enthaltungsquote nicht unter Ausgangslage − 5 Prozentpunkte (keine Vertrauensinflation).

Die Practitioner-Fälle aus VALIDATION (5 Impulsfälle, 4 Korrekturfälle) werden nur berichtet. Bei n = 5 sind sie kein Kriterium.

## Danach

* **Bei Bestehen:**
  1. Unabhängiges Red-Team (§57).
  2. Freeze mit Engine-Version, Regelversion, Commit, Parameter-Hash, Datenmodus Close-only und Vorverarbeitung.
  3. Danach **einmalig** die 43 versiegelten Practitioner-Holdout-Fälle öffnen („PRACTITIONER HOLDOUT“, nicht HOLDOUT-4).
* **Bei Nichtbestehen:** kein 3.3, Holdout bleibt versiegelt.
* **Produkt:** Die Produktivschaltung ist ein eigener Schritt. Elliott bleibt in jedem Fall EXPERIMENTAL STRUCTURE MODEL, ohne Prognosegewicht.

## Nachtrag — Offenlegung nach dem Red-Team (05.10.2026)

Diese Präregistrierung war **nicht** sauber; Befunde des Red-Teams, reviews/ELLIOTT_33_REDTEAM.md:
* **VALIDATION schon gesehen:** Vor dem Festlegen der Kriterien lief bereits ein synthetischer VALIDATION-Lauf der Variante `trendPen02`, mit Practitioner-VAL (`variants-validation.json`, Commit f48386ec9). Der hier genannte „einmalige“ Lauf war der zweite Blick.
* **Ähnlichkeitsschranke nachträglich:** Sie wurde erst nach diesem Blick hinzugefügt. Ihr Anstoß stammt aus einer Practitioner-Ablation auf DEV und VAL.
* **Practitioner-VAL sind Entwicklungsdaten:** Sie sind keine unabhängige Prüfung.

Das bestandene Ergebnis begründet deshalb **keinen** Freeze. Der Kandidat heißt jetzt `elliott-3.3.0-rc1` und ist nur ein Forschungsprofil. Practitioner-Holdout bleibt versiegelt.
