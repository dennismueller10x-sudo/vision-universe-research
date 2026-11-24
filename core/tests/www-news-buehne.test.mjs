// News-Buehne (landing/web/sub.js + sub.css, Ladezeit 24.11.2026): Folien 2-5 laden ihr Bild erst kurz vor dem Wechsel,
// beim Wechsel erscheint nie eine leere oder halb geladene Folie. Beleg im echten Browser: scripts/website/news-buehne-qa.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const src = (f) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");

test("Buehne: Quelle trägt die Freigabe vor dem Wechsel und das Warten auf das Bild", () => {
  const css = src("landing/web/sub.css"), js = src("landing/web/sub.js");
  assert.match(css, /\.ts-sl:not\(\.on\):not\(\.nx\):not\(\.was\) \.ts-art\{content-visibility:hidden\}/, "nicht gezeigte Folien rendern ihr Bild nicht");
  assert.match(css, /\.ts-art\{[^}]*aspect-ratio:16\/9/, "die Fläche bleibt durch aspect-ratio (kein Layoutsprung)");
  assert.match(js, /var frei = function \(n\)/);
  assert.match(js, /im\.loading = "eager"/, "freigegebene Folie startet ihr Bild sofort");
  assert.match(js, /setTimeout\(los, 1500\)/, "der Wechsel wartet höchstens 1,5 s auf das Bild");
  assert.match(js, /classList\.add\("was"\)/, "die verlassene Folie blendet aus (Überblendung bleibt)");
  assert.match(js, /document\.readyState === "complete"\) ersteFreigabe\(\); else addEventListener\("load"/, "Folie 2 wird nach dem load-Ereignis freigegeben");
  assert.match(js, /setTimeout\(function \(\) \{ if \(sl\.length > 1\) frei\(cur \+ 1\); \}, 3000\)/, "die nächste Folie wird 3 s vor dem Wechsel freigegeben");
  // Die Bilder bleiben im HTML mit src (Suchmaschinen, KI-Suche, ohne JavaScript).
  const html = src("landing/news/index.html");
  const hero = html.match(/<div class="ts-sl[^"]*"[^>]*><div class="ts-art"><img [^>]*>/g) || [];
  assert.equal(hero.length, 5);
  for (const h of hero) assert.match(h, / src="/);
});

test("Buehne im Browser: Folien 2-5 laden spät, kein Wechsel ohne fertiges Bild", { timeout: 120000 }, async (t) => {
  let pw;
  try { pw = createRequire(import.meta.url)("playwright"); await (await pw.chromium.launch()).close(); } catch { t.skip("kein Chromium in dieser Umgebung"); return; }
  const { pruefeBuehne } = await import("../../scripts/website/news-buehne-qa.mjs");
  for (const ohneCv of [false, true]) {
    const r = await pruefeBuehne({ engine: "chromium", ohneCv });
    const rot = r.pruefungen.filter((x) => !x.pass).map((x) => x.name + " " + JSON.stringify(x.detail).slice(0, 200));
    assert.deepEqual(rot, [], "Buehne (ohne content-visibility: " + ohneCv + ")");
  }
});
