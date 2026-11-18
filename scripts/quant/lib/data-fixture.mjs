/* =========================================================================
   VISION UNIVERSE — scripts/quant/lib/data-fixture.mjs

   Eingefrorener Datenstand fuer Tests (Steuerung 18.11.2026, Muster #1991):
   Ein Test, der Dienste auf den committeten Artefakten prueft, rechnet auf
   einem eingefrorenen Stand statt auf dem Tagesstand. Sonst macht ein
   Datenlauf, der zwischen zwei Erzeugern landet (Halbstand), oder eine neue
   Zahl (Deckung, Kennzahl nach einem 10-Q) main rot, obwohl am Code nichts
   falsch ist (CLAUDE.md: veraltete Daten loesen Alarm aus und blockieren
   keinen Code-PR). Den Live-Stand prueft die Datenqualitaet (DQ-PQ-11).

   Bündel: gzip-JSON { meta: { sourceCommit, frozenAt, test }, files: { <Pfad>: { enc, data } } },
   nur Dateien unter einem Verzeichnis `data/`. Methodik, Konfiguration und
   Code kommen weiter aus dem Repository.

   mountFixture(bundle) baut eine Spiegelwurzel im Temp-Verzeichnis: jedes
   Datenverzeichnis enthaelt genau die eingefrorenen Dateien (eine nicht
   eingefrorene Datei fehlt sichtbar), alles andere ist ein Symlink ins
   Repository. Mit DATA_FIXTURE_LIVE=1 liefert fixtureRoot die echte Wurzel
   (zum Neu-Einfrieren und fuer einen bewussten Live-Abgleich).
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, existsSync, rmSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { join, dirname, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const isData = (rel) => rel.split("/").includes("data");
/** Die Datenwurzel eines Pfads: alles bis einschliesslich des ersten Segments `data`. */
export const dataDirOf = (rel) => { const s = rel.split("/"); return s.slice(0, s.indexOf("data") + 1).join("/"); };

/** Packt Dateien des Repositories (relativ, nur unter data/) in ein Bündel. */
export function packFixture(paths, meta, root = REPO) {
  const files = {};
  for (const rel of [...new Set(paths)].sort()) {
    if (!isData(rel)) throw Error("FIXTURE_NOT_DATA:" + rel);
    const buf = readFileSync(join(root, rel));
    files[rel] = rel.endsWith(".gz") ? { enc: "base64", data: buf.toString("base64") } : { enc: "utf8", data: buf.toString("utf8") };
  }
  return gzipSync(JSON.stringify({ meta, files }), { level: 9 });
}

export const readFixture = (bundlePath) => JSON.parse(gunzipSync(readFileSync(bundlePath)).toString("utf8"));

/** Spiegelwurzel: Datenverzeichnisse aus dem Bündel, alles andere als Symlink ins Repository. */
export function mountFixture(bundlePath, { root = REPO, into } = {}) {
  const { meta, files } = readFixture(bundlePath);
  const dest = into || mkdtempSync(join(tmpdir(), "vu-fixture-"));
  for (const [rel, f] of Object.entries(files)) {
    const p = join(dest, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.enc === "base64" ? Buffer.from(f.data, "base64") : f.data);
  }
  const dataDirs = new Set(Object.keys(files).map(dataDirOf));
  const ancestors = new Set();
  for (const d of dataDirs) { const s = d.split("/"); for (let i = 1; i < s.length; i++) ancestors.add(s.slice(0, i).join("/")); }
  const link = (rel) => {
    for (const e of readdirSync(join(root, rel || "."))) {
      const r = rel ? rel + "/" + e : e;
      if (e === ".git" || dataDirs.has(r)) continue;                 // Datenverzeichnis: nur das Eingefrorene
      if (ancestors.has(r)) { mkdirSync(join(dest, r), { recursive: true }); link(r); continue; }
      if (!existsSync(join(dest, r))) symlinkSync(join(root, r), join(dest, r));
    }
  };
  link("");
  return { root: dest, meta };
}

/** URL der Wurzel fuer einen Test: eingefroren, oder mit DATA_FIXTURE_LIVE=1 das Repository. */
export function fixtureRoot(bundlePath) {
  if (process.env.DATA_FIXTURE_LIVE === "1") return { url: pathToFileURL(REPO + sep), live: true, meta: null };
  const { root, meta } = mountFixture(bundlePath);
  process.on("exit", () => rmSync(root, { recursive: true, force: true }));   // entfernt die Symlinks, nicht ihre Ziele
  return { url: pathToFileURL(root + sep), live: false, meta };
}
