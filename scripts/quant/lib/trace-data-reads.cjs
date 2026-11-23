/* Lese-Mitschnitt fuer scripts/quant/freeze-test-fixture.mjs: schreibt beim Prozessende jede gelesene Datei unter einem
   Verzeichnis data/ (relativ zum Repository) nach TRACE_OUT. Aufruf: node --require scripts/quant/lib/trace-data-reads.cjs <test>. */
const fs = require("fs"), path = require("path"), mod = require("module");
const ROOT = path.join(__dirname, "..", "..", ".."), seen = new Set();
const missing = new Set();
const realOf = (s) => { try { return fs.realpathSync.native(s); } catch { return s; } };
const isData = (p) => { try { let s = path.resolve(p instanceof URL ? decodeURIComponent(p.pathname) : String(p)); if (!s.startsWith(ROOT + path.sep)) s = realOf(s); /* Spiegelwurzeln aus Symlinks (researchSeriesRoot) */ if (!s.startsWith(ROOT + path.sep)) return null; const rel = path.relative(ROOT, s).split(path.sep).join("/"); return rel.split("/").includes("data") && !rel.startsWith("node_modules/") && !rel.split("/").includes("fixtures") ? rel : null; } catch { return null; } };
const rec = (p) => { const rel = isData(p); if (rel) seen.add(rel); };
const wrap = (obj, name) => { const orig = obj[name]; obj[name] = function (p, ...a) { rec(p); return orig.call(this, p, ...a); }; };
wrap(fs, "readFileSync"); wrap(fs.promises, "readFile"); wrap(fs, "readFile");
/* Fehlende Datei: ein Lesen, das mit ENOENT endet, wird gemeldet (Einfrieren in einem unvollstaendigen Checkout, 23.11.2026). */
{
  const o = fs.readFileSync; fs.readFileSync = function (p, ...a) { try { return o.call(this, p, ...a); } catch (e) { if (e && e.code === "ENOENT") { const r = isData(p); if (r) missing.add(r); } throw e; } };
  const op = fs.promises.readFile; fs.promises.readFile = async function (p, ...a) { try { return await op.call(this, p, ...a); } catch (e) { if (e && e.code === "ENOENT") { const r = isData(p); if (r) missing.add(r); } throw e; } };
}
mod.syncBuiltinESMExports();
/* Existenz- und Listenzugriffe (23.11.2026): existsSync/statSync auf eine Datei (z. B. model.test) und readdirSync eines Datenverzeichnisses
   (z. B. backtest-p2-deficits: Liste der Golden-Preview-Dateien). Sie kommen als <pid>.exists bzw. <pid>.lists neben <pid>.json. */
const existed = new Set(), lists = {};
{
  const oe = fs.existsSync; fs.existsSync = function (p, ...a) { const r = oe.call(this, p, ...a); if (r) { const rel = isData(p); if (rel) existed.add(rel); } return r; };
  const os = fs.statSync; fs.statSync = function (p, ...a) { const r = os.call(this, p, ...a); try { if (r && r.isFile && r.isFile()) { const rel = isData(p); if (rel) existed.add(rel); } } catch {} return r; };
  const od = fs.readdirSync; fs.readdirSync = function (p, o, ...a) {
    const r = od.call(this, p, o, ...a);
    try { const rel = isData(String(p instanceof URL ? decodeURIComponent(p.pathname) : p) + "/x"); const plain = !(o && typeof o === "object" && (o.withFileTypes || o.recursive)); if (rel && plain && Array.isArray(r)) lists[rel.replace(/\/x$/, "")] = r.map(String).sort(); } catch {}
    return r;
  };
}
/* Kopien (cpSync/copyFileSync, 23.11.2026): die Quelle zaehlt als gelesen; ein Verzeichnis mit allen Dateien darunter (rekursiv). */
{
  const addTree = (p) => {
    try {
      const rel = isData(p); if (!rel) return;
      const st = fs.statSync(p);
      if (st.isFile()) { seen.add(rel); return; }
      if (st.isDirectory()) for (const n of fs.readdirSync(p)) addTree(path.join(String(p instanceof URL ? decodeURIComponent(p.pathname) : p), n));
    } catch {}
  };
  const ocp = fs.cpSync; fs.cpSync = function (src, dest, ...a) { addTree(src); return ocp.call(this, src, dest, ...a); };
  const ocf = fs.copyFileSync; fs.copyFileSync = function (src, dest, ...a) { addTree(src); return ocf.call(this, src, dest, ...a); };
}
mod.syncBuiltinESMExports();
process.on("exit", () => {
  /* TRACE_DIR (22.11.2026): jeder Prozess schreibt seine eigene Datei <pid>.json; so tragen auch Kindprozesse (NODE_OPTIONS=--require)
     zum Mitschnitt bei. Ohne TRACE_DIR bleibt es bei TRACE_OUT (nur dieser Prozess). */
  const out = process.env.TRACE_DIR ? path.join(process.env.TRACE_DIR, process.pid + ".json") : process.env.TRACE_OUT;
  if (!out) return;
  const files = [...seen].filter((f) => { try { return fs.statSync(path.join(ROOT, f)).isFile(); } catch { return false; } }).sort();
  fs.writeFileSync(out, JSON.stringify(files, null, 1) + "\n");
  fs.writeFileSync(out.replace(/\.json$/, ".exists"), JSON.stringify([...existed].sort()) + "\n");
  fs.writeFileSync(out.replace(/\.json$/, ".lists"), JSON.stringify(lists) + "\n");
  if (missing.size) fs.writeFileSync(out.replace(/\.json$/, ".missing"), JSON.stringify([...missing].sort()) + "\n");
});
