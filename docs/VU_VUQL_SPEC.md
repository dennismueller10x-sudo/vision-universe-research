# VUQL — VISION UNIVERSE QUERY LANGUAGE

Implementierung: `quant/engines/vuql.js` · Version `1.0`

## Einordnung

> **VUQL ist nicht die kanonische interne Wahrheit.**
> Kanonisch ist der typisierte JSON-AST aus `query.js`.

```
Natuerliche Sprache
        |
        v
   JSON Query AST   <- kanonisch, validiert, ausfuehrbar
        ^
        |
      VUQL          <- lesbar, teilbar, versionierbar
```

VUQL existiert, damit eine Abfrage in einer Textzeile geteilt, in einem Commit
versioniert und in einem Gespraech vorgelesen werden kann. Ausgefuehrt wird nie VUQL,
sondern immer der daraus erzeugte AST — und nur, wenn er die vollstaendige Validierung
besteht.

## Beispiel

```
UNIVERSE US_EQUITIES
SECTOR Technology
MOMENTUM_6M PCTL >= 80
DISTANCE_52W_HIGH <= 3%
FCF > 0
SORT QUANT_SCORE DESC
LIMIT 25
```

## Grammatik

Zeilenbasiert. Leerzeilen werden ignoriert, `#` und `--` leiten Kommentare ein.

```
UNIVERSE <name>
<FELD> [PCTL] <operator> <wert>
<FELD> [PCTL] IN (<a>, <b>, …)
<FELD> [PCTL] NOT IN (<a>, <b>)
<FELD> [PCTL] BETWEEN <min> AND <max>
<FELD> <wert>                          Kurzform fuer "="
SORT <FELD> [ASC|DESC]
LIMIT <n>
```

Operatoren: `>=` `<=` `>` `<` `=` `!=` sowie `IN`, `NOT IN`, `BETWEEN`.

`PCTL` schaltet von der Rohwert- auf die Perzentilskala. Es ist nur bei Feldern erlaubt,
fuer die ein Perzentil existiert — sonst schlaegt das Parsen mit Zeilennummer fehl.

## Felder

Die Tokens kommen aus dem Feldkatalog (`quant/engines/catalog.js`, 52 Felder). Standard
ist die SCREAMING_SNAKE_CASE-Form der Feld-ID; wo diese schlecht lesbar waere, steht ein
explizites Token. Zusaetzlich gibt es Aliase fuer eingespielte Kurzformen.

| Feld | Token | Alias |
|---|---|---|
| `momentum6m` | `MOMENTUM_6M` | |
| `momentum12m1m` | `MOMENTUM_12_1` | |
| `distanceTo52wHigh` | `DISTANCE_52W_HIGH` | |
| `freeCashFlow` | `FREE_CASH_FLOW` | `FCF` |
| `consecutiveDividendGrowthYears` | `CONSECUTIVE_DIVIDEND_GROWTH_YEARS` | `DIV_GROWTH_YEARS` |
| `evToEbitda` | `EV_EBITDA` | |
| `quantScore` | `QUANT_SCORE` | |

`listFields()` (auch als AI-Werkzeug) liefert die vollstaendige Liste.

## Zahlenformate

| Schreibweise | Bedeutung |
|---|---|
| `3%` | 3 — das Prozentzeichen ist Lesbarkeit, keine zweite Einheit (Prozentfelder sind bereits als Prozentzahl definiert) |
| `250M` | 250 (Mio. USD, passend zur Katalog-Einheit) |
| `1.5B` | 1500 (Mrd. → Mio.) |
| `1_000` | 1000 |

## Validierung

Geparstes VUQL durchlaeuft **zusaetzlich** die vollstaendige AST-Validierung:
Felder, Operatoren, Typen, Einheiten, Wertebereiche, Universum, Sortierung, Limit sowie
semantische Widersprueche (`ROIC >= 30` und `ROIC <= 5` gleichzeitig).

Syntaxfehler tragen eine Zeilennummer, Validierungsfehler die Fehlerbeschreibung des AST.
**Ungueltiges VUQL erzeugt keinen Query und wird nie ausgefuehrt.**

## Serialisierung

`VUQL.serialize(ast)` erzeugt aus jedem gueltigen AST wieder VUQL. Der Roundtrip
AST → VUQL → AST ist verlustfrei und wird getestet.

## Wo VUQL auftaucht

- Screener: Editor mit Uebernahme in beide Richtungen
- Strategieseiten: Filter als lesbare Abfrage
- AI-Seite: die interpretierte Anfrage neben ihrem JSON-AST
