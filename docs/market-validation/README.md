# Markt-Validierung – historische Prüfung der Einordnung

Status: **NOT_CERTIFIED** · interne Prüfung · keine Renditeaussage, keine Produktanzeige

Frage: Unterscheiden sich die Folgephasen je Einordnungsstufe der Seite
„Märkte“ (Defensiv … Breit konstruktiv)? Wenn die Stufen Aussagekraft haben,
müssen nach „Defensiv“ häufiger deutliche Rückgänge folgen als nach
„Konstruktiv“.

Ergebnis im Detail: [`market-pulse-validation.json`](market-pulse-validation.json).
Zusammenfassung: Abschnitt „Ergebnisse“ unten.

## Ergebnisse (Lauf vom 28.09.2026, Daten bis 31.08.2026 bzw. 25.09.2026)

**Kurz:** Die Einordnung ist ein belastbares **Risiko-Signal**, aber **kein
Rendite-Signal**. Je niedriger die Stufe, desto häufiger folgten deutliche
Rückgänge – über 97 Jahre, in jedem Teilzeitraum und außerhalb der
Stichprobe. Die mittlere Folgerendite steigt mit der Stufe dagegen nicht.

### B – US-Markt 1929–2026 (French, Gesamtrendite, Variante ohne Breite), 3 Monate

| Stufe | Anteil der Tage | Deutlicher Rückgang (≤ −10 %) | 95 %-Intervall | Ø Rendite | positiv |
|---|---|---|---|---|---|
| Defensiv | 14,6 % | **27,0 %** (n = 63) | 17,6–39,0 % | +3,9 % | 54 % |
| Vorsichtig | 22,9 % | 19,8 % (n = 86) | 12,7–29,4 % | +1,9 % | 69 % |
| Selektiv | 19,6 % | 13,5 % (n = 74) | 7,5–23,1 % | +2,6 % | 62 % |
| Konstruktiv | 42,9 % | **7,7 %** (n = 182) | 4,6–12,5 % | +2,8 % | 70 % |

- Kontrast Stufen 0–1 gegen 3–4: 1 Monat 10,5 % gegen 1,0 %, 3 Monate
  22,8 % gegen 7,7 % – beide signifikant nach Benjamini-Hochberg
  (p < 0,001). Nach 6 Monaten nicht mehr (27,4 % gegen 19,8 %, p = 0,25):
  das Signal wirkt kurz- bis mittelfristig.
- Rangfolge Rückgangsrisiko über die Stufen: Spearman 1,0 (1 und 3 Monate).
  Rangfolge der Rendite: −0,4 bis −0,1 – defensive Phasen enden oft in
  kräftigen Erholungen.
- **Außer-Stichprobe 1929–2000** (vor den Daten, die bei der Formulierung
  der Regeln bekannt waren), 3 Monate: Defensiv 24,0 %, Vorsichtig 20,6 %,
  Selektiv 15,4 %, Konstruktiv 6,5 % – dieselbe Ordnung.
- Teilzeiträume (3 Monate, Defensiv gegen Konstruktiv): 1927–45 35 % gegen
  4 %, 1946–72 17,6 % gegen 6,6 %, 1973–2000 15,4 % gegen 7,7 %,
  2001–heute 38,5 % gegen 11,4 %.
- **Branchen-Breite** (49 Branchen als Näherung) ändert fast nichts: Wenn
  der Trend positiv ist, ist die Branchen-Breite meist ebenfalls breit
  („Breit konstruktiv“ 41,4 %, „Konstruktiv“ nur 1,4 % der Tage). Die
  Produkt-Breite aus Einzelaktien ist feiner; ihr Beitrag lässt sich
  historisch mangels survivorship-freier Einzeltiteldaten nicht prüfen.

### A – Repository-Tracker 2001–2026

Gleiche Aussage auf den echten Tracker-Kursen: deutlicher Rückgang in
3 Monaten 29,7 % (Stufen 0–1) gegen 6,7 % (Stufen 3–4), signifikant;
Rendite-Unterschiede nicht signifikant. Im Zeitraum 2010–2019 kehrt sich die
Rendite-Ordnung um (schnelle Erholungen).

### C – Makro-Zusatz

