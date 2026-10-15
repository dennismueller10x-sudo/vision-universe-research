/**
 * Structural diff of two private canonical captures. Answers one question: what differs between two
 * captures of the same source? Output is path patterns, counts and difference classes only
 * (no ids, tickers or values). Read-only.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeContentBinding,normalizedInputs} from './capture-v3-inrunner.mjs';

const demand=(ok,code)=>{if(!ok)throw new Error(code);};
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const kind=(a,b)=>{
 if(typeof a!==typeof b)return 'TYPE_DIFFERS';
 if(typeof a==='string')return ISO.test(a)&&ISO.test(b)?'ISO_TIMESTAMP_DIFFERS':'STRING_DIFFERS';
 if(typeof a==='number')return Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(a))?'NUMBER_WITHIN_1E-12':'NUMBER_DIFFERS';
 return 'VALUE_DIFFERS';
};
export function structuralDiff(a,b,acc=new Map(),p='$'){
 const note=(pattern,k)=>{const key=pattern+'|'+k;acc.set(key,(acc.get(key)||0)+1);};
 if(a===b||(Number.isNaN(a)&&Number.isNaN(b)))return acc;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object'){note(p,kind(a,b));return acc;}
 if(Array.isArray(a)!==Array.isArray(b)){note(p,'ARRAY_VS_OBJECT');return acc;}
 if(Array.isArray(a)){
  if(a.length!==b.length){note(p,'ARRAY_LENGTH_DIFFERS');return acc;}
  for(let i=0;i<a.length;i++)structuralDiff(a[i],b[i],acc,p+'[]');
  return acc;
 }
 const keys=new Set([...Object.keys(a),...Object.keys(b)]);
 for(const k of keys){
  if(!(k in a)||!(k in b)){note(p+'.'+k,'KEY_PRESENT_ONLY_ONE_SIDE');continue;}
  structuralDiff(a[k],b[k],acc,p+'.'+k);
 }
 return acc;
}
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
export function compareCaptures(dirA,dirB){
 const ma=read(path.join(dirA,'canonical-dataset-manifest.json')),mb=read(path.join(dirB,'canonical-dataset-manifest.json'));
 demand(ma.parts.length===mb.parts.length,'PART_COUNT_DIFFERS');
 const parts=new Map(),manifest=structuralDiff(ma,mb),inputs=structuralDiff(read(path.join(dirA,'data-certification-inputs.json')),read(path.join(dirB,'data-certification-inputs.json')));
 let identical=0,differing=0,securities=0,securitiesDiffering=0;
 for(let i=0;i<ma.parts.length;i++){
  demand(ma.parts[i].stem===mb.parts[i].stem,'PART_STEM_ORDER_DIFFERS');
  const a=read(path.join(dirA,ma.parts[i].stem+'.json')),b=read(path.join(dirB,mb.parts[i].stem+'.json'));
  demand(a.securities.length===b.securities.length,'PART_SECURITY_COUNT_DIFFERS');
  const before=parts.size;
  for(let j=0;j<a.securities.length;j++){securities++;const acc=structuralDiff(a.securities[j],b.securities[j]);if(acc.size){securitiesDiffering++;for(const [k,v] of acc)parts.set(k,(parts.get(k)||0)+v);}}
  if(ma.parts[i].sha256===mb.parts[i].sha256)identical++;else differing++;
 }
 const rows=m=>[...m].map(([k,n])=>{const [pattern,cls]=k.split('|');return{pattern,class:cls,count:n};}).sort((x,y)=>y.count-x.count);
 const bA=computeContentBinding(dirA),bB=computeContentBinding(dirB);
 const contentBindingEqual=Object.fromEntries(Object.keys(bA).map(k=>[k,JSON.stringify(bA[k])===JSON.stringify(bB[k])]));
 const normalizedInputDifferences=rows(structuralDiff(normalizedInputs(read(path.join(dirA,'data-certification-inputs.json'))),normalizedInputs(read(path.join(dirB,'data-certification-inputs.json'))))).slice(0,40);
 return{schema:'supertrader-calibration-v3-capture-structural-diff-1.0.0',contentBindingEqual,normalizedInputDifferences,parts:ma.parts.length,partsByteIdentical:identical,partsByteDifferent:differing,securities,securitiesWithAnyDifference:securitiesDiffering,
  partDifferences:rows(parts).slice(0,60),partDifferencePatterns:parts.size,manifestDifferences:rows(manifest).slice(0,40),sourceMetadataDifferences:rows(inputs).slice(0,60),valuesPublished:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2),arg=f=>{const i=a.indexOf(f);return i>=0?a[i+1]:null;};
 try{
  demand(arg('--a')?.startsWith('/workspace/private/')&&arg('--b')?.startsWith('/workspace/private/')&&arg('--public-out'),'PRIVATE_INPUTS_AND_PUBLIC_OUT_REQUIRED');
  const r=compareCaptures(arg('--a'),arg('--b'));fs.mkdirSync(path.dirname(path.resolve(arg('--public-out'))),{recursive:true});fs.writeFileSync(arg('--public-out'),JSON.stringify(r,null,2)+'\n');
  process.stdout.write(JSON.stringify({parts:r.parts,partsByteIdentical:r.partsByteIdentical,securitiesWithAnyDifference:r.securitiesWithAnyDifference,patterns:r.partDifferencePatterns})+'\n');
 }catch(e){process.stderr.write(JSON.stringify({status:'COMPARE_FAILED_CLOSED',code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'COMPARE_FAILURE'})+'\n');process.exitCode=1;}
}
