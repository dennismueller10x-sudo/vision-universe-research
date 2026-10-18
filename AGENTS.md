# Brevo Newsletter

- Brevo is connected only through the manual GitHub Actions workflow `.github/workflows/brevo-newsletter.yml`, using the existing repository Actions secrets. Do not call Brevo directly from ChatGPT or expose secrets.
- Preserve the workflow’s version binding, private ledger, environment reviewer gate, and `authorize_send` requirement for test and production sends. Never weaken or bypass these checks.
- A newsletter test must use only the two confirmed internal test contacts configured for the `VU | Newsletter-Test` list (the Brevo list 6 mapping must be verified at runtime). Never send a test to the production newsletter list (Brevo list 4).
- A production send is a separate operation and requires a new explicit owner approval for the exact campaign version after the test. Do not dispatch `send` without that approval.
- Newsletter HTML and content changes must stay bound to the campaign SHA256 used by the workflow. Keep the Brevo unsubscribe tag and direct legal links intact.
