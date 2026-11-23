// Barrierefreiheits-Pruefung (WCAG 2.2 AA) mit axe-core ueber Playwright gegen einen gebauten Stand.
// Seiten x Hell/Dunkel x Desktop/390 px. Dazu eigene Pruefungen, die axe nicht abdeckt:
//   Touch-Ziele >= 44 px (nur Hinweis-Liste), Charts/SVG/Canvas mit Namen, Fokus sichtbar, Meldungsbereiche.
// Aufruf: node scripts/quality/a11y-axe-qa.mjs --url=http://127.0.0.1:8765 --axe=<pfad>/axe.min.js
//           [--out=/tmp/a11y] [--pages=start,discover-start] [--themes=light,dark] [--viewports=1440x900,390x844]
//           [--strict]  (Exit 1 bei serious/critical ausserhalb der Basis)  [--baseline=<datei.json>]  [--write-baseline=<datei.json>]  [--playwright=<pfad>]
// axe-core wird auf 4.10.3 gepinnt (wie die uebrigen Browser-QA-Jobs); Befunde und Stand: docs/quality/A11Y_BEFUNDE.md
// Basis (--baseline): { "<seite>": { "<regel-id>": <maximale Zahl Knoten> } } – darf nur kleiner werden.
// Schreibt nur nach --out, nie in das Repository. Kein Passwort, kein Login: geschuetzte Seiten werden im
// abgemeldeten Zustand geprueft (so sieht sie jede Person ohne Konto).
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const flag = (k) => process.argv.includes(`--${k}`);
const base = arg('url', 'http://127.0.0.1:8765').replace(/\/$/, '');
const out = arg('out', '/tmp/a11y-axe');
const axePath = arg('axe', process.env.AXE_CORE_PATH || '');
if (!axePath) throw new Error('--axe=<pfad>/axe.min.js (npm i axe-core in ein Temp-Verzeichnis)');
const require = createRequire(import.meta.url);
const pw = require(arg('playwright', process.env.PLAYWRIGHT_PATH || 'playwright'));
const axeSource = await readFile(axePath, 'utf8');

export const PAGES = [
  ['start', '/'],
  ['willkommen', '/willkommen/'],
  ['discover-start', '/discover/#/'],
  ['discover-aktie', '/discover/#/s/US_REAL/NVDA'],
  ['discover-suche', '/discover/#/suche'],
  ['discover-europa', '/discover/#/s/EUROPE/'],
  ['quant-start', '/quant/#/'],
  ['quant-aktie', '/quant/#/aktie/NVDA'],
  ['technical', '/technical/#/'],
  ['supertrader', '/supertrader/'],
  ['mein-dashboard', '/mein-dashboard/'],
  ['konto', '/konto/'],
  ['konto-anmelden', '/konto/anmelden/'],
  ['aktie', '/aktie/#/NVDA'],
];
const VIEWPORTS = arg('viewports', '1440x900,390x844').split(',').map((v) => v.split('x').map(Number));
const THEMES = arg('themes', 'light,dark').split(',');
const only = arg('pages', '') ? new Set(arg('pages').split(',')) : null;
const baseline = arg('baseline') ? JSON.parse(await readFile(arg('baseline'), 'utf8')) : null;
await mkdir(out, { recursive: true });

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const EXTRA_RULES = ['label-content-name-mismatch', 'target-size'];

