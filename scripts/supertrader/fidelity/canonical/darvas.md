# Kanonisches Regelbuch Nicolas Darvas – R15 (darvas-canonical-1.0.0)

Stand 05.10.2026 · nur lesend geprüft · JSON: `rulebook-DARVAS.json` (35 Darvas-, 12 TraderFox-, 12 Trend52-Regeln)

## 1. Drei Systeme – strikt getrennt
| System | Was es ist | Quelle | Im Code |
|---|---|---|---|
| **DARVAS ORIGINAL** | Box-Ausbrüche, Kauforder am Ausbruchspunkt, Stop knapp unter der Kauforder, 5–6 Titel, Wachstumsfirmen | TIME 1959/1960 (Volltext); Buch 1960 nur aus Kenntnis (≤ MEDIUM) | DARVAS_BOX 3.0.2 (VU-Variante) |
| **NEO-DARVAS (TraderFox)** | Monatliches 10-Titel-Trendfolgedepot: ≥ 70 %/100 % seit Tief, neues Hoch, Marktampel, Rang „Trendstabilität" | traderfox.de 2018–2021 (Volltext) | – (nicht reproduzierbar: Trendstabilität, Kundenbereich) |
| **VU Trendfolge 52W 1.0.0** | Eigene VU-Methode nach der öffentlichen „Pivotal-Points"-Fassung | PREREGISTRATION-R12 | rotation-52w.mjs |

Trend52 enthält **keinen** Darvas-Baustein (keine Box, kein Stop, kein Volumen). Der Name „Darvas" kommt nur über die TraderFox-Ehrung.

## 2. Darvas-Kanon (Layer A)
| ID | Regel | Beleg | Konf. | Live 3.0.2 |
|---|---|---|---|---|
| FUND-01 | Nur wachsende Firmen junger Branchen, Gewinne könnten sich verdoppeln/verdreifachen; KGV/Dividende egal | TIME 1959 | HIGH | **fehlt** |
| FUND-02 | Techno-Fundamentalist (Technik = Zeitpunkt, Fundament = Auswahl) | Buch | MEDIUM | fehlt |
| SEL-01 | Beobachten, wenn Aktie mit starkem Volumen gut steigt | TIME 1959 | HIGH | teilweise (ohne Volumen) |
| SEL-02 | Neue (historische) Hochs | Buch/TF-Paraphrase | MEDIUM | 90/95 % des 52W-Hochs (VU) |
| SEL-03 | Wochen/Monate beobachten | TIME 1959 | HIGH | Verfall 30 Sitzungen (VU) |
| BOX-01 | Steigende Boxfolge, Pendeln zwischen Ober-/Unterkante | Buch | MEDIUM | formalisiert (VU) |
| ENTRY-01 | Kauforder liegt am Ausbruchspunkt | TIME 1959 | HIGH | **ja** (Kauf-Stop an Oberkante) |
| VOL-01 | Volumen bestätigt | TIME/Buch | MEDIUM | nur Klassifikation (1,5×, VU) |
| STOP-01 | Stop knapp unter der Kauforder, zugleich gesetzt | TIME 1959 | HIGH | ja, aber 1 % (VU) |
| STOP-03 | Mit Gewinn Stop knapp unter Unterstützung (= neue Boxunterkante) | TIME 1959 + Buch | HIGH/MED | ja, ohne Puffer |
| EXIT-01 | Kein Kursziel; Verkauf über Stop | TIME 1959 | HIGH | ja |
| PYR-01 | Nachkauf in höhere Boxen | Buch | MEDIUM | **fehlt** |
| SIZE-01 | Große Blöcke, Kredit; keine %-Risikoregel | Buch | MEDIUM | 0,5 % Kullamägi + Kappe 1/6 |
| PORT-01 | 5–6 Aktien gleichzeitig | TIME 1959 | HIGH | **ja** (6) |
| MKT-01 | Kein Indexfilter; Baisse → Stops → Cash | Buch | MEDIUM | + TraderFox-Ampel |

UNRESOLVED (Buch nicht abgerufen): exakte Boxregel (3 Tage?), Aufschlag über Oberkante, Stopabstand in Punkten, Pyramiding-Mengen, Verkauf „falsch verhaltender" Titel, Kredit, „100 % seit Tief".

