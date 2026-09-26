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
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..", "..");
const seite = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
const { permitted } = await import(new URL("../../scripts/vu2/build-release.mjs", import.meta.url));

/* Die Ziele, die ein Nutzer wirklich anklicken kann: was als `href:` gesetzt
   wird und was `link(label, ziel)` bekommt. Eine blosse Zeichenkette im Code
   ist kein Link - `/shares` etwa ist eine Einheit ("je Aktie") und hat mich
   bei der Messung einmal in die Irre gefuehrt. */
function verlinkteZiele() {
  const ohneKommentare = seite.replace(/\/\*[\s\S]*?\*\//g, "");
  const ziele = new Set();
  for (const m of ohneKommentare.matchAll(/href:\s*'(\/[^']*)'/g)) ziele.add(m[1]);
  for (const m of ohneKommentare.matchAll(/link\(\s*'[^']*'\s*,\s*'(\/[^']*)'/g)) ziele.add(m[1]);
  /* Die Navigationsliste setzt Paare [Label, Pfad]. */
  for (const m of ohneKommentare.matchAll(/\['[^']{2,60}',\s*'(\/[a-z0-9][^']*)'\]/g)) ziele.add(m[1]);
  return [...ziele].sort();
}

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
  assert.ok(ziele.length >= 20, "nur " + ziele.length + " Ziele gefunden - liest dieser Test noch das Richtige?");
  const tot = [];
  for (const ziel of ziele) {
    /* Laufzeitziele der eigenen App (?view=...) pruefen die Smoke-Ansichten;
       hier geht es um Pfade. */
    if (ziel.startsWith("/vu2/?") || ziel === "#") continue;
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
  for (const ziel of verlinkteZiele()) {
    if (ziel.startsWith("/vu2/?") || ziel === "#") continue;
    const rein = ziel.split("?")[0].replace(/^\/+/, "");
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
