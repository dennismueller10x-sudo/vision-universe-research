/* Gemeinsame Ladefunktionen der Core-Werkzeuge (system-health, diagnose,
   data-quality). Lokal aus dem Repository oder per HTTP gegen die
   ausgelieferte Seite - dieselben Pfade, dieselbe Bewertung. */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const require = createRequire(import.meta.url);
// fetch kann Content-Encoding bereits entpackt haben; lokale .gz sind komprimiert.
function compressedJson(bytes) {
  return JSON.parse((bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString("utf8"));
}

export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
    else out._.push(a);
  }
  return out;
}

/** Read-only JSONL projection for the existing health contract. This parses records;
 * integrity remains the responsibility of run-paper-2027.mjs verify, not this loader.
 * No activation or registry state is changed. */
export function jsonLinesArtifact(text) {
  const lines = text.split(/\r?\n/).filter(s => s.trim());
  if (!lines.length) throw new Error("EMPTY_JSONL_ARTIFACT");
  const records = lines.map(line => JSON.parse(line));
  if (records.some(r => !r || typeof r !== "object" || Array.isArray(r))) throw new Error("INVALID_JSONL_RECORD");
  const head = records.at(-1);
  // A later correction may refer to an older session; freshness follows the latest session present.
  const sessions = records.map(r => r.session).filter(s => typeof s === "string").sort();
  return { schemaVersion: "jsonl-artifact-head-1.0.0", asOf: sessions.at(-1) || null,
    generatedAt: head.recordedAt || null, records: records.length, head,
    integrity: "NOT_ASSESSED_USE_EXISTING_PRODUCER_VERIFY" };
}

/** Pfad (Auslieferungspfad, "/quant/data/...") gehoert einer Datenart mit Phase BRANCH_ONLY (core/registry/data-branch.json):
 * der Erzeuger schreibt nur auf den Datenzweig, die Kopie in main ist eingefroren. Gibt die Datenart oder null zurueck. */
export function branchOnlyKind(dataBranch, artifact) {
  const a = String(artifact).replace(/^\//, "");
  for (const k of dataBranch.domains || []) {
    if (k.phase !== "BRANCH_ONLY") continue;
    if ((k.paths || []).includes(a) || (k.prefixes || []).some((p) => a.startsWith(p))) return k.id;
  }
  return null;
}

export const BRANCH_NOT_READABLE = "BRANCH_NOT_READABLE";

/** Loader fuer den Repository-Stand, der BRANCH_ONLY-Pfade vom Datenzweig liest (git show <ref>:<pfad>, nichts wird geholt
 * oder geschrieben). Ist keine Referenz lesbar, wirft er BRANCH_NOT_READABLE (kein Raten mit der alten main-Kopie).
 * state.read[pfad] = gelesene Referenz. */
export function makeBranchAwareLoader(load, dataBranch, { root = REPO_ROOT, refs = ["origin/" + (dataBranch.branch || "data/live"), dataBranch.branch || "data/live"], git = execFileSync } = {}) {
  const state = { read: {}, notReadable: {} };
  async function branchLoad(path) {
    const kind = branchOnlyKind(dataBranch, path);
    if (!kind) return load(path);
    const rel = path.replace(/^\//, "");
    for (const ref of refs) {
      let bytes;
      try { bytes = git("git", ["-C", root, "show", ref + ":" + rel], { maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); } catch { continue; }
      state.read[path] = ref;
      return path.endsWith(".jsonl") ? jsonLinesArtifact(bytes.toString("utf8")) : compressedJson(bytes);
    }
    state.notReadable[path] = kind;
    throw new Error(BRANCH_NOT_READABLE + ": " + rel + " (Datenart " + kind + ", Datenzweig lokal nicht lesbar)");
  }
  return { load: branchLoad, state };
}

/** Loader fuer Auslieferungspfade ("/quant/data/..."). */
export function makeLoader({ root = REPO_ROOT, site = null } = {}) {
  return async function load(path) {
    if (site) {
      const url = site.replace(/\/$/, "") + path;
      const r = await fetch(url, { headers: { "cache-control": "no-cache" } });
      if (!r.ok) throw new Error("HTTP " + r.status + " " + path);
      return path.endsWith(".jsonl") ? jsonLinesArtifact(await r.text()) : path.endsWith(".json.gz") ? compressedJson(Buffer.from(await r.arrayBuffer())) : r.json();
    }
    const file = resolve(root, path.replace(/^\//, ""));
    if (!file.startsWith(resolve(root) + sep)) throw new Error("ausserhalb des Repositorys: " + path);
    if (!existsSync(file)) throw new Error("fehlt: " + path);
    return path.endsWith(".jsonl") ? jsonLinesArtifact(readFileSync(file, "utf8")) : path.endsWith(".json.gz") ? compressedJson(readFileSync(file)) : JSON.parse(readFileSync(file, "utf8"));
  };
}

export function loadEngines(root = REPO_ROOT) {
  return {
    Health: require(join(root, "core", "health.js")),
    Identity: require(join(root, "core", "identity.js")),
    TradingSession: require(join(root, "quant", "engines", "realtime", "trading-session.js")),
    calendar: JSON.parse(readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8")),
    registry: JSON.parse(readFileSync(join(root, "core", "registry", "domains.json"), "utf8"))
  };
}

/** Laedt alle Artefakte des Registers; Fehler werden Befund, nicht Abbruch. */
export async function loadArtifacts(registry, load) {
  const out = {};
  await Promise.all(registry.domains.map(async (d) => {
    try { out[d.artifact] = { ok: true, data: await load(d.artifact) }; }
    catch (e) { out[d.artifact] = { ok: false, error: String(e.message || e) }; }
  }));
  return out;
}
