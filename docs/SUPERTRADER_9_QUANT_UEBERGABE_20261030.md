# Supertrader 9 → neue Quant-Sitzung: Übergabe Security Master und V13-Archiv (Stand 30.10.2026, ~16:15 UTC)

Die bisherige Quant-Sitzung (`session_01DVwZC5wTC6omQeEdJvtauz`) wird archiviert. Ihr Container und alles, was nur dort lag, gehen damit verloren. Diese Datei beschreibt, was die neue Quant-Sitzung übernimmt. Die Supertrader-9-Sitzung hat nichts davon selbst begonnen (Owner-Auftrag: keine konkurrierende Entwicklung am Security Master).

## 1. Bereits erledigt (auf `main`)

| PR | Merge-Commit | Inhalt |
|---|---|---|
| #1100 | `b8efea8` | Freeze-Werkzeug `scripts/quant/backtest-generation-freeze.cjs` |
| #1101 | `7276a7a` | Nachweis 1.1.0 → 1.3.0, Zählung 138/138/127 („133“ widerlegt), Hinweis auf #1143 als einzigen Freigabeweg |
| #1159 | `8f12165` | Pflicht-Identitätssperre (`scripts/market/build-security-master-identity-blocklist.mjs`), Freeze 550 Dateien V5.1–V13c (`verify-repo` INTACT), Alarm im Wochenlauf |

#1136 ist geschlossen. Abgelöst durch #1143 und #1159, Abgleich Datei für Datei im PR.

## 2. Security Master: Aufgaben der neuen Quant-Sitzung

Ein einziger Freigabeweg: **#1143** (Gate-Schema 1.1.0), dazu **#1163** für die belegten Doppelzeilen OKE und TEL. G1–G10 und ihre Grenzen (25/25/50/50/25/200) bleiben unverändert.

1. **#1143 und #1163 auf den Stand von `main` bringen.** #1143 liegt 41 Commits zurück, #1163 23. Beide mergen konfliktfrei mit `main` und miteinander (`git merge-tree` geprüft). Danach CI.
2. **Die Freigabeliste nach #1163 neu berechnen.** Grund (Abstimmung vom 30.10.): Mit #1163 ändern sich die `canonical_id` von TEL und weiteren Doppelzeilen, daraus kommt G7 27 > 25. Die PASS-Näherung der alten Sitzung beruhte auf Lauf 40942100928 ohne die inaktive OKE-Zeile, also **ohne** #1163.
   - Probelauf `security-master-weekly.yml` mit `commit=false` auf dem Erzeuger mit #1163-Register.
   - `node scripts/market/build-security-master-approval-list.mjs --gate-report … --prev … --next … --out …` (Optionen siehe Dateikopf), die zusätzlichen Wechsel mit Beleg aus `quant/config/security-master-duplicate-resolution.json`.
   - **`--accept-duplicate` nicht für OKE oder einen anderen Fall verwenden.** ONEOK ist keine Gate-Ausnahme. Die Auflösung läuft allein über das Register in #1163.
   - Ergebnis und Gate-Bericht in #1143 festhalten (`V130_APPROVAL_LIST_REVIEW.md`).
3. **Gesperrt bleiben (fail closed):** FUN, HUT, BAM, CCSI, NYXH, UHAL-B.
   - FUN: 8-K12B vom 01.07.2024 ist ein Zusammenschluss nach 12g-3(c) mit zwei Vorgängern, LP-Einheiten werden zu Aktien. Kein Nachweis 12g-3(a) mit 1:1. Bestätigt von beiden Sitzungen.
   - Weiter geschützt: die 35 wiederverwendeten Ticker (mehrdeutige Identität, keine Zusammenführung über das Symbol), die 13 Fälle mit geändertem Startdatum, die 14 Fälle mit weiterlaufender Reihe.
