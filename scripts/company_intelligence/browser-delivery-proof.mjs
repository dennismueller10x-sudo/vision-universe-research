import assert from 'node:assert/strict';

// Stock hydration can mount the existing chapter twice. Successful repeat reads
// are not retries; each completed mount still has exactly three consumer paths.
export function assertConsumerResponses(responses, ticker) {
  const resources = Map.groupBy(responses, r => new URL(r.url).pathname);
  assert.equal(resources.size, 3, ticker + ' exact consumer resources');
  for (const [path, attempts] of resources) {
    const successes = attempts.filter(r => r.status === 200).length;
    assert(successes >= 1 && successes <= 2, path + ' bounded completed mounts');
    assert.equal(attempts.at(-1).status, 200, path + ' final delivery');
    assert(attempts.length <= successes * 3, path + ' bounded attempts per mount');
    assert(attempts.every(r => r.status === 200 || [429, 500, 502, 503, 504].includes(r.status)), path + ' successful reads or transient retries only');
  }
}