## 3. Herkunft jeder Code-Regel (DARVAS_BOX 3.0.2)
| Code-Regel | Herkunft | Ort |
|---|---|---|
| Kauf-Stop an Boxoberkante | **DARVAS ORIGINAL** | darvas-v3.mjs:25-33 |
| Stop 1 % unter Kauforder | Prinzip ORIGINAL, **1 % = VU** | darvas-v3.mjs:30, darvas-v2.mjs:15 |
| Nachziehen an neue Boxunterkante | DARVAS ORIGINAL (Box-Formel VU) | darvas-v2.mjs:21-28 |
| Max. 6 Positionen | **DARVAS ORIGINAL** | darvas-v3.mjs:35 |
| Marktampel SPY > GD 200 | **TRADERFOX** | darvas-v302.mjs:10-11, portfolio.mjs:101,178-185 |
| „100 % seit Tief" | TRADERFOX (Darvas-Zuschreibung unbelegt) – nicht in DARVAS_BOX | rotation-52w.mjs:22 |
| 70-%-Regel | TRADERFOX (2018) | rotation-52w.mjs:23 (BASE, inaktiv) |
| 20-Tage-Hoch | DARVAS_BOX: VU (Box-Oberkante); Trend52: TRADERFOX | darvas.mjs:15; rotation-52w.mjs:19 |
| Nähe 52W-Hoch 90/95 % | VU | darvas.mjs:16,21 |
| Momentum-Perzentil ≥ 80 | VU (Eintrittstor!) | darvas.mjs:17,109-111 |
| 3-Tage-Box | OTHER (Sekundärrekonstruktion, TF-Zuschreibung) | darvas.mjs:14,76-95 |
| Boxhöhe 3–25 % | VU | darvas.mjs:19-20 |
| Trendstabilität | TRADERFOX, nicht öffentlich → Trend52: Clenow (OTHER) | rotation-52w.mjs:37-49 |
| RS-Rang | VU | darvas-v301.mjs:10, portfolio.mjs:44 |
| Gewicht 1/6 | VU (aus 6 Plätzen) | darvas-v301.mjs:10 |
| Risiko 0,5 % (KK-RISK-01) | OTHER (Kullamägi) | backtest.mjs:11 |
| Cooldown 5 Sitzungen | VU | simulator.mjs:28 |

## 4. Ist der 1-%-Stop original? – Nein
- Code: `stop = Boxoberkante × 0,99` – 1 % unter der **Kauforder/Oberkante**, nicht unter der Boxunterkante. Bei Gap-Eröffnung liegt er > 1 % unter dem Fill.
- TIME 1959: Stop „just below his buy order" – ohne Zahl. Das Roulette-Bild (100 $ → 98 $) deutet etwa 2 % an, ist aber nur eine Analogie. TIME 1960 (40 → 38) erklärt Stop-Orders allgemein.
- Nachziehen im Code: genau auf die neue Unterkante, ohne „knapp darunter".
- Urteil: VU_FORMALIZATION, Schwere HIGH. Die Regel erzeugt viele Ausstopps in der normalen Tagesschwankung (R14).

## 5. Fidelity DARVAS_BOX 3.0.2
| Einstieg | Ausstieg | Größe | Portfolio | Fundament | Marktregime |
|---|---|---|---|---|---|
| PARTIAL | PARTIAL | LOW | PARTIAL | NONE | FOREIGN (TraderFox) |

**Replikationsanspruch: NICHT zulässig.**

