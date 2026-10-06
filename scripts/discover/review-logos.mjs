/**
 * Sichtpruefung der Firmenlogos, die auf Freigabe warten.
 *
 * Der Lauf (build-company-logos.mjs) legt neue oder geaenderte Logos ab,
 * schaltet sie aber nicht frei: Sie stehen in credits.json mit
 * "pending": true und fehlen in index.json. Erst hier, nach dem Ansehen,
 * gehen sie live oder auf die Sperrliste.
 *
 *   node scripts/discover/review-logos.mjs --list
 *   node scripts/discover/review-logos.mjs --sheet=/tmp/wartend.png
 *   node scripts/discover/review-logos.mjs --approve=ABC,XYZ
 *   node scripts/discover/review-logos.mjs --approve-all
 *   node scripts/discover/review-logos.mjs --reject="ABC:Unterschrift;XYZ:Partnerlogo"
 *   node scripts/discover/review-logos.mjs --exclude="ABC:Logo einer anderen Firma"
 *
 * --reject sperrt das BILD (der naechste Lauf versucht die naechste
 * Quelle), --exclude den TITEL (nie ein Logo - z. B. wenn dasselbe Bild
 * bei einer anderen Firma richtig ist). --approve-all gibt alles frei,
 * was nach --reject/--exclude noch wartet.
 */
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isLightOnTransparent } from "./company-logos-web.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const L = join(root, "discover", "logos");
const C = join(root, "discover", "config");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf("=");
  return i < 0 ? [a.replace(/^--/, ""), true] : [a.slice(2, i), a.slice(i + 1)];
}));
const lesen = (p) => JSON.parse(readFileSync(p, "utf8"));
const schreiben = (p, d, eingerueckt = 1) => writeFileSync(p, JSON.stringify(d, null, eingerueckt) + "\n");
const sortiert = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const paare = (s) => String(s || "").split(";").map((x) => x.trim()).filter(Boolean).map((x) => {
  const i = x.indexOf(":");
  return [x.slice(0, i < 0 ? x.length : i).trim().toUpperCase(), (i < 0 ? "" : x.slice(i + 1)).trim() || "unklar"];
});

const idx = lesen(join(L, "index.json"));
const cj = lesen(join(L, "credits.json"));
const miss = lesen(join(L, "missing.json"));
const sum = lesen(join(L, "summary.json"));
const freigabe = lesen(join(C, "logo-reviewed.json"));
const rejects = lesen(join(C, "logo-rejects.json"));
const exclusions = lesen(join(C, "logo-exclusions.json"));
const credits = cj.credits;
const wartend = () => Object.keys(credits).filter((s) => credits[s].pending).sort();
const heute = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });

if (args.list) {
  for (const s of wartend()) {
    const c = credits[s];
    console.log(s.padEnd(7), c.source.padEnd(17), c.iconUrl || c.title || "");
  }
  console.log(wartend().length + " warten auf Sichtpruefung.");
}

if (args.sheet) {
  const sharp = (await import("sharp")).default;
  const liste = wartend();
  if (!liste.length) console.log("Nichts wartet.");
  else {
    const SP = 8, B = 150, H = 150, T = 18, teile = [];
    for (let i = 0; i < liste.length; i++) {
      const s = liste[i], c = credits[s], x = (i % SP) * B, y = Math.floor(i / SP) * (H + T);
      const datei = join(L, c.wide || c.path);
      const roh = readFileSync(datei);
      const grund = (await isLightOnTransparent(readFileSync(join(L, c.path)), sharp)) ? "#16181d" : "#ffffff";
      teile.push({ input: await sharp(roh).resize(B - 12, H - 12, { fit: "contain", background: grund }).flatten({ background: grund }).png().toBuffer(), left: x + 6, top: y + 6 });
      const text = (s + " " + (c.source === "WIKIMEDIA_COMMONS" ? "COM" : c.source === "WEBSITE" ? "WEB" : "SEC")).replace(/&/g, "&amp;");
      teile.push({ input: Buffer.from(`<svg width="${B}" height="${T}"><text x="${B / 2}" y="13" font-size="12" font-family="sans-serif" font-weight="bold" text-anchor="middle">${text}</text></svg>`), left: x, top: y + H });
    }
    await sharp({ create: { width: SP * B, height: Math.ceil(liste.length / SP) * (H + T), channels: 3, background: "#d8d8d8" } })
      .composite(teile).png().toFile(args.sheet);
    console.log("Uebersicht: " + args.sheet + " (" + liste.length + " Logos)");
  }
}

