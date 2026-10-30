# Tiingo-Nutzungsrechte für historische delistete Kursdaten (Prüfung 30.10.2026)

Auftrag des Owners vom 30.10.: anhand des bestehenden Vertrags und der dokumentierten Lizenzbedingungen klären, ob und in welcher Form historische delistete Kursdaten von Tiingo für serverseitige Backtests und daraus abgeleitete Kennzahlen genutzt werden dürfen. Getrennt werden interne Berechnung, Anzeige von Ergebnissen und Weitergabe von Rohkursen.

**Dies ist keine Rechtsberatung und keine Rechtsprüfung.** Es ist eine Bestandsaufnahme der vorhandenen Belege.

## 1. Vorhandene Belege

| Beleg | Inhalt | Stufe |
|---|---|---|
| **Vertragstext** | **liegt im Repository nicht vor.** Auch die Tiingo-AGB sind von hier nicht abrufbar: `app.tiingo.com/terms` und `/legal/terms-of-service` liefern ohne Anmeldung HTTP 403 | fehlt |
| Owner-Erklärung vom 13.09.2026 (`quant/config/provider-profiles.json#providers.tiingo.licensing`, `quant/config/development-preview.json#grants`) | „Die erforderliche Tiingo-Freigabe für die öffentliche Anzeige der Market-Data liegt vor. Wir verwenden das entsprechend freigegebene große Paket.“ Der Geltungsbereich laut `grants.basis`: **„Tageskurse, abgeleitete Werte und Kursverläufe des Produktuniversums auf research.visionuniverse.de“** | `OWNER_DECLARED`, ausdrücklich nicht `DOCUMENTATION_VERIFIED`; `aiUsage` und `modelTraining` stehen auf `UNKNOWN` |
| Öffentliche Preisseite (`tiingo.com/about/pricing`, abgerufen am 30.10.) | Pläne mit „Internal Use Only“. Interne Nutzung heißt dort: „you may only use the data for your own personal use and you may not display or share the data with another person“. Für Weiterverbreitung („redistribution use“) gibt es eigene Preise über die Produktseiten und den Vertrieb | öffentlich dokumentiert |
| V13-Abruf der delisteten Reihen (`docs/quant-recovery/HANDOVER_V13.md`) | 8.620 Anfragen im Pauschaltarif; Reihen nur verschlüsselt im privaten R2-Archiv; im Repository nur Register mit Hashes | Betriebsbeleg |
| Frühere Lizenzregel des Projekts (`TIINGO_COMMERCIAL_PHASE1_ABSCHLUSSBERICHT.md`, §34) | „Interne Nutzung ist nicht öffentliche Weitergabe.“ Kursniveaus wurden als `WITHHELD_REDISTRIBUTION` aus Artefakten entfernt; die Tickerliste bleibt `LEGAL_REVIEW_REQUIRED` | Projektregel |

## 2. Bewertung nach Nutzungsart

Delistete Titel gehören **nicht** zum Produktuniversum. Die Owner-Erklärung deckt sie deshalb nach ihrem Wortlaut nicht ab.

| Nutzung | Produktuniversum (laufende Titel) | Historische delistete Reihen (V13) | Folge |
|---|---|---|---|
| **Interne serverseitige Berechnung** (Runner auf GitHub Actions, private Ablage, Ergebnisse nur für den Owner) | gedeckt (Owner-Erklärung) | **wahrscheinlich zulässig.** Selbst der kleinste kommerzielle Plan erlaubt interne Nutzung. Ungeklärt sind die Speicherdauer nach Vertragsende und die verschlüsselte Ablage bei Dritten (Cloudflare R2) | so weiterführen wie bisher: verschlüsselt, nur auf dem Runner, nichts im Repository |
| **Anzeige von Ergebnissen und abgeleiteten Kennzahlen** (Trefferquote, Medianrendite, Ereignisanzahl; aggregiert, keine Kurse) | gedeckt für „abgeleitete Werte des Produktuniversums“ | **nicht belegt.** Interne Nutzung schließt das Zeigen an andere aus („may not display or share the data“); ob aggregierte Statistiken als „data“ gelten, regelt nur der Vertrag | **keine öffentlichen Produktartefakte** aus delisteten Reihen bis zur Klärung (`productionApproved=false` bleibt) |
| **Weitergabe historischer Rohkurse** (Reihen, Schlusskurse, Kursniveaus) | gedeckt laut Erklärung („Tageskurse … Kursverläufe“); wird auf der Seite genutzt | **nicht zulässig ohne ausdrückliche Weiterverbreitungsrechte** | Delistete Reihen bleiben ausschließlich verschlüsselt im privaten Archiv |

## 3. Was heute schon öffentlich ist (zur Kenntnis)

- Die Research-Dokumente V13 und V13c (`docs/quant-recovery/v13*/`) und die Demofälle `acquisition-agn` und `delisted-xco-bankruptcy` (`docs/quant/backtest-demos/results/`) enthalten **aggregierte Statistiken** aus delisteten Reihen, keine Kurse. Sie sind kein Produktartefakt, liegen aber in einem öffentlichen Repository.
  - Der Neubau in #1178 ändert an diesen beiden Fällen keine Kennzahl.
  - Der Faktorfall beruht auf SEC-Fakten und Kursen des Produktuniversums, nicht auf delisteten Reihen.
- Laut HANDOVER_V13, Abschnitt 8, sind alte PR-Commits mit Anbieterzeilen weiter per SHA abrufbar. Eine Bereinigungsanfrage an GitHub liegt beim Owner.

## 4. Was der Owner klären muss (keine neuen Verträge, keine neuen Anbieter)

1. **Den vorhandenen Vertrag bzw. die Plan-Bedingungen** des „großen Pakets“ einsehen, als PDF oder Screenshot der Kontoseite, und nachsehen:
   - (a) Plan-Name und Lizenzart: interne Nutzung oder Weiterverbreitung/Anzeige;
   - (b) Regelung für **abgeleitete Daten** (derived data);
   - (c) Gilt die Anzeigefreigabe auch für **historische Daten nicht mehr gehandelter Titel**?
   - (d) Speicherung nach Vertragsende.
2. Bis dahin gilt:
   - interne Berechnung ja;
   - öffentliche Anzeige von Ergebnissen aus delisteten Reihen nein;
   - Rohkurse delisteter Titel nie.
3. Lässt der Plan nur interne Nutzung zu: über eine Entfernung der aggregierten Delisted-Statistiken aus dem öffentlichen Repository entscheiden. Ein Wechsel auf ein privates Repository ist ebenfalls eine Owner-Entscheidung.

## 5. Technische Absicherung (bereits vorhanden)

- `productionApproved=false` für alle Backtest-Arten.
- Der Research-Adapter liefert standardmäßig `DISABLED`, `display.allowed=false`.
- Delistete Reihen werden nur über den hashgebundenen Loader und nur mit `privateDirs` gelesen.
- Der Workflow `[v13-archive:demos]` lädt nur abgeleitete Ergebnisse hoch und löscht die privaten Daten.
- `display-policy.js` prüft öffentliche Anzeige je Anbieter und Datenklasse. Eine Datenklasse für delistete Historie gibt es dort nicht, also wird sie nicht angezeigt.
