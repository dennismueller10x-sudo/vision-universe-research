'use strict';
// Strang G: Versiegelung der Ergebnisse mit Zahlen (Protokoll §11). RSA-OAEP-SHA256 umschließt einen AES-256-GCM-Schlüssel.
// Im öffentlichen Repository liegt nur der Empfänger-Schlüssel (öffentlich) und der Klartext-Hash.
const crypto = require('node:crypto');
const SCHEMA = 'labor-sealed-1.0.0';

function seal(plaintext, publicPem) {
  if (!/BEGIN PUBLIC KEY/.test(publicPem)) throw Error('NOT_A_PUBLIC_KEY');
  const buf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv), data = Buffer.concat([c.update(buf), c.final()]);
  const wrapped = crypto.publicEncrypt({ key: publicPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
  return { schema: SCHEMA, recipientSha256: crypto.createHash('sha256').update(publicPem.trim()).digest('hex'),
    plaintextSha256: crypto.createHash('sha256').update(buf).digest('hex'),
    key: wrapped.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function open(doc, privatePem) {
  if (doc.schema !== SCHEMA) throw Error('SEAL_SCHEMA');
  const key = crypto.privateDecrypt({ key: privatePem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(doc.key, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(doc.iv, 'base64'));
  d.setAuthTag(Buffer.from(doc.tag, 'base64'));
  const buf = Buffer.concat([d.update(Buffer.from(doc.data, 'base64')), d.final()]);
  if (crypto.createHash('sha256').update(buf).digest('hex') !== doc.plaintextSha256) throw Error('SEAL_HASH_MISMATCH');
  return buf.toString('utf8');
}
module.exports = { SCHEMA, seal, open };
