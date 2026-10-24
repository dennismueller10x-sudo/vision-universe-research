# Quant Backtest V5 – Integration und Abnahme

## Entscheidung

**Die lokale Integration ist umgesetzt und mit echten Daten geprüft. Die geschützte Online-Vorschau ist offen. Keine Produktfreigabe, kein Merge und keine Zertifizierung.**

Ausgangsstand: Main `304f9179433ae24de65936742f44d85782658b2f`, Branch `codex/quant-backtest-v5-integrated-preview`. Die vorhandene V4-Kette wurde einmalig auf diesen Main rebasiert; andere PR-Branches bleiben unverändert. Die historischen V2–V4-Berichte sind archivierte Nachweise ihrer damaligen Datenstände, keine aktuellen Sollwerte. Aktuelle Nachweise stehen unter [v5/VALIDATION.json](v5/VALIDATION.json).

Main hat inzwischen die Wochenreihen aktualisiert: **6.190** statt 6.174 Listings; NVDA und der verifizierte tägliche SPY-Bestand reichen bis **23.10.2026**. Keine Provider-Abfrage und kein produktiver Refresh wurde hierfür ausgelöst.

## 1. Bestehende Quant-Ansichten

Zwei kleine, bei fehlendem internen Adapter wirkungslose Hooks:

- `quant/app/page-stock.js`: zusätzlicher, ausdrücklich benannter Einzelaktien-Regeltest im vorhandenen Abschnitt `#historie`. Der bisherige Vergleich ähnlicher Kursbedingungen bleibt erhalten.
- `quant/app/page-backtest.js`: derselbe Einzelaktien-Regeltest auf `#/backtest` und `#/backtest/NEW_52W_HIGH`. Die marktweite Studie, ihre fünf Regeln, Setup-Auswahl und die Zertifizierungsübersicht bleiben erhalten. Andere Signalregeln erhalten diesen Regeltest nicht.

`scripts/quant/preview/integrated.js` nutzt `QX.section`, `q-evidence`/`q-ev-tile`, `QX.more`, `qx-kv`, `q-bt-table` und das **unveränderte** `QuantCharts.lineChart`. Zwei vorhandene Linienpaare: Strategie/Aktie und Strategie/SPY. Die Achse zeigt Mio. USD über die vorhandene Formatierungsoption; die zugrunde liegenden USD-Werte bleiben unverändert. Dadurch passen auch große historische Kapitalstände in den vorhandenen Achsenrand.

Keine Änderung an Shell, Topbar, Menüs, Dock, Hero, CSS, Schriften, Icons, Chartbibliothek, Breakpoints oder anderen Produktwelten. In der normalen öffentlichen Auslieferung wird der interne Adapter **nicht geladen**; die bestehenden Produktdienste erhalten weder privaten Store noch eine aktivierte Preview-Konfiguration.

Sichtbar sind Kennzahlen und Benchmarkübersicht. Kapitalverlauf, Trades und Qualitätsdetails werden erst bei Bedarf aufgeklappt. Blockierte Listings erhalten keine Kennzahlen, Kurven oder Trade-Aufklapper. Preisrendite, ausgeschlossene Dividenden, NOT_CERTIFIED und Qualitätsklasse bleiben sichtbar. Kostenannahmen, modellierter Folgewochenschluss, fehlende Live-Fill-Garantie, Provenienz, Hashes und Einschränkungen stehen im vorhandenen Informations-Aufklapper. Ein unvollständiger angeforderter Zeitraum wird ausdrücklich neben der tatsächlichen Bewertungsperiode genannt.

## 2. Datenfluss und Zugriffsschutz

```text
bestehende gespeicherte Kurse + Identitäten + Modell V2
    -> vorhandene private V4-Materialisierung / unveränderliche Generation
    -> bestehendes product-services.js#getRealBacktest()
    -> vorhandener authentifizierter V4-Transport
    -> interner Adapter in der bestehenden Quant-Ansicht
```

