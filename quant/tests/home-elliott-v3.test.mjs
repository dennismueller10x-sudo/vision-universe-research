/* Startseite: Elliott-Aussage aus dem Chartbild (v3), nie aus der V1-Engine.
   Vorher zeigte die Startseite "NVDA Welle 3" mit Wellenpunkten aus technical-signals-v1, waehrend das Chartbild
   (Elliott 3.2.2) sich fuer NVDA enthielt - zwei widerspruechliche Elliott-Aussagen auf der Plattform. */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const shardOf = (t) => join(ROOT, "quant/data/technical-intelligence/v3/shards", (t + "_").slice(0, 2) + ".json.gz");

test("Startseite: keine Elliott-Aussage ausser dem Chartbild, nur der Weg auf /elliott/", { skip: !existsSync(shardOf("NVDA")) && "v3-Daten fehlen" }, () => {
  const out = join(mkdtempSync(join(tmpdir(), "home-")), "index.html");
  const log = execFileSync(process.execPath, [join(ROOT, "scripts/home/build-home.mjs"), "--out=" + out], { cwd: ROOT }).toString();
  const html = readFileSync(out, "utf8");
  void gunzipSync;
  /* Seit dem Redesign (Mockup E01) macht die Startseite keine eigene Elliott-Aussage mehr: keine Welle, keine
     Wellenpunkte. Damit kann sie dem Chartbild nicht widersprechen; sie fuehrt nur auf die Elliott-Welt. */
  assert.doesNotMatch(html, /class="wn"|Welle \d|Welle [A-E]\b/);
  assert.doesNotMatch(log, /Elliott [0-9(]/);
  /* Kein V1-Wortlaut und kein Link mehr auf die abgeloeste Technikseite */
  assert.doesNotMatch(html, /regelbasiert · Beta|Method Fit|technik\?elliott=1/);
  /* Elliott ist ein Produkt: die Startseite fuehrt auf /elliott/, nicht auf eine feste Aktie. */
  assert.match(html, /href="\/elliott\/"/);
  assert.doesNotMatch(html, /aktie\/NVDA\/chartbild/);
  assert.match(html, /experimentell/);
});
