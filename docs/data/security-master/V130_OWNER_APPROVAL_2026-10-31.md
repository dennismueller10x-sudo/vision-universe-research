# Security Master 1.1.0 → 1.3.0: Prüfung vor dem produktiven Lauf und Nachfreigabe (31.10.2026)

Nachfolger von [V130_OWNER_APPROVAL_2026-10-30.md](V130_OWNER_APPROVAL_2026-10-30.md). Owner-Freigabe vom 31.10.: Der produktive Lauf darf starten, wenn alle Bedingungen erfüllt sind. **Ergebnis der Prüfung: Zwei Bedingungen sind nicht erfüllt, der Lauf wurde nicht gestartet (fail closed).**

## 1. Unmittelbar vorheriger Probelauf

| Objekt | Wert |
|---|---|
| Lauf | **41177449137** auf `main` @ `f84e86b` (nach den Merges von #1167 und #1175), `commit=false`, `allow_version_change=true`, `approved_changes=true` |
| Anbieterliste | **109.176 Zeilen** (am 30.10.: 109.165) |
| Folgestand | `us-security-master-1.3.0`, 8.055 Zeilen, sha256 `71bffd89e11a1b4f0ded245dc26b2f617cd30acf47ad72e5806a01c5d9246601` (am 30.10.: `5d5d7112…`) |
| Gate-Bericht des Laufs | sha256 `bd4719199c04fda9e26704357cd67dece5896c60ec831067d24e2ebd8bc5c3c3` |
| Gate mit der Liste vom 30.10. | **PASS · COMMIT**, alle Einträge angewandt, keiner ungenutzt; gezählt: 24 canonical_id, 1 Typ, **18** Deaktivierungen, **18** Eignungswechsel, 1 Name |
| Lauf gesamt | **rot** im Schritt „Neuen Stand einsetzen und Artefakt-Tests“ (`discover/tests/names.test.mjs` NM3), siehe 3 |

## 2. Bedingung „keine neuen, unfreigegebenen Anbieteränderungen“: nicht erfüllt

Gegenüber der Liste vom 30.10. ist genau **eine** Änderung neu: **ref_DBRG**. Sie bringt eine Deaktivierung und einen Eignungswechsel.

- Ursache ist der Lauftag: Der Anbieter beendet DBRG am 2026-09-30. Am 31.10. ist das Ende älter als die 30-Tage-Schwelle des Erzeugers.
- SEC-Beleg, CIK 0001679688, DigitalBridge Group:
  - 8-K 0001104659-26-112148 vom 30.09., Items 2.01 und 3.01: Zusammenschluss vollzogen;
  - Form 25-NSE 0000876661-26-000800 vom 30.09.;
  - Form 15-12G vom 13.10. und 23.10.
- Die eigene Reihe endet ebenfalls am 2026-09-30.
- Der Builder stuft die Änderung als freigabefähig ein (`PROVIDER_ENDDATE_RESTATED`).

**Neu erzeugte Liste:** `v130-approved-changes-1.1.0.json`, sha256 `8f0260f0032b059fdd6b684987b939904caff61351e21f0de6ebab2e73a4fe03`.
- Quelle ist Lauf 41177449137, mit SEC-Liste vom 31.10. und Belegregister (GCTK, LNAI, SBXD).
- Gegenüber dem 30.10. kommen nur die beiden DBRG-Einträge hinzu, sonst ist die Liste unverändert.
- Gate mit dieser Liste: **PASS · COMMIT**.

| Kategorie | gezählt | freigegeben | zählt danach | Grenze |
|---|---:|---:|---:|---:|
| canonical_id | 87 | 63 | 24 | 25 |
| Instrumenttyp | 148 | 147 | 1 | 25 |
| Deaktivierungen | 105 | 88 | 17 | 50 |
| Eignungswechsel | 226 | 209 | 17 | 50 |
| neue doppelte canonical_id (G6) | 0 | 0 | 0 | 0 |
| Namen (G9) | 592 | 591 | 1 | 200 |

## 3. Workflow-Mangel: Der Lauf hätte nie committen können

Der Schritt „Artefakt-Tests“ prüft `discover/tests/names.test.mjs` (NM3) gegen den **neuen** Namensstand. Dieser Lauf baut Discover aber bewusst nicht neu; die Regel SMW-2 in `quant/tests/security-master-weekly.test.mjs` verbietet das. Bei jeder Umfirmierung schlägt NM3 deshalb fehl, hier bei ATTT (`Raytech Holding` → `Atlas Trinity Tech`). Der Commit-Schritt würde nie erreicht.

**Korrektur in diesem PR:**
- NM3 prüft die ausgelieferten Discover-Seiten gegen den committeten Namensstand, zu dem sie gebaut wurden. Danach wird der neue Stand wieder eingesetzt und per `cmp` geprüft.
- Die neuen Namen prüfen weiter `company-name-coverage` und das Gate G9.
- Gegen die Seiten werden sie beim nächsten Discover-Neubau im Marktdaten-Refresh geprüft.
- SMW-2 bleibt unverändert, Discover wird nicht gebaut.
- Lokal auf dem simulierten Folgestand: NM3 besteht (3/3), SMW mit Freigabe- und Belegtests 39/39.

## 4. Bedingung „17 nicht einzeln belegte Deaktivierungen ohne unbeabsichtigte Folgen für aktive Produktlistings“: geprüft

| Gruppe | Titel | Befund |
|---|---|---|
| Folge nicht freigabefähiger canonical_id-Wechsel | FGNX, FGNXP, RITR | nicht in Discover; die Reihen enden im September |
| **Identitätsbefund: eigene Reihe läuft weiter** | ACTS, BREW, EDVA, ENTL, FTPA, GNMX, INVN, NMBL, NYNY, PCLN, TRIL, USX, WR, WX | **alle 14 sind aktive Discover-Seiten**. Der Anbieter beendet die alte Zeile (z. B. PCLN 2018, WR 2018), unsere Tagesreihe läuft weiter. Unter dem Ticker handelt inzwischen ein anderes Wertpapier (z. B. WR, BREW: Corgi-ETFs seit 2026-05-06; PCLN: Seite heißt „Priceline.com“, Kurs 28,98) |

Simulation der Übernahme mit dem Folgestand von 41177449137 in einem lokalen Arbeitsstand:

| Prüfung | ohne Übernahme | mit Übernahme |
|---|---|---|
| `scripts/core/data-quality.mjs` | ERROR DQ-PX-4, DQ-TW-3, DQ-SF8-8 | **dieselben**, keine neuen Fehler |
| DQ-ID-4 „Stamm und Tagesreihe widersprechen sich nicht“ | 112 WARN | **69 WARN** (besser) |
| `core/tests` | 299/300 (DQ-SF8, vorbestehend) | 299/300, derselbe Fehler |
| `diagnose.mjs` PCLN, EDVA, WR | – | `WARN MASTER_INACTIVE_SERIES_CURRENT` (nur Bericht) |
| Discover, Screener, Aktienseiten | – | **unverändert**. Kein Produktkonsument baut aus dem Stamm automatisch Universum oder Eignung; `build-us-eligibility.mjs` läuft in keinem Workflow |
| Backtest-Loader (`research-weekly-loader`, `weekly-real-adapter`) | Die 14 IDs vermischen alte und neue Wertpapiere | Der Stamm markiert die alte Identität als beendet. Damit gibt es dort keine stille Vermischung mehr. Populationen und Demos können sich beim nächsten Neubau ändern (Datenstand) |

Bewertung: Für aktive Produktlistings gibt es keine Wirkung (Discover bleibt gleich). Die 14 Titel tragen aber einen schon bestehenden **Identitätskonflikt** (Ticker-Wiederverwendung ohne neue Anbieterzeile), den die Übernahme sichtbar macht. Er ist kein Delisting des heute angezeigten Wertpapiers und bleibt ein eigener Prüfpunkt (Abschnitt 6).

## 5. Weitere Bedingungen

| Bedingung | Stand |
|---|---|
| Vorlage passt exakt zur Datenbasis | Die Vorlage vom 30.10. passt **nicht** mehr: Anbieterliste und Lauftag haben sich geändert. Diese Vorlage gilt für Lauf 41177449137 |
| Freigabeeinträge und Deaktivierungen überprüfbar dokumentiert | ja: jeder Eintrag mit Beleg in der Liste, Prüftabellen in `V130_APPROVAL_LISTS_RUN_41177449137.md` |
| G6/G7/G9 bestehen bei unveränderten Grenzen | ja (Abschnitt 2) |
| unmittelbar vorheriger Probelauf erfolgreich | Gate PASS, Lauf rot wegen des Workflow-Mangels (Abschnitt 3) |

## 6. Zur Entscheidung

1. Diesen PR mergen: Workflow-Korrektur NM3 und Liste vom 31.10. inklusive DBRG.
2. Danach am **selben Tag** einen Probelauf `commit=false` mit `approved_changes=true`. Ist der Folgestand byte-gleich mit `71bffd89…` und kommt kein neuer Eintrag hinzu, folgt sofort `commit=true`. Neue Einträge heißen: stoppen und die Liste neu erzeugen.
3. Die 14 Identitätsbefunde (Ticker-Wiederverwendung mit weiterlaufender Reihe) später in einem eigenen PR auflösen: neue securityId für das neue Wertpapier nach `core/identity.js` oder Anbieterkorrektur. Bis dahin bleiben sie in DQ-ID-4 und `diagnose` sichtbar.

Hinweis zum Takt: Jeder Lauftag kann neue Alterungen nach 30 Tagen bringen. Liste, Freigabe und Lauf gehören deshalb auf denselben Tag.
