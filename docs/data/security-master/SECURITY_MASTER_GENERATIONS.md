# Security-Master-Generationen für Research (Stand 31.10.2026)

Owner-Auftrag vom 31.10.2026 (P2): Abgeschlossene Studien behalten dauerhaft ihre Identitätsgrundlage. Eine Änderung des Produktstamms darf fertige Studien nicht rückwirkend verändern. Neue Research-Generationen dürfen 1.3.0 oder später nutzen, aber nur ausdrücklich und nie gemischt.

## 1. Anlass

Der produktive Lauf 41186967651 (1.3.0) wurde mit #1204 zurückgenommen. Die Research-Loader `weekly-real-adapter.cjs` und `research-weekly-loader.cjs` lasen fest den live committeten Stamm. Danach ließen sich die eingefrorenen Frames V8, V10 und V12 nicht mehr reproduzieren, und die Freeze-Tests SMF-4/5/7 und MCH-3 schlugen fehl, weil ihre Fixtures „vor dem Wechsel“ aus dem Produktstamm bauten.

## 2. Lösung

| Baustein | Inhalt |
|---|---|
| `quant/config/security-master-generations.json` | Register (Schema `security-master-generations-1.0.0`). Je Generation: Datei, SHA-256, Bytes, Git-Blob, Version, `generatedAt`, Zeilen, Belege. Ein Eintrag wird nie geändert; eine neue Generation bekommt einen neuen Eintrag. `researchEvidenceDefault` = `us-security-master-1.1.0` |
| `quant/frozen/security-master/us-security-master-1.1.0.json` | bytegleiche Kopie des Stamms 1.1.0, SHA-256 `26c82617…`, Git-Blob `ee1fe3ad…` (derselbe Blob wie der Produktstamm, das Repository wächst nicht). Liegt bewusst außerhalb von `quant/data`: kein Erzeuger überschreibt sie |
| `scripts/quant/pin-security-master-generation.cjs` | erzeugt die Kopie aus einem Git-Objekt, nur bei exakt passendem Hash, Größe und Blob. Überschreibt nie; `--check` prüft nur |
| `quant/engines/security-master-generation.cjs` | `resolve(root, id)`: `LIVE` liest den Produktstamm wie bisher; eine eingefrorene Generation wird nur mit passendem SHA-256 geladen, sonst `MASTER_GENERATION_HASH_MISMATCH`, `…_UNKNOWN`, `…_FILE_MISSING` (fail closed) |
| `weekly-real-adapter.cjs` | **unverändert, bytegleich zu `main`** (`15c468a5…`, gesichert durch `research-ca-evidence` und `research-identity-evidence`). Der Produkt-Adapter liest immer den Produktstamm |
| `research-weekly-loader.cjs#createResearchLoader(root, options, {masterGeneration})` | Mit einer Evidenz-Option (Identität, Kapitalmaßnahmen, Lebenszyklus) liest der Loader die Generation 1.1.0: Gegen sie sind alle Evidenz-Register gebaut und registriert. Für nicht gebundene Titel nutzt er dieselbe Zeilenregel wie der Adapter, auf den Bytes der Generation; MG-3 prüft die Gleichheit mit dem Adapter auf denselben Bytes. Ohne Evidenz-Option bleibt der Standard der Produkt-Adapter (`LIVE`). Eine neue Research-Generation nennt ihre Generation ausdrücklich, als drittes Argument. Das ist bewusst keine Loader-Option, weil Loader-Optionen Teil registrierter Specs und Hashes sind. Neu: `loader.masterGeneration` |
| `scripts/quant/v10/studies/common.cjs#sourceManifest` | Der Stamm-Eintrag hasht die Generation, die der Frame-Loader tatsächlich gelesen hat. Vor dem Wechsel sind die Bytes identisch, der Manifest-Hash bleibt also gleich |
| `check-backtest-demo-freshness.cjs` | meldet je Demo die Generation. Ein an 1.1.0 gebundenes Ergebnis zählt nach einem Wechsel nicht als „Stamm geändert“ |

**Kein stilles Mischen:**
- Die Identitäts-Register prüfen weiter die Zeilenmenge (`IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED`). Liest eine neue Generation Evidenz gegen einen anderen Stamm, endet sie dort fail closed.
- Jedes Demo- und Katalogergebnis ist an eine registrierte Generation gebunden (Test MG-6).

**PIT, Survivorship, Kapitalmaßnahmen, Delistings:** unverändert. Kursreihen, Register und Lebenszyklus-Belege werden nicht berührt. Nur die Identitätsgrundlage ist eingefroren.

## 3. Was bewusst unverändert bleibt

- **Abgeschlossene Einmal-Skripte V7–V13** (`run-v7/v8*`, `v9/**`, `v9-followups/**`, `v10/**`, `v12/**`, `v13/largecap/evaluate.cjs`, Python-Prüfer):
  - Ihre Code-Hashes stehen in den Registrierungen (z. B. `run-v8-real-studies.cjs` `fe54e9e1…`, `run-setup-reconstruction.cjs` `df6ec66d…`).
  - Sie lesen den Stamm teils direkt. Nach einer Umstellung werden sie nur auf ihrem registrierten Commit neu ausgeführt (`git worktree add <dir> <commit>`).
  - Test MG-5 hält die Liste fest: Kein neuer Research-Code darf den Stamm direkt lesen.
