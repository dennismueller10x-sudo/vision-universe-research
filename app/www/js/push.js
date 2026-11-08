// Keine Berechtigungsabfrage beim Start. Einzig enable() darf sie ausloesen.
export function createPush({plugin, api, preferences, platform}) {
  let state = {}, handles = [], active = false, finish = null;
  const save = () => preferences.set(state);
  async function registered({value}) {
    if (!active) return;
    if (state.token && state.token !== value) await api.removePush({token: state.token});
    await api.registerPush({token: value, platform});
    if (!active) { await api.removePush({token: value}); return; }
    state = {enabled: true, token: value}; await save();
  }
  return {
    enabled: () => state.enabled === true,
    async init() { state = await preferences.get() || {}; },
    async enable() {
      if (!plugin) throw new Error('PUSH_UNAVAILABLE');
      const permission = await plugin.requestPermissions();
      if (permission.receive !== 'granted') throw new Error('PUSH_DENIED');
      active = true;
      if (!handles.length) {
        handles.push(await plugin.addListener('registration', token => { registered(token).then(() => finish?.resolve(), () => finish?.reject(new Error('PUSH_SAVE_FAILED'))); }));
        handles.push(await plugin.addListener('registrationError', () => { active = false; finish?.reject(new Error('PUSH_REGISTRATION_FAILED')); }));
      }
      let timer;
      const ready = new Promise((resolve, reject) => { finish = {resolve, reject}; timer = setTimeout(() => reject(new Error('PUSH_TIMEOUT')), 15000); });
      try { await plugin.register().catch(error => finish.reject(error)); await ready; }
      finally { clearTimeout(timer); finish = null; }
    },
    async resume() {
      if (state.pendingRemoval) { await this.disable(); return; }
      if (!state.enabled || !plugin) return;
      if ((await plugin.checkPermissions()).receive !== 'granted') return this.disable();
      active = true;
      if (!handles.length) handles.push(await plugin.addListener('registration', token => { registered(token).then(() => finish?.resolve(), () => finish?.reject(new Error('PUSH_SAVE_FAILED'))); }));
      await plugin.register();
    },
    async disable() {
      active = false;
      // Server zuerst; bei Offline native Zustellung stoppen und Bereinigung vormerken.
      if (state.token) {
        try { await api.removePush({token: state.token}); }
        catch (error) { state.enabled = false; state.pendingRemoval = true; await save(); await plugin?.unregister().catch(() => {}); throw error; }
      }
      await plugin?.unregister();
      for (const h of handles) await h.remove();
      handles = []; state = {}; await save();
    },
  };
}
