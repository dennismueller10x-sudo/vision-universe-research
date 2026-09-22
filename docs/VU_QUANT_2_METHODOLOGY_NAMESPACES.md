# Vision Universe® Quant — Methodik-Namensräume

Owner-Entscheidung vom 2026-09-22: Quant V1 bleibt `LEGACY_IMMUTABLE`.
Quant V2 bekommt einen eigenen, ausdrücklich versionierten Namensraum.
Kein stilles Re-Pointing, kein semantisch uneindeutiges Dual-Source-Verhalten.

## 1. Warum getrennte Namensräume

Quant V1 und Quant V2 sind zwei Methodiken, nicht zwei Versionen derselben Zahl.
`qualityScore` ist ein Quant-V1-Faktorwert über das damalige Scoring-Universum.
`quantV2.factorEvidence.quality` ist die Position der Quant-V2-Qualitätsevidenz im
Vergleichsuniversum, nach den Komponenten aus `quant-v2.json`. Die beiden Zahlen
beantworten verschiedene Fragen auf verschiedenen Daten.

Ein Feldnamen umzudeuten wäre nicht nur eine Anzeigeänderung: gespeicherte
Strategien, geteilte Screener-Links und Signaldefinitionen tragen
`predicateHash`-Werte über genau diese Feldnamen. Sie umzudeuten hieße, jede je
gespeicherte Regel still neu zu interpretieren — genau das, was Abschnitt 6 der
Product Constitution ausschließt.

## 2. Die beiden Namensräume

| Namensraum | Methodik | Status | Composite |
|---|---|---|---|
| `quantV1` | `quant-v1.0.0` | `LEGACY_IMMUTABLE` | erlaubt (bestehender VU Quant Score) |
| `quantV2.factorEvidence` | `vu-factor-evidence-1.0.0` | `ACTIVE_WITHOUT_COMPOSITE` | **nicht erlaubt** |

Registriert in `quant/engines/catalog.js` unter `NAMESPACES`. Jedes Katalogfeld
trägt `namespace`, `methodologyVersion` und `immutable`.

### 2.1 Quant V1 — unverändert

`quantScore`, `qualityScore`, `momentumScore`, `valueScore`, `growthScore`,
`riskScore`. Die **Feld-Ids bleiben exakt wie sie waren**; nur die Beschriftung
nennt jetzt die Methodik („Quality Score (V1)“) und ein Alias-Token
(`QUANT_V1_QUALITY`) macht sie in VUQL ausdrücklich adressierbar. Ein Test führt
die Id-Liste als Regressionsschutz.

### 2.2 Quant V2 — Factor Evidence

```
quantV2.factorEvidence.quality
quantV2.factorEvidence.growth
quantV2.factorEvidence.momentum
quantV2.factorEvidence.value
quantV2.factorEvidence.profitability
quantV2.factorEvidence.revisions
quantV2.factorEvidence.risk
quantV2.factorEvidence.availableFactors
```

`quantV2.factorEvidence.composite` **existiert nicht**. Wer eine Regel dagegen
schreiben wollte, bekommt vom Katalog ein unbekanntes Feld — das ist das Gate,
und ein Test hält es fest. Der Composite bleibt geschlossen, solange Quant V2
nicht vollständig zertifiziert ist.

## 3. Wie Konsumenten wählen

Die Auswahl ist immer ausdrücklich. Kein Konsument bekommt eine Methodik, die er
nicht genannt hat.

| Konsument | Auswahl |
|---|---|
| Screener | Methodik-Auswahlfeld: „Quant V1 & Marktdaten“ oder „Quant V2 · Factor Evidence“. Ein Wechsel setzt die Regeln zurück. |
| Strategy Match | Vertrag nennt `allowedNamespaces: ["quantV2.factorEvidence"]`. Ein Profil mit einem V1-Feld wird beim Laden abgewiesen. |
| Quant-Seite | liest ausschließlich `vu-factor-evidence-1.0.0` und nennt die Version im Datenstand. |
| Setup / Backtest (später) | müssen ihre Version genauso ausdrücklich nennen. |

