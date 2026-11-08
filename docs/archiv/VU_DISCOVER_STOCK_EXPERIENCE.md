# VISION UNIVERSE® DISCOVER — Stock Experience (Ebene 2) und Swipe

Stand: 2026-09-12 · Branch `claude/vision-universe-discover-h93fmv` ·
fünfte Ausbaustufe. Vorgänger: `VU_DISCOVER_DELIVERY_REPORT.md`,
`VU_DISCOVER_EXPERIENCE_REDESIGN.md`, `VU_DISCOVER_VISUAL_IDENTITY.md`,
`VU_DISCOVER_CONSUMER_LAYER.md`.

Nicht nach `main` gemergt, nicht veröffentlicht.

---

## 1. Was diese Stufe gemacht hat

Discover war nach der vierten Stufe verständlich. Die Aktienseite dahinter
war es nicht: sie begann mit dem Leadership Score, zeigte den Chart erst an
vierter Stelle und darüber ein Raster aus Perzentilen. Wer dort ankam,
landete wieder im Terminal.

Jetzt liest sich die Seite in dieser Reihenfolge:

    Name · Kurs · Aussage · Zeitachse · Jahresspanne
    ↓
    Kursverlauf (echter Chart, Werkzeuge verstaut)
    ↓
    Warum steht diese Aktie hier?        — ein Satz
    ↓
    NVIDIA in 30 Sekunden                — vier Worte, vier Zahlen
    ↓
    Dafür und dagegen                    — beide Seiten
    ↓
    Das Unternehmen                      — Umsatz, Gewinn, Marge, KGV
    ↓
    Ähnliche Aktien                      — swipebar
    ─────────── Ab hier: die Analyse ───────────
    Die Belege · Kennzahlen · Technical Intelligence · Herkunft

Dazu zwei neue Experience-Bausteine: eine wiederverwendbare
Swipe-Grundlage für alle Sammlungen und ein eigener Modus *Einzeln
entdecken* — eine Aktie pro Bildschirm.

---

## 2. Die Datenlage, ungeschönt

Das ist die wichtigste Seite dieses Berichts, weil sie bestimmt, was auf
Ebene 2 überhaupt stehen darf.

| Was Ebene 2 zeigen möchte | Woher es kommt | Für wie viele Titel |
|---|---|---|
| Kurs, Tagesveränderung | Anzeigerichtlinie | 5 von 498 real · alle 482 im Modell |
| Kursverlauf, Zeiträume | bestehende Chart-Infrastruktur | alle mit Kursreihe |
| Entwicklung 1/3/6/12 Monate | Faktorenengine | alle |
| Jahresspanne, Trend, Risiko | Faktorenengine | alle |
| **Umsatz, Gewinn, Marge** | `quant/data/sec/canonical/` | **5** (AAPL, MSFT, NVDA, JPM, XOM) |
| **Kurs-Gewinn-Verhältnis** | SEC + freigegebener Kurs | **5** |
| Dieselben Kennzahlen synthetisch | `quant/data/securities.json` | 482 Modelltitel |
| **Analystenschätzungen** | — | **0** |
| **Geschäftssegmente** | — | **0** |

Daraus folgt die Bauweise: **es wird gerechnet, was vorliegt, und gesagt,
was fehlt.** Kein Platzhalter, kein Branchendurchschnitt als Ersatz, keine
"typischen" Werte. Auf der Seite eines Titels ohne Geschäftszahlen steht
wörtlich, dass der Anbieter keine liefert und deshalb nur der Kursverlauf
beurteilt werden kann — und dieselbe Auskunft steht in der Waage unter
"Das sollte man beachten".

Die Abschnitte *Analysten* (§14) und *Womit verdient das Unternehmen
Geld* (§16) wurden **nicht gebaut**. Nicht aus Zeitgründen: es gibt keine
Daten dafür, und eine Analystenstimmung ohne Analysten wäre eine
Erfindung.

