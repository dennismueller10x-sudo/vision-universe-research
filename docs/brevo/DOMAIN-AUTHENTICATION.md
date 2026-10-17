# Brevo-Domainauthentifizierung: visionuniverse.de

Stand: 13. Oktober 2026, 17:09 Uhr Europe/Berlin. **Domain bestätigt und authentifiziert:** `verified=true`, `authenticated=true`. Der Owner autorisiert ausschließlich fehlende Brevo-Code-/DKIM-Datensätze und DNS-only für passende DKIM-CNAMEs. Kein Versand, keine MX-/SPF-/DMARC-/Website-/Research-Änderung.

## Tatsächlich geprüfter Zugang

[Audit mit separatem Token 38419013645](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38419013645) hat die aktuellen Werte direkt aus Brevo gelesen: ein Brevo-Code-TXT und zwei DKIM-CNAMEs. Das Actions-Secret **`BREVO_CLOUDFLARE_DNS_TOKEN`** ist gesetzt; das aktive Konto-Token kann die Zone und ihr vollständiges DNS-Inventar lesen. Vor der Änderung: 17 DNS-Einträge, genau drei fehlende Brevo-Einträge, keine widersprüchlichen Brevo-Ziele. Werte, Schlüssel und das DNS-Inventar werden nicht veröffentlicht.

[Anlage 38419122035](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38419122035) ergänzte genau diese drei Datensätze und bestand den Rückvergleich sämtlicher unbeteiligter DNS-Einträge. Der anschließende erste Brevo-Authentifizierungsaufruf lieferte HTTP 400; deshalb ist der gesamte Lauf rot und wird nicht als erfolgreicher Authentifizierungsnachweis verwendet. [Reiner Leseabgleich 38419240069](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38419240069) bestätigt anschließend 20 DNS-Einträge, null fehlende Brevo-Einträge und beide DKIM-CNAMEs mit `proxied=false`. Keine bestehenden Inhalte überschrieben, keine Datensätze gelöscht, keine Kontakte geändert, keine E-Mails.

## Tatsächliche Authentifizierung und verbleibende Schritte

[Auth-Prüfung 38419564697](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38419564697) ist erfolgreich: der bodylose offizielle Brevo-PUT liefert HTTP 200; das anschließende GET meldet **`verified=true` und `authenticated=true`**. Dieser Lauf schreibt keine DNS-Einträge und bestätigt erneut die drei passenden Ziele einschließlich DNS-only. Die zwischenzeitliche HTTP-400-Antwort wird nicht sicher allein einer Request-Header-Änderung oder DNS-Propagation zugeschrieben.

**Keine weitere manuelle Einrichtung der Domain erforderlich.** Der DNS-Executor verwendet ausschließlich `BREVO_CLOUDFLARE_DNS_TOKEN`, ohne Fallback auf `CLOUDFLARE_API_TOKEN`, globale Schlüssel oder andere Automations-Tokens. Das Social-Media-Token und alle bestehenden Tokens/Rechte bleiben unverändert. Die frühere Aufforderung, DNS-Rechte am bisherigen allgemeinen Token zu ergänzen, ist durch die separate Einrichtung erledigt und soll nicht mehr ausgeführt werden. PR 631 wird hierdurch nicht gemergt; der Betrieb läuft ausdrücklich auf dem isolierten Branch.

Offizielle Schnittstellen: [Brevo-Domainauthentifizierung](https://developers.brevo.com/reference/authenticate-domain), [Cloudflare-DNS-Lese-Berechtigungen](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/list/).

## Automatisierter Ablauf

Der vorhandene Workflow `brevo-admin.yml` bietet auf dem isolierten Betriebsbranch `feat/brevo-domain-authentication` den Job `domain_dns`, mit fest gepinntem Executor. Der Standardbranch-Guard des normalen Kontakt-Adminjobs bleibt unverändert. Nur `workflow_dispatch`, keine automatische Ausführung, keine Artefakte, keine Research-Datencommits, nur `contents: read`.

1. `operation=audit`, `dns_operation=audit`: aktuelle Brevo-Werte und vollständiges Cloudflare-DNS-Inventar lesen; alle drei Ziele auf widersprüchliche Werte, doppelte Datensätze und Delegationen prüfen. Bei einem Konflikt bleibt der gesamte Änderungsplan gesperrt.
2. Nach ausreichenden Rechten und konfliktfreiem Audit `operation=audit`, `dns_operation=apply`, `dns_authorize=true`: ausschließlich fehlende Datensätze anlegen oder passende DKIM-CNAMEs mit `proxied=false` setzen. Keine Inhalt-Überschreibung, keine Löschung. Vor jeder Mutation erneut lesen; anschließend sämtliche unbeteiligten Datensätze einschließlich MX/SPF/DMARC/Website/Research vergleichen.
3. Nur nach korrektem DNS-Rückvergleich Brevos **PUT /senders/domains/visionuniverse.de/authenticate** aufrufen und die tatsächlichen Domainflags erneut lesen. Bei DNS-Propagation später ausschließlich mit `dns_operation=verify`, `dns_authorize=true` nachprüfen. Eine angenommene API-Anfrage ist kein bestätigter Authentifizierungsstatus.

Der Executor erlaubt keine Kontakt-, Kampagnen-, Sender-Bestätigungs- oder Versandendpunkte. DNS-Betrieb benötigt nicht den Kontakt-Payload. 62 synthetische Brevo-Prüfungen bestanden lokal, einschließlich zwölf DNS-Schutzprüfungen. Fehlende separate Credentials führen zum gesperrten Bericht; keine stillschweigende Auswahl anderer Tokens. Authentifizierungsfehler erhalten den DNS-Zählbericht und ausschließlich begrenzte, bereinigte Fehlerdetails; Rohantworten und Schlüssel werden nicht ausgegeben.
