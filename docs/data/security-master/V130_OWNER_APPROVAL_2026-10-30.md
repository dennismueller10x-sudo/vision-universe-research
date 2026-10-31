# Security Master 1.1.0 → 1.3.0: Vorlage zur Owner-Freigabe (30.10.2026)

## Grundlage

| Objekt | Wert |
|---|---|
| Erzeuger | `main` @ `a5d1a93` (mit #1163: Doppelzeilen-Register OKE und TEL; FUN bleibt gesperrt) |
| Probelauf | Run **41117465706**, `security-master-weekly.yml` auf `main`, `commit=false`, `allow_version_change=true`, `approved_changes=false`; Doppelzeilen-Register 2/2 angewandt |
| Anbieterliste | 109.165 Zeilen, dieselbe Datei wie der Lauf 41086438209 (Folgestand byte-gleich) |
| Folgestand `sm-next/us-security-master.json` | sha256 `5d5d7112dff801b2475c2cac25211d0af01a18fd55c854e8dd3b9c0f61f01693` |
| Gate-Bericht des Laufs | sha256 `a18246e867f0ce099fa1f5903fb2f5c2b7455ed1a7a3177ff5c8ef0f3e749986`, BLOCKED ohne Freigabeliste |
| Ausgangsstamm (Bindung) | `us-security-master-1.1.0`, sha256 `26c82617913ab0dcbd08d24c80eb818134ccced74cc01e9eac819b4635498332` |
| Freigabeliste | `v130-approved-changes-1.1.0.json`, sha256 `4a378c79e1b6a2f2fd4f329faabd7672ab929a73e908c79dc821d55932817a5c` |
| Belegregister | `quant/config/security-master-canonical-change-evidence.json` (GCTK, LNAI, SBXD; alle angewandt) |

## Gate mit dieser Liste (unveränderte Grenzen)

**PASS · Entscheidung COMMIT.** Alle Einträge der Liste wurden angewandt; ungenutzt bleibt keiner.

| Kategorie | gezählt | freigegeben | zählt danach | Grenze |
|---|---:|---:|---:|---:|
| canonical_id (G7) | 87 | 63 | **24** | 25 |
| Instrumenttyp (G7) | 148 | 147 | 1 | 25 |
| Deaktivierungen (G7) | 104 | 87 | 17 | 50 |
| Eignungswechsel (G7) | 225 | 208 | 17 | 50 |
| Tickerwechsel (G7) | 0 | 0 | 0 | 25 |
| neue doppelte canonical_id (G6) | 0 | 0 | 0 | 0 |
| Namen (G9) | 592 | 591 | 1 | 200 |

## Konkrete Änderungen bei Übernahme

- **Stamm:**
  - Version 1.1.0 → 1.3.0, 8.021 → 8.055 veröffentlichte Zeilen.
  - Die Doppelzeilen von OKE und TEL sind aufgelöst. Beide IDs sind wieder einzeilig und damit backtestbar.
  - 104 Titel werden inaktiv. Davon sind 87 belegt; 17 zählen offen gegen die Grenze.
- **canonical_id:**
  - 63 Wechsel sind belegt (u. a. 27 Ticker-Wiederverwendungen mit neuem Listing, 21 Rückzüge in den Freiverkehr, 7 AMEX → NYSE MKT).
  - 24 Wechsel bleiben unbelegt; Begründung je Fall in [V130_G7_CANONICAL_EVIDENCE.md](V130_G7_CANONICAL_EVIDENCE.md).
- **Eignung:** 225 Wechsel, davon 138 aus der Sonderfreigabe 1.0.0 (Klassifiziererwechsel).
- **Namen:** 573 Namen kommen neu aus der SEC, 18 Firmen haben umfirmiert. XRPN bleibt ausgeschlossen, weil dort die CIK wechselt.
- **Vollständige Listen:**
  - nicht freigabefähige Einträge vollständig: [V130_APPROVAL_LISTS_RUN_41117465706.md](V130_APPROVAL_LISTS_RUN_41117465706.md)
  - alle freigegebenen Einträge mit Beleg: `v130-approved-changes-1.1.0.json`

## Freigabeschritte (nach Owner-OK)

1. #1167 und #1175 mergen (Gate-Schema 1.1.0, Builder, Belegregister, diese Liste).
2. Am selben Tag `security-master-weekly.yml` auf `main` starten, mit `commit=true`, `allow_version_change=true` und `approved_changes=true`.
3. Das Gate prüft erneut. Weicht die Anbieterliste vom heutigen Stand ab, blockiert es (fail closed). Dann wird die Liste mit demselben Builder neu erzeugt und erneut vorgelegt.
4. Erst danach und nur mit ausdrücklicher Abschlussfreigabe folgt #1119.
