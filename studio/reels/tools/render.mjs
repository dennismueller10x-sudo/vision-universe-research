import { chromium } from "playwright-core";
import fs from "fs"; import path from "path"; import { pathToFileURL } from "url";
const a = Object.fromEntries(process.argv.slice(2).map(x => x.split("=")));
const out = a.out || "frames"; const fps = 30; const T = JSON.parse(fs.readFileSync(a.timing || "timing.json", "utf8"));
const times = a.times ? a.times.split(",").map(Number) : null;
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await p.addInitScript(`window.TM=${JSON.stringify(T.TM)};window.SUBS=${JSON.stringify(T.SUBS)};`);
await p.goto(pathToFileURL(path.resolve("composition.html")).href + (a.ovl === "0" ? "" : "?ovl=1"));
await p.waitForFunction("window.__ready===true");
const n = Math.round(T.TOTAL * fps);
const i0 = Number(a.i0 || 0), i1 = Number(a.i1 || n);
const list = times || Array.from({ length: i1 - i0 }, (_, i) => (i + i0) / fps);
const t0 = Date.now();
for (let i = 0; i < list.length; i++) {
  await p.evaluate(t => window.render(t), list[i]);
  const name = times ? `t${String(list[i]).replace(".", "_")}.png` : `f${String(i + (times ? 0 : i0)).padStart(5, "0")}.png`;
  await p.screenshot({ path: path.join(out, name), omitBackground: a.ovl !== "0" });
}
console.log(`${list.length} Bilder in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await b.close();
