/* =========================================================================
   VISION UNIVERSE — storage/fs-driver.mjs

   Der Speichertreiber fuer das Dateisystem.

   Er ist kein Spielzeug fuer Tests allein: er ist die Bauart-Kontrolle.
   Wenn dieselbe Ablage gegen ein Verzeichnis UND gegen einen
   S3-kompatiblen Dienst laeuft, ist bewiesen, dass die Ablage nichts
   ueber den Dienst annimmt - und ein Anbieterwechsel bleibt eine
   Adresse statt eines Umbaus.
   ========================================================================= */
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

export function createFsDriver(rootDir) {
  const root = rootDir;

  function pathFor(key) { return join(root, key); }
  /* Metadaten kennt ein Dateisystem nicht. Sie stehen daneben - mit
     demselben Namen und der Endung .meta.json. Ohne sie koennte
     rebuildIndexFromStorage() den Bestand nicht ohne Entpacken lesen. */
  function metaPathFor(key) { return join(root, key + ".meta.json"); }

  return {
    kind: "fs",
    endpoint: root,

    async put(key, buffer, opts) {
      const p = pathFor(key);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, buffer);
      if (opts && opts.metadata) {
        writeFileSync(metaPathFor(key), JSON.stringify(opts.metadata));
      }
      return { key, bytes: buffer.length };
    },

    async get(key) {
      const p = pathFor(key);
      if (!existsSync(p)) return null;
      return readFileSync(p);
    },

    async head(key) {
      const p = pathFor(key);
      if (!existsSync(p)) return null;
      const st = statSync(p);
      let metadata = null;
      if (existsSync(metaPathFor(key))) {
        metadata = JSON.parse(readFileSync(metaPathFor(key), "utf8"));
      }
      return { key, size: st.size, lastModified: st.mtime.toISOString(), metadata };
    },

    /* Dieselbe Flaeche wie der S3-Treiber, damit der Nachweis gegen
       beide laeuft. Die Beschraenkung auf ein Nachweis-Praefix sitzt im
       S3-Treiber, wo sie hingehoert - ein Verzeichnis kostet nichts und
       liegt ohnehin in einem Wegwerfpfad. */
    async del(key) {
      const p = pathFor(key);
      if (existsSync(p)) rmSync(p);
      if (existsSync(metaPathFor(key))) rmSync(metaPathFor(key));
      return { key, deleted: true };
    },

    async list(prefix) {
      const out = [];
      const base = join(root, prefix);
      if (!existsSync(base)) return out;
      const walk = (dir, rel) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          const st = statSync(full);
          if (st.isDirectory()) { walk(full, rel + name + "/"); continue; }
          if (name.endsWith(".meta.json")) continue;
          const key = prefix + rel + name;
          let metadata = null;
          if (existsSync(metaPathFor(key))) {
            metadata = JSON.parse(readFileSync(metaPathFor(key), "utf8"));
          }
          out.push({ key, size: st.size, lastModified: st.mtime.toISOString(), metadata });
        }
      };
      walk(base, "");
      return out;
    }
  };
}