`server/quant-backtest-preview-site.cjs` erweitert ausschließlich den lokalen V4-Server um eine **separat gebaute öffentliche Quant-Auslieferung**. Er ist kein Dateiserver für den Quellbaum oder das Ergebnisverzeichnis. Nur benötigte Asset-Pfade/Dateitypen werden gelesen; Realpath-Grenzen verhindern Symlink-Ausbrüche. Keine Verzeichnislisten, private Release-Pointer, Generationen, Speicherpfade oder anderen Produktseiten werden ausgeliefert.

Die Quant-HTML-Seite und der interne Adapter verlangen eine gültige Serversitzung. Unberechtigte Quant-Aufrufe führen zur separaten internen Anmeldung; Daten- und Detail-URLs antworten mit 401. Das V4-Berechtigungsmodell bleibt maßgeblich: private Schlüsseldatei außerhalb des Repositories, serverseitige Allow-Liste, zeitlich begrenzte und widerrufbare HttpOnly-/SameSite-Strict-Sitzung, Rate Limits, Host-/Origin-Prüfung und erneute Autorisierung vor Datenausgabe. Im integrierten Modus ist die Cookie-Path `/`, damit bestehende Assets unter ihren unveränderten URLs erreichbar sind; der Server bindet weiterhin ausschließlich an **127.0.0.1**.

Alle Antworten bleiben `private, no-store`; keine ETags/304-Abkürzung. Details sind an Listing und Generation gebunden. Eine neue Generation ersetzt keine alte Detailantwort im sichtbaren Ergebnis. Abmeldung, Seitenwechsel/Verbergen und Sitzungsablauf entfernen private Zahlen aus dem DOM; ein 401 bei einem Detailabruf entfernt auch die zuvor sichtbare Zusammenfassung sofort. Die Qualitäts-/Generationsprüfung wird während sichtbarer Sitzungen alle 15 Sekunden wiederholt. Verbergen verlangt anschließend erneute Anmeldung/Neuladen; es wird keine vertrauliche Ansicht aus einem Browser-Cache wiederhergestellt.

Die bestehenden Inline-Initialisierungen für Theme/Navigation werden mit exakten CSP-Skript-Hashes erlaubt; keine `unsafe-inline`-Skripte, kein eval, keine fremden Skriptquellen und kein Service Worker. Die vorhandenen dynamischen Shadow-DOM-Stile der Navigation benötigen Inline-Styles; das betrifft nur `style-src`, nicht die Skriptfreigabe. Entwicklungs-Passwortschutz und Deployment-Konfigurationen bleiben unverändert und werden nicht als private Datenberechtigung akzeptiert.

## 3. Reproduzierbare lokale Prüfung

Node 22 verwenden. Ergebnisse, Builds, Screenshots und Schlüssel liegen außerhalb von Git. Die Befehle erzeugen ausschließlich lokale Daten; keine Provider-Abfragen.

```bash
mkdir -p /tmp/vu-v5/operator
chmod 700 /tmp/vu-v5/operator
node scripts/quant/refresh-real-backtest.cjs \
  --output /tmp/vu-v5/results \
  --ids ref_NVDA,ref_MSFT,ref_XOM,ref_ARM,ref_AAPL,ref_BGC,ref_AAAC,ref_AACT
node scripts/vu2/build-release.mjs --output=/tmp/vu-v5/public
node scripts/quant/preview-real-backtest.cjs \
  --init-credential /tmp/vu-v5/operator/access.key
node scripts/quant/preview-real-backtest.cjs \
  --directory /tmp/vu-v5/results --public-directory /tmp/vu-v5/public \
  --credential-file /tmp/vu-v5/operator/access.key \
  --allow-list NVDA,MSFT,XOM,ARM,AAPL,BGC,AAAC,AACT --port 8795
```

Zuerst `http://127.0.0.1:8795/quant/internal-backtest/` öffnen, den Schlüssel **lokal** aus der Datei eingeben, anschließend den Link zur bestehenden Quant-Ansicht wählen: `/quant/#/aktie/NVDA` oder `/quant/#/backtest/NEW_52W_HIGH`. Der Schlüssel gehört niemals in URL, Git, Screenshots, Log oder Bericht. Standard ohne explizite Allow-Liste ist weiterhin nur NVDA.