**Keine gemischte Bedeutung pro Titel.** Eine Screener-Abfrage gehört genau einer
Methodik; `methodologyOf(query)` gibt `null` zurück, sobald sie mischt, und
`build`/`decode` weisen sie mit `INVALID_SCREEN_RULES` ab. Bestehende
gespeicherte Abfragen enthalten ausschließlich Legacy-Felder und lösen deshalb
unverändert in die Legacy-Methodik auf.

Die Zeilenquelle folgt der Methodik, nicht dem Aufrufer: Quant V2 liest die
Evidenztabelle, alles andere das bestehende Produktuniversum. Der Handelsstatus
kommt in beiden Fällen aus dem Company Master — die Evidenztabelle behauptet ihn
nicht selbst.

## 4. Die Evidenztabelle

`quant/data/product/factor-evidence-v1/screening.json.gz`,
Schema `factor-evidence-screening-1.0.0`, 6.404 Zeilen, 90 KB komprimiert.

Die Spaltennamen **sind** die kanonischen Katalog-Feld-Ids. Es gibt kein zweites
Namensschema, das von dem abweichen könnte, gegen das eine Regel geschrieben ist.
Der Materializer prüft beim Schreiben, dass Katalog-Namensraum und veröffentlichte
Faktormenge übereinstimmen, und bricht sonst ab.

## 5. Strategy Match

Vertrag: `quant/methodology/strategy-profiles-v1.json`, Methodik
`strategy-profiles-1.0.0`. Engine: `quant/engines/strategy-match.js`.

Acht Profile: Quality Compounder, Momentum Leader, Quality Momentum, GARP,
Future Leader, Defensive Quality, Value Momentum, Earnings Revision Leader.

**Keine zweite Regel-Engine.** Jede Bedingung ist ein Filter des kanonischen
Rule Contract und wird von der kanonischen Query Engine ausgewertet. Ein Profil
ist damit ein `predicateHash`-identifiziertes Regelobjekt, das auch screenen
könnte — §20 der Produktvorgabe, ohne eine Regel zweimal zu formulieren.

Übereinstimmung = erfülltes Gewicht / messbares Gewicht.

- Eine Bedingung ohne Faktorwert zählt **weder** als erfüllt **noch** als
  verletzt. Sie verlässt den Nenner und wird als „nicht messbar“ ausgewiesen.
- Unter 60 % messbarem Gewicht oder unter zwei messbaren Bedingungen fällt das
  Profil geschlossen, statt eine Übereinstimmung aus dem Rest zu bilden.
- `ranking.state = WITHHELD`. Eine Sortierung nach bester Passung ist
  Darstellungsreihenfolge und wird als solche benannt, nie als Rang des Universums.
- `historicalEvidence.state = UNAVAILABLE`, Grund `BACKTEST_NOT_CERTIFIED`, an
  **jedem** Profil. Wie ein Profil historisch funktioniert hätte, ist ein
  Backtest; dieses Gate bleibt zu.

Die Schwellen sind Klassifikationsschwellen: für jeden Titel gleich, versioniert
und nicht gegen historische Ergebnisse optimiert (`fittedToOutcomes: false`).
Eine an einem Schwellenwert optimierte Regel wäre genau die Überanpassung, die
Abschnitt 16 der Produktvorgabe ausschließt.

### Beobachtetes Verhalten

- **Earnings Revision Leader** ist für jeden Titel `UNAVAILABLE`: der
  Erwartungstrend trägt die Hälfte des Profilgewichts und ist ohne lizenzierte
  PIT-Konsensquelle geschlossen. Das Profil steht trotzdem sichtbar da, mit Grund.
- **Banken, Versicherer und REITs** fallen bei den fundamentalgetriebenen
  Profilen geschlossen, weil Quality, Value und Profitability dort
  `NOT_APPLICABLE` sind, solange keine Branchenvorlage existiert. JPM zeigt
  genau das.

## 6. Was hier nicht behauptet wird

- Kein Quant-V2-Composite, kein Rang, kein Perzentil über alle Faktoren.
- Keine historische Rendite eines Profils.
- Keine Aussage, dass ein Profil mit 88 % „besser“ ist als eines mit 70 % — beide
  zählen erfüllte Bedingungen unterschiedlicher Profile.
- Kein Quant-V1-Wert in einer Quant-V2-Aussage, und umgekehrt.
