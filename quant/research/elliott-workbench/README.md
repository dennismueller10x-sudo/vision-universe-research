# Elliott-Werkbank – Blindprotokoll für echte Expertinnen und Experten

Status: **NOT EXPERT VALIDATED.** Die Engine gilt erst dann als von Fachleuten geprüft, wenn echte Menschen nach diesem Protokoll annotiert haben und die Auswertung von Menschen durchgesehen wurde. Kein Sprachmodell und keine Engine darf als Experte annotieren. Annotationen werden nie erfunden.

## Dateien

| Datei | Inhalt | Wann sichtbar |
|---|---|---|
| `cases-blind.json` | Fall-Code, Art, Zeitebene, Stichtag, Schlusskurse **bis** zum Stichtag (max. 520 Bars); Manifest mit SHA-256 von `cases-sealed.json` | vor der Abgabe |
| `cases-sealed.json` | Symbol, Schichten, Engine 3.x/2.2 am Stichtag, Zählungs-Historie, 52-Wochen-Verlauf danach, Praktiker-/Synthetik-Referenz, `EXPERT_HOLDOUT`-Kennzeichen | erst nach der eigenen Abgabe, je Fall |
| `annotation-schema.json` | Schema `vu-elliott-annotation-2.0.0` | – |
| `index.html` | Werkbank (Blindannotation, Versionen, Audit-Log, Export/Import) | – |

Erzeugen: `node scripts/technical/elliott-workbench-data.mjs` (≈ 5–7 min). Auswerten: `node scripts/technical/elliott-expert-agreement.mjs <export.json …>` → `expert-agreement-results.json`. Ohne Dateiargumente liest das Skript `annotations/*.json` in diesem Ordner; dort gehören die Exporte der Annotierenden hin.

## Fälle

- **REFERENCE (150):** echte US-Wochencharts. Stichprobe und Stichtag deterministisch per Hash, nie nach dem späteren Kursverlauf ausgewählt. Die Stichtage liegen zwischen 2012 und 2024. Geschichtet wird nur mit Informationen bis zum Stichtag: Regime, Volatilität, Größen-Proxy, Sektor (falls bekannt) und der Struktur-Hinweis der Engine. Emittenten aus dem HOLDOUT-Split der Engine-Entwicklung sind ausgeschlossen. **30 Fälle sind als `EXPERT_HOLDOUT` versiegelt.** Sie werden normal annotiert, aber nicht für die Engine-Entwicklung verwendet. Die Auswertung schließt sie aus; nur `--unseal-expert-holdout` nimmt sie für die einmalige Holdout-Prüfung auf.
- **PRACTITIONER:** Charts zu veröffentlichten Praktiker-Zählungen. Die Quelle bleibt bis zur Abgabe versiegelt.
- **SYNTHETIC:** Übungsfälle mit bekannter Struktur. Die Wahrheit wird erst nach der Abgabe gezeigt.

## Ablauf für jede annotierende Person

1. Die Seite über einen lokalen Webserver ab dem Repo-Root öffnen: `…/quant/research/elliott-workbench/index.html`. Es ist ein eigenes Browserprofil zu verwenden, denn die Annotationen liegen im localStorage.
2. Oben einen **pseudonymen Code** eintragen (z. B. `EXP-07`). Keine Klarnamen und keine E-Mail-Adressen (Privacy §80). Die Zuordnung von Code zu Person führt die Studienleitung außerhalb dieses Systems. Die **Rolle** (A, B oder optional C) vergibt die Studienleitung: Wer Rolle A hat, behält sie für alle Fälle.
3. Je Fall nur den Chart bis zum Stichtag ansehen. Es gibt kein Symbol und keine Engine. Den Fall nicht im Internet nachschlagen und keinen Chart „nach“ dem Stichtag ansehen.
4. Die **Hauptzählung** erfassen: Muster, Grad (Frost & Prechter), laufende Welle, Status (developing, confirmed oder possible) und die Richtung der laufenden Welle. Pivots per Klick in den Chart setzen (ein erneuter Klick entfernt den Pivot) oder als Text `JJJJ-MM-TT:Preis:Label; …` eingeben. Dazu Invalidierung und Zielzone. Optional eine **Alternative** erfassen. Außerdem anzugeben: die Anwendbarkeit (HIGH, MODERATE oder LOW), „Keine verlässliche Zählung“, die eigene Sicherheit (1–5) und einen Kommentar.
5. **Abgeben.** Jede Speicherung erzeugt eine neue Version. Alte Versionen bleiben erhalten, und das Audit-Log wird ergänzt.
6. Erst danach lässt sich „Engine & Ergebnis aufdecken“ wählen. Dabei wird die versiegelte Datei gegen das SHA-256-Commitment geprüft. Versionen, die nach dem Aufdecken gespeichert werden, tragen `postReveal=true` und gehen **nicht** in die Auswertung ein.
7. Am Ende des Tages **Export JSON** wählen und die Datei an die Studienleitung geben. CSV und Audit-Log-CSV sind für die Durchsicht gedacht.

