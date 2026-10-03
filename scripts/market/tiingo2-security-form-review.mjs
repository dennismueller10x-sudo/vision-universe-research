import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function securityFormReviewTickers(root) {
  const document = JSON.parse(readFileSync(join(root, 'quant/config/tiingo2-security-form-review.json'), 'utf8'));
  if (document.schemaVersion !== 'tiingo2-security-form-review-1' ||
      document.reasonCode !== 'SECURITY_FORM_REVIEW_REQUIRED' ||
      !Array.isArray(document.tickers) || document.tickers.length !== 13 ||
      new Set(document.tickers).size !== document.tickers.length ||
      document.tickers.some(ticker => !/^[A-Z0-9]{1,12}$/.test(ticker))) {
    throw Error('SECURITY_FORM_REVIEW_MANIFEST_INVALID');
  }
  return new Set(document.tickers);
}
