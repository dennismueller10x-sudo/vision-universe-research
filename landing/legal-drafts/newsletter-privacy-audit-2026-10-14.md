# Datenschutzabgleich für PR #659

Stand: 14. Oktober 2026. **Noch keine abschließende Textfreigabe.** Firmenangaben wurden vom Betreiber bestätigt. Die öffentliche Anmeldung bleibt geschlossen; keine E-Mails, Kontaktänderungen, DNS-Änderungen oder neue Hauptdomain-Veröffentlichung in diesem Abgleich.

## Tatsächlich belegter Zustand

[Manueller Leseaudit 38586686572](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38586686572), Operator-Quellversion `7e53a46987102b79dda971ea4d141a7381f8a7b9`:

| Gegenstand | Ergebnis und Grenze des Nachweises |
|---|---|
| Brevo | Free-Tarif; Domain visionuniverse.de bestätigt und authentifiziert; aktiver Absender ID 1 |
| Bestandskontakte | Vollständige Kontaktobjekte in Listen 4/5/6 vorher/nachher gleich, Zahlen **135/0/2**; null Kontakt-Schreibaufrufe und null versandte E-Mails |
| API-DOI | Separate aktive Vorlage **8**, API-Link `{{ params.DOIurl }}`, Betreff/Tag und normalisierter HTML-Inhalt identisch zum Repository; Vorlagen 1–4 unverändert. Das beweist keinen Mail-Eingang oder Bestätigungsklick. |
| Pixel-Tracking | Kontaktmerkmal `_PIXEL_TRACKING_CONSENT` nicht vorhanden. `/account` liefert keine Tracking-/Aufbewahrungseinstellungsfelder. Wirksame Tracking-Funktion und Standard für unbekannte Einwilligung **nicht bestätigt**. |
| Versandprotokolle und Mailvorschauen | Tatsächliche konto-/absenderbezogene Aufbewahrungsregel **nicht über diese API bestätigt**. |
| Einwilligungsgruppen | Zusätzliche Abfrage HTTP **400**. Die erste Audit-Version verwendete irrtümlich `limit=100`; offiziell höchstens 50. Korrigiert. Folgeaudit **38590718465** liefert **403 / CONSENT_GROUP_NOT_ENABLED**: die Funktion ist im Konto deaktiviert. Der tatsächliche Abmeldelink wird trotzdem im kontrollierten Test geprüft. |
| Webhooks | Zusätzliche unparametrisierte Abfrage HTTP **400**; keine Abwesenheit von Webhooks behauptet. Folgeversion liest Marketing und Transaktions-E-Mails getrennt mit explizitem Typ. Folgeaudit **38590718465** hat beide expliziten Typen tatsächlich abgefragt: jeweils **400 / document_not_found**, keine zurückgelieferten Webhook-Datensätze. Keine erfolgreiche vollständige Inventur oder exakte Nullzahl behauptet; die Nachricht wurde nicht ungeprüft ausgegeben. Es werden keine URLs, Zugangsdaten oder personenbezogenen Payloads ausgegeben. |
| Bestehendes Pages-Projekt | `vision-universe` über vorhandenen `CLOUDFLARE_API_TOKEN` lesbar (200); Schlüssel und Rate-Key in Preview/Production als `secret_text`, Vorlagenbindung 8; öffentliche Freigaben geschlossen. |
| Cloudflare Web Analytics | Weder `build_config.web_analytics_tag` noch `web_analytics_token` gesetzt. |
| Eigene Datenbank / Protokolle | Keine D1-Bindung im geprüften Projekt. Anwendung enthält keine eigenen Kontakt-/Request-Logs, keine Abmeldedatenbank. Pseudonyme IP-Zähler 10 Minuten, E-Mail-Reservierungen 24 Stunden; Testadressbindung höchstens zwei Stunden (Cache-TTL auf ganze Sekunden gerundet). Cache wirkt pro Rechenzentrum und kann früher verwerfen. |
| Anbieterlogs / WAF | Projektantwort enthält keine Observability-/Logging-Einstellungsfelder und keine belegte allgemeine Anbieter-Protokollfrist. WAF-Ratenregeln nicht lesbar (403 / Code 10000); kein Schutz durch solche Regeln behauptet. |

Lesende HTML-/Header-Prüfung von Hauptdomain und Branch-Preview: jeweils 200, geschlossene Formularfelder, nur eigene Script-Hosts, kein Google-Analytics-/Meta-/Cloudflare-Beacon im ausgelieferten HTML, keine `Set-Cookie`-Namen in diesen Antworten. Diese Stichprobe beweist nicht die Abwesenheit sämtlicher technischen Cookies bei anderen Anfragen oder Sicherheitsmaßnahmen.

## Abweichungen im bisherigen Freigabeentwurf

