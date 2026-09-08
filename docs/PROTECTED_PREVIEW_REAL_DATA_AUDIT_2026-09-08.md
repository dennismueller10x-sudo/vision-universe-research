# Vision Universe® — Protected Preview, Deployment & Real-Data Audit

**Auditstand:** 08.09.2026

**Geprüfter Commit:** `5c6d21f99a31d2fa2a2c2b49ba59ea3d2e6d851e` (`origin/main`, identisch mit lokalem `HEAD`)
**Entscheidung:** **NOT READY**

## Executive Summary

Der aktuelle Stand von `main` ist öffentlich unter `https://research.visionuniverse.de/` erreichbar und wird ohne separaten Produktions-Build direkt aus dem Repository-Root über GitHub Pages veröffentlicht. Das Repository selbst ist öffentlich. Damit können nicht autorisierte Nutzer HTML und JSON unabhängig von einem Schutz der Custom Domain über GitHub und die Raw-Dateipfade abrufen.

Eine geschützte Preview wurde deshalb **nicht** ausgerollt. Die kleinste belastbare Zielkonfiguration ist: Repository privat stellen, GitHub Pages unpublishen und denselben statischen Stand auf einen Host mit vorgelagertem Zugriffsschutz bringen. In der derzeitigen Infrastruktur ist Cloudflare Access die pragmatischste Option, sofern sowohl Custom Domain als auch jede Anbieter-/Preview-Domain geschützt werden. Ein Worker mit selbst gebauter Basic Auth ist nicht die kleinere oder sicherere Lösung.

Die Tiingo-Gates sind standardmäßig aus. Ein vorhandener `TIINGO_API_KEY` aktiviert keine Anzeige. Der manuell gestartete, geheimnisfreie Laufzeitnachweis hat EOD, Split-/Dividendenbereinigung, Corporate-Action-Felder und IEX-5-Minuten-Bars bestätigt. Realtime-Quotes, IEX WebSocket und Consolidated Equity wurden vom vorhandenen Prüfpfad nicht ausgeführt und bleiben deshalb `UNKNOWN`.

Unabhängig von Tiingo werden derzeit echte, unbereinigte Twelve-Data-EOD-Reihen für 15 Referenztitel in das öffentliche Repository geschrieben und über Pages ausgeliefert. Die Lizenzlage dafür ist vor einer internen Preview zu klären oder die Dateien müssen aus dem öffentlichen Auslieferungspfad entfernt werden.

## 1. Current main

- `git fetch origin`: durchgeführt.
- `origin/main`: `5c6d21f99a31d2fa2a2c2b49ba59ea3d2e6d851e`.
- Lokal gegen Remote: `0` voraus, `0` zurück.
- `VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md`: vollständig gelesen. Das Dokument nennt als eigenen Prüfstand noch `252dec5`; bei Abweichungen ist der aktuelle Repository-Inhalt maßgeblich.

## 2. Aktuelles Deployment

| Frage | Befund |
|---|---|
| Was deployt automatisch? | GitHub Pages veröffentlicht den Repository-Root. Zusätzlich stößt `sync-navigation.yml` nach passenden Änderungen einen Pages-Build an. |
| Branch | `main` |
| Wird `main` direkt veröffentlicht? | Ja. |
| Separater Build? | Nein; Pages-Quelle ist `main` / `/ (root)`. |
| Custom Domain | `research.visionuniverse.de` aus `CNAME` |
| DNS | `research.visionuniverse.de` ist CNAME auf `dennismueller10x-sudo.github.io`; Nameserver liegen bei United Domains, nicht Cloudflare. |
| HTTPS | GitHub-Pages-Einstellung „Enforce HTTPS“ war beim Audit nicht aktiviert; DNS-Prüfung lief. |
| Direkte github.io-URL | `https://dennismueller10x-sudo.github.io/vision-universe-research/` leitet im Browser auf die Custom Domain um. |
| Alternative öffentliche Quelle | Ja: öffentliches GitHub-Repository und Raw-Dateipfade enthalten HTML/JSON vollständig. |

