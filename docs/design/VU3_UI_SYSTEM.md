# VU3 UI-System

Verbindliche Gestaltungsregeln für alle Produktwelten (VU3 UI-Refresh, Oktober 2026). Grundlage: [Visuelle Bestandsaufnahme](../audits/VU3_VISUELLE_BESTANDSAUFNAHME_2026-10-21.md).

## Prinzip

**ICON → KENNZAHL → ERGEBNIS → VISUALISIERUNG → DETAILS AUF KLICK**

Die erste Bildschirmhöhe beantwortet die Frage der Seite. Erklärungen, Methodik, Quellen und Zeitstempel stehen dahinter, nicht davor.

## Unverändert

Diese Grundlagen bleiben, wie sie sind:
- Produktarchitektur, globale Navigation, Produktmenüs und Dock
- Produktnamen, Icons, Hero-Motive, Farbwelt und Typografie
- Berechnungen, Scores, Modelle und Datenlogik

Es gibt keine neue Topbar, keine neue Designsprache und keine erfundene Zahl.

## Bausteine

Die Bausteine sind in `assets/site-navigation.css` als Opt-in-Klassen angelegt. Sie werden überall geladen und brauchen keine zusätzliche Anfrage.

| Baustein | Klasse | Regel |
|---|---|---|
| Abschnitt | `.vu-sec`, `.vu-sec-head`, `.vu-sec-title` | Ohne Rahmen und ohne Hintergrund. Abschnitte trennt eine Haarlinie und Weißraum (`--vu-section-gap`) |
| Ergebnis-Satz | `.vu-result` | Ein Satz, groß. Er ist die Antwort, nicht die Methode |
| Kennzahlen | `.vu-kpis` > `.vu-kpi` (`-label`, `-value`, `-sub`), `.vu-kpi--xl` | Raster ohne Kästen. Wert groß, Bezeichnung klein darüber |
| Richtung | `.vu-up` / `.vu-down` plus ▲/▼ | Nie nur Farbe |
| Status | `.vu-status[data-tone=good\|bad\|warn\|accent]` | Punkt plus Wort |
| Balken | `.vu-bar[style="--v:62"]` > `i` | Anteil oder Vergleich 0–100 |
| Rangliste | `.vu-rank` > `li` | Zeilen mit Rang statt Karten |
| Details | `<details class="vu-more"><summary>Wie wird das berechnet?</summary><div class="vu-more-body">…` | Einheitliche Aufklappzeile |
| Daten & Methodik | `<details class="vu-dm"><summary>Daten & Methodik <small>Stand 20.10.</small></summary><dl>…` | **Einmal je Seite**, am Ende. Bündelt Quellen, Anbieter, Datenstände und Methodik |
| Warnung | `.vu-alert` | Veraltete, unvollständige oder unzuverlässige Daten. Bleibt sichtbar |
| Leerzustand | `.vu-empty` | Eine Zeile Erklärung, ein Weg weiter |
| Kurschart | `assets/vu-chart.js` (`VUChart.mount`) + `.vu-chart` | Siehe unten |
| Aktienkopf | `VUStockNavigator.head` (`assets/stock-navigator.js/.css`) | Siehe unten |

## Aktienkopf und Aktien-Navigator

Jede Aktienseite (Discover, Quant, Technik, Elliott, Supertrader, Fundamental, Hedgefonds) beginnt mit demselben Kopf:

```js
VUStockNavigator.head(host, {
  ctx,            // VUCore.StockContext.fromUs(ticker) bzw. Europa-Kontext
  current,        // "discover" | "quant" | "technik" | "elliott" | "supertrader" | "fundamental" | "hedgefonds"
  name,           // Unternehmensname, wie Discover ihn führt
  exchange,       // "NASDAQ" usw., falls bekannt
  price: { value, currency: "USD", changePct, changeLabel: "heute", kind: "live" | "delayed" | "close" | "intraday", at: "21.10., 10:20" },
  back: { href, label }, actions          // optional
});
```