4. **Owner-Freigaben, nicht selbst auslösen:**
   - Merge von #1143 und #1163.
   - Lauf `commit=true` am selben Tag wie ein PASS-Probelauf. **Frist: Laufdatum 10.11.2026.** Ab 11.11. meldet die SF8-Eingangsprüfung den Stamm als STALE (`AUX_MAX_AGE_DAYS.master = 60`, `scripts/supertrader/source-faithful/product/input-gate.mjs`).
5. **Nach dem Commit des Stamms:**
   - Die Sperrliste aus dem committeten Stamm erzeugen.
   - `node scripts/quant/backtest-generation-freeze.cjs build-post-switch … --blocklist … --prev-master …`, danach `compare --approved … --blocklist …`. Befehle in `docs/data/SECURITY_MASTER_IDENTITY_BLOCKLIST.md`.
   - Den Leser umstellen nur mit einer abschließenden Freigabevorlage auf Basis dieses Vergleichs. Erst danach #1119.

## 3. V13-Archiv 1.2.0: Stand und was nicht verloren gehen darf

**Gesichert und wiederherstellbar.** Alle Belege sind echte Läufe:

| Schritt | Lauf | Ergebnis |
|---|---|---|
| Upload | 41068077861 (`put`) + `transfer.sh put` | 8 Teile + Manifest, SHA-256 je Datei |
| Integritätsprüfung in R2 | 41069005168 (`verify`) | 8/8 gegen `manifest-1.2.0.json` |
| Restore aus R2 (Sitzung) | 41069696417 (`get`) | 8/8 Teile, 11.616 Dateien hash-identisch |
| **Restore auf dem Runner** | **41073334070 (`restore`)** | `keycheck: OK`, 8/8 Teile OK, 11.616 Dateien (Log selbst geprüft) |

- Workflow `quant-v13-archive.yml`, `scripts/quant/v13/archive/{transfer.sh,restore-archive.sh}`, `manifest-1.2.0.json` und `archive-pub.pem` sind auf `main` **bytegleich** mit dem Stand des Runner-Restores (Commit `5ffe147`). Manifeste und Public Key sind eingefroren (Freeze #1159).
- Ablage: privater R2-Eimer, Präfix `research-snapshots/quant-v13/archive-1.2.0/`, Zugang nur über die Actions-Secrets `VU_HISTORY_S3_*`.
- **Kritischer Punkt: der private Schlüssel.** Ein GitHub-Secret lässt sich nicht auslesen, nur in Workflows verwenden. Geht das Secret `V13_ARCHIVE_PRIVATE_KEY` verloren oder wird überschrieben, ist das Archiv ohne Offline-Kopie nicht mehr zu entschlüsseln. Die Datei `archive-priv.pem` lag im Container der alten Quant-Sitzung, der mit der Archivierung entfällt. #1158 und das Archiv-README dort schreiben zwar, der Schlüssel liege „beim Owner offline“. Prüfen kann das nur der Owner.
- **Kein neuer Schlüssel.** Ein neuer Schlüssel macht die vorhandenen Teile nicht lesbar. Das Secret nicht überschreiben.
- Prüfung jederzeit ohne Datenbewegung: leerer Commit mit der Marke `[v13-archive:keycheck]` oder `[v13-archive:restore]`.
- **#1158** (nur Doku: `SESSION_HANDOVER_2026-10-30.md`, Archiv-README mit den Belegen) ist ein Draft der alten Sitzung und nicht gemergt. Beide Dateien sind bewusst vom Freeze ausgenommen. Mergen braucht die Freigabe des Owners. Für die Wiederherstellbarkeit ist es nicht nötig, weil Werkzeuge und Manifest schon auf `main` liegen.

## 4. Nicht Aufgabe der Quant-Sitzung

Der tägliche SF8-Kandidatenlauf (#1137 → #1146), die V1-Kriterien S1–S7 und die Supertrader-Zertifizierung bleiben bei der Supertrader-9-Sitzung (`docs/SUPERTRADER_9_OWNER_APPROVALS.md`, Abschnitt 12).
