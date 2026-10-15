import {createHandler} from './newsletter.mjs';
const stored=new Map();
const cache={async match(key){const body=stored.get(key.url);return body===undefined?undefined:new Response(body);},async put(key,value){stored.set(key.url,await value.text());}};
const handle=createHandler({cacheProvider:()=>cache});
const env={NEWSLETTER_STAGE:'production',NEWSLETTER_PUBLIC_ENABLED:'true',NEWSLETTER_PRIVACY_APPROVED:'true',NEWSLETTER_E2E_VERIFIED:'true',BREVO_API_KEY:'synthetic-key',NEWSLETTER_RATE_KEY:'a'.repeat(64),NEWSLETTER_DOI_TEMPLATE_ID:'5'};
export default {async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/ready')return Response.json({ready:true});
  if(path==='/stats')return fetch('https://mock.invalid/__stats',{redirect:'manual'});
  if(path==='/legacy'){
    // Reproduce the original production failure in native workerd, not Node.
    try{await fetch('https://mock.invalid/never',{redirect:'error'});return Response.json({rejected:false});}
    catch(error){return Response.json({rejected:error instanceof TypeError&&error.message.includes('Invalid redirect value')});}
  }
  return handle(new Request('https://www.visionuniverse.de'+path,request),env);
}};
