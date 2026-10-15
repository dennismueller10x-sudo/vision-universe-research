import {CONSENT_TEXT,TEMPLATE_NAME,TEMPLATE_TAG} from './newsletter.mjs';
let attempted=0,accepted=0,unexpected=0,validBody=true;
export default {async fetch(request){
  const url=new URL(request.url),path=url.pathname;
  if(url.host==='mock.invalid'&&path==='/__stats')return Response.json({attempted,accepted,unexpected,validBody});
  if(url.host!=='api.brevo.com'||request.headers.get('api-key')!=='synthetic-key'){unexpected++;return new Response(null,{status:500});}
  const json=value=>Response.json(value);
  if(request.method==='POST'&&path==='/v3/contacts/doubleOptinConfirmation'){
    attempted++;const body=await request.json();validBody&&=JSON.stringify(body.includeListIds)==='[4]'&&body.templateId===5&&body.contactPixelTrackingConsent===false&&body.attributes?.VU_EMAIL_CONSENT==='subscribed';
    if(body.email.startsWith('send-redirect'))return new Response(null,{status:307,headers:{Location:'https://redirect.invalid/trap'}});
    accepted++;return new Response(null,{status:201});
  }
  if(request.method!=='GET'){unexpected++;return new Response(null,{status:500});}
  if(path==='/v3/contacts/attributes')return json({attributes:[{name:'VU_EMAIL_CONSENT',category:'normal',type:'text'}]});
  if(path.startsWith('/v3/contacts/')){
    if(decodeURIComponent(path).includes('redirect-lookup@'))return new Response(null,{status:302,headers:{Location:'https://redirect.invalid/trap'}});
    return new Response(null,{status:404});
  }
  if(path==='/v3/smtp/blockedContacts')return json({contacts:[]});
  if(path==='/v3/smtp/statistics/events')return json({});
  if(path==='/v3/smtp/templates/5')return json({name:TEMPLATE_NAME,isActive:true,tag:TEMPLATE_TAG,htmlContent:'{{ params.DOIurl }}'+CONSENT_TEXT});
  if(path==='/v3/smtp/statistics/aggregatedReport')return json({requests:0});
  unexpected++;return new Response(null,{status:500});
}};
