# Engine 3.3 — Entscheidung (Mission VI, Track D)

Stand: 05.10.2026. **Entscheidung: KEIN Engine 3.3.**
* Produktion bleibt `elliott-3.2.2`, Ausgabe unverändert.
* Der Kandidat `elliott-3.3.0-rc1` existiert nur als versioniertes Forschungsprofil und ist nicht eingefroren.
* Der Practitioner-Holdout (43 Fälle) bleibt **versiegelt**.

Grundlagen:
* [ELLIOTT_IMPULSE_FORENSICS.md](ELLIOTT_IMPULSE_FORENSICS.md)
* [OHLC_ELLIOTT_STUDY.md](OHLC_ELLIOTT_STUDY.md)
* [PRACTITIONER_HUMAN_AUDIT.md](PRACTITIONER_HUMAN_AUDIT.md)
* [ELLIOTT_ENGINE33_PREREG.md](ELLIOTT_ENGINE33_PREREG.md) mit Offenlegung
* [reviews/ELLIOTT_33_REDTEAM.md](reviews/ELLIOTT_33_REDTEAM.md)

## 1. Voraussetzungen §50

| Voraussetzung | Stand |
|---|---|
| Impuls-Fehlertaxonomie | vorhanden: 25/25 gültige Impulslesarten, zu niedrig gerankt |
| Close- vs. OHLC-Experiment | vorhanden: kein Gewinn durch OHLC (CI, 33 Fälle, 12 Produktionstitel) |
| Aufschlüsselung der Enthaltung | vorhanden: 33/33, Hauptgrund W-X-Y-Deckel |
| Analyse des Kandidatenbeschnitts | vorhanden: kein Verlust in Vorauswahl oder Top-N |
| Stand des Extraktions-Audits | READY, keine Ergebnisse |
| Motiv/Korrektur-Vergleich | Practitioner 0/25 Motiv-Hauptzählung. Synthetisch werden Motivmuster nur zu 27 % als Motiv gelesen (A, DEV), laufende zu 12 %. |

## 2. Entscheidungsbaum §51

* **Fall A (Daten zuerst) — nein:** OHLC und Tagesauflösung ändern die Impulserkennung nicht.
* **Fall B (Impulse vorhanden, falsch gerankt) — ja, Hauptbefund:**
  * Rangverlust über Unterteilung (60 %), Vollständigkeits-Heuristik (24 %) und Dominanz (16 %).
  * Synthetisch nachgewiesen: Laufende Impulse verlieren auf denselben Wellenenden gegen laufende Zickzacks.
* **Fall C (Regeln strenger als die Methodik) — teilweise:**
  * Die klassischen harten Regeln sind korrekt umgesetzt.
  * Die NEoWave-Ähnlichkeitsschranke und die Vollständigkeits-Heuristik sind VU-Heuristiken, die strenger wirken als EWP.
* **Fall D (Extraktion zu unsicher) — offen:**
  * Die Familie stimmt zwischen den LLM-Durchgängen zu 96 % überein.
  * Kein menschlicher Audit.
* **Fall E (mehrere Ursachen) — zutreffend.** Die Abarbeitung erfolgte in der Reihenfolge der Evidenz:
  * Daten: geprüft, verworfen.
  * Rang: Kandidat entwickelt.
  * Extraktion: Audit vorbereitet.

## 3. Entwickelter Kandidat und warum er nicht eingefroren wird

`elliott-3.3.0-rc1` besteht aus genau zwei Änderungen:
* keine Ähnlichkeitsschranke in der Suche;
* Trendkontext `COUNTER_DEVELOPING` mit Gewicht 0,2. Jede laufende Lesart, deren Trend dem Jahrestrend widerspricht, erhält 0.

Gemessen wurden auf synthetischem DEVELOPMENT 20 Varianten, alle in `elliott-forensics/variants-development-all.json`. Dazu kommen Practitioner-DEV/VAL und VALIDATION.

