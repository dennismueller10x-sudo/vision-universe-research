# Brevo API-Betrieb mit privater Übergabe und Versionsfreigabe

Stand 12. Oktober 2026: Code vorbereitet, neuer Newsletter-Workflow noch nicht auf main aktiviert. **Import vorbereitet, noch nicht durchgeführt.** Keine E-Mails, DNS-Änderungen oder Buchungen. Die Sichtbarkeit der Listen ist durch den Owner bestätigt.

## Einmalige Importübergabe

Der vorhandene Workflow `brevo-admin.yml` liest `BREVO_IMPORT_PAYLOAD` bereits bei `import-preview`/`import`. Der normale API-Key funktioniert ausschließlich im Actions-Runner. Das tatsächlich ausgeführte [Preview](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38251453506) scheiterte vor Kontaktabgleich: Übergabe-Secret fehlt oder ist zu groß. Der vorbereitete neue Payload hat 6.236 Byte und liegt weit unter dem 48-KiB-Limit. Codex erhält beim Secret-Übergabe-Endpunkt HTTP 403.

Ein Betreiber mit Repository-Secret-Schreibrecht lädt den Payload ausschließlich aus der privaten Owner-Übergabe herunter und hinterlegt den **gesamten Dateiinhalt** unter GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret, Name **BREVO_IMPORT_PAYLOAD**. Wenn bereits vorhanden: dessen Wert ersetzen. Kein Brevo-Export oder manueller Brevo-CSV-Import.

Alternativ nach Umbenennen des privaten Downloads in `VU-Brevo-API-137-private-payload.b64`, auf dem eigenen angemeldeten Rechner:

```bash
gh secret set BREVO_IMPORT_PAYLOAD \
  --repo dennismueller10x-sudo/vision-universe-research \
  < VU-Brevo-API-137-private-payload.b64
```

Nicht `cat`, `echo`, Kommandozeilenwerte, Screenshots oder Debug-Logs zur Übergabe verwenden. Base64/Gzip ist keine Verschlüsselung: die Download-Datei enthält private Daten und darf ausschließlich privat verarbeitet werden. GitHub verschlüsselt den Secret-Upload. Der API-Key wird weder gelesen noch kopiert. Bestehende private CSVs/Originalexport unverändert erhalten. Keine unbegrenzte lokale oder Download-Aufbewahrung zugesagt.

## Bestandsabgleich und Import

1. `brevo-admin` manuell auf `main`, **import-preview**. Daten verbleiben im Arbeitsspeicher; jede Adresse wird privat per `GET /contacts/{email}` geprüft. Nur Zählwerte gelangen in Logs, keine Kontaktdateien oder Artefakte. Der aktuell belegte bestehende Kontakt hat ungeklärte VU-Einwilligung; ob er im Importpaket vorkommt, ist bislang nicht geprüft. Sein Treffer wird gegebenenfalls vollständig zurückgestellt.
2. Vor tatsächlichem Import neue Policy auf main bereitstellen. Sie erlaubt nur bestätigte Abonnenten, an tatsächliche Listen-IDs gebunden. Neue Kontakte per `POST /contacts`, `updateEnabled=false`; keine PUT-Updates für diesen Bestandsimport. Abmeldungen/Sperren/abweichende Werte oder Mitgliedschaften sowie fehlende Statusfelder bestehender Kontakte bleiben unverändert. Exakte bereits importierte Datensätze werden ohne Mutation übersprungen. Kollision oder unklarer API-Ausgang: stoppen, privat prüfen, kein automatischer Retry.
3. **Automatisierungen → Workflows → Aktiv**, einschließlich klassischer Workflows, aller Seiten und Filter, tatsächlich prüfen. Im Arbeitszugang sind keine entsprechenden Screenshots vorhanden. Bei null aktiven Workflows reicht diese vollständige Statusansicht. Sonst pro aktivem Workflow Eintrittstrigger und Kontaktfilter zeigen: Kontaktanlage, Attributänderung, Listen 4/6, globale Regeln, Segment-Eintritt und Welcome/DOI dürfen durch diesen Import keinen Flow auslösen. Kein pauschales Deaktivieren. Ein Listen-Screenshot oder die Importfreigabe ersetzt den Nachweis nicht.
4. Tatsächlichen privaten Nachweis hashen und dessen Prüfzeitpunkt mit Zeitzone festhalten. **import** benötigt `automations_checked=true`, `import_triggers_excluded=true`, `automations_reviewed_at` höchstens 24 Stunden alt, `automation_evidence_sha256` und `review_prepared_sha256` aus dem privaten Manifest. Keine privaten Inhalte in Workflow-Eingaben, nur Hash/Zeitpunkt/Prüfaussagen. Diese Angaben niemals ohne tatsächliche Prüfung setzen. Alter privater `BREVO_IMPORT_REVIEW` bleibt alternativ kompatibel, ist aber nicht nötig.
5. Ziel: 135 reguläre Kandidaten → **VU | Newsletter, ID 4**; zwei interne Kandidaten → ausschließlich **VU | Newsletter-Test, ID 6**. Fünf Käufer im Paket, Käuferstatus separat als Boolean. **VU | App-Warteliste, ID 5** nicht verwenden; 13 Nicht-Abonnenten ausgeschlossen. Mengen können durch zurückgestellte Bestandstreffer kleiner ausfallen. Nach jedem neuen Kontakt tatsächliche Werte/Mitgliedschaften zurücklesen; keine Zustellung behaupten.

