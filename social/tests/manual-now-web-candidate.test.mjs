/* =========================================================================
   VU SOCIAL — social/tests/manual-now-web-candidate.test.mjs

   DEUTSCHER HOOK/CAPTION AUS DEM CREATIVE AGENTEN (Owner-Direktive
   "WEB-FIRST + FULL-POST-GENERATION", 24.09., §5.1)

   holeAsset() in scripts/social/manual-now-web-candidate.mjs holte bis
   hierher nur das Bild-Asset aus dem verifizierten Agenten-Ergebnis —
   Hook und Caption kamen unveraendert aus web-story-selection.json,
   also aus dem oft englischen Quelltext (realer Befund:
   cand_20260924_d052c375, "10-year U.S. Treasury yield tops 5.1%..."
   woertlich als Hook). Diese Tests belegen gegen ECHTE Fixture-Bytes
   (pr98, wie chatgpt-work-author.test.mjs), dass holeAsset() jetzt den
   vom Agenten gelieferten (und von German.clean() bereits orthografisch
   bereinigten) Hook/Caption-Text zurueckgibt — und dass ein Agent, der
   die deutsche Uebersetzung ignoriert, nicht am Adapter, sondern erst
   am Hard Final Creative Gate scheitert (HOOK_CAPTION_GERMAN).
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { holeAsset } from "../../scripts/social/manual-now-web-candidate.mjs";

const require = createRequire(import.meta.url);
const CreativeGate = require("../engines/creative-gate.js");

const HIER = dirname(fileURLToPath(import.meta.url));
const F = (p) => join(HIER, "fixtures", p);

const BRIEF_ROH = readFileSync(F("pr98/authoring-brief.json"));
const ERGEBNIS_ROH = JSON.parse(readFileSync(F("pr98/authoring-result.json"), "utf8"));
const ASSET = readFileSync(F("creative-visual-proof.png"));

/** Legt Brief, Ergebnis und Asset unter einem frischen ROOT genau dort
    ab, wo transportFuer() (manual-now-web-candidate.mjs) sie erwartet —
    dieselbe Verzeichnisform wie im echten Request-Branch. */
function bereiteRoot(ergebnisUeberschreiben) {
  const ergebnis = JSON.parse(JSON.stringify(ERGEBNIS_ROH));
  Object.assign(ergebnis, ergebnisUeberschreiben || {});
  ergebnis.visual_variants.forEach((v) => { v.asset_byte_size = ASSET.length; });

  const root = mkdtempSync(join(tmpdir(), "vu-manual-now-web-"));
  const dir = join(root, "authoring/requests", ergebnis.content_id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "authoring-brief.json"), BRIEF_ROH);
  writeFileSync(join(dir, "authoring-result.json"), JSON.stringify(ergebnis, null, 2));
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(root, ergebnis.visual_variants[0].asset_path), ASSET);

  return { root, ergebnis };
}

test("MNW1 · holeAsset liefert Hook/Caption vom Creative Agenten, nicht nur das Bild", () => {
  const { root, ergebnis } = bereiteRoot();
  try {
    const r = holeAsset(ergebnis.content_id, root);
    assert.equal(r.ok, true, r.reason || "");
    assert.equal(r.hook, ergebnis.hook_variants[0].text);
    assert.equal(r.caption, ergebnis.caption);
    assert.ok(r.asset && r.asset.asset_path);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MNW2 · Ein englischer Agenten-Hook besteht das Adapter-Ergebnis, aber nicht das " +
  "Hard Final Creative Gate (HOOK_CAPTION_GERMAN)", () => {
  /* Genau der reale Befund vom 24.09.: der Titel kam woertlich aus
     Seeking Alpha Market Currents. */
  const englisch = "10-year U.S. Treasury yield tops 5.1%, marking its highest " +
    "level since 2007.";
  const roh = JSON.parse(JSON.stringify(ERGEBNIS_ROH));
  roh.hook_variants[0].text = englisch;
  const { root, ergebnis } = bereiteRoot(roh);
  try {
    const r = holeAsset(ergebnis.content_id, root);
    assert.equal(r.ok, true, r.reason || "");
    assert.equal(r.hook, englisch);

    const gate = CreativeGate.pruefe(
      { presentation: { hook: r.hook, caption: r.caption, captionBase: r.caption,
          reason: "Test", hashtags: ["Test"], visualOrigin: "generative",
          visualType: "GENERATIVE" },
        contentHash: "abc", content: { imageUrl: "https://x/y.jpg", caption: r.caption } },
      { rendered: true, atlasBefund: { passed: true }, logoBefund: { passed: true },
        assetExists: true });

    assert.equal(gate.ok, false);
    assert.ok(gate.verstoesse.some((v) => v.id === "HOOK_CAPTION_GERMAN"),
      gate.erklaerung);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
