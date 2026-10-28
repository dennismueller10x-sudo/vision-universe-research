// Usage: node cover.mjs data=<cover.json> out=<cover.jpg>   (PW=<path to playwright> if installed globally)
import { createRequire } from "module"; const { chromium } = createRequire(import.meta.url)(process.env.PW || "playwright");
import fs from "fs"; import path from "path"; import { pathToFileURL, fileURLToPath } from "url";
const a = Object.fromEntries(process.argv.slice(2).map(x => x.split("=")));
const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(a.data, "utf8"));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.addInitScript(`window.COVER=${JSON.stringify(data)};`);
await p.goto(pathToFileURL(path.join(here, "cover.html")).href);
await p.waitForFunction("window.__ready===true");
await p.screenshot({ path: a.out, type: "jpeg", quality: 92 });
await b.close();