Aktuelle Arbeitssitzung: Anmeldung `http://127.0.0.1:34483/quant/internal-backtest/`, Quant `http://127.0.0.1:34483/quant/#/aktie/NVDA`. Privater Schlüsselpfad: `/workspace/scratch/backtest-v5/operator/access.key`, Modus 0600. **Das ist keine online erreichbare HTTPS-Vorschau.** Der Prozess ist nur für die Lebensdauer dieser Arbeitsumgebung verfügbar.

Refresh und Rollback übernehmen die V4-Verträge:

```bash
node scripts/quant/refresh-real-backtest.cjs --output /tmp/vu-v5/results
node scripts/quant/refresh-real-backtest.cjs --output /tmp/vu-v5/results --watch --interval-seconds 60
node scripts/quant/rollback-real-backtest.cjs --output /tmp/vu-v5/results --generation PREVIOUS_64_HEX
```

Der manuell gestartete lokale Watcher beobachtet nur gespeicherte Inputs; kein Provider-/Git-Abruf, kein Produktions-Cron. Unveränderte Daten werden wiederverwendet. Einzelne Korrekturen invalidieren betroffene Berechnungen; globale Identitäts-, Benchmark-, Modell- und Codeabhängigkeiten invalidieren konservativ. Writer-Lock, vollständige Snapshot-Nachprüfung, atomarer Pointer, unveränderliche alte Generationen und geprüfter Rollback bleiben erhalten. Bei Fehlern bleibt die letzte vollständige Generation bestehen und wird bei geänderten Quellen als stale angezeigt. Es gibt keine HTTP-Schreib-/Refresh-/Rollback-Route. Die zehn Refresh-Tests prüfen unter anderem eine geänderte Datei mit genau einer Neuberechnung und sieben Cache-Treffern, Konkurrenz, beschädigten Cache, Teilgeneration und Wochenanhang.

## 4. Fachliche Ergebnisse

PRICE_RETURN / NOT_CERTIFIED; 100.000 USD Startkapital; modellierte 10 bp Gebühr plus 5 bp Slippage pro Transaktionsseite. Ein Folgewochenschluss ist erst nachträglich beobachtbar, kein zugesicherter Live-Ausführungskurs. 26 beobachtete Wochen Haltedauer, eine finanzierte Position gleichzeitig; keine erzwungene Veräußerung am Datenende.

| NVDA | Eingefrorener V4-Stichtag | Aktueller Main-Datenstand |
|---|---:|---:|
| Letzte Bewertung | 16.10.2026 | 23.10.2026 |
| MAX-Bewertungsbeginn | 28.01.2000 | 28.01.2000 |
| Erste tatsächliche Order | 18.02.2000 | 18.02.2000 |
| Abgeschlossene/offene Trades | 21 / 1 | 21 / 1 |
| Endkapital USD | 4.926.635,79 | 4.853.701,42 |
| CAGR | 15,7050 % | 15,6284 % |
| Max. wöchentlicher Drawdown | −80,2182 % | −80,2182 % |
| Gebühren USD | 36.559,17 | 36.559,17 |
| Slippage USD | 18.279,58 | 18.279,58 |

Gespeicherte NVDA-Historie: 22.01.1999–23.10.2026. Warm-up: 53 Wochen; erster zulässiger Signalzeitpunkt 28.01.2000, erste theoretisch mögliche Folgewochenorder 04.02.2000. Das erste tatsächliche Signal ist 11.02.2000. Letzter zulässiger Signalzeitpunkt mit Folgewochenkurs 16.10.2026; letzte Bewertung 23.10.2026. Offene Position: Einstieg 01.05.2026, kein abgeschlossener M6-Ausgang.

