# Cookie-Banner und passende Rechtsinformationen

Review-Stand 12.10.2026. Vorbereitung im bestehenden Cloudflare-Pages-Projekt `vision-universe`; keine neue CMP-Abhängigkeit oder laufende Zusatzkosten. Research, DNS/Mail, Brevo und Shopify-Abo unverändert. Dieses Dokument ist keine Bestätigung fehlender Kontodaten oder eine Behauptung endgültiger rechtlicher Freigabe.

## Umgesetzt

- Schwarze/weiße Flächen, originale lokale Inter-Schrift; Banner ohne neue Dekoration. „Nur notwendige“ und „Alle akzeptieren“ gleichwertig. „Einstellungen“ öffnet ein zugängliches natives Dialogfenster; Schließen/Escape speichert keine Auswahl.
- Dauerhafter Footer-Link auf Startseite, Impressum, Datenschutz und beiden /policies/-Alias-Seiten. Ohne JavaScript verlinkt er direkt zum relevanten Datenschutzabschnitt; keine optionalen Skripte starten ohne JavaScript.
- Notwendig immer aktiv; Statistik und Marketing derzeit nicht verwendet, nicht vorausgewählt und deaktiviert. „Alle akzeptieren“ aktiviert derzeit ebenfalls keine optionalen Dienste und erteilt keine Einwilligung für noch unbekannte Anbieter.
- Erst nach Entscheidung Speicherung unter `vu_cookie_preferences` in localStorage: Kategorien, Zeitpunkt, Ablaufdatum (180 Tage), Policy-Version, Dienste-Liste. Kein HTTP-Cookie, Nutzer-Identifier, E-Mail, Serverversand oder Kontaktimport. Die Browseradresse ist der Geltungsbereich; Pages-Vorschau und www teilen keinen Speicher.
- Zeitablauf, geänderte Version, neue Dienste, beschädigter Speicher: erneute Auswahl und vorher keine optionale Freigabe. Gesperrter Speicher: Auswahl für den aktuellen Besuch mit sichtbarem Hinweis, keine behauptete dauerhafte Speicherung.
- Änderungen in einem anderen Tab werden übernommen. Freigabe/Widerruf gehen an die tatsächlichen Aktivierungs-/Bereinigungs-Callbacks. Lokale Mock-Dienste testen diesen Ablauf ohne einen echten Anbieter zu kontaktieren.
- Das bestätigte Impressum ist auf die Ankündigungsseite angepasst. Datenschutz vollständig um Speicherverfahren, Laufzeiten, Auswahl, Widerruf und unabhängige Newsletter-Einwilligung ergänzt. Datenschutzvorlage synchron. Alte PDF-/Shopify-Kaufbedingungen bleiben archiviert; Abo-AGB/Widerruf/Bereitstellung vorbereitet außerhalb dist.
- Bereits auf main erneut enthaltene, aber im isolierten Build fehlende Research-Navigation entfernt; Logo-Pfade in den alten Rechtstext-Alias-Routen repariert. Kein Research-Quellcode geändert.

## Spätere optionale Dienste: bewusster Integrationsschritt

Aktuell ist kein Dienst registriert. `VisionUniverseConsent.registerService({id, category, name, description, enable, disable})` ist ein erster eigener Integrationsvertrag, kein automatischer Tracker. `category` ist statistics oder marketing. `enable` darf erst durch den Consent-Manager einen Dienst starten. `disable` muss dessen tatsächliche Verarbeitung beenden und die zugehörigen Cookies/Speicher bereinigen; hierfür reichen ein ausgegrauter Schalter oder das Entfernen eines script-Tags nicht aus. Callback-Fehler werden als Fehler behandelt, nicht als erfolgreiche Umsetzung der Auswahl.

Vor Einführung **jedes** echten Dienstes: vollständige Anbieter-/Zweck-/Daten-/Laufzeit-/Übermittlungshinweise ergänzen; POLICY_VERSION ändern; service-spezifische Sperre, Aktivierung und Widerruf gegen reale Netzwerkanfragen/Cookies testen. Kein Dienst wird außerhalb des Managers unmittelbar eingebunden. Es gibt derzeit keine Google-/Meta-IDs oder vergleichbare Anbieter-Konfiguration. Die vorhandene CSP (`script-src self`, `connect-src none`) bleibt erhalten; zusätzliche Provider-Freigaben brauchen einen gezielten Review. Die Oberfläche ist kein Ersatz für diese spätere tatsächliche Integration.

Der Browser-Nachweis enthält bewusst keine personenbezogene Kennung. Ein künftig notwendiger serverseitiger Consent-Nachweis ist gesondert anhand der echten Datenverarbeitung zu gestalten; diese lokale Auswahl wird nicht als beweissicheres zentrales Einwilligungsarchiv ausgegeben.

