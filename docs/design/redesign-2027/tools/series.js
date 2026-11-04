// Gibt echte 1-Jahres-Kursreihen (52 Punkte, letzte zwei Punkte = echte letzte zwei Schlusskurse) als JS-Objekt aus.
// Aufruf (im Repo-Ordner): node docs/design/redesign-2027/tools/series.js NVDA AMD ...   Quelle: quant/data/market/discover-series/ref_<T>.json
const fs = require('fs'), path = require('path');
const { securityIdForTicker } = require(path.resolve(__dirname, '../../../../core/identity.js'));
const out = {};
for (const t of process.argv.slice(2)) {
  const id = securityIdForTicker(t);
  const f = `quant/data/market/discover-series/${id}.json`;
  if (!fs.existsSync(f)) { console.error('fehlt: ' + t); continue; }
  const a = JSON.parse(fs.readFileSync(f)).points.slice(-252).map(p => p[1]);
  const s = a.length / 50, o = []; for (let i = 0; i < 50; i++) o.push(+a[Math.floor(i * s)].toFixed(2)); o.push(a[a.length - 2], a[a.length - 1]);
  out[t] = o;
}
console.log(JSON.stringify(out));