SPY ist auf allen **1.396** NVDA-Bewertungsdaten 28.01.2000–23.10.2026 verifiziert vorhanden: Endkapital 559.315,55 USD, CAGR 6,6510 %, Drawdown −55,9138 %. Gleiche USD-Preisrendite, Buy-and-Hold ohne Transaktionskosten; diese Kostenbasis ist ausdrücklich gekennzeichnet. Der verifizierte gespeicherte SPY-Quellvertrag beginnt 1995, nicht pauschal 1993. NVDA Buy-and-Hold erreicht 34,3992 % CAGR; die getestete Regel bleibt darunter. Daraus folgt weder Zertifizierung noch ein unabhängig bestätigter Signalvorteil.

Der V4-Stichtag und alle fünf aktuellen Zeiträume wurden unabhängig in Python mit Cash-/Anteilbuchführung, Signal-/Entry-/Exit-Prüfung und Benchmark-Gegenrechnung bestätigt. Zweifache identische JS-Ausführung und Hashvergleich sind Teil der bestehenden Validierung. Aktueller NVDA-MAX-Ergebnishash: `7cd63384bc3c7a8117df172fc0bbf46feecffa2329493338bb12a0c8da26fc36`.

| Fall | MAX bzw. Status | SPY MAX | Behandlung |
|---|---|---|---|
| NVDA | 28.01.2000–23.10.2026 | verfügbar | reale Kennzahlen, Kurven und Trades |
| MSFT | 11.01.1991–23.10.2026 | nicht vollständig | Strategie bleibt eingeschränkt ausführbar |
| XOM | 11.01.1991–23.10.2026 | nicht vollständig | Preisrendite ohne Dividenden |
| ARM | 20.09.2024–23.10.2026 | verfügbar | 3/5/10 Jahre ausdrücklich unvollständig; keine stille Vollständigkeitsbehauptung |
| AAPL | blockiert | nicht ausgewertet | Corporate-Action-Befund bleibt gesperrt |
| BGC | blockiert | nicht ausgewertet | unbekannter terminaler Wert; keine Vermischung mit heutiger Produktidentität |
| AAAC | blockiert | nicht ausgewertet | Warm-up unzureichend |
| AACT | blockiert | nicht ausgewertet | historische Wochenlücke |

Gesamter tatsächlicher Lauf:

- 6.190 Klassifizierungen; **4.451 technisch ausführbar, alle Qualitätsklasse B**, 1.739 Klasse C, keine uneingeschränkte Klasse A.
- 22.255 Periodenergebnisse; 42.815 abgeschlossene MAX-Trades; historische Bewertungsreichweite insgesamt 11.01.1991–23.10.2026.
- MAX-SPY-Abdeckung: 3.615 verfügbar, 836 nicht verfügbar. Fehlender Benchmark verhindert nicht die reine Strategieausführung.
- Blocker: Warm-up 439, Wochenlücken 218, Corporate Actions 600, Instrumentklasse 295, Identität 183, terminaler Listingwert 4.
- Vollständiger Lesedienst-Scan: 4.451 `AVAILABLE_LIMITED`, 1.739 `BLOCKED`, **null finanzielle Antworten auf blockierte Fälle**.
- Private Gesamtgeneration `e6d984142fbdacc53bde8ccf4872d4a46b72e4957569c083e00490efc187fac9`. Die achtteilige Preview-Generation ist wegen ihres anderen Scopes separat; Einzelrechnungshashes sind identisch.

Diese Titel sind kein historisch korrekt zusammengesetztes Marktuniversum und keine unabhängigen statistischen Stichproben.

## 5. Alle sechs Backtest-Arten

Die vollständigen bestehenden offenen Gates stehen maschinenlesbar in [six-kind-matrix.json](v5/six-kind-matrix.json); sie wurden nicht verändert.

