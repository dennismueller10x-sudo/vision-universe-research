/* Hygiene der veroeffentlichten Shards: jede Shard-Datei gehoert zu mindestens einem Titel des Index, jeder Titel in einem
   Shard steht im Index. Ein Titel, der aus dem Produkt faellt (z. B. als Anleihe ausgeschlossen), hinterliess frueher seine
   Shard-Datei: der Build schrieb nur die Schluessel des aktuellen Laufs und raeumte nie auf. */
import { readdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const shardFiles = (dir) => (existsSync(join(dir, "shards")) ? readdirSync(join(dir, "shards")).filter((f) => f.endsWith(".json.gz")).sort() : []);

/** Dateien ohne Schluessel im aktuellen Lauf. `keys` sind die Shard-Schluessel dieses Laufs (Set oder Array). */
export function staleShardFiles(dir, keys) {
  const k = new Set(keys);
  return shardFiles(dir).filter((f) => !k.has(f.replace(/\.json\.gz$/, "")));
}

/** Entfernt verwaiste Shard-Dateien (nur nach einem vollstaendigen Lauf aufrufen). Gibt die entfernten Dateien zurueck. */
export function pruneStaleShards(dir, keys) {
  const stale = staleShardFiles(dir, keys);
  stale.forEach((f) => rmSync(join(dir, "shards", f)));
  return stale;
}

/** Prueft ein veroeffentlichtes Verzeichnis: Dateien ohne Index-Titel und Titel im Shard ohne Index-Zeile. */
export function auditShards(dir, shardKey) {
  const ix = JSON.parse(gunzipSync(readFileSync(join(dir, "index.json.gz"))).toString());
  const symbols = new Set(ix.rows.map((r) => r.t)), keys = new Set([...symbols].map(shardKey));
  const orphanFiles = staleShardFiles(dir, keys), orphanSymbols = [];
  for (const f of shardFiles(dir)) {
    const ins = JSON.parse(gunzipSync(readFileSync(join(dir, "shards", f))).toString()).instruments || {};
    for (const s of Object.keys(ins)) if (!symbols.has(s)) orphanSymbols.push(f.replace(/\.json\.gz$/, "") + ":" + s);
  }
  return { files: shardFiles(dir).length, symbols: symbols.size, orphanFiles, orphanSymbols };
}
