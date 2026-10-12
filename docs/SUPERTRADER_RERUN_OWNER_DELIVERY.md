# Owner-Ausgabe des zertifizierten Reruns

Der öffentliche Rerun-Bericht veröffentlicht Klassen, Counts und erlaubte Richtungen. Die verschlüsselte Owner-Ausgabe enthält den ausführlichen Bericht, die zwanzig Abschlussantworten, exakte Kennzahlen, aktuelle Aktien und die Prüfmodule. Vollständige Haupt-, Source-Control- und Sensitivitätsrohläufe liegen in getrennten verschlüsselten Archivpaketen.

## Richtungen im Alt-Neu-Vergleich

`portfolio` vergleicht CAGR; `signal` den mittleren 63-Session-Excess-Return; `risk` den absoluten Maximum-Drawdown. `INCREASED` bei `risk` bedeutet deshalb einen größeren Drawdown. Fehlende Werte bleiben `UNAVAILABLE`. Source-Snapshot-, Certification-Overlay- und kombiniertes Delta sind deskriptive Vergleiche und kein kausaler Nachweis.

## Compact lokal entschlüsseln

Den privaten Owner-Schlüssel lokal bereitstellen; er gehört weder ins Repository noch in öffentliche Logs. Das bestehende Repo-Modul unterstützt das Envelope-Format. In einer lokalen Repository-Arbeitskopie:

```bash
mkdir -m 700 owner-private
export SUPERTRADER_OWNER_KEY_FILE=/lokaler/privater/owner-key.pem
node --input-type=module <<'JS'
import fs from 'node:fs';
import {decryptSealed} from './scripts/supertrader/validation/lib.mjs';
const pem = fs.readFileSync(process.env.SUPERTRADER_OWNER_KEY_FILE, 'utf8');
const input = fs.readFileSync('scripts/supertrader/research/certification/sealed/SUPERTRADER-RERUN-COMPACT.owner.sealed.json', 'utf8');
const plaintext = decryptSealed(pem, input);
JSON.parse(plaintext.toString('utf8'));
fs.writeFileSync('owner-private/owner-results.json', plaintext, {mode: 0o600, flag: 'wx'});
JS
```

Der vollständige Bericht steht im entschlüsselten JSON unter `ownerReportMarkdown`; `finalAnswers` enthält die zwanzig ausführlichen Antworten, `current` die private aktuelle Fallbasis. Den Bericht ohne Ausgabe in öffentliche Logs speichern:

```bash
node --input-type=module <<'JS'
import fs from 'node:fs';
const result = JSON.parse(fs.readFileSync('owner-private/owner-results.json', 'utf8'));
fs.writeFileSync('owner-private/owner-report.md', result.ownerReportMarkdown, {mode: 0o600, flag: 'wx'});
JS
```

Der Compact enthält zusätzlich neun hashgebundene private Prüfmodule als UTF-8-Quelltext. Ihre tatsächlichen Byte-Hashes sind vor Nutzung mit den enthaltenen Review-Bindungen abzugleichen. Schlüssel und Runtime-Secrets sind darin nicht enthalten.

## Große Roharchive

`OWNER-DELIVERY-MANIFEST.json` benennt die Pakete und alle Owner-Teile in ihrer tatsächlichen Reihenfolge. Nur die Teile desselben Pakets zusammensetzen. Jeden Teil und das vollständige rekonstruierte Envelope gegen die angegebenen Cipher-Hashes und Byte-Längen prüfen. Ein Paket enthält gzip-komprimiertes TAR im gleichen RSA/AES-Envelope; es ist kein JSON-Ergebnis-Payload.

Das im Compact enthaltene Modul `bounded-owner-pack.mjs` unterstützt `decryptEnvelopeToHash(file, privatePem, {outputFile})` für eine lokale private TAR-Datei. Die Funktion schreibt mit Modus 0600, prüft GCM und verwirft eine unvollständige Ausgabe bei Fehler. Vor Extraktion den resultierenden TAR-Hash gegen den tatsächlichen Archivnachweis prüfen. Die enthaltene `archive-manifest.json` bindet alle regulären Mitglieder mit Byte-Längen und SHA-256.

## Reproduktions- und Aufbewahrungsgrenzen

Original #589, dieselbe neue Source mit Original-Execution und der V2-Rerun bleiben getrennte Bedingungen. Strategieregeln, Kosten und historische Fenster wurden nicht nach Ergebnissichtung verändert. Die Reihenfolge der Archivpakete darf aus Speichergründen variieren; ihre Mitgliedschaft und Source-Hashes bleiben identisch.

Die großen historischen und Current-Source-Abhängigkeiten sind separat erhalten und durch Acquisition-, Content- und Dependency-Receipts gebunden. Workspace-Dateien und zeitlich begrenzte GitHub-Actions-Artefakte sind keine Zusage unbegrenzter Langzeitaufbewahrung. Bereits entfernte identische Transport-ZIP-Kopien sind ausdrücklich keine noch vorhandenen Originaldateien; erhaltene Source-Mitglieder und dokumentierte Rekonstruktionsgrenzen werden getrennt nachgewiesen.

Der Rerun bleibt `SEEN_HISTORICAL_DATA` auf einem beobachteten, nicht vollständig zertifizierten PIT-Marktpanel. PARTIAL-Matches und diagnostischer Consensus sind keine qualifizierten Kaufsignale. Vorbereitete Forward-Ledger enthalten keine automatisch gestarteten Live-Signale.