Weitere automatische Datenpfade:

- `market-data.yml` ruft werktags nach US-Handelsschluss Twelve Data ab, schreibt `quant/data/market` und pusht die Ergebnisse nach `main`.
- SEC-, Dashboard-, Analysten- und Hedgefonds-Workflows aktualisieren weitere statische Bestände nach ihren jeweiligen Zeitplänen.
- `tiingo-verify.yml` läuft nicht zeitgesteuert und veröffentlicht keine Kursreihen; der Import bleibt in `.market-cache`.

## 3. Schutz- und Bypass-Bewertung

| Option | Bewertung |
|---|---|
| A — Hosting-native Passwort-/Basic-Auth | Im aktuellen persönlichen GitHub-Pages-Setup nicht vorhanden. Private Pages-Zugriffskontrolle setzt laut GitHub eine Enterprise-Cloud-Organisation voraus. |
| B — Cloudflare Access / Zero Trust | **Empfohlen**, wenn kein bestehender Auth-Host genutzt werden kann. Identitätsbasierter, vorgelagerter Schutz; deny-by-default. DNS ist derzeit noch nicht bei Cloudflare. |
| C — Cloudflare Worker / Edge Auth | Möglich, aber mehr eigene Auth-/Session-/Secret-Verantwortung als Access. Kein Vorteil für diesen Anwendungsfall. |
| D — Bestehender serverseitiger Schutz | Nicht gefunden. |

Cloudflare Access allein vor der Custom Domain genügt nicht. Vor Freigabe müssen zusätzlich:

1. das Repository privat und GitHub Pages unpubliziert sein;
2. die Custom Domain geschützt sein;
3. eine mögliche `*.pages.dev`-Produktionsdomain und alle Preview-Aliase ebenfalls geschützt oder deaktiviert sein;
4. direkt abrufbare Object-Storage-/Raw-URLs ausgeschlossen sein.

GitHub dokumentiert private Pages-Sites für Enterprise-Cloud-Organisationen: <https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site>. Cloudflare beschreibt Access als vorgeschaltete Authentifizierung und weist darauf hin, dass Preview-Schutz allein Produktions- und Custom Domains nicht automatisch schützt: <https://developers.cloudflare.com/learning-paths/clientless-access/access-application/create-access-app/> und <https://developers.cloudflare.com/pages/configuration/preview-deployments/>.

## 4. Datenmodus-Matrix

`Modus` beschreibt die inhaltliche Echtheit. `Form` beschreibt, ob die Daten zur Laufzeit entstehen oder als Datei vorliegen.

