/* =========================================================================
   VISION UNIVERSE — symbol-matrix.mjs

   ACHT TITEL, DIE NIEMAND AUSGESUCHT HAT.

   Eine Messung an fuenf handverlesenen Titeln beweist, dass fuenf Titel
   funktionieren. Mehr nicht. Genau daran ist dieser Workstream einmal
   haengengeblieben: die Liste, mit der er angefangen hat, wurde spaeter
   fuer die Produktgrenze gehalten.

   Deshalb steht hier kein Name, sondern eine Regel je Kategorie. Die
   Namen fallen aus dem Eignungslauf heraus - aus derselben Quelle, aus
   der auch die Serverfunktionen ihre Grenze beziehen. Wer die Quelle neu
   baut, bekommt hier andere Titel, und das ist der Sinn der Sache.

   ZWEI KATEGORIEN KANN DIE QUELLE NICHT BEANTWORTEN.

   "Grosser Wert" und "kleiner Wert" sind Fragen nach der
   Marktkapitalisierung, und die steht im Bestand nicht. Sie zu schaetzen
   waere genau die zweite, parallele Universumslogik, die hier nicht
   gebaut werden soll.

   Stattdessen stehen dort zwei STELLVERTRETER, die wirklich gemessen
   sind - ein zweiter Handelsplatz und eine sehr duenne Kursreihe - und
   sie sind als Stellvertreter ausgewiesen, nicht als Kapitalisierung.
   Was die beiden Kategorien abdecken, ist die Spannweite des
   Universums. Dass das nicht dasselbe ist wie Groesse, gehoert in den
   Bericht und nicht unter den Teppich.

   Die beiden vom Auftrag genannten Titel stehen als Namen drin. Das ist
   erlaubt und hier auch richtig: sie sind die Bezugspunkte, an denen der
   Eigentuemer den Lauf wiedererkennt. Sie stehen in einer Messdatei,
   nicht im produktiven Pfad - der Unterschied ist der ganze Punkt.
   ========================================================================= */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lies = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

/* Die beiden Bezugspunkte aus dem Auftrag. */
const BENANNT = ["AAPL", "NVDA"];

/* Ein Name, den es nicht gibt - fuer den Negativfall "ausserhalb des
   Universums". Er wird unten gegen die Quelle geprueft: taucht er eines
   Tages doch auf, faellt der Lauf auf, statt still das Falsche zu
   messen. */
const ERFUNDEN = "ZZZZZZ";

