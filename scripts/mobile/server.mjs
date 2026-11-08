import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {gzipSync} from 'node:zlib';

export async function startServer(root) {
root=resolve(root);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
// Compress once per file. .json.gz stays
// application/gzip: clients deliberately decompress these themselves.
const files = new Map();
const server = http.createServer(async (req, res) => {
 try {
  let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = resolve(root, '.' + p);
  if (!file.startsWith(root + sep)) throw Error('outside root');
  let entry = files.get(file);
  if (!entry) {
   if (!(await stat(file)).isFile()) throw Error('not a file');
   const raw = await readFile(file), ext = extname(file);
   const zipped = /\.(html|js|css|json|svg|webmanifest)$/.test(file);
   entry = {body:zipped ? gzipSync(raw) : raw, headers:{'content-type':types[ext] || 'application/octet-stream','cache-control':'public, max-age=600',...(zipped ? {'content-encoding':'gzip'} : {})}};
   files.set(file, entry);
  }
  res.writeHead(200, entry.headers); res.end(entry.body);
 } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
return server;
}