| Bereich | Modus | Form | Quelle | Markt-Takt | Befund |
|---|---|---|---|---|---|
| Dashboard | HYBRID | PRECOMPUTED | Twelve Data, FMP, Finnhub, statische/redaktionelle JSON | EOD / UNKNOWN | Reale Markt- und Analystendaten gemischt mit vorab berechneten Scores und statischen Profilen. |
| Quant Home | MOCK | PRECOMPUTED | MOCK / STATIC JSON | n/a | 511 synthetische Titel, klar als Demo bezeichnet. |
| Screener | MOCK | PRECOMPUTED | MOCK / STATIC JSON | n/a | Arbeitet auf demselben synthetischen Universum. |
| Factor DNA | MOCK | PRECOMPUTED | MOCK / STATIC JSON | n/a | Elf vorab erzeugte Shards. |
| Ranking | MOCK | PRECOMPUTED | MOCK / STATIC JSON | n/a | Synthetische Scores. |
| Radar | MOCK | PRECOMPUTED | MOCK / STATIC JSON | n/a | Synthetische Events und Score-Änderungen. |
| Strategy Lab | MOCK | PRECOMPUTED | MOCK / STATIC JSON | n/a | Versionierte Regeln auf Mock-Universum. |
| Backtest | MOCK | Laufzeitberechnung auf PRECOMPUTED Input | MOCK / STATIC JSON | n/a | Clientseitiger Web Worker; keine realen Returns. |
| AI / Ask VU | MOCK | deterministisch | MockAIProvider | n/a | Kein LLM und keine externe KI-Laufzeit. |
| Technical Intelligence | HYBRID | PRECOMPUTED | Twelve Data + MOCK | EOD | 13 reale Referenztitel plus 13 Mock-Instrumente; 26 Instrumente, 36 Snapshots. |
| Elliott | HYBRID | PRECOMPUTED | Twelve Data + MOCK | EOD | Teil der Technical-Ergebnisse; `elliott-v1.0.0-beta`, keine Realtime-Engine. |
| Stock Detail | MOCK | PRECOMPUTED | MOCK / STATIC JSON | n/a | Synthetische Fundamentaldaten, Kurse und Scores. |
| SEC Inspector | REAL | PRECOMPUTED | SEC EDGAR/XBRL | Filing-basiert | Echte SEC-Daten für fünf Symbole, mit Accession/Form/Verfügbarkeitsdatum. |
| Macro | REAL | PRECOMPUTED / STATIC | primär FRED, außerdem Fed/NY Fed/Treasury/BLS/BEA/Census u.a. | monatlich/UNKNOWN | 52 Indikatoren; kein Live-Fetch im Browser, fehlende Werte bleiben null. |
| Hedge Fund | REAL | PRECOMPUTED / STATIC | SEC 13F | quartalsweise | 100 Fonds im Datenbestand. UI-Begriff „Live“ ist für statische 13F-Snapshots zu stark. |
| Charts | HYBRID | PRECOMPUTED | je Bereich Twelve Data, MOCK oder andere statische Quelle | überwiegend EOD | SVG/Client-Rendering aus Dateien; kein Stream. |
| Quant Marktdaten | REAL | PRECOMPUTED / STATIC | Twelve Data | EOD | 15 Titel × 400 unbereinigte Tagesbars, öffentlich abrufbar. |

## 5. SEC-Bestand und tatsächliche Nutzung

| Symbol | Fakten | Filings | Fiskaljahr-Labels | kanonische Metriken | Besonderheiten |
|---|---:|---:|---|---:|---|
| NVDA | 846 | 86 | 2008–2027 | 13 | 4 unterdrückte Werte |
| AAPL | 962 | 93 | 2007–2026 | 13 | keine Unterdrückung |
| MSFT | 998 | 91 | 2008–2026 | 13 | keine Unterdrückung |
| JPM | 619 | 97 | 2007–2026 | 7 | Bankenspezifisch geringere Abdeckung |
| XOM | 846 | 91 | 2007–2026 | 11 | 1 unterdrückter Wert |

Alle fünf Bestände enthalten Q1–Q4 sowie Jahresperioden. Die Fiskaljahr-Labels sind keine Aussage über ein künftiges Veröffentlichungsdatum; Point-in-Time-relevant sind `periodEnd`, Filing- und Verfügbarkeitsdatum.

Die maximal 13 kanonischen Metriken sind: `accruals`, `capex`, `freeCashFlow`, `grossProfit`, `interestExpense`, `investedCapital`, `netDebt`, `netIncome`, `operatingIncome`, `revenue`, `sharesOutstanding`, `totalAssets`, `totalEquity`. JPM besitzt davon 7, XOM 11. `ebitda` und `dividendPerShare` sind im kanonischen Bestand nicht unterstützt.

**Konsum:** Der SEC Data Inspector lädt die Inspector-JSON und zeigt echte Daten mit Provenienz. Die Quant-Scores, Rankings, Screener, Factor DNA und Backtests konsumieren diese SEC-Daten nicht. Der SEC-Adapter und seine Tests belegen Provider-Fähigkeit, aber keine Integration in den Quant-Kern.

## 6. Tiingo-Fähigkeitsmatrix

