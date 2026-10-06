import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(process.cwd(), ".vercel-public");
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error("VERCEL_OUTPUT_NOT_EMPTY");
await writeFile(resolve(output, "index.html"),
  '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Vision Universe Product Data</title><body><p>Vision Universe Product Data Service</p></body></html>');
