# G7: Einzelprüfung der 27 nicht freigabefähigen canonical_id-Wechsel (30.10.2026)

Auftrag des Owners vom 30.10.: das G7-Problem aktiv lösen und mindestens drei Fälle mit unabhängig prüfbarer SEC-Identitätskette priorisieren. Ticker-Wiederverwendung, neue Listings und echte Identitätswechsel dürfen nicht zusammengeführt werden. G6, G7 und G9 bleiben unverändert.

## Ergebnis

**3 von 27 Fällen sind mit SEC-Belegen derselben CIK aufgelöst: GCTK, LNAI und SBXD.** In allen drei Fällen wurde dieselbe Aktie unter demselben Ticker von der Börse in den Freiverkehr verlegt. Es gibt keinen Tickerwechsel, keine Zusammenführung und keinen Emittentenwechsel.

G7 sinkt damit von 27 auf **24 (Grenze 25)**. Probe mit Gate und Grenzen unverändert, gegen den Folgestand von Run 41086438209: **PASS · Entscheidung COMMIT**.

24 Fälle bleiben offen. Ihr Grund steht unten einzeln.

## Mechanik

- Register `quant/config/security-master-canonical-change-evidence.json`, Schema `security-master-canonical-change-evidence-1.0.0`.
- Der Builder liest es über `--canonical-evidence`. Erzeuger, Gate und Grenzen bleiben unverändert.
- Ein Eintrag wirkt nur bei **vollständigem** Treffer:
  - dieselbe securityId und derselbe Ticker; beide canonical_ids exakt wie registriert
  - dieselbe Builder-Klasse, nur `MOVED_TO_OTC` oder `PROVIDER_HISTORY_RESTARTED`
  - Zielzeile im Freiverkehr, unveränderte Gattung
  - CIK wie im committeten Namensstand und, wenn die SEC-Liste den Ticker führt, auch dort
  - Ereignis nicht nach dem Lauftag
  - 8-K mit Item 3.01 und Zitat; bei einem Neubeginn der Anbieterreihe zusätzlich Form 25-NSE und Beginn der neuen Zeile höchstens 3 Tage neben dem Wirksamkeitstag
- Fehlt etwas, bleibt das Urteil des Builders, und der Eintrag steht in `sourceRun.canonicalEvidence.notApplied`.
- Formfehler, ein Tickerwechsel im Eintrag oder eine nicht zugelassene Klasse brechen ab (fail closed).

## Aufgelöste Fälle

| securityId | Wechsel | Belegkette (alle CIK-gleich, abgerufen bei sec.gov am 30.10.) |
|---|---|---|
| ref_GCTK | `tiingo:NASDAQ:GCTK:2013-04-25` → `tiingo:OTCMKTS:GCTK:2013-04-25` | CIK 0001506983 Glucotrack, Inc. 8-K 0001493152-26-049299 (29.10., Item 3.01): Der Nasdaq Hearings Panel beschließt am 28.10. die Streichung; die Aussetzung gilt zur Eröffnung am 30.10.; danach Notiz bei OTC Markets. Die SEC-Tickerliste führt noch „Nasdaq“, weil sie dem Rückzug nachläuft. Kontext: 8-K 0001493152-26-048981, Reverse Split 1:2 am 23.10. (gleiche Gattung). |
| ref_LNAI | `tiingo:NASDAQ:LNAI:2015-02-02` → `tiingo:OTCMKTS:LNAI:2015-02-02` | CIK 0001527728 Lunai Bioworks Inc. 8-K 0001731122-26-001362 (23.10., Item 3.01): Streichungsbeschluss der Nasdaq; keine Anhörung beantragt; der Board beschließt den freiwilligen Rückzug nach Rule 12d2-2(c); Aussetzung zur Eröffnung am 30.10. |
| ref_SBXD | `tiingo:NYSE:SBXD:2024-10-07` → `tiingo:PINK:SBXD:2026-09-28` | CIK 0002015947 SilverBox Corp IV. 8-K 0001104659-26-111044 (25.09., Item 3.01): NYSE-Streichungsverfahren. 8-K 0001104659-26-111396 (28.09., Item 8.01): Notiz auf OTCID **ab 28.09.**, also genau am Beginn der neuen Anbieterzeile. Form 25-NSE 0000876661-26-000824 der NYSE (13.10.). Danach neue OTC-Symbole (SBXDF); `ref_SBXD` endet und wird inaktiv (Deaktivierung damit ebenfalls freigabefähig). |

Hinweis zu GCTK und LNAI: Die Form 25 der Nasdaq ist angekündigt, aber noch nicht eingereicht. Der Beleg ist die Mitteilung des Emittenten nach Item 3.01 über den endgültigen Beschluss und die Aussetzung ab 30.10. Erst damit ist die Anbieterzeile im Freiverkehr erklärt.

## Offene Fälle (24): nicht auflösbar ohne Zusammenführung oder gegen die Belege