export function baueMatrix() {
  const eignung = lies("quant/data/market/security-master/eligibility.json");
  const faktoren = lies("_preview-data/factors-FULL_UNIVERSE.json");

  const bars = new Map(faktoren.securities.map((s) => [s.ticker, s.bars]));
  const alle = new Map(eignung.decisions.map((d) => [d.ticker, d]));
  const imProdukt = eignung.decisions.filter((d) => d.product_eligibility !== "EXCLUDED");
  const heute = eignung.today;

  /* Gleichstand wird alphabetisch gebrochen - sonst haengt das Ergebnis
     an der Reihenfolge in der Datei, und zwei Laeufe messen zwei
     verschiedene Titel. */
  const bester = (kandidaten, schluessel, richtung) => {
    const sortiert = kandidaten.slice().sort((a, b) => {
      const d = (schluessel(a) - schluessel(b)) * richtung;
      return d !== 0 ? d : (a.ticker < b.ticker ? -1 : 1);
    });
    return sortiert[0] || null;
  };

  const jahreVor = (n) => {
    const d = new Date(heute + "T00:00:00Z");
    d.setUTCFullYear(d.getUTCFullYear() - n);
    return d.toISOString().slice(0, 10);
  };

  const belegt = new Set(BENANNT);
  const frei = (d) => d && !belegt.has(d.ticker);
  const nimm = (d) => { if (d) belegt.add(d.ticker); return d ? d.ticker : null; };

  const mitReihe = imProdukt.filter((d) => bars.has(d.ticker));

  /* 3 — der am laengsten notierte Titel an einem Handelsplatz, den die
     beiden Bezugspunkte nicht abdecken.

     Der erste Versuch nahm hier die laengste gemessene Kursreihe. Das
     war eine Regel ohne Wirkung: die Reihen sind oben abgeschnitten,
     Hunderte von Titeln liegen gleichauf, und entschieden hat am Ende
     das Alphabet - herausgefallen ist ein winziger Versicherer als
     angeblicher Stellvertreter fuer "grosser Wert". Eine Regel, die
     ihren eigenen Zweck verfehlt, ist schlimmer als keine.

     Diese hier traegt: sie bringt einen zweiten Handelsplatz in die
     Messung. Das ist etwas, das die Quelle wirklich weiss. */
  const andereBoerse = mitReihe.filter((d) =>
    frei(d) && !BENANNT.some((b) => alle.get(b) && alle.get(b).exchange === d.exchange));
  const langNotiert = andereBoerse.slice().sort((a, b) =>
    a.start_date === b.start_date ? (a.ticker < b.ticker ? -1 : 1) : (a.start_date < b.start_date ? -1 : 1))[0] || null;
  const t3 = nimm(langNotiert);

  /* 4 — lange notiert und trotzdem duenn belegt. Stellvertreter fuer
     "kleiner Wert": kein Neuzugang, aber weit weg von den grossen. */
  const langeNotiert = mitReihe.filter((d) => frei(d) && d.start_date <= jahreVor(10));
  const geringerBestand = bester(langeNotiert, (d) => bars.get(d.ticker), 1);
  const t4 = nimm(geringerBestand);

  /* 5 — die juengste Neunotierung dieses Jahres. */
  const neu2026 = imProdukt.filter((d) => frei(d) && d.start_date >= "2026-01-01");
  const neuzugang = neu2026.slice().sort((a, b) =>
    a.start_date === b.start_date ? (a.ticker < b.ticker ? -1 : 1) : (a.start_date < b.start_date ? 1 : -1))[0] || null;
  const t5 = nimm(neuzugang);

  /* 6 — kurze, aber vollstaendige Historie: die juengste Notierung VOR
     diesem Jahr. Das ist ein anderer Fall als der Neuzugang: hier gibt
     es schon ein volles Jahr Handel, nur wenig davor. */
  const vor2026 = imProdukt.filter((d) => frei(d) && d.start_date < "2026-01-01");
  const kurzeHistorie = vor2026.slice().sort((a, b) =>
    a.start_date === b.start_date ? (a.ticker < b.ticker ? -1 : 1) : (a.start_date < b.start_date ? 1 : -1))[0] || null;
  const t6 = nimm(kurzeHistorie);

  /* 7 — ausserhalb des Universums. */
  if (alle.has(ERFUNDEN)) {
    throw new Error(`${ERFUNDEN} steht inzwischen im Eignungslauf - der Negativfall braucht einen anderen Namen`);
  }

  /* 8 — ein Papier, das es gibt und das nicht ins Produkt gehoert. Die
     Klasse wird genannt, der Titel gezogen. */
  const nichtEigenkapital = eignung.decisions
    .filter((d) => d.product_eligibility === "EXCLUDED" && d.instrument_type === "WARRANT")
    .slice().sort((a, b) => (a.ticker < b.ticker ? -1 : 1))[0] || null;

  const zeile = (kategorie, ticker, regel, stellvertreter) => {
    const d = alle.get(ticker) || null;
    return {
      kategorie, ticker, regel,
      stellvertreterFuer: stellvertreter || null,
      imProduktuniversum: !!d && d.product_eligibility !== "EXCLUDED",
      eligibility: d ? d.product_eligibility : "NICHT_IM_BESTAND",
      instrumentType: d ? d.instrument_type : null,
      exchange: d ? d.exchange : null,
      startDate: d ? d.start_date : null,
      gemesseneBars: bars.has(ticker) ? bars.get(ticker) : null
    };
  };

  const matrix = [
    zeile("BEZUGSPUNKT_A", BENANNT[0], "im Auftrag genannt"),
    zeile("BEZUGSPUNKT_B", BENANNT[1], "im Auftrag genannt"),
    zeile("ZWEITER_HANDELSPLATZ", t3,
      "am laengsten notierter Titel an einem Handelsplatz, den die Bezugspunkte nicht abdecken",
      "weiterer grosser Wert"),
    zeile("GERINGER_BESTAND", t4,
      "kuerzeste gemessene Kursreihe unter den seit mindestens zehn Jahren notierten",
      "kleiner Wert"),
    zeile("NEUZUGANG_2026", t5, "juengste Notierung mit Startdatum ab 2026-01-01"),
    zeile("KURZE_HISTORIE", t6, "juengste Notierung mit Startdatum vor 2026-01-01"),
    zeile("AUSSERHALB", ERFUNDEN, "im Eignungslauf nicht vorhanden"),
    zeile("NICHT_EIGENKAPITAL", nichtEigenkapital ? nichtEigenkapital.ticker : null,
      "erster ausgeschlossener Optionsschein, alphabetisch")
  ];

  /* Keine Kategorie darf leer bleiben und keine zwei duerfen denselben
     Titel meinen - sonst misst der Lauf sieben Faelle und behauptet
     acht. */
  const namen = matrix.map((z) => z.ticker);
  if (namen.some((n) => !n)) {
    throw new Error("eine Kategorie bleibt leer: " +
      matrix.filter((z) => !z.ticker).map((z) => z.kategorie).join(", "));
  }
  if (new Set(namen).size !== namen.length) {
    throw new Error("zwei Kategorien meinen denselben Titel: " + namen.join(", "));
  }

  return {
    quelle: "quant/data/market/security-master/eligibility.json",
    quellversion: eignung.version,
    stichtag: heute,
    produktuniversum: imProdukt.length,
    matrix
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = baueMatrix();
  console.log(`\n  Quelle ${m.quelle} (${m.quellversion}) · Stichtag ${m.stichtag} · ${m.produktuniversum} Titel\n`);
  for (const z of m.matrix) {
    console.log(`  ${z.kategorie.padEnd(20)} ${String(z.ticker).padEnd(8)} ${z.eligibility.padEnd(16)}` +
      ` ${String(z.instrumentType || "-").padEnd(16)} seit ${z.startDate || "-"}` +
      ` · ${z.gemesseneBars === null ? "keine Faktorzeile" : z.gemesseneBars + " Bars"}`);
    console.log(`  ${"".padEnd(20)} Regel: ${z.regel}` +
      (z.stellvertreterFuer ? ` (Stellvertreter fuer "${z.stellvertreterFuer}")` : ""));
  }
  console.log("");
}
