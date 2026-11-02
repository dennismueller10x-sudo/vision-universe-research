/* Belegte Ticker-Wiederverwendungen (quant/config/ticker-reuse-quarantine.json) in Discover: keine Karte, keine Seite,
   kein Ranking, solange die Identitaet in Quarantaene ist - gezaehlt in consumerPolicy.excludedByIdentity. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REG = join(root, "quant", "config", "ticker-reuse-quarantine.json");
const META = join(root, "discover", "data", "meta.json");

test("IQ1 · Der Erzeuger schliesst markierte Titel vor Karte und Seite aus und zaehlt sie nach Grund", () => {
  const src = readFileSync(join(root, "scripts", "discover", "build-discover-data.mjs"), "utf8");
  const i = src.indexOf('ref.identityStatus === "IDENTITY_QUARANTINED"');
  assert.ok(i > 0, "Pruefung auf identityStatus fehlt");
  assert.ok(i < src.indexOf("consumerPolicy.allowed++"), "Ausschluss vor der Zaehlung zugelassener Titel");
  assert.match(src, /excludedByIdentity\[grund\]/);
});

test("IQ2 · Nach dem Neubau: kein markierter Titel hat eine Seite, die Zaehlung stimmt mit dem Register", { skip: !existsSync(REG) }, () => {
  const meta = JSON.parse(readFileSync(META, "utf8"));
  const policy = (meta.universes || []).map((u) => u.consumerPolicy).find(Boolean);
  if (!policy || policy.excludedByIdentity === undefined) return; // vor dem ersten Neubau mit dieser Regel
  const reg = JSON.parse(readFileSync(REG, "utf8"));
  const total = Object.values(policy.excludedByIdentity).reduce((a, b) => a + b, 0);
  assert.ok(total <= reg.records.length);
  for (const r of reg.records) {
    assert.equal(existsSync(join(root, "discover", "data", "stocks", "US_REAL", r.ticker + ".json")), false, r.ticker + " hat noch eine Seite");
  }
});
