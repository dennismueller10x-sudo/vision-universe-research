/**
 * Streaming hybrid envelope for files too large for the whole-buffer sealer.
 * Layout: one JSON header line (schema, alg, iv, wrappedKeys per audience, RSA-OAEP-SHA256) + '\n'
 * + AES-256-GCM(gzip(plaintext)) ciphertext + 16-byte auth tag. One random data key, wrapped once per
 * recipient public key. Public output: plaintext/sealed sizes and SHA-256 only.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {Transform,PassThrough} from 'node:stream';

export const STREAM_SEAL_SCHEMA='supertrader-sealed-stream-1.0.0';
const hashing=()=>{const h=crypto.createHash('sha256');let bytes=0;const t=new Transform({transform(chunk,_e,cb){h.update(chunk);bytes+=chunk.length;cb(null,chunk);}});return{stream:t,digest:()=>h.digest('hex'),bytes:()=>bytes};};

export async function sealFileStream({input,output,recipients}){
 if(!recipients||!Object.keys(recipients).length)throw new Error('SEAL_RECIPIENTS_REQUIRED');
 if(fs.existsSync(output))throw new Error('SEAL_OUTPUT_EXISTS');
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);
 const wrappedKeys=Object.fromEntries(Object.entries(recipients).map(([aud,pem])=>[aud,crypto.publicEncrypt({key:pem,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key).toString('base64')]));
 const header=Buffer.from(JSON.stringify({schema:STREAM_SEAL_SCHEMA,alg:'RSA-OAEP-256+A256GCM+gzip-stream',iv:iv.toString('base64'),wrappedKeys})+'\n');
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv),plain=hashing(),sealed=hashing();
 const out=fs.createWriteStream(output,{flags:'wx',mode:0o600});
 sealed.stream.pipe(out,{end:false});
 sealed.stream.write(header);
 const body=new PassThrough();
 body.on('data',c=>sealed.stream.write(c));
 await pipeline(fs.createReadStream(input),plain.stream,zlib.createGzip(),cipher,body);
 sealed.stream.write(cipher.getAuthTag());
 await new Promise((res,rej)=>{out.on('finish',res);out.on('error',rej);sealed.stream.end();sealed.stream.on('end',()=>out.end());});
 return{plaintextSha256:plain.digest(),plaintextBytes:plain.bytes(),sealedSha256:sealed.digest(),sealedBytes:sealed.bytes(),audiences:Object.keys(recipients)};
}

export async function openFileStream({input,output,audience,privateKeyPem}){
 const fd=fs.openSync(input,'r'),size=fs.fstatSync(fd).size;
 try{
  const probe=Buffer.alloc(Math.min(size,65536));fs.readSync(fd,probe,0,probe.length,0);
  const nl=probe.indexOf(10);if(nl<0)throw new Error('SEAL_HEADER_MISSING');
  const header=JSON.parse(probe.subarray(0,nl).toString('utf8'));
  if(header.schema!==STREAM_SEAL_SCHEMA||!header.wrappedKeys?.[audience])throw new Error('SEAL_AUDIENCE_OR_SCHEMA_INVALID');
  const tag=Buffer.alloc(16);fs.readSync(fd,tag,0,16,size-16);
  const key=crypto.privateDecrypt({key:privateKeyPem,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(header.wrappedKeys[audience],'base64'));
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(header.iv,'base64'));decipher.setAuthTag(tag);
  const plain=hashing();
  await pipeline(fs.createReadStream(input,{start:nl+1,end:size-17}),decipher,zlib.createGunzip(),plain.stream,fs.createWriteStream(output,{flags:'wx',mode:0o600}));
  return{plaintextSha256:plain.digest(),plaintextBytes:plain.bytes()};
 }finally{fs.closeSync(fd);}
}
