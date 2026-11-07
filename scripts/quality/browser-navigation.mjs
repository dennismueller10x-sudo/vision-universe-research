// Hash navigations may resolve before the View Transition update callback.
// Wait for the browser snapshot/update boundary before inspecting the new DOM.
// This does not wait for data, suppress errors, or change any QA expectation.
export async function navigate(page, url, options) {
  const response = await page.goto(url, options);
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    const transition = document.activeViewTransition;
    if (transition) await transition.updateCallbackDone;
  });
  return response;
}
