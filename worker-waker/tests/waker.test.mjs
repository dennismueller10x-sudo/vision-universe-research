/* =========================================================================
   DER WECKER AUF DEM PRUEFSTAND

   Ein Wecker, der zu oft klingelt, ist ein Trigger-Sturm. Einer, der
   still ausfaellt, ist schlimmer als keiner - weil niemand merkt, dass er
   fehlt. Beide Faelle stehen hier, jeder mit Gegenprobe.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { wecke } = await import(join(root, "worker-waker", "src", "index.mjs"));

const REPO = "eigner/repo";
const TOKEN = "ghp_nurFuerDenTest";

/* Ein Doppelgaenger von fetch, der aufschreibt, was gefragt wurde. */
function netz(antworten) {
  const gerufen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    gerufen.push({ url: String(url), method: (opts && opts.method) || "GET",
                   headers: (opts && opts.headers) || {}, body: opts && opts.body });
    const treffer = antworten.find((a) => String(url).includes(a.enthaelt));
    if (!treffer) throw new Error("unerwarteter Aufruf: " + url);
    return {
      ok: treffer.ok !== false,
      status: treffer.status || (treffer.ok === false ? 500 : 200),
      json: async () => treffer.json || {}
    };
  };
  return { gerufen, zurueck: () => { globalThis.fetch = original; } };
}

function protokoll() {
  const zeilen = [];
  const original = console.log;
  console.log = (z) => zeilen.push(String(z));
  return { zeilen, zurueck: () => { console.log = original; } };
}

test("WK-1 ohne Token wird nichts ausgeloest, und der Wecker sagt es", async () => {
  const p = protokoll();
  const n = netz([]);
  try {
    const r = await wecke({ GITHUB_REPO: REPO });
    assert.equal(r.ok, false);
    assert.equal(r.grund, "keinToken");
    assert.equal(n.gerufen.length, 0, "ohne Token darf kein Netzaufruf passieren");
    assert.ok(p.zeilen.some((z) => /keinToken/.test(z)),
              "ein stiller Leerlauf waere schlimmer als gar kein Wecker");
  } finally { n.zurueck(); p.zurueck(); }
});

test("WK-2 laeuft schon ein Block, wird nicht geweckt", async () => {
  const p = protokoll();
  const n = netz([{ enthaelt: "/runs?status=in_progress", json: { total_count: 1 } }]);
  try {
    const r = await wecke({ GITHUB_REPO: REPO, GITHUB_DISPATCH_TOKEN: TOKEN });
    assert.equal(r.grund, "bereitsWach");
    assert.ok(!n.gerufen.some((g) => g.url.endsWith("/dispatches")),
              "ein zweiter Block waere ein Trigger-Sturm mit Wartezimmer");
  } finally { n.zurueck(); p.zurueck(); }
});

test("WK-3 Gegenprobe: laeuft keiner, wird geweckt", async () => {
  const p = protokoll();
  const n = netz([
    { enthaelt: "/runs?status=in_progress", json: { total_count: 0 } },
    { enthaelt: "/dispatches", json: {} }
  ]);
  try {
    const r = await wecke({ GITHUB_REPO: REPO, GITHUB_DISPATCH_TOKEN: TOKEN });
    assert.equal(r.grund, "geweckt");
    const d = n.gerufen.find((g) => g.url.endsWith("/dispatches"));
    assert.ok(d, "es haette gedispatcht werden muessen");
    assert.equal(d.method, "POST");
    assert.match(d.body, /"event_type":"intraday-tick"/);
  } finally { n.zurueck(); p.zurueck(); }
});

test("WK-4 bei unbekannter Lage wird geweckt, nicht geschwiegen", async () => {
  /* Die sichere Richtung: ein ueberfluessiger Block endet in Sekunden,
     ein ausgefallener Takt kostet eine Stunde Stillstand. */
  const p = protokoll();
  const n = netz([
    { enthaelt: "/runs?status=in_progress", ok: false, status: 403 },
    { enthaelt: "/dispatches", json: {} }
  ]);
  try {
    const r = await wecke({ GITHUB_REPO: REPO, GITHUB_DISPATCH_TOKEN: TOKEN });
    assert.equal(r.grund, "geweckt");
    assert.ok(p.zeilen.some((z) => /lageUnbekannt/.test(z)));
  } finally { n.zurueck(); p.zurueck(); }
});