## 6. Vermischungen (Code/Doku)
1. `registry.mjs:320,336,337,340,381,383`: Live-Texte sind veraltet (Schlusskurs-Einstieg, Initialstop an der Unterkante) und stehen weiter in `supertrader/data/registry.json`.
2. `darvas-v302.mjs:4` nennt die Marktampel TraderFox, `:11` nennt sie „VU". Tatsächlich ist sie eine Fremdregel im Darvas-Modell.
3. `process-chain.mjs:44`: „Portfolioplatz" (1/6, Ampel) ist als ORIGINAL markiert. `:46` nennt TIME 1960 statt TIME 1959.
4. `fidelity.mjs:182-190`: Die Darvas-Tabelle hat keine Zeilen für Marktampel, RS-Rang und 0,5 % Risiko.
5. `registry.mjs:330` (Evidenz MULTI_SOURCE für VU-Schwelle) und `:349` („keine Portfolioformel" trotz DAR-PORT-01).
6. `model-portfolio.mjs:20-23`: RS-Rang mit „Quellen bevorzugen die stärksten" begründet. Für Darvas gibt es dafür keinen Beleg.
7. `backtest.mjs:11`: Die Kullamägi-Risikozahl dient als Darvas-Größenregel.
8. `docs/SUPERTRADER_AUDIT_R13.md:74`: Die Marktampel ist ohne TraderFox-Kennzeichnung genannt. `docs/SUPERTRADER_METHOD_FIDELITY.md:46,196-197` ist veraltet.
9. `registry.mjs:372`: Donchian-/Turtle-Quellen stehen in der Darvas-Quellenliste.
10. Wurzel der Vermischung: TraderFox (Art. 780/795) schreibt Darvas 100 % seit Tief, die 3-Tage-Box und die Allzeithoch-Bedingung zu.
11. Korrekt getrennt: `rotation-52w.mjs:1-3`, `registry-r12.mjs:2-3,45`, `fidelity.mjs:57`.

## 7. R14-Aussagen
- **Bestätigt:** 1 % = Oberkante × 0,99; 1 % ist enger als das 2-%-Bild; TIME beschreibt keine Box; 6 Positionen sind original; 0,5 % stammt von Kullamägi; die Ampel ist TraderFox; Gewinnfilter, Volumen und Pyramiding fehlen; der Cooldown ist VU; die Trend52-Trennung stimmt.
- **Teilweise:** Nachziehen (ohne Puffer); „Nähe zum Hoch nicht Darvas" (die Idee ist Darvas-nah, die Schwellen sind VU).
- **Unscharf:** Die Empfehlung „Box-Stop nach Darvas' eigener Beschreibung". Belegt ist nur „knapp unter der Kauforder".
- **Ungenau:** Zeilenangabe portfolio.mjs:97,174-181 (richtig: 101,178-185).

## 8. Replikationsdesign „DARVAS_CANON" (Forschung, vorab registrieren, vorwärts)
1. Buch beschaffen und Fundstellen für Box, Kaufpunkt, Stop, Pyramiding und Volumen belegen. Vorher gelten diese Regeln als UNRESOLVED.
2. Nur Layer A umsetzen:
   - Kauf-Stop über einer bestätigten Box an neuem Hoch.
   - Initialstop knapp unter der Kauforder, Raster {0,5 %, 1 %, 2 %, 1/8 Punkt}; als Gegenvariante die Boxunterkante.
   - Nachziehen knapp unter jede neue Unterkante; kein Kursziel.
3. Auswahl:
   - Kein Momentum-Perzentil, keine Ampel.
   - Volumen als Variante.
   - Gewinnfilter aus SEC-Daten zum Stichtag; die Schwelle setzt VU vorab fest.
4. Portfolio: 5–6 Titel, Startgewicht 1/6, Pyramiding beim nächsten Box-Ausbruch; Kredit nur als Sensitivität.
5. Gleichtags-Reihenfolge mit Minutendaten klären. Vergleich mit SPY und dem RS-Dezil, getrennte Teilzeiträume, Zufallsreihenfolgen.
6. Name des Ergebnisses: „VU-Rekonstruktion nach Darvas" – nie „Original".

## 9. Antworten
- **Was ist original?** TIME 1959: Volumen-Beobachtung, Wachstumsfirmen, Kauforder am Ausbruch, Stop knapp darunter, Nachziehen an Unterstützung, kein Kursziel, 5–6 Titel. Buch (MEDIUM): Boxen, Pyramiding, Techno-Fundamentalismus.
- **Nicht reproduzierbar:** exakte Boxregel, Stopabstand, Pyramiding-Mengen, Ermessen; bei TraderFox Trendstabilität, Kundenbereich und Pivotal-News.
- **Umgesetzt:** Kauf-Stop, 1-%-Stop, Nachziehen, 6 Titel.
- **Fehlt:** Gewinnfilter, Volumen, Pyramiding, Konzentration, Stop-Puffer.
- **Fremd:** Marktampel (TraderFox), 0,5 % (Kullamägi), 3-Tage-Box (sekundär).
- **VU-eigen:** 1 %, 20-Tage-Oberkante, 3–25 %, 90/95 %, Perzentil 80, Liquidität, Fristen, Cooldown, 1/6, RS-Rang, A/B-Qualität; bei Trend52 Universum, SPY, Clenow, Timing.
- **Darf „Darvas" heißen?** Nur als „VU-Variante nach Darvas" mit offengelegten Fremd- und VU-Regeln. VU Trendfolge 52W nie als „Darvas".
