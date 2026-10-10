/* Bounded I/O only; pointers and approvals remain sequential. */
export async function objectPool(rows, worker, limit=12){
 const entries=Array.from(rows),results=new Array(entries.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(limit,entries.length)},async()=>{
  for(;;){const i=cursor++;if(i>=entries.length)return;results[i]=await worker(entries[i],i);}
 }));return results;
}
