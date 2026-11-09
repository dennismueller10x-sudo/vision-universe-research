# Tiingo-Nutzungsrechte: historische und delistete Kurse, Charts, Kennzahlen, Backtests (Stand 31.10.2026)

Version 2.0, ersetzt den Stand vom 30.10.2026. **Korrektur:** Die Annahme, Vision Universe habe nur eine interne Nutzungslizenz („Internal Use Only“), ist überholt. Der Owner hat am 31.10.2026 erklärt, dass eine kostenpflichtige kommerzielle Tiingo-Lizenz erworben wurde, die nach seinem Vertragsverständnis auch die Veröffentlichung der lizenzierten Daten umfasst.

Dieses Dokument ist eine Bestandsaufnahme der Belege, keine Rechtsprüfung.

## 1. Belege

| Beleg | Inhalt | Stufe |
|---|---|---|
| **Owner-Erklärung vom 31.10.2026** (`quant/config/provider-profiles.json#providers.tiingo.licensing.declaration`) | Kommerzielle Tiingo-Lizenz einschließlich Veröffentlichung der lizenzierten Daten. Erklärter Umfang (`scopeDeclared`): serverseitige Berechnung, öffentliche Anzeige historischer Kurse und Charts, Veröffentlichung abgeleiteter Kennzahlen und Backtest-Ergebnisse, historische Kurse delisteter Aktien aus den vorhandenen Archiven | `OWNER_DECLARED` |
| Owner-Erklärung vom 13.09.2026 (`previousDeclarations`, `development-preview.json#grants`) | Freigabe der öffentlichen Anzeige der Market-Data des Produktuniversums („großes Paket“) | `OWNER_DECLARED`, bleibt gültig |
| Vertragstext / Bestellbestätigung | **nicht im Repository.** Die Tiingo-AGB sind ohne Anmeldung nicht abrufbar (`app.tiingo.com/terms`: HTTP 403) | fehlt |
| Öffentliche Preisseite (`tiingo.com/about/pricing`, 30.10.) | „Internal Use Only“ gilt für die Basispläne; für Weiterverbreitung gibt es eigene Preise über Produktseiten und Vertrieb | betrifft die Basispläne, nicht die erklärte kommerzielle Lizenz |

## 2. Nutzungsumfang je Nutzungsform

| Nutzungsform | Stand | Folge für das Produkt |
|---|---|---|
| Serverseitige Berechnung (Runner, Backtests, Studien) | **gedeckt** (Erklärung vom 31.10.) | keine Blockade |
| Öffentliche Anzeige historischer Kurse und Charts (Produktuniversum) | **gedeckt** (13.09. und 31.10.) | wie bisher aktiv (Discover, Aktienseiten) |
| Veröffentlichung abgeleiteter Kennzahlen und Backtest-Ergebnisse (aggregiert, Rendite, Risiko, Trefferquote) | **gedeckt** (31.10.) | kein Lizenzhindernis mehr für eine spätere Produktanzeige. Diese braucht weiterhin die fachliche Zertifizierung (`productionApproved`) und eine eigene Owner-Freigabe |
| Historische Kurse **delisteter** Aktien (V13-Archive, bereits beschafft) | **gedeckt** laut Erklärung (lizenzierte Daten, erneuter Download nicht nötig) | dürfen in Berechnungen und abgeleitete Ergebnisse einfließen. Anzeige von Kursverläufen delisteter Titel: kein Lizenzhindernis, aber noch keine Produktfläche (eigene Freigabe) |
| **Weitergabe herunterladbarer Rohdatensätze** (Massendownload von Kursreihen, CSV/JSON-Export ganzer Historien) | **nicht belegt.** Die Erklärung nennt die Veröffentlichung der Daten, ein ausdrückliches Recht zur Weitergabe ganzer Rohdatensätze zum Herunterladen fehlt | nicht anbieten, bis der Vertrag es ausdrücklich deckt. Es besteht kein Anlass für eine neue Lizenz, solange keine Downloadfunktion geplant ist |
| KI-Nutzung, Modelltraining | unverändert `UNKNOWN` | nicht Gegenstand der aktuellen Arbeit |

## 3. Was sich gegenüber dem 30.10. ändert

- Die Bewertung „öffentliche Anzeige abgeleiteter Ergebnisse aus delisteten Reihen: nicht belegt“ ist überholt. Diese Nutzung ist jetzt durch die Owner-Erklärung gedeckt.
- Die aggregierten Delisted-Statistiken in den Research-Dokumenten V13/V13c und in den Demofällen AGN und XCO sind damit keine Lizenzfrage mehr.
- Delistete Rohreihen bleiben trotzdem verschlüsselt im privaten R2-Archiv. Der Grund ist Integrität und Umfang: 1,5 GB und hashgebundene Register. Ein Lizenzgrund besteht dafür nicht mehr. Ins Repository kommen sie nicht, weil Repository-Hygiene und Größe dagegensprechen.
- Kein erneuter Massendownload, kein neuer Anbieter: Die vorhandenen Archive (R2, Manifest 1.2.0) werden weiterverwendet.

## 4. Einziger offener Punkt (ohne Anlass für eine neue Lizenz)

Die Weitergabe herunterladbarer Rohdatensätze ist nicht belegt. Wird eine Downloadfunktion geplant, prüft der Owner den vorhandenen Vertrag auf genau diesen Punkt. Bis dahin ist nichts zu tun.

Zur Nachvollziehbarkeit, optional: eine Kopie der Lizenzbestätigung (Plan-Name, Datum, Umfang) in den privaten Unterlagen des Owners ablegen. Ins öffentliche Repository gehört sie nicht. Die Stufe `OWNER_DECLARED` bleibt bestehen, bis ein Beleg vorliegt.

## 5. Technische Folgen

- `display-policy.js` und `development-preview.json` gelten unverändert. Eine eigene Datenklasse für delistete Historie entsteht erst mit einer Produktfläche, die sie anzeigt (eigene Freigabe).
- Für Backtests gibt es keine Lizenzblockade mehr. Ob Ergebnisse angezeigt werden, regeln weiter die fachlichen Gates: `productionApproved=false`, Zertifizierungsartefakt, Research-Adapter standardmäßig `DISABLED`.