| Variante (synthetisch DEV) | G1 A | Motivlesart A | falsche Motivlesart A | G1 C1 | Practitioner-DEV Impuls Haupt/Alt |
|---|---:|---:|---:|---:|---:|
| 3.2.2 | 60,6 | 26,6 % | 1,5 % | 20,7 | 0 / 0 |
| nur Trendkontext 0,2 | 63,1 | 39,6 % | 2,5 % | 23,3 | 0 / 0 |
| nur ohne Ähnlichkeitsschranke | 59,6 | 25,2 % | 3,3 % | 20,3 | 3 / 7 |
| rc1 (beides) | 62,5 | 39,3 % | 4,3 % | 22,9 | 3 / 7 |

**Warum kein Freeze** (Red-Team, alle Punkte bestätigt):
1. **VALIDATION doppelt gesehen:** Die „einmalige“ VALIDATION war der zweite Blick. Die Ähnlichkeitsschranke kam danach hinzu und ist synthetisch netto negativ.
2. **Praktikerinformierte Auswahl:** Die Ähnlichkeitsschranke hilft **nur** auf Practitioner-Fällen, also den Quellen EWF und TradingView. Das ist Imitation (§9, §55, §66).
3. **Budgetabhängig:** Der Practitioner-Effekt ändert sich mit dem Suchbudget. Mit 3.3 wird die Suche bei 25.000 Knoten in 21/24 Fällen abgeschnitten.
4. **Zirkulärer Trendvorteil:** Der synthetische Vorteil des Trendkontexts ist teilweise im Generator eingebaut.
5. **Rauschen statt Gewinn:** Die Zuwächse bei G1 liegen im Rauschen. Die falsche Motivlesart verdreifacht sich.
6. **Kein Produktnutzen:** Auch mit rc1 enthält sich VU in allen geöffneten Practitioner-Fällen. Der Nutzer sähe keinen Unterschied.

Die Variante **„nur Trendkontext“** ist die methodisch sauberere. Sie bewirkt auf Practitioner-Fällen aber nichts (0/20). Ein Bau rechtfertigt sich mit ihr nicht, denn §91 lässt „kein 3.3“ ausdrücklich zu.

## 4. Practitioner-Holdout (§53, §59, §60)

**Nicht geöffnet.** Es gab keinen Freeze. Erwartbar wären 0–3 von 43 Fällen gewesen, und VU enthält sich weiter überall. Der Practitioner-Holdout ist der letzte unabhängige Realtest, auch weil die VAL-Fälle in der Entwicklung verbraucht wurden. Er bleibt einer künftigen, sauber präregistrierten Engine vorbehalten.

## 5. Was eine künftige Engine 3.3 bräuchte

1. **Menschlicher Extraktions-Audit** des Pakets mit 20 Fällen. Erst danach steht fest, ob MEDIUM-Fälle in die Entwicklung dürfen.
2. **Frische synthetische Seeds** (z. B. 50–59). Darauf getrennt vorab festgelegte Arme: Trend allein, Trend kombiniert. Dazu eine Kontrolle mit Zufallskontext (Layout B/C2), Nicht-Unterlegenheit mit Konfidenzintervall und relative Grenzen für falsche Motivlesarten.
3. **Budgetstabilität:** gleiche Hauptzählung bei 25.000, 100.000 und 250.000 Knoten, oder ein höheres festes Budget.
4. **Eigentliche Ursache auf realen Kursen:** die Unterteilung von Motivwellen bei Rauschen. Möglicher Ansatz: ein Mehrdeutigkeitsmodell („unaufgelöst“ statt „3er-Struktur“) statt Rangstrafe. Das ist ein Forschungsprojekt, kein Parameter.
5. **Erst danach** Freeze, Hash-Bindung im Holdout-Läufer und einmaliges Öffnen des PRACTITIONER HOLDOUT.

## 6. Produktstatus (§63–§66)

Elliott bleibt **EXPERIMENTAL STRUCTURE MODEL**: kein Prognosegewicht, keine Wahrscheinlichkeit, kein „expert validated“.
* **Ohne Elliott:** Das Chartbild zeigt weiterhin Trend, Struktur, Unterstützung/Widerstand, Zonen, Szenarien, Momentum und Volatilität (unverändert seit Mission IV).
* **Enthaltung:** VU bleibt bewusst zurückhaltender als Praktiker. Weniger Enthaltung ohne Korrektur des Rangs würde Korrekturlesarten zeigen, wo Praktiker Impulse sehen.