---

## 3. Die Aktie in 30 Sekunden

`discover/engines/einordnung.js`. Vier Fragen, vier Worte, vier Zahlen:

| | NVDA | woraus |
|---|---|---|
| Wachstum | Sehr stark | Umsatz +83 % gegenüber dem Vorjahr |
| Bewertung | Hoch | Kurs-Gewinn-Verhältnis 28,2 |
| Trend | Stark | +24 % in sechs Monaten |
| Risiko | Mittel | Größter Rückgang im Jahr −20 % |

Die Schwellen stehen als Tabelle im Modulkopf, nicht verstreut in der
Oberfläche: ein Wort wie "hoch" ist eine Behauptung über ein Wertpapier,
und wer die Schwelle verschiebt, verschiebt die Behauptung — sichtbar im
Diff. Der Trend braucht zwei Belege (Lage zu den Durchschnitten **und**
Halbjahresrendite), weil eine Zahl allein zu leicht täuscht.

Jede Einordnung hat ein "Was bedeutet das?" — eine Erklärung, die selbst
ohne Fachsprache auskommt und erst auf Tippen erscheint. Vier Erklärungen
auf der ganzen Seite, nicht vierzig Tooltips.

---

## 4. Dafür und dagegen

Beide Spalten entstehen aus denselben Kennzahlen und festen Schwellen. Die
Regel, die das Modul ehrlich hält: **keine Aktie kommt ohne Gegenseite
aus.** Volatilität und Rückschlag liegen für jeden Titel vor; wo sonst
nichts zu beanstanden ist, steht die Schwankungsbreite. Eine Liste, die nur
Gründe dafür kennt, ist Werbung.

Und was die Einordnung oben "hoch" nennt, erklärt die Waage unten — beide
lesen dieselbe Schwelle, damit die Seite nicht an zwei Stellen
Verschiedenes behauptet. Ein Test hält genau das fest.

Unter der Sektion steht, was sie ist: *"Beide Seiten entstehen aus
ausgelieferten Kennzahlen und festen Schwellen. Das ist keine
Anlageempfehlung und keine Prognose."*

---

## 5. Der Chart

Wiederverwendet, nicht neu gebaut — dieselbe Technical-Chart-Engine des
Quant-Moduls. Verändert wurde die **Voreinstellung**:

* Keine Überlagerung ist an. Vorher lagen SMA 50 und SMA 200 auf jedem
  Chart, bevor jemand danach gefragt hatte, darunter ein rot-grünes
  Volumenhistogramm. Das ist die Voreinstellung einer Handelsoberfläche.
* Die Werkzeuge (EMA, Bollinger, Struktur, Fibonacci, Elliott, RSI, MACD,
  ATR, Volumen) liegen vollständig unter *Chart-Werkzeuge* — eine Zeile,
  zugeklappt. Die Browser-QA prüft beides: dass nichts offen liegt und
  dass alles da ist.
* Zeiträume: 1T · 1W · 1M · 6M · 1J · 5J · Max. 1T und 1W sind abgeblendet,
  weil Intraday-Daten hinter einem Feature-Gate liegen; der Grund steht
  daneben, in einem Satz ohne Konstantennamen.
* "5T" heißt in der Leiste "1W" — die Engine denkt in Handelstagen, ein
  Mensch in Wochen. Umbenannt ist nur die Beschriftung.

---

## 6. Die Swipe-Grundlage

`discover/ui/swipe.js` — eine Komponente für alle Sammlungen, nicht fünf
Karussells.

Die wichtigste Entscheidung steht im Modulkopf: **der Browser scrollt, wir
beobachten nur.** Kein Transform-Slider, keine abgefangene Geste. Ein
selbstgebauter Slider kennt weder die Beschleunigungskurve des Systems
noch das Nachfedern an den Rändern — deshalb bleibt `scrollLeft` die
Wahrheit und jede Geste schreibt nur dorthin. Das ist der Unterschied
zwischen "fühlt sich nativ an" und "Webseite mit Karussell".