| Datenklasse | Implementiert | Runtime verifiziert | Account-Zugriff | Public Display erlaubt | Aktuell aktiviert |
|---|---|---|---|---|---|
| Historical EOD | Ja | Ja | Ja | Nein / ungeklärt | Nein |
| Split-adjusted EOD | Ja | Ja | Ja | Nein / ungeklärt | Nein |
| Total-return-adjusted EOD | Ja | Ja | Ja | Nein / ungeklärt | Nein |
| Corporate Actions (Split-/Dividendenfelder aus EOD) | Ja | Ja | Ja | Nein / ungeklärt | Nein |
| Historical IEX intraday bars (5 min) | Ja | Ja | Ja | Nein / ungeklärt | Nein |
| IEX REST realtime/reference quote | Ja (`getQuote`) | **Nein** | **UNKNOWN** | Nein / ungeklärt | Nein |
| IEX WebSocket | Nein | Nein | **UNKNOWN** | Nein / ungeklärt | Nein |
| Consolidated Equity Realtime REST | Nein | Nein | **UNKNOWN** | Nein / ungeklärt | Nein |
| Consolidated Equity Realtime WebSocket | Nein | Nein | **UNKNOWN** | Nein / ungeklärt | Nein |
| Consolidated historical intraday bars | Nein | Nein | **UNKNOWN** | Nein / ungeklärt | Nein |

Manueller Runtime-Lauf: GitHub Actions `Tiingo — Laufzeitnachweis`, Run `34201007175`, Commit `5c6d21f`, erfolgreich; sechs API-Anfragen. Der Lauf prüfte keine WebSocket-Verbindung und keinen Consolidated-Equity-Endpunkt. Er veröffentlichte keine Kurse und der Bericht enthielt keinen Schlüssel.

Terminologie:

- Eine IEX-Intraday-Bar ist kein Beweis für einen Realtime-Trade oder Realtime-Quote.
- Tiingo dokumentiert für Konten ohne separates IEX-Abkommen einen abgeleiteten Realtime-Referenzpreis (`tngoLast`); IEX-TOPS-Felder wie Last/Bid/Ask können dann fehlen. Ob das aktuelle Konto volle TOPS-Felder oder nur den Referenzpreis erhält, ist im aktuellen Lauf **nicht** gemessen.
- Die dokumentierte Möglichkeit ist kein Account-Nachweis. Siehe <https://www.tiingo.com/documentation/iex> und <https://www.tiingo.com/documentation/websockets/iex>.
- Consolidated Equity ist ein separater Beta-Pfad und ebenfalls nicht durch den Lauf belegt: <https://www.tiingo.com/documentation/equity-realtime-stock-data> und <https://www.tiingo.com/documentation/websockets/equity-realtime-stock-data>.

## 7. Gates, Geheimnisse und Redistribution

- `ENABLE_LIVE_MARKET_DATA.enabled = false`.
- `ENABLE_PUBLIC_LIVE_MARKET_DATA.enabled = false`.
- Public Display verlangt zusätzlich eine deklarierte, datierte Lizenzgrundlage; ein Gate allein erteilt keine Lizenz.
- `TIINGO_API_KEY` liegt als Repository Secret vor, wird nur per `Authorization`-Header an Node-Code übergeben und nicht an den Browser ausgeliefert.
- Secret-Scan für `quant/data/market`: bestanden, keine Zugangsdaten gefunden.
- Öffentlich sichtbare Tiingo-Kursreihen: **keine gefunden**. Öffentlich sichtbar ist lediglich ein Tiingo-Statusbericht ohne Rohkurse.
- Öffentlich sichtbar sind jedoch reale Twelve-Data-EOD-Reihen. Die Anbieter-/Redistributionsrechte sind vor einer Preview separat zu bestätigen.

## 8. Realtime- und Chart-Readiness

Der aktuelle Chart ist **nicht realtime-ready**. Vorhanden sind kanonische Bars, Timeframe-Aggregation, eine Markierung für eine noch nicht abgeschlossene Bar, statische Chart-Renderer und Technical-Engines. Es fehlen jedoch die Laufzeitkomponenten des gewünschten Pfads:

`Tiingo -> geschütztes Backend/Edge -> Normalisierung -> Store -> inkrementelle Kerze -> Technical Update`

Nicht implementiert bzw. nicht verbunden:

