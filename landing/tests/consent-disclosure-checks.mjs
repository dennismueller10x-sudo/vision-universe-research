import assert from 'node:assert/strict';
import {CONSENT_TEXT} from '../server/newsletter.mjs';
export async function checkConsentDisclosure(page){
  const details=page.locator('.consent-details'),summary=details.locator('summary'),checkbox=page.locator('#consent');
  assert.equal(await details.evaluate(e=>e.open),false);
  assert.equal(await checkbox.isChecked(),false);
  assert.equal(await details.locator('p').textContent(),CONSENT_TEXT);
  const target=await summary.boundingBox();assert.ok(target.height>=44&&target.width>=44);
  await summary.click();assert.equal(await details.locator('p').isVisible(),true);
  assert.equal(await checkbox.isChecked(),false,'Opening consent information must not opt in');
  await summary.press('Enter');assert.equal(await details.evaluate(e=>e.open),false);
  assert.equal(await checkbox.isChecked(),false);
}