| Art | Vorhandene Engine/Daten | V5-Anbindung und fachliche Grenze | Nächste Arbeit |
|---|---|---|---|
| Same Stock Replay | `historical-cases.js` / `pattern-research.js`, reale Wochenkurse, Episode-/Warm-up-/Stichprobengrenzen | Vorhandene ähnliche Situationen bleiben deskriptiv LIMITED. Zusätzlich benannter NEW_52W_HIGH-Einzeltitel-Regeltest in derselben Historie; keine Gleichsetzung der Methodiken. | Deskriptive Episodenmethodik getrennt prüfen; Survivor-by-construction bleibt eine Einschränkung, kein marktweiter Vorteil. |
| Pattern Evidence | `pattern-research.js`, versionierte Musterstudien und Vergleichsgruppen | Unverändert LIMITED; kein neuer V5-Handelstest für sämtliche Muster. | Historische Vergleichspopulation, Identitäten, Renditevertrag und Unsicherheit absichern. |
| Signal Backtest | `signal-backtest.js`, fünf unveränderte Regeln und versionierte marktweite Studien | Nur NEW_52W_HIGH-Einzelaktienrechnung zusätzlich sichtbar; marktweite Ergebnisse/Gates unverändert LIMITED. | Survivorship-/Regime-Kontrollen und eingefrorene unabhängige Replikation; keine Optimierung nach vorhandenen Ergebnissen. |
| Setup Backtest | Setup-Snapshots/Outcomes, `build-setup-backtest.mjs`, getrennte PIT-Rekonstruktion | COLLECTING_HISTORY; nicht mit Wochenregel ersetzt. Noch offene M6-Fälle werden nicht abgeschlossen gezählt. | Vollständige veröffentlichte Snapshot-/Outcome-Verknüpfung, unabhängige Fälle, Renditebasis und OOS-/Entry-Varianten prüfen. Kurshistorie allein ersetzt keine PIT-Setups. |
| Strategy Backtest | `profile-backtest.js`, strikt vor Rebalance verfügbare Membership/Faktoren, Total-Return-Vertrag | COLLECTING_HISTORY; kein reales historisches Portfolio durch V5 freigeschaltet. | Historische Membership, rechtzeitig verfügbare Faktoren, Identitäten/Delistings und passende TR-Daten liefern. Vorhandene Engine wiederverwenden. |
| Factor Ranking Backtest | `profile-backtest.js`, Faktorhistorie und prospektive Forward-Outcomes | COLLECTING_HISTORY; keine synthetischen historischen Rankings oder heutige Vergleichspopulation. | PIT-Querschnitte und historische Population, vollständige Forward-Outcomes, Rebalancing und Kosten auf genau diesen Daten prüfen. |

Keine pauschale Zukunftswartepflicht wird eingeführt. Echte historische Membership-/PIT-Belege können historische Tests ermöglichen; tatsächlich prospektive unabhängige Beobachtungen sind getrennt zu behandeln. Die bestehenden strengeren Zertifizierungsgates bleiben geschlossen.

## 6. Online-Hosting: konkret offen

**Keine HTTPS-Adresse wurde bereitgestellt oder als erfolgreich getestet ausgegeben.**

Nachweise: Der aktuelle `cloud_environment.environment_status` meldet `observations_current=true`, leere Secret-/Runtime-/Outbound-Identity-Listen und keine Ingress-Fähigkeit. Das lesende GitHub-API-Listing der Repository-Actions-Secret-Metadaten wurde mit **HTTP 403 – Resource not accessible by integration** abgewiesen. Daraus folgt nicht, dass die Organisation keine Secrets besitzt; diese Sitzung hat keine nachgewiesene private Hosting-Bindung.

Die vorhandenen Pfade erfüllen den privaten Vertrag derzeit nicht:

- GitHub Pages und Cloudflare Pages liefern statische Artefakte; der Entwicklungs-Passwortschutz ist kein serverseitiger privater Datenzugang.
- `vercel.json` bietet öffentliche History-/Intraday-/Status-Funktionen, aber weder einen konfigurierten privaten Backtest-Store noch eine Reviewer-Sitzung. `build-vercel-public.mjs` erzeugt eine öffentliche Datendienst-Platzhalterseite, keine geschützte Quant-Preview.
- `worker/wrangler.toml` beschreibt den separaten Live-Relay ohne diesen Node-Dateispeicher-/Reviewer-Vertrag. Social-/Ask-Worker sind andere Produktpfade und werden nicht verändert.
- Der lokale Preview-Server akzeptiert keine beliebigen fremden Hosts oder Proxy-Header und setzt bewusst keine vermeintliche Internetfreigabe durch einen Client-Schalter um.

