/* Pflicht-Hinweise (Strang F): Text nur in assets/legal-notices.json, das Frontend trägt eine erzeugte Kopie
   (scripts/legal/sync-legal-notices.mjs). Vor der Freigabe (legalApproved: false) zeigt keine Seite einen Hinweis. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { legalData } from "../../scripts/legal/sync-legal-notices.mjs";

const require = createRequire(import.meta.url);
const json = JSON.parse(readFileSync("assets/legal-notices.json", "utf8"));

test("die Kopie in vu-ui.js und site-navigation.js entspricht assets/legal-notices.json", () => {
  execFileSync(process.execPath, ["scripts/legal/sync-legal-notices.mjs", "--check"], { stdio: "pipe" });
});

test("vor der Freigabe liefert VUUI.legal nichts", () => {
  const U = require("../../assets/vu-ui.js");
  assert.equal(json.legalApproved === true, false, "dieser Test erwartet den Entwurfsstand; nach der Freigabe anpassen");
  for (const k of Object.keys(json.notices)) assert.equal(U.legal(k), "", k);
  assert.equal(U.legalNotice("footer"), null);
});

test("nach der Freigabe trägt jeder Hinweis den Text und die Links der JSON-Datei", () => {
  const d = legalData(Object.assign({}, json, { legalApproved: true }));
  assert.equal(d.approved, true);
  for (const [k, n] of Object.entries(json.notices)) {
    assert.equal(d.notices[k].text, n.text, k);
    assert.deepEqual(d.notices[k].links.map((l) => l[1]), (n.links || []).filter((x) => json.links[x]).map((x) => json.links[x]), k);
  }
  assert.deepEqual(d.notices.backtest.required, json.notices.backtest.required);
});
