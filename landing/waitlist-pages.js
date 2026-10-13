// Tokens use URL fragments and POST bodies, never query strings, analytics or storage.
(async()=>{
  const status=document.querySelector('#waitlist-status');
  const button=document.querySelector('#unsubscribe-button');
  const link=document.querySelector('#unsubscribe-link');
  const token=new URLSearchParams(location.hash.slice(1)).get('t');
  history.replaceState(null,'',location.pathname);
  if(!token){status.textContent='Dieser Link ist ungültig. Nutze deinen persönlichen Bestätigungs- oder Abmeldelink.';return;}
  const request=async(path)=>{
    const response=await fetch('/api/waitlist/'+path,{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({token}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();status.textContent=result.message;
    return {response,result};
  };
  if(button){
    button.disabled=false;
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try{const {response,result}=await request('unsubscribe');if(!response.ok||!result.unsubscribed)button.disabled=false;}
      catch{status.textContent='Die Abmeldung konnte nicht bestätigt werden. Bitte versuche es später erneut.';button.disabled=false;}
    });
    status.textContent='Wenn du keine App-Informationen mehr erhalten möchtest, melde dich hier ab.';
  }else{
    try{
      const {response,result}=await request('confirmed');
      if(response.ok&&result.confirmed){link.href='/warteliste/abmelden/#t='+token;link.hidden=false;}
    }catch{status.textContent='Die Bestätigung konnte nicht geprüft werden. Bitte versuche es später erneut.';}
  }
})();
