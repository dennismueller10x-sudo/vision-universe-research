# VISION UNIVERSE® — Protected Hosting Migration & Data Hygiene

## Phase 0 Audit und Implementierungsbericht · 8. September 2026

## Entscheidung

**READY FOR PRIVATE PREVIEW SETUP** — der auszuliefernde Baum ist nach den hier
beschriebenen Änderungen frei von den identifizierten Twelve-Data-Kursreihen und
den daraus erzeugten symbolbezogenen Technical-/Backtest-Ausgaben. Die Website
selbst ist damit noch **nicht privat**. Repository, GitHub Pages, Custom Domain,
GitHub Raw und GitHub API bleiben bis zu einer vom Nutzer freigegebenen
Hosting-/Visibility-Migration öffentlich.

Ausgangspunkt war `origin/main @ 39335ad3e7fefbc93a0916ccae1b3c42c9790388`.
Beim Abschluss-Fetch war `origin/main` auf
`e737ace` (PR #51/#52, Realtime-/Preview-Integrationsstand) vorgerückt. Der
Hygiene-Commit wurde konfliktfrei darauf rebased; der aktuelle technische
Referenzstand dieses Berichts ist deshalb
`origin/main @ e737ace` plus der nachgelagerte Hygiene-Commit.

Die Data-Hygiene-Implementierung wurde als `25ae803` nach `main` veröffentlicht.

## 1. Aktueller Hostingstatus und öffentliche Bypässe

| Prüffeld | Befund |
|---|---|
| Repository | `dennismueller10x-sudo/vision-universe-research`, am Prüftag **Public** |
| Pages-Quelle | GitHub Pages aus dem Repository; kein separater privater Build-Host im Repository konfiguriert |
| Custom Domain | `research.visionuniverse.de`, festgelegt durch `/CNAME` |
| GitHub Pages | öffentlich, ohne serverseitige Authentifizierung |
| Custom-Domain-Dateipfad | vor der Bereinigung HTTP 200 für HTML und die geprüften JSON-/Kursdateien |
| GitHub Raw | vor der Bereinigung HTTP 200 für den geprüften Referenzkurs |
| GitHub REST API | ohne Anmeldung HTTP 200 für das öffentliche Repository |
| `github.io` | auf die Custom Domain umgeleitet; der Redirect ist kein Zugriffsschutz |
| Alternative Hosts | keine Netlify-, Vercel-, Firebase-, Cloudflare-, Wrangler-, `.htaccess`- oder `.openai/hosting.json`-Konfiguration gefunden |

Der Redirect von `github.io` schließt keinen Bypass: Raw, GitHub API, Clone,
Download und Git-Historie bleiben bei einem öffentlichen Repository unabhängig
von der Custom Domain zugänglich. Ein vorgeschalteter Schutz nur auf
`research.visionuniverse.de` wäre deshalb unvollständig.

## 2. Gefundene Twelve-Data-Daten

Die Aussage aus dem vorigen Audit wurde selbst verifiziert und erweitert.

### Rohdaten

- `quant/data/market/daily/ref_<SYMBOL>.json`: **15 Dateien**, je 400
  unbereinigte EOD-Bars vom 3. Februar 2025 bis 4. September 2026, zusammen rund
  1,36 MB. Symbole: `AAPL`, `AMZN`, `AVGO`, `CAT`, `GOOGL`, `JNJ`, `JPM`, `KO`,
  `META`, `MSFT`, `NVDA`, `PG`, `SPY`, `UNH`, `XOM`. Konsument:
  `quant/markt/app.js`.
- `dashboard/data/market_data.json`: **13 Symbole** mit meist 1.500
  splitbereinigten EOD-Bars (ARM 747, PLTR 1.490): `NVDA`, `AVGO`, `AMD`, `TSM`,
  `ASML`, `MU`, `MRVL`, `ARM`, `PLTR`, `MSFT`, `AMZN`, `SPY`, `QQQ`; rund
  3,44 MB. Konsumenten: Dashboard-Charting, Guide und Technical-Build.
- `quant/data/technical/instruments/*.json`: 13 reale Bundles derselben
  Dashboard-Symbole enthielten neben Derived Intelligence auch die OHLCV-Reihen.

### Abgeleitete Daten

- `dashboard/data/technical_scores.json` und
  `dashboard/data/backtest_results.json` enthielten symbolbezogene, aus diesen
  Twelve-Data-Reihen erzeugte Werte.
- Reale Technical-Instrumente, Walk-Forward-Evidenz und deren Snapshots waren
  ebenfalls aus den Twelve-Data-Reihen abgeleitet.

Eine Freigabe für öffentliche Speicherung/Redistribution wurde nicht
nachgewiesen. Daraus wird ausdrücklich keine Rechtsbehauptung über den Anbieter
abgeleitet; Vision Universe wendet bis zur Klärung den strengsten technischen
Default an.

## 3. Implementierte Data Hygiene

- Alle 15 `quant/data/market/daily/ref_*.json` entfernt.
- `dashboard/data/market_data.json` durch einen kleinen, expliziten
  `UNAVAILABLE`-Datensatz ohne Symbolreihen ersetzt.
- Reale Technical-Bundles und -Snapshots entfernt; Technical neu aus dem
  synthetischen Modelluniversum erzeugt: 13 Mock-Bundles, 13 Snapshots, 0 reale
  Symbole.
- Symbolbezogene Dashboard-Technical-, Scenario- und Backtest-Ausgaben durch
  `UNAVAILABLE`-Platzhalter ersetzt.
- Twelve-Data-Fetcher schreiben nur noch unter `.market-cache/`; ein Ziel
  außerhalb dieses Verzeichnisses wird abgewiesen.
- Beide Market-Workflows sind nur noch manuell, haben `contents: read`, committen
  nichts und laden keine Providerdaten als Artefakt hoch.
- CI-Guard `scripts/market/assert-public-data-hygiene.mjs` blockiert erneute
  Rohbars, reale Technical-Bars und symbolbezogene Provider-Derivate in den
  bekannten öffentlichen Pfaden.
- Die UI zeigt `UNAVAILABLE` statt Nullwerten oder Mock-Kursen für reale Ticker.

Die Entfernung aus dem aktuellen Baum löscht **nicht** automatisch alte Git-
Objekte, Forks, Caches oder bereits heruntergeladene Kopien. Solange das
Repository öffentlich ist, bleiben ältere Commits grundsätzlich ein separater
Exposure-Pfad. Eine History-Rewrite-Entscheidung wurde wegen ihrer destruktiven
Auswirkungen nicht eigenmächtig getroffen.

## 4. Tiingo-Hygiene

| Prüffeld | Ergebnis |
|---|---|
| Rohkursreihen committed | nein |
| Rohkurse in Reports/Logs | keine gefunden; Runtime-Beleg enthält Capability-Metadaten und Anzahlen, keine OHLCV-Werte |
| Secret im Browser/Repo | keines gefunden |
| `ENABLE_LIVE_MARKET_DATA` | `false` |
| `ENABLE_PUBLIC_LIVE_MARKET_DATA` | `false` |
| Public Display Policy | `allowed: false`, `LEGAL_REVIEW_REQUIRED` |
| API-Key aktiviert Public Display | nein; Key und Display-Gates sind getrennt |

Die vorhandene Runtime-Verifikation belegt Historical EOD, Split Adjustment,
Total Return, Splits, Dividenden und einen Intraday-Abruf. Der inzwischen auf
`origin/main` gemergte Realtime-Architekturstand implementiert serverseitige
Transport-, Fallback-, Extended-Hours- und Chart-Bausteine, belegt mit dem
aktuellen Konto aber weiterhin **nicht** IEX REST Realtime, IEX WebSocket oder
Consolidated Realtime. `REALTIME_READY` ist nicht gesetzt, beide Gates bleiben
aus und der Live-Chart ist an keine ausgelieferte Seite angebunden. Diese
Hygiene-Phase hat keinen Runtime-Test gestartet und die Realtime-Architektur
nicht erweitert.

## 5. SEC-Dateiklassifikation

| Klasse | Pfad | Committed / ausgeliefert | Zweck |
|---|---|---|---|
| SOURCE | `quant/data/sec/raw/`, `.sec-cache/`, `.quant-state/` | nein / nein | interne Abruf- und Arbeitsdaten, gitignored |
| CANONICAL | `quant/data/sec/canonical/*.json` | ja / ja | 5 normalisierte Company-Fact-Datensätze |
| GENERATED | `canonical_index.json`, `coverage_matrix.json`, `pit_gates.json`, `primary_source_audit.json`, `universe_resolution.json` | ja / ja | Index, Coverage und Qualitäts-/Gate-Berichte |
| PUBLIC UI DATA | `quant/data/sec/inspector/*.json`, `inspector_index.json` | ja / ja | Data Inspector mit Zeilenprovenienz |
| INTERNAL CACHE | Factbook-/Cache-Pfade | nein / nein | Laufzeit-/Qualitätsarbeitsstand |

Echte Fundamentals sind für `AAPL`, `JPM`, `MSFT`, `NVDA`, `XOM` vorhanden.
Die normalisierten Dateien enthalten zusammen 4.271 Facts. Strukturierte
Quartalsjahre reichen bei AAPL/JPM/XOM ab 2007, bei MSFT/NVDA ab 2008 bis in den
aktuellen EDGAR-Datenstand. Kanonische Metric IDs:

| Symbol | Facts | Metric IDs |
|---|---:|---|
| AAPL | 962 | accruals, capex, freeCashFlow, grossProfit, interestExpense, investedCapital, netDebt, netIncome, operatingIncome, revenue, sharesOutstanding, totalAssets, totalEquity |
| JPM | 619 | accruals, interestExpense, netIncome, revenue, sharesOutstanding, totalAssets, totalEquity |
| MSFT | 998 | wie AAPL |
| NVDA | 846 | wie AAPL |
| XOM | 846 | wie AAPL ohne grossProfit und operatingIncome |

Der Data Inspector konsumiert die Inspector-Dateien und die generierten
Coverage-/Gate-Berichte. Der kanonische Adapter und die Prüfskripte konsumieren
die Canonical-Dateien. Der VU Quant Score konsumiert diese SEC-Facts derzeit
**nicht**; vorhandene SEC-Daten sind daher keine Behauptung einer Real-Data-
Migration des Quant Scores.

## 6. Provenienz und Silent-Fallback

Behoben wurden:

- der pauschale Footer „sämtliche Daten synthetisch“;
- explizite Chips für `MODE`, `FORM`, `SOURCE` und bei Elliott `BETA`;
- SEC Data Inspector: `REAL / PRECOMPUTED / SEC`;
- Technical/Elliott: `MOCK / PRECOMPUTED / MOCK / BETA` oder sichtbares
  `UNAVAILABLE` für reale Providerdaten;
- Dashboard und Guide: Provenienz aus den geladenen Metadaten;
- Charting/Guide/Quant Market: sichtbares `UNAVAILABLE`, kein stiller
  Mock-/Null-Fallback;
- irreführende „Live“-Aussagen für quartalsweise SEC-13F-Snapshots und die
  pauschale Twelve-Data-Guide-Aussage.

`REAL` bezeichnet eine echte Primär-/Providerquelle, `MOCK` ein synthetisches
Modell, `HYBRID` sichtbar getrennte Quellen, `PRECOMPUTED` die
Verarbeitungsform und `BETA` den Methodikreifegrad. Diese Dimensionen werden
nicht mehr gegeneinander ausgetauscht.

## 7. Data-Location-Zielmatrix

| Data Class | Public Repo? | Private Storage? | Public UI? | Source | Licensing Status |
|---|---|---|---|---|---|
| Tiingo EOD | nein | ja, geschützter Cache/Store | nein | TIINGO | LEGAL_REVIEW_REQUIRED |
| Tiingo Intraday | nein | nur bei internem Gate | nein | TIINGO/IEX | LEGAL_REVIEW_REQUIRED |
| Tiingo Corporate Actions | nein | ja, geschützt | nein | TIINGO | LEGAL_REVIEW_REQUIRED |
| Twelve Data OHLCV | nein | ja, `.market-cache`/später Private Store | nein | TWELVE DATA | REDISTRIBUTION_UNCONFIRMED |
| SEC Raw | nein | ja, Cache | nein | SEC | öffentliche Primärquelle; Storage minimieren |
| SEC Canonical | derzeit ja; nach Migration private bevorzugt | ja | intern ja | SEC | PUBLIC_DOMAIN laut Datensatz |
| Technical Bundles | nur reine Mock-Fixtures | ja für Real-Input-Bundles | nur Mock oder lizenziert | DERIVED | für Real-Input LEGAL_REVIEW_REQUIRED |
| Quant Mock Data | ja | optional | ja, klar MOCK | MOCK | synthetisch/intern erzeugt |
| Derived Scores | nur Mock bzw. explizit UNAVAILABLE | ja für Provider-Input | erst nach Review | OTHER/DERIVED | LEGAL_REVIEW_REQUIRED |
| Elliott Outputs | nur Mock + BETA | ja für Real-Input | Mock-Beta ja; Real nein | DERIVED | Real-Input LEGAL_REVIEW_REQUIRED |

Raw Data und Derived Intelligence bleiben getrennte Klassen. Ein eigener Score,
Trend State, Elliott Count oder Szenario ist nicht automatisch frei
redistributierbar, nur weil die Berechnung intern erfolgt.

## 8. Private Preview ohne Cloudflare?

**NO — nicht mit der verifizierten bestehenden Infrastruktur.**

- Ein öffentliches Repository stellt Dateien über Raw/API/Clone bereit.
- GitHub Pages bietet im vorhandenen Setup keine vorgelagerte Authentifizierung.
- Privates GitHub Pages Access Control setzt eine private/interne
  Organisations-Project-Site auf GitHub Enterprise Cloud voraus; eine solche
  Organisation/Capability ist im Projekt nicht vorhanden.
- Ein bestehender Provider mit Basic Auth, ein passwortgeschützter Static Host
  oder ein Actions-Deploymentziel ist im Repository nicht konfiguriert.

Ein JavaScript-Passwort, Route Guard, Overlay, robots.txt oder nur ein
Custom-Domain-Proxy würde die Raw-/API-/History-Bypässe nicht schließen.

## 9. Zielarchitektur und Decision Gate

Mangels eines nachgewiesenen vorhandenen Private Hosts ist Cloudflare
**klar empfohlen und unter den verifizierten Optionen erforderlich**, aber
nicht die einzig denkbare Technik. Ein vom Nutzer benannter bestehender Host mit
echter serverseitiger Authentifizierung wäre eine gleichwertig zu prüfende
Alternative.

Empfohlener Zielpfad:

`PRIVATE GITHUB REPO → BUILD/DEPLOY → CLOUDFLARE PAGES → CLOUDFLARE ACCESS → research.visionuniverse.de`

Notwendige Nutzerschritte vor Umsetzung:

1. Entscheidung für Cloudflare oder Benennung eines vorhandenen Hosts mit
   serverseitiger Authentifizierung.
2. Repository-Sichtbarkeit separat freigeben; Auswirkungen auf Pages, Actions,
   Branch Protection und Integrationszugriffe akzeptieren.
3. Bei Cloudflare: Account/Zone/Pages-Projekt anlegen bzw. freigeben, GitHub-
   Zugriff auf das private Repository autorisieren und Access-Allowlist oder OTP
   festlegen.
4. Nur `research.visionuniverse.de` migrieren; keine MX-Records und keine andere
   Vision-Universe-Subdomain verändern.
5. Produktions- und Preview-Hostnamen einschließlich `*.pages.dev` und Preview-
   Deployments durch Access schützen oder deaktivieren.
6. Vor DNS-Umschaltung TTL/Record sichern, danach unauthentifizierte HTML-/JSON-
   Tests durchführen.

Rollback: bisherigen Research-CNAME/TTL vorab dokumentieren; bei Fehlschlag den
einzigen Research-Record zurücksetzen und den letzten sanitisierten statischen
Build erneut bereitstellen. Keine andere Subdomain ist Teil des Rollbacks.

## 10. Auswirkung eines privaten Repositories

- Der aktuelle öffentliche Pages-Pfad kann ausfallen; private Pages sind nicht
  automatisch durch „Repo private“ gelöst.
- Actions bleiben grundsätzlich möglich, Kontingente und Secret-/Environment-
  Regeln sind jedoch neu zu prüfen.
- Branch-Protection-Regeln müssen nach der Visibility-Änderung verifiziert
  werden.
- Custom-Domain-Zuordnung und Pages-Quelle können sich ändern.
- Codex, Claude und andere Integrationen benötigen expliziten Zugriff auf das
  private Repository.
- Alte öffentliche Git-Historie, Forks und Caches werden nicht durch die reine
  Visibility-Umschaltung aus der Welt gelöscht; ein History-Remediation-Plan ist
  separat zu entscheiden.

## 11. Tests

### Vor Änderungen

- Node Quant: 444/444 bestanden.
- SEC/Python: 249 ausgeführt, 247 bestanden, 1 übersprungen, 1 bekannter
  Windows-Raw-Byte-Digestfehler; der Git-Blob-Digest selbst stimmt.
- Academy: 8/8 bestanden.
- Secret Guard: bestanden.

### Nach Änderungen

- Node Quant: **571/571 bestanden** (einschließlich des inzwischen gemergten
  Realtime-/Extended-Hours-Teststands).
- SEC/Python: **249 ausgeführt, 248 bestanden, 1 übersprungen, 0 fehlgeschlagen**.
  Der bereits im Vorlauf sichtbare Windows-CRLF-Digestfehler wurde durch eine
  plattformstabile Hash-Berechnung behoben; die SEC-Normalisierungslogik und
  ihr Versionsstempel wurden nicht geändert.
- Academy: **8/8 bestanden**.
- Technical-Verify: **13/13 Mock-Bundles reproduziert**, 13 Snapshots.
- Secret Guard und Public-Data-Hygiene-Guard: bestanden.
- Browser Desktop: Homepage, Dashboard, Chart-Unavailable, Technical und SEC
  gerendert; Provenienz sichtbar, keine Console Errors in den geprüften Seiten.
- Browser 390 px: Chart-Unavailable und Technical/Elliott gerendert, keine
  horizontale Body-Überbreite und keine Console Errors.

### Nach Veröffentlichung von `25ae803`

- `research.visionuniverse.de/quant/data/market/daily/ref_AAPL.json`: HTTP 404.
- derselbe Pfad über `raw.githubusercontent.com/.../main/...`: HTTP 404.
- `dashboard/data/market_data.json`: HTTP 200, `not_generated`, 0 Symbole,
  `UNAVAILABLE`, `display_allowed=false`.
- `dashboard/data/technical_scores.json`: derselbe sichere Status.
- `dashboard/data/backtest_results.json`: derselbe sichere Status.
- Die Website selbst bleibt ohne Authentifizierung öffentlich erreichbar; dies
  ist der unveränderte CRITICAL Decision Gate, kein geschütztes Preview.

## 12. Abschluss nach Priorität

### CRITICAL offen

- Private Preview ist noch nicht aktiv: Repository, Pages, Custom Domain,
  Raw/API und Historie sind öffentlich. Externe Änderung ist ausdrücklich am
  Nutzer-Decision-Gate gestoppt.

### HIGH offen

- Hosting-/Access-Entscheidung und Allowlist fehlen.
- Altdaten bleiben in öffentlicher Git-Historie/Forks/Caches grundsätzlich
  adressierbar; Remediation muss vor einer belastbaren Vertraulichkeitsaussage
  entschieden werden.
- Öffentliche FMP-/Finnhub-Aggregate und manuell recherchierte Bestandsdaten
  wurden als eigener Lizenz-Review-Punkt identifiziert; sie sind keine
  Twelve-/Tiingo-Rohkursreihen, aber ihre öffentliche Weitergabe darf nicht
  pauschal behauptet werden.

### MEDIUM offen

- GitHub Pages „Enforce HTTPS“ und finaler DNS-/TLS-Zustand bei der Migration
  erneut prüfen.
- Provenienz-Taxonomie auf ältere eigenständige Seiten außerhalb Dashboard,
  Quant, Guide und SEC systematisch ausrollen.
- Historische Architekturdokumente enthalten bewusst frühere Zustände; die
  aktuelle Source of Truth ist dieser Bericht plus Code/Tests.

## 13. Geforderter 24-Punkte-Status

1. origin/main: gestartet bei `39335ad3`, vor Integration aktualisiert auf `e737ace`; Data-Hygiene veröffentlicht als `25ae803`.
2. Hosting: öffentliche GitHub Pages aus öffentlichem Repository.
3. Bypässe: Custom Domain, Raw, API, Clone/Download und Git-Historie.
4. Twelve Data öffentliche Dateien: ja, selbst bestätigt.
5. Dateien: 15 Quant-EOD-Dateien, Dashboard-Market-JSON, 13 reale Technical-Bundles/Snapshots sowie abgeleitete Dashboard-Ausgaben.
6. Bereinigt: ja, als `25ae803` veröffentlicht; History-Remediation bleibt getrennt.
7. Tiingo Public Leakage: keine Rohkursreihe/kein Secret gefunden; nur Capability-Metadaten.
8. SEC Public Data: Canonical + Inspector für fünf Symbole; Raw/Cache nicht committed.
9. Provenance Bug: behoben.
10. Mock/Real: getrennt; kein stiller Kurs-Fallback.
11. Secrets: Guard grün, keine Browser-Secrets.
12. Repo öffentlich: ja.
13. Private Preview ohne Cloudflare/externen Host: **NO**.
14. Ohne Cloudflare nur mit neuer, konkret bereitgestellter serverseitig geschützter Hosting-Capability oder GitHub Enterprise Cloud Private Pages.
15. Grund: bestehendes Pages/Public-Repo-Modell besitzt keine Auth-Grenze und mehrere Origin-Bypässe.
16. Cloudflare: klar empfohlen; unter den nachgewiesenen realistischen Optionen erforderlich.
17. Ziel: Private Repo → Build/Deploy → Cloudflare Pages → Access → Research-Subdomain.
18. User-Aktionen: ja, Visibility, Cloudflare/Host, GitHub-Verbindung, Allowlist/OTP und DNS.
19. Tests vorher: 444 Node grün, 247/249 Python plus Skip und bekannter Digestbefund, 8 Academy grün, Secrets grün.
20. Tests nachher auf aktuellem Main: 571/571 Node, 248 bestanden + 1 Skip Python, 8/8 Academy, Technical-Verify und beide Guards grün.
21. CRITICAL: öffentliche Hosting-/Repo-/History-Exposition.
22. HIGH: Access-Entscheidung, History-Remediation, Lizenzreview weiterer Provideraggregate.
23. MEDIUM: HTTPS/DNS-Endkontrolle und Provenienz-Rollout auf Legacy-Seiten.
24. Empfehlung: **READY FOR PRIVATE PREVIEW SETUP**, aber **PRIVATE PREVIEW NOCH NICHT AKTIV**.
