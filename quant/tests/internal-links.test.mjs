/* =========================================================================
   EIN KNOPF, DER INS LEERE FUEHRT, IST SCHLIMMER ALS KEIN KNOPF.

   Gemessen am 26.09.2026: die App verlinkt zwanzig Pfade ausserhalb von
   /vu2/, und keiner davon stand im Produktions-Smoke. Einer war ein 404 -
   /quant/methodology/, das Ziel des Knopfes „Methodik im Detail" auf der
   Erklaerseite, also der Weg zur letzten Station der Reise. Gefunden hat ihn
   eine Messung, nicht ein Test, und ohne diese Datei findet ihn beim
   naechsten Mal wieder niemand.

   Diese Pruefung ist absichtlich statisch und ohne Browser: sie liest die
   Ziele aus dem Quelltext und sieht nach, ob das Release sie ausliefern
   wuerde. Das kostet Millisekunden und faengt genau den Fall, der M31 war.

   WAS SIE NICHT PRUEFT, UND WARUM

   Externe Adressen (https://...) liegen nicht in unserer Hand. Und Ziele, die
   erst zur Laufzeit entstehen (ein Ticker im Pfad), werden auf ihr Muster
   geprueft, nicht auf jede moegliche Auspraegung - sonst pruefte dieser Test
   6.875 Kombinationen und nicht die Regel.

   Frontend-Rebuild (quant/app): Prüfintention erhalten – die App ist nicht
   mehr vu2/experience.js, sondern quant/index.html + quant/app/*.js. Innerhalb
   von Quant wird jetzt ueber Hash-Routen navigiert (#/aktie/NVDA statt
   /quant/stock/?ticker=NVDA); echte Pfade verlinkt die App nur noch fuer
   Flaechen AUSSERHALB der App (Methodik-Dateien, SEC-Dateninspektor).
   Deshalb zwei Pruefungen:
     a) jeder echte Pfad (Link in quant/app/*.js, href/src in
        quant/index.html) wird vom Release ausgeliefert (permitted()) und
        ist in git verfolgt;
     b) jede Hash-Route '#/...' in quant/app/*.js wird von QXApp.parse
        erkannt (keine landet auf "notfound") - der Knopf ins Leere ist bei
        Hash-Routen die "Diese Seite gibt es nicht"-Ansicht.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..", "..");
const APP_DATEIEN = readdirSync(join(ROOT, "quant/app")).filter((d) => d.endsWith(".js")).sort()
  .map((d) => "quant/app/" + d);
const ohneKommentare = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const app = APP_DATEIEN.map((d) => ohneKommentare(readFileSync(join(ROOT, d), "utf8"))).join("\n");
const html = readFileSync(join(ROOT, "quant/index.html"), "utf8");
const { permitted } = await import(new URL("../../scripts/vu2/build-release.mjs", import.meta.url));

/* Die Ziele, die ein Nutzer wirklich anklicken kann: was als `href:` gesetzt
   wird und was `X.link(label, ziel)` / `X.btn(label, ziel)` bekommt. Eine
   blosse Zeichenkette im Code ist kein Link - `/shares` etwa ist eine Einheit
   ("je Aktie") und hat bei der Messung einmal in die Irre gefuehrt; ebenso
   sind loadJSON-Pfade Daten, keine Knoepfe. */
function verlinkteZiele() {
  const ziele = new Set();
  for (const m of app.matchAll(/href:\s*"(\/[^"]*)"/g)) ziele.add(m[1]);
  for (const m of app.matchAll(/\b(?:link|btn)\(\s*"[^"]*"\s*,\s*"(\/[^"]*)"/g)) ziele.add(m[1]);
  return [...ziele].sort();
}
/* Was quant/index.html selbst referenziert: Stylesheets, kanonische Adresse,
   Skripte. Fehlt eines davon im Release, bricht die Seite als Ganzes. */
function seitenZiele() {
  const ziele = new Set();
  for (const m of html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)) ziele.add(m[1]);
  return [...ziele].sort();
}
/* Jede Hash-Route, die als Zeichenkette in der App steht. */
function hashRouten() {
  const r = new Set();
  for (const m of app.matchAll(/"(#\/[^"]*)"/g)) r.add(m[1]);
  return [...r].sort();
}
/* QXApp.parse und legacyRoute, wie sie in quant/app/app.js stehen - per
   Klammerzaehlung herausgeloest und ohne DOM ausgewertet (beide sind reine
   Funktionen). */
function funktion(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " fehlt in quant/app/app.js");
  let tiefe = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") tiefe++;
    else if (src[i] === "}" && --tiefe === 0) break;
  }
  return src.slice(start, i + 1);
}
const appJs = readFileSync(join(ROOT, "quant/app/app.js"), "utf8");
const uiJs = readFileSync(join(ROOT, "quant/app/ui.js"), "utf8");
const { parse, legacyRoute } = new Function(
  funktion(appJs, "parse") + "\n" + funktion(appJs, "legacyRoute") + "\nreturn { parse, legacyRoute };")();