**Kleinste belastbare Online-Option:** Ein Repository-/Hosting-Verantwortlicher stellt innerhalb eines bereits vorhandenen, budgetgeprüften Preview-Projekts (z. B. bestehendes Vercel-Projekt) einen privaten Storage-Lesezugang und eine überprüfbare Reviewer-Identität bereit. Danach:

1. Bestehendes Quant-Release und den internen Adapter nur auf dieser Entwicklungs-Origin ausliefern; öffentliche Produktion unverändert lassen.
2. Bestehenden V4-Transport für eine fest konfigurierte HTTPS-Origin adaptieren: Secure-/HttpOnly-/SameSite-Cookie, serverseitige Authentifizierung und Listing-Allow-Liste; serverless-taugliche, widerrufbare Sitzungen statt Annahmen über langlebigen Prozessspeicher. Keine Geheimnisse im Build.
3. Vorhandenen Produkt-Lesedienst mit einem privaten, ausschließlich lesenden Generationen-Store anbinden; keine raw Storage-URLs oder offenen Bucket-ACLs. Ein kleiner achtteiliger Prüfscope genügt zunächst.
4. Identische Autorisierung für HTML, Summary, Quality, Equity und Trades; no-store, Origin-/CSRF-/Cache-Replay-Tests, Generationswechsel und Ablauf erneut unter tatsächlichem HTTPS prüfen.
5. Desktop und eigenes iPhone über diese **echte** URL abnehmen. Erst danach darf eine Online-Vorschau als verfügbar gemeldet werden.

Geschätzter Engineering-Aufwand nach bereitgestellten Bindungen: **1–3 Arbeitstage**, einschließlich HTTPS-Sicherheits- und Browserabnahme; kein Angebot für kostenpflichtige Dienste. Konfigurations-/Accountfreigaben sind eine externe Abhängigkeit, keine historische Datenwartezeit. Ein eigener öffentlicher Tunnel, ein ungeschützter Bucket oder das Hochladen privater Daten in einen Pages-Build sind keine Ersatzlösung.

## 7. Tests, Screenshots und Betrieb

| Prüfung | Ergebnis |
|---|---|
| Vollständige Quant-Suite, Node 22.23.4 | **2.858 ausgeführt; 2.851 PASS, 7 FAIL, 0 übersprungen**, 714.760 ms |
| Unveränderter Main, gezielter Gegenlauf | exakt dieselben 7 Elliott-Registry-Fehler reproduziert, Main-SHA oben |
| Core-CI-Testbefehl | 260 / 260 PASS |
| Real-Data-/Reader-/Security-/Refresh-/Integrationsprüfungen | 56 / 56 PASS |
| Shell-/Navigation-/Ressourcenbudget-Unit-Tests | 23 / 23 PASS |
| V4-Harness-Browserregression | 20 Checks PASS |
| Integrierte Quant-Browserprüfung | **43 Checks PASS**: Chromium Desktop, WebKit Desktop, iPhone-WebKit 390 und 430, jeweils Light/Dark |
| Accessibility der neuen Ergebnisregion | 20 bestandene Regeln, 0 automatisierte Verletzungen |
| Bestehende öffentliche Browser-QA | 96 Checks; **2 bekannte Namensbefunde bleiben rot** |
| Öffentliche Ressourcenbudgets | 8 / 8 PASS |
| Öffentliche Accessibility-Prüfung | 84 Seiten, 0 automatisierte Verletzungen; unvollständige manuelle Prüfungen bleiben offen |
| Unabhängige Python-Gegenrechnung | alle 5 aktuellen Perioden und eingefrorener V4-Stichtag PASS |
| JSON-/Vertrags-/Syntax-/Hygiene-/Diff-Prüfung | PASS; keine Zugangsdaten oder privaten Ergebnisse in öffentlichem Build |

