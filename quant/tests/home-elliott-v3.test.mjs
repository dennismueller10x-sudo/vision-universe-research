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

test("Startseite: Elliott fuer NVDA und die Beobachtungsliste kommt aus dem Chartbild", { skip: !existsSync(shardOf("NVDA")) && "v3-Daten fehlen" }, () => {
  const out = join(mkdtempSync(join(tmpdir(), "home-")), "index.html");
  const log = execFileSync(process.execPath, [join(ROOT, "scripts/home/build-home.mjs"), "--out=" + out], { cwd: ROOT }).toString();
  const html = readFileSync(out, "utf8");
  const E = JSON.parse(gunzipSync(readFileSync(shardOf("NVDA"))).toString()).instruments.NVDA.pro.elliott;
  const abstain = !E || !E.primary || !E.applicability || E.applicability.abstain;
  if (abstain) {
    assert.match(html, /keine belastbare Zählung/);
    assert.match(log, /Elliott –/, "bei Enthaltung keine Wellenpunkte im Hauptchart");
    assert.doesNotMatch(html, /class="wn"/);
  } else {
    assert.doesNotMatch(html, /keine belastbare Zählung<\/b>/);
  }
  /* Kein V1-Wortlaut und kein Link mehr auf die abgeloeste Technikseite */
  assert.doesNotMatch(html, /regelbasiert · Beta|Method Fit|technik\?elliott=1/);
  assert.match(html, /chartbild\?ansicht=profi/);
  assert.match(html, /experimentell/);
});
