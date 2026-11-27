// Leitet die kompakten Logo-Listen aus discover/logos/index.json ab (nur im Release-Bau, nie eingecheckt).
export function compactLogoIndex(src){
 const files=src.files||{},t=[],x={};
 for(const [sym,f] of Object.entries(files)){if(/[,\s]/.test(sym))throw Error('LOGO_INDEX_SYMBOL_INVALID');t.push(sym);if(f!=='files/'+sym+'.png')x[sym]=f;}
 return {index:{v:1,t:t.join(','),x,d:src.dark||[]},wide:{v:1,w:src.wide||{}}};
}
