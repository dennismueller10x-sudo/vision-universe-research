# Apple-Konto der RAM Consulting UG: Namen und Entwickleridentität

**Stand:** 04.11.2026 · Reine Dokumentation. Die frühere Entwicklernamen-Frage ist **entschieden und erledigt**; es gibt dafür keine Sperre mehr.

## Verbindliche Entscheidung des Owners (04.11.2026)

| Punkt | Festlegung |
|---|---|
| App-Name | **Vision Universe** |
| Name unter dem App-Icon | **Vision Universe** |
| Rechtlicher Betreiber und Apple-Entwickler | **RAM Consulting UG (haftungsbeschränkt)** |
| Apple-Developer-Kontotyp | **Organisation** |
| Bundle-ID | `de.visionuniverse.app` (Verfügbarkeit **noch zu prüfen**, geschieht beim Anlegen im Developer-Portal) |
| Abweichender öffentlicher Entwicklername | **wird nicht benötigt** |

Folge: Beim ersten App-Eintrag in App Store Connect bleibt das Feld **„Company Name“** (Entwicklername) beim Rechtsnamen der Organisation, keine Sonderregel, keine Anfrage an Apple, keine Markennachweise. Die frühere Bedingung „App-Eintrag erst nach geklärtem Entwicklernamen“ **entfällt**. Der Anzeigename der App auf dem Homescreen („Vision Universe“) ist davon unabhängig und wird im Projekt gesetzt (`app/capacitor.config.json`, `appName`; Info.plist `CFBundleDisplayName`).

## Stand der Apple-Registrierung

- Registrierung der RAM Consulting UG als Organisation **am 03.11.2026 eingereicht**.
- D-U-N-S-Nummer ermittelt und von Apple **akzeptiert**.
- **Organisationsprüfung durch Apple läuft.** Bis zur Freigabe: **keine erneute Registrierung, kein App-Eintrag, kein Upload, keine Zertifikate oder Schlüssel.**

## Was Apple zu Namen dokumentiert (für später)

- Als **Verkäufer** wird der Name der Organisation geführt; Organisationen deklarieren den EU-**Trader-Status** (Digital Services Act). Adresse aus der D-U-N-S-Nummer, Telefon und E-Mail geben Sie an. Verifiziert, werden sie in den EU-Ländern auf der Produktseite angezeigt ([Apple: DSA](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-compliance-information)). **Vor dem öffentlichen Release** mit dem Impressum abgleichen (nicht nötig für den privaten TestFlight-Test).
- Eine spätere **Änderung des Organisationsnamens** ändert den Vendor-Namen aller Apps und ist nicht umkehrbar ([Apple](https://developer.apple.com/help/account/manage-your-team/update-your-account-information/)).
- Ein abweichender Entwicklername ließe sich nur beim allerersten App-Eintrag setzen und wäre danach fix ([Apple](https://developer.apple.com/help/app-store-connect/create-an-app-record/set-your-developer-name)). Das ist hier nicht vorgesehen.

## Auswirkung auf TestFlight

TestFlight braucht einen App-Eintrag, und der braucht die freigegebene Organisation. Es bleibt **eine** Blockade: die Organisationsprüfung bei Apple. Alles andere ist vorbereitet ([TESTFLIGHT_STEP_BY_STEP.md](TESTFLIGHT_STEP_BY_STEP.md)).
