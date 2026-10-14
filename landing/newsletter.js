// Same-origin protected API; no provider keys, storage, tracking or automatic retry.
(() => {
  const form=document.querySelector('#newsletter-form');if(!form)return;
  const status=document.querySelector('#signup-status'),button=form.querySelector('button'),email=form.querySelector('#email'),consent=form.querySelector('#consent');
  const label=button.innerHTML;let submitting=false,finished=false;
  if(form.dataset.ready==='true')form.noValidate=true;
  function error(input,message){const n=document.querySelector('#'+input.id+'-error');n.textContent=message;n.hidden=!message;if(message)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');}
  [email,consent].forEach(input=>input.addEventListener('input',()=>error(input,'')));
  function reset(){submitting=false;button.disabled=finished||form.dataset.ready!=='true';button.innerHTML=label;form.removeAttribute('aria-busy');}
  window.addEventListener('pageshow',reset);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(form.dataset.ready!=='true'||form.getAttribute('action')!=='/api/newsletter/subscribe'){status.textContent='Die Anmeldung ist noch nicht freigeschaltet. Deine E-Mail-Adresse wurde nicht übermittelt.';return;}
    if(submitting||finished)return;
    if(!navigator.onLine){status.textContent='Du bist gerade offline. Prüfe deine Verbindung und versuche es erneut.';return;}
    let invalid=null;
    if(!email.validity.valid){error(email,email.validity.valueMissing?'Gib deine E-Mail-Adresse ein.':'Gib eine gültige E-Mail-Adresse ein.');invalid=email;}
    if(!consent.checked){error(consent,'Bitte stimme dem Erhalt des Vision-Universe-Newsletters zu.');invalid??=consent;}
    if(invalid){invalid.focus();return;}
    if(form.elements.email_address_check.value){status.textContent='Die Anmeldung konnte nicht gesendet werden. Lade die Seite neu und versuche es erneut.';return;}
    submitting=true;button.disabled=true;button.textContent='Wird geprüft …';form.setAttribute('aria-busy','true');
    status.textContent='Deine Anfrage wird geprüft. Deine Anmeldung ist noch nicht bestätigt.';
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch('/api/newsletter/subscribe',{method:'POST',credentials:'same-origin',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,consent:consent.checked,consentVersion:form.elements.CONSENT_VERSION.value,honeypot:form.elements.email_address_check.value})});
      const data=await response.json();if(typeof data.message!=='string'||data.message.length>500)throw Error();
      status.textContent=data.message;
      finished=response.status===202||response.status>=500;
    }catch{
      finished=true;status.textContent='Wir haben keine verlässliche Rückmeldung erhalten. Eine Anmeldung ist nicht bestätigt. Bitte prüfe dein Postfach; es erfolgt keine automatische Wiederholung.';
    }finally{clearTimeout(timer);reset();}
  });
})();