| Bedingung | Befund |
|---|---|
| Sahm-Regel in Echtzeit ≥ 0,5 | Innerhalb „Defensiv“ deutlich mehr Rückgänge, wenn die Arbeitslosigkeit steigt: 54,5 % gegen 16,7 % (1960–2026, n = 11 gegen 24, p = 0,021) und 83 % gegen 11 % (2001–2026, n = 6 gegen 9, p = 0,005). **Nach Mehrfachtest-Korrektur nicht signifikant** – ein Hinweis, kein Nachweis. In den übrigen Stufen kein Effekt. |
| Zinskurve 10J–2J / 10J–3M invertiert | Keine zusätzliche Trennung; eher weniger Rückgänge in den folgenden 3 Monaten. Die Inversion läuft Rezessionen typischerweise 6–24 Monate voraus und passt nicht zu einem 3-Monats-Fenster. |

### Veranschaulichung (kein Produkt, keine Renditeaussage)

Investiert nur ab einer Mindeststufe, sonst Geldmarkt (French-Zins), ein Tag
Verzug, ohne Kosten und Steuern, 1929–2026:

| Regel | CAGR | Volatilität | Max. Drawdown | investiert |
|---|---|---|---|---|
| Kaufen und halten | 9,8 % | – | −84,1 % | 100 % |
| ab „Vorsichtig“ | 9,7 % | 13,4 % | −60,8 % | 85 % |
| ab „Selektiv“ | 9,2 % | 9,5 % | −35,3 % | 63 % |

Auf den Repository-Trackern 2001–2026 (Kurs ohne Ausschüttungen, Bargeld
ohne Zins): ab „Selektiv“ 4,1 % gegen 7,4 % CAGR, Max. Drawdown −20,1 %
gegen −56,5 %. Die Einordnung kostet also Rendite und spart Tiefe – sie ist
kein Timing-Werkzeug.

### Grenzen

- Die Tracker-Rollen in B sind Näherungen (Portfolios statt ETFs); die
  Branchen-Breite ist gröber als die Produkt-Breite.
- Unabhängige Stichproben sind klein (n = 37–182 je Stufe); die Intervalle
  sind entsprechend breit.
- Geprüft wird die Regel, wie sie heute konfiguriert ist; Kosten, Steuern
  und Umsetzbarkeit sind nicht berücksichtigt.
- Status NOT_CERTIFIED: Für Renditeaussagen gilt weiter die Verfassung
  (nur zertifizierte Backtests).

## Empfehlung zur Anzeige (Entscheidung beim Eigentümer)

Vertretbar wäre – nach Freigabe und Lizenzklärung mit Prof. French –
höchstens ein nüchterner Methodenhinweis ohne Zahlen zur Rendite, z. B.:
„Historisch folgten auf defensive Einordnungen häufiger deutliche Rückgänge
als auf konstruktive (US-Markt seit 1929). Das ist keine Prognose.“
Nicht vertretbar: Rendite- oder Strategiekennzahlen, Timing-Versprechen.
Bis zur Entscheidung wird nichts auf der Seite angezeigt.

## Was wiederverwendet wird (nur gelesen, nichts verändert)

| Baustein | Verwendung |
|---|---|
| `quant/engines/multi-asset/market-pulse.js` | Einordnungsregeln (Trend, Momentum, Risiko, Breite, Stufe) – identisch zur Seite |
| `quant/config/market-pulse.json` | Schwellen, unverändert |
| `quant/engines/pattern-research.js` | Wilson-Intervalle, Zwei-Anteile-Test, Benjamini-Hochberg |
| `quant/engines/backtest.js` | Kennzahlen der Veranschaulichung (CAGR, Max. Drawdown …) |

Quant- und Macro-Module sind unverändert. Neu sind nur
`scripts/market/lib/market-validation.mjs`, `scripts/market/validate-market-pulse.mjs`,
`scripts/market/build-validation-sources.mjs`, der Workflow
`.github/workflows/market-validation-data.yml` und die Tests
`discover/tests/market-validation.test.mjs`.

## Methode

- **Point in time:** jeder Tag nur aus Daten bis zu diesem Tag. Die
  Volatilitätsschwellen (75./90. Perzentil) werden expandierend aus der bis
  dahin bekannten Verteilung bestimmt – nicht aus der Gesamtstichprobe.
- **Ausführung:** Einstieg am Folgetag. Folgefenster 1, 3 und 6 Monate
  (21/63/126 Handelstage).
- **Messgrößen:** Rendite am Fensterende; schlechtester Stand gegenüber dem
  Einstieg; „deutlicher Rückgang“ = schlechtester Stand ≤ −10 %.