const routes = new Function(uiJs.match(/var routes = \{[\s\S]*?\n  \};/)[0] + "\nreturn routes;")();

/* Was das Release fuer einen Pfad ausliefern wuerde: die Datei selbst oder
   ihre index.html. Genau die Regel, die GitHub Pages anwendet. */
function wirdAusgeliefert(pfad) {
  const rein = pfad.split("?")[0].split("#")[0];
  if (!rein.startsWith("/")) return false;
  const relativ = rein.replace(/^\/+/, "");
  if (!relativ) return true;                       /* die Startseite */
  const kandidaten = rein.endsWith("/")
    ? [join(relativ, "index.html")]
    : [relativ, relativ + ".html", join(relativ, "index.html")];
  for (const kandidat of kandidaten) {
    const absolut = join(ROOT, kandidat);
    if (existsSync(absolut) && statSync(absolut).isFile() && permitted(kandidat)) return true;
  }
  return false;
}

test("every internal link the app offers leads somewhere the release serves", () => {
  const ziele = verlinkteZiele();
  /* DIE SELBSTPRUEFUNG DIESES TESTS: BEKANNTE Ziele muessen gefunden werden
     - das bricht laut, wenn der Auszug kaputtgeht.

     Die alte Zahl (>= 10) zaehlte auch /quant/screener/, /quant/ranking/,
     /quant/stock/?ticker=... - Wege, die die neue App als Hash-Routen
     fuehrt (#/screener, #/aktie/NVDA) und die deshalb im zweiten Test
     unten (Hash-Routen) geprueft werden, nicht hier. Gezaehlt am
     30.09.2026 verlinkt quant/app/*.js genau zwei echte Pfade (an acht
     Stellen): /quant/methodology/ und /quant/data-inspector/. Die neue
     Untergrenze ist deshalb 2 fuer die App-Links (beide namentlich
     verlangt), und neu dazu 60 fuer alles, was quant/index.html selbst
     referenziert (gezaehlt: 72 Skripte/Stylesheets/kanonisch). Geprueft
     gegen permitted() werden damit >= 62 Ziele statt frueher >= 10. */
  const muss = ["/quant/methodology/", "/quant/data-inspector/"];
  for (const pfad of muss) {
    assert.ok(ziele.includes(pfad),
      "der Auszug findet " + pfad + " nicht mehr - er liest vermutlich nicht mehr das Richtige (" +
      ziele.length + " Ziele insgesamt)");
  }
  assert.ok(ziele.length >= 2, "nur " + ziele.length + " App-Ziele gefunden - der Auszug greift nicht mehr");
  const seite = seitenZiele();
  for (const pfad of ["/quant/app/app.css", "/quant/app/app.js", "/assets/site-navigation.css", "/quant/"]) {
    assert.ok(seite.includes(pfad), "quant/index.html referenziert " + pfad + " nicht mehr");
  }
  assert.ok(seite.length >= 60, "nur " + seite.length + " Seitenziele gefunden - der Auszug greift nicht mehr");
  const tot = [];
  for (const ziel of [...ziele, ...seite]) {
    if (!wirdAusgeliefert(ziel)) tot.push(ziel);
  }
  assert.deepEqual(tot, [],
    "diese Ziele liefert das Release nicht aus: " + tot.join(", ") +
    " - ein Knopf, der ins Leere fuehrt, ist schlimmer als kein Knopf (gemessen: M31)");
});

test("the link targets are really tracked files, so the release contains them", () => {
  /* Das Release kopiert `git ls-files` - eine Datei, die nur lokal liegt,
     fehlt dort. Genau daran ist die Methodik-Seite beim ersten Bauversuch
     gescheitert (der Smoke sagte "VUJourneyShape is not defined", weil die
     neue Engine noch nicht verfolgt war). */
  const verfolgt = new Set(/* maxBuffer wie im Release-Bauer: die Dateiliste dieses Repositories
     sprengt den Standardpuffer (ENOBUFS). */
    execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
    .split("\0").filter(Boolean));
  const fehlen = [];
  for (const ziel of [...verlinkteZiele(), ...seitenZiele()]) {
    /* Wie wirdAusgeliefert(): weder Abfrage noch Fragment gehoeren zum
       Dateipfad ("/discover/#/s/US_REAL/NVDA" ist die Datei /discover/). */
    const rein = ziel.split("?")[0].split("#")[0].replace(/^\/+/, "");
    if (!rein) continue;
    /* Der Schraegstrich wird EINMAL gesetzt. Ein frueherer Entwurf hat
       "quant/stock/" + "/index.html" gerechnet und die Seite deshalb fuer
       fehlend erklaert, obwohl sie da und verfolgt ist - der Test hat sich
       selbst einen Befund gebaut. */
    const basis = rein.replace(/\/+$/, "");
    const kandidaten = [basis, basis + ".html", basis + "/index.html"];
    if (!kandidaten.some((k) => verfolgt.has(k))) fehlen.push(ziel);
  }
  assert.deepEqual(fehlen, [],
    "diese Ziele sind nicht in git verfolgt und fehlen deshalb im Release: " + fehlen.join(", "));
});

