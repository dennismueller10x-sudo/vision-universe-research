import {execFileSync} from 'node:child_process';
// Additions do not mutate a pre-existing file. Renames protect BOTH paths.
// NUL separation preserves whitespace and tabs in Git paths.
export function existingFileChanges(root,range='origin/main...HEAD'){
 const fields=execFileSync('git',['diff','--name-status','-z','--find-renames',range],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\0');
 const paths=[];
 for(let i=0;i<fields.length&&fields[i];){
  const status=fields[i++],path=fields[i++];
  if(!path)throw Error('Malformed Git change evidence');
  if(status.startsWith('R')||status.startsWith('C')){
   const destination=fields[i++];if(!destination)throw Error('Missing Git destination');
   if(status.startsWith('R'))paths.push(path,destination);
  }else if(status!=='A')paths.push(path);
 }
 return [...new Set(paths)];
}
