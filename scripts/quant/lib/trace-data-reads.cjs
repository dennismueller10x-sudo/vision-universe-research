/* Lese-Mitschnitt fuer scripts/quant/freeze-test-fixture.mjs: schreibt beim Prozessende jede gelesene Datei unter einem
   Verzeichnis data/ (relativ zum Repository) nach TRACE_OUT. Aufruf: node --require scripts/quant/lib/trace-data-reads.cjs <test>. */
const fs = require("fs"), path = require("path"), mod = require("module");
const ROOT = path.join(__dirname, "..", "..", ".."), seen = new Set();
const missing = new Set();
const isData = (p) => { try { const s = path.resolve(p instanceof URL ? decodeURIComponent(p.pathname) : String(p)); if (!s.startsWith(ROOT + path.sep)) return null; const rel = path.relative(ROOT, s).split(path.sep).join("/"); return rel.split("/").includes("data") && !rel.startsWith("node_modules/") && !rel.split("/").includes("fixtures") ? rel : null; } catch { return null; } };
const rec = (p) => {
  try {
    const s = path.resolve(p instanceof URL ? decodeURIComponent(p.pathname) : String(p));
    if (!s.startsWith(ROOT + path.sep)) return;
    const rel = path.relative(ROOT, s).split(path.sep).join("/");
    if (rel.split("/").includes("data") && !rel.startsWith("node_modules/")) seen.add(rel);
  } catch {}
};
const wrap = (obj, name) => { const orig = obj[name]; obj[name] = function (p, ...a) { rec(p); return orig.call(this, p, ...a); }; };
wrap(fs, "readFileSync"); wrap(fs.promises, "readFile"); wrap(fs, "readFile");
/* Fehlende Datei: ein Lesen, das mit ENOENT endet, wird gemeldet (Einfrieren in einem unvollstaendigen Checkout, 23.11.2026). */
{
  const o = fs.readFileSync; fs.readFileSync = function (p, ...a) { try { return o.call(this, p, ...a); } catch (e) { if (e && e.code === "ENOENT") { const r = isData(p); if (r) missing.add(r); } throw e; } };
  const op = fs.promises.readFile; fs.promises.readFile = async function (p, ...a) { try { return await op.call(this, p, ...a); } catch (e) { if (e && e.code === "ENOENT") { const r = isData(p); if (r) missing.add(r); } throw e; } };
}
mod.syncBuiltinESMExports();
process.on("exit", () => {
  /* TRACE_DIR (22.11.2026): jeder Prozess schreibt seine eigene Datei <pid>.json; so tragen auch Kindprozesse (NODE_OPTIONS=--require)
     zum Mitschnitt bei. Ohne TRACE_DIR bleibt es bei TRACE_OUT (nur dieser Prozess). */
  const out = process.env.TRACE_DIR ? path.join(process.env.TRACE_DIR, process.pid + ".json") : process.env.TRACE_OUT;
  if (!out) return;
  const files = [...seen].filter((f) => { try { return fs.statSync(path.join(ROOT, f)).isFile(); } catch { return false; } }).sort();
  fs.writeFileSync(out, JSON.stringify(files, null, 1) + "\n");
  if (missing.size) fs.writeFileSync(out.replace(/\.json$/, ".missing"), JSON.stringify([...missing].sort()) + "\n");
});