| securityId | Builder-Klasse | Befund aus EDGAR | Warum nicht freigabefähig |
|---|---|---|---|
| ref_ADIL | PROVIDER_HISTORY_RESTARTED | CIK 0001513525, 8-K 0001213900-26-113337 (28.10.): neuer Name Azora Therapeutics, **neuer Ticker AZR** und neue CUSIP ab 29.10. | Tickerwechsel: Die neue Zeile unter ADIL ist nicht die fortgeführte Aktie, `core/identity.js` bindet die securityId an den Ticker |
| ref_LRHC | PROVIDER_HISTORY_RESTARTED | CIK 0001879403, jetzt Stratum Holdings (SRTM/LRHC), 8-K 5.03 vom 19.10. | Umfirmierung mit Tickerwechsel nach SRTM, die neue Zeile LRHC läuft nur 2 Tage |
| ref_QNCX | PROVIDER_HISTORY_RESTARTED | CIK 0001662774, jetzt IRulya Therapeutics, Ticker **IRLA** | Tickerwechsel |
| ref_FGNX, ref_FGNXP | PROVIDER_HISTORY_RESTARTED | CIK 0001591890, jetzt FG Communities (FGC, FGCPP) | Tickerwechsel; bei FGNXP zusätzlich Gattungswechsel (PREFERRED) |
| ref_LESL | PROVIDER_HISTORY_RESTARTED | CIK 0001821806 Leslie's: Chapter 11 (8-K 1.03), heute LESLQ im Freiverkehr | Die neue Anbieterzeile liegt an der **NASDAQ** (05.10.–09.10.) und passt nicht zum Rückzug |
| ref_NVNI, ref_NVNIW | PROVIDER_HISTORY_RESTARTED | CIK 0001965143 Nvni Group, heute NVNIF/NVNWF (OTC) | NVNI: neue Zeile an der NASDAQ, nicht im Freiverkehr; NVNIW: keine 8-K-Meldung (Auslandsemittent, nur 6-K), Item 3.01 nicht belegbar |
| ref_RITR | PROVIDER_HISTORY_RESTARTED | CIK 0001951229 Reitar, heute RITRF (OTC), nur 6-K | Die neue Zeile liegt an der NASDAQ; kein 8-K |
| ref_SPKL, ref_SPKLU, ref_SPKLW | PROVIDER_HISTORY_RESTARTED | CIK 0001884046 Spark I Acquisition, 8-K 3.01 vom 02.10., heute SPKLF/SPKUF/SPKWF; laufender Zusammenschluss (425) | SPKL: neue Zeile an der NASDAQ ab 07.10. (widerspricht dem Rückzug, möglicher Nachfolger); U/W: Neubeginn ohne Form 25 im Bestand |
| ref_TETE, ref_TETEW | PROVIDER_HISTORY_RESTARTED | Ticker nicht in der SEC-Liste, keine CIK im Namensstand | keine Identitätskette |
| ref_VTAK | PROVIDER_HISTORY_RESTARTED | Ticker nicht in der SEC-Liste, keine CIK im Namensstand | keine Identitätskette |
| ref_CHOW, ref_EFTY, ref_NAVI, ref_XRPN, ref_XRPNW | TWO_ACTIVE_LISTINGS | NAVI: Navient LLC, Form 15-12G vom 29.10. (Umwandlung); XRPN/XRPNW: Armada Acquisition II → Evernorth, 25-NSE und 15-12G | Zwei aktive Anbieterzeilen. Welche gilt, entscheidet das Register nicht. Eine Auswahl wäre eine Zusammenführung |
| ref_TRT | EXCHANGE_LABEL_RENAMED | CIK 0000732026 Trio-Tech: Form 25 und 8-A12B vom 15.09.2026, **Wechsel an die Nasdaq** | Die Anbieterzeile führt NYSE MKT, die SEC belegt Nasdaq. Der Anbieter liegt falsch |
| ref_TRUE | START_DATE_RESTATED | CIK 0001327318 TrueCar, Form 15-12G vom 02.02.2026 (Rückzug, privat) | Der Anbieter führt die Zeile bis 29.10. aktiv; die SEC belegt die Deregistrierung. Identität unklar |
| ref_CAM | UNCLEAR_REPLACEMENT | neues Listing an NYSE ARCA (ETF) ab 2025-10-06 | Ticker-Wiederverwendung durch ein anderes Wertpapier |
| ref_APAD | EXCHANGE_TRANSFER | SEC-Delisting-Beleg (8-K 2.01+3.01, wirksam 08.05.2026) gegen die aktive NASDAQ-Zeile | Widerspruch bleibt |

## Nächste Schritte (Reihenfolge)

1. Merge dieses PR und von #1167 (Gate-Schema 1.1.0, Builder): Owner-Freigabe.
2. Probelauf `commit=false` auf `main` (`allow_version_change=true`, `approved_changes=false`), danach die Liste mit dem Builder **und** `--canonical-evidence` aus dem tatsächlichen Folgestand neu erzeugen.
3. Owner-Freigabe der Liste, dann am selben Tag `commit=true` mit `approved_changes=true`.

Ändert sich die Anbieterliste dazwischen, wird die Liste neu erzeugt. Ein nicht mehr passender Registereintrag wird nie stillschweigend angewandt.