Die sieben Main-Fehler sind M11-P3 bis M11-P9 in `elliott-registry-product-view.test.mjs`: Tests verwenden aktualisierte Langreihen gegen einen älteren veröffentlichten Produktstand; die Identitätsprüfung vergleicht null Fälle und verweigert die Registrierung. Reproduziert in einer separaten unveränderten Main-Arbeitskopie. Keine Elliott-Registry-/UI-Reparatur und keine abgeschwächte Assertion in V5.

Die öffentliche Browser-QA meldet `Name weicht vom Verzeichnis ab` auf NVDA bei 1440 und 390 Pixeln. PR #892 behandelt diesen separaten Befund; V5 ändert die Namen nicht. Für den öffentlichen Browservergleich wurde der normale Workflow-Build einschließlich Whitespace-Minifizierung verwendet. Seine Bundle-Bytes stimmen mit dem abschließend gebauten Release überein: SHA256 `de73b23449256accc5f7e1394a4007234382c13158089d5006d268aa70a8e45d`. Nicht bestandene Pflichtchecks bleiben Merge-Blocker.

Browser-QA nutzt die reale bestehende Quant-Anwendung, keine Ersatzseite. Der Vergleich ohne internen Adapter behält dieselben Navigationslinks und enthält keinen privaten Ergebnisbereich. Keine CSS-/Shell-/Chartdatei wurde verändert. WebKit ist der echte Playwright-WebKit-Browser mit iPhone-Geräteprofil; dies ist **keine Prüfung auf einem physischen iPhone**. Die V4-dokumentierte lokale WebKit-Runtime mit echten Debian-Bibliotheken wurde wiederverwendet. Für Accessibility wird axe ausschließlich über die Test-/DevTools-Verbindung ausgewertet; die Produktions-CSP wird nicht deaktiviert.

Private Screenshots: `/workspace/scratch/backtest-v5/browser-final-accepted/`:

- `chromium-desktop-light-page.png`, `chromium-desktop-dark-page.png`: gesamte bestehende Aktienansicht einschließlich Integration.
- `webkit-desktop-light-page.png`, `webkit-desktop-dark-page.png`.
- `webkit-iphone-390-light-page.png`, `webkit-iphone-390-dark-page.png`, entsprechende 430er Bilder.
- Gleichnamige Bilder ohne `-page`: Ergebnisregion mit geöffneten Charts/Trades; `*-blocked.png`: AAPL ohne Performancewerte.

Keine Screenshots, Schlüssel, vollständigen Kurven oder privaten Speicherartefakte werden nach Git oder zu einem öffentlichen Host hochgeladen.

Reproduktion mit installierten Playwright-/axe-Abhängigkeiten:

```bash
node --test 'quant/tests/*.test.mjs'
node --test 'core/tests/*.test.mjs' quant/tests/push-with-retry.test.mjs \
  quant/tests/intraday-scope.test.mjs quant/tests/published-close-rounding.test.mjs
node scripts/quant/validate-real-backtest-read.cjs /tmp/vu-v5/results
NODE_PATH=/path/to/qa/node_modules node scripts/quant/qa/integrated-preview-browser.cjs \
  --directory /tmp/vu-v5/results --public-directory /tmp/vu-v5/public --output /tmp/vu-v5/screenshots
node scripts/quant/qa/preview-delivery-check.cjs /tmp/vu-v5/results /tmp/vu-v5/delivery.json
```

`CHROMIUM_PATH` und `WEBKIT_PATH` können die installierten echten Browser auswählen. Der vollständige Bestandslauf ist separat mit `materialize-real-backtest-read.cjs --output PRIVATE_EMPTY_DIRECTORY` reproduzierbar; ohne `--ids` werden alle gespeicherten Reihen geprüft.

Gemessen auf diesem gleichzeitig belasteten Worker: kalte Materialisierung aller 6.190 Listings **238,15 s**, Peak-RSS **397.357.056 Bytes**. Keine behauptete Geschwindigkeitsverbesserung gegenüber V4, da andere Inputs und Last. 20 parallele echte HTTP-Summary-Abrufe: p50 **47,60 ms**, p95 **54,31 ms**, anonymes Replay nach warmem Cache 401. Dies ist kein Internet-/Produktions-SLA. Größte Roh-Summary über alle fünf Perioden 25.336 Bytes, größtes Detail 210.825 Bytes, gzip 48.547 Bytes; keine Budgetüberschreitung. Der Browser lädt nur den ausgewählten Summary und bei Bedarf einzelne Details, niemals alle 22.255 Periodenergebnisse.