- geschützter Server-/Edge-Stream und WebSocket-Client;
- inkrementelle OHLCV-Aktualisierung und final/developing-Übergang;
- Reconnect, Heartbeat und Backoff;
- Stale-Data-Anzeige;
- Rate-Limit-Steuerung für Streams;
- REST-Snapshot-Fallback;
- Session-/Pre-/Post-Market-Regeln;
- inkrementelle Technical-/Elliott-Neuberechnung.

Aktuell wird der Provider-Schlüssel nicht an Browser-Code weitergereicht. Eine spätere Realtime-Integration darf daran nichts ändern.

## 9. UI-, Desktop- und Mobile-Test

Getestet wurde die heute öffentliche Site, nicht eine geschützte Preview, da diese nicht bereitgestellt werden durfte.

**Desktop-Smoke:** Startseite, Dashboard, Quant Home, Screener, Factor DNA, Ranking, Radar, Strategy Lab, Backtest, AI, SEC Inspector, Technical/NVDA, Marktdaten, Macro und Hedgefonds geladen. In den geprüften Routen wurden keine JavaScript-Fehler protokolliert.

**Mobile 390 × 844:** Startseite und Technical visuell geprüft; Navigation wechselt auf der Startseite in ein Menü, Inhalte sind lesbar. Dashboard, Backtests, AI, Macro und Hedgefonds zusätzlich geladen; keine JavaScript-Fehler in den geprüften Routen. Die Quant-Unter-Navigation ist horizontal dicht und sollte vor Freigabe interaktiv auf Scroll-/Fokusverhalten geprüft werden.

**Provenienzbefunde:**

- Quant Home kennzeichnet das synthetische Universum deutlich.
- SEC Inspector kennzeichnet echte SEC-Primärdaten deutlich.
- Technical/NVDA kennzeichnet reale, splitbereinigte EOD-Daten und Elliott als Beta.
- Auf Technical/NVDA und Quant Marktdaten steht im gemeinsamen Footer trotzdem pauschal, sämtliche Daten dieses Bereichs seien synthetisch. Das widerspricht den unmittelbar darüber gezeigten realen Daten.
- Die Startseite bezeichnet statische/quartalsweise 13F-Daten als „Live-Einblick“ und „SEC EDGAR Live-Daten“.
- Dashboard ist inhaltlich gemischt, besitzt aber keine gleichwertige, globale REAL/PRECOMPUTED/STATIC-Kennzeichnung.

## 10. Verifikation

| Prüfung | Ergebnis |
|---|---|
| Node Quant | 444 / 444 bestanden |
| Academy | 8 / 8 bestanden |
| Python | 247 bestanden, 1 übersprungen, 1 lokal fehlgeschlagen |
| Quant-Datenreproduktion | 482 Titel, 0 Abweichungen |
| Technical-Reproduktion | 26 Instrumente, 36 Snapshots, bestanden |
| Secret-Scan | bestanden |

Der einzelne Python-Fehler ist ein Digest-Vergleich über rohe Dateibytes auf einem Windows-Checkout mit `core.autocrlf=true`. Der Git-Blob-Digest entspricht dem eingecheckten Sollwert; betroffen ist die Plattformrobustheit des Tests, nicht der fachliche Dateninhalt.

## 11. Offene Befunde nach Schweregrad

### CRITICAL

1. Keine Authentifizierung vor der aktuell öffentlichen Site.
2. Öffentliches Repository macht HTML/JSON selbst bei geschützter Custom Domain abrufbar.
3. Reale Twelve-Data-EOD-Dateien werden automatisiert nach `main` committed und öffentlich ausgeliefert, während die Redistribution für die geplante Preview nicht nachgewiesen ist.

### HIGH

1. GitHub Pages publiziert `main` / Repository-Root ohne private Auslieferungsgrenze.
2. Kein hosting-nativer Passwortschutz im aktuellen Account; Schutz der Domain allein beseitigt die Origin-/Repo-Pfade nicht.
3. HTTPS-Erzwingung war im Pages-Setup nicht aktiviert.
4. Reale und synthetische Daten erhalten in Technical/Marktdaten einen widersprüchlichen gemeinsamen Footer.

