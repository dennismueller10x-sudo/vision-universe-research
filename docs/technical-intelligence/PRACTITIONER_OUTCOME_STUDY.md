# Practitioner Outcome Study — Pilot (Mission V)

Stand: 04.10.2026. **Status: PILOT, deskriptiv.** Keine Prognoseevidenz, keine Rangfolge einzelner Quellen, keine Produktaussage.

> **PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.**
>
> Diese Studie fragt etwas **anderes** als der Methodenvergleich: Was geschah nach Veröffentlichung tatsächlich am Markt?
>
> Sie lief erst nach der Versiegelung des Vergleichs, mit gleichem Freeze-Hash `7af25c9b…f489` und unverändertem `comparison.json`:
> * nach Protokoll-Nachtrag 6 neu: Seal `61b930627`, Studie `8d4393be7`;
> * die erste Fassung liegt unter `benchmark/archive-v1.0/`.
>
> Die Holdouts bleiben versiegelt.

Ausgabe: `quant/data/technical-intelligence/practitioner-v1/benchmark/outcome.json`, erzeugt mit `scripts/technical/practitioner/run-outcome.mjs`.

## 1. Aufbau

* **Fälle:** DEVELOPMENT + VALIDATION, 33 auswertbar. Alle haben vollständige Folgedaten (52 Wochen bzw. 252 Handelstage).
* **Kurse:** Schlusskurse der VU-Reihe ab dem Stichtag. Es gibt keine Intraday-Reihenfolge; bei Proxy-Reihen gilt der Abbildungsmaßstab.
* **Praktikerseite:** Richtung, Ziel T1/T2 und Invalidation wie extrahiert.
* **VU-Seite:** die **latente** Zählung von elliott-3.2.2. VU hat sich in allen 33 Fällen enthalten und dem Nutzer nichts gezeigt.

**Korrektur nach Nachtrag 6.** Im ersten Lauf hatten 2 BTC-Fälle wegen eines Datumsfehlers 0 Folgebars, wurden aber als „kein Ereignis“ gezählt. Jetzt werden sie mit 52 Folgewochen ausgewertet. Fälle ohne Folgebar würden als `NO_FORWARD_DATA` ausgeschlossen; in diesem Lauf kommt das nicht vor.

## 2. Ergebnisse (gepoolt)

| | Praktiker | VU (latent, nicht ausgegeben) |
|---|---:|---:|
| Richtung | UP 17 · DOWN 16 | UP 29 · DOWN 4 |
| Erstes Ereignis: Ziel T1 erreicht | 13 | 13 |
| Erstes Ereignis: Invalidation | 2 | 4 |
| Kein Ereignis im Horizont | 12 | 7 |
| Ohne verwertbare Niveaus | 6 | 9 |
| Median MFE (günstigste Bewegung) | +18,6 % | +33,5 % |
| Median MAE (ungünstigste Bewegung) | −14,9 % | −10,4 % |
| MFE größer als \|MAE\| | 21 / 33 | 24 / 33 |
| Praktiker revidierte vor dem Ergebnis | 3 | – |

Mediane bei gerader Fallzahl sind der untere Median (`outcome.mjs`). Bei n = 33 spielt das keine Rolle.

## 3. Einordnung

* **Unterschiede innerhalb der Stichprobe nicht unterscheidbar.** Es gibt keine Konfidenzintervalle (weniger als 5 Quellenfamilien-Cluster).
* **Kein Prognosebeleg.** VUs höhere Werte spiegeln vor allem die UP-Lastigkeit der latenten Zählung (29 von 33) in einer überwiegend steigenden Marktphase. Eine Regel „immer UP“ käme zu ähnlichen Zahlen. Das ist kein Hinweis auf Prognosefähigkeit.
* **Grenzen der Praktikerzahlen:**
  * Publikationsverzerrung: selbst gewählte öffentliche Beiträge.
  * Löschverzerrung: gelöschte Inhalte fehlen.
  * Auswahl: nur Tages- und Wochenzählungen auf VU-Reihen.
  * Unvollständige Archive.
  * Kursquellen-Abweichung bei Proxy-Reihen.
* **Keine Werbeaussagen.** Nichts davon ist eine Trefferquote eines Anbieters. Für HKCM gibt es 0 Fälle.

**Forecast Test: RUN (deskriptiv, Pilot) — keine Prognoseevidenz.**
