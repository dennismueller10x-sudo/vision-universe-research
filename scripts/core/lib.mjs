/* Gemeinsame Ladefunktionen der Core-Werkzeuge (system-health, diagnose,
   data-quality). Lokal aus dem Repository oder per HTTP gegen die
   ausgelieferte Seite - dieselben Pfade, dieselbe Bewertung. */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const require = createRequire(import.meta.url);

export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
    else out._.push(a);
  }
  return out;
}

/** Loader fuer Auslieferungspfade ("/quant/data/..."). */
export function makeLoader({ root = REPO_ROOT, site = null } = {}) {
  return async function load(path) {
    if (site) {
      const url = site.replace(/\/$/, "") + path;
      const r = await fetch(url, { headers: { "cache-control": "no-cache" } });
      if (!r.ok) throw new Error("HTTP " + r.status + " " + path);
      return r.json();
    }
    const file = join(root, path.replace(/^\//, ""));
    if (!existsSync(file)) throw new Error("fehlt: " + path);
    return JSON.parse(readFileSync(file, "utf8"));
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