Dazu kommt, was nativ fehlt:

* **Ziehen mit der Maus** ab 8 px Bewegung — darunter bleibt es ein Klick,
  sonst öffnet keine Karte mehr. Der Klick, der aus dem Ziehen entsteht,
  wird genau einmal geschluckt.
* **Tastatur**: ←/→ blättern in ganzen Karten, Pos1/Ende springen.
* **Ein Fortschrittsband** in der Farbe der Sammlung statt einer
  Scrollleiste — und nur dort, wo es etwas zu zeigen gibt.
* **Sichtbarkeit und Prefetch**: wer die dritte Karte sieht, bekommt die
  vierte und fünfte Detailseite vorgeladen. Über `<link rel="prefetch">`,
  nicht über `fetch` — ein Vorladen, das beim Weiterklicken abgebrochene
  Anfragen hinterlässt, ist keines.
* **Analytics-Haken** ohne Senke: ohne gesetzte Senke passiert nichts.
  Gemessen werden soll, was nützt (welche Sammlung geöffnet, welche Karte
  geklickt wird) — nicht, wie lange jemand wischt.

Was ausdrücklich fehlt: kein Endlos-Nachladen, kein Autoplay, keine
Rückmeldung, die zum Weiterwischen drängt.

---

## 7. Einzeln entdecken

`discover/ui/feed.js`, Route `#/einzeln/<Universum>`. Eine Aktie pro
Bildschirm: Herkunft, Name, große Zahl, Aussage, Datenbild, Zusatz, ein
Knopf zur Aktienseite.

Technisch ist es `scroll-snap-type: y mandatory` und sonst nichts — deshalb
funktioniert es mit Tastatur, Bildlaufleiste, Screenreader und reduzierter
Bewegung, ohne dass dafür etwas gebaut werden musste.

Drei Entscheidungen, die es von einem Content-Feed unterscheiden:

1. **Die Liste ist endlich.** Acht bis dreizehn Titel, abwechselnd aus vier
   Sammlungen, jeder höchstens einmal. Am Ende steht ein Schlussbildschirm
   und kein "weiter so".
2. **Der Ausgang ist immer sichtbar** — die Kopfzeile mit "← Übersicht"
   bleibt stehen.
3. **Es ist ein Angebot.** Der Einstieg liegt als ein Knopf in der Leiste;
   Startseite, Sammlungen und Aktienseiten sind unverändert. Die QA prüft,
   dass der Modus sich nicht aufdrängt und nirgends mit Dringlichkeit wirbt.

Auf dem Schreibtisch steht der Text links und das Datenbild rechts
daneben; der Hinweis unten heißt dort "Weiterscrollen" statt
"Weiterwischen" — das Gerät bestimmt das Wort, nicht die Metapher der
Entwickler.

---

## 8. Telefon

Bei 390 × 844 gemessen und einzeln überarbeitet:

* Das große Datenbild im Kopf der Aktienseite entfällt — der echte Chart
  steht direkt darunter, zwei Kurven übereinander sind eine zu viel.
* Die Zeitachse sind vier gleiche Spalten statt drei Werten und einem
  Nachzügler.
* "In 30 Sekunden" ist 2 × 2 statt vier Blöcken untereinander: 307 px
  statt 600, vier Antworten auf einen Blick.
* Der Einstieg in den Einzelmodus ist dort nur das Zeichen — die Leiste
  hat zwei Zeilen, und eine dritte wäre der Anfang eines Menüs.
* Kein Seitwärts-Scroll, keine abgeschnittenen Sammlungsnamen.

---

## 9. Prüfstand

