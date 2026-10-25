# V6 – PIT-Portfolio und Rebalancing

Vertrag: `research-portfolio-1.0.0`. Implementierung: `quant/engines/research-portfolio.cjs`.
Kein Frontend, keine öffentliche Auslieferung, kein Scheduler und keine Produktfreigabe.

## Wiederverwendung und notwendige Ledger-Erweiterung

`profile-backtest.js#select` bleibt die Auswahlregel für vorhandene Profile.
`backtest.js#targetWeights` bildet gleiche Zielgewichte;
`rebalanceIndices` liefert Monats-/Quartalsentscheidungen mit Folgehandelszeitpunkt;
`maxDrawdownOf` berechnet den Drawdown. Es gibt keine zweite Faktor- oder
Profilauswahl und keine neue Splitkursableitung. Veröffentliche splitbereinigte
Kurse bleiben beim vorhandenen `return-series.js`/`published-close.js`-Vertrag.

Die bestehende `profile-backtest.js#run` übernimmt dagegen einen fehlenden oder
ausgelaufenen Kurs nach einer Frist als letzten Kurs bzw. null in Cash. Das ist
kein belegter Delisting-Endwert. Ihre bisherige pauschale Umsatzkostenrechnung
bildet außerdem kein explizites Rohpreis-/Stückzahl-/Ausschüttungsjournal.
Die neue versionierte Buchführung ist deshalb eine notwendige Erweiterung um
belegte Corporate Actions, Cash-Forderungen und exakte Kosten. Legacy-Dateien,
bereits veröffentlichte Resultate und deren Verträge wurden nicht geändert.

## Eingaben und API

`runPortfolio(input)` verwendet ausschließlich vorgelegte, serialisierbare Daten:

- `sessions`: streng geordnete `{date, closeAt}`; UTC-Zeitpunkte ausdrücklich
  vom Kalenderlieferanten, keine erfundenen Börsenschlusszeiten oder DST-Regeln.
- `listings`: stabile Listing-/Issuer-ID, MIC, primäre US-Stammaktie, Währung,
  Erst-/Letzthandel, exakte Rohpreis-Bars `{date,close,availableAt}` und belegte
  Corporate Actions. Keine tickerbasierten historischen Joins.
- `memberships`: `{effectiveAt,availableAt,members,sourceHash}`. Zuerst gilt der
  neueste zulässige Wirkungszeitpunkt, danach dessen neueste verfügbare Vintage.
  Eine spät veröffentlichte Korrektur einer älteren Membership ersetzt keine
  jüngere effektive Membership. Gleiche Zeitpaare sind mehrdeutig und blockiert.
- `factorSnapshots`: entsprechend, mit numerischen `rows` und verpflichtender
  `rowAvailableAt` je Faktorzeile, spätestens zur Snapshotverfügbarkeit. Die
  zugrunde liegenden Feldvintages müssen durch das referenzierte Quellmanifest
  belegt werden; der Ledger kann deren tatsächliche Herkunft nicht erfinden.
- `targets`: eingefrorene Gewichte und Referenzen auf die verwendeten
  Membership-/Faktorhashes; Entscheidung am Session-Schluss, Ausführung am
  beobachteten Schluss der unmittelbar nächsten Session. Unbekannte oder
  außerhalb der damaligen Membership liegende Listings sind unzulässig.
- `costs`: `PER_SIDE_NOTIONAL`, explizite Gebühren und Slippage in Basispunkten.
- `benchmark`: vollständig gleiche Kalenderachse und Währung, Total-Return-
  Levels und ausdrücklich passiver Vergleich ohne Transaktionskosten.
- `maxMembershipAgeDays` und `maxFactorAgeDays`: explizite Vertragsgrenzen,
  keine versteckten neuen Zertifizierungsschwellen.

`buildSchedule(sessions, frequency, everySessions)` unterstützt `monthly`,
`quarterly` und vorab deklarierte Sessionintervalle. `buildProfileTargets` nutzt
die bestehende Profilauswahl und bindet die tatsächlich verfügbaren Vintages.
Ein optionaler `driftThreshold` überspringt geplante Umschichtungen nur bei
unverändertem Zielportfolio und ausreichend geringer tatsächlicher Drift.

## Buchführung

Für Vorhandelsvermögen V, aktuelle Positionswerte cᵢ, Zielgewichte wᵢ und
einseitigen Kostensatz r wird das Nachkostenvermögen E aus

`E + r × Σ |wᵢ × E − cᵢ| = V`

bestimmt. Verkäufe finanzieren die Käufe. Gebühren und Slippage fallen auf
das tatsächlich gehandelte Notional an. Es wird nicht zwischenzeitlich auf
Cent gerundet. Ein analytischer Python-Fall prüft diese Gleichung unabhängig
von der numerischen Nullstellensuche. Cash bleibt unverzinst; kein Leverage,
kein Shorting, keine Steuern. Bruchstücke sind erlaubt und offengelegt.

Corporate Actions sind sequenziell und quellengestützt:

- `SPLIT`: explizites belegtes Verhältnis verändert Stückzahl; keine Ableitung
  aus einem Preissprung und keine eigene splitbereinigte Kursserie.
