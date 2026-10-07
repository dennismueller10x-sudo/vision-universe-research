# Mission X: Freeze der Elliott Setup Library V1 vor VAL

Committet **vor** der Erzeugung und Auswertung der VAL-Ereignisse (Titelhälfte 1/2). Danach ändern sich Definitionen, Kontrollen und Einstufungsregeln nicht mehr.

| Datei | SHA-256 (16) |
|---|---|
| `scripts/technical/elliott-setups/ELLIOTT_SETUP_SPEC.json` | `b7dd89d58cefb77c` (Spec-Version 1.0.0) |
| `scripts/technical/elliott-setups/setup-library.mjs` | `8995b9692371a728` |
| `scripts/technical/elliott-setups/historical-events.mjs` | `dd0a0a1aedcdd8ca` |
| `scripts/technical/elliott-setups/evaluate-setups.mjs` | `4517aacc389ca30c` |
| `scripts/technical/elliott-setups/decide-setups.mjs` | `726dd8ad891ad89c` |

Engine: `elliott-3.2.2` / `ti-scenario-1.2.1`, Datei-Hashes identisch mit dem Mission-VIII-Freeze.

## Was DEV (Titelhälfte 0/2, verbrauchte Daten) geprüft hat

DEV diente nur der Implementierung und Fehlersuche. Keine Setup-Definition, keine Schwelle und keine Kontrolle wurde wegen eines Ergebnisses geändert. Behoben wurden ausschließlich Implementierungsfehler:

1. **Deduplizierung:** Ein Setup zählt beim ersten Auftreten je Elliott-Zählung. Für die angezeigte Variante (PURE) zusätzlich beim ersten **angezeigten** Auftreten, falls die Zählung zuerst enthalten war.
2. **Per-Bar-Titel des Mission-VIII-Replays** (Hash mod 20 = 0, 284 Titel) tragen versiegelte Zählungen **mit** Persistenzkette. Die Setup-Evidenz nutzt wie das Register die zustandslose Engine-Sicht. Diese Titel werden ausgeschlossen, damit Historie und Register dieselbe Konvention haben. Die Abweichung von 3,6 % der Kandidaten ist damit vollständig erklärt.
3. **Langfrist-MAE:** Die Kennzahl „medianMae“ zeigte das Höchstvielfache. Korrigiert; die MFE wird getrennt ausgewiesen.

## Strukturelle Befunde aus DEV (keine Anpassung, nur Dokumentation)

* Die eingefrorene Engine setzt eine laufende Impulswelle 2/3 **nie** und Welle 4 kaum als Primärzählung. S1 und S2 sind deshalb als angezeigte Setups praktisch leer. S1 wird über die Forschungskohorte RESEARCH_ONLY_INTERNAL_WAVE3 beobachtet.
* Bei abgeschlossenen Korrekturen liegt der Kurs bei Erkennung oft schon jenseits der Projektionszone („NO_PROJECTION_BEYOND_PRICE“).
* Der Modifikator M_HD_ALIGNED (höherer Grad gleichgerichtet) ist bei abgeschlossenen Mustern fast nie erfüllt. Die laufende Welle des höheren Grades enthält die gerade beendete Korrektur und zeigt deshalb gegen die Setup-Richtung (DEV: 29 + 27 von rund 17.000 qualifizierten Ereignissen). Er wird **nicht** umdefiniert. Eine andere Lesart („höherer Grad selbst in Korrektur gegen die Setup-Richtung“) ist eine Hypothese für eine spätere Version und nur prospektiv prüfbar.

VAL (Titelhälfte 1/2) ist mit diesen Definitionen noch nie ausgewertet worden, liegt aber auf verbrauchten Wochendaten (Mission I–IV, VIII, IX). Die höchste historisch erreichbare Stufe ist darum LEVEL 2 (INCREMENTAL UTILITY auf verbrauchten Daten). ROBUST EDGE ist nur prospektiv erreichbar.
