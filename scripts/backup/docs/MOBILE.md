# Bedienung am iPhone

## Sicherung starten (alle 2–3 Tage, 30 Sekunden)

1. GitHub-App öffnen → Repository **vision-universe-backup** → **Actions**.
2. Workflow **Vision Universe Backup** antippen → **Run workflow**.
3. Aktion `backup` lassen (sonntags `backup-tier2`) → **Run workflow**.
4. Nach 20–60 Minuten kommt eine Mitteilung der GitHub-App. Den Lauf öffnen → **Summary**.

## Bericht lesen

Die Zusammenfassung zeigt je Quelle eine Zeile:

| Ergebnis | Bedeutung | Was tun |
|---|---|---|
| OK | gesichert und geprüft | nichts |
| WARNUNG | gesichert, aber auffällig (z. B. Quelle deutlich geschrumpft, Refs während der Sicherung geändert, optionaler Endpunkt ohne Recht) | Hinweis lesen. Bei „geschrumpft“: an der Quelle prüfen, ob dort gelöscht wurde |
| FEHLER | diese Quelle wurde in diesem Lauf **nicht** gesichert; alle früheren Stände sind unverändert | Hinweis lesen, Lauf wiederholen; bleibt es rot: Claude mit dem Hinweis fragen |
| uebersprungen | absichtlich aus (z. B. Brevo ohne Freigabe) | nichts |

„Veraltete Sicherungsstände“ listet Quellen, deren letzter guter Stand älter als 4 Tage (Warnung) oder 7 Tage (rot) ist.

## Wenn eine Mail „Backup überfällig“ kommt

Der Totmannschalter hat 4 Tage lang keine erfolgreiche Sicherung gesehen. Dann:

1. Sicherung wie oben starten.
2. Geht GitHub nicht, den Ersatz-Runner nutzen: console.cloud.google.com → Cloud Run → Jobs → `vu-backup` → Ausführen. Voraussetzung: vorher eingerichtet.

## Monatlich (10 Minuten Bedienung)

`verify-full` → `drill` → `maintain-plan` (Liste lesen) → `maintain-apply`.

## Nie vom iPhone

- Schlüssel mit Löschrecht anlegen
- den Anker-Schlüssel in GitHub eintragen
- die Lifecycle-Regel verkürzen
