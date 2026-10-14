// Native POST to Brevo: the provider alone reports acceptance or rejection.
// No client-side persistence, contact API, analytics or optimistic success.
(() => {
  const form = document.querySelector('#newsletter-form');
  if (!form) return;
  const status = document.querySelector('#signup-status');
  const button = form.querySelector('button');
  const email = form.querySelector('#email');
  const consent = form.querySelector('#consent');
  const originalLabel = button.innerHTML;
  if (form.dataset.ready === 'true') form.noValidate = true;
  let submitting = false;
  let timer;
  function error(input, message) {
    const node = document.querySelector(`#${input.id}-error`);
    node.textContent = message;
    node.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  [email, consent].forEach(input => input.addEventListener('input', () => error(input, '')));
  const reset = () => {
    clearTimeout(timer);
    submitting = false;
    button.disabled = form.dataset.ready !== 'true';
    button.innerHTML = originalLabel;
    form.removeAttribute('aria-busy');
  };
  window.addEventListener('pageshow', reset);
  form.addEventListener('submit', event => {
    if (form.dataset.ready !== 'true' || !form.hasAttribute('action')) {
      event.preventDefault();
      status.textContent = 'Die Anmeldung ist noch nicht freigeschaltet. Deine E-Mail-Adresse wurde nicht übermittelt.';
      return;
    }
    if (submitting) { event.preventDefault(); return; }
    if (!navigator.onLine) {
      event.preventDefault();
      status.textContent = 'Du bist gerade offline. Deine Anfrage wurde nicht übermittelt. Prüfe deine Verbindung und versuche es erneut.';
      return;
    }
    let invalid = null;
    if (!email.validity.valid) {
      error(email, email.validity.valueMissing ? 'Gib deine E-Mail-Adresse ein.' : 'Gib eine gültige E-Mail-Adresse ein.');
      invalid = email;
    }
    if (!consent.checked) {
      error(consent, 'Bitte stimme dem Erhalt der Launch-News zu.');
      invalid ??= consent;
    }
    if (invalid) { event.preventDefault(); invalid.focus(); return; }
    if (form.elements.email_address_check.value) {
      event.preventDefault();
      status.textContent = 'Die Anmeldung konnte nicht gesendet werden. Lade die Seite neu und versuche es erneut.';
      return;
    }
    submitting = true;
    form.setAttribute('aria-busy', 'true');
    button.disabled = true;
    button.textContent = 'Wird gesendet …';
    status.textContent = 'Deine Anfrage wird an Brevo übermittelt. Warte auf die Rückmeldung und bestätige anschließend deine E-Mail-Adresse.';
    // A failed navigation must never be presented as a saved subscription.
    timer = setTimeout(() => {
      reset();
      status.textContent = 'Wir haben noch keine Rückmeldung erhalten. Eine Anmeldung ist nicht bestätigt. Prüfe dein Postfach oder versuche es später erneut.';
    }, 20000);
  });
})();