- **Ergebnisse und Hashes unter `docs/quant-recovery/`:** unverändert (SMF-1).
- **Produktpfade** (`materialize-real-backtest-read`, `refresh-real-backtest`, `data-quality`, `diagnose`, Survivorship-Kontrolle, Emerging Leaders, Profil `PRODUCT_DEFAULT`): folgen weiter dem Produktstamm.

## 4. Tests (`quant/tests/security-master-generations.test.mjs`)

| Test | Prüft |
|---|---|
| MG-1 | Kopie = Register = Freeze-Manifest (`preSwitchMaster`) = Freigabeliste (`prevMasterSha256`); Git-Blob; nicht in generierten Pfaden |
| MG-2 | fail closed bei unbekannter, ungültiger, manipulierter oder fehlender Generation, ungültigem Register und ungültigen Optionen |
| MG-3 | Vorgaben: Produkt `LIVE`, Evidenz-Optionen 1.1.0, neue Generation nur ausdrücklich |
| MG-4 | **Migration:** simulierter Folgestand im Produktpfad. Das Produkt folgt, die eingefrorenen V10–V12-Loader liefern für alle evidenzgebundenen Titel bytegleiche Ergebnisse |
| MG-5 | Bestandsaufnahme der direkten Leser, Engines nur über die Generationen |
| MG-6 | Demo- und Katalogergebnisse an eine registrierte Generation gebunden |

**Angepasst, ohne Abschwächung:**
- MCH: Der Golden Case läuft jetzt immer und wird nie übersprungen. Die Mutationen laufen auf der eingefrorenen 1.1.0.
- SMF: Die Fixture für „vor dem Wechsel“ ist die eingefrorene 1.1.0, Assertions unverändert. SMF-2 bindet zusätzlich Register und Freeze-Manifest.
- V8-Klassifikation: zusätzlicher Test auf der eingefrorenen Generation. Die Fixture zur V8-Ausgangslage („1.1.0 lässt FRMEP als Stammaktie zu“) nutzt die eingefrorene 1.1.0.
- Vergleiche „gebundener gegen ungebundenen Loader“ (Identität, CA) laufen auf derselben Generation. Der Code-Identitätstest V13b vergleicht auf `LIVE`, wie der Basis-Commit-Loader liest.
- tmp-Mutationstests (V10, V12, Identität): nennen den Produktstamm ausdrücklich (`LIVE`), weil sie die Zeilenbindung gegen einen veränderten Stamm prüfen.

## 5. Migrationsprüfung am echten Folgestand (31.10.2026)

Drei Arbeitsstände, jeweils mit vollen Suiten (Quant, Core, Discover + Screener + Supertrader, Technical, Python, Testisolation):
- `main` `ea95de8f07`;
- dieser PR, ohne Wechsel;
- dieser PR mit dem echten Folgestand des Laufs 41186967651: Commit `46d8e936b3`, die sechs Stammdateien, `us-security-master.json` sha256 `71bffd89…`.

| Suite | `main` | dieser PR | dieser PR + 1.3.0 |
|---|---|---|---|
| Quant | 17 Fehler (vorbestehend, lokal) | **dieselben 17** | **dieselben 17** |
| Core | 1 (DQ-SF8) | dieselbe | dieselbe |
| Discover/Screener/Supertrader | 0 | 1: Erzeugerbesitz 485, Discover-Neubau nach #1207 steht aus (Marktdaten-Lauf) | zusätzlich NM3 (siehe unten) |
| Technical | 0 | 0 | 0 |
| Python | 588 OK | 588 OK | 588 OK |
| Testisolation | keine Produktionsdatei verändert | dieselbe | dieselbe |

- Vor diesem PR schlugen auf dem Folgestand `research-v8-classification`, `v10-population`, `v12-largecap`, SMF-4/5/7 und MCH-3 fehl (Rücknahme #1204). Jetzt bestehen sie.
- **NM3 auf dem Folgestand** ist erwartet. Die Discover-Seiten tragen die Namen, zu denen sie gebaut wurden. Der Wochenlauf prüft NM3 deshalb gegen den committeten Namensstand (#1193).
- **Folge für den Ablauf:** Nach `commit=true` steht auf `main` der neue Namensstand neben den alten Seiten, bis der nächste Marktdaten-Lauf Discover neu baut. Der Marktdaten-Lauf muss deshalb unmittelbar nach dem Commit laufen; sonst ist Discover CI (NM3) bis dahin rot.

## 6. Ablauf einer künftigen Umstellung (unverändert freigabepflichtig)

1. Dieser PR gemergt. Demos neu gebaut (Code-Hash).
2. Probelauf `commit=false`, Folgestand mit festem Hash.
3. **Volle Quant-Suite** (dazu Core, Discover, Screener, Supertrader, Technical, Python, Testisolation) auf dem simulierten Folgestand gegen dieselbe Suite ohne Wechsel. Neue Fehler: stoppen.
4. Owner-Freigabe, dann `commit=true`, unmittelbar danach der Marktdaten-Lauf (Discover-Neubau, NM3).
5. Eine neue Research-Generation (Katalog 2, Demos 2, neue Studien) bekommt einen eigenen Register-Eintrag für den neuen Stamm (Pin-Skript), eigene Ausgabeverzeichnisse und eigene Nachweise. Katalog und Demos der Generation 1.1.0 werden nicht überschrieben.