test("WK-5 ein fehlgeschlagenes Wecken wird gemeldet, nicht verschluckt", async () => {
  const p = protokoll();
  const n = netz([
    { enthaelt: "/runs?status=in_progress", json: { total_count: 0 } },
    { enthaelt: "/dispatches", ok: false, status: 401 }
  ]);
  try {
    const r = await wecke({ GITHUB_REPO: REPO, GITHUB_DISPATCH_TOKEN: TOKEN });
    assert.equal(r.ok, false);
    assert.equal(r.grund, "http401");
    assert.ok(p.zeilen.some((z) => /weckenFehlgeschlagen/.test(z)));
  } finally { n.zurueck(); p.zurueck(); }
});

test("WK-6 kein Token landet im Protokoll", async () => {
  const p = protokoll();
  const n = netz([
    { enthaelt: "/runs?status=in_progress", json: { total_count: 0 } },
    { enthaelt: "/dispatches", json: {} }
  ]);
  try {
    await wecke({ GITHUB_REPO: REPO, GITHUB_DISPATCH_TOKEN: TOKEN });
    const text = p.zeilen.join("\n");
    assert.ok(!text.includes(TOKEN), "Cloudflare-Protokolle sind lesbar");
    assert.ok(!/Bearer/.test(text));
  } finally { n.zurueck(); p.zurueck(); }
});

/* --- Fall 15: Zero Cost ------------------------------------------------ */

/* Der erste Anlauf dieser beiden Pruefungen fiel an den eigenen
   Kommentaren: "Kein Durable Object", "Kein Tiingo-Schluessel", "kein
   WebSocket" stehen dort als ERKLAERUNG, warum etwas fehlt - und eine
   Textsuche kann eine Erklaerung nicht von einer Konfiguration
   unterscheiden. Dieselbe Falle wie bei SS-17 im September. Gesucht wird
   deshalb im entkommentierten Text, und WK-10 beweist, dass das
   Entkommentieren wirkt. */
function ohneKommentare(text, stil) {
  if (stil === "toml") {
    return text.split("\n").filter((z) => !/^\s*#/.test(z)).join("\n");
  }
  return text.replace(/\/\*[\s\S]*?\*\//g, "")
             .split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");
}

test("WK-7 der Wecker aktiviert nichts Kostenpflichtiges", () => {
  const toml = ohneKommentare(readFileSync(join(root, "worker-waker", "wrangler.toml"), "utf8"), "toml");
  for (const verboten of ["durable_objects", "kv_namespaces", "r2_buckets",
                          "d1_databases", "usage_model", "TIINGO"]) {
    assert.ok(!toml.includes(verboten), verboten + " gehoert nicht in einen Wecker");
  }
  assert.match(toml, /crons\s*=/, "ohne Cron ist es kein Wecker");
});

test("WK-8 der Wecker holt keine Kurse", () => {
  const quelle = ohneKommentare(readFileSync(join(root, "worker-waker", "src", "index.mjs"), "utf8"), "js");
  for (const verboten of ["tiingo", "api.tiingo.com", "websocket", "WebSocket", "DurableObject"]) {
    assert.ok(!quelle.includes(verboten),
              "er ist ein Wecker, keine zweite Pipeline - gefunden: " + verboten);
  }
  assert.ok(quelle.includes("api.github.com"), "er spricht genau mit einem Dienst");
});

test("WK-10 Gegenprobe: das Entkommentieren versteckt nur Kommentare", () => {
  assert.equal(ohneKommentare("# usage_model = x\nname = \"a\"", "toml").trim(), 'name = "a"');
  assert.ok(ohneKommentare("/* DurableObject */\nconst a = 1;", "js").includes("const a = 1;"));
  assert.ok(!ohneKommentare("/* DurableObject */\nconst a = 1;", "js").includes("DurableObject"));
  /* Und das Entscheidende: echter Code wird NICHT versteckt. */
  assert.ok(ohneKommentare("const x = new DurableObject();", "js").includes("DurableObject"));
  assert.ok(ohneKommentare("usage_model = \"unbound\"", "toml").includes("usage_model"));
});

test("WK-9 der Cron des Weckers und der Takt des Taktgebers passen zusammen", () => {
  const toml = readFileSync(join(root, "worker-waker", "wrangler.toml"), "utf8");
  const m = /crons\s*=\s*\[\s*"([^"]+)"/.exec(toml);
  assert.ok(m, "kein Cron gefunden");
  assert.match(m[1], /^\*\/5 /, "der Wecker muss mindestens so oft nachsehen wie der Zieltakt");
});