| Prüfung | Umfang | Ergebnis |
|---|---|---|
| `node --test discover/tests/*.test.mjs` | 118 (15 neu für Ebene 2) | grün |
| `node --test quant/tests/*.test.mjs` | 684 | grün |
| `scripts/discover/verify-discover-data.mjs` | 9 502 Nachrechnungen | keine Abweichung |
| `scripts/discover/browser-qa.mjs` | 63 Prüfungen (11 neu) | grün |

Neu geprüft wird unter anderem:

* die Aktienseite erklärt in vier Worten, worum es geht — und keines davon
  ist Fachsprache;
* jede Einordnung lässt sich erklären, ohne die Seite zu verlassen;
* die Waage zeigt beide Seiten und nennt sich selbst keine Empfehlung;
* Geschäftszahlen erscheinen nur, wo es welche gibt — mit Gegenprobe an
  einem Titel ohne;
* die Analyse steht unter einer sichtbaren Grenze (Positionen gemessen);
* die Reihen lassen sich mit der Tastatur bedienen, jede zeigt, dass es
  weitergeht, und die nächste Karte ist immer angeschnitten sichtbar;
* im Einzelmodus ist ein Bildschirm genau eine Fläche hoch, der Zähler
  zählt mit, der Weg zurück existiert — und der Modus drängt sich nicht auf.

Dazu 15 neue Unit-Tests: jede Stufe kommt aus ihrer Schwelle, der Trend
braucht zwei Belege, aus einem Verlust wird keine Wachstumsrate gerechnet,
eine Korrektur ersetzt ein Quartal statt sich dazu zu addieren, ohne
freigegebenen Kurs entsteht kein KGV — und über die **ausgelieferten**
Daten: genau fünf reale Titel tragen Geschäftszahlen, alle anderen tragen
`null` **mit Begründung**.

---

## 10. Drei Fehler, die beim Bauen sichtbar wurden

**Das Vorladen hinterließ Fehler.** Die erste Fassung lud die nächsten
Detailseiten per `fetch`. Beim Weiterklicken brach der Browser sie ab, und
die Browser-QA zählte jede abgebrochene Anfrage als Fehler — zu Recht.
Jetzt läuft das Vorladen über `<link rel="prefetch">`: der Browser lädt,
wenn er Luft hat, und bricht lautlos ab, wenn nicht.

**Ein ganzer Bildschirm war zu hoch.** `100dvh` ignoriert den festen
Site-Header, für den der Körper oben Platz freihält — jeder "Bildschirm"
ragte um dessen Höhe nach unten hinaus, und der Hinweis "Weiterwischen"
stand genau dort, wo ihn niemand sieht. Dazu kam, dass `.dx-app` eine
`min-height: 100vh` setzt, die jede gerechnete Höhe schlägt.

**Die Prüfung maß das Gegenteil.** Die QA fragte `offsetParent`, um zu
sehen, ob die Chart-Werkzeuge offen liegen. Der Inhalt eines geschlossenen
`<details>` bleibt in diesem Chromium aber im Layout (content-visibility) —
er hat einen offsetParent und sogar eine Größe, er wird nur nicht
gezeichnet. Die Prüfung meldete "offen" für etwas Geschlossenes. Jetzt
fragt sie `checkVisibility()`.

---

## 11. Was bewusst nicht gebaut wurde

* **Analysten** und **Geschäftssegmente** — keine Daten (siehe 2.).
* **Eine Wochenrendite** auf der Zeitachse — die Faktorenengine liefert
  keine; eine leere Spalte wäre schlechter als keine.
* **Personalisierung** — die Sammlungs- und Swipe-Architektur trägt "Für
  dich", "Ähnlich wie …", Themen-Sammlungen; gebaut wurde nichts davon,
  weil es dafür keine Daten gibt.
* **Endlos-Feed, Autoplay, Kaufen-Knopf, Dringlichkeit** — nicht vergessen,
  sondern ausgeschlossen.

---

## 12. Stand

Alles auf `claude/vision-universe-discover-h93fmv`. **Nicht** nach `main`
gemergt, **nicht** veröffentlicht.
