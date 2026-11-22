/* Lese-Mitschnitt fuer scripts/quant/freeze-test-fixture.mjs: schreibt beim Prozessende jede gelesene Datei unter einem
   Verzeichnis data/ (relativ zum Repository) nach TRACE_OUT. Aufruf: node --require scripts/quant/lib/trace-data-reads.cjs <test>. */
const fs = require("fs"), path = require("path"), mod = require("module");
const ROOT = path.join(__dirname, "..", "..", ".."), seen = new Set();
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
mod.syncBuiltinESMExports();
process.on("exit", () => {
  /* TRACE_DIR (22.11.2026): jeder Prozess schreibt seine eigene Datei <pid>.json; so tragen auch Kindprozesse (NODE_OPTIONS=--require)
     zum Mitschnitt bei. Ohne TRACE_DIR bleibt es bei TRACE_OUT (nur dieser Prozess). */
  const out = process.env.TRACE_DIR ? path.join(process.env.TRACE_DIR, process.pid + ".json") : process.env.TRACE_OUT;
  if (!out) return;
  const files = [...seen].filter((f) => { try { return fs.statSync(path.join(ROOT, f)).isFile(); } catch { return false; } }).sort();
  fs.writeFileSync(out, JSON.stringify(files, null, 1) + "\n");
});
