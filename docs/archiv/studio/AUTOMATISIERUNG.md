# Weg zur Automatisierung

Stand 2026-10-21. Ziel: Der Owner gibt ein Thema oder ein „Go", der Rest läuft. **Nichts wird je ohne Freigabe veröffentlicht.** Jede Stufe unten ist ein Vorschlag und braucht die Zustimmung des Owners, bevor sie gebaut wird.

## Heutiger Stand

Skripte laufen einzeln von Hand (`studio/reels/tools/`). `build_timing.py` und `composition.html` werden je Reel angepasst, weil Szenengrenzen über Wortnummern definiert sind. Karte anlegen und Messung laufen über GitHub-Workflows.

## Stufen

1. **Brief als Datei.** Ein `brief.json` je Reel: Thema, Hook, Skript, Fakten mit Quellen, Szenen (mit Ankerwörtern statt Wortnummern), Zahlen für Grafiken, Caption. Alles Weitere wird daraus erzeugt.
2. **Ein Befehl.** `studio/reels/make.mjs brief.json`: Stimme (nur mit `--paid`), Straffen, Wortzeiten, Szenen aus Ankerwörtern, Render, Ton, Zusammensetzen, Kontaktbogen und Whisper-Bericht. Szenen-Bausteine als Bibliothek (Hook-Zahl, Linienchart, Ring, Balkenvergleich, Karte, Icon, Endkarte), damit nicht jedes Reel eine neue Komposition ist.
3. **Briefing am Morgen.** Eine geplante Aufgabe startet eine Sitzung, die mit Kostendeckel (`maxTotalChargeUsd`) recherchiert, drei Themen mit Hook, Beweis, Faktentabelle und Skript vorschlägt und **nichts produziert oder bezahlt**. Der Owner antwortet mit „Go" auf eines. (Der Owner hatte tägliche Automatik zuvor abgelehnt, daher erst nach ausdrücklicher Zustimmung.)
4. **Lernschleife.** Nach 72 Stunden liest der lesende Workflow die Kennzahlen, trägt sie in REEL_RESEARCH.md ein und schlägt die nächste Hypothese vor (Playbook, Abschnitt 7).
5. **Mehr Kanäle.** TikTok und X aus derselben Datei, kürzere Texte aus der Caption.

## Schranken, die bleiben

- Veröffentlichen nur im Approval Center durch den Owner.
- Kostendeckel je Lauf und je Tag, Guthaben-Prüfung vor jedem bezahlten Aufruf, keine Wiederholung bei Fehlern ohne Rückfrage.
- Faktentabelle mit Primärquelle ist Pflicht. Ohne sie keine Stimme.
- Hook-Score unter 7 stoppt die Produktion.
- Keine fremden Inhalte, keine Marken-Nachbauten, KI-Kennzeichnung in der Caption.
- Keine Änderung an Produktpfaden oder generierten Daten. Eigene PRs, wenn Werkzeuge ins Repo kommen.

## Offene Entscheidungen

Wo die fertigen Videos dauerhaft liegen (aktuell nur HeyGen-Assets und lokale Ausgabe), ob ein eigener Speicher mit Range-Unterstützung gewünscht ist, welche Aufgaben nachts laufen dürfen, wie viel Guthaben und Apify-Kosten pro Monat erlaubt sind.
