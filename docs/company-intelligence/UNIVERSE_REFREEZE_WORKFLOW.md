# Re-Freeze per Workflow (`mode=refreeze`)

Baut auf `universe-release.mjs refreeze` und `frozen-refreeze.mjs` (PR #694, gemergt) auf. Dieses Dokument beschreibt nur die Auslösung in `.github/workflows/company-intelligence-universe-release.yml`.

## Eingaben

| Eingabe | refreeze | activate |
|---|---|---|
| `mode` | `refreeze` | `activate` (Default) |
| `scaling_run` | nicht nötig (Formular: optional) | Pflicht: numerische Run-ID, erster Schritt bricht sonst ab |
| `expect_generation` | optional, 24 Hex-Zeichen, wird als `--expect-generation` über `env:` übergeben | ungenutzt |

## Schritte pro Modus

`refreeze` läuft nur über: Checkout (unverändert wie in den anderen Modi, Tiefe 1, nur `main`), Node-Setup, `universe-release.mjs refreeze`, strikte Auswertung, Artefakt-Upload (`evidence/release.json`). Übersprungen werden: Browser-/Playwright-Suite, Identitäts-Checkout, Scale-Receipt-Verifikation, Audit, Pages-Dispatch samt Wait (der Wait erwartet `release.json.generation == ausgeliefert` und würde scheitern, sobald das Legacy-GOOD weiterrückt) und die Live-QA.

Auswertung: `status` ist `REFROZEN` oder `ALREADY_CURRENT`, und `privateStateModified`, `activationModified`, `gateModified`, `universeGoodModified` sind exakt `false`. Fehlt ein Feld oder ist es `true`, schlägt der Job fehl.

## Fehlerverhalten

Der Schritt „Fail closed to immutable 46 scope“ ist für `refreeze` ausgenommen (`inputs.mode != 'refreeze'`). Ein Fehlschlag von `refreeze` löst weder `restore46` noch einen Pages-Dispatch aus und fasst Gate, Aktivierung und Produktion nicht an. Das Rollback-Namespace-Verhalten bei Teilfehlern (Zeiger byte-genau zurück) liegt im Befehl selbst (#694).

## Voraussetzungen (zeitunabhängig)

- `refreeze` braucht eine ausgelieferte `company-intelligence-delivery.json`, die dem Legacy-GOOD entspricht (Gate offen, 46 Titel / 45 Emittenten), und ein Legacy-GOOD mit neuerem `generatedAt` als der bestehende Freeze. Ist das Gate geschlossen oder das GOOD zurückgerollt, schlägt der Befehl fail-closed fehl; das ist erwünscht.
- `ALREADY_CURRENT` schreibt nichts und verlängert den Verfall (`manifest.generatedAt` + 7 Tage, `CONSUMER_EXPIRED`) nicht.
- `refreeze` funktioniert auch nach Ablauf des alten Freeze. `rollback`, `restore46`, `recover_full_scope` und das Öffnen des Gates (`setProductionGate('AVAILABLE')` liest das aktive GOOD zurück) scheitern bei abgelaufenem aktivem GOOD bis dahin mit `CONSUMER_EXPIRED`.

## Betrieb

- Concurrency unverändert (`company-intelligence-continuous-production`, kein Abbruch laufender Läufe), Berechtigungen unverändert (`contents: read`, `actions: write`).
- Der eingefrorene Rollback verfällt sieben Tage nach `generatedAt`; Empfohlenes Intervall: alle 3 bis 5 Tage; absolute Obergrenze: spätestens 6 Tage nach dem letzten Re-Freeze (Verfall nach 7 Tagen, 1 Tag Reserve). Gilt, solange das Universum nicht aktiv ist. Ein Zeitplan ist bewusst nicht Teil dieser Änderung (Eigentümerentscheidung).
- Der Test liest den Workflow-Text strukturell (ohne YAML-Parser, kein PyYAML im `validate`-Job) und hat Wächter-Assertions, dass die erwarteten Schritte gefunden wurden.
- Tests: `scripts/company_intelligence/tests/universe-release-workflow.test.mjs` (Bedingungen je Modus, keine `inputs.*` in `run:`, Mutationen).

## Heilpfad „kein Legacy-GOOD“ (`mode=restore-legacy`)

Zustand: `continuous-discover-top46-v1/good.json` ist `LEGACY_FALLBACK` (oder fehlt). Typische Ursache ist ein doppelter Rollback (Refresh-Deploy-Fehlerpfad und danach der Pages-Notfall-Rollback): `rollbackGood` schreibt ohne Vorgänger `LEGACY_FALLBACK`, `goodState` liefert `null`, Health meldet `generation=null`, und jeder Refresh fällt im Schritt `RESTORE` auf die feste Baseline `production-discover-6c3fb74e…` zurück, deren Manifest nach sieben Tagen `CONSUMER_EXPIRED` meldet. Es geht kein Datenstand verloren: privater Stand und Payload-Slots liegen weiter, nur der Zeiger fehlt. `rollback`, `restore46`, `refreeze` und das Öffnen des Gates brauchen alle ein Legacy-GOOD und scheitern in diesem Zustand.

`restore-legacy` setzt den Legacy-Zeiger aus dem eingefrorenen Rollback `eligible-rollback-top46-v1` neu. Code: `legacy-restore.mjs` (`restoreLegacyGood`), Aufruf `universe-release.mjs restore-legacy --temporary <dir> --expect-generation <24 Hex>`.

### Aufruf (Workflow `Company Intelligence Eligible Universe Release`, nur `main`)

| Eingabe | Wert |
|---|---|
| `mode` | `restore-legacy` |
| `expect_generation` | **Pflicht**, 24 Hex-Zeichen: exakte Generation des eingefrorenen Rollbacks, die wiederhergestellt werden soll (steht in `eligible-rollback-top46-v1/good.json`, z. B. aus dem Refreeze-Lauf-Artefakt) |
| `scaling_run` | nicht nötig |

Schritte: Guard für `expect_generation` (bricht vor dem Checkout ab), Checkout (Tiefe 1), Node-/Python-Setup, `restore-legacy`, strikte Auswertung, Artefakt-Upload (`evidence/release.json`). Übersprungen: Identitäts-Checkout, Browser-Suite, Scale-Receipt, Audit, Aktivierung, Pages-Dispatch samt Wait, Live-QA und der Fail-closed-Schritt (`restore46`). Concurrency, Berechtigungen und Timeout unverändert. Auswertung: `status` ist `RESTORED` (Generation == `expect_generation`) oder `ALREADY_PRESENT`; `privateStateModified`, `activationModified`, `gateModified`, `universeGoodModified`, `rollbackModified` sind exakt `false`.

### Verifikation vor dem Schreiben (jede Verletzung bricht ohne Schreiben ab)

1. `expect_generation` vorhanden und 24 Hex; Legacy-Zeiger ist `LEGACY_FALLBACK` oder fehlt. Ein gültiges Legacy-GOOD ergibt `ALREADY_PRESENT` ohne Schreibzugriff, ein defekter Zeiger wird nie überschrieben.
2. Aktivierung fehlt oder ist `ROLLBACK_46` (Universum nicht live).
3. Frozen-Zeiger vorhanden und gültig (`goodState`), `previous == null`, Generation == `expect_generation`, Scope exakt 46 Titel / 45 Emittenten / 45 Inventar-Einträge (`assertLegacyScope`).
4. `manifest.generatedAt` nicht in der Zukunft und mindestens 15 Minuten vor dem 7-Tage-Verfall (`LEGACY_RESTORE_FROZEN_EXPIRED`). Der Zeitstempel wird nie verändert oder verlängert; das wiederhergestellte GOOD erbt den Verfall des Freeze.
5. Marker/Archiv: ein Freeze ohne `refreeze`-Marker ist der ursprüngliche; mit Marker müssen `sourceAssetsSha256`, `lineage`, `archiveKey` und das Archiv (`pointerSha256`) stimmen.
6. Download aus leerem Verzeichnis: Downloader prüft jedes Asset per SHA-256; zusätzlich Prüfung jeder Datei auf Platte gegen das Manifest, `index.json`-Generation, `preflight`.

### Schreiben und Nachlesen

Nutzdaten kommen in einen noch von keinem Zeiger referenzierten Legacy-Slot (`-a`/`-b`; ein Slot mit identischer Generation wird wiederverwendet, sonst der leere oder älteste). Danach ändert sich der Zeiger genau einmal per CAS (`commitGood` mit `expectedGood=null`, vorher Hash-Lesen aller Assets, Nachlesen). Erneute Zeigerprüfung unmittelbar vor dem Schreiben. Verify: Zeiger neu lesen (Generation, Manifest, `previous == null`, Scope), frischer Download aus leerem Verzeichnis, Gate/Aktivierung/Universe-GOOD/Frozen-Zeiger byte-gleich. Scheitert ein Schritt nach dem Zeigerschreiben, wird der vorherige Zeiger (`LEGACY_FALLBACK`) byte-genau zurückgeschrieben. Gate wird nie geöffnet.

### Danach (manuell, getrennte Schritte)

1. `health` bzw. ein Refresh-Lauf: `goodState` ist wieder `GOOD`; der Refresh-Restore lädt das wiederhergestellte GOOD als Vergleichsbasis.
2. Gate-Öffnung und Pages-Deploy sind eigene, bewusste Schritte; `restore-legacy` löst keinen aus. Hinweis: das wiederhergestellte GOOD ist höchstens so alt wie der Freeze und verfällt zum gleichen Zeitpunkt (`validUntil` im Evidence-JSON); der nächste erfolgreiche Refresh ersetzt es.

### Diagnose statt `CONSUMER_EXPIRED`

- Ohne Legacy-GOOD und mit abgelaufener Baseline melden `runRefresh` (Schritt `RESTORE`) und `setProductionGate('AVAILABLE')` jetzt `LEGACY_GOOD_MISSING_RESTORE_REQUIRED` statt des irreführenden `CONSUMER_EXPIRED`. Der Normalfall (Legacy-GOOD vorhanden) und andere Namespaces (Verifikationsläufe, Universum) verhalten sich unverändert; es gibt bewusst keinen stillen Fallback auf den Freeze.
- `refresh-run.mjs health` ergänzt `goodState` (`GOOD`, `LEGACY_FALLBACK`, `ABSENT`, …) und `goodStateReason` (`NO_LEGACY_GOOD_RESTORE_REQUIRED`); der Step-Summary des Refresh nennt `Legacy GOOD: LEGACY_FALLBACK`. Schwellen (8 h / 12 h) und SLO-Logik sind unverändert.
- Tests: `scripts/company_intelligence/tests/legacy-restore.test.mjs`, `universe-release-workflow.test.mjs`.