1. **„Keine zusätzliche personenbezogene Erfolgsmessung“ war zu weitgehend.** Kein eigenes Auswertungsskript beweist nicht, dass Brevo keine individuellen Öffnungen/Klicks erhebt. Der DOI-Parameter `contactPixelTrackingConsent:false` wirkt laut offizieller API nur mit aktivierter entsprechender Kontofunktion. Der Text nennt diese offene Kontoprüfung ausdrücklich.
2. **Kurze Cache-Fristen sind keine Anbieter-Löschfristen.** Brevos tatsächliche Log-/Vorschau-Aufbewahrung muss ergänzt werden; die Dokumentation nennt unbegrenzte Log-Aufbewahrung ohne individuelle Regel. Für Vorschauen ist die tatsächlich ausgewählte Option maßgeblich. Cloudflares technische Anbieterprotokolle werden ebenfalls nicht mit dem Formularcache gleichgesetzt.
3. **Abmeldung ist keine automatische Löschung.** Die Anwendung enthält weder eine Kontaktlöschung noch einen Löschjob für Brevo-Versandprotokolle. Der Text verspricht dies nicht. Kontoweite Sperrwirkung wird erst im kontrollierten Test tatsächlich geprüft; die vorhandene Kampagnenlogik berücksichtigt `emailBlacklisted`.
4. **Vertragsbezug präzisiert.** Öffentlich verfügbare Standard-AV-Bedingungen sind belegt; eine individuell signierte Kontovereinbarung oder abweichende Vereinbarung ist nicht ausgelesen. Keine ausschließlich europäische Verarbeitung zugesichert. Ein neuer separater AVV-Abschluss wird nicht ohne Beleg verlangt.
5. **Privater Testzugang ergänzt.** Zugangshash und kurzlebige pseudonyme Bindung an die erste neue Testadresse werden jetzt beschrieben; sie sind vom Brevo-API-Schlüssel getrennt.

## Veröffentlichte Vertragsangaben