- **Unabhängigkeit:** Intervalle und Tests nur über Tage, deren Folgefenster
  sich nicht überschneiden.
- **Mehrfachtests:** Stufen 0–1 gegen 3–4, je Horizont und Kennzahl,
  Benjamini-Hochberg bei 5 %.
- **Keine Anpassung:** Kein Parameter wurde auf Rendite optimiert.

## Datengrundlagen

| Studie | Daten | Zeitraum | Hinweis |
|---|---|---|---|
| A | SPY, QQQ, DIA, IWM aus dem Repository (Kurs ohne Ausschüttungen) | ab 2001 | Breite nicht rekonstruierbar → Stufe „Breit konstruktiv“ kommt nicht vor |
| B | Kenneth French Data Library: Gesamtmarkt (inkl. Ausschüttungen), 6 Größen-/Stil-Portfolios als Tracker-Rollen, 49 Branchen als Breite | ab 1926 | Jahre vor 2001 sind echte Außer-Stichproben-Daten für die 2026 formulierten Regeln |
| C | Zinskurve 10J–2J (Repository), FRED SAHMREALTIME, FRED T10Y3M | ab 1959 / 1982 / 2001 | Prüft, ob Makro *innerhalb* derselben Stufe zusätzlich trennt |

Tracker-Rollen in B (Näherung): SPY → Gesamtmarkt · QQQ → große Wachstumswerte
(BIG LoBM) · DIA → große Standardwerte (ME2 BM2) · IWM → kleine Werte (ME1 BM2).
Die Regel „drei von vier Trackern“ bleibt damit unverändert.

## Lizenzen und Weitergabe

| Quelle | Bedingungen (Stand der Prüfung) | Umgang hier |
|---|---|---|
| **Kenneth R. French Data Library** | Frei abrufbar, ohne ausdrückliche Lizenz; die Dateien tragen den Copyright-Vermerk von Fama/French; die Portfolios beruhen auf lizenzierten CRSP-/Compustat-Daten. Akademische Nutzung mit Quellenangabe ist üblich; eine Weitergabe der Rohreihen oder eine Anzeige in einem kommerziellen Produkt ist davon nicht gedeckt. | Rohdaten bleiben im Runner, **nicht** im (öffentlichen) Repository. Eingecheckt sind nur aggregierte Kennzahlen mit Quellenangabe. Vor jeder Veröffentlichung: schriftliche Anfrage bei Prof. French. |
| **FRED SAHMREALTIME** | Von der Federal Reserve Bank of St. Louis berechnet aus BLS-Daten (gemeinfrei). FRED-Nutzungsbedingungen: Quellenangabe, keine Andeutung einer Billigung. | Nur im Runner; Auswertung mit Quellenangabe. |
| **FRED T10Y3M** | Abgeleitet aus H.15 (Board of Governors, gemeinfrei). Bedingungen wie oben. | Wie oben. |
| **Repository-Tracker (Tiingo)** | Lizenzierter Pfad, bereits im Produkt genutzt. | Unverändert. |
| Nicht genutzt | ICE-BofA- und Moody's-Reihen in FRED (Weitergabe eingeschränkt), S&P-500-Indexreihe in FRED (nur 10 Jahre, S&P-Rechte), Shiller-Daten (im Sandbox nicht erreichbar, nur monatlich), ALFRED und Philly-Fed-Echtzeitdaten (SAHMREALTIME deckt den Echtzeit-Gedanken für die Arbeitsmarktbedingung bereits ab). | – |

Die Einschätzung ist keine Rechtsberatung; vor einer öffentlichen Anzeige
sollte sie juristisch bestätigt werden.

## Kosten

Keine. Kein Schlüssel, kein bezahlter Anbieter, kein Zeitplan. Der Workflow
läuft nur manuell (`workflow_dispatch`) oder bei einem Push auf `claude/**`
mit dem Marker `[mv-data]` in der Commit-Nachricht; sonst wird der Job
übersprungen. Ein Lauf dauert wenige Minuten.

## Wiederholen

```
# Rohdaten: Workflow „Markt-Validierung — Quelldaten“ manuell starten, oder lokal:
node scripts/market/build-validation-sources.mjs --french <dir> --fred <dir>
node scripts/market/validate-market-pulse.mjs
node --test discover/tests/market-validation.test.mjs
```
