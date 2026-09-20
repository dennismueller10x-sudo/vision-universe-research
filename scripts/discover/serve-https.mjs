#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — serve-https.mjs

   Ein statischer Server mit TLS, fuer genau einen Zweck: den Arbeitsbaum
   unter dem ECHTEN Ursprung auszuliefern.

   Der Realtime-Worker prueft den Ursprung an der Verbindung selbst, und
   er kennt genau drei Vision-Universe-Adressen. Von http://localhost
   kommt keiner herein - richtig so. Fuer den Browser-Nachweis wird
   deshalb nicht die Freigabe aufgeweicht, sondern der Test unter den
   richtigen Namen gestellt: TLS hier, --host-resolver-rules im Browser.

   Kein Framework, keine Abhaengigkeit - dieses Repository hat keine, und
   dabei bleibt es.
   ========================================================================= */

import { createServer } from "node:https";
import { readFileSync, statSync, createReadStream, existsSync } from "node:fs";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const PORT = parseInt(arg("port", "8443"), 10);
const KEY = arg("key", "/tmp/vu-tls/key.pem");
const CERT = arg("cert", "/tmp/vu-tls/cert.pem");

const TYPEN = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"
};

const server = createServer(
  { key: readFileSync(KEY), cert: readFileSync(CERT) },
  (req, res) => {
    let pfad = decodeURIComponent((req.url || "/").split("?")[0]);
    /* Kein Ausbruch aus dem Arbeitsbaum. */
    const ziel = join(root, normalize(pfad).replace(/^(\.\.[/\\])+/, ""));
    if (!ziel.startsWith(root)) { res.writeHead(403); res.end("verboten"); return; }
    let datei = ziel;
    try {
      if (existsSync(datei) && statSync(datei).isDirectory()) datei = join(datei, "index.html");
      if (!existsSync(datei)) { res.writeHead(404); res.end("nicht gefunden"); return; }
      res.writeHead(200, {
        "content-type": TYPEN[extname(datei).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store"
      });
      createReadStream(datei).pipe(res);
    } catch (err) {
      res.writeHead(500); res.end("Fehler");
    }
  }
);

server.listen(PORT, "127.0.0.1", () => {
  console.log("TLS-Server auf https://127.0.0.1:" + PORT + " (Wurzel: " + root + ")");
});
