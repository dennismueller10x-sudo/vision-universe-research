/* Generationenmanifest der Auslieferung (ADR-008, Strang T): Vertragstest RM.
   Gleiche gepinnte Eingaben ergeben denselben Nutzdatenhash, ob CI (Datenzweig VOR dem Bau) oder Pages (Overlay NACH dem Bau).
   Gegenproben: veraenderter Inhalt, vertauschte Datenreferenz, fehlende Datenart und der alte Fehler (CI ohne Datenzweig) muessen scheitern. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { overlay } from "../../scripts/ci/overlay-data-branch.mjs";
import { buildManifest, writeManifest, comparePayload, payloadDigest, dataTypes, MANIFEST_PATH, SCHEMA, VOLATILE_KEYS } from "../../scripts/vu2/release-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOMAINS = JSON.parse(readFileSync(join(ROOT, "core/registry/domains.json"), "utf8"));
const BRANCH = JSON.parse(readFileSync(join(ROOT, "core/registry/data-branch.json"), "utf8"));
const NEWS = "dashboard/data/news_feed.json";
const put = (dir, p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
const tmp = (n) => mkdtempSync(join(tmpdir(), "rm-" + n + "-"));
const feed = (ts, n) => JSON.stringify({ updated_at: ts, generatedAt: ts, items: Array.from({ length: n }, (_, i) => ({ id: i })) });
const sha = "a".repeat(40), dsha = "b".repeat(40);
const opts = (site, extra = {}) => ({ root: ROOT, site, dataBranchSha: dsha, builtAt: "2026-01-01T00:00:00Z", ...extra });
const withCode = (f) => { process.env.VU_CODE_SHA = sha; try { return f(); } finally { delete process.env.VU_CODE_SHA; } };
const only = (m, id) => m.dataTypes.find((e) => e.id === id);

/* Eine Welt: main haelt den alten Stand, der Datenzweig den neuen. */
function world() {
  const main = tmp("main"), data = tmp("data");
  put(main, NEWS, feed("2026-11-09T00:00:00Z", 5));
  put(data, NEWS, feed("2026-11-10T00:00:00Z", 6));
  return { main, data };
}
const manifest = { branch: "data/live", domains: [{ id: "news", phase: "BRANCH_ONLY", paths: [NEWS] }] };
const run = (o) => overlay({ ...o, manifest, domains: DOMAINS });

/* Pages: bauen aus main, danach Datenzweig ueber die Auslieferung. */
function pagesSite({ main, data }) {
  const site = tmp("pages"); copyFileSync(join(main, NEWS), (mkdirSync(dirname(join(site, NEWS)), { recursive: true }), join(site, NEWS)));
  run({ root: main, dataDir: data, siteDir: site });
  return site;
}
/* CI: Datenzweig in den Arbeitsbaum (seed-data-branch.sh, mirror false), dann bauen = Arbeitsbaum kopieren. */
function ciSite({ main, data }, { seed = true } = {}) {
  const work = tmp("work"); copyFileSync(join(main, NEWS), (mkdirSync(dirname(join(work, NEWS)), { recursive: true }), join(work, NEWS)));
  if (seed) run({ root: work, dataDir: data, siteDir: work, mirror: false });
  const site = tmp("ci"); mkdirSync(dirname(join(site, NEWS)), { recursive: true }); copyFileSync(join(work, NEWS), join(site, NEWS));
  return site;
}

