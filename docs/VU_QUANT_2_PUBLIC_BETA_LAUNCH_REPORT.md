# Vision Universe® Quant 2.0 — Public-Beta-Launch-Bericht

**`PUBLIC_BETA_PRODUCTION = PASS`** — veröffentlicht am 28.09.2026.

Production-Commit `e4435f8883` · Deployment-Lauf
[36410445415](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36410445415) ·
Adresse `https://research.visionuniverse.de/`

| Punkt | Stand |
|---|---|
| Merge | PR #266 → main als `e4435f8883ea2d32f4f24cff0045d4a49d3405c2` |
| Deployment | `package` und `deploy` beide erfolgreich · `pages_build_version = e4435f8883…` · „Reported success!" |
| Release-SHA == main | ja, zum Zeitpunkt der Auslieferung identisch |
| Teststand | **1.968 Tests, 1.968 pass, 0 fail** (110 s) auf `e4435f8883` |
| Produktions-Smoke | **CLEAN** — 34 Ansichten × 2 Breiten = 68 Prüfungen, 0 Fehlschläge, gegen das ausgelieferte Release; zusätzlich der eigene Smoke-Schritt der Auslieferungsstrecke |
| Browser-QA | 61 Prüfungen, 8 Ressourcenbudgets bestanden, 42 Seiten Barrierefreiheit mit **0 Verstößen** |
| Reise-Flächen | 12 von 12 bei 1440 und 390 px |
| Launch-Gates | **14 PASS · 0 FAIL · 0 offen** auf dem ausgelieferten Release |
| Abnahmestichprobe | **22 Titel PASS**, 9 davon im Browser |
| Datenkette | Zeitplan → Refresh → Materialisierung → Auslieferung, jede Stufe ohne Hand |
| Überwachung | `freshness-monitor.yml` (Mo–Fr 06:30 UTC), `vu2-browser-qa.yml` auf jedem PR |

