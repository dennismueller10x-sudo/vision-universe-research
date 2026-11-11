/* =========================================================================
   VISION UNIVERSE DISCOVER — browser-qa-stockhead.mjs

   Aktienkopf (Kurs, Tagesbewegung, Schluss/Stale-Hinweis) im Browser:
   - Farbe der Bewegungs-Pille folgt dem Vorzeichen (Minus rot, Plus neongruen),
   - Kopf und Pille ueberlappen sich nicht (360/390/430 px, hell und dunkel),
   - kein horizontaler Ueberlauf.
   Entstanden am 11.11.2026 (iPhone-Befund: schwarze Pille, Stale-Text ueber
   dem Abzeichen).

   Ausfuehren:
     node scripts/discover/browser-qa-stockhead.mjs http://127.0.0.1:8121 [AAPL,NVDA,MSFT]
   Mit gestellter Uhr (Folgetag, damit der Stale-Text erscheint, der laengste Fall).
   ========================================================================= */
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://127.0.0.1:8121";
const TICKERS = (process.argv[3] || "NVDA,AAPL,MSFT,TSLA").split(",");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let fehler = 0, gesehen = { up: 0, down: 0 };
const ok = (n, c, d) => { console.log((c ? "ok   " : "FAIL ") + n + (d ? "  " + d : "")); if (!c) fehler++; };
const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
const istRot = ([r, g, b]) => r >= 150 && g <= 90 && b <= 90;
const istGruen = ([r, g, b]) => g >= 180 && g > b + 60 && r < 235;
const schneiden = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
for (const scheme of ["light", "dark"]) {
  for (const w of [360, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
    for (const t of TICKERS) {
      const p = await ctx.newPage();
      await p.clock.install({ time: new Date(Date.now() + 36 * 3600e3) });
      await p.addInitScript((s) => { try { localStorage.setItem("vu-theme", s); } catch (e) {} document.documentElement.setAttribute("data-theme", s); }, scheme);
      await p.goto(BASE + "/discover/#/s/US_REAL/" + t, { waitUntil: "networkidle" });
      await p.waitForTimeout(1500);
      const m = await p.evaluate(() => {
        const hero = document.querySelector(".dx-chart-hero--c04"); if (!hero) return null;
        const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
        const pill = hero.querySelector(".dx-chart-hero-preis > span.num");
        return {
          dir: pill ? (pill.classList.contains("down") ? "down" : pill.classList.contains("up") ? "up" : "flat") : null,
          bg: pill ? getComputedStyle(pill).backgroundColor : null,
          preis: box(hero.querySelector(".dx-chart-hero-preis > b")), pill: box(pill),
          meta: box(hero.querySelector(".dx-chart-hero-meta")), label: box(hero.querySelector(".dx-live-label")),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });
      const tag = `${t} ${w}px ${scheme}`;
      if (!m || !m.pill) { console.log("skip " + tag + " (kein Kopf)"); await p.close(); continue; }
      if (m.dir === "down") { gesehen.down++; ok(tag + " Minus rot", istRot(rgb(m.bg)), m.bg); }
      if (m.dir === "up") { gesehen.up++; ok(tag + " Plus gruen", istGruen(rgb(m.bg)), m.bg); }
      ok(tag + " Kurs/Pille ueberlappen nicht", !schneiden(m.preis, m.pill));
      for (const k of ["meta", "label"]) if (m[k] && m[k].w > 0) ok(tag + " " + k + " ueberlappt Kurs/Pille nicht", !schneiden(m[k], m.preis) && !schneiden(m[k], m.pill));
      ok(tag + " kein horizontaler Ueberlauf", m.overflow <= 1, String(m.overflow));
      await p.close();
    }
    await ctx.close();
  }
}
ok("mindestens ein Kopf mit Vorzeichen geprueft", gesehen.up + gesehen.down > 0, JSON.stringify(gesehen));
await browser.close();
process.exit(fehler ? 1 : 0);
