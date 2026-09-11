/* =========================================================================
   VISION UNIVERSE — storage/s3-driver.mjs

   Ein S3-kompatibler Treiber in reinem Node. Keine Abhaengigkeit.

   WARUM NICHT @aws-sdk/client-s3

   Dieses Repository hat keine Abhaengigkeiten, und das ist eine
   Entscheidung, keine Nachlaessigkeit. Das AWS-SDK bringt ueber 200
   Pakete mit; wir brauchen vier Anfragen (PUT, GET, HEAD, LIST) und eine
   Signatur. Signature V4 ist in rund hundert Zeilen vollstaendig
   umsetzbar, und sie ist gegen die veroeffentlichten Testvektoren von AWS
   pruefbar - was ein SDK nicht besser macht, nur groesser.

   WOGEGEN ER LAEUFT

   Alles, was S3 spricht: Cloudflare R2, Backblaze B2, AWS S3, MinIO.
   Der Unterschied ist die Adresse und die Region. Genau deshalb ist die
   Anbieterwahl hier eine Konfigurationszeile und keine Migration.

   ZUGANGSDATEN

   Ausschliesslich aus der Umgebung, niemals aus einer Datei im
   Repository. Sie erscheinen in keinem Bericht und in keinem Log; der
   Treiber gibt sie auch im Fehlerfall nicht aus.
   ========================================================================= */
import { createHash, createHmac } from "node:crypto";

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function sha256Hex(data) { return createHash("sha256").update(data).digest("hex"); }
function hmac(key, data) { return createHmac("sha256", key).update(data).digest(); }

/* URI-Kodierung nach AWS-Regel: ungereservierte Zeichen bleiben, alles
   andere wird %XX - und der Schraegstrich bleibt im Pfad stehen. */
