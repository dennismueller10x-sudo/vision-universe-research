#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Preview=require('../../server/quant-backtest-preview.cjs');
async function main(){const args=process.argv.slice(2),get=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
 if(args.includes('--init-credential')){const file=get('--init-credential');if(!file)throw Error('CREDENTIAL_PATH_REQUIRED');const parent=fs.realpathSync(path.dirname(path.resolve(file))),repo=fs.realpathSync(path.resolve(__dirname,'../..'));if(!path.relative(repo,path.join(parent,path.basename(file))).startsWith('..'+path.sep))throw Error('CREDENTIAL_MUST_BE_PRIVATE');fs.writeFileSync(file,crypto.randomBytes(32).toString('hex')+'\n',{flag:'wx',mode:0o600});console.log('Private credential file created. Read it locally; never put it in a URL or Git.');return;}
 const key=await Preview.credential(get('--credential-file'));
 const app=Preview.create({directory:get('--directory'),credentialKey:key,allowedTickers:get('--allow-list','NVDA').split(',')});
 const url=await app.listen(Number(get('--port','0')));console.log('INTERNAL_REVIEW loopback preview: '+url);console.log('Authenticate with the separate credential file. No production deployment.');
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>app.close().then(()=>process.exit(0)));
}
if(require.main===module)main().catch(()=>{console.error('PREVIEW_START_FAILED: check private directory, credential permissions and port.');process.exitCode=1;});