const browser = await pw.chromium.launch();
const results = [];
for (const [name, path] of PAGES) {
  if (only && !only.has(name)) continue;
  for (const theme of THEMES) for (const [w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 700, deviceScaleFactor: 1, colorScheme: theme });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('vu-discover-theme-v1', t); localStorage.setItem('vu-theme-default-v2', '1');
        localStorage.setItem('vu.theme', t);
      } catch (_) { /* ohne Speicher */ }
    }, theme);
    // Externe Hosts blocken: Pruefung bleibt lokal und deterministisch.
    await ctx.route((u) => !['127.0.0.1', 'localhost'].includes(u.hostname), (r) => r.abort());
    const page = await ctx.newPage();
    const entry = { page: name, theme, viewport: `${w}x${h}`, violations: [], touch: [], notes: [] };
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      entry.appliedTheme = applied;
      await page.evaluate(axeSource);
      const res = await page.evaluate(async ([tags, extra]) => {
        const a = await axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
        // Regeln, die axe je nach Version als „experimental“ fuehrt, fuer WCAG aber gelten (2.5.3 Beschriftung im Namen, 2.5.8 Zielgroesse)
        const b = await axe.run(document, { runOnly: { type: 'rule', values: extra }, resultTypes: ['violations'] });
        const have = new Set(a.violations.map((v) => v.id));
        return { violations: a.violations.concat(b.violations.filter((v) => !have.has(v.id))) };
      }, [TAGS, EXTRA_RULES]);
      entry.violations = res.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
        samples: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160), summary: (n.failureSummary || '').split('\n').slice(1, 3).join(' ').slice(0, 220) })),
      }));
      if (w < 700) {
        entry.touch = await page.evaluate(async () => {
          const sel = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=link],summary';
          const bad = [];
          for (const el of document.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
            if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
            if (el.closest('[hidden],[inert]')) continue;
            if (r.width < 44 || r.height < 44) {
              // Fliesstext-Links sind nach WCAG 2.5.8 ausgenommen (Inline)
              if (el.tagName === 'A' && cs.display === 'inline') continue;
              // wirksame Trefferflaeche: Pseudo-Elemente (::after mit inset) zaehlen, darum mit elementFromPoint pruefen (Element erst in den Blick)
              el.scrollIntoView({ block: 'center', inline: 'nearest' });
              const r2 = el.getBoundingClientRect(), cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2;
              const hits = (x, y) => { if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true; const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t) || (t.closest && t.closest(sel) === el)); };
              const w = r.width >= 44 || (hits(cx - 21, cy) && hits(cx + 21, cy)), h = r.height >= 44 || (hits(cx, cy - 21) && hits(cx, cy + 21));
              if (w && h) continue;
              bad.push({ tag: el.tagName.toLowerCase(), text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), cls: String(el.className.baseVal ?? el.className).slice(0, 50) });
            }
          }
          return bad.slice(0, 60);
        });
      }
      entry.unnamedGraphics = await page.evaluate(() => {
        const bad = [];
        for (const el of document.querySelectorAll('svg, canvas')) {
          const r = el.getBoundingClientRect();
          if (r.width < 60 || r.height < 30) continue;
          if (el.closest('[aria-hidden=true]')) continue;
          const named = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.querySelector('title') || el.closest('figure')?.querySelector('figcaption') || el.closest('[role=img]');
          if (!named) bad.push({ tag: el.tagName.toLowerCase(), cls: String(el.getAttribute('class') || '').slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), parent: (el.parentElement?.className || '').toString().slice(0, 40) });
        }
        return bad.slice(0, 40);
      });
    } catch (e) { entry.error = String(e.message || e).slice(0, 200); }
    results.push(entry);
    console.log(`${name.padEnd(16)} ${theme.padEnd(5)} ${w}x${h}`.padEnd(40), entry.error ? 'FEHLER ' + entry.error : entry.violations.map((v) => `${v.id}(${v.nodes},${v.impact[0]})`).join(' ') || 'ok');
    await ctx.close();
  }
}
await browser.close();
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 1));

if (arg('write-baseline')) {
  const b = {};
  for (const r of results) for (const v of r.violations) if (['serious', 'critical'].includes(v.impact)) {
    b[r.page] ??= {}; b[r.page][v.id] = Math.max(b[r.page][v.id] || 0, v.nodes);
  }
  await writeFile(arg('write-baseline'), JSON.stringify({ _hinweis: 'Basis der gesperrten UI-Schutz-Dateien (docs/quality/A11Y_BEFUNDE.md); darf nur kleiner werden.', ...b }, null, 1) + '\n');
}
let fail = 0;
for (const r of results) if (r.error) { fail++; console.log(`ROT ${r.page} ${r.theme} ${r.viewport}: ${r.error}`); }
for (const r of results) for (const v of r.violations) {
  if (!['serious', 'critical'].includes(v.impact)) continue;
  const allowed = baseline?.[r.page]?.[v.id] ?? 0;
  if (v.nodes > allowed) { fail++; console.log(`ROT ${r.page} ${r.theme} ${r.viewport}: ${v.id} ${v.nodes} > Basis ${allowed}`); }
}
if (flag('strict') && fail) process.exit(1);