- `CASH_DIVIDEND`: Anspruch am Ex-Tag aus damaliger Stückzahl; Forderung zählt
  zum Vermögen, wird erst am Pay-Date bzw. der ersten folgenden Bewertungssession
  investierbares Cash. Nach Verkauf bleibt der Anspruch erhalten und zahlt einmal.
- `TERMINAL_CASH`: belegter Betrag einschließlich ausdrücklich belegtem Nullwert;
  kein letzter Kurs als Ersatz, keine pauschale Insolvenzannahme.
- `TERMINAL_EXCHANGE`: belegte Nachfolger-Listing-ID, Umtauschverhältnis und
  Cash-Anteil. Unbekannte Nachfolger, Währungen oder Werte blockieren.

Ereignisse desselben Tags brauchen eine eindeutige Reihenfolge. Dadurch ist
auch die Stückzahlbasis einer Dividende am Splittag explizit. Die Quelldaten
müssen diese Reihenfolge rechtfertigen. Fehlende exakte Preisbewertungen,
unbekannte terminale Ereignisse oder noch nicht verfügbare Events führen zum
Abbruch, ohne Ersatzperformance. Forderungen finanzieren keine Käufe vor Zahlung.

Optional begrenzt `liquidity.maxParticipation` Ordernotional relativ zum
beobachteten täglichen Dollarvolumen. Fehlendes Volumen oder Überschreitung
blockiert. Diese historische Kapazitätsannahme ist **kein Nachweis der
Liquidität in der Schlussauktion**. Der beobachtete Folgeschluss ist ein
Modellpreis, kein garantierter Live-Fill.

Einseitiger Turnover ist gehandelte Käufe plus Verkäufe geteilt durch zweimal
Vorhandelsvermögen; ein initialer vollständig investierter Aufbau entspricht
damit ungefähr 50 %, ein vollständiger Austausch ungefähr 100 %.

## Qualität, Reproduktion und Grenzen

`SYNTHETIC_TEST` kennzeichnet sämtliche beigefügten Prüffälle.
`HISTORICAL_OBSERVED` verlangt referenzierte Identitäts-, Populations-, CA-,
Lifecycle- und Lizenznachweise sowie null deklarierte ungeklärte Identitäten/
terminale Fälle. Die Existenz einer Hashreferenz beweist die Quelle nicht;
unabhängige Datenprüfung und bestehende Zertifizierungsgates bleiben erforderlich.
Keiner dieser Modi erzeugt selbst `CERTIFIED` oder eine Produktfreigabe.

Inputs, Ergebnisse und Generationen tragen SHA256; Sourcecode der tatsächlich
wiederverwendeten direkten Module, Node-/V8-/ICU-/glibc-/Plattformkontext und
SHA256 der Node-Binärdatei sind gebunden. Gleiche Inputs und Runtime ergeben
identische Ergebnisse. Die übergeordnete Generation-/Rollback-Veröffentlichung
bleibt beim vorhandenen Store; der Ledger startet keine eigene Datenpipeline.

Grenzen: 30.000 Sessions/Listings, maximal zwei Millionen Listing×Session-
Bewertungszellen, 250.000 Eingabebars, 100.000 gespeicherte Positionsbewertungen,
100.000 Events und zwei Millionen Snapshot×Target-Vergleiche. Das sind
Arbeitsbudgets für begrenzte Researchläufe, keine Behauptung eines unbegrenzt
skalierenden Marktuniversums-In-Memory-Laufs. Reihen werden nicht interpoliert.
FX, Shorting, Margin, Steuern,
Cashzinsen und garantierte reale Fills gehören nicht zu diesem Vertrag.

## Ausgeführte mechanische Validierung

```sh
node --test quant/tests/research-portfolio.test.mjs
python3 scripts/quant/verify-research-portfolio.py --node /path/to/recorded/node --out /private/portfolio-validation.json
```

12 Node-Tests unter Node 22.23.4 bestanden: exakte Kaufkosten, gemischte
Umschichtung, Split/Dividende/Terminalwert, Dividendenauszahlung nach Verkauf,
Umtausch, späte Altvintage, Profil-PIT, Kalender, Drift/Liquidität, fehlende
Kurse/Endwerte und negative Vertragsfälle sowie Zukunftsverfälschung.
Vier unabhängige Python-Decimal-Referenzfälle bestanden mit relativer Toleranz
`1e-10`: finanzierter Kauf, simultane Umschichtung, Split/Dividende/Terminalcash
und belegter Null-Endwert. Derselbe JS-Lauf wird exakt wiederholt.

Ein zusätzlicher ausdrücklich synthetischer Ressourcenlauf mit 2.000 Sessions,
20 Listings und 40.000 Listing×Session-Zellen benötigte hier rund 1,19 Sekunden
und 239.112 KiB Peak-RSS unter Node 22.23.4. Das ist eine einzelne Messung der
Mechanik einschließlich Code-/Runtimebindung, kein historisches Marktresultat
und keine Hardware-unabhängige Laufzeitgarantie.

Diese Prüfungen bestätigen Mechanik auf ausdrücklich synthetischen Fällen.
Sie sind kein historischer Portfolionachweis, kein neuer unabhängiger Holdout
und kein wirtschaftlicher Vorteilsnachweis. Ein realer universumsweiter Lauf
bleibt von vollständigen historischen Membership-/Faktor-/Lifecycle-Daten und
deren Nutzungsrechten abhängig.