## Noch exakt erforderliche Informationen

Für die **Coming-soon-Seite** fehlen:

1. Im verwendeten Cloudflare-Konto geltende Vertrags-/Auftragsverarbeitungsbedingungen bestätigen und intern dokumentieren. Der öffentliche DPA-Link ist eine Quelle, kein Nachweis des individuellen Vertragsabschlusses. Die Cloudflare-DPA nennt Cloudflare, Inc. als Anbieter.
2. Tatsächliche Cloudflare-Funktionen für visionuniverse.de bestätigen: Bot-/Challenge-Verfahren und Cookie-Laufzeiten, etwaige Web-Analytics-/Zaraz-Injektion, E-Mail-Adressschutz, gespeicherte Log-/Sicherheitsdaten und Aufbewahrung. Ein frischer öffentlicher Besuch beweist nicht, dass situative Sicherheitscookies nie auftreten. Keine Einstellung wurde dafür verändert. Falls ein optionaler accountseitig injizierter Dienst besteht, muss auch dieser vor seiner Aktivierung in die echte Einwilligungssteuerung eingebunden werden.
3. Anbieter des Postfachs info@visionuniverse.de, zugehörige Auftragsverarbeitung/Übermittlungen und tatsächliche Lösch-/Aufbewahrungsregeln für Kontaktanfragen. DNS-Ziele allein bestätigen keinen Mail-Vertrag; Mail-DNS unverändert lassen.

Für den **späteren App-/Abo-Vertragsstart**, getrennt von der Ankündigungsseite: Tarife/Preise, Abrechnungszeitraum, Erstlaufzeit, Verlängerung, Kündigungsfrist/-wirkung, Kaufwege und Zahlungsanbieter, Konto-/App-Infrastruktur. Die Einzelpunkte und fertigen Arbeitsentwürfe stehen in [legal-drafts](../legal-drafts/README.md). Kein pauschaler Widerrufsverlust bei laufenden Dienstleistungs-Abos, keine PDF-Versandbedingungen für die App.

Die fehlenden Angaben müssen vor der endgültigen Datenschutz-/Indexierungsfreigabe in den Text übernommen werden. Deshalb bleibt der Datenschutz als Entwurf markiert und der bestehende Produktions-Gate unverändert. Den Banner zu implementieren bestätigt diese Fakten nicht. Kein zusätzlicher Brevo-Test, Import oder Versand; dessen Aktivierung ist ein separater echter DOI-Abnahmeschritt.

## Nachweise und Übernahme

`npm test`, `npm run test:browser`, `npm run test:design`, `npm run build` verwenden die vorhandene Landing-CI mit Node 22. Neue Consent-Tests decken Ablehnung, granulare Zustimmung, Widerruf, Ablauf/Version/Dienstwechsel, Speicherfehler und sichere Fehlerzustände ab. Browserbilder und Messwerte: [review/cookies](../review/cookies/metrics.json). Chromium 1440×900, 390×844 und 320 px; 200-%-Schriftvergrößerung, Fokus/Tab/Escape, alle Rechtsrouten, keine horizontalen Überläufe. Kein physisches Safari-Gerät und kein echter Tracking- oder Newsletter-Dienst getestet.

Übernahme nach bestandenem PR: vorhandene Git-Verbindung deployt aus main in **vision-universe**, Root landing, `node scripts/build.mjs`, dist, Node 22. Keine Provider-Variablen automatisch auf production/privacyReviewed setzen. Vor endgültigem Indexieren die echten fehlenden Angaben ergänzen, freigegebene Datenschutzhinweise bereitstellen und den bestehenden Freigabe-Gate verwenden. Der Cookie-Code benötigt keine Tokens und keine neuen API-Rechte. Vollständiger Cloudflare-Konto-/DNS-Audit benötigt weiterhin tatsächlich berechtigten Zugriff; die manuelle Einrichtung bestätigt keine zusätzlichen Token-Rechte.

## Geprüfte Primärquellen

- [§ 25 TDDDG](https://www.gesetze-im-internet.de/ttdsg/__25.html): Einwilligung für Endgerätespeicherung/-zugriff und Ausnahme für unbedingt erforderliche Verfahren.
- [Cloudflare Cookies](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/): Funktionen/Laufzeiten, keine Aussage über die aktivierten Kontoeinstellungen.
- [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/), Fassung 6.4 vom 03.04.2026: Anbieter und allgemeine Vertragsbedingungen, Wirksamkeit abhängig vom konkreten Agreement.
- [DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679): Information, Einwilligung/Widerruf und Betroffenenrechte.
- [Bestätigte Rechtstextquellen und Geschäftsmodell](../legal-source/README.md), weitere Verbraucherrechtsquellen in [legal-drafts/README.md](../legal-drafts/README.md).