### MEDIUM

1. Dashboard-Provenienz ist nicht als konsistente REAL/MOCK/PRECOMPUTED-Matrix in der UI sichtbar.
2. „Live“ wird für vorab berechnete EOD-/13F-Inhalte verwendet.
3. IEX-Realtime-Quote, beide WebSockets und Consolidated Equity sind für das aktuelle Konto nicht runtime-verifiziert.
4. Chart-Streaming-Funktionen fehlen; der Chart ist EOD/precomputed.
5. Ein Digest-Test ist nicht robust gegen Windows-Zeilenenden.

## 12. Finaler 29-Punkte-Status

1. **Current main:** `5c6d21f99a31d2fa2a2c2b49ba59ea3d2e6d851e`.
2. **Deployment:** GitHub Pages, `main`, Root, kein separater Build.
3. **Domain:** `research.visionuniverse.de`.
4. **github.io-Origin:** Projekt-URL redirectet; öffentliches Repo/Raw bleibt Bypass.
5. **Schutz:** privates Repo + Pages aus + auth-fähiger Host; bevorzugt Cloudflare Access.
6. **Cloudflare:** **JA**, wenn kein vorhandener Auth-Host gewählt wird; derzeit nicht eingerichtet.
7. **Protected Preview:** nicht bereit.
8. **SEC:** fünf echte Symbole; Inspector konsumiert sie, Quant-Kern nicht.
9. **Tiingo EOD:** implementiert und runtime-verifiziert, nicht aktiviert/publiziert.
10. **Tiingo Intraday:** IEX 5-Minuten-Historie runtime-verifiziert, Gate aus.
11. **Tiingo Realtime:** nicht runtime-verifiziert.
12. **IEX REST realtime/reference:** implementiert, Account-Zugriff `UNKNOWN`.
13. **IEX WebSocket:** nicht implementiert, `UNKNOWN`.
14. **Consolidated Equity:** nicht implementiert, `UNKNOWN`.
15. **Realtime-Terminologie:** keine Berechtigung, volle TOPS-Daten zu behaupten; möglicher `tngoLast` ist nur abgeleiteter Referenzpreis.
16. **API-Key:** im aktuellen Pfad nicht im Frontend und im Secret-Scan unauffällig.
17. **Chart:** nicht realtime-ready.
18. **REAL:** SEC Inspector, Macro-/13F-Snapshots, echte Referenz-EOD-Anteile.
19. **MOCK:** Quant, Screener, Factor DNA, Ranking, Radar, Strategies, Backtest, AI, Stock Detail.
20. **HYBRID:** Dashboard, Technical, Elliott, Charts, Quant-Marktdatenumfeld.
21. **Öffentliche Tiingo-Daten:** keine Tiingo-Kursreihen gefunden; Twelve-Data-Reihen sind öffentlich.
22. **Feature Gates:** beide Tiingo-Live-Gates aus; Lizenz-Policy zusätzlich restriktiv.
23. **Preview URL:** keine; die vorhandene URL ist öffentlich und darf nicht als geschützte Preview gelten.
24. **Desktop:** Kernrouten laden, keine JS-Fehler im Smoke-Test.
25. **Mobile:** 390-px-Smoke-Test bestanden; Quant-Subnavigation noch interaktiv vertiefen.
26. **CRITICAL:** 3 offen.
27. **HIGH:** 4 offen.
28. **MEDIUM:** 5 offen.
29. **Empfehlung:** **NOT READY**.

## Freigabereihenfolge ohne neue Produktphase

1. Öffentliche Datenaktualisierung stoppen und Twelve-Data-Redistribution klären.
2. Repository privat stellen und GitHub Pages unpublishen.
3. Unveränderten Commit auf geschützten Host deployen; Access-Policy auf Custom-, Anbieter- und Preview-Domains anwenden.
4. Anonymen Abruf aller HTML-/JSON-/Asset-Pfade negativ testen.
5. Authentifizierten Desktop-/390-px-Test wiederholen.
6. Erst danach den Status auf `PROTECTED PREVIEW READY` ändern.