export function uriEncode(str, encodeSlash) {
  let out = "";
  for (const ch of String(str)) {
    if (/[A-Za-z0-9\-_.~]/.test(ch)) { out += ch; continue; }
    if (ch === "/" && !encodeSlash) { out += ch; continue; }
    for (const byte of Buffer.from(ch, "utf8")) {
      out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

/**
 * Signature Version 4.
 *
 * Ausgelagert und exportiert, damit ein Test sie gegen die
 * AWS-Testvektoren halten kann. Eine Signatur, die nur "im Betrieb
 * funktioniert hat", ist nicht geprueft - sie hat bloss noch nicht
 * gescheitert.
 */
export function signRequest(params) {
  const { method, host, path, query, headers, payloadHash,
          accessKeyId, secretAccessKey, region, service, amzDate } = params;
  const date = amzDate.slice(0, 8);

  const canonicalHeaders = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort()
    .map((k) => {
      const orig = Object.keys(headers).find((h) => h.toLowerCase() === k);
      return k + ":" + String(headers[orig]).trim().replace(/\s+/g, " ") + "\n";
    })
    .join("");
  const signedHeaders = Object.keys(headers).map((k) => k.toLowerCase()).sort().join(";");

  const canonicalQuery = Object.keys(query || {}).sort()
    .map((k) => uriEncode(k, true) + "=" + uriEncode(query[k], true)).join("&");

  const canonicalRequest = [
    method, path, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash
  ].join("\n");

  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)
  ].join("\n");

  const kDate = hmac("AWS4" + secretAccessKey, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return {
    signature, canonicalRequest, stringToSign, signedHeaders, scope,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
                   `SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

/** Minimaler XML-Auszug fuer ListObjectsV2 - kein Parser, nur die Felder. */
export function parseListXml(xml) {
  const out = [];
  const re = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const pick = (tag) => {
      const mm = new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">").exec(block);
      return mm ? mm[1] : null;
    };
    out.push({
      key: pick("Key"),
      size: Number(pick("Size") || 0),
      lastModified: pick("LastModified"),
      etag: (pick("ETag") || "").replace(/&quot;|"/g, "")
    });
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const tokenMatch = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml);
  return { objects: out, truncated, nextToken: tokenMatch ? tokenMatch[1] : null };
}

/**
 * @param {object} cfg
 *   endpoint         z.B. https://<account>.r2.cloudflarestorage.com
 *   bucket           Eimername
 *   region           R2: "auto". B2/S3: die echte Region.
 *   accessKeyId      aus der Umgebung
 *   secretAccessKey  aus der Umgebung
 */
export function createS3Driver(cfg) {
  const endpoint = String(cfg.endpoint || "").replace(/\/+$/, "");
  const url = new URL(endpoint);
  const bucket = cfg.bucket;
  const region = cfg.region || "auto";
  const service = "s3";
  const accessKeyId = cfg.accessKeyId;
  const secretAccessKey = cfg.secretAccessKey;
  const fetchImpl = cfg.fetchImpl || globalThis.fetch;
  const maxRetries = cfg.maxRetries === undefined ? 4 : cfg.maxRetries;

  if (!bucket) throw new Error("s3-driver: kein Bucket angegeben.");
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("s3-driver: keine Zugangsdaten in der Umgebung. " +
                    "Erwartet VU_HISTORY_S3_ACCESS_KEY_ID und VU_HISTORY_S3_SECRET_ACCESS_KEY.");
  }

  async function request(method, key, { body, query, extraHeaders } = {}) {
    const path = "/" + uriEncode(bucket, false) + (key ? "/" + uriEncode(key, false) : "");
    const payload = body || Buffer.alloc(0);
    const payloadHash = body ? sha256Hex(payload) : EMPTY_SHA256;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");

    const headers = Object.assign({
      "host": url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    }, extraHeaders || {});
    if (body) headers["content-length"] = String(payload.length);

    const signed = signRequest({
      method, host: url.host, path, query: query || {}, headers, payloadHash,
      accessKeyId, secretAccessKey, region, service, amzDate
    });
    headers["authorization"] = signed.authorization;

    const qs = Object.keys(query || {}).sort()
      .map((k) => uriEncode(k, true) + "=" + uriEncode(query[k], true)).join("&");
    const target = url.origin + path + (qs ? "?" + qs : "");

    let lastErr = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetchImpl(target, { method, headers, body: body || undefined });
        if (res.status === 404) return { status: 404, buffer: null, headers: res.headers };
        if (res.status >= 500 || res.status === 429) {
          lastErr = new Error(`${method} ${key || "(bucket)"}: HTTP ${res.status}`);
        } else if (!res.ok) {
          const text = await res.text().catch(() => "");
          /* Der Fehlertext des Dienstes darf durch - er enthaelt keinen
             Schluessel. Die Signatur und die Zugangsdaten nie. */
          throw new Error(`${method} ${key || "(bucket)"}: HTTP ${res.status} ${text.slice(0, 400)}`);
        } else {
          const buffer = method === "HEAD" ? null : Buffer.from(await res.arrayBuffer());
          return { status: res.status, buffer, headers: res.headers };
        }
      } catch (err) {
        lastErr = err;
        if (!/HTTP 5|HTTP 429|fetch failed|ECONN|ETIMEDOUT|socket/i.test(String(err.message))) throw err;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.min(16000, 1000 * Math.pow(2, attempt))));
      }
    }
    throw lastErr || new Error("s3-driver: Anfrage gescheitert.");
  }

  function metaHeaders(metadata) {
    const out = {};
    for (const [k, v] of Object.entries(metadata || {})) {
      out["x-amz-meta-" + k.toLowerCase()] = String(v);
    }
    return out;
  }

  return {
    kind: "s3",
    endpoint: url.origin,
    bucket,

    async put(key, buffer, opts) {
      const extra = metaHeaders(opts && opts.metadata);
      if (opts && opts.contentType) extra["content-type"] = opts.contentType;
      await request("PUT", key, { body: buffer, extraHeaders: extra });
      return { key, bytes: buffer.length };
    },

    async get(key) {
      const res = await request("GET", key);
      return res.status === 404 ? null : res.buffer;
    },

    async head(key) {
      const res = await request("HEAD", key);
      if (res.status === 404) return null;
      const metadata = {};
      for (const [k, v] of res.headers.entries()) {
        if (k.toLowerCase().startsWith("x-amz-meta-")) metadata[k.slice(11)] = v;
      }
      return {
        key,
        size: Number(res.headers.get("content-length") || 0),
        lastModified: res.headers.get("last-modified"),
        metadata
      };
    },

    /* LIST ist die Wiederherstellung: geht der Index verloren, sagt der
       Speicher selbst, was er hat. 1.000 Schluessel je Seite - fuer
       7.800 Titel sind das acht Anfragen. */
    async list(prefix) {
      const out = [];
      let token = null;
      do {
        const query = { "list-type": "2", "prefix": prefix, "max-keys": "1000" };
        if (token) query["continuation-token"] = token;
        const res = await request("GET", "", { query });
        const parsed = parseListXml(res.buffer.toString("utf8"));
        out.push(...parsed.objects);
        token = parsed.truncated ? parsed.nextToken : null;
      } while (token);
      return out;
    }
  };
}

/** Treiber aus der Umgebung. Die einzige Stelle, die Variablennamen kennt. */
export function createS3DriverFromEnv(env) {
  const e = env || process.env;
  return createS3Driver({
    endpoint: e.VU_HISTORY_S3_ENDPOINT,
    bucket: e.VU_HISTORY_S3_BUCKET,
    region: e.VU_HISTORY_S3_REGION || "auto",
    accessKeyId: e.VU_HISTORY_S3_ACCESS_KEY_ID,
    secretAccessKey: e.VU_HISTORY_S3_SECRET_ACCESS_KEY
  });
}
