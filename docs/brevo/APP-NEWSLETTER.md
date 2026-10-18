# Vision Universe. Die App. — geschützter Newsletter-Entwurf

Stand: 18. Oktober 2026. Das bereitgestellte Testpaket ist als kuratierte Vorlage umgesetzt. **Noch kein echter Kampagnenentwurf und keine Test- oder Newsletter-Mail erstellt beziehungsweise versendet.**

## Inhalt und Vorschau

- Betreff: **Vision Universe. Die App. Dein erster Blick.**
- Preheader: „Zehn Research-Werkzeuge an einem Ort. Die iPhone-App ist bald verfügbar.“
- Gestaltung und iPhone-Motiv aus dem freigegebenen Testpaket; Claim, Text, nicht verlinktes „Bald verfügbar“ sowie Website-/Impressum-Links erhalten.
- Die bestätigte Unternehmensanschrift aus dem bestehenden Impressum ergänzt den Footer.
- `scripts/brevo/content/vision-universe-app/content.json` und `newsletter.html.tmpl` enthalten ausschließlich öffentliche redaktionelle Angaben. Keine Empfänger, Schlüssel oder privaten Kontaktdateien.
- Das originale PNG liegt unverändert im Repository. Die E-Mail verwendet eine **an den Bild-Commit gebundene HTTPS-URL bei GitHub**, keine Data-URI. Keine neue Hosting-Plattform oder Änderung an der Landingpage. Vor Entwurfserstellung werden öffentliche Erreichbarkeit, MIME-Typ und SHA256 geprüft; kein API-Key wird an den Bildhost geschickt.
- Lokale [Mobilvorschau](review/vision-universe-app/mobile.png), [Desktopvorschau](review/vision-universe-app/desktop.png) und [Layoutprüfung](review/vision-universe-app/checks.json). Browser-Vorschauen belegen keinen Eingang oder die Darstellung in echten Mailclients. Der Brevo-Abmeldetag `{{ unsubscribe }}` bleibt erhalten; seine kampagnenspezifische Auflösung ist erst im später genehmigten echten Test zu prüfen.

## Tatsächliche Betriebsprüfungen

| Prüfung | Ergebnis |
| --- | --- |
| [Reiner Newsletter-Check 39116037809](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39116037809) | Sicher abgebrochen: `Private Newsletter-Konfiguration fehlt.` Kein Entwurf, kein Versand. |
| [Registerinitialisierung 39116261445](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39116261445) | Erfolgreich, dauerhaftes datensparsames Register auf `brevo-newsletter-state` eingerichtet; 0 E-Mails. Nicht zurücksetzen. |
| [Brevo-Audit 39116263425](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39116263425) | Free; Liste 4: 135, Liste 5: 0, Liste 6: 2; insgesamt 138 Kontakte; 10 kompatible VU-Merkmale; ein aktiver Absender, eine bestätigte und authentifizierte Domain. Nur GET, keine Kontaktänderung, kein Versand. |
| GitHub-Review-Umgebung | Über das lesbare Environment-Inventar nicht vorhanden. Die konkrete Anlage von `brevo-newsletter-review` mit verpflichtendem Owner-Review wird mit HTTP 403 `Resource not accessible by integration` abgelehnt. Kein ungeschützter Ersatz. |

Die vorhandene private Konfigurationsdatei ist lokal mit 0600 vorbereitet, enthält zwei bestätigte Testadressen und eine stabile HMAC-Bindung. Der Workflow-Check belegt, dass die erforderliche Konfiguration im Newsletter-Job nicht verfügbar ist. Die Secrets-Verwaltungs-API antwortet für den Codex-Zugang ebenfalls mit HTTP 403; kein Auslesen oder Zurückliefern des Brevo-API-Schlüssels. Private Dateien und ihre Werte gehören weder in diesen PR noch in Logs/Artefakte. Lokale Vorbereitung ist kein Nachweis dauerhafter Sicherung.

## Einmalige Betreiber-Einrichtung

