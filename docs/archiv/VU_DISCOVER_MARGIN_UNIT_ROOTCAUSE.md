# Discover: Margen — Root Cause

**Gefunden am 2026-09-19** beim Anbinden der Discover-Reihen als
Evidenzquelle für Social. Untersucht entlang
`SOURCE VALUE → UNIT SEMANTICS → NORMALIZATION → FILTER → DISPLAY`.

**Nichts an Discovery wurde geändert.** Die Korrektur berührt, welche
Titel in einer Reihe stehen — das ist produktsichtbar und damit ein
Owner Gate.

---

## Die Quelle ist korrekt und erklärt ihre Einheit

`quant/engines/factors.js:207`

```js
fcfMargin: round(pct(div(fcf, revenue)), 3),   // pct(v) = v * 100
```

`quant/engines/catalog.js:88` deklariert dazu `unit: "pct"`.

**Der gespeicherte Wert ist also Prozent.** `13.372093` heißt 13,37 %.
Die Einheit ist nicht mehrdeutig — sie steht im Katalog.

Dasselbe gilt für `netMargin` und `operatingMargin` (Zeile 208).

## Zwei Verbraucher lesen ihn als Bruch

**Filter** — `scripts/discover/build-discover-data.mjs:986`

```js
fundCashflow: … s.metrics.f_fcfMargin >= 0.15 …
```

Ein Prozentwert wird gegen eine Bruchschwelle verglichen. Die Regel
„FCF-Marge ≥ 15 %" ist damit implementiert als **„≥ 0,15 %"** — eine
Hürde, die fast jedes profitable Unternehmen nimmt. Deshalb steht in
CASHFLOW-MASCHINEN überwiegend das Bankenuniversum, für das eine
Free-Cashflow-Marge ohnehin keine sinnvolle Kennzahl ist.

Betroffen sind mindestens die Zeilen 986, 988, 991, 993 und 1195.

**Anzeige** — `discover/engines/klartext.js:54`

```js
var z = v * 100;
```

Der bereits in Prozent vorliegende Wert wird erneut mit 100
multipliziert. `13.372093` wird zu **„1337 %"**.

## Der Umfang ist größer als die auffälligen Fälle

24 Karten zeigen Werte ≥ 200 %, die sofort als unmöglich auffallen.
**Falsch sind aber alle**: eine echte Marge von 0,25 % erscheint als
„25 %" — plausibel aussehend und trotzdem um den Faktor 100 daneben.

Die auffälligen 24 sind nicht die Menge der Fehler, sondern die Menge
der *sichtbaren* Fehler.

## Ein einziger Fehler, zweimal begangen

Es sind nicht zwei unabhängige Bugs. Es ist **eine** Fehlannahme —
„Margenwerte sind Brüche" — an zwei Stellen, und beide widersprechen
der Deklaration im Katalog.

Das ist dieselbe Defektklasse wie an vielen anderen Stellen dieses
Projekts: **eine Angabe, die dasteht, wird nicht gelesen.** Die Einheit
war nie unbekannt. Sie wurde nur nicht gefragt.

## Warum Social sie trotzdem nicht verwendet

Die Social-Evidenzschicht weist Margenwerte aus dieser Quelle
**vollständig** zurück (`unitUndeclared`), nicht nur die unmöglichen.
Solange Filter und Anzeige der Deklaration widersprechen, ist jede
Deutung eines Einzelwerts eine Behauptung — auch die harmlos
aussehende. Was in einen Beitrag gelangt, wird gelesen.

Nach einer Korrektur in Discovery kann diese Sperre fallen.

## Owner Gate

Die naheliegende Korrektur — Schwellen von `0.15` auf `15` und die
doppelte Multiplikation entfernen — ist inhaltlich eine
**Datenkorrektur**. Sie ändert aber, **welche Titel in welchen Reihen
erscheinen**, und das ist produktsichtbar.

Damit liegt sie genau auf der Grenze, die der Auftrag zieht. Entschieden
werden muss:

1. Nur die **Anzeige** korrigieren (Werte stimmen, Zeileninhalte bleiben
   wie heute — inkonsistent, aber unverändert)?
2. Anzeige **und Filter** korrigieren (Werte stimmen, Reihen ändern sich
   teils erheblich)?
3. Zusätzlich prüfen, ob eine FCF-Marge für Banken und REITs überhaupt
   ausgewiesen werden sollte — das ist eine fachliche und keine
   technische Frage.