**Zwei Dinge, die dieser Satz nicht behauptet.** Erstens: die Live-Adresse ist aus der
Orchestrierungsumgebung nicht lesbar (CONNECT 403) — geprüft wurde das **identisch ausgelieferte**
Release, aus demselben Commit mit demselben Bauwerkzeug gebaut, nicht die veröffentlichte URL.
Zweitens: main ist nach diesem Launch weitergelaufen (PR #268, Discover-Strategien) und hat
erfolgreich nachdeployt — das Produkt ist live, der Stand von heute ist nicht der letzte.

**Die Auslieferungsstrecke hat sich dabei selbst bewiesen:** zwei fremde Pull Requests (#267
Markt-Validierung, #268 Discover-Strategien) sind an diesem Morgen ohne Zutun gebaut und
veröffentlicht worden — Stufe vier der Datenkette ist damit nicht nur konfiguriert, sondern
beobachtet.

---


**`PUBLIC_BETA_LAUNCH_READY = PASS`**

Stand: 2026-09-28 · Commit `55e3217841` · Branch `claude/quant-2-orchestration-hmuo69`
Messung: `quant/data/product/launch-readiness-v1.json` (`launch-readiness-1.0.0`)

Alle drei Belege stammen vom **gleichen** Commit: der Produktions-Smoke lief gegen das aus
diesem Stand **gebaute** Release, die Suite lief auf diesem Stand, und die Gate-Messung hat
beides geprüft, statt es anzunehmen. **NOT_MEASURED gilt in dieser Messung nicht als PASS.**

**Eine Einschränkung vorweg, damit dieser Satz nicht mehr sagt, als er sagt:** `PASS` gilt für das
Release, das aus diesem Commit entsteht — nicht für das, was in diesem Moment ausgeliefert wird.
Der Default-Branch trägt diese 17 Commits noch nicht (`pages-release.yml` läuft auf Push zum
Default-Branch und auf Pull Requests). Der Schritt nach draußen ist ein Merge, und das ist eine
Owner-Entscheidung, keine Messung.

---

## 1. Was live geht

Vision Universe® Quant 2.0 als geführte Aktienreise über **6.875 kanonische Produkttitel**:

| Fläche | Inhalt |
|---|---|
| Startseite | die zwei Kopffragen, Titel im Blick |
| Aktienseite | Auskunft (Kopfsatz, Dafür / Dagegen / Noch nicht bewertbar), Kurs mit Stichtag, Chart, Setup-Logik, Strategie, Mustervergleich, Methodik |
| Quant-Ansicht | die sieben Eigenschaften mit Belegen, Kursstärke **neben** Anlegerrendite, Branchenvorlage |
| Technik / Elliott | Kursstruktur, Szenarien |
| Screener · Radar · Signale · Strategien · Vergleich · Watchlist · Depot | die vorhandenen Arbeitsflächen |
| Übersicht „Unternehmen untersuchen" | Name, Schlusskurs, Kennzahl je Zeile |
| Methodikseite | 18 Verträge, 13 mit ihrem Zweck in Worten |

**6.857 Titel tragen einen Firmennamen**, 6.482 einen vertragsgeprüften Schlusskurs, 6.296 eine
Faktorauswertung. Die Auskunft je Titel ist **regelbasiert und deterministisch**
(`intelligence-brief-1.0.0`) — keine generative Komponente, keine Prognose, kein Kursziel, kein
Gesamtscore, jede Aussage mit `evidence` auf eine vorhandene Messung.

## 2. Welche Kernfunktionen nachgewiesen arbeiten

Die zwölf P0-Gates, jedes mit seiner Messung:

| # | Gate | Beleg |
|---|---|---|
| 1 | IDENTITY_CORRECTNESS | 6.875 Titel · 4 Flächen · 0 Abweichungen · 0 Kürzel-als-Name · Vertrag `company-naming-1.0.0` · Partition addiert sich · 379 Konflikte benannt, keiner still entschieden |
| 2 | SECURITY_TYPE_SAFETY | 165 belegte Nicht-Aktien (138 ETF, 17 Optionsscheine, 9 Vorzüge, 1 ETN) · 0 im Aktienscreener · Rest fünfmal 0 · 179 mehrdeutige unangetastet |
| 3 | DATA_FRESHNESS | vier Stufen, jede vorhanden; die Kette beginnt auf Zeitplan und läuft ohne Hand weiter (Refresh → Materialisierung auf `workflow_run` → Auslieferung) · Kursstand 3 Tage alt |
| 4 | PRICE_CONSISTENCY | 6.875 Titel · 0 Abweichungen zwischen Verzeichnis, Liste und Aktienseite · Stichtag überall gesetzt |
| 5 | VALUATION_SAFETY | 465 zurückgehaltene Bewertungen · 0 Kennzahlen aus einem anderen Weg · 9 börsenwertabhängige Kennzahlen bewacht |
| 6 | PRODUCT_LANGUAGE | 6.875 Namen + 500 Auskünfte · 0 verbotene Begriffe, 0 interne Codes, 0 Handlungssprache, 0 Aussagen ohne Beleg |
| 7 | MOBILE 390 px | 34 Ansichten · 0 Überlauf · genau eine Überschrift · 0 Wiederherstellungen |
| 8 | DESKTOP 1440 px | dieselben 34 Ansichten, dieselben Nullen |
| 9 | NAVIGATION | 19 Ansichtsziele, 19 bekannt · 19 absolute Pfade, alle im **Release** vorhanden · 0 Wiederherstellungen |
| 10 | ERROR STATES | 88 reduzierte Reisen in der 500er-Stichprobe · jede mit Nutzersatz, ohne internen Code, jede fehlende Station mit Grund |
| 11 | METHODOLOGY TRANSPARENCY | 4 Methodikdateien mit Fassung · Methodikseite im Release · 71 sichtbare Methodikwechsel |
| 12 | REGRESSION GUARDS | **1.968 Tests, 1.968 pass, 0 fail**, 102 s, auf diesem Commit |

## 3. Welche Grenzen bewusst fail-closed bleiben

Jede dieser Grenzen erfüllt die Launch-Regel: **der Grund ist richtig, die Oberfläche erklärt ihn,
es entsteht keine falsche Aussage.**

| Grenze | Umfang | Warum |
|---|---:|---|
| `revisions` (Erwartungstrend) | alle Titel | kein lizenzierter Analystendatenstrom — der siebte Faktor bleibt zu, und ein Gesamtscore wird deshalb **nicht** gebildet |
| Backtest | vollständig | ohne historische Index-Mitgliedschaft kein PIT-Universum |
| Marktregime | vollständig | Owner-Gate offen |
| Börsenwert je Notierung | 465 | der Anteilsbestand lässt sich der gehandelten Zeile nicht zuordnen (`SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING`); die Seite sagt „bewusst nicht genannt", nicht „nicht verfügbar" |
| Börsenwert ohne PIT-Anteilsbestand | 801 | kein zeitpunktgenauer Anteilsbestand |
| Firmenname | 18 | der Anbieter veröffentlicht keinen (`PROVIDER_HAS_NO_NAME`, neuer Versuch ab 2026-10-14); die Zeile sagt „Firmenname nicht veröffentlicht" und **nicht** das Kürzel |
| Faktorauswertung | 579 | zu kurze Historie oder fehlende Kennzahlen; die Seite nennt die benötigten und die vorhandenen Handelstage |
| Aktienurteil über Nicht-Aktien | 165 | belegte Gattung; Kurs, Chart und Suche bleiben, die Aktienanalyse entfällt mit Klartextbegründung |
| Identität bei Namenskonflikt | 379 | zwei Quellen nennen verschiedene Gesellschaften; die Seite zeigt **beide** Namen und entscheidet nicht |
| Mehrdeutige Gattungen | 179 | „Trust", „Fund", „Index", „Portfolio" sind keine Belege — „American Assets Trust" ist ein REIT |
| Umbenennung gegen Kürzel-Wiederverwendung | Gruppe E = 0 | lokal nicht trennbar (AAMI gegen AEC); eine Vermutung wäre eine erfundene Identität |

## 4. Was ausdrücklich POST_LAUNCH ist

Nach der Anti-Perfektionsregel bewusst **nicht** vor dem ersten Release:

1. Zusätzliche Datenabdeckung und ältere Sondertitel.
2. Kosmetische Altseiten — darunter die Schreibweise „Asml Holding Nv" gegen „ASML Holding" in
   einer Altquelle.
3. Vollständige Namen für **jedes** Wertpapier (die 18 und die 127 außerhalb des Produkts).
4. Weitere Quant-Methodik, neue Faktorkomponenten, neue Muster- und Strategiefamilien.
5. Bessere Revisions-Daten, vollständiges Backtesting, Marktregime.
6. Seltene Randfälle **ohne** falsche Aussage — etwa die 2.206 Instrumente, die nicht beide
   Namensebenen haben.
7. Abdeckungsoptimierung ohne Nutzerwirkung.
8. Die Klasse E des Namensvertrags, sobald eine Kürzel-Historie mit Gültigkeitsdaten vorliegt.
9. Die Frage, ob wiederverwendete Kürzel (AEC-Art) zwei Firmenhistorien in einer Kursreihe
   verbinden — als Identitätsrisiko notiert, noch nicht quantifiziert.

## 5. Teststand

**1.968 Tests, 1.968 pass, 0 fail**, 102 s, Commit `55e3217841`
(`.launch/test-suite.json`, `test-suite-1.0.0`).

Jede in diesem Zyklus neu eingeführte Regel ist **einzeln sabotiert** und hat ausgelöst: die
Faktorbedingung, die Nicht-Aktien-Markierung, die Gattungsregel, der Name gegen das Verzeichnis,
der Kopfsatz in der Sprachprüfung, die reduzierte Reise. Zusätzlich hält ein Test die **Form** der
Auskunft fest (`headline.sentence`, `kind === "change"`, `methodologySwitch.active`, kein
`sources.shape`), weil vier meiner eigenen Prüfungen grün waren, ohne etwas zu prüfen.

## 6. Smoke-Stand

**PRODUCTION SMOKE CLEAN** · 34 Ansichten × 2 Breiten = 68 Prüfungen, 0 Fehlschläge, gegen das
gebaute Release (`production-smoke-1.0.0`, Commit `55e3217841`).

Darin neu: ein belegter ETF (AAAC), ein Vorzugspapier (ABR-P-D), ein Identitätskonflikt (AACI),
eine zurückgehaltene Bewertung (ACGL), ein datenarmer Titel (ABTC) und eine Bank mit eigener
Branchenvorlage (ABCB) — vorher sah der Smoke von 22 Abnahmetiteln **drei**, und zwar genau die,
bei denen alles da ist.

## 7. Datenaktualität

| Stufe | Workflow | ohne Hand |
|---|---|---|
| Refresh | `market-data-refresh.yml` | Zeitplan (Mo–Fr 22:30 UTC) + Push |
| Ablage | `history-store-sync.yml` | Hebel — der Refresh schiebt seine Ergebnisse selbst in die Ablage |
| Materialisierung | `product-intelligence-materialization.yml` | `workflow_run` nach dem Refresh + Push |
| Auslieferung | `pages-release.yml` | Push + `workflow_run` + Zeitplan |

Kursstand **2026-09-25** (3 Tage), Verzeichnis am 2026-09-28 gebaut — die Kette läuft nicht
rückwärts. Überwachung aktiv: `freshness-monitor.yml`, `vu2-browser-qa.yml`.

## 8. Launch-Abnahmestichprobe

**22 Titel, PASS** (`acceptance-sample-1.0.0`), 9 davon im Browser geprüft. Neun namentlich
genannte Titel plus dreizehn Rollen, jede über ein Prädikat besetzt und nicht von Hand:

AAPL · MSFT · NVDA · JPM · GOOG · GOOGL · T · SO · AGNC · ABCB (Bank) · ABR (REIT) ·
AACG (Small Cap) · AACO (jung) · ABTC (datenarm) · AAAC (ETF) · ABR-P-D (Vorzug) ·
ACGL (Bewertung zurückgehalten) · AACI (Identitätskonflikt) · A (mit Setup) · AACP (ohne Setup) ·
AA (mit Strategie) · AADX (ohne Strategie).

Je Titel neun Prüfungen: Name, Gattung oder ehrlich unklar, Kurs mit Stichtag, verständliche
Zusammenfassung, keine doppelte Hauptaussage, kein Widerspruch, keine Aussage ohne Beleg, richtige
reduzierte Reise, Methodik mit Fassung, keine Station ohne Grund.

GOOG und GOOGL sind absichtlich beide dabei: sie zeigen, dass zwei Klassen desselben Emittenten
unterscheidbar bleiben („Alphabet Inc." gegen „Alphabet Inc. Class A").

## 9. Verbleibende bekannte Risiken

1. **Nicht ausgeliefert.** `PASS` gilt für das Release aus diesem Commit; der Default-Branch trägt
   ihn noch nicht. Der Merge ist eine Owner-Entscheidung.
2. **Die Live-Domain ist aus dieser Umgebung nicht lesbar.** Geprüft wurde das gebaute Release,
   nicht die veröffentlichte Adresse. Dieselbe Grenze gilt seit M27.
3. **`data.sec.gov` ist gesperrt** (CONNECT 403): 161 von 183 Zuordnungsfällen und die
   klassenspezifischen Anteilsbestände bleiben offen. Betrifft Abdeckung, nicht Korrektheit.
4. **Wiederverwendete Kürzel.** Ein Kürzel, das nacheinander zwei Gesellschaften gehörte, kann
   zwei Kurshistorien in einer Reihe verbinden. Als Risiko benannt, nicht gemessen.
5. **13 von 22 Abnahmetiteln sind nicht im Browser geprüft** — nur über den Dienst. Der Smoke
   deckt die Lagen ab, nicht jeden Titel.
6. **Die Abnahmestichprobe ist datenabhängig.** Die Rollen werden je Lauf über Prädikate besetzt;
   ändern sich die Daten, kann ein anderer Titel eine Rolle übernehmen. Das ist beabsichtigt — eine
   feste Liste würde messen, was ich sehen will.
7. **54 von 500 Titeln beantworten höchstens 3 der 11 Reisefragen.** Das sind datenarme Titel und
   belegte Nicht-Aktien; die Seite sagt bei jedem, warum. Es bleibt bewusst so.
8. **Ein Owner-Gate ist offen** und blockiert den Launch nicht: die `total_debt`-Konzeptzuordnung.

## 10. Urteil

**`PUBLIC_BETA_LAUNCH_READY = PASS`**

12 von 12 P0-Gates bestanden, 2 von 2 P1-Prüfungen bestanden, 0 offen, 0 rot — belegt durch einen
sauberen Browser-Smoke gegen das gebaute Release, eine grüne Suite und eine
Abnahmestichprobe ohne Befund, alle drei auf Commit `55e3217841`.

Der nächste Schritt ist kein Bau, sondern eine Entscheidung: der Merge auf den Default-Branch.

Wiederholbar nachprüfen:

```
node scripts/vu2/build-release.mjs --output=<verzeichnis>
node scripts/vu2/production-smoke.mjs <verzeichnis> --report .launch/production-smoke.json
node scripts/vu2/run-suite-report.mjs
node scripts/vu2/measure-launch-readiness.mjs --release <verzeichnis>
node scripts/vu2/measure-acceptance-sample.mjs
```