test("RM-1 · Schema: Code-SHA, Datenzweig-SHA, je Datenart Pfad + Hash, Generationen, Gesamthash, variable Felder gekennzeichnet", () => withCode(() => {
  const { main, data } = world(), m = buildManifest(opts(pagesSite({ main, data })));
  assert.equal(m.schema, SCHEMA); assert.equal(m.code.sha, sha); assert.equal(m.dataBranch.sha, dsha); assert.equal(m.dataBranch.name, BRANCH.branch);
  assert.match(m.payloadHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(m.volatile.keys, VOLATILE_KEYS); assert.match(m.volatile.note, /Nicht im payloadHash/);
  const n = only(m, "news") || m.dataTypes.find((e) => e.path === NEWS);
  assert.equal(n.state, "PRESENT"); assert.match(n.payloadSha256, /^[0-9a-f]{64}$/);
  assert.ok("companyIntelligenceGeneration" in m && "securityMasterGeneration" in m);
  assert.ok(m.dataTypes.length >= DOMAINS.domains.filter((d) => d.artifact).length, "jede Datenart mit Artefakt steht im Manifest");
}));

test("RM-2 · Gleiche Eingaben, gleicher Hash - Zeitstempel und Bauzeit zaehlen nicht", () => withCode(() => {
  const w = world(), a = buildManifest(opts(pagesSite(w))), b = buildManifest(opts(pagesSite(w), { builtAt: "2030-05-05T05:05:05Z" }));
  assert.equal(a.payloadHash, b.payloadHash);
  const s1 = tmp("v1"), s2 = tmp("v2"); put(s1, NEWS, feed("2026-11-10T00:00:00Z", 6)); put(s2, NEWS, feed("2099-01-01T00:00:00Z", 6));
  assert.equal(buildManifest(opts(s1)).payloadHash, buildManifest(opts(s2)).payloadHash, "nur generatedAt/updated... unterscheidet sich");
  assert.notEqual(only(buildManifest(opts(s1)), "news:" + NEWS)?.bytesSha256 ?? "x", only(buildManifest(opts(s2)), "news:" + NEWS)?.bytesSha256 ?? "y", "roher Stand bleibt sichtbar");
}));

test("RM-3 · CI (Datenzweig vor dem Bau) und Pages (Overlay nach dem Bau) ergeben denselben Nutzdatenhash", () => withCode(() => {
  const w = world(), ci = buildManifest(opts(ciSite(w))), pages = buildManifest(opts(pagesSite(w)));
  assert.equal(ci.payloadHash, pages.payloadHash); assert.deepEqual(comparePayload(ci, pages), { equal: true, diff: [] });
}));

test("RM-3b · Gegenprobe: ein CI-Bau OHNE Datenzweig (der Fehler vom 10.11.) weicht ab und wird benannt", () => withCode(() => {
  const w = world(), ci = buildManifest(opts(ciSite(w, { seed: false }))), pages = buildManifest(opts(pagesSite(w)));
  const r = comparePayload(ci, pages);
  assert.notEqual(ci.payloadHash, pages.payloadHash); assert.equal(r.equal, false);
  assert.ok(r.diff.some((d) => d.reason === "CONTENT_DIFFERS" && d.id.includes("news") || d.id === "news"), JSON.stringify(r.diff));
}));

test("RM-4 · Gegenprobe: veraenderter Inhalt aendert den Hash", () => withCode(() => {
  const w = world(), site = pagesSite(w), before = buildManifest(opts(site));
  put(site, NEWS, feed("2026-11-10T00:00:00Z", 7));
  const after = buildManifest(opts(site)); assert.notEqual(before.payloadHash, after.payloadHash);
  assert.ok(comparePayload(before, after).diff.some((d) => d.reason === "CONTENT_DIFFERS"));
}));

test("RM-5 · Gegenprobe: vertauschte Datenreferenz (zwei Datenarten tauschen ihre Dateien) wird erkannt", () => withCode(() => {
  const [x, y] = dataTypes(ROOT).filter((t) => !t.path.endsWith(".gz")).slice(0, 2);
  const a = tmp("sa"), b = tmp("sb"), A = JSON.stringify({ rows: [1, 2, 3] }), B = JSON.stringify({ rows: [9, 8] });
  put(a, x.path, A); put(a, y.path, B); put(b, x.path, B); put(b, y.path, A);
  const ma = buildManifest(opts(a)), mb = buildManifest(opts(b));
  assert.notEqual(ma.payloadHash, mb.payloadHash);
  const d = comparePayload(ma, mb).diff.map((e) => e.id).sort(); assert.deepEqual(d, [x.id, y.id].sort());
}));

test("RM-6 · Gegenprobe: fehlende Datenart wird als ABSENT gefuehrt und aendert den Hash", () => withCode(() => {
  const w = world(), site = pagesSite(w), full = buildManifest(opts(site));
  const t = dataTypes(ROOT).find((e) => e.path === NEWS), gone = tmp("gone");
  assert.ok(t); const m = buildManifest(opts(gone));
  assert.equal(m.dataTypes.find((e) => e.path === NEWS).state, "ABSENT"); assert.notEqual(m.payloadHash, full.payloadHash);
  assert.ok(comparePayload(full, m).diff.some((d) => d.reason === "STATE_DIFFERS"));
}));

test("RM-7 · writeManifest legt /core/release-manifest.json ab; build-release.mjs ruft es bei jedem Releasebau auf", () => withCode(() => {
  const site = tmp("w"); const m = writeManifest(opts(site, { stage: "BUILT" }));
  assert.ok(existsSync(join(site, MANIFEST_PATH))); assert.equal(JSON.parse(readFileSync(join(site, MANIFEST_PATH), "utf8")).payloadHash, m.payloadHash);
  const src = readFileSync(join(ROOT, "scripts/vu2/build-release.mjs"), "utf8");
  assert.match(src, /try\{writeManifest\(\{root,site:output,stage:'BUILT'\}\);\}catch/, "Manifest-Fehler darf den Bau nicht abbrechen");
  /* Gegenprobe: derselbe Aufruf steht NACH dem Bericht und damit auf dem einzigen Rueckgabeweg von buildRelease. */
  assert.ok(src.indexOf("writeManifest({root") > src.indexOf("release-delivery.json"));
}));

test("RM-8 · Inhaltsstand: Schluesselreihenfolge und Zeitstempelfelder zaehlen nicht, Werte schon", () => {
  const h = (o, ts = []) => payloadDigest(Buffer.from(JSON.stringify(o)), { path: "x.json", timestamp: ts }).payloadSha256;
  assert.equal(h({ a: 1, b: 2 }), h({ b: 2, a: 1 }));
  assert.equal(h({ a: 1, meta: { at: "x" } }, ["meta.at"]), h({ a: 1, meta: { at: "y" } }, ["meta.at"]));
  assert.notEqual(h({ a: 1 }), h({ a: 2 }));
});

test("RM-9 · pages-release.yml siegelt das Manifest nach Overlay und Stempel; ci.yml prueft es im Releasebau", () => {
  const pages = readFileSync(join(ROOT, ".github/workflows/pages-release.yml"), "utf8"), ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const seal = pages.indexOf("release-manifest.mjs"); assert.ok(seal > 0, "Siegel-Schritt fehlt");
  assert.ok(seal > pages.indexOf("overlay-data-branch.mjs") && seal > pages.indexOf("scripts/vu2/release-id.mjs"), "Siegel nach Overlay und Stempel");
  assert.ok(seal < pages.indexOf("actions/upload-pages-artifact"), "Siegel vor dem Hochladen");
  assert.match(ci, /core\/release-manifest\.json/);
  /* Der Siegel-Schritt blockiert nie: continue-on-error, Warnung statt Fehlercode, Ende mit exit 0, kein set -e. */
  const step = pages.slice(pages.indexOf("- name: Seal release generation manifest"), pages.indexOf("# Gegen das GEBAUTE Release"));
  assert.match(step, /continue-on-error: true/); assert.match(step, /::warning::/); assert.match(step, /exit 0\s*$/m); assert.doesNotMatch(step, /set -e/);
});
