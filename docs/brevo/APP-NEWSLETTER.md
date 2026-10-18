# Vision Universe. Die App. — geschützter Newsletter-Entwurf

Stand: 18. Oktober 2026. Das bereitgestellte Testpaket ist als kuratierte Vorlage umgesetzt. **Kampagne 10 ist angelegt; Brevo hat den internen Test angenommen. Die Hauptkampagne bleibt ungesendet.**

## Inhalt und Vorschau

- Betreff: **Investieren mit Weitblick. Alles in einer App**
- Preheader: „Aktien richtig handeln und verstehen“
- Gestaltung und iPhone-Motiv aus dem freigegebenen Testpaket; Claim, Text, nicht verlinktes „Bald verfügbar“ sowie Website-/Impressum-Links erhalten.
- Die bestätigte Unternehmensanschrift aus dem bestehenden Impressum ergänzt den Footer.
- `scripts/brevo/content/vision-universe-app/content.json` und `newsletter.html.tmpl` enthalten ausschließlich öffentliche redaktionelle Angaben. Keine Empfänger, Schlüssel oder privaten Kontaktdateien.
- Das originale PNG liegt unverändert im Repository. Die E-Mail verwendet eine **an den Bild-Commit gebundene HTTPS-URL bei GitHub**, keine Data-URI. Keine neue Hosting-Plattform oder Änderung an der Landingpage. Vor Entwurfserstellung werden öffentliche Erreichbarkeit, MIME-Typ und SHA256 geprüft; kein API-Key wird an den Bildhost geschickt.
- Lokale [Mobilvorschau](review/vision-universe-app/mobile.png), [Desktopvorschau](review/vision-universe-app/desktop.png) und [Layoutprüfung](review/vision-universe-app/checks.json). Browser-Vorschauen belegen keinen Eingang oder die Darstellung in echten Mailclients. Der Brevo-Abmeldetag `{{ unsubscribe }}` bleibt erhalten; seine kampagnenspezifische Auflösung ist erst im später genehmigten echten Test zu prüfen.

## Tatsächlicher Stand und neuer Freigabeweg

PR 764 ist gemergt. [Entwurfserstellung 39121827685](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39121827685) und [anschließender API-Leseabgleich 39121907408](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39121907408) waren erfolgreich: **Kampagne 10, VU | Vision Universe. Die App.**, klassischer ungesendeter Entwurf, Liste 4 einbezogen und Liste 6 ausgeschlossen. Konkrete Absender-/Domain-, Testkontakt- und Einwilligungs-/Sperrprüfungen bestanden.

Der bereits ausdrücklich freigegebene [Testlauf 39122311094](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39122311094) ist inzwischen erfolgreich: **Brevo hat den Test an die zwei internen Empfänger angenommen.** Tatsächlicher Postfacheingang und Darstellung sind damit noch nicht nachgewiesen. Version: `90580a007dac76c46c0a8ab13e963a22eed9cd0d7692b7123ac3399105b5cabe`. Nicht erneut senden. Die Hauptkampagne wurde nicht versendet; kein Hauptversand freigegeben.

Die private Konfiguration ist im Repository-Secret `BREVO_NEWSLETTER_CONFIG` eingerichtet und funktionsfähig. Die HMAC-Bindung bleibt bestehen; keine erneute Dateiübergabe nötig. Das vorhandene Register auf `brevo-newsletter-state` ist initialisiert und enthält den akzeptierten Test. Niemals zurücksetzen.

Auf ausdrücklichen Betreiberwunsch genügt künftig die konkrete Chat-Freigabe. Der zusätzliche GitHub-Klick entfällt durch den an den Owner gebundenen Dispatch. Bestehende Review-Umgebungen werden nicht gelöscht oder geändert, der neue Workflow verwendet sie nicht mehr. **Ablauf, technische Bindungen, Nachweisgrenzen und reine Live-Prüfung ohne Mail:** [APPROVAL.md](APPROVAL.md).

## Entwurf und Versand

1. `operation=draft`, `content_source=vision-universe-app`, `authorize_send=false` erstellt oder verwendet den identischen ungesendeten Entwurf. Der Inhalt kommt aus der redaktionellen Datei, nicht aus einem zusätzlichen Content-Secret. Keine Kontakte ändern oder entsperren.
2. `operation=check`, konkrete Kampagnen-ID liest die tatsächliche Brevo-Version und den Teststatus.
3. Erst nach ausdrücklicher Freigabe des konkreten Tests: `operation=test`, Kampagnen-ID, exakter Versionshash, eigener `approval_sha256`, `authorize_send=true`. Der Workflow prüft den Owner und versendet über das offizielle `sendTest` an die zwei konfigurierten internen Empfänger. API-Annahme ist kein Zustellnachweis. Die bestehende akzeptierte Testversion wird nicht wiederholt.
4. Erst nach tatsächlicher Testabnahme und separater ausdrücklicher Hauptfreigabe: `operation=send` mit derselben geprüften Inhaltsversion und einer neuen Freigabereferenz. **Kein Hauptversand aus diesem Änderungsauftrag.**

Alle bisherigen Empfänger-, Domain-, Sperren-, Versions- und Wiederholungsschutzprüfungen bleiben erhalten. Keine geplanten Newsletter oder automatischer Hauptversand. 64 synthetische Schutztests prüfen zusätzlich den neuen Owner-Dispatch und die nicht sendende Freigabeprüfung.


## Korrektur nach eingegangenem Vorabtest (18. Oktober 2026)

Gewünschter Kampagnenabsender: **Vision Universe | Aktien & Börse 📈**. Betreff bleibt **Investieren mit Weitblick. Alles in einer App**, Preheader **Aktien richtig handeln und verstehen**. Der neue Absender erzeugt eine neue, separat zu prüfende Hauptfassung; der alte Entwurf 10 und dessen Testnachweis werden nicht gelöscht oder umgedeutet. Vorabansicht ohne providerseitigen TEST-Zusatz über den gesonderten Modus `preview`, siehe [APPROVAL.md](APPROVAL.md#vorabansicht-ohne-test-präfix). Dieser Dokumentationsstand allein belegt noch keinen erneuten Versand; maßgeblich sind der erfolgreiche Lauf und anschließende API-Leseabgleich.