test("the methodology page is among the targets and exists", () => {
  /* Der gemessene Fall, ausdruecklich festgehalten: er war der Grund fuer
     diese Datei. */
  const ziele = verlinkteZiele();
  assert.ok(ziele.includes("/quant/methodology/"),
    "der Knopf 'Methodik im Detail' zeigt nicht mehr auf /quant/methodology/");
  assert.equal(wirdAusgeliefert("/quant/methodology/"), true);
});

test("every hash route the app links to is understood by QXApp.parse", () => {
  const liste = hashRouten();
  /* Selbstpruefung: die fuenf Bereiche der Navigation muessen gefunden
     werden. Gezaehlt am 30.09.2026: 11 verschiedene '#/...'-Zeichenketten
     (die meisten Links entstehen ueber X.routes.*, siehe naechster Test);
     die Untergrenze 8 faengt einen kaputten Auszug, ohne bei jeder
     entfernten Route nachgezogen werden zu muessen. */
  for (const r of ["#/", "#/screener", "#/strategien", "#/aktien", "#/methodik"]) {
    assert.ok(liste.includes(r), "der Auszug findet " + r + " nicht mehr (" + liste.length + " Routen)");
  }
  assert.ok(liste.length >= 8, "nur " + liste.length + " Hash-Routen gefunden - der Auszug greift nicht mehr");
  /* Eine Zeichenkette, die auf "/" endet, ist ein Praefix fuer einen
     Laufzeitwert (Ticker, Strategie-Id) - gepruft wird das Muster mit
     einem Beispielwert. */
  const unbekannt = liste.filter((r) => parse(r !== "#/" && r.endsWith("/") ? r + "NVDA" : r).view === "notfound");
  assert.deepEqual(unbekannt, [], "diese Hash-Routen kennt QXApp.parse nicht: " + unbekannt.join(", "));
});

test("the route builders and the legacy mapping only produce routes QXApp.parse understands", () => {
  /* Die meisten Links entstehen zur Laufzeit ueber X.routes.* - jede
     Funktion wird mit Beispielwerten ausgewertet. */
  const erwartet = {
    home: ["home"], stock: ["aktie", "NVDA"], screener: ["screener", "frage=setups"], screenerPro: ["screener", "query=x"],
    strategies: ["strategien"], strategy: ["strategien", "quality"], stocks: ["aktien"], method: ["methodik", "faktoren"],
    technical: ["technik", "NVDA"], fundamentals: ["zahlen", "NVDA"], compare: ["vergleich", ["NVDA", "AAPL"]],
    /* Quant Radar (01.10.2026): taegliche Ereignisse, Bereich HOME. */
    radar: ["radar", "filter=setups"],
    /* Backtest & Signal Intelligence (01.10.2026): Regel oder Setup waehlen. */
    backtest: ["backtest", "NEW_52W_HIGH"],
    /* Chartbild (02.10.2026): technische Lage einer Aktie und Uebersicht der Lagen. */
    chartbild: ["chartbild", "NVDA"], chartlagen: ["chartlagen", "reihe=near-entry"]
  };
  assert.deepEqual(Object.keys(routes).sort(), Object.keys(erwartet).sort(),
    "X.routes hat sich geaendert - dieser Test muss die neue Route kennen");
  for (const [name, [view, arg]] of Object.entries(erwartet)) {
    assert.equal(parse(routes[name](arg)).view, view, "X.routes." + name + " -> " + routes[name](arg));
    /* Ohne Wert muss nur eine Route ohne Pflichtwert funktionieren. */
    if (!["stock", "technical", "fundamentals", "chartbild"].includes(name)) {
      assert.notEqual(parse(routes[name]()).view, "notfound", "X.routes." + name + "() ohne Wert fuehrt ins Leere");
    }
  }
  /* Alte Links (?view=...) von /vu2/ und /Quant/ landen nach EINEM Sprung
     auf einer Route, die parse kennt - nie auf "notfound". */
  const views = [...funktion(appJs, "legacyRoute").matchAll(/\b([a-z]+):\s*(?:"#|okT)/g)].map((m) => m[1]);
  /* gezaehlt am 30.09.2026: 23 alte Ansichten */
  assert.ok(views.length >= 20, "nur " + views.length + " alte Ansichten gefunden - der Auszug greift nicht mehr");
  for (const view of views) {
    for (const search of ["?view=" + view, "?view=" + view + "&ticker=NVDA", "?view=" + view + "&tickers=NVDA,AAPL&query=x&faktoren=value"]) {
      const ziel = legacyRoute(search);
      assert.ok(ziel && ziel.startsWith("#/"), search + " -> " + ziel);
      assert.notEqual(parse(ziel).view, "notfound", search + " -> " + ziel + " kennt parse nicht");
    }
  }
});
