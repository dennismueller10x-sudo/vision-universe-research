# `total_debt` — gemessene Optionen, Coverage und Semantik

Vorgelegt zur Owner-Entscheidung. **Nichts ist geändert.** Der Konzept-Zensus ist ein Bericht;
er verschiebt keinen veröffentlichten Wert, keine Abbildung und keine Kennzahl.

Quelle: `quant/data/sec/concept-census.json` · `census_logic 1.1.0` ·
Registry-Mapping `1.5.0` · **5.148 Emittenten** aus dem SEC-Sammelarchiv.

---

## Zuerst eine Korrektur am bisherigen Bild

Der Statusstand führte `total_debt` als „erster fehlender Input für 4.214 von 5.068 Emittenten".
Gemessen sieht es anders aus, und der Unterschied ist wesentlich:

**`total_debt` wird bereits abgeleitet, nicht substituiert.** `scripts/quant/sec/derived.py` führt
`total_debt = long_term_debt + short_term_debt` als dokumentierte Rekonstruktion; jede Zeile trägt
ein `derived`-Flag, das sagt, ob der Wert gemeldet oder gerechnet ist.

| | Emittenten |
|---|---:|
| exportiert | 5.069 |
| **mit `total_debt` (annual)** | **2.645** |
| davon direkt getaggt | 525 |
| davon abgeleitet aus LT + ST | 2.120 |
| ohne `total_debt` | 2.424 |
| — `long_term_debt` vorhanden, kurzfristig fehlt | 726 |
| — beides fehlt | 1.698 |

Es gibt also keine stille Substitution, die rückgängig zu machen wäre. Die Frage ist eine andere:
**ob die Zusammensetzung erweitert werden soll — und was das bedeutet.**

## Warum die Sammelangabe so dünn ist

Die Registry bildet `total_debt` auf genau zwei Konzepte ab. Der Zensus zeigt, dass US-Filer die
Sammelangabe schlicht nicht taggen, sondern die Bestandteile:

| Konzept | Emittenten | heute gemappt auf |
|---|---:|---|
| `us-gaap:LongTermDebt` | 2.875 | `long_term_debt` |
| `us-gaap:LongTermDebtNoncurrent` | 2.250 | `long_term_debt` |
| `us-gaap:LongTermDebtCurrent` | 2.088 | `short_term_debt` |
| `us-gaap:ShortTermBorrowings` | 1.345 | `short_term_debt` |
| `us-gaap:FinanceLeaseLiabilityNoncurrent` | 1.327 | **nicht gemappt** |
| `us-gaap:FinanceLeaseLiabilityCurrent` | 1.325 | **nicht gemappt** |
| `us-gaap:DebtLongtermAndShorttermCombinedAmount` | 513 | `total_debt` |
| `ifrs-full:Borrowings` | 354 | `total_debt` |

## Die fünf Optionen, gemessen

Ein **Fach** ist ODER-verknüpft über seine Konzepte, eine **Zusammensetzung** UND-verknüpft über
ihre Fächer. Gezählt wird das gemeinsame Vorkommen **je Emittent** — aus „1.327 tragen Tag X"
folgt nicht, ob das dieselben sind, denen heute etwas fehlt.

| Fach | Emittenten |
|---|---:|
| `LT` langfristig | 3.456 |
| `ST` kurzfristig | 3.050 |
| `FL` Finanzierungsleasing | 1.753 |
| `COMBINED` Sammelangabe | 864 |

| Option | Coverage | Δ zu heute | Was sie bedeutet |
|---|---:|---:|---|
| **A** nur gemeldete Sammelangabe | 864 | −2.065 | Der Registry-Stand ohne Ableitung. Nicht der Ist-Zustand. |
| **B** Sammelangabe, sonst LT + ST | **2.929** | — | **Das ist der heutige Zustand.** |
| **C** langfristig allein | 3.456 | **+527** | Weiteste Reichweite — und eine **andere Kennzahl**. Kurzfristige Schulden fehlen darin. Das ist keine Abdeckungslücke, die geschlossen wird, sondern eine andere Aussage unter demselben Namen. |
| **D** B **und** Finanzierungsleasing | 1.281 | **−1.648** | Verlangt das Leasing zusätzlich. Wer es nicht taggt, fällt heraus. |
| **E** B, ersatzweise Leasing allein | 3.401 | +472 | Semantisch am schwächsten: für 472 Emittenten wäre „Gesamtverschuldung" dann eine Leasingverbindlichkeit. |

