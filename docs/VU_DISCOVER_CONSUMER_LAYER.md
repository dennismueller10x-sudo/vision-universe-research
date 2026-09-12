# VISION UNIVERSE® DISCOVER — Consumer Layer

Stand: 2026-09-12 · Branch `claude/vision-universe-discover-h93fmv` ·
vierte Ausbaustufe. Vorgänger: `VU_DISCOVER_DELIVERY_REPORT.md` (Bau),
`VU_DISCOVER_EXPERIENCE_REDESIGN.md` (dunkle Experience),
`VU_DISCOVER_VISUAL_IDENTITY.md` (Bildsprache).

Nicht nach `main` gemergt, nicht veröffentlicht.

---

## 1. Die Korrektur

Die Oberfläche war nach drei Ausbaustufen visuell fertig und inhaltlich
falsch adressiert. Auf den Karten stand, was die Engines rechnen:

    VLO
    Leadership 96 · RS 100 · Momentum 100 · 1,7x Volumen

Das ist für jemanden, der die Skalen kennt, eine dichte Zusammenfassung.
Für alle anderen ist es gar nichts — und „alle anderen" sind die Nutzer,
für die dieses Produkt gebaut wird. Wer 25 € im Monat anlegt und gerade
sein erstes Depot eröffnet hat, weiß nicht, was RS 100 bedeutet, und wird
es auch nicht nachschlagen.

Dieselbe Aktie steht jetzt so da:

    Valero Energy
    VLO
    ● Hat sich in zwölf Monaten mehr als verdoppelt
    +150 %  in 12 Monaten
    [Verlauf]
    Neues Jahreshoch

Die Zahlen dahinter sind unverändert. Sie stehen eine Ebene tiefer.

---

## 2. Die Übersetzungsschicht

`discover/engines/klartext.js` — eine Engine wie jede andere in diesem
Repository: deterministisch, versioniert, nachrechenbar, ohne
Sprachmodell.

Sie beantwortet für einen fertig gerechneten Titel drei Fragen:

| | |
|---|---|
| **Die Aussage** | Warum ist dieser Titel hier? Eine von 14 Geschichten, in fester Reihenfolge geprüft. |
| **Die Zahl** | Eine Rendite über einen benannten Zeitraum — nie ein Score. |
| **Der Zusatz** | Eine zweite Beobachtung, die die Aussage nicht wiederholt. |

