import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,root} from '../scripts/build.mjs';
import {CONSENT_TEXT} from '../server/waitlist.mjs';
test('Build and DOI mail preserve consent; no key values, source files or drafts leak into output',async()=>{
  const output=resolve(root,'tests/output/waitlist-build');
  const secret='SYNTHETIC_VALUE_MUST_NEVER_ENTER_BUILD';process.env.BREVO_API_KEY=secret;
  try{
    await build({output});
    const html=await readFile(resolve(output,'index.html'),'utf8');
    const mail=await readFile(resolve(root,'mail/app-doi.html'),'utf8');
    assert.ok(html.includes(CONSENT_TEXT));assert.ok(mail.includes(CONSENT_TEXT));assert.ok(mail.includes('{{ params.DOIurl }}'));
    const walk=async(path)=>{for(const entry of await readdir(path,{withFileTypes:true})){const child=resolve(path,entry.name);if(entry.isDirectory())await walk(child);else assert.ok(!(await readFile(child)).includes(Buffer.from(secret)),entry.name);}};
    await walk(output);
    assert.match(await readFile(resolve(output,'_worker.js'),'utf8'),/handleWaitlist/);
    for(const absent of ['server','mail','deployment','legal-source','legal-drafts'])assert.ok(!(await readdir(output)).includes(absent));
    assert.ok(html.includes('data-ready="false"'));
  }finally{delete process.env.BREVO_API_KEY;}
});