## Doppelannotation und Import

- Jeder Fall soll von mindestens zwei Personen (A und B) unabhängig annotiert werden, optional von einer dritten (C). Die Fallliste zeigt, wie viele Personen einen Fall schon annotiert haben.
- Mehrere Personen können denselben Browser nutzen, indem sie den Code wechseln. Getrennte Browser sind aber vorzuziehen, damit niemand die Arbeit der anderen sieht.
- **Import JSON** übernimmt die Exporte externer Annotierender. Jede Annotation wird gegen das Schema validiert. Doppelte Einträge werden über `annotationId + version` erkannt: Bei gleichem Inhalt gilt der Eintrag als Duplikat, bei anderem Inhalt als Konflikt, und der vorhandene Eintrag bleibt. `AUTOMATED` wird abgelehnt.

## Auswertung

`elliott-expert-agreement.mjs` berechnet die Übereinstimmung für die Paare Engine↔A, Engine↔B und A↔B. Verglichen werden: exakter Grad, Grad ±1, laufende Welle, Musterfamilie, Richtung, Invalidierung (Abstand höchstens 3 % oder 1 ATR), Schnitt der Zielzonen, Überlappung von Haupt- und Alternativzählung, Anwendbarkeit und Enthaltung. Dazu kommen Cohens κ, Fleiss' κ (A, B und C) und linear gewichtetes κ (Grad, Anwendbarkeit). Jeder Wert wird nur bei mindestens 2 Ratern und mindestens 10 Einheiten berechnet, sonst steht dort `null` mit Grund. Gibt es keine Annotationen, lautet der Status `BLOCKED – no expert annotations`. `--selftest` prüft die κ-Formeln an Lehrbuchwerten und nutzt dafür nur TEST-Daten im Speicher; dabei wird nichts geschrieben.

Für die Engine gibt es keinen Frost-&-Prechter-Grad. Ihr Grad wird **heuristisch** aus der mittleren Wellendauer abgeleitet (`degreeMethod` in `cases-sealed.json`). Gradvergleiche mit der Engine sind daher nur als Näherung zu lesen.

## Bekannte Grenzen

- Blindheit ist eine Protokoll-Regel und keine Zugriffssperre: Wer die Datei `cases-sealed.json` direkt öffnet, bricht das Protokoll. Das Commitment belegt nur, dass die versiegelten Inhalte nachträglich nicht verändert wurden.
- Datum und Kursniveau können einen bekannten Titel verraten (Wiedererkennung). Wer einen Chart erkennt, vermerkt das im Kommentar.
- Der Größen-Proxy nutzt die heutige Indexzugehörigkeit, enthält also Look-ahead. Sektoren gibt es nur für etwa 100 kuratierte Titel. Für einen Stichtag sind 52 Wochen Daten danach nötig, was eine leichte Überlebensverzerrung erzeugt.
- Es gibt keine Tages-Teilmenge, weil nur etwa 1 Jahr Tagesdaten vorliegt (2025–2026). Damit ist kein Stichtag zwischen 2012 und 2024 möglich.
- Die Engine enthält sich bei etwa 95 % des Pools (Anwendbarkeit LOW). Die Strukturschichten beruhen deshalb auf ihrem Hauptmuster auch dann, wenn sie sich enthält.
