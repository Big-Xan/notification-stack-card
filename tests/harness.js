// Minimal HA stand-ins for exercising notification-stack-card.js in headless Chromium.
const { chromium } = require('playwright');
const fs = require('fs');

const STUBS = `
customElements.define('ha-icon', class extends HTMLElement {});
customElements.define('ha-card', class extends HTMLElement { connectedCallback(){ this.style.display='block'; } });
customElements.define('ha-form', class extends HTMLElement {
  set schema(v) { this._schema = v; } get schema() { return this._schema; }
  set data(v) { this._data = v; } get data() { return this._data; }
  emit(value) { this.dispatchEvent(new CustomEvent('value-changed', { detail: { value } })); }
});
window.tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
window.frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
window.toasts = [];
document.addEventListener('hass-notification', (e) => window.toasts.push(e.detail.message));
window.makeHass = (states, opts = {}) => {
  const calls = [];
  const subs = [];
  const evSubs = [];
  const hass = {
    states, user: { id: 'u1' }, calls,
    callService: (d, s, data, target) => {
      calls.push({ d, s, data, target });
      return opts.callService ? opts.callService(d, s, data, target) : Promise.resolve({ context: {} });
    },
    callWS: (msg) => (opts.callWS ? opts.callWS(msg) : Promise.reject(new Error('no ws'))),
    connection: {
      subscribeMessage: (cb, msg) => { subs.push(cb); return opts.subscribe ? opts.subscribe(cb, msg) : Promise.resolve(() => {}); },
      subscribeEvents: (cb, ev) => { evSubs.push(cb); return Promise.resolve(() => {}); },
    },
    _subs: subs, _evSubs: evSubs,
  };
  return hass;
};
window.st = (id, state, attrs = {}, lc = '2026-11-01T10:00:00Z') => ({ entity_id: id, state, attributes: attrs, last_changed: lc, last_updated: lc });
window.mount = (config, hass) => {
  const el = document.createElement('notification-stack-card');
  el.setConfig(config);
  document.body.appendChild(el);
  if (hass) el.hass = hass;
  return el;
};
window.ids = (el) => el._alerts.map((a) => a.id);
window.unhandled = [];
window.addEventListener('unhandledrejection', (e) => window.unhandled.push(String(e.reason?.message || e.reason)));
`;

async function open(src) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('http://nsc.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="font-family:sans-serif"></body></html>' }));
  await page.goto('http://nsc.test/lovelace/0');
  await page.addScriptTag({ content: STUBS });
  await page.addScriptTag({ content: fs.readFileSync(src, 'utf8') });
  return { browser, page, errors };
}
module.exports = { open };
