# Engine 3.3 — Unabhängiges Red-Team vor dem Freeze (Mission VI §57)

Stand: 05.10.2026. Der Prüfauftrag war rein lesend; Holdout-Zeilen wurden nicht gelesen, weder Practitioner noch synthetisch. Gegenstand war das Profil `elliott-3.3.0`, heute `elliott-3.3.0-rc1`. **Urteil: DO NOT FREEZE.** Der Practitioner-Holdout ist nicht gerechtfertigt.

| # | Schwere | Befund | Behandlung |
|---|---|---|---|
| 1 | CRITICAL | **Der „einmalige“ VALIDATION-Lauf war der zweite Blick.** `variants-validation.json` (01:54, Commit f48386ec9) enthielt schon einen VALIDATION-Lauf von `trendPen02`, auch mit Practitioner-VAL. Die Ähnlichkeitsschranke kam erst danach hinzu. Synthetisch ist sie gegenüber `trendPen02` netto negativ: G1 A 62,9 → 62,1; falsche Motivlesart 1,9 → 3,3 %. Die Präregistrierung (b60d7f0ed) verschwieg das. | Offengelegt (Nachtrag in ELLIOTT_ENGINE33_PREREG.md). Kein Freeze. Eine künftige Abnahme nur auf frischem Seed-Bereich mit getrennt vorab festgelegten Armen. |
| 2 | HIGH | **Die Ähnlichkeitsschranke wurde praktikerinformiert gewählt.** Die Ablation lief auf DEV **und** VAL (`openedCases()` lädt beide). Die Practitioner-VAL-Fälle sind damit Entwicklungsdaten und keine unabhängige Prüfung. | Practitioner-VAL gilt künftig als verbraucht. Benannt im Bericht. |
| 3 | HIGH | **Der Effekt hängt vom Suchbudget ab.** Mit 3.3 wird die Suche bei 25.000 Knoten in 21/24 Fällen abgeschnitten (3.2.2: 13/24). Bei 100.000 bzw. 250.000 Knoten weicht die Hauptzählung in 5–6 von 24 Fällen ab. Die Zahl der Dreieck-Hauptzählungen springt von 6 auf 13. | Kein Freeze. Ein künftiger Kandidat braucht budgetstabile Ergebnisse. |
| 4 | HIGH | **Der synthetische Trendvorteil ist teilweise zirkulär.** Der Generator stellt Motivmuster immer hinter einen Gegenzickzack (`elliott-corpus.mjs:178–181`), baut die EWP-Regel also selbst ein. `trendDirection` ist ein Jahrestrend und nur eine Näherung des höheren Grades. | Benannt. Nötig wäre eine Kontrolle mit Zufallskontext (Layout B, C2). |
| 5 | MEDIUM | **Die Abstände sind überwiegend Rauschen.** G1 A +0,8 Pp. entspricht ≈ 0,4 Standardfehlern. Die falsche Motivlesart hat sich etwa verdreifacht (1,0 → 3,3 %), die absolute Schwelle von 3 Pp. ließ das zu. | Kriterien müssen künftig relativ formuliert und durch Nicht-Unterlegenheit mit Konfidenzintervall abgesichert sein. |
| 6 | MEDIUM | **Die Auswahlspur ist nicht nachvollziehbar.** Die DEV-Läufe der übrigen Varianten wurden überschrieben. | Alle DEV-Varianten neu gerechnet und committet: `variants-development-all.json`. |
| 7 | MEDIUM | **Code und Text stimmen nicht überein.** `COUNTER_DEVELOPING` wertet **jede** laufende Gegentrend-Lesart ab, auch laufende Impulse, nicht nur Korrekturen. | Text in Code und Bericht korrigiert. Der Code bleibt, wie er gemessen wurde. |
| 8 | LOW–MEDIUM | **Profil-Integrität.** Aufrufer konnten das Profil übersteuern; die Gleichheit von Profil und gemessener Konfiguration war ungetestet. | Übersteuern ist jetzt verboten. Neuer Test belegt: Profil = gemessene Konfiguration. Name `elliott-3.3.0-rc1` (nicht eingefroren). |
| 9 | LOW | **OHLC-Studie, Produktionspfad:** Die letzte, unfertige Woche blieb erhalten. Das ist kein Look-ahead; A und B hatten denselben Eingang. | Behoben für künftige Läufe. Die committeten CI-Zahlen tragen die Abweichung (offengelegt). |

**Bestätigt in Ordnung:**
* Keine harten Regelverletzungen (G8 = 0; 0 HARD/DEFINITION-Fehler in Haupt- und Alternativzählungen).
* Keine Vertrauensinflation (HIGH 62 → 51).
* Kausalität des Trends gewahrt (nur Bars bis asOf).
* 3.2.2-Ausgabe unverändert (228 DEV-Fälle, 0 Unterschiede).
* `openedCases()` filtert vor dem Lesen. Die Versiegelung bleibt aber prozedural, weil die Holdout-Labels im Klartext im Repository liegen (KNOWN_LIMITATIONS 56).
