# Brevo-Domainauthentifizierung: visionuniverse.de

Stand: 12. Oktober 2026, 16:53 UTC. Der Owner autorisiert ausschließlich fehlende Brevo-Code-/DKIM-Datensätze und DNS-only für passende DKIM-CNAMEs. Kein Versand, keine MX-/SPF-/DMARC-/Website-/Research-Änderung.

## Tatsächlich geprüfter Zugang

[Isolierter Audit 38280469061](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38280469061) hat die aktuellen Werte direkt aus Brevo gelesen: ein Brevo-Code-TXT und zwei DKIM-CNAMEs. Die Domain meldet `verified=false` und `authenticated=false`. Werte, Schlüssel und das DNS-Inventar werden nicht veröffentlicht.

Das vorhandene Actions-Secret `CLOUDFLARE_API_TOKEN` enthält ein **aktives Konto-Token**. Die Konto-Token-Verifikation und das Lesen der passenden Zone funktionieren. Der Benutzer-Token-Endpunkt liefert hierfür HTTP 401 / Code 1000; das ist kein Nachweis eines ungültigen Konto-Tokens. **Das Lesen der DNS-Einträge scheitert mit HTTP 403 / Code 10000.** Deshalb wurden weder bestehende DNS-Einträge auf Konflikte geprüft noch Einträge angelegt/geändert. 0 DNS-Mutationen und 0 E-Mails.

## Einmalig erforderlicher Betreiber-Schritt

Cloudflare → betroffenes Konto → **Manage account / Konto verwalten → Account API tokens / Konto-API-Tokens** → das Token hinter `CLOUDFLARE_API_TOKEN` → **Edit / Bearbeiten**. Eine zusätzliche Berechtigung **Zone → DNS → Edit** mit Zonenressource **Include → Specific zone → visionuniverse.de** hinzufügen und speichern. Bestehende Berechtigungen/Ressourcen erhalten. Das Token nicht rotieren; sein Wert und das GitHub-Secret bleiben gleich.

DNS Edit umfasst Lesen und Schreiben. Zone Read ist bereits vorhanden; zusätzliche Token-Verwaltungsrechte werden für den DNS-Betrieb nicht benötigt. Die Änderung muss ein Cloudflare-Betreiber vornehmen, der dieses Konto-Token verwalten und die betreffende DNS-Berechtigung vergeben darf.

Offizielle Nachweise: [Konto-Token-Verwaltung](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/), [bestehendes Token aktualisieren](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/update/), [DNS-Lese-Berechtigungen](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/list/).

## Vorbereiteter automatisierter Ablauf

Der vorhandene Workflow `brevo-admin.yml` bietet auf dem isolierten Betriebsbranch `feat/brevo-domain-authentication` den Job `domain_dns`, mit fest gepinntem Executor. Der Standardbranch-Guard des normalen Kontakt-Adminjobs bleibt unverändert. Nur `workflow_dispatch`, keine automatische Ausführung, keine Artefakte, keine Research-Datencommits, nur `contents: read`.

1. `operation=audit`, `dns_operation=audit`: aktuelle Brevo-Werte und vollständiges Cloudflare-DNS-Inventar lesen; alle drei Ziele auf widersprüchliche Werte, doppelte Datensätze und Delegationen prüfen. Bei einem Konflikt bleibt der gesamte Änderungsplan gesperrt.
2. Nach ausreichenden Rechten und konfliktfreiem Audit `operation=audit`, `dns_operation=apply`, `dns_authorize=true`: ausschließlich fehlende Datensätze anlegen oder passende DKIM-CNAMEs mit `proxied=false` setzen. Keine Inhalt-Überschreibung, keine Löschung. Vor jeder Mutation erneut lesen; anschließend sämtliche unbeteiligten Datensätze einschließlich MX/SPF/DMARC/Website/Research vergleichen.
3. Nur nach korrektem DNS-Rückvergleich Brevos **PUT /senders/domains/visionuniverse.de/authenticate** aufrufen und die tatsächlichen Domainflags erneut lesen. Bei DNS-Propagation später ausschließlich mit `dns_operation=verify`, `dns_authorize=true` nachprüfen. Eine angenommene API-Anfrage ist kein bestätigter Authentifizierungsstatus.

Der Executor erlaubt keine Kontakt-, Kampagnen-, Sender-Bestätigungs- oder Versandendpunkte. DNS-Betrieb benötigt nicht den Kontakt-Payload. 59 synthetische Brevo-Prüfungen bestanden lokal, einschließlich neun DNS-Schutzprüfungen. Tatsächliches Anlegen, DNS-only-Änderung und Authentifizierung sind wegen fehlendem DNS-Zugriff **noch nicht erfolgt**.