Regeln für den Kopf:
- **Ein Kurs je Kopf**, mit Art und Zeitbezug. Ein Schlusskurs heißt „Schlusskurs · 20.10.“. Ein Intraday-Kurs heißt „Live“ oder „Verzögert“, mit Uhrzeit.
- **Zwei verschiedene Kurse** stehen nie unbeschriftet nebeneinander.
- **Der Navigator steht unmittelbar unter dem Kurs**, auf jeder Aktienseite gleich. Er zeigt sieben Welten. Verfügbar ist nur, was das Manifest belegt (`scripts/core/stock-availability.mjs`). Fehlende Abdeckung ist kein Link.

Einbindung:
- Skripte: `/core/identity.js` → `/core/stock-context.js` → `/assets/stock-navigator.js`
- Stil: `/assets/stock-navigator.css`
- Welten mit generierten Seiten laden die drei Skripte zur Laufzeit nach.

## Kurschart

Vorbild ist der Discover-Chart. Er gilt für alle Kursverläufe derselben Aktie:
- Eine Linie, grün (`--vu-chart-up`) über dem Startkurs, rot (`--vu-chart-down`) darunter.
- Startlinie gestrichelt, Punkt am letzten Kurs, Kursachse rechts (Hoch, Tief, letzter Kurs), Datum unten.
- Kein Rahmen, keine Fläche, kein Gitter, keine Legende.
- Zeitraum-Leiste `.vu-ranges` (1T, 1M, 3M, 6M, 1J, 3J, 5J, MAX), soweit Daten vorliegen.
- Mobil reicht der Chart bis an den Seitenrand (`.vu-chart--bleed`).

```js
VUChart.mount(host, { currency: "USD", initial: "1J", ranges: [
  { id: "1J", label: "1J", points: [["2025-10-21", 120.5], …] },
  { id: "1T", label: "1T", load: () => fetch(…).then(…), base: previousClose }
]});
```

Fachliche Diagramme bleiben in ihrer Form:
- Umsatzbalken in Fundamental
- Wellenzählung in Elliott
- Kerzen im Chartbild
- Risiko- und Verteilungsgrafiken

Sie übernehmen aber die Farben, die Achsenschrift und die Rahmenlosigkeit.

## Weniger Kästen

- Keine Karte in einer Karte und kein Rahmen um jede Kennzahl oder jedes Diagramm.
- Karten nur, wenn sie eine Interaktion tragen: ein Link zu einer Aktie, ein Filter, eine auswählbare Strategie.
- Seitenrand mobil 16 px (`--vu-gutter`). Inhalte nutzen die volle Breite, ohne doppelte Innenabstände.

## Text und Metadaten

**Sichtbar bleiben:**
- Ergebnis
- Kennzahl mit Einheit
- ein kurzer Satz Einordnung
- Warnungen

**In `.vu-more` (Details auf Klick):**
- Methodik und Rechenweg
- Begriffserklärungen
- lange Beschreibungen

**In `.vu-dm` (einmal je Seite):**
- Anbieter (SEC, Tiingo, Marketstack, IEX)
- Datenstände
- Aktualisierungszeitpunkte
- Lizenz-Attributionen
- Methodik-Links

**Nie in der Kundenansicht:**
- Debug-, CI-, Gate- und Pipeline-Begriffe, z. B. „SEARCH_RESULT_MATCH“, Schema-Versionen oder Laufnummern

**Datenstand:**
- Er erscheint am Kurs, weil er dort die Aussage verändert.
- Sonst steht er in „Daten & Methodik“.

## Farbschema

Die erste besuchte Welt legt das Schema fest. Danach gilt es überall, bis der Nutzer umschaltet (`assets/site-navigation.js`). Jede Seite muss in Hell und in Dunkel vollständig lesbar sein (WCAG AA).