1. [Repository → Settings → Secrets and variables → Actions](https://github.com/dennismueller10x-sudo/vision-universe-research/settings/secrets/actions) → **New repository secret** → `BREVO_NEWSLETTER_CONFIG`. Den vollständigen Inhalt der bereits privat vorbereiteten Datei `VU-Brevo-Newsletter-Config.private.json` verwenden, nicht den API-Key und nicht den Shopify-/Import-Payload. Nicht öffentlich einfügen. Die vorhandene HMAC-Bindung beibehalten. Für diese redaktionelle Vorlage ist **kein zusätzliches `BREVO_NEWSLETTER_CONTENT`-Secret** nötig.
2. [Repository → Settings → Environments](https://github.com/dennismueller10x-sudo/vision-universe-research/settings/environments) → **New environment** → exakt `brevo-newsletter-review` → **Required reviewers** aktivieren → Owner `dennismueller10x-sudo` als einzelnen Benutzer auswählen → speichern. Selbstfreigabe darf erlaubt sein; die explizite Freigabe genau des jeweiligen Runs bleibt Pflicht. Keine vorhandenen Gates ändern.

## Ablauf nach Merge und Einrichtung

Der PR ändert nur die redaktionelle Auswahl bei `draft`; alle bisherigen Versandgates bleiben erhalten. Der Workflow läuft weiterhin ausschließlich manuell auf `main`. Kein Push, PR, Merge oder Zeitplan sendet eine Mail.

1. Actions → **Brevo | Newsletter mit Versionsfreigabe** → Run workflow auf `main`: `operation=draft`, `content_source=vision-universe-app`, `authorize_send=false`. Der Loader wählt ausschließlich den eindeutig vorhandenen aktiven Absender der Domain `visionuniverse.de`; mehrere oder fehlende Treffer blockieren. Anschließend prüft der bestehende Prozess Domainauthentifizierung, tatsächliche Testkontakte, Sperren und Zielgruppenstatus. Kein Kontakt wird geändert oder entsperrt.
2. Der erstellte Brevo-Entwurf enthält Liste 4 und schließt Liste 6 aus, ist ungesendet und unterminiert. Wiederholte identische Entwurfserstellung wird über das bestehende Register dedupliziert. Entwurfserstellung ist **keine Hauptversandfreigabe**. Liste 5 und Nicht-Abonnenten bleiben unberührt.
3. `operation=check`, konkrete `campaign_id`: die API-Version lesen. `content_source` spielt ab diesem Schritt keine Rolle mehr; geprüft wird der tatsächliche Brevo-Entwurf.
4. Erst nach gesonderter ausdrücklicher Freigabe des konkreten Testversands: `operation=test`, Kampagnen-ID, exakter `expected_version`-Hash, `authorize_send=true`; genau diesen Run im geschützten Environment genehmigen. Offizielles `sendTest` ausschließlich an die beiden bestätigten internen Empfänger. API-Annahme ist kein Zustellnachweis. Aufgelösten Abmeldelink, Darstellung und tatsächlichen Eingang privat prüfen.
5. Der Entwurf bleibt nach dem Test ungesendet. **Kein Hauptversand in diesem Auftrag.** Jeder spätere Hauptversand benötigt eine neue ausdrückliche kampagnenbezogene Freigabe und einen eigenen geschützten Review. Änderungen an Betreff, HTML, Vorlage, Zielgruppe oder Absender invalidieren den vorherigen Test. Fehler oder unklarer Ausgang bleiben reserviert; kein automatischer Retry und keine Doppelmail.

55 synthetische Schutztests prüfen unter anderem Legacy-Vorlage, HTML-Escaping, festes HTTPS-Motiv und Bild-Hash, fehlgeschlagene Bildabrufe, uneindeutige Absender, unveränderte Zielgruppentrennung, Entwurfs-Deduplizierung, Versionsbindung, Pflichtreview, CAS-Fehler und Wiederholungssperren. Die lokale Browserprüfung bei 320, 375, 390 und 1440 Pixeln enthält keine echten API-Aufrufe oder Empfänger.
