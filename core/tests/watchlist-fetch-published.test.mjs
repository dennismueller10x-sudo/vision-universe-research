/* Vergleichsstand der Watchlist-Ereignisse: scripts/watchlist/fetch-published.mjs holt die zuletzt ausgelieferte Uebersicht
   und die Ereignisse (nur lesend). Fehlt etwas, faellt der Lauf nicht um: ohne Uebersicht kein Vergleich (Erstbeobachtung). */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchPublished } from "../../scripts/watchlist/fetch-published.mjs";

const SITE = "https://research.visionuniverse.de";
const fake = (files) => async (url) => {
  const rel = url.slice(SITE.length + 1);
  if (!(rel in files)) return { ok: false, json: async () => null };
  return { ok: true, json: async () => files[rel] };
};
const tmp = (t) => { const d = mkdtempSync(join(tmpdir(), "vu-wl-prev-")); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const S = "core/data/watchlist-summary-v1/";

test("FP-1 · Uebersicht, Scherben und Ereignisse werden abgelegt", async (t) => {
  const out = tmp(t);
  const r = await fetchPublished({ site: SITE, out, fetchImpl: fake({
    [S + "meta.json"]: { shards: ["AA", "B_"] }, [S + "rows/AA.json"]: { shard: "AA", cols: {} }, [S + "rows/B_.json"]: { shard: "B_", cols: {} },
    "core/data/watchlist-events-v1.json": { events: [] } }) });
  assert.deepEqual(r, { summary: true, shards: 2, missing: 0, events: true });
  for (const f of ["summary/meta.json", "summary/rows/AA.json", "summary/rows/B_.json", "events.json"]) assert.ok(existsSync(join(out, f)), f);
});

test("FP-2 · fehlende oder falsche Scherbe wird nicht abgelegt und gezaehlt; ohne Ereignisse kein events.json", async (t) => {
  const out = tmp(t);
  const r = await fetchPublished({ site: SITE, out, fetchImpl: fake({
    [S + "meta.json"]: { shards: ["AA", "BB", "../x"] }, [S + "rows/AA.json"]: { shard: "ZZ" } }) });
  assert.deepEqual(r, { summary: true, shards: 0, missing: 2, events: false });
  assert.ok(!existsSync(join(out, "events.json")) && !existsSync(join(out, "summary/rows/AA.json")));
  assert.deepEqual(JSON.parse(readFileSync(join(out, "summary/meta.json"), "utf8")).shards, ["AA", "BB", "../x"]);
});

test("FP-3 · ohne Uebersicht (erster Lauf, Seite nicht erreichbar) bleibt das Verzeichnis leer, kein Fehler", async (t) => {
  const out = tmp(t);
  assert.deepEqual(await fetchPublished({ site: SITE, out, fetchImpl: async () => { throw Error("offline"); } }), { summary: false, shards: 0, missing: 0, events: false });
  assert.ok(!existsSync(join(out, "summary")));
  await assert.rejects(fetchPublished({ site: "http://example.org", out, fetchImpl: fake({}) }), /SITE_INVALID/);
});