let geaendert = false;
function entfernen(s, grund, alsTitel) {
  const c = credits[s];
  if (!c) { console.log("Kein Logo: " + s); return; }
  if (alsTitel) exclusions.symbols[s] = grund + ", " + heute;
  else if (c.source === "WIKIMEDIA_COMMONS") rejects.titles[c.title] = s + ": " + grund;
  else rejects.urls[c.iconUrl] = s + ": " + grund;
  for (const p of [c.path, c.wide]) if (p && existsSync(join(L, p))) rmSync(join(L, p));
  delete credits[s];
  delete freigabe.symbols[s];
  miss.reasons[s] = alsTitel ? "AUSGESCHLOSSEN" : "BILD_GESPERRT";
  geaendert = true;
  console.log((alsTitel ? "Ausgeschlossen: " : "Gesperrt: ") + s + " (" + grund + ")");
}
for (const [s, g] of paare(args.reject)) entfernen(s, g, false);
for (const [s, g] of paare(args.exclude)) entfernen(s, g, true);

const frei = args["approve-all"] ? wartend()
  : String(args.approve || "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
for (const s of frei) {
  const c = credits[s];
  if (!c || !c.pending) { console.log("Wartet nicht: " + s); continue; }
  freigabe.symbols[s] = c.sha1;
  delete c.pending;
  delete miss.reasons[s];
  geaendert = true;
}
if (frei.length) console.log("Freigegeben: " + frei.join(", "));

if (geaendert) {
  /* index.json, missing.json und summary.json aus dem neuen Stand. */
  let sharp = null;
  try { sharp = (await import("sharp")).default; } catch (e) { /* ohne Pruefung auf helle Logos */ }
  const live = Object.entries(credits).filter(([, c]) => !c.pending);
  const dunkel = new Set(idx.dark || []);
  for (const s of Object.keys(idx.files)) if (!credits[s] || credits[s].pending) dunkel.delete(s);
  for (const s of frei) if (sharp && credits[s] && await isLightOnTransparent(readFileSync(join(L, credits[s].path)), sharp)) dunkel.add(s);
  idx.files = sortiert(Object.fromEntries(live.map(([s, c]) => [s, c.path])));
  idx.wide = sortiert(Object.fromEntries(live.filter(([, c]) => c.wide).map(([s, c]) => [s, c.ratio])));
  idx.dark = [...dunkel].sort();
  idx.count = Object.keys(idx.files).length;

  const zaehlen = (f) => live.reduce((a, [, c]) => { const k = f(c); if (k) a[k] = (a[k] || 0) + 1; return a; }, {});
  sum.withLogo = idx.count;
  sum.pct = Math.round((idx.count / Math.max(1, sum.universe)) * 1000) / 10;
  sum.pending = wartend();
  sum.bySource = zaehlen((c) => c.source);
  sum.byVia = zaehlen((c) => c.via);
  sum.byLicense = zaehlen((c) => c.license);
  const dir = join(root, "discover", "data", "stocks", "US_REAL"), mitglieder = {};
  if (existsSync(dir)) for (const f of readdirSync(dir)) {
    try { const d = lesen(join(dir, f)); for (const m of d.indexMemberships || []) (mitglieder[m.indexId] ||= new Set()).add(d.symbol); } catch (e) { /* weiter */ }
  }
  for (const [id, v] of Object.entries(sum.indexCoverage || {})) {
    if (!mitglieder[id]) continue;
    const m = [...mitglieder[id]].sort(), ohne = m.filter((s) => !idx.files[s]);
    sum.indexCoverage[id] = { ...v, members: m.length, withLogo: m.length - ohne.length, missing: ohne.map((s) => s + ":" + (miss.reasons[s] || "?")) };
  }

  rejects.urls = sortiert(rejects.urls); rejects.titles = sortiert(rejects.titles || {});
  exclusions.symbols = sortiert(exclusions.symbols); freigabe.symbols = sortiert(freigabe.symbols);
  miss.reasons = sortiert(miss.reasons); cj.credits = sortiert(credits);
  writeFileSync(join(L, "index.json"), JSON.stringify(idx) + "\n");
  schreiben(join(L, "credits.json"), cj);
  schreiben(join(L, "missing.json"), miss);
  schreiben(join(L, "summary.json"), sum);
  schreiben(join(C, "logo-reviewed.json"), freigabe);
  schreiben(join(C, "logo-rejects.json"), rejects);
  schreiben(join(C, "logo-exclusions.json"), exclusions, 2);
  console.log(`Live: ${idx.count} Logos, wartend: ${sum.pending.length}.`);
}
