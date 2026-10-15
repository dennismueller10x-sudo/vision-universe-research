// Same-origin protected API; no provider keys, storage, tracking or automatic retry.
(() => {
  const form=document.querySelector('#newsletter-form');if(!form)return;
  const status=document.querySelector('#signup-status'),button=form.querySelector('button'),email=form.querySelector('#email'),consent=form.querySelector('#consent');
  const label=button.innerHTML;let submitting=false,finished=false;
  let testAccess='',expiresAt=0,expiryTimer,accessCheck=0;
  const privateMode=form.dataset.controlled==='true';
  const expired='Der private Testzugang ist abgelaufen oder nicht mehr gültig. Bitte öffne einen aktuellen privaten Testlink. Deine E-Mail-Adresse wurde nicht übermittelt.';
  function closeTest(message){
    clearTimeout(expiryTimer);expiresAt=0;form.dataset.ready='false';form.removeAttribute('action');form.querySelector('fieldset').disabled=true;button.disabled=true;status.textContent=message;
  }
  async function checkTest(){
    const attempt=++accessCheck,token=testAccess;
    closeTest('Der private Testzugang wird geprüft …');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch('/api/newsletter/test-access',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+token}});
      const data=await response.json();if(attempt!==accessCheck)return false;
      if(response.status!==200||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Date.now()){closeTest(expired);return false;}
      expiresAt=data.expiresAt;form.dataset.ready='true';form.action='/api/newsletter/subscribe';form.querySelector('fieldset').disabled=false;
      button.disabled=submitting||finished;form.noValidate=true;
      expiryTimer=setTimeout(()=>closeTest(expired),Math.min(2147483647,expiresAt-Date.now()));
      status.textContent='Privater Betreiber-Test, gültig bis '+new Date(expiresAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+' Uhr (Ortszeit). Gib eine neue, von dir kontrollierte Adresse ein. Erst der Klick in der DOI-Mail bestätigt die Anmeldung.';
      return true;
    }catch{if(attempt===accessCheck)closeTest('Der private Testzugang konnte nicht geprüft werden. Öffne den vollständigen privaten Testlink erneut, bei Bedarf direkt in Safari. Deine E-Mail-Adresse wurde nicht übermittelt.');return false;}
    finally{clearTimeout(timer);}
  }
  function activateTest(){
    if(form.dataset.controlled!=='true')return;
    const match=location.hash.match(/^#vu-test=([A-Za-z0-9_-]{43})$/);
    if(match){
      testAccess=match[1];history.replaceState(null,'',location.pathname+location.search);
      void checkTest();
    }
  }
  activateTest();window.addEventListener('hashchange',activateTest);
  if(form.dataset.ready==='true')form.noValidate=true;
  function error(input,message){const n=document.querySelector('#'+input.id+'-error');n.textContent=message;n.hidden=!message;if(message)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');}
  [email,consent].forEach(input=>input.addEventListener('input',()=>error(input,'')));
  function reset(){submitting=false;button.disabled=finished||form.dataset.ready!=='true';button.innerHTML=label;form.removeAttribute('aria-busy');}
  window.addEventListener('pageshow',event=>{reset();if(event.persisted&&privateMode&&testAccess&&!finished)void checkTest();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(form.dataset.ready!=='true'||form.getAttribute('action')!=='/api/newsletter/subscribe'){status.textContent='Die Anmeldung ist noch nicht freigeschaltet. Deine E-Mail-Adresse wurde nicht übermittelt.';return;}
    if(submitting||finished)return;
    if(privateMode&&expiresAt<=Date.now()){closeTest(expired);return;}
    if(!navigator.onLine){status.textContent='Du bist gerade offline. Prüfe deine Verbindung und versuche es erneut.';return;}
    let invalid=null;
    if(!email.validity.valid){error(email,email.validity.valueMissing?'Gib deine E-Mail-Adresse ein.':'Gib eine gültige E-Mail-Adresse ein.');invalid=email;}
    if(!consent.checked){error(consent,'Bitte stimme dem Erhalt des Vision-Universe-Newsletters zu.');invalid??=consent;}
    if(invalid){invalid.focus();return;}
    if(form.elements.email_address_check.value){status.textContent='Die Anmeldung konnte nicht gesendet werden. Lade die Seite neu und versuche es erneut.';return;}
    submitting=true;button.disabled=true;button.textContent='Wird geprüft …';form.setAttribute('aria-busy','true');
    // Recheck after an in-app browser was backgrounded or the link was rotated.
    // The access request never includes the address or consent fields.
    if(privateMode&&!(await checkTest())){reset();return;}
    status.textContent='Deine Anfrage wird geprüft. Deine Anmeldung ist noch nicht bestätigt.';
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch('/api/newsletter/subscribe',{method:'POST',credentials:'same-origin',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',...(testAccess?{'Authorization':'Bearer '+testAccess}:{})},body:JSON.stringify({email:email.value,consent:consent.checked,consentVersion:form.elements.CONSENT_VERSION.value,honeypot:form.elements.email_address_check.value})});
      const data=await response.json();if(typeof data.message!=='string'||data.message.length>500)throw Error();
      status.textContent=data.message;
      finished=response.status===202||response.status>=500;
    }catch{
      finished=true;status.textContent='Wir haben keine verlässliche Rückmeldung erhalten. Eine Anmeldung ist nicht bestätigt. Bitte prüfe dein Postfach; es erfolgt keine automatische Wiederholung.';
    }finally{clearTimeout(timer);reset();}
  });
})();
