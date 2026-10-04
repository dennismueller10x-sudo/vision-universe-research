"""Discovery-only shared-failure guard; no change to production polling cadence."""
import threading
from contextlib import contextmanager
from urllib.parse import urlsplit
from .transport import BudgetExhausted


def failure_signature(error):
    """Keep proxy failures separate from ordinary origin failures/access denials."""
    messages = []
    seen = set()
    while error is not None and id(error) not in seen:
        seen.add(id(error))
        if getattr(error,'proxy_failure_hint',False):return 'SHARED_PROXY_FAILURE'
        messages.append(str(error).casefold())
        error = error.__cause__ or error.__context__
    text = ' '.join(messages)
    if any(token in text for token in ('tunnel connection failed', 'proxy error', 'proxyerror', 'envoy')):
        return 'SHARED_PROXY_FAILURE'
    if any(token in text for token in ('http_503', 'http error 503', 'http_502', 'http error 502', 'http_504', 'http error 504')):
        return 'UNRELATED_UPSTREAM_5XX'
    return None


class DiscoveryCircuit:
    def __init__(self, threshold=4):
        self.threshold = threshold
        self.lock = threading.Lock()
        self.hosts = {}
        self.opened = False
        self.signature = None

    def check(self):
        with self.lock:
            if self.opened:
                raise BudgetExhausted('SHARED_INFRASTRUCTURE_CIRCUIT_OPEN:' + self.signature)

    def failure(self, url, error):
        signature = failure_signature(error)
        if not signature:
            return
        host = (urlsplit(url).hostname or '').removeprefix('www.')
        with self.lock:
            self.hosts.setdefault(signature, set()).add(host)
            if len(self.hosts[signature]) >= self.threshold:
                self.opened = True
                self.signature = signature

    def success(self):
        with self.lock:
            if not self.opened:
                self.hosts.clear()

    def snapshot(self):
        with self.lock:
            return {'open': self.opened, 'signature': self.signature,
                    'affectedHosts': sorted(self.hosts.get(self.signature, set())),
                    'threshold': self.threshold,
                    'interpretation': 'Repeated errors across independent hosts indicate a shared failure; generic origin 5xx remains suspected infrastructure, not proof of invalid companies.'}


@contextmanager
def guarded_poll(http, circuit):
    """Carry a discovery circuit through its serial follow-up source polling."""
    opener, admission = http.opener, http._wait

    def wait(url):
        circuit.check()
        admission(url)

    def observed(request, **kwargs):
        try:
            response = opener(request, **kwargs)
        except Exception as error:
            if getattr(error, 'code', None) == 503 and hasattr(error, 'read'):
                try:
                    error.proxy_failure_hint = b'upstream connect error or disconnect/reset before headers' in error.read(512)
                except OSError:
                    pass
            circuit.failure(request.full_url, error)
            raise
        circuit.success()
        return response

    http.opener, http._wait = observed, wait
    try:
        yield
    finally:
        http.opener, http._wait = opener, admission