## 8. PR-Konsolidierung und Freigabereihenfolge

Alle sechs Ausgangs-PRs waren bei der Prüfung **OPEN**, keine menschlichen Reviews eingetragen. Vollständige Kopf-SHAs, Checks, Reviewstatus und dateiweise Inhaltsvergleiche stehen in [repository-baseline.json](v5/repository-baseline.json). Ein offener PR gilt nicht als gemergt, selbst wenn einzelne Dateien schon anderweitig vorhanden sind.

| PR | Festgestellter Stand / Empfehlung |
|---|---|
| #862 | Konflikt mit Main; Statuskonsistenz-Modul und zugehöriger Test sind **nicht vollständig in V5 enthalten**. Konflikte separat auf aktuellem Main auflösen, Producer-Verträge und generierte Artefakte prüfen; keine alten JSON-Stände zurückspielen. |
| #872 | Offen; V5 verwendet den benötigten Historienresolver aus der Wochenkurs-Kette, **nicht** sämtliche Portfolio-/Mock-/Methodikentwurfsänderungen dieses PRs. Restumfang separat reviewen. |
| #882 | Reale Wochenengine als Voraussetzung enthalten; aktuelle Daten und Tests unterscheiden sich vom damaligen Bericht. |
| #894 | Kosten V2, SPY und Batch als Voraussetzung enthalten. |
| #895 | Privater Lesedienst, Qualität und Materialisierung enthalten. |
| #896 | V4-Sicherheit/Refresh enthalten; V5 erweitert diese Dateien gezielt und korrigiert datenstandsabhängige Referenztests. |

Empfohlene Strategie: **ein konsolidierter Review-Strang für #882 → #894 → #895 → #896 → V5**. V5 enthält jede benötigte Änderung nur einmal und stellt den kumulativen Diff gegen den geprüften Main bereit. Die älteren PRs sind zunehmend kumulativ; ihre Diffs dürfen nicht nacheinander blind cherry-gepickt werden. Entweder diesen konsolidierten Strang nach vollständigem Review übernehmen und die ersetzten PRs anschließend durch den Owner schließen, oder ausschließlich noch fehlende Layer in der angegebenen Reihenfolge integrieren und V5 danach ohne Doppeländerungen rebasieren. **V5 schließt oder verändert keinen bestehenden PR.**

#862 und die nicht übernommene Methodik-/Portfolioarbeit aus #872 sind separate Voraussetzungen einer späteren breiten Produktfreigabe. Zuerst den #862-Konflikt und die Main-Registry-/Browserbefunde lösen/reviewen, dann die benötigten Teile von #872 entscheiden, anschließend den konsolidierten Real-Data-Strang prüfen. Keine Bestätigung des V5-Pfads ersetzt eine Freigabe der Entwurfsmethodik oder fremder Pflichtchecks.

Parallel offen: #873 (Quant-Aktienlayout), #869 (Fundamental), #892 (Browser-Namen), #893 (Browserinstallation). Keine ihrer Implementierungen wurde übernommen oder geändert. Der V5-Aktienhook liegt an einer einzigen bestehenden Historiengrenze; nach einer Layoutübernahme ist dieser Hook gezielt erneut zu integrieren und mobil zu prüfen.

**Freigabeempfehlung:** Lokale fachliche Sichtprüfung kann sofort erfolgen. Für eine gemeinsame Online-Sichtprüfung zuerst private Hosting-/Auth-/Storage-Bindungen bereitstellen und den HTTPS-Transport abnehmen. Öffentliche Quant-Aktivierung bleibt ein gesonderter Auftrag mit fachlicher Methodikentscheidung, aufgelösten roten Pflichtchecks, gültigen Datenrechten und Reviews. Weder Main-Fehler noch Hosting-Lücke werden durch diese Dokumentation als erledigt erklärt.
