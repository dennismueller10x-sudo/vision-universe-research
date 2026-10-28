// Usage: node render.mjs times=1,5,9 out=stills   |   node render.mjs video=frames.mp4 tail=2.2
import { createRequire } from "module"; const { chromium } = createRequire(import.meta.url)(process.env.PW || "playwright");
import fs from "fs"; import path from "path"; import { spawn } from "child_process"; import { pathToFileURL } from "url";
const a = Object.fromEntries(process.argv.slice(2).map(x => x.split("=")));
const T = JSON.parse(fs.readFileSync("timing_vo.json", "utf8"));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await p.addInitScript(`window.TIMING=${JSON.stringify(T)};`);
await p.goto(pathToFileURL(path.resolve("composition.html")).href);
await p.waitForFunction("window.__ready===true");
if (a.times) {
  fs.mkdirSync(a.out || "stills", { recursive: true });
  for (const t of a.times.split(",").map(Number)) { await p.evaluate(t => window.render(t), t); await p.screenshot({ path: path.join(a.out || "stills", `t${t}.jpg`), type: "jpeg", quality: 85 }); }
} else {
  const fps = 30, total = T.duration + Number(a.tail || 2.2), n = Math.round(total * fps);
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", "30", "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", a.video], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) { await p.evaluate(t => window.render(t), i / fps); const buf = await p.screenshot({ type: "jpeg", quality: 92 }); if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r)); }
  ff.stdin.end(); await new Promise(r => ff.on("close", r));
  console.log(`${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await b.close();