- [Brevo, deutsche Nutzungsbedingungen](https://www.brevo.com/de/legal/termsofuse/): aufgerufene Seite nennt Version **16.10.2025**, DACH-Regel in Anhang 2 mit **Brevo GmbH**, Berlin; AV-Vereinbarung in Anhang 3. Die [englische Seite](https://www.brevo.com/legal/termsofuse/) nennt abweichend **01.10.2025**. Beide beschreiben die Einbeziehung durch Kontoregistrierung/Nutzung; aus den Webseiten folgt nicht die individuelle beim Konto akzeptierte Version. [Brevo erklärt die Einbeziehung des AVV als Anhang](https://help.brevo.com/hc/de/articles/15403782599570-Wo-finde-ich-den-Vertrag-zur-Auftragsverarbeitung-AVV).
- [Cloudflare Self-Serve Subscription Agreement](https://www.cloudflare.com/terms/): veröffentlichter Stand **12.09.2025**, Abschnitt 6.1 bezieht den AV-Vertrag ein. [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/): **Version 6.4, wirksam ab 03.04.2026**, Cloudflare, Inc.; Übermittlungsregelungen einschließlich Standardvertragsklauseln. Individuelle abweichende Konditionen oder regionale Datenlokalisierung nicht nachgewiesen.
- [Cloudflare Pages Functions Logging](https://developers.cloudflare.com/pages/functions/debugging-and-logging/): der dort beschriebene Echtzeit-Logstream ist nicht persistent. Das ist keine Aussage über alle anderen Cloudflare-Sicherheits-/Netzwerkprotokolle. [Cloudflare Datenschutzerklärung](https://www.cloudflare.com/privacypolicy/), Abschnitt 11, nennt zweck-/pflichtbezogene Aufbewahrungskriterien, keine einheitliche Pages-Frist für sämtliche Daten.

## Genau noch benötigte Kontowerte

Nur ablesen; bestehende Einstellungen, Kontakte und Protokolle nicht pauschal verändern:

1. **Brevo → Einstellungen → Kontakte → Einwilligung zum Pixel-Tracking pro Kontakt**: Funktion aktiviert? Falls ja, Kontakte mit Status unbekannt tracken? [Direkte Kontoansicht](https://app.brevo.com/contact/settings/pixel-tracking-consent). Die [offizielle Anleitung](https://help.brevo.com/hc/en-us/articles/37114679474706-About-email-tracking-pixels-and-the-CNIL-recommendation-in-Brevo) beschreibt, dass Aktivierung bestehende Kontakte auf UNKNOWN setzt; deshalb hier keine ungeprüfte Aktivierung am geschützten Bestand.
2. **Brevo → Einstellungen → Transaktions-E-Mails → Aufbewahrungsregeln**: Protokollfrist, Geltung für alle Absender oder Auswahl einschließlich Absender 1, Mailvorschauen speichern ja/nein. [Direkte Kontoansicht](https://app-smtp.sendinblue.com/retention-logs). [Offizielle Anleitung](https://help.brevo.com/hc/en-us/articles/4415743225746-Configure-a-custom-retention-period-for-your-transactional-logs-and-email-previews). Eine neue kürzere Regel kann rückwirkend Logs löschen; keine Änderung in diesem Auftragsteil.
3. **Brevo → Einstellungen → Webhooks**: Konfigurationen für Marketing/Transaktions-E-Mails vorhanden? Falls ja, privat empfangenden Dienst nennen, keine URLs/Tokens öffentlich hinterlegen. Der korrigierte API-Leseabgleich wurde ausgeführt, meldet aber für beide Typen **document_not_found**; die [offizielle Schnittstelle](https://developers.brevo.com/reference/get-webhooks) unterstützt beide Typen.

Die API-Abfrage zu [Einwilligungsgruppen](https://developers.brevo.com/reference/get-consent-groups) ist auf 50 korrigiert. Die Wiederholung hat die deaktivierte Kontofunktion mit dem dafür vorgesehenen Fehlercode tatsächlich bestätigt. Der konkrete native Abmeldeumfang muss unabhängig davon im späteren autorisierten Betreiber-Test belegt werden.

Der Betreiber konnte diese Kontowerte nicht verlässlich ablesen und beauftragte deshalb die Fassung mit konkreten OFFEN-Markierungen. Diese Fassung erhält ausdrücklich den Freigabeumfang **controlled**: auch bei einer späteren Freigabe für den Betreiber-Test blockieren Build und Operator ihre Verwendung für eine allgemeine Anmeldung. Der korrigierte Empfänger-/Webhook-Leseabgleich wurde vollständig ausgeführt; beide Typfilter melden fehlende Dokumente statt Webhook-Konfigurationen. Die Testfassung macht diese Nachweisgrenze sichtbar und ist keine Freigabe für eine allgemeine Anmeldung. Für eine allgemeine Öffnung müssen das tatsächliche personenbezogene Tracking und die zugehörige Einwilligung sowie die Aufbewahrungs-/Empfängerangaben geklärt und der dann vollständige Text gesondert freigegeben sein. Individuelle Vertragsannahmeakten oder eine einheitliche Cloudflare-Logfrist werden durch Standardunterlagen nicht bestätigt; die veröffentlichten Vertrags-/Aufbewahrungskriterien werden stattdessen benannt. Die vorläufigen Freigabeentwürfe werden nicht als öffentliche Datenschutzseite gebaut. API-Tracking-Opt-out, eine erfolgreiche Setup-Antwort oder öffentliche Vertragsdokumente ersetzen keine Kontoprüfung.

## Prüfungen und Auslieferung

PR-Head `22cfb20bf17a281719fbd6405a56fae265387970`: Core [38586697892](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38586697892), Landingpage [38586697556](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38586697556), CI-Konfiguration [38586697499](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38586697499), Currency [38586697563](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38586697563) erfolgreich. Der frühere Core-Baselinefehler tritt hier nicht auf. Vercel meldet Build-Rate-Limit; kein kostenpflichtiger Tarif gebucht und keine Gates geändert. Neue Folgecommits benötigen ihren eigenen Checkstand.

**Kein Merge und keine Aktivierung in diesem Abgleich.** Nach konkreter Textfreigabe zuerst geschlossene Hauptdomain-Version, dann nur privater Betreiber-Test, danach tatsächliche Postfach-/DOI-/Abmeldeabnahme. Allgemeine Öffnung erst nach erfolgreicher gemeinsamer Abnahme.

## Abschließender Leseabgleich

[Audit 38590718465](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38590718465), Quellversion `50a79ae16c9578ad8ab54f420c56e5da1a3dbf57`: Gruppenfunktion deaktiviert; Webhook-Abfragen für beide Typen **400 / document_not_found**, Nachricht nicht sicher klassifizierbar und deshalb nicht ausgegeben. Kontakte unverändert **135/0/2**, null E-Mails und Kontakt-Schreibaufrufe. Der vorübergehende GitHub-CLI-401 ist behoben; Audit selbstständig ausgeführt. Kein manueller Actions-Start oder neues Secret erforderlich. Tracking-/Aufbewahrungswerte bleiben konkret OFFEN.

Die Testfassung informiert ausdrücklich über mögliche personenbezogene Öffnungs-/Klickereignisse und nicht bestätigte Anbieter-Aufbewahrung. Eine Freigabe betrifft nur die neue eigene Betreiber-Testadresse; kein öffentliches Formularangebot. Vor allgemeinem Start müssen tatsächliches Tracking und dafür passende Rechtsgrundlage/gegebenenfalls separate freiwillige Einwilligung sowie vollständige Empfänger-/Aufbewahrungsangaben feststehen. Die kurzen Cache-Fristen, Standard-AV-Bedingungen und der Nachweis deaktivierter Einwilligungsgruppen ersetzen diese Angaben nicht.

## Ausdrückliche Freigabe für den Betreiber-Test

Am 14.10.2026 hat der Betreiber die verlinkte Fassung auf Commit `146053cffcf953fc8d5b017417d2ff2fcbce583c` ausdrücklich ausschließlich für den kontrollierten Betreiber-Test freigegeben. Nur HTML-Metadatum draft → approved geändert; sämtliche sichtbaren Texte einschließlich OFFEN-Markierungen und die TXT-Datei bleiben unverändert. HTML-SHA256: `ff4262bb90c5a0a0fc99eca7b903e10e6fe6f8a30b342358d72ad253a5a27b6b`. Umfang bleibt **controlled**; public durch Build/Operator weiter gesperrt. Keine neue Interpretation der offenen Kontowerte und kein rückwirkender DOI-Nachweis.
