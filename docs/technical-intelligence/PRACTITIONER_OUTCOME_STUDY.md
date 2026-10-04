# Practitioner Outcome Study — Pilot (Mission V)

Stand: 04.10.2026. **Status: PILOT, deskriptiv.** Keine Prognoseevidenz, keine Rangfolge einzelner Quellen, keine Produktaussage.

> **PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.**
>
> Diese Studie beantwortet eine **andere** Frage als der Methodenvergleich: Was geschah nach Veröffentlichung tatsächlich am Markt? Sie lief erst, nachdem der Vergleich versiegelt war:
> * `comparison.seal.json` mit Commit `4faaa3acd`;
> * gleicher Freeze-Hash `7af25c9b…f489`;
> * unverändertes `comparison.json`.
>
> Die Holdouts bleiben versiegelt.

Ausgabe: `quant/data/technical-intelligence/practitioner-v1/benchmark/outcome.json`, erzeugt mit `scripts/technical/practitioner/run-outcome.mjs`.

## 1. Aufbau

* **Fälle:** DEVELOPMENT + VALIDATION, 33 auswertbar.
* **Horizont:** 252 Handelstage bei 1D-Fällen (15), 52 Wochen bei 1W-Fällen (18).
* **Kurse:** Schlusskurse der VU-Reihe ab dem Stichtag. Es gibt keine Intraday-Reihenfolge; bei Proxy-Reihen gilt der Abbildungsmaßstab.
* **Praktikerseite:** Richtung, Ziel T1/T2 und Invalidation wie extrahiert.
* **VU-Seite:** die **latente** Zählung von elliott-3.2.2. VU hat sich in allen 33 Fällen enthalten und dem Nutzer nichts gezeigt.

## 2. Ergebnisse (gepoolt)

| | Praktiker | VU (latent, nicht ausgegeben) |
|---|---:|---:|
| Richtung | UP 17 · DOWN 16 | UP 29 · DOWN 4 |
| Erstes Ereignis: Ziel T1 erreicht | 13 | 11 |
| Erstes Ereignis: Invalidation | 1 | 4 |
| Kein Ereignis im Horizont | 13 | 9 |
| Ohne verwertbare Niveaus | 6 | 9 |
| Median MFE (günstigste Bewegung) | +18,6 % | +22,8 % |
| Median MAE (ungünstigste Bewegung) | −10,8 % | −8,7 % |
| MFE größer als \|MAE\| | 21 / 33 | 22 / 33 |
| Praktiker revidierte vor dem Ergebnis | 2 | – |

## 3. Einordnung

* **Unterschiede innerhalb der Stichprobe nicht unterscheidbar.** Die Unterschiede liegen im Bereich weniger Fälle. Es gibt keine Konfidenzintervalle, weil weniger als 5 Quellenfamilien-Cluster vorliegen.
* **Marktphase.** Die VU-Werte spiegeln vor allem die UP-Lastigkeit der latenten Zählung in einer überwiegend steigenden Marktphase. Sie zeigen keine Prognosefähigkeit.
* **Grenzen der Praktikerzahlen:**
  * Publikationsverzerrung: selbst gewählte öffentliche Beiträge.
  * Löschverzerrung: gelöschte Inhalte fehlen.
  * Auswahl: nur Tages- und Wochenzählungen auf VU-Reihen.
  * Unvollständige Archive.
  * Kursquellen-Abweichung bei Proxy-Reihen.
* **Keine Werbeaussagen.** Nichts davon ist eine Trefferquote eines Anbieters. Für HKCM gibt es 0 Fälle.

**Forecast Test: RUN (deskriptiv, Pilot) — keine Prognoseevidenz.**