Dazu: die Plaketten (`NEW HIGH` → „Neues Jahreshoch"), die Zeitachse der
Aktienseite, die Jahresspanne in Worten und die Begründung als ein Satz.

**Drei Regeln, die im Modulkopf stehen und im Test stehen:**

1. Nichts wird erfunden. Jeder Satz folgt aus einer ausgelieferten
   Kennzahl über eine feste Schwelle.
2. Vereinfachen heißt nicht verfälschen. „Mehr Handel als sonst" ist
   etwas anderes als „alle kaufen gerade". Relative Stärke ist nicht
   Beliebtheit, Momentum keine Prognose, ein neues Hoch kein Kaufsignal.
3. Einfach ist nicht kindlich. Kein belehrender Ton, keine Ausrufezeichen,
   keine Emoji.

Die Übersetzung läuft im **Build**, nicht im Browser: `plain` steht auf
jeder ausgelieferten Karte, und `verify-discover-data.mjs` rechnet jeden
Satz nach. Ein Satz auf einer Karte ist eine Aussage über ein Wertpapier —
er gehört geprüft wie die Zahl, aus der er entsteht.

---

## 3. Drei Fehler, die die Prüfungen gefunden haben

**Ein Satz, der seiner eigenen Zahl widersprach.** In „Gerade in Bewegung"
stand über Qualcomm „Über zwölf Monate im Plus" — und darunter −19,6 % in
drei Monaten. Beide Angaben stimmten, zusammen waren sie eine
Falschauskunft. Die Reihenfolge in `karte()` ist deshalb umgedreht: erst
steht die Zahl fest, dann wird der Satz gewählt, und eine Geschichte, die
Stärke behauptet, wird über einer Minuszahl übersprungen. Wo die
Kurzfristzahl negativ ist und die Jahreszahl positiv, sagt der Satz genau
das: „Zuletzt schwächer, über zwölf Monate im Plus".

**Eine Reihe, die mehr versprach als ihre Regel prüfte.** „Gerade in
Bewegung" ließ zusätzlich jeden Titel mit `breakoutScore >= 40` zu.
Solange die Zeile „BREAKING OUT" hieß, war das vertretbar; seit sie
behauptet, der Kurs ziehe an, war es falsch. Der Filter prüft jetzt nur
noch das belegte Signal — vier Titel statt acht, aber vier, die stimmen.

**Eine Kategorie, die Ruhe versprach.** „Ruhige Aufwärtstrends" enthielt
einen Titel mit +234 % in sechs Monaten. Die Regel dahinter (Kurs über
allen vier Durchschnitten) sagt nichts über Schwankung. Die Sammlung heißt
jetzt „Stabile Aufwärtstrends" — stabil im Sinne von durchgehend, und der
Untertitel sagt, was gemeint ist.

---

## 4. Wie eine Reihe zu ihren Sätzen kommt

Der Weg dahin ging über zwei Sackgassen, beide im Code dokumentiert:

1. **Jede Karte nimmt die stärkste Beobachtung.** Ergebnis: in „Stabile
   Aufwärtstrends" sagte jede zweite Karte „Eine der stärksten Aktien des
   Jahres". Der Leser musste raten, wovon die Reihe handelt.
2. **Die Reihe bestimmt den Satz.** Ergebnis: zwölf identische Sätze
   untereinander. Die Reihe las sich wie ein Formular.
3. **Was die Reihe schon sagt, sagt die Karte nicht noch einmal.** Die
   Überschrift nennt die Kategorie einmal, die Karte nennt das, was diesen
   einen Titel darin auszeichnet, der Zusatz bestätigt die Zugehörigkeit.

Dazu eine Grenze auf Reihenebene: **derselbe Satz steht höchstens zweimal
in einer Reihe.** Danach bekommt der nächste Titel die nächstbeste
Beobachtung, die für ihn zutrifft — erfunden wird nichts, es wird eine
andere wahre Aussage gewählt. Gerechnet wird das in
`Klartext.reihe(liste, rowId)` über die ausgelieferte Reihenfolge; die
Nachrechnung im Prüfskript kommt deshalb auf dasselbe Ergebnis.

So liest sich „Neue Jahreshochs" heute:

| Titel | Aussage | Zahl | Zusatz |
|---|---|---|---|
| Vodafone Group | Gehört zu den Marktführern | +53 % | Neues Jahreshoch |
| Valero Energy | Hat sich in zwölf Monaten mehr als verdoppelt | +150 % | Neues Jahreshoch |
| Shell plc | Seit Monaten durchgehend im Aufwärtstrend | +13,4 % | Neues Jahreshoch |
| ABM Industries | Kommt gerade in Bewegung | +4,2 % | Neues Jahreshoch |

---

## 5. Die Sammlungen

| vorher | jetzt |
|---|---|
| TOP 10 MARKET LEADERS | DIE ZEHN STÄRKSTEN AKTIEN |
| MARKTFÜHRER | DIE STÄRKSTEN AKTIEN |
| NEUE 52-WOCHEN-HOCHS | NEUE JAHRESHOCHS |
| MOMENTUM LEADERS | SEIT MONATEN IM AUFWIND |
| BREAKING OUT | GERADE IN BEWEGUNG |
| RELATIVE STRENGTH | DEM MARKT VORAUS |
| TREND INTAKT | STABILE AUFWÄRTSTRENDS |
| SECTOR LEADERS | DIE STÄRKSTEN JE BRANCHE |

Die Untertitel erklären die Regel in einem Satz, ohne Fachbegriff. Die
Architektur trägt damit das Collection-Modell: eine Sammlung ist ein
Titel, ein Satz, eine Regel und eine Farbwelt — Themen- oder
Fundamental-Sammlungen würden genauso angelegt.

---

## 6. Die drei Ebenen

**Ebene 1 — Discover.** Firmenname, Aussage, eine Zahl, Verlauf, ein
Zusatz. Keine Scores, keine Perzentile, keine Multiplikatoren. Geprüft
von der Browser-QA: auf der Startseite darf `RS 98`, `Leadership 96`,
`Perzentil`, `RVOL`, `2,4x Volumen` nicht vorkommen.

**Ebene 2 — Aktienseite.** Name, Kürzel, Kurs (wo freigegeben) oder die
Klartext-Zahl, die Aussage, die Zeitachse über 1/3/6/12 Monate, die
Jahresspanne als Band mit Satz, und die Begründung in einem Satz. Eine
Woche fehlt, weil keine Wochenrendite ausgeliefert wird — eine leere
Spalte wäre schlechter als keine.

**Ebene 3 — Analyse.** Ab dem Kapitel „Die Belege": die
Einzelbefunde aus `narrative.js` mit Score, Perzentil und Vorsprung gegen
die Benchmark, danach Kennzahlen, Technical Intelligence, Elliott-Zustand,
Herkunft. Nichts davon wurde entfernt; es steht nur nicht mehr vor der
ersten Frage.

---

## 7. Charts

Wiederverwendet, nicht neu gebaut:

* **Freigegebene Titel** (5 von 498) zeigen die echte Kursreihe — auf der
  Karte als 40-Punkt-Verlauf aus derselben Pipeline, auf der Aktienseite
  im bestehenden Technical Chart des Quant-Moduls.
* **Alle übrigen** zeigen den rebasierten Renditepfad: fünf sichtbare
  Stützstellen aus den veröffentlichten Renditen, dazwischen wird nichts
  interpoliert.
* Jedes Bild trägt ein `<title>` und ein `aria-label`, die sagen, was es
  ist. Auf Eingangsfläche und Aktienseite steht die Kennzeichnung
  zusätzlich als Bildunterschrift: „Wertentwicklung statt Kurs … (rebasierter
  Renditepfad — keine Kurskurve)".
* Intraday bleibt aus, weil das Feature-Gate aus ist. Ein „heute"-Chart
  aus Tagesschlusskursen wäre erfunden.

Die Lizenzgrenze ist unverändert und wurde nicht ausgeweitet.

---

## 8. Firmennamen

512 kuratierte Anzeigenamen in `discover/config/company-names.json`
(`CURATED_EDITORIAL`), nachrangig zu den vier Repository-Quellen. Damit
tragen **alle 498** realen Titel einen Firmennamen statt eines Kürzels —
vorher waren es 161. Kein Name wird aus einem Kürzel abgeleitet; fehlt
einer, zeigt die Oberfläche das Kürzel.

Für ein Produkt, dessen erste Frage „Welche Firma ist das?" lautet, war
das die größte einzelne Verbesserung.

---

## 9. Telefon

Bei 390 × 844 gemessen:

* Kein Seitwärts-Scroll.
* Die Karte liest sich Name → Aussage → Zahl → Bild → Zusatz; die
  Reihenfolge ist in der Browser-QA festgehalten.
* Der Kopf einer Reihe ist **eine** Zeile: Name links, „Alle anzeigen"
  rechts, Trefferzahl weicht. Kein Sammlungsname wird abgeschnitten.
* Die erste Sammlung beginnt bei 817 px — im Bild, nicht darunter.
* Der Datenhinweis ist ein `<details>`: ein Satz sichtbar, der Rest
  aufklappbar, nichts abgeschnitten.

---

## 10. Prüfstand

| Prüfung | Umfang | Ergebnis |
|---|---|---|
| `node --test discover/tests/*.test.mjs` | 103 (15 neu für den Klartext) | grün |
| `node --test quant/tests/*.test.mjs` | 684 | grün |
| `scripts/discover/verify-discover-data.mjs` | 9 502 Nachrechnungen | keine Abweichung |
| `scripts/discover/browser-qa.mjs` | 52 Prüfungen, 18 Aufnahmen | grün |

Neu in der Browser-QA (§48):

* auf der Startseite steht keine Fachsprache,
* jede Karte beantwortet: welche Firma, warum, wie viel,
* mindestens 80 % der Karten nennen eine Firma statt eines Kürzels,
* die Sammlungen heißen, wie ein Mensch sie nennen würde,
* keine Aussage widerspricht ihrer Zahl,
* die Suche zeigt Firmen, keine Kürzelliste,
* die Aktienseite trägt oben keine Kennzahl aus der Analyseebene.

Neu in den Tests: die Übersetzungsregeln selbst — Determinismus, die
Verdopplungs-Schwelle, „stärker als 100 %" ist unmöglich, die Begründung
bleibt ein Satz, und über die **ausgelieferten** Daten: keine Karte ohne
Aussage, keine Stärke über einer Minuszahl, kein Fachkürzel im Payload.

---

## 11. Was bewusst nicht passiert ist

* Keine neue Chart-Engine, keine zweite Marktdaten-Architektur.
* Keine Kennzahl entfernt — Quant, Technical Intelligence, Fundamentals,
  Scores, Perzentile sind vollständig erreichbar.
* Keine erfundenen Kurse, keine ausgeweitete Lizenzgrenze.
* Keine KI-Texte. Die Oberfläche wirkt intelligent, weil die Datenengine
  es ist.
* Keine Personalisierung, kein Themen-Collection-Backend — die
  Architektur trägt beides, gebaut wurde es nicht.

---

## 12. Offen

* **Eine Woche** fehlt auf der Aktienseite; dafür bräuchte es eine
  Wochenrendite in der Faktorenengine — eine Datenfrage.
* **Unternehmensbeschreibung, Marktkapitalisierung, Umsatz, Analysten**
  (§6, Ebene 2) liegen für dieses Universum nicht ausgeliefert vor.
* **Themen-Sammlungen** („KI-Aktien", „Made in Germany") brauchen eine
  Themenzuordnung je Titel. Die Sammlungsarchitektur ist dafür offen.
* **Live-Charts** bleiben hinter den Feature-Gates.

---

## 13. Stand

Alles auf `claude/vision-universe-discover-h93fmv`. **Nicht** nach `main`
gemergt, **nicht** veröffentlicht.