**Option D dreht die Erwartung um.** Finanzierungsleasing wirkt wie ein Zugewinn, kostet als
*verlangter* Bestandteil aber 1.648 Emittenten. Als *optionaler* Summand bliebe die Coverage bei
2.929 — dann hieße `total_debt` aber für 1.281 Emittenten etwas anderes als für die übrigen 1.648,
je nachdem ob der Filer geleast hat. Ein Name für zwei Definitionen ist schlechter als eine engere
Definition.

**Damit gibt es keine Option, die `total_debt` nennenswert verbreitert, ohne zu ändern, was es
bedeutet.** Der größte Zugewinn (C, +527) ist genau die Substitution, die ausgeschlossen bleiben
sollte — und die Messung zeigt, dass diese Entscheidung nur 527 Emittenten kostet und dafür die
Bedeutung der Kennzahl erhält.

## Die Lücke ist keine Mapping-Lücke allein

1.692 Emittenten tragen **kein einziges** der langfristigen Schuldenkonzepte. Für sie hilft keine
Zusammensetzung. Ein Blick auf die Kohorte zeigt erwartete Fälle — Banken (JPMorgan, Bank of Nova
Scotia, Commerce Bancshares), Versicherer (Aflac, W.R. Berkley), REITs, Versorger — aber auch
Industriewerte, bei denen das nicht erklärbar ist: **Lumen Technologies** und **MasTec** tragen im
Export überhaupt keine Schuldenkennzahl, obwohl beide erhebliche Verbindlichkeiten haben.

Die Vermutung „das sind eben Finanzwerte" trägt also nicht. Es ist teilweise eine echte
Mapping-Lücke, und welche Konzepte diese Kohorte stattdessen benutzt, ist noch **nicht gemessen**.

## Was die hohen ungemappten Zahlen *nicht* sind

Die reichweitenstärksten ungemappten Konzepte sehen attraktiv aus und sind als Bilanzsumme falsch:

| Konzept | Emittenten | Warum es keine Gesamtverschuldung ist |
|---|---:|---|
| `LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo` u. ä. | 2.347 | Fälligkeitsplan, undiskontierte Tilgungen je Jahr — nicht der Buchwert. |
| `GainsLossesOnExtinguishmentOfDebt` | 2.291 | Ergebnisposten aus Schuldentilgung, keine Bestandsgröße. |
| `RepaymentsOfLongTermDebt` | 2.040 | Kapitalflussgröße einer Periode, kein Bestand. |
| `DebtInstrumentCarryingAmount` | 1.840 | Angabe **je Instrument** mit dimensionalen Achsen. Eine Summe darüber doppelt oder unterschlägt, je nach Gliederung. |
| `DebtInstrumentFaceAmount` | 1.268 | Nominalbetrag je Instrument, nicht der Buchwert. |

Coverage ohne Semantik führt hier direkt zur falschen Entscheidung: fünf Konzepte mit mehr
Reichweite als die heutige Abbildung, und keines davon ist die gesuchte Größe.

## Zur Entscheidung

1. **B beibehalten** (Empfehlung): heutiger Zustand, 2.929 Emittenten, Bedeutung sauber. Die
   abgelehnte Alternative C kostet messbar 527 Emittenten — ein belegter Preis, keine Vermutung.
2. **Finanzierungsleasing** nur als eigene, benannte Kennzahl aufnehmen, nicht als optionalen
   Summanden in `total_debt`. Dann bleibt ein Name eine Definition.
3. **Nächste Messung, noch offen**: welche Konzepte die 1.692 Emittenten ohne jede Schuldenangabe
   tatsächlich taggen. Erst das sagt, ob die Lücke schließbar ist oder in der Sache liegt.