Nach erfolgreicher Rückprüfung den temporären Import-Secret entfernen; ein erneuter Import braucht bewusst dasselbe validierte private Paket. Newsletter verwendet eine getrennte kleine Konfiguration und benötigt den Kontaktbestand nicht erneut. Downloads nur in vorhandener privater Ablage aufbewahren; keine neue Speicherplattform.

## Späterer Newsletterbetrieb

Kein Newsletter-Inhalt, Test oder Hauptversand ist derzeit freigegeben. Domain `verified=false`/`authenticated=false`; keine Versandbereitschaft. Tatsächliche DNS-Werte bleiben in der privaten Übergabe, kein DNS- oder Bestätigungsaufruf.

Der separate `brevo-newsletter.yml` wird ausschließlich manuell auf dem Standardbranch ausgeführt. `brevo-admin` und die alte Actions-CLI bleiben ohne Versandendpunkte. Nach Code-Merge ist für Newsletter einmalig folgendes Betreiber-Setup nötig, weil der aktuelle Zugang für Environment-Schreiboperationen HTTP 403 erhält:

- Settings → Environments → New environment → **brevo-newsletter-review**. **Required reviewers** aktivieren und ausschließlich den Owner als einzelnen Benutzer auswählen; keine Team-Freigabe. Self review darf zugelassen werden, falls der Owner selbst dispatcht. Eine konkrete Review-Bestätigung ist trotzdem immer erforderlich. Die API prüft sowohl verpflichtende Reviewer als auch die tatsächliche Freigabe genau dieses Runs. Ein ungeschütztes oder automatisch erzeugtes Environment blockiert Versand im Code.
- Kleine private Konfiguration mit den zwei eindeutigen Testadressen, `test_addresses_confirmed=true` und stabiler zufälliger `ledger_hmac_key` als Repository-Secret **BREVO_NEWSLETTER_CONFIG** hinterlegen. Die vorbereitete Konfiguration enthält keinen API-Key und keinen allgemeinen Kontaktbestand. HMAC-Schlüssel später nicht rotieren, ohne die bestehenden Reservationsbindungen ausdrücklich zu berücksichtigen.
- Tatsächlich freigegebenen Content als **BREVO_NEWSLETTER_CONTENT** hinterlegen: `name`, bestätigte `sender_id`, `subject`, `preheader`, `intro`, ein bis drei `items` mit `title`/`text`, `cta_text`, HTTPS-`cta_url`, verifizierte `company_name`/`company_address`, `company_details_verified=true`. Keine Unternehmensangaben erfinden. Das ist eine spätere redaktionelle Übergabe, keine laufende KI-Integration.

Ablauf danach:

1. Einmalig **initialize**: Branch `brevo-newsletter-state` mit ausschließlich personenbezogen datenfreiem Register anlegen. Bestehenden Zustand niemals löschen oder erneut initialisieren, auch bei Fehlern. Initialisierung versendet nichts.
2. **draft** erstellt einen klassischen ungesendeten Entwurf, Hauptliste bzw. konfiguriertes Segment, Testliste ausdrücklich ausgeschlossen. Domain/Absender, beide tatsächlichen Testkontakte und Zielgruppen-Einwilligungen müssen stimmen. Kein Termin, kein A/B-/Best-Time-Versand.
3. **check** mit Kampagnen-ID liefert den Hash der tatsächlichen Brevo-Inhaltsversion und Teststatus, keine Inhalte/Adressen. Diese Prüfung funktioniert bereits vor dem ersten Test.
4. Erst nach ausdrücklicher Freigabe dieses Tests: **test** mit derselben Kampagnen-ID, `expected_version` aus check und `authorize_send=true`; Owner genehmigt genau diesen Run in **Review deployments**. Offizielles `sendTest` nur an die zwei bestätigten Empfänger. Produktion bleibt Entwurf; API-Annahme ist kein Zustellnachweis. Keine automatische Fortsetzung.
5. Nach tatsächlicher Sichtprüfung und separater ausdrücklicher Owner-Freigabe: **send** mit derselben ID/Version und erneutem geschützten Review. Nur ein zur aktuellen Inhaltsversion und Testpaar passender angenommener Test erlaubt Hauptversand. Jede Inhalts-/Vorlagen-/Betreffänderung invalidiert vorherige Tests und Freigaben.

Globale Newsletter-Concurrency und versionsgebundene GitHub-Contents-API-Schreiboperationen sichern Reservierungen **vor** jedem irreversiblen Brevo-Aufruf. Register enthält nur IDs, Versionshashes, Zustände und HMAC-Testbindung mit privatem Zufallsschlüssel; keine Inhalte, Betreffzeilen, Adressen oder ungeschützten Adresshashes. Keine Actions-Artefakte/Caches, kein Git-Push auf main. Fehlende Registerdatei, CAS-Konflikt, API-Fehler oder unklarer Ausgang lassen `pending` und blockieren Wiederholung/Hauptversand. Nur nach privater Klärung in Brevo weiterarbeiten.

Ein Branch-Register ist keine eigene Brevo-Rollenverwaltung: Repository-/Brevo-Administratoren können Schutz außerhalb dieses Prozesses umgehen. Direkte UI-Sendungen begrenzen; während Test/Freigabe/Versand Inhalte nicht parallel bearbeiten. Brevo besitzt keinen atomaren Compare-and-Send; Änderungen nach der letzten API-Prüfung können nicht transaktional ausgeschlossen werden.

Offizielle GitHub-Schnittstellen: [Review-Historie eines Runs](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run), [Environment und Pflichtreviewer](https://docs.github.com/en/rest/deployments/environments#get-an-environment), [Contents mit SHA-Vergleich](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).
