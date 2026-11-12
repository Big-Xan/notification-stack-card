// Browser tests for notification-stack-card.js, run in headless Chromium with stand-ins for ha-card, ha-icon,
// ha-form and hass. Usage: npm install playwright && npx playwright install chromium
//        node tests/run.js notification-stack-card.js [screenshot.png]
const { open } = require('./harness');
const SRC = process.argv[2];
const SHOT = process.argv[3];
const T = [];
const test = (name, fn, check, arg) => T.push({ name, fn, check, arg });
const st = (id, state, attrs = {}, lc = '2026-11-01T10:00:00Z') => ({ entity_id: id, state, attributes: attrs, last_changed: lc, last_updated: lc });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const DOOR = { views: [{ cards: [{ type: 'custom:notification-stack-card', template_name: 'shared', alerts: [{ id: 'door', entity: 'binary_sensor.door' }] }] }] };

// ---------- fixes ----------
test('A template alert dismissal survives a reload', async (DOOR) => {
  const mk = () => makeHass({ 'binary_sensor.door': st('binary_sensor.door', 'on') }, { callWS: () => new Promise((r) => setTimeout(() => r(DOOR), 40)) });
  const cfg = { templates: ['dash_a/shared'], storage_key: 'A' };
  let el = mount(cfg, mk());
  await tick(100);
  const before = ids(el);
  el._dismiss(el._alerts[0]);
  el.remove();
  el = mount(cfg, mk());
  await tick(100);
  return { before, after: ids(el) };
}, (r) => eq(r, { before: ['door:binary_sensor.door'], after: [] }), DOOR);

test('A2 editing the card keeps loaded template alerts (no flicker)', async (DOOR) => {
  const hass = makeHass({ 'binary_sensor.door': st('binary_sensor.door', 'on') }, { callWS: () => new Promise((r) => setTimeout(() => r(DOOR), 40)) });
  const el = mount({ templates: ['dash_a2/shared'] }, hass);
  await tick(100);
  el.setConfig({ templates: ['dash_a2/shared'], title: 'x' });
  return ids(el);
}, (r) => eq(r, ['door:binary_sensor.door']), DOOR);

test('B removing a template while it loads keeps it removed', async () => {
  const conf = { views: [{ cards: [{ type: 'custom:notification-stack-card', template_name: 'slow', alerts: [{ id: 'leak', entity: 'binary_sensor.leak' }] }] }] };
  const hass = makeHass({ 'binary_sensor.leak': st('binary_sensor.leak', 'on') }, { callWS: () => new Promise((r) => setTimeout(() => r(conf), 60)) });
  const el = mount({ templates: ['dash_b/slow'] }, hass);
  el.setConfig({ templates: [] });
  await tick(120);
  return ids(el);
}, (r) => eq(r, []));

test('C same alert id in two templates: the later template wins', async () => {
  const t = (name, title) => ({ type: 'custom:notification-stack-card', template_name: name, alerts: [{ id: 'leak', entity: 'binary_sensor.leak', title }] });
  const conf = { views: [{ cards: [t('one', 'From one'), t('two', 'From two')] }] };
  const hass = makeHass({ 'binary_sensor.leak': st('binary_sensor.leak', 'on') }, { callWS: () => Promise.resolve(conf) });
  const el = mount({ templates: ['dash_c/one', 'dash_c/two'] }, hass);
  await tick(30);
  return { titles: el._alerts.map((a) => a.title), dom: el.shadowRoot.querySelectorAll('.item').length };
}, (r) => eq(r, { titles: ['From two'], dom: 1 }));

test('C2 card alert still beats template alert with the same id', async () => {
  const conf = { views: [{ cards: [{ type: 'custom:notification-stack-card', template_name: 'one', alerts: [{ id: 'leak', entity: 'binary_sensor.leak', title: 'Template' }] }] }] };
  const hass = makeHass({ 'binary_sensor.leak': st('binary_sensor.leak', 'on') }, { callWS: () => Promise.resolve(conf) });
  const el = mount({ templates: ['dash_c2/one'], alerts: [{ id: 'leak', entity: 'binary_sensor.leak', title: 'Local' }] }, hass);
  await tick(30);
  return el._alerts.map((a) => a.title);
}, (r) => eq(r, ['Local']));

test('C3 duplicate local ids on one entity show one card, distinct entities still both show', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') });
  const el = mount({ alerts: [{ id: 'x', entity: 'binary_sensor.a' }, { id: 'x', entity: 'binary_sensor.a' }, { id: 'x', entity: 'binary_sensor.b' }] }, hass);
  return ids(el).sort();
}, (r) => eq(r, ['x:binary_sensor.a', 'x:binary_sensor.b']));

test('D group conditions apply to persistent notifications', async () => {
  let cb;
  const states = { 'input_boolean.away': st('input_boolean.away', 'off') };
  const hass = makeHass(states, { subscribe: (c) => { cb = c; return Promise.resolve(() => {}); } });
  const el = mount({ persistent_notifications: true, persistent_group: 'sys', groups: [{ id: 'sys', name: 'System', conditions: [{ entity: 'input_boolean.away', state: 'on' }] }] }, hass);
  cb({ type: 'current', notifications: { n1: { notification_id: 'n1', title: 'Hi', message: 'x', created_at: '2026-11-01T10:00:00Z' } } });
  const off = ids(el);
  el.hass = { ...hass, states: { 'input_boolean.away': st('input_boolean.away', 'on') } };
  return { off, on: ids(el) };
}, (r) => eq(r, { off: [], on: ['pn:n1'] }));

test('E missing/null/blank values never match; real states still do', async () => {
  const hass = makeHass({
    'sensor.a': st('sensor.a', '5', { battery: null, blank: '' }),
    'sensor.zero': st('sensor.zero', '0'),
    'camera.c': st('camera.c', 'unavailable'),
    'sensor.e': st('sensor.e', 'error', { status: 'fault' }),
  });
  const el = mount({ alerts: [
    { id: 'notok', entity: 'sensor.a', attribute: 'status', state_not: 'ok' },
    { id: 'low', entity: 'sensor.a', attribute: 'battery', below: 20 },
    { id: 'blank', entity: 'sensor.a', attribute: 'blank', below: 20 },
    { id: 'zero', entity: 'sensor.zero', below: 1 },
    { id: 'cam', entity: 'camera.c', state: 'unavailable' },
    { id: 'attr', entity: 'sensor.e', attribute: 'status', state_not: 'ok' },
  ] }, hass);
  return ids(el).sort();
}, (r) => eq(r, ['attr:sensor.e', 'cam:camera.c', 'zero:sensor.zero']));

const peekTest = (cfg) => async (cfg) => {
  const s = {}; ['a', 'b', 'c'].forEach((x) => (s['binary_sensor.' + x] = st('binary_sensor.' + x, 'on')));
  const el = mount({ max_peek: 2, ...cfg, alerts: [{ id: 'r', entities: Object.keys(s) }] }, makeHass(s));
  await frames();
  return [...el.shadowRoot.querySelectorAll('.item')].map((i) => i.style.getPropertyValue('--y'));
};
test('F peek_offset: 0 is honored', peekTest(), (r) => eq(r, ['0px', '0px', '0px']), { peek_offset: 0 });
test('F2 peek_offset default and blank stay 10', peekTest(), (r) => eq(r, ['0px', '10px', '20px']), { peek_offset: '' });
test('F3 negative peek_offset is treated as 0', peekTest(), (r) => eq(r, ['0px', '0px', '0px']), { peek_offset: -5 });

const lockCard = (extra = {}) => ({ alerts: [{ id: 'lock', entity: 'lock.front', state: 'unlocked', actions: [{ name: 'Lock', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'lock.lock', target: { entity_id: 'lock.front' } }, ...extra }] }] });

test('G1 failed service keeps the alert, flags the button, no card toast', async (lockCard) => {
  const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') }, { callService: () => Promise.reject(new Error('jammed')) });
  const el = mount(lockCard, hass);
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(20);
  const btn = el.shadowRoot.querySelector('[data-act]');
  return { shown: ids(el), stored: localStorage.getItem('nsc-dismissed:default'), failed: btn.classList.contains('failed'), label: btn.textContent, toasts: window.toasts, unhandled: window.unhandled };
}, (r) => eq(r, { shown: ['lock:lock.front'], stored: null, failed: true, label: 'Failed', toasts: [], unhandled: [] }), lockCard());

test('G2 dismiss waits for success; button busy meanwhile', async (lockCard) => {
  let resolve;
  const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') }, { callService: () => new Promise((r) => (resolve = r)) });
  const el = mount(lockCard, hass);
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(10);
  const btn = el.shadowRoot.querySelector('[data-act]');
  const during = { shown: ids(el), busy: btn.disabled && btn.classList.contains('busy') };
  btn.click(); // disabled: ignored
  resolve({ context: {} });
  await tick(10);
  return { during, after: ids(el), calls: hass.calls.length };
}, (r) => eq(r, { during: { shown: ['lock:lock.front'], busy: true }, after: [], calls: 1 }), lockCard());

test('G3 dismiss: false leaves the alert after success', async (lockCard) => {
  const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') });
  const el = mount(lockCard, hass);
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(10);
  return { shown: ids(el), calls: hass.calls.length, busy: !!el.shadowRoot.querySelector('.act.busy') };
}, (r) => eq(r, { shown: ['lock:lock.front'], calls: 1, busy: false }), lockCard({ dismiss: false }));

test('G4 a new incident during the request is not dismissed', async (lockCard) => {
  let resolve;
  const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') }, { callService: () => new Promise((r) => (resolve = r)) });
  const el = mount(lockCard, hass);
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(10);
  el.hass = { ...hass, states: { 'lock.front': st('lock.front', 'unlocked', {}, '2026-11-01T11:00:00Z') } };
  resolve({});
  await tick(10);
  return ids(el);
}, (r) => eq(r, ['lock:lock.front']), lockCard());

test('G5 confirm: first tap asks, second runs', async (lockCard) => {
  const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') });
  const el = mount(lockCard, hass);
  el.shadowRoot.querySelector('[data-act]').click();
  const first = { calls: hass.calls.length, label: el.shadowRoot.querySelector('[data-act]').textContent };
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(10);
  return { first, calls: hass.calls.length, shown: ids(el) };
}, (r) => eq(r, { first: { calls: 0, label: 'Sure?' }, calls: 1, shown: [] }), lockCard({ confirm: true, confirm_text: 'Sure?' }));

test('G6 dismiss-only and navigate buttons still dismiss at once', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') });
  const el = mount({ alerts: [
    { id: 'a', entity: 'binary_sensor.a', actions: [{ name: 'Got it', dismiss: true }] },
    { id: 'b', entity: 'binary_sensor.b', actions: [{ name: 'Go', dismiss: true, tap_action: { action: 'navigate', navigation_path: '#x' } }] },
  ] }, hass);
  el._onActionButton(el._alerts.find((a) => a.id.startsWith('a:')), 0);
  el._onActionButton(el._alerts.find((a) => a.id.startsWith('b:')), 0);
  await tick(5);
  return { shown: ids(el), hash: location.hash };
}, (r) => eq(r, { shown: [], hash: '#x' }));

test('G7 invalid action name keeps the alert and says why', async (lockCard) => {
  const el = mount(lockCard, makeHass({ 'lock.front': st('lock.front', 'unlocked') }));
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(10);
  return { shown: ids(el), toasts: window.toasts, unhandled: window.unhandled };
}, (r) => r.shown.length === 1 && r.toasts.length === 1 && /isn't a valid action/.test(r.toasts[0]) && !r.unhandled.length,
  { alerts: [{ id: 'lock', entity: 'lock.front', state: 'unlocked', actions: [{ name: 'Lock', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'locklock' } }] }] });

test('G8 the button stays busy until Home Assistant answers, however long', async (lockCard) => {
  const real = window.setTimeout;
  window.setTimeout = (fn, ms, ...a) => real(fn, ms >= 30000 ? 30 : ms, ...a); // a 30 s timer would fire now
  try {
    let resolve;
    const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') }, { callService: () => new Promise((r) => (resolve = r)) });
    const el = mount(lockCard, hass);
    el.shadowRoot.querySelector('[data-act]').click();
    await tick(60);
    const btn = el.shadowRoot.querySelector('[data-act]');
    const busy = btn.disabled;
    el._onActionButton(el._alerts[0], 0);
    const calls = hass.calls.length;
    resolve({ context: {} });
    await tick(10);
    return { busy, calls, shown: ids(el) };
  } finally { window.setTimeout = real; }
}, (r) => eq(r, { busy: true, calls: 1, shown: [] }), lockCard());

test('A3 a template that fails to load keeps its dismissals', async (DOOR) => {
  localStorage.setItem('nsc-dismissed:A3', JSON.stringify({ 'door:binary_sensor.door': ['binary_sensor.door@2026-11-01T10:00:00Z'] }));
  const hass = makeHass({ 'binary_sensor.door': st('binary_sensor.door', 'on') }, { callWS: () => Promise.reject(new Error('offline')) });
  mount({ templates: ['dash_a3/shared'], storage_key: 'A3' }, hass);
  await tick(50);
  return Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:A3')));
}, (r) => eq(r, ['door:binary_sensor.door']), DOOR);

test('H toggle: double tap sends one call, failure is handled', async () => {
  const hass = makeHass({ 'switch.p': st('switch.p', 'on') }, { callService: () => new Promise((_, j) => setTimeout(() => j(new Error('nope')), 20)) });
  const el = mount({ alerts: [{ id: 'p', entity: 'switch.p', actions: [{ name: 'Off', tap_action: { action: 'toggle' } }] }] }, hass);
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(1);
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(60);
  return { calls: hass.calls.length, unhandled: window.unhandled };
}, (r) => eq(r, { calls: 1, unhandled: [] }));

test('H2 card tap_action failure is not unhandled', async () => {
  const hass = makeHass({ 'switch.p': st('switch.p', 'on') }, { callService: () => Promise.reject(new Error('nope')) });
  const el = mount({ alerts: [{ id: 'p', entity: 'switch.p', tap_action: { action: 'toggle' } }] }, hass);
  el.shadowRoot.querySelector('.item .ttl').click();
  await tick(10);
  return { calls: hass.calls.length, unhandled: window.unhandled };
}, (r) => eq(r, { calls: 1, unhandled: [] }));

test('I quiet hours and zones keep a dismissal; conditions off/on bring it back', async () => {
  const states = { 'binary_sensor.w': st('binary_sensor.w', 'on'), 'input_boolean.arm': st('input_boolean.arm', 'on'), 'person.me': st('person.me', 'home', { user_id: 'u1' }) };
  const hass = makeHass(states);
  const el = mount({ storage_key: 'I', groups: [{ id: 'g', name: 'G' }], alerts: [{ id: 'w', entity: 'binary_sensor.w', group: 'g', conditions: [{ entity: 'input_boolean.arm', state: 'on' }] }] }, hass);
  el._dismiss(el._alerts[0]);
  const g = el._groups.get('g');
  g.quiet_hours = { start: '00:00', end: '23:59' }; el._refresh();
  g.quiet_hours = undefined; el._refresh();
  const afterQuiet = ids(el);
  g.zones = ['zone.work']; el._refresh(); // viewer is home -> hidden by zone
  g.zones = undefined; el._refresh();
  const afterZone = ids(el);
  el.hass = { ...hass, states: { ...states, 'input_boolean.arm': st('input_boolean.arm', 'off') } };
  el.hass = { ...hass, states };
  return { afterQuiet, afterZone, afterRearm: ids(el) };
}, (r) => eq(r, { afterQuiet: [], afterZone: [], afterRearm: ['w:binary_sensor.w'] }));

test('I2 a dismissal this card can\'t produce is left alone (another card\'s, or a removed alert)', async () => {
  localStorage.setItem('nsc-dismissed:I2', JSON.stringify({ 'gone:binary_sensor.x': ['binary_sensor.x@1'] }));
  mount({ storage_key: 'I2', alerts: [] }, makeHass({}));
  return localStorage.getItem('nsc-dismissed:I2');
}, (r) => r === '{"gone:binary_sensor.x":["binary_sensor.x@1"]}');

test('I3 entity change still brings a dismissed alert back', async () => {
  const hass = makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on') });
  const el = mount({ alerts: [{ id: 'w', entity: 'binary_sensor.w' }] }, hass);
  el._dismiss(el._alerts[0]);
  const hidden = ids(el);
  el.hass = { ...hass, states: { 'binary_sensor.w': st('binary_sensor.w', 'on', {}, '2026-11-02T10:00:00Z') } };
  return { hidden, back: ids(el) };
}, (r) => eq(r, { hidden: [], back: ['w:binary_sensor.w'] }));

test('J custom CSS stays CSS', async () => {
  const el = mount({ styles: '.wrap{outline:3px solid rgb(1, 2, 3)}</style><b id="inj">x</b><style>', when_empty: 'show', alerts: [] }, makeHass({}));
  return { injected: !!el.shadowRoot.getElementById('inj'), applied: getComputedStyle(el.shadowRoot.querySelector('.wrap')).outlineColor };
}, (r) => r.injected === false && r.applied === 'rgb(1, 2, 3)');

const pnHass = (fail) => {
  let cb;
  const hass = makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on') }, {
    subscribe: (c) => { cb = c; return Promise.resolve(() => {}); },
    callService: (d, s, data) => (fail(data) ? Promise.reject(new Error('fail')) : Promise.resolve({})),
  });
  return { hass, push: (m) => cb(m) };
};
const pnList = { n1: { notification_id: 'n1', title: 'One', created_at: '2026-11-01T10:00:00Z' }, n2: { notification_id: 'n2', title: 'Two', created_at: '2026-11-01T10:01:00Z' }, n3: { notification_id: 'n3', title: 'Three', created_at: '2026-11-01T10:02:00Z' } };

test('K failed notification dismiss brings it back', async (pnList) => {
  const { hass, push } = __pnHass(() => true);
  const el = mount({ persistent_notifications: true }, hass);
  push({ type: 'current', notifications: { n1: pnList.n1 } });
  el._dismiss(el._alerts[0]);
  const right = ids(el);
  await tick(10);
  return { right, after: ids(el), unhandled: window.unhandled };
}, (r) => eq(r, { right: [], after: ['pn:n1'], unhandled: [] }), pnList);

test('K2 Clear all: local alerts clear, failed notifications return, one summary', async (pnList) => {
  const { hass, push } = __pnHass((d) => d.notification_id !== 'n3');
  const el = mount({ persistent_notifications: true, alerts: [{ id: 'w', entity: 'binary_sensor.w' }] }, hass);
  push({ type: 'current', notifications: pnList });
  el._setExpanded(true);
  el._onClearAll(); el._onClearAll();
  await tick(10);
  return { left: ids(el).sort(), toasts: window.toasts };
}, (r) => eq(r, { left: ['pn:n1', 'pn:n2'], toasts: ["Couldn't clear 2 notifications"] }), pnList);

test('L quiet hours: invalid times are ignored, valid windows cross midnight', async () => {
  const at = (h, m) => new Date(2026, 10, 4, h, m);
  return {
    invalid: [minutesOf('25:90'), minutesOf('24:00'), minutesOf('7:5')],
    seconds: minutesOf('22:00:00'),
    night: [inQuietHours({ start: '22:00', end: '07:00' }, at(23, 0)), inQuietHours({ start: '22:00', end: '07:00' }, at(7, 0)), inQuietHours({ start: '22:00', end: '07:00' }, at(6, 59))],
  };
}, (r) => eq(r, { invalid: [null, null, null], seconds: 1320, night: [true, false, true] }));

test('M url action refuses javascript: links', async () => {
  const opened = []; window.open = (u) => opened.push(u);
  const el = mount({ alerts: [] }, makeHass({}));
  const a = { entity: 'x' };
  el._runAction({ action: 'url', url_path: ' java\tscript:alert(1)' }, a);
  el._runAction({ action: 'url', url_path: 'https://example.com' }, a);
  el._runAction({ action: 'url', url_path: 'homeassistant://navigate/x' }, a);
  return opened;
}, (r) => eq(r, ['https://example.com', 'homeassistant://navigate/x']));

test('N turning persistent notifications off unsubscribes', async () => {
  let unsubbed = 0;
  const hass = makeHass({}, { subscribe: () => Promise.resolve(() => unsubbed++) });
  const el = mount({ persistent_notifications: true }, hass);
  el.setConfig({ persistent_notifications: false });
  await tick(5);
  el.setConfig({ persistent_notifications: true });
  return { unsubbed, subs: hass._subs.length };
}, (r) => eq(r, { unsubbed: 1, subs: 2 }));

test('O a person linked later is found for zones', async () => {
  const states = { 'binary_sensor.w': st('binary_sensor.w', 'on') };
  const hass = makeHass(states);
  const el = mount({ groups: [{ id: 'g', zones: ['zone.home'], zone_mode: 'outside' }], alerts: [{ id: 'w', entity: 'binary_sensor.w', group: 'g' }] }, hass);
  const before = ids(el);
  el.hass = { ...hass, states: { ...states, 'person.me': st('person.me', 'home', { user_id: 'u1' }) } };
  return { before, after: ids(el) };
}, (r) => eq(r, { before: ['w:binary_sensor.w'], after: [] }));

test('P states match regardless of case', async () => {
  const hass = makeHass({ 'lock.f': st('lock.f', 'unlocked'), 'sensor.r': st('sensor.r', 'Docked') });
  const el = mount({ alerts: [
    { id: 'a', entity: 'lock.f', state: ['Unlocked', ' Open '] },
    { id: 'b', entity: 'sensor.r', state_not: 'docked' },
    { id: 'c', entity: 'sensor.r', state: 'docked' },
  ] }, hass);
  return ids(el).sort();
}, (r) => eq(r, ['a:lock.f', 'c:sensor.r']));

test('Q editor: a comma typed into State survives the redraw', async () => {
  const ed = document.createElement('notification-stack-card-editor');
  ed.hass = makeHass({ 'lock.f': st('lock.f', 'unlocked') });
  ed.setConfig({ type: 'custom:notification-stack-card', alerts: [{ id: 'a', entity: 'lock.f' }] });
  document.body.appendChild(ed);
  await tick(50);
  let out;
  ed.addEventListener('config-changed', (e) => { out = e.detail.config; ed.setConfig(out); });
  ed._open.add('a:a'); ed._render(true); await tick(20);
  const form = () => [...ed.shadowRoot.querySelectorAll('ha-form')].find((f) => f.schema?.some?.((x) => x.name === 'g_match'));
  const steps = [];
  for (const typed of ['unlocked,', 'unlocked, open']) {
    form().emit({ ...form().data, state: typed });
    await tick(5);
    steps.push([form().data.state, out.alerts[0].state]);
  }
  return steps;
}, (r) => eq(r, [['unlocked,', 'unlocked'], ['unlocked, open', ['unlocked', 'open']]]));

test('S states match as shown ("Clear") or raw ("off")', async () => {
  const hass = makeHass({ 'binary_sensor.cam': st('binary_sensor.cam', 'off', { device_class: 'occupancy' }) });
  hass.formatEntityState = (so) => ({ off: 'Clear', on: 'Detected' }[so.state] || so.state);
  const el = mount({ alerts: [
    { id: 'shown', entity: 'binary_sensor.cam', state: 'Clear' },
    { id: 'raw', entity: 'binary_sensor.cam', state: 'off' },
    { id: 'not_shown', entity: 'binary_sensor.cam', state_not: 'clear' },
    { id: 'not_unavail', entity: 'binary_sensor.cam', state_not: 'unavailable' },
    { id: 'other', entity: 'binary_sensor.cam', state: 'Detected' },
  ] }, hass);
  return ids(el).sort();
}, (r) => eq(r, ['not_unavail:binary_sensor.cam', 'raw:binary_sensor.cam', 'shown:binary_sensor.cam']));

test('T {name} uses Home Assistant\'s entity name, falling back to friendly_name', async () => {
  const s = { 'binary_sensor.a': st('binary_sensor.a', 'on', { friendly_name: 'Old name' }), 'binary_sensor.b': st('binary_sensor.b', 'on', { friendly_name: 'B friendly' }) };
  const hass = makeHass(s);
  hass.formatEntityName = (so) => (so.entity_id === 'binary_sensor.a' ? 'Kitchen Sink Leak Sensor Moisture' : '');
  const el = mount({ alerts: [{ id: 'a', entity: 'binary_sensor.a' }, { id: 'b', entity: 'binary_sensor.b' }, { id: 'c', entities: [{ entity: 'binary_sensor.a', name: 'Kitchen sink' }] }] }, hass);
  return el._alerts.map((x) => x.title).sort();
}, (r) => eq(r, ['B friendly', 'Kitchen Sink Leak Sensor Moisture', 'Kitchen sink']));

test('U card picker suggests only for locks and attention-worthy binary sensors', async () => {
  const entry = window.customCards.find((c) => c.type === 'notification-stack-card');
  const hass = makeHass({
    'lock.front': st('lock.front', 'locked'),
    'binary_sensor.leak': st('binary_sensor.leak', 'off', { device_class: 'moisture' }),
    'binary_sensor.door': st('binary_sensor.door', 'off', { device_class: 'door' }),
    'binary_sensor.motion': st('binary_sensor.motion', 'off', { device_class: 'motion' }),
    'sensor.temp': st('sensor.temp', '20'),
  });
  const pick = (id) => entry.getEntitySuggestion(hass, id)?.config.alerts[0] || null;
  return { doc: !!entry.documentationURL, lock: pick('lock.front'), leak: pick('binary_sensor.leak'), door: pick('binary_sensor.door')?.severity, motion: pick('binary_sensor.motion'), temp: pick('sensor.temp'), missing: pick('lock.nope') };
}, (r) => eq(r, { doc: true, lock: { id: 'alert_front', entity: 'lock.front', severity: 'warning', state: ['unlocked', 'open', 'jammed'] }, leak: { id: 'alert_leak', entity: 'binary_sensor.leak', severity: 'critical' }, door: 'warning', motion: null, temp: null, missing: null }));

test('U2 a suggested card config renders', async () => {
  const entry = window.customCards.find((c) => c.type === 'notification-stack-card');
  const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') });
  const { config } = entry.getEntitySuggestion(hass, 'lock.front');
  const el = mount(config, hass);
  return ids(el);
}, (r) => eq(r, ['alert_front:lock.front']));

test('V snooze options: alert beats group beats card', async () => {
  const s = { 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on'), 'binary_sensor.c': st('binary_sensor.c', 'on') };
  const el = mount({
    snooze_options: [{ label: 'Card 5', minutes: 5 }],
    groups: [{ id: 'g', snooze_options: [{ label: 'Group 1h', minutes: 60 }] }],
    alerts: [
      { id: 'a', entity: 'binary_sensor.a', group: 'g', snooze_options: [{ label: 'Alert 2h', minutes: 120 }] },
      { id: 'b', entity: 'binary_sensor.b', group: 'g', snooze_options: [] },
      { id: 'c', entity: 'binary_sensor.c' },
    ],
  }, makeHass(s));
  const of = (id) => el._optionsFor(el._alerts.find((x) => x.id.startsWith(id + ':'))).map((o) => o.label);
  return { a: of('a'), b: of('b'), c: of('c') };
}, (r) => eq(r, { a: ['Alert 2h'], b: ['Group 1h'], c: ['Card 5'] }));

test('W editor: snooze section explains, customizes and resets', async () => {
  const ed = document.createElement('notification-stack-card-editor');
  ed.hass = makeHass({ 'lock.f': st('lock.f', 'unlocked') });
  let cfg = { type: 'custom:notification-stack-card', snooze_options: [{ label: '10 minutes', minutes: 10 }],
    groups: [{ id: 'sec', name: 'Security', snooze_options: [{ label: '1 hour', minutes: 60 }] }],
    alerts: [{ id: 'a', entity: 'lock.f', group: 'sec' }, { id: 'b', entity: 'lock.f', snoozable: false }] };
  ed.setConfig(cfg);
  document.body.appendChild(ed);
  ed.addEventListener('config-changed', (e) => { cfg = e.detail.config; ed.setConfig(cfg); });
  await tick(50);
  const sections = () => [...ed.shadowRoot.querySelectorAll('details details')].filter((d) => /Snooze options/.test(d.querySelector('summary').textContent));
  const alertSec = (n) => sections().find((d) => d.closest('details:not(details details)') && d.parentElement.closest('details').querySelector('summary').textContent.includes(n));
  const notes = sections().map((d) => d.querySelector('.note').textContent);
  const summaries = sections().map((d) => d.querySelector('summary .sub').textContent);
  // customize alert a: copies the group's options
  const btn = (d, text) => [...d.querySelectorAll('button.add')].find((x) => x.textContent.includes(text));
  btn(sections()[1], 'Customize').click(); await tick(20);
  const afterCustomize = clone(cfg.alerts[0].snooze_options);
  const ownNote = sections()[1].querySelector('.note').textContent;
  btn(sections()[1], 'Reset to default').click(); await tick(20);
  // reset the group, then customize it: copies the card's
  btn(sections()[0], 'Reset to default').click(); await tick(20);
  const groupReset = 'snooze_options' in cfg.groups[0];
  btn(sections()[0], 'Customize').click(); await tick(20);
  return { count: sections().length, notes, summaries, afterCustomize, ownNote, afterReset: 'snooze_options' in cfg.alerts[0], groupReset, groupAfter: cfg.groups[0].snooze_options };
  function clone(v) { return JSON.parse(JSON.stringify(v ?? null)); }
}, (r) => r.count === 3
  && /^Alerts in this group use these instead of this card's options \(10 minutes\)/.test(r.notes[0])
  && /Uses the Security group's options: 1 hour\./.test(r.notes[1])
  && /^This alert isn't snoozable/.test(r.notes[2])
  && r.summaries[1] === "default (Security group's)"
  && eq(r.afterCustomize, [{ label: '1 hour', minutes: 60 }])
  && /instead of the Security group's options \(1 hour\)/.test(r.ownNote)
  && r.afterReset === false
  && r.groupReset === false
  && eq(r.groupAfter, [{ label: '10 minutes', minutes: 10 }]));

const snoozeCard = { snooze_options: [
  { label: 'Until I\'m home', until_zone: 'zone.home' },
  { label: 'Unless rain', until_conditions: [{ entity: 'binary_sensor.rain', state: 'on' }] },
  { label: '1 min', minutes: 1 },
], alerts: [{ id: 'w', entity: 'binary_sensor.w' }] };
const snoozeStates = (where, rain) => ({
  'binary_sensor.w': st('binary_sensor.w', 'on'),
  'binary_sensor.rain': st('binary_sensor.rain', rain),
  'person.me': st('person.me', where, { user_id: 'u1' }),
});

test('X1 snooze until I arrive home', async ([cfg, s1, s2, s3]) => {
  const hass = makeHass(s1);
  const el = mount(cfg, hass);
  const labels = el._optionsFor(el._alerts[0]).map((o) => o.label);
  el._snooze(el._items.get('w:binary_sensor.w'), el._alerts[0], 0);
  await tick(300);
  const away = ids(el);
  el.hass = { ...hass, states: s2 }; // still away, elsewhere
  const stillAway = ids(el);
  el.hass = { ...hass, states: s3 }; // home
  return { labels, away, stillAway, home: ids(el) };
}, (r) => eq(r, { labels: ["Until I'm home", 'Unless rain', '1 min'], away: [], stillAway: [], home: ['w:binary_sensor.w'] }),
  [snoozeCard, snoozeStates('work', 'off'), snoozeStates('not_home', 'off'), snoozeStates('home', 'off')]);

test('X2 snoozed while already home: ends the next time I come home', async ([cfg, home, away]) => {
  const hass = makeHass(home);
  const el = mount(cfg, hass);
  el._snooze(el._items.get('w:binary_sensor.w'), el._alerts[0], 0);
  await tick(300);
  const atHome = ids(el);
  el.hass = { ...hass, states: away };
  const left = ids(el);
  el.hass = { ...hass, states: home };
  return { atHome, left, back: ids(el) };
}, (r) => eq(r, { atHome: [], left: [], back: ['w:binary_sensor.w'] }), [snoozeCard, snoozeStates('home', 'off'), snoozeStates('work', 'off')]);

test('X3 snooze unless rain', async ([cfg, dry, wet]) => {
  const hass = makeHass(dry);
  const el = mount(cfg, hass);
  el._snooze(el._items.get('w:binary_sensor.w'), el._alerts[0], 1);
  await tick(300);
  const stored = JSON.parse(localStorage.getItem('nsc-snoozed:default'))['w:binary_sensor.w'];
  const whileDry = ids(el);
  el.hass = { ...hass, states: wet };
  return { armed: stored.armed, cond: stored.conditions.length, whileDry, rain: ids(el) };
}, (r) => eq(r, { armed: true, cond: 1, whileDry: [], rain: ['w:binary_sensor.w'] }), [snoozeCard, snoozeStates('home', 'off'), snoozeStates('home', 'on')]);

test('X4 with nobody to follow, the arrival option is not offered', async ([cfg]) => {
  const el = mount(cfg, makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on'), 'binary_sensor.rain': st('binary_sensor.rain', 'off') }));
  return el._optionsFor(el._alerts[0]).map((o) => o.label);
}, (r) => eq(r, ['Unless rain', '1 min']), [snoozeCard]);

test('X5 an arrival snooze with a time limit still ends at the limit', async ([s1]) => {
  const el = mount({ snooze_options: [{ label: 'Home or 1 min', until_zone: 'zone.home', minutes: 1 }], alerts: [{ id: 'w', entity: 'binary_sensor.w' }] }, makeHass(s1));
  el._snooze(el._items.get('w:binary_sensor.w'), el._alerts[0], 0);
  await tick(300);
  const hidden = ids(el);
  const rec = el._snoozed['w:binary_sensor.w'];
  const capOk = rec.until - Date.now() <= 60000 && rec.until - Date.now() > 50000;
  rec.until = Date.now() - 1; // the time limit passes (in the stored record too, as it would with real time)
  const stored = JSON.parse(localStorage.getItem('nsc-snoozed:default'));
  stored['w:binary_sensor.w'].until = rec.until;
  localStorage.setItem('nsc-snoozed:default', JSON.stringify(stored));
  el._refresh();
  return { hidden, capOk, after: ids(el) };
}, (r) => eq(r, { hidden: [], capOk: true, after: ['w:binary_sensor.w'] }), [snoozeStates('work', 'off')]);

test('X6 editor: switching a row to "Until someone arrives" adds no duration', async () => {
  const ed = document.createElement('notification-stack-card-editor');
  ed.hass = makeHass({});
  let cfg = { type: 'custom:notification-stack-card', snooze_options: [{ label: '5 minutes', minutes: 5 }] };
  ed.setConfig(cfg);
  document.body.appendChild(ed);
  ed.addEventListener('config-changed', (e) => { cfg = e.detail.config; ed.setConfig(cfg); });
  await tick(50);
  const row = () => [...ed.shadowRoot.querySelectorAll('ha-form')].find((f) => f.data && 'type' in f.data && 'label' in f.data);
  row().emit({ ...row().data, type: 'zone', label: 'Until home' });
  await tick(20);
  const zoneOpt = cfg.snooze_options[0];
  const fields = row().schema.flatMap((x) => (x.schema ? x.schema.map((y) => y.name) : [x.name]));
  return { zoneOpt, fields };
}, (r) => eq(r.zoneOpt, { label: 'Until home', until_zone: 'zone.home' }) && ['until_zone', 'person', 'max_minutes'].every((f) => r.fields.includes(f)));

// ---------- regressions ----------
const three = () => { const s = {}; ['a', 'b', 'c'].forEach((x, i) => (s['binary_sensor.' + x] = st('binary_sensor.' + x, 'on', { friendly_name: x.toUpperCase() }, `2026-11-01T10:0${i}:00Z`))); return s; };

test('R1 stack collapses and expands', async (three) => {
  const el = mount({ title: 'N', alerts: [{ id: 'r', entities: Object.keys(three) }] }, makeHass(three));
  await frames();
  const items = () => [...el.shadowRoot.querySelectorAll('.item')].map((i) => parseFloat(i.style.getPropertyValue('--y')));
  const closed = items();
  el.shadowRoot.querySelector('.htitle').click();
  await frames();
  const opened = items();
  return { closed, openedIncreasing: opened[1] > 40 && opened[2] > opened[1], expanded: el._expanded };
}, (r) => eq(r.closed, [0, 10, 20]) && r.openedIncreasing && r.expanded, three());

test('R2 sub-stacks fold groups with 2+ alerts; a lone group opens flat', async (three) => {
  const g = [{ id: 'g1', name: 'G1' }, { id: 'g2', name: 'G2' }];
  const keys = Object.keys(three);
  const el = mount({ groups: g, alerts: [{ id: 'x', group: 'g1', entities: keys.slice(0, 2) }, { id: 'y', group: 'g2', entity: keys[2] }, { id: 'z', group: 'g2', entity: keys[0] }] }, makeHass(three));
  const blocks = el._blocks.map((b) => b.gid || 'single');
  const el2 = mount({ groups: g, alerts: [{ id: 'x', group: 'g1', entities: keys }] }, makeHass(three));
  return { blocks, lone: el2._blocks.map((b) => b.gid || 'single') };
}, (r) => eq({ blocks: [...r.blocks].sort(), lone: r.lone }, { blocks: ['g1', 'g2'], lone: ['single', 'single', 'single'] }), three());

test('R3 X dismisses and remembers', async () => {
  const el = mount({ alerts: [{ id: 'w', entity: 'binary_sensor.w' }] }, makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on') }));
  el.shadowRoot.querySelector('[data-close]').click();
  await tick(300);
  return { shown: ids(el), stored: JSON.parse(localStorage.getItem('nsc-dismissed:default')) };
}, (r) => eq(r, { shown: [], stored: { 'w:binary_sensor.w': ['binary_sensor.w@2026-11-01T10:00:00Z'] } }));

test('R4 snooze hides, counts, and reserve keeps the closed height', async () => {
  const el = mount({ when_empty: 'reserve', alerts: [{ id: 'w', entity: 'binary_sensor.w', message: 'hello' }] }, makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on') }));
  await frames();
  const h1 = parseFloat(el.shadowRoot.querySelector('.stack').style.height);
  el.shadowRoot.querySelector('[data-snz-open]').click();
  await frames();
  el.shadowRoot.querySelector('[data-snz="0"]').click();
  await tick(300); await frames();
  return { h1, h2: parseFloat(el.shadowRoot.querySelector('.stack').style.height), snoozed: el._snoozedCount, shown: ids(el) };
}, (r) => r.h1 > 30 && r.h2 === r.h1 && r.snoozed === 1 && r.shown.length === 0);

test('R5 a card mounted hidden lays out once shown', async () => {
  const box = document.createElement('div'); box.style.display = 'none'; document.body.appendChild(box);
  const el = document.createElement('notification-stack-card');
  el.setConfig({ alerts: [{ id: 'w', entity: 'binary_sensor.w', message: 'hi' }] });
  box.appendChild(el);
  el.hass = makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on') });
  await frames();
  const hidden = el.shadowRoot.querySelector('.stack').style.height;
  box.style.display = '';
  await frames(); await tick(50); await frames();
  return { hidden, shown: parseFloat(el.shadowRoot.querySelector('.stack').style.height) };
}, (r) => r.hidden === '' && r.shown > 30);

const LONG = 'This message is long enough that it cannot possibly fit on a single line of a narrow phone card, so it must scroll.';
test('R6 horizontal ticker runs and resumes after a redraw', async (LONG) => {
  const states = { 'binary_sensor.w': st('binary_sensor.w', 'on') };
  const hass = makeHass(states);
  const el = mount({ message_overflow: 'scroll', scroll_direction: 'horizontal', alerts: [{ id: 'w', entity: 'binary_sensor.w', title: '{state}', message: LONG }] }, hass);
  await frames(); await tick(2300);
  const mi = el.shadowRoot.querySelector('.mi');
  const t1 = mi._tick?.currentTime;
  el.hass = { ...hass, states: { 'binary_sensor.w': { ...states['binary_sensor.w'], state: 'on', attributes: { x: 1 } } } };
  el._items.get('w:binary_sensor.w')._html = 'force';
  el._refresh(); await frames();
  const t2 = el.shadowRoot.querySelector('.mi')._tick?.currentTime;
  return { marquee: el.shadowRoot.querySelector('.msg').classList.contains('marquee'), copy: !!el.shadowRoot.querySelector('.mi2'), t1, t2 };
}, (r) => r.marquee && r.copy && r.t1 > 2000 && r.t2 >= r.t1, LONG);

test('R7 vertical scroll turns on for long text', async (LONG) => {
  const el = mount({ message_overflow: 'scroll', message_lines: 1, alerts: [{ id: 'w', entity: 'binary_sensor.w', message: LONG }] }, makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on') }));
  await frames();
  return el.shadowRoot.querySelector('.msg').classList.contains('scrolling');
}, (r) => r === true, LONG);

test('R8 colors at card, group and alert level', async () => {
  const s = { 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') };
  const el = mount({ background_color: [10, 20, 30], text_color: '#eee', groups: [{ id: 'g', background_color: 'red' }],
    alerts: [{ id: 'a', entity: 'binary_sensor.a', group: 'g' }, { id: 'b', entity: 'binary_sensor.b', group: 'g', background_color: 'blue', text_color: 'yellow' }] }, makeHass(s));
  const v = (node, p) => node.style.getPropertyValue(p);
  return { card: v(el, '--nsc-card-bg'), text: v(el, '--primary-text-color'), a: v(el._items.get('a:binary_sensor.a'), '--nsc-card-bg'), b: v(el._items.get('b:binary_sensor.b'), '--nsc-card-bg'), bt: v(el._items.get('b:binary_sensor.b'), '--primary-text-color') };
}, (r) => eq(r, { card: 'rgb(10, 20, 30)', text: '#eee', a: 'red', b: 'blue', bt: 'yellow' }));

test('R9 icon-only buttons get a name', async () => {
  const el = mount({ alerts: [{ id: 'w', entity: 'binary_sensor.w', actions: [{ icon: 'mdi:check', tap_action: { action: 'more-info' } }] }] }, makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on') }));
  return el.shadowRoot.querySelector('[data-act]').getAttribute('aria-label');
}, (r) => r === 'Action 1');

test('R10 editor round-trip keeps keys it does not show', async () => {
  const ed = document.createElement('notification-stack-card-editor');
  ed.hass = makeHass({});
  const cfg = { type: 'custom:notification-stack-card', title: 'T', unknown_key: 7, alerts: [{ id: 'a', entity: 'x.y', custom: 1 }] };
  ed.setConfig(cfg);
  document.body.appendChild(ed);
  await tick(50);
  let out;
  ed.addEventListener('config-changed', (e) => (out = e.detail.config));
  const form = ed.shadowRoot.querySelector('ha-form');
  form.emit({ ...form.data, title: 'New' });
  return { forms: ed.shadowRoot.querySelectorAll('ha-form').length, out };
}, (r) => r.forms > 0 && r.out?.title === 'New' && r.out.unknown_key === 7 && r.out.alerts[0].custom === 1);

// ---------- 0.9.2: shared storage, failed actions, hidden rules ----------
test('Y1 another card on the same key keeps this card\'s dismissals', async () => {
  const hass = makeHass({ 'binary_sensor.door': st('binary_sensor.door', 'on'), 'binary_sensor.window': st('binary_sensor.window', 'on') });
  const A = { storage_key: 'same', alerts: [{ id: 'door', entity: 'binary_sensor.door' }] };
  let a = mount(A, hass);
  a._dismiss(a._alerts[0]);
  mount({ storage_key: 'same', alerts: [{ id: 'window', entity: 'binary_sensor.window' }] }, hass);
  const afterB = Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:same')));
  a.remove();
  a = mount(A, hass);
  return { afterB, reloadedA: ids(a) };
}, (r) => eq(r, { afterB: ['door:binary_sensor.door'], reloadedA: [] }));

test('Y2 the card-picker preview (starter config, default key) keeps dismissals', async () => {
  const hass = makeHass({ 'binary_sensor.door': st('binary_sensor.door', 'on') });
  const a = mount({ alerts: [{ id: 'door', entity: 'binary_sensor.door' }] }, hass);
  a._dismiss(a._alerts[0]);
  const p = document.createElement('notification-stack-card');
  p.preview = true;
  p.setConfig(customElements.get('notification-stack-card').getStubConfig());
  document.body.appendChild(p);
  p.hass = hass;
  return Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:default')));
}, (r) => eq(r, ['door:binary_sensor.door']));

test('Y3 unnamed alerts in two cards (both r0) keep each other\'s dismissals', async () => {
  const hass = makeHass({ 'binary_sensor.door': st('binary_sensor.door', 'on'), 'binary_sensor.window': st('binary_sensor.window', 'off') });
  const a = mount({ alerts: [{ entity: 'binary_sensor.door' }] }, hass);
  a._dismiss(a._alerts[0]);
  mount({ alerts: [{ entity: 'binary_sensor.window' }] }, hass);
  return Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:default')));
}, (r) => eq(r, ['r0:binary_sensor.door']));

test('Y4 two cards on one key: both dismissals and snoozes are kept, and each card shows the other\'s', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on'), 'binary_sensor.c': st('binary_sensor.c', 'on'), 'binary_sensor.d': st('binary_sensor.d', 'on') });
  const cfg = { storage_key: 'y4', alerts: ['a', 'b', 'c', 'd'].map((x) => ({ id: x, entity: `binary_sensor.${x}` })) };
  const one = mount(cfg, hass);
  const two = mount(cfg, hass);
  const find = (el, x) => el._alerts.find((al) => al.id === `${x}:binary_sensor.${x}`);
  one._dismiss(find(one, 'a'));
  two._dismiss(find(two, 'b'));
  one._snooze(one._items.get('c:binary_sensor.c'), find(one, 'c'), 0);
  two._snooze(two._items.get('d:binary_sensor.d'), find(two, 'd'), 0);
  await tick(300);
  return {
    dismissed: Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:y4'))).sort(),
    snoozed: Object.keys(JSON.parse(localStorage.getItem('nsc-snoozed:y4'))).sort(),
    one: ids(one), two: ids(two),
  };
}, (r) => eq(r, { dismissed: ['a:binary_sensor.a', 'b:binary_sensor.b'], snoozed: ['c:binary_sensor.c', 'd:binary_sensor.d'], one: [], two: [] }));

test('Y5 a dismissal made in another tab shows here', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on') });
  const el = mount({ storage_key: 'y5', alerts: [{ id: 'a', entity: 'binary_sensor.a' }] }, hass);
  const before = ids(el);
  localStorage.setItem('nsc-dismissed:y5', JSON.stringify({ 'a:binary_sensor.a': ['binary_sensor.a@2026-11-01T10:00:00Z'] }));
  window.dispatchEvent(new StorageEvent('storage', { key: 'nsc-dismissed:y5' }));
  return { before, after: ids(el) };
}, (r) => eq(r, { before: ['a:binary_sensor.a'], after: [] }));

test('Y6 Unsnooze all clears only this card\'s snoozes', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on') });
  localStorage.setItem('nsc-snoozed:y6', JSON.stringify({ 'other:binary_sensor.z': { until: Date.now() + 3600e3, tokens: ['binary_sensor.z@1'] } }));
  const el = mount({ storage_key: 'y6', alerts: [{ id: 'a', entity: 'binary_sensor.a' }] }, hass);
  el._snooze(el._items.get('a:binary_sensor.a'), el._alerts[0], 0);
  await tick(300);
  el._confirming = 'unsnooze';
  el._onUnsnoozeAll();
  return { stored: Object.keys(JSON.parse(localStorage.getItem('nsc-snoozed:y6'))), shown: ids(el) };
}, (r) => eq(r, { stored: ['other:binary_sensor.z'], shown: ['a:binary_sensor.a'] }));

const syncBtn = async (tap) => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on') });
  const el = mount({ alerts: [{ id: 'a', entity: 'binary_sensor.a', actions: [{ name: 'Go', dismiss: true, tap_action: tap }] }] }, hass);
  await el._onActionButton(el._alerts[0], 0);
  return { shown: ids(el), label: el.shadowRoot.querySelector('[data-act]')?.textContent.trim() };
};
test('Y7 a refused javascript: link keeps the alert and shows Failed', syncBtn, (r) => eq(r, { shown: ['a:binary_sensor.a'], label: 'Failed' }), { action: 'url', url_path: 'javascript:alert(1)' });
test('Y8 navigate without a path keeps the alert', syncBtn, (r) => eq(r, { shown: ['a:binary_sensor.a'], label: 'Failed' }), { action: 'navigate' });
test('Y9 an unknown action keeps the alert', syncBtn, (r) => eq(r, { shown: ['a:binary_sensor.a'], label: 'Failed' }), { action: 'fire-dom-event' });
test('Y10 action: none with dismiss still dismisses', syncBtn, (r) => eq(r.shown, []), { action: 'none' });

test('Y11 conditions off/on during quiet hours count as a new incident', async () => {
  const states = { 'binary_sensor.w': st('binary_sensor.w', 'on'), 'input_boolean.arm': st('input_boolean.arm', 'on') };
  const hass = makeHass(states);
  const el = mount({ groups: [{ id: 'g' }], alerts: [{ id: 'w', group: 'g', entity: 'binary_sensor.w', conditions: [{ entity: 'input_boolean.arm', state: 'on' }] }] }, hass);
  el._dismiss(el._alerts[0]);
  const g = el._groups.get('g');
  g.quiet_hours = { start: '00:00', end: '23:59' };
  el.hass = { ...hass, states: { ...states, 'input_boolean.arm': st('input_boolean.arm', 'off') } };
  el.hass = { ...hass, states };
  g.quiet_hours = undefined; el._refresh();
  return ids(el);
}, (r) => eq(r, ['w:binary_sensor.w']));

test('Y12 an entity change while hidden by show_groups brings it back; no change keeps it dismissed', async () => {
  const states = { 'binary_sensor.w': st('binary_sensor.w', 'on') };
  const hass = makeHass(states);
  const cfg = { storage_key: 'y12', groups: [{ id: 'g' }, { id: 'h' }], alerts: [{ id: 'w', group: 'g', entity: 'binary_sensor.w' }] };
  const el = mount(cfg, hass);
  el._dismiss(el._alerts[0]);
  const other = mount({ ...cfg, show_groups: ['h'] }, hass); // same alerts, shows a different group
  const kept = Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:y12')));
  other.hass = { ...hass, states: { 'binary_sensor.w': st('binary_sensor.w', 'on', {}, '2026-11-02T10:00:00Z') } };
  return { kept, afterChange: localStorage.getItem('nsc-dismissed:y12') };
}, (r) => eq(r, { kept: ['w:binary_sensor.w'], afterChange: '{}' }));

test('Y13 reconfiguring mid-request: the new button isn\'t busy and doesn\'t show Failed', async () => {
  let reject;
  const hass = makeHass({ 'lock.l': st('lock.l', 'unlocked') }, { callService: () => new Promise((_, j) => (reject = j)) });
  const btn = (name, svc) => ({ alerts: [{ id: 'l', entity: 'lock.l', state: 'unlocked', actions: [{ name, tap_action: { action: 'perform-action', perform_action: svc } }] }] });
  const el = mount(btn('Lock', 'lock.lock'), hass);
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(5);
  el.setConfig(btn('Notify', 'notify.notify'));
  const busy = el.shadowRoot.querySelector('[data-act]').disabled;
  reject(new Error('x'));
  await tick(10);
  return { busy, label: el.shadowRoot.querySelector('[data-act]').textContent.trim() };
}, (r) => eq(r, { busy: false, label: 'Notify' }));

test('Y14 combined alert with fixed text: a window closing and reopening still behaves', async () => {
  const s = { 'binary_sensor.a': st('binary_sensor.a', 'on', {}, '2026-11-01T12:00:00Z'), 'binary_sensor.b': st('binary_sensor.b', 'on', {}, '2026-11-01T10:00:00Z') };
  const hass = makeHass(s);
  const el = mount({ alerts: [{ id: 'w', entities: ['binary_sensor.a', 'binary_sensor.b'], combine: true, combined_title: 'Windows', combined_message: 'open' }] }, hass);
  const closed = { ...s, 'binary_sensor.b': st('binary_sensor.b', 'off', {}, '2026-11-01T13:00:00Z') };
  el.hass = { ...hass, states: closed };
  el._dismiss(el._alerts[0]);
  const hidden = ids(el).length === 0;
  el.hass = { ...hass, states: { ...closed, 'binary_sensor.b': st('binary_sensor.b', 'on', {}, '2026-11-01T14:00:00Z') } };
  return { hidden, back: ids(el) };
}, (r) => r.hidden && r.back.length === 1 && /^w:combined~/.test(r.back[0]));

// ---------- 0.9.3: combined IDs, current model, late answers, exact times ----------
test('P1a unnamed combined alerts in two cards keep each other\'s dismissals', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') });
  const A = { alerts: [{ entities: ['binary_sensor.a'], combine: true }] };
  let a = mount(A, hass);
  a._dismiss(a._alerts[0]);
  mount({ alerts: [{ entities: ['binary_sensor.b'], combine: true }] }, hass);
  a.remove();
  a = mount(A, hass);
  return { a: ids(a), stored: Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:default') || '{}')).length };
}, (r) => eq(r, { a: [], stored: 1 }));

test('P1b same explicit id, different entity sets: neither card ends the other\'s dismissal', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') });
  const A = { alerts: [{ id: 'common', combine: true, entity: 'binary_sensor.a' }] };
  let a = mount(A, hass);
  a._dismiss(a._alerts[0]);
  const b = mount({ alerts: [{ id: 'common', combine: true, entity: 'binary_sensor.b' }] }, hass);
  const bShows = ids(b).length;
  b._dismiss(b._alerts[0]); // must not overwrite A's record either
  a.remove();
  a = mount(A, hass);
  return { a: ids(a), bShows };
}, (r) => eq(r, { a: [], bShows: 1 }));

test('P1c (control) two cards with the SAME combined rule still share a dismissal', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') });
  const cfg = { alerts: [{ id: 'w', combine: true, entities: ['binary_sensor.a', 'binary_sensor.b'] }] };
  const one = mount(cfg, hass);
  const two = mount(cfg, hass);
  one._dismiss(one._alerts[0]);
  await tick(5);
  return ids(two);
}, (r) => eq(r, []));

test('P2u Unsnooze all keeps another card\'s same-id combined snooze', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') });
  const a = mount({ alerts: [{ id: 'same', combine: true, entity: 'binary_sensor.a' }] }, hass);
  a._snooze(a._items.get(a._alerts[0].id), a._alerts[0], 0);
  await tick(300);
  a.remove();
  const b = mount({ alerts: [{ id: 'same', combine: true, entity: 'binary_sensor.b' }] }, hass);
  b._confirming = 'unsnooze';
  b._onUnsnoozeAll();
  return Object.keys(JSON.parse(localStorage.getItem('nsc-snoozed:default') || '{}')).length;
}, (r) => r === 1);

// ---------- P2: stale alert model ----------
test('P2s an entity joining a combined alert by attribute: dismiss covers it and sticks', async () => {
  const s = { 'sensor.a': st('sensor.a', 'ok', { battery: 10 }, '2026-11-01T12:00:00Z'), 'sensor.b': st('sensor.b', 'ok', { battery: 40 }, '2026-11-01T10:00:00Z') };
  const hass = makeHass(s);
  const el = mount({ alerts: [{ id: 'low', combine: true, entities: ['sensor.a', 'sensor.b'], attribute: 'battery', below: 20, title: 'Low batteries', message: 'Check batteries' }] }, hass);
  el.hass = { ...hass, states: { ...s, 'sensor.b': st('sensor.b', 'ok', { battery: 5 }, '2026-11-01T10:00:00Z') } };
  const tokens = el._alerts[0].tokens.length;
  el._dismiss(el._alerts[0]);
  return { tokens, shownAfterDismiss: ids(el) };
}, (r) => eq(r, { tokens: 2, shownAfterDismiss: [] }));

// ---------- P1/P2: old request after reconfiguration ----------
const lockCfg = (extra) => ({ alerts: [{ id: 'door', entity: 'lock.front', state: 'unlocked', ...extra,
  actions: [{ name: 'Lock', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'lock.lock' } }] }] });
test('R1 (intent) a cosmetic edit mid-request: the tapped Lock still dismisses on success', async (lockCfg) => {
  let resolve;
  const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') }, { callService: () => new Promise((r) => (resolve = r)) });
  const el = mount(lockCfg, hass);
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(5);
  el.setConfig({ ...lockCfg, title: 'Renamed' });
  resolve({});
  await tick(10);
  return ids(el);
}, (r) => eq(r, []), lockCfg({}));
test('R2 edit made the alert non-dismissible mid-request: the old request does not dismiss it', async (cfgs) => {
  let resolve;
  const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') }, { callService: () => new Promise((r) => (resolve = r)) });
  const el = mount(cfgs[0], hass);
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(5);
  el.setConfig(cfgs[1]);
  resolve({});
  await tick(10);
  return ids(el);
}, (r) => eq(r, ['door:lock.front']), [lockCfg({}), lockCfg({ dismissible: false })]);

// ---------- P3: malformed times ----------
test('P3 quiet hours with trailing junk are ignored; HH:MM:SS still works', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on') });
  const mk = (start, end) => mount({ groups: [{ id: 'g', quiet_hours: { start, end } }], alerts: [{ id: 'a', group: 'g', entity: 'binary_sensor.a' }] }, hass);
  return { junk: ids(mk('00:00garbage', '23:59garbage')).length, seconds: ids(mk('00:00:00', '23:59:00')).length };
}, (r) => eq(r, { junk: 1, seconds: 0 }));

// ---------- 0.9.3: late answers after an edit, old combined records ----------
const LOCK = { name: 'Lock', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'lock.lock' } };
const door = (actions, extra = {}) => ({ alerts: [{ id: 'door', entity: 'lock.front', state: 'unlocked', actions, ...extra }] });
const late = async ([before, after, snooze]) => {
  let resolve;
  const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') }, { callService: () => new Promise((r) => (resolve = r)) });
  const el = mount(before, hass);
  el.shadowRoot.querySelector('[data-act]').click();
  await tick(5);
  if (snooze) { el._snooze(el._items.get('door:lock.front'), el._alerts[0], 0); await tick(300); }
  if (after) el.setConfig(after);
  resolve({});
  await tick(10);
  const stored = Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:default') || '{}'));
  if (after && !after.alerts.length) el.setConfig(before); // put the alert back
  return { shown: ids(el), stored };
};
test('F1a button replaced while the request ran: the old answer does not dismiss', late,
  (r) => eq(r, { shown: ['door:lock.front'], stored: [] }),
  [door([LOCK]), door([{ name: 'Notify', dismiss: false, tap_action: { action: 'perform-action', perform_action: 'notify.notify' } }])]);
test('F1b alert removed while the request ran: no ghost dismissal when it comes back', late,
  (r) => eq(r, { shown: ['door:lock.front'], stored: [] }), [door([LOCK]), { alerts: [] }]);
test('F1c (intent) snoozed while the request ran: the requested dismissal still happens', late,
  (r) => eq(r.stored, ['door:lock.front']), [door([LOCK]), null, true]);
test('F1d (intent) cosmetic edit: still dismisses', late,
  (r) => eq(r, { shown: [], stored: ['door:lock.front'] }), [door([LOCK]), door([LOCK], { title: 'Renamed' })]);
test('F1e (intent) made non-dismissible: stays', late,
  (r) => eq(r, { shown: ['door:lock.front'], stored: [] }), [door([LOCK]), door([LOCK], { dismissible: false })]);
test('F1f (intent) hidden by quiet hours meanwhile: still dismisses', late,
  (r) => eq(r.stored, ['door:lock.front']),
  [{ groups: [{ id: 'g' }], ...door([LOCK], { group: 'g' }) }, { groups: [{ id: 'g', quiet_hours: { start: '00:00', end: '23:59' } }], ...door([LOCK], { group: 'g' }) }]);

// ---------- F2: ambiguous v0.9.2 combined records ----------
const OLD = { 'common:combined': ['binary_sensor.a@2026-11-01T10:00:00Z'] }; // written by card A (watches a)
const A = { alerts: [{ id: 'common', combine: true, entities: ['binary_sensor.a'] }] };
const B = (cond) => ({ alerts: [{ id: 'common', combine: true, entities: ['binary_sensor.a', 'binary_sensor.b'], ...(cond ? { conditions: [{ entity: 'input_boolean.x', state: 'on' }] } : {}) }] });
const legacy = async ([old, first, oldKey]) => {
  localStorage.setItem(`nsc-${oldKey}:default`, JSON.stringify(oldKey === 'snoozed' ? { 'common:combined': { until: Date.now() + 3600e3, tokens: old['common:combined'] } } : old));
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'off'), 'input_boolean.x': st('input_boolean.x', 'off') });
  const b = mount(first, hass);
  const bShown = ids(b).length;
  return { bShown, oldKept: !!JSON.parse(localStorage.getItem(`nsc-${oldKey}:default`))['common:combined'] };
};
test('F2a overlapping card B mounted first does not take card A\'s old dismissal', legacy,
  (r) => eq(r, { bShown: 1, oldKept: true }), [OLD, B(false), 'dismissed']);
test('F2b overlapping card B with conditions off does not delete card A\'s old dismissal', legacy,
  (r) => r.oldKept === true, [OLD, B(true), 'dismissed']);
test('F2c same for an old snooze', legacy,
  (r) => eq(r, { bShown: 1, oldKept: true }), [OLD, B(false), 'snoozed']);

// ---------- F3: time format ----------
test('F3 (docs) one-digit hours are accepted', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on') });
  const el = mount({ groups: [{ id: 'g', quiet_hours: { start: '0:00', end: '23:59' } }], alerts: [{ id: 'a', group: 'g', entity: 'binary_sensor.a' }] }, hass);
  return ids(el).length;
}, (r) => r === 0);

test('F2d an old combined dismissal from 0.9.2 is ignored: the alert shows once more, nothing else is touched', async () => {
  localStorage.setItem('nsc-dismissed:default', JSON.stringify({ 'w:combined': ['binary_sensor.a@2026-11-01T10:00:00Z'] }));
  const el = mount({ alerts: [{ id: 'w', combine: true, entities: ['binary_sensor.a'] }] }, makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on') }));
  return { shown: ids(el).length, kept: Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:default'))) };
}, (r) => eq(r, { shown: 1, kept: ['w:combined'] }));

// ---------- 0.9.3: incidents during a request, snooze resets, exact combined IDs, hidden HA notifications, storage ----------
test('Z1a combined alerts whose entity lists used to share a fingerprint keep separate dismissals', async () => {
  const hass = makeHass({
    'binary_sensor.shared': st('binary_sensor.shared', 'on'),
    'binary_sensor.an': st('binary_sensor.an', 'off'),
    'binary_sensor.c0': st('binary_sensor.c0', 'off'),
  });
  const cfg = (entity) => ({ alerts: [{ id: 'same', combine: true, entities: ['binary_sensor.shared', entity] }] });
  const a = mount(cfg('binary_sensor.an'), hass);
  const aId = a._alerts[0].id;
  a._dismiss(a._alerts[0]);
  const b = mount(cfg('binary_sensor.c0'), hass);
  const bId = [...b._model.keys()][0];
  return { distinct: aId !== bId, shown: ids(b).length };
}, (r) => eq(r, { distinct: true, shown: 1 }));

test('Z1b Unsnooze all keeps another card\'s snooze whose entity list used to share a fingerprint', async () => {
  const hass = makeHass({ 'binary_sensor.an': st('binary_sensor.an', 'on'), 'binary_sensor.c0': st('binary_sensor.c0', 'off') });
  const a = mount({ alerts: [{ id: 'same', combine: true, entity: 'binary_sensor.an' }] }, hass);
  a._snooze(a._items.get(a._alerts[0].id), a._alerts[0], 0);
  await tick(300);
  a.remove();
  const b = mount({ alerts: [{ id: 'same', combine: true, entity: 'binary_sensor.c0' }] }, hass);
  b._confirming = 'unsnooze'; b._onUnsnoozeAll();
  return Object.keys(JSON.parse(localStorage.getItem('nsc-snoozed:default'))).length;
}, (r) => r === 1);

test('Z2a conditions off and on end a snooze, as they end a dismissal', async () => {
  const s = { 'binary_sensor.w': st('binary_sensor.w', 'on'), 'input_boolean.arm': st('input_boolean.arm', 'on') };
  const hass = makeHass(s);
  const el = mount({ alerts: [{ id: 'w', entity: 'binary_sensor.w', conditions: [{ entity: 'input_boolean.arm', state: 'on' }] }] }, hass);
  el._snooze(el._items.get('w:binary_sensor.w'), el._alerts[0], 0);
  await tick(300);
  el.hass = { ...hass, states: { ...s, 'input_boolean.arm': st('input_boolean.arm', 'off') } };
  el.hass = { ...hass, states: s };
  return ids(el);
}, (r) => eq(r, ['w:binary_sensor.w']));

test('Z2b group conditions off and on end a snooze, also while hidden by show_groups', async () => {
  const s = { 'binary_sensor.w': st('binary_sensor.w', 'on'), 'input_boolean.arm': st('input_boolean.arm', 'on') };
  const hass = makeHass(s);
  const cfg = { groups: [{ id: 'g', conditions: [{ entity: 'input_boolean.arm', state: 'on' }] }, { id: 'other' }], alerts: [{ id: 'w', entity: 'binary_sensor.w', group: 'g' }] };
  const el = mount(cfg, hass);
  el._snooze(el._items.get('w:binary_sensor.w'), el._alerts[0], 0);
  await tick(300);
  el.setConfig({ ...cfg, show_groups: ['other'] });
  el.hass = { ...hass, states: { ...s, 'input_boolean.arm': st('input_boolean.arm', 'off') } };
  el.hass = { ...hass, states: s };
  el.setConfig(cfg);
  return ids(el);
}, (r) => eq(r, ['w:binary_sensor.w']));

test('Z3 conditions off and on while a button runs: the new incident is not dismissed', async () => {
  let resolve;
  const s = { 'binary_sensor.w': st('binary_sensor.w', 'on'), 'input_boolean.arm': st('input_boolean.arm', 'on') };
  const hass = makeHass(s, { callService: () => new Promise((r) => resolve = r) });
  const el = mount({ alerts: [{ id: 'w', entity: 'binary_sensor.w', conditions: [{ entity: 'input_boolean.arm', state: 'on' }], actions: [{ name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.audit' } }] }] }, hass);
  el.shadowRoot.querySelector('[data-act]').click(); await tick(5);
  el.hass = { ...hass, states: { ...s, 'input_boolean.arm': st('input_boolean.arm', 'off') } };
  el.hass = { ...hass, states: s };
  resolve({}); await tick(10);
  return ids(el);
}, (r) => eq(r, ['w:binary_sensor.w']));

test('Z4 a button finishing late does not dismiss a newer HA notification with the same ID', async () => {
  let resolve;
  let callback;
  const hass = makeHass({}, {
    subscribe: (cb) => { callback = cb; return Promise.resolve(() => {}); },
    callService: (domain) => domain === 'script' ? new Promise((r) => resolve = r) : Promise.resolve({}),
  });
  const el = mount({ persistent_notifications: true, persistent_group: 'g', groups: [{ id: 'g', actions: [{ name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.audit' } }] }] }, hass);
  const send = (time, title) => callback({ type: 'updated', notifications: { reminder: { notification_id: 'reminder', title, message: 'Check this', created_at: time } } });
  send('2026-11-01T10:00:00Z', 'Old incident');
  el.shadowRoot.querySelector('[data-act]').click(); await tick(5);
  send('2026-11-01T11:00:00Z', 'New incident');
  resolve({}); await tick(10);
  return { shown: ids(el), dismissed: hass.calls.filter((c) => c.d === 'persistent_notification').length };
}, (r) => eq(r, { shown: ['pn:reminder'], dismissed: 0 }));

test('Z5 an HA notification hidden by show_groups while its button runs is still dismissed', async () => {
  let resolve;
  let callback;
  const hass = makeHass({}, {
    subscribe: (cb) => { callback = cb; return Promise.resolve(() => {}); },
    callService: (domain) => domain === 'script' ? new Promise((r) => resolve = r) : Promise.resolve({}),
  });
  const cfg = { persistent_notifications: true, persistent_group: 'g', groups: [{ id: 'g', actions: [{ name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.audit' } }] }, { id: 'other' }] };
  const el = mount(cfg, hass);
  callback({ type: 'current', notifications: { reminder: { notification_id: 'reminder', title: 'Reminder', message: 'Check this', created_at: '2026-11-01T10:00:00Z' } } });
  el.shadowRoot.querySelector('[data-act]').click(); await tick(5);
  el.setConfig({ ...cfg, show_groups: ['other'] });
  resolve({}); await tick(10);
  return hass.calls.filter((c) => c.d === 'persistent_notification').length;
}, (r) => r === 1);

test('Z6a storage blocked: dismissing a second alert keeps the first dismissed', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem() { throw new DOMException('Blocked', 'SecurityError'); },
    setItem() { throw new DOMException('Blocked', 'SecurityError'); },
    removeItem() { throw new DOMException('Blocked', 'SecurityError'); },
  } });
  try {
    const el = mount({ alerts: [{ id: 'a', entity: 'binary_sensor.a' }, { id: 'b', entity: 'binary_sensor.b' }] }, makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') }));
    el._dismiss(el._alerts.find((a) => a.id === 'a:binary_sensor.a'));
    el._dismiss(el._alerts.find((a) => a.id === 'b:binary_sensor.b'));
    return ids(el);
  } finally { Object.defineProperty(window, 'localStorage', descriptor); }
}, (r) => eq(r, []));

test('Z1c (control) a combined ID lists its entities, in any order, without duplicates', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') });
  const one = mount({ alerts: [{ id: 'w', combine: true, entities: ['binary_sensor.b', 'binary_sensor.a', 'binary_sensor.a'] }] }, hass);
  const two = mount({ alerts: [{ id: 'w', combine: true, entities: [{ entity: 'binary_sensor.a', name: 'A' }, 'binary_sensor.b'] }] }, hass);
  return [ids(one)[0], ids(two)[0]];
}, (r) => eq(r, ['w:combined~binary_sensor.a,binary_sensor.b', 'w:combined~binary_sensor.a,binary_sensor.b']));

test('Z2c (control) quiet hours on and off keep a snooze', async () => {
  const hass = makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on') });
  const el = mount({ groups: [{ id: 'g' }], alerts: [{ id: 'w', group: 'g', entity: 'binary_sensor.w' }] }, hass);
  el._snooze(el._items.get('w:binary_sensor.w'), el._alerts[0], 0);
  await tick(300);
  const g = el._groups.get('g');
  g.quiet_hours = { start: '00:00', end: '23:59' }; el._refresh();
  g.quiet_hours = undefined; el._refresh();
  return { shown: ids(el), snoozed: el._snoozedCount };
}, (r) => eq(r, { shown: [], snoozed: 1 }));

test('Z3b (control) conditions that stay on: a late answer still dismisses', async () => {
  let resolve;
  const s = { 'binary_sensor.w': st('binary_sensor.w', 'on'), 'input_boolean.arm': st('input_boolean.arm', 'on') };
  const hass = makeHass(s, { callService: () => new Promise((r) => resolve = r) });
  const el = mount({ alerts: [{ id: 'w', entity: 'binary_sensor.w', conditions: [{ entity: 'input_boolean.arm', state: 'on' }], actions: [{ name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.x' } }] }] }, hass);
  el.shadowRoot.querySelector('[data-act]').click(); await tick(5);
  el.hass = { ...hass, states: { ...s, 'binary_sensor.other': st('binary_sensor.other', 'on') } };
  resolve({}); await tick(10);
  return { shown: ids(el), requests: el._requests.size };
}, (r) => eq(r, { shown: [], requests: 0 }));

test('Z4b (control) a button finishing late still dismisses the same HA notification', async () => {
  let resolve, callback;
  const hass = makeHass({}, {
    subscribe: (cb) => { callback = cb; return Promise.resolve(() => {}); },
    callService: (domain) => domain === 'script' ? new Promise((r) => resolve = r) : Promise.resolve({}),
  });
  const el = mount({ persistent_notifications: true, persistent_group: 'g', groups: [{ id: 'g', actions: [{ name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.x' } }] }] }, hass);
  callback({ type: 'current', notifications: { reminder: { notification_id: 'reminder', title: 'R', message: 'm', created_at: '2026-11-01T10:00:00Z' } } });
  el.shadowRoot.querySelector('[data-act]').click(); await tick(5);
  resolve({}); await tick(10);
  return { shown: ids(el), dismissed: hass.calls.filter((c) => c.d === 'persistent_notification').map((c) => c.data.notification_id) };
}, (r) => eq(r, { shown: [], dismissed: ['reminder'] }));

test('Z5b (control) an HA notification hidden by show_groups stays hidden; group conditions still leave it out', async () => {
  let callback;
  const s = { 'input_boolean.on': st('input_boolean.on', 'on') };
  const hass = makeHass(s, { subscribe: (cb) => { callback = cb; return Promise.resolve(() => {}); } });
  const cfg = { persistent_notifications: true, persistent_group: 'g', show_groups: ['other'], groups: [{ id: 'g', conditions: [{ entity: 'input_boolean.on', state: 'on' }] }, { id: 'other' }] };
  const el = mount(cfg, hass);
  callback({ type: 'current', notifications: { n: { notification_id: 'n', title: 'N', created_at: '2026-11-01T10:00:00Z' } } });
  const hidden = { shown: ids(el), model: el._model.has('pn:n') };
  el.hass = { ...hass, states: { 'input_boolean.on': st('input_boolean.on', 'off') } };
  return { hidden, condOff: el._model.has('pn:n') };
}, (r) => eq(r, { hidden: { shown: [], model: true }, condOff: false }));

test('Z6b storage full: earlier dismissals stay until reload; once saving works again it is saved', async () => {
  const proto = Object.getPrototypeOf(localStorage);
  const realSet = proto.setItem;
  proto.setItem = function (k, v) { if (String(k).startsWith('nsc-dismissed')) throw new DOMException('Full', 'QuotaExceededError'); return realSet.call(this, k, v); };
  let full;
  const el = mount({ storage_key: 'z6', alerts: [{ id: 'a', entity: 'binary_sensor.a' }, { id: 'b', entity: 'binary_sensor.b' }, { id: 'c', entity: 'binary_sensor.c' }] },
    makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on'), 'binary_sensor.c': st('binary_sensor.c', 'on') }));
  try {
    el._dismiss(el._alerts.find((a) => a.id === 'a:binary_sensor.a'));
    el._dismiss(el._alerts.find((a) => a.id === 'b:binary_sensor.b'));
    full = ids(el);
  } finally { proto.setItem = realSet; }
  el._dismiss(el._alerts.find((a) => a.id === 'c:binary_sensor.c'));
  return { full, saved: Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:z6'))).sort() };
}, (r) => eq(r, { full: ['c:binary_sensor.c'], saved: ['a:binary_sensor.a', 'b:binary_sensor.b', 'c:binary_sensor.c'] }));

// ---------- 0.9.3: HA notifications and group conditions, cards left invisible ----------
test('Z7a group conditions off and on end an HA notification\'s snooze', async () => {
  let callback;
  const s = { 'input_boolean.arm': st('input_boolean.arm', 'on') };
  const hass = makeHass(s, { subscribe: (cb) => { callback = cb; return Promise.resolve(() => {}); } });
  const el = mount({ persistent_notifications: true, persistent_group: 'g', groups: [{ id: 'g', conditions: [{ entity: 'input_boolean.arm', state: 'on' }] }] }, hass);
  callback({ type: 'current', notifications: { n: { notification_id: 'n', title: 'Reminder', created_at: '2026-11-01T10:00:00Z' } } });
  el._snooze(el._items.get('pn:n'), el._alerts[0], 0); await tick(300);
  el.hass = { ...hass, states: { 'input_boolean.arm': st('input_boolean.arm', 'off') } };
  el.hass = { ...hass, states: s };
  return ids(el);
}, (r) => eq(r, ['pn:n']));

test('Z7b group conditions off and on while a button runs: the HA notification is not dismissed', async () => {
  let callback, resolve;
  const s = { 'input_boolean.arm': st('input_boolean.arm', 'on') };
  const hass = makeHass(s, {
    subscribe: (cb) => { callback = cb; return Promise.resolve(() => {}); },
    callService: (d) => d === 'script' ? new Promise((r) => resolve = r) : Promise.resolve({}),
  });
  const el = mount({ persistent_notifications: true, persistent_group: 'g', groups: [{ id: 'g', conditions: [{ entity: 'input_boolean.arm', state: 'on' }], actions: [{ name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.audit' } }] }] }, hass);
  callback({ type: 'current', notifications: { n: { notification_id: 'n', title: 'Reminder', created_at: '2026-11-01T10:00:00Z' } } });
  el.shadowRoot.querySelector('[data-act]').click(); await tick(5);
  el.hass = { ...hass, states: { 'input_boolean.arm': st('input_boolean.arm', 'off') } };
  el.hass = { ...hass, states: s };
  resolve({}); await tick(10);
  return { shown: ids(el), dismissCalls: hass.calls.filter((c) => c.d === 'persistent_notification').length };
}, (r) => eq(r, { shown: ['pn:n'], dismissCalls: 0 }));

test('Z8a an alert that comes back during the X animation is visible and tappable', async () => {
  const hass = makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on') });
  const el = mount({ alerts: [{ id: 'w', entity: 'binary_sensor.w' }] }, hass);
  el.shadowRoot.querySelector('[data-close]').click(); await tick(20);
  el.hass = { ...hass, states: { 'binary_sensor.w': st('binary_sensor.w', 'on', {}, '2026-11-01T11:00:00Z') } };
  await tick(300);
  const item = el._items.get('w:binary_sensor.w');
  return { shown: ids(el), restored: !!item && item.style.opacity !== '0' && item.style.pointerEvents !== 'none' && ['', '0px'].includes(item.style.getPropertyValue('--x')) };
}, (r) => eq(r, { shown: ['w:binary_sensor.w'], restored: true }));

test('Z8b a snooze that ends during its animation leaves the alert visible and tappable', async () => {
  const s = { 'binary_sensor.w': st('binary_sensor.w', 'on'), 'binary_sensor.rain': st('binary_sensor.rain', 'off') };
  const hass = makeHass(s);
  const el = mount({ alerts: [{ id: 'w', entity: 'binary_sensor.w' }], snooze_options: [{ label: 'Unless rain', until_conditions: [{ entity: 'binary_sensor.rain', state: 'on' }] }] }, hass);
  el._snooze(el._items.get('w:binary_sensor.w'), el._alerts[0], 0); await tick(20);
  el.hass = { ...hass, states: { ...s, 'binary_sensor.rain': st('binary_sensor.rain', 'on') } };
  await tick(300);
  const item = el._items.get('w:binary_sensor.w');
  return { shown: ids(el), snoozed: el._snoozedCount, restored: !!item && item.style.opacity !== '0' && item.style.pointerEvents !== 'none' };
}, (r) => eq(r, { shown: ['w:binary_sensor.w'], snoozed: 0, restored: true }));

test('Z8c (control) an ordinary X still removes the card', async () => {
  const hass = makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on') });
  const el = mount({ alerts: [{ id: 'w', entity: 'binary_sensor.w' }] }, hass);
  el.shadowRoot.querySelector('[data-close]').click(); await tick(300);
  return { shown: ids(el), tracked: el._items.has('w:binary_sensor.w') };
}, (r) => eq(r, { shown: [], tracked: false }));

// ---------- 0.9.4: keep expanded, side by side, Home Assistant templates ----------
const THREE = [{ id: 'a', entity: 'binary_sensor.a' }, { id: 'b', entity: 'binary_sensor.b' }, { id: 'c', entity: 'binary_sensor.c' }];

test('K1 keep_expanded: always opens the list and nothing folds it back', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const el = mount({ keep_expanded: 'always', auto_collapse: 1, alerts: THREE }, makeHass(s));
  await frames();
  const first = el._expanded;
  el._setExpanded(false, true);
  el._minimize();
  el.shadowRoot.querySelector('.htitle').click();
  await tick(1200);
  return { first, after: el._expanded, less: el._lessBtn.hidden, outside: !!el._outsideOn };
}, (r) => eq(r, { first: true, after: true, less: true, outside: false }), THREE);

test('K2 keep_expanded: wide opens on a wide card and stacks again when it gets narrow', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on')));
  const el = mount({ keep_expanded: 'wide', keep_expanded_width: 600, alerts: THREE }, makeHass(s));
  el.style.width = '900px';
  await tick(50); await frames();
  const wide = el._expanded;
  el.style.width = '400px';
  await tick(50); await frames();
  return { wide, narrow: el._expanded };
}, (r) => eq(r, { wide: true, narrow: false }), THREE);

test('K3 (control) without keep_expanded the stack starts folded and folds back', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on')));
  const el = mount({ alerts: THREE }, makeHass(s));
  await frames();
  const first = el._expanded;
  el._setExpanded(true);
  el._minimize();
  return { first, after: el._expanded };
}, (r) => eq(r, { first: false, after: false }), THREE);

test('K4 keep_expanded: true (a YAML boolean) means always; one alert shows as a single card', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'off') });
  const el = mount({ keep_expanded: true, alerts: [{ id: 'a', entity: 'binary_sensor.a' }, { id: 'b', entity: 'binary_sensor.b' }] }, hass);
  await frames();
  const one = el._expanded;
  el.hass = { ...hass, states: { ...hass.states, 'binary_sensor.b': st('binary_sensor.b', 'on') } };
  await frames();
  return { mode: el._config.keep_expanded, one, two: el._expanded };
}, (r) => eq(r, { mode: 'always', one: false, two: true }));

test('H1 side by side: expanded alerts sit in a row of fixed-width columns that scrolls sideways', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const el = mount({ layout: 'horizontal', item_width: 300, keep_expanded: 'always', alerts: THREE }, makeHass(s));
  el.style.width = '700px';
  await tick(50); await frames();
  const items = el._alerts.map((a) => el._items.get(a.id));
  const sc = el.shadowRoot.querySelector('.scroller');
  return {
    px: items.map((e) => e.style.getPropertyValue('--px')),
    y: items.map((e) => e.style.getPropertyValue('--y')),
    w: items.map((e) => e.style.width),
    row: el._stack.style.width,
    scrolls: sc.classList.contains('hscroll') && sc.scrollWidth > sc.clientWidth,
  };
}, (r) => eq(r, { px: ['0px', '308px', '616px'], y: ['0px', '0px', '0px'], w: ['300px', '300px', '300px'], row: '916px', scrolls: true }), THREE);

test('H2 (control) top to bottom, the closed stack still peeks below at full width', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on')));
  const el = mount({ alerts: THREE }, makeHass(s));
  await frames();
  const items = el._alerts.map((a) => el._items.get(a.id));
  return { side: el._stack.classList.contains('side'), w: items.map((e) => e.style.width), y: items.map((e) => e.style.getPropertyValue('--y')) };
}, (r) => eq(r, { side: false, w: ['', '', ''], y: ['0px', '10px', '20px'] }), THREE);

test('H3 side by side: a notification is never wider than the card; folded back it narrows for the sideways peek', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on')));
  const el = mount({ layout: 'horizontal', item_width: 500, alerts: THREE }, makeHass(s));
  el.style.width = '260px';
  await tick(50);
  el._setExpanded(true); await tick(20); await frames();
  const open = el._items.get(el._alerts[0].id).style.width;
  el._setExpanded(false); await tick(20); await frames();
  return { open, closed: el._items.get(el._alerts[0].id).style.width, row: el._stack.style.width };
}, (r) => r.open === `${parseFloat(r.open)}px` && parseFloat(r.open) <= 264 && parseFloat(r.open) >= 240 && parseFloat(r.closed) < parseFloat(r.open) && r.row === '', THREE);

test('H4 side by side: swiping a notification up dismisses it; sideways does not', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const el = mount({ layout: 'horizontal', keep_expanded: 'always', alerts: THREE }, makeHass(s));
  el.style.width = '900px';
  await tick(50); await frames();
  const swipe = (item, dx, dy) => {
    const content = item.querySelector('.ttl');
    const fire = (type, x, y) => content.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, pointerId: 7, button: 0, clientX: x, clientY: y }));
    fire('pointerdown', 100, 100); fire('pointermove', 100 + dx / 2, 100 + dy / 2); fire('pointermove', 100 + dx, 100 + dy); fire('pointerup', 100 + dx, 100 + dy);
  };
  swipe(el._items.get('b:binary_sensor.b'), 150, 0);
  await tick(320);
  const afterSideways = ids(el).length;
  swipe(el._items.get('b:binary_sensor.b'), 0, -90);
  await tick(320);
  return { afterSideways, after: ids(el) };
}, (r) => eq(r, { afterSideways: 3, after: ['a:binary_sensor.a', 'c:binary_sensor.c'] }), THREE);

test('H5 side by side: an open group heading spans its columns', async () => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const el = mount({ layout: 'horizontal', item_width: 200, keep_expanded: 'always', groups: [{ id: 'g', name: 'Doors' }],
    alerts: [{ id: 'a', entity: 'binary_sensor.a' }, { id: 'b', entity: 'binary_sensor.b', group: 'g' }, { id: 'c', entity: 'binary_sensor.c', group: 'g' }] }, makeHass(s));
  el.style.width = '900px';
  await tick(50); await frames();
  const folded = ['b', 'c'].map((k) => el._items.get(`${k}:binary_sensor.${k}`).style.getPropertyValue('--px'));
  el._setGroupOpen('g', true); await tick(20); await frames();
  const head = el._heads.get('g');
  const top = parseFloat(el._items.get('b:binary_sensor.b').style.getPropertyValue('--y'));
  return { folded, px: head.style.getPropertyValue('--px'), w: head.style.width, open: ['b', 'c'].map((k) => el._items.get(`${k}:binary_sensor.${k}`).style.getPropertyValue('--px')), below: top > 20 };
}, (r) => eq(r, { folded: ['208px', '218px'], px: '208px', w: '408px', open: ['208px', '416px'], below: true }));


test('HD1 a long header title ends before the buttons instead of running under them', async () => {
  const s = {};
  ['a', 'b'].forEach((k) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on')));
  const res = [];
  for (const align of ['left', 'right', 'center']) {
    const el = mount({ title: 'List · always expanded · scrolls past 260px and then some more words', header_align: align, keep_expanded: 'always',
      alerts: [{ id: 'a', entity: 'binary_sensor.a' }, { id: 'b', entity: 'binary_sensor.b' }] }, makeHass(s));
    el.style.width = '360px';
    await tick(30); await frames();
    const t = el.shadowRoot.querySelector('.htitle .title').getBoundingClientRect();
    const btns = [...el.shadowRoot.querySelectorAll('.hbtns .hbtn:not([hidden])')].map((b) => b.getBoundingClientRect());
    const card = el.getBoundingClientRect();
    const clash = btns.some((b) => b.left < t.right - 1 && b.right > t.left + 1);
    res.push({ align, clash, inside: t.left >= card.left - 1 && t.right <= card.right + 1 });
    el.remove();
  }
  return res;
}, (r) => r.every((x) => !x.clash && x.inside));


test('S1 side by side, the closed stack peeks out to the right (or left with expand_to: left), narrowed to make room', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const out = {};
  for (const dir of ['right', 'left']) {
    const el = mount({ layout: 'horizontal', expand_to: dir, peek_offset: 10, alerts: THREE }, makeHass(s));
    el.style.width = '500px';
    await tick(30); await frames();
    const items = el._alerts.map((a) => el._items.get(a.id));
    const cardW = el.shadowRoot.querySelector('.scroller').clientWidth;
    out[dir] = {
      px: items.map((e) => e.style.getPropertyValue('--px')),
      y: items.map((e) => e.style.getPropertyValue('--y')),
      narrowed: items.every((e) => parseFloat(e.style.width) === cardW - 20),
      origin: items[0].style.transformOrigin,
      side: el._stack.classList.contains('side'),
    };
    el.remove();
  }
  return out;
}, (r) => eq(r, {
  right: { px: ['0px', '10px', '20px'], y: ['0px', '0px', '0px'], narrowed: true, origin: '100% 50%', side: false },
  left: { px: ['20px', '10px', '0px'], y: ['0px', '0px', '0px'], narrowed: true, origin: '0% 50%', side: false },
}), THREE);

test('S2 expand_to: left starts the row at the right edge, runs leftward, and starts scrolled to the right end', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const el = mount({ layout: 'horizontal', expand_to: 'left', item_width: 300, keep_expanded: 'always', alerts: THREE }, makeHass(s));
  el.style.width = '700px';
  await tick(50); await frames(); await tick(20);
  const sc = el.shadowRoot.querySelector('.scroller');
  return {
    px: el._alerts.map((a) => el._items.get(a.id).style.getPropertyValue('--px')),
    row: el._stack.style.width,
    atEnd: Math.abs(sc.scrollLeft - (sc.scrollWidth - sc.clientWidth)) <= 2,
  };
}, (r) => eq(r, { px: ['616px', '308px', '0px'], row: '916px', atEnd: true }), THREE);

test('S3 expand_to: left with a short row keeps it against the right edge of the card', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on', {}, '2026-11-01T10:02:00Z'), 'binary_sensor.b': st('binary_sensor.b', 'on', {}, '2026-11-01T10:01:00Z') });
  const el = mount({ layout: 'horizontal', expand_to: 'left', item_width: 200, keep_expanded: 'always', alerts: [{ id: 'a', entity: 'binary_sensor.a' }, { id: 'b', entity: 'binary_sensor.b' }] }, hass);
  el.style.width = '700px';
  await tick(50); await frames();
  const cardW = el.shadowRoot.querySelector('.scroller').clientWidth;
  const px = el._alerts.map((a) => parseFloat(el._items.get(a.id).style.getPropertyValue('--px')));
  return { first: px[0] + 200 === cardW, second: px[1] === cardW - 408, row: parseFloat(el._stack.style.width) === cardW };
}, (r) => eq(r, { first: true, second: true, row: true }));

test('E2 editor: "Opens toward" only shows with side by side, and right is not written', async () => {
  const ed = document.createElement('notification-stack-card-editor');
  ed.hass = makeHass({});
  ed.setConfig({ type: 'custom:notification-stack-card' });
  document.body.appendChild(ed);
  await tick(50);
  let out;
  ed.addEventListener('config-changed', (e) => { out = e.detail.config; ed.setConfig(out); });
  const form = () => ed.shadowRoot.querySelector('ha-form');
  const has = () => JSON.stringify(form().schema).includes('"name":"expand_to"');
  const before = has();
  form().emit({ ...form().data, layout: 'horizontal' });
  await tick(5);
  const shown = has();
  form().emit({ ...form().data, expand_to: 'left' });
  await tick(5);
  const left = { ...out };
  form().emit({ ...form().data, expand_to: 'right' });
  await tick(5);
  return { before, shown, left, right: out };
}, (r) => eq(r, { before: false, shown: true, left: { type: 'custom:notification-stack-card', layout: 'horizontal', expand_to: 'left' }, right: { type: 'custom:notification-stack-card', layout: 'horizontal' } }));


test('G9 opening a group: each card is as tall as its content (the group label it hides is not counted)', async () => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const out = {};
  for (const layout of ['vertical', 'horizontal']) {
    const el = mount({ layout, keep_expanded: 'always', groups: [{ id: 'g', name: 'Demo group' }],
      alerts: [{ id: 'a', entity: 'binary_sensor.a' }, { id: 'b', entity: 'binary_sensor.b', group: 'g', message: 'one' }, { id: 'c', entity: 'binary_sensor.c', group: 'g', message: 'two' }] }, makeHass(s));
    el.style.width = '700px';
    await tick(30); await frames();
    el._setGroupOpen('g', true);
    await frames(); await tick(20);
    out[layout] = ['b', 'c'].map((k) => {
      const item = el._items.get(`${k}:binary_sensor.${k}`);
      return Math.round(parseFloat(item.style.height) - item.querySelector('.content').offsetHeight);
    });
    el.remove();
  }
  return out;
}, (r) => eq(r, { vertical: [0, 0], horizontal: [0, 0] }));

// Fake render_template: replies through `answer(template, variables)`; records subscriptions and unsubscribes.
const jinjaHass = (states, answer) => {
  const subs = [];
  const hass = makeHass(states, {
    subscribe: (cb, msg) => {
      if (msg.type !== 'render_template') return Promise.resolve(() => {});
      const sub = { msg, cb, closed: false };
      subs.push(sub);
      setTimeout(() => answer && cb(answer(msg.template, msg.variables)), 5);
      return Promise.resolve(() => { sub.closed = true; });
    },
  });
  return { hass, subs };
};

test('J1 a Jinja title and message are rendered by Home Assistant, with the alert\'s entity passed in', async () => {
  const { hass, subs } = __jinjaHass({ 'lock.front': st('lock.front', 'unlocked', { friendly_name: 'Front door' }) }, (t, v) => ({ result: `${t.includes('title') ? 'T' : 'M'}:${v.entity}:${v.name}:${v.count}` }));
  const el = mount({ alerts: [{ id: 'l', entity: 'lock.front', state: 'unlocked', title: '{{ "title" }}', message: '{% if true %}x{% endif %}' }] }, hass);
  const before = { title: el._alerts[0].title, message: el._alerts[0].message };
  await tick(30);
  return { before, title: el._alerts[0].title, message: el._alerts[0].message, report: subs.every((x) => x.msg.report_errors === true), dom: el.shadowRoot.querySelector('.ttl').textContent };
}, (r) => eq(r, { before: { title: 'Front door', message: '' }, title: 'T:lock.front:Front door:1', message: 'M:lock.front:Front door:1', report: true, dom: 'T:lock.front:Front door:1' }));

test('J2 a new result from Home Assistant updates the text', async () => {
  const { hass, subs } = __jinjaHass({ 'binary_sensor.a': st('binary_sensor.a', 'on') }, () => ({ result: 'first' }));
  const el = mount({ alerts: [{ id: 'a', entity: 'binary_sensor.a', message: '{{ now() }}' }] }, hass);
  await tick(30);
  const first = el._alerts[0].message;
  subs[0].cb({ result: 42 });
  await tick(5);
  return { first, second: el._alerts[0].message, subs: subs.length };
}, (r) => eq(r, { first: 'first', second: '42', subs: 1 }));

test('J3 a template stops updating once its alert goes away, and on disconnect', async () => {
  const { hass, subs } = __jinjaHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') }, () => ({ result: 'x' }));
  const el = mount({ alerts: [{ id: 'a', entity: 'binary_sensor.a', message: '{{ 1 }}' }, { id: 'b', entity: 'binary_sensor.b', message: '{{ 2 }}' }] }, hass);
  await tick(30);
  el.hass = { ...hass, states: { ...hass.states, 'binary_sensor.a': st('binary_sensor.a', 'off') } };
  await tick(5);
  const afterOff = subs.map((x) => x.closed);
  el.remove();
  await tick(5);
  return { afterOff, afterRemove: subs.map((x) => x.closed) };
}, (r) => eq(r, { afterOff: [true, false], afterRemove: [true, true] }));

test('J4 a template Home Assistant can\'t render shows as written; warnings keep the result', async () => {
  const { hass, subs } = __jinjaHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') },
    (t) => (t.includes('bad') ? { error: 'TemplateSyntaxError', level: 'ERROR' } : { result: 'ok' }));
  const el = mount({ alerts: [{ id: 'a', entity: 'binary_sensor.a', message: '{{ bad(' }, { id: 'b', entity: 'binary_sensor.b', message: '{{ good }}' }] }, hass);
  await tick(30);
  subs.find((x) => x.msg.template.includes('good')).cb({ error: 'undefined var', level: 'WARNING' });
  await tick(5);
  const m = (id) => el._alerts.find((a) => a.id === id).message;
  return [m('a:binary_sensor.a'), m('b:binary_sensor.b')];
}, (r) => eq(r, ['{{ bad(', 'ok']));

test('J5 (control) plain text and {placeholders} never ask Home Assistant to render anything', async () => {
  const { hass, subs } = __jinjaHass({ 'lock.front': st('lock.front', 'unlocked', { friendly_name: 'Front door' }) }, () => ({ result: 'x' }));
  const el = mount({ alerts: [{ id: 'l', entity: 'lock.front', state: 'unlocked', title: '{name}', message: 'Is {state} {attr:friendly_name}' }] }, hass);
  await tick(30);
  return { subs: subs.length, title: el._alerts[0].title, message: el._alerts[0].message };
}, (r) => eq(r, { subs: 0, title: 'Front door', message: 'Is unlocked Front door' }));

test('J6 a combined alert passes every matching entity; dismiss memory ignores the rendered text', async () => {
  const { hass, subs } = __jinjaHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') }, (t, v) => ({ result: `${v.count}:${v.entities.join('+')}` }));
  const el = mount({ alerts: [{ id: 'w', entities: ['binary_sensor.a', 'binary_sensor.b'], combine: true, combined_message: '{{ entities | count }}' }] }, hass);
  await tick(30);
  const msg = el._alerts[0].message;
  el._dismiss(el._alerts[0]);
  subs[0].cb({ result: 'changed' });
  await tick(5);
  return { msg, after: ids(el) };
}, (r) => eq(r, { msg: '2:binary_sensor.a+binary_sensor.b', after: [] }));

test('E1 editor: keep expanded and side by side, with their width fields only when they apply', async () => {
  const ed = document.createElement('notification-stack-card-editor');
  ed.hass = makeHass({});
  ed.setConfig({ type: 'custom:notification-stack-card' });
  document.body.appendChild(ed);
  await tick(50);
  let out;
  ed.addEventListener('config-changed', (e) => { out = e.detail.config; ed.setConfig(out); });
  const form = () => ed.shadowRoot.querySelector('ha-form');
  const names = () => JSON.stringify(form().schema).match(/"name":"(keep_expanded_width|item_width)"/g) || [];
  const before = names().length;
  form().emit({ ...form().data, keep_expanded: 'wide', layout: 'horizontal' });
  await tick(5);
  const shown = names().length;
  form().emit({ ...form().data, keep_expanded_width: 900 });
  await tick(5);
  const saved = { ...out };
  form().emit({ ...form().data, keep_expanded: 'never', layout: 'vertical', keep_expanded_width: 800 });
  await tick(5);
  return { before, shown, saved, reset: out };
}, (r) => eq(r, { before: 0, shown: 2, saved: { type: 'custom:notification-stack-card', keep_expanded: 'wide', layout: 'horizontal', keep_expanded_width: 900 }, reset: { type: 'custom:notification-stack-card' } }));

// ---------- 0.9.4 build 3 audit: failing-first checks ----------
// Fake render_template plus a service call that waits until the test answers it.
const jinjaPending = (states) => {
  const subs = [];
  const calls = [];
  const hass = makeHass(states, {
    subscribe: (cb, msg) => {
      if (msg.type !== 'render_template') return Promise.resolve(() => {});
      const sub = { msg, cb, closed: false };
      subs.push(sub);
      setTimeout(() => cb({ result: `R:${msg.template}` }), 5);
      return Promise.resolve(() => { sub.closed = true; });
    },
    callService: () => new Promise((r) => calls.push(r)),
  });
  return { hass, subs, calls, active: () => subs.filter((x) => !x.closed).length };
};

test('AU1a X, then conditions off and on during the slide-out: the new incident still shows', async () => {
  const s = { 'binary_sensor.w': st('binary_sensor.w', 'on'), 'input_boolean.c': st('input_boolean.c', 'on') };
  const hass = makeHass(s);
  const el = mount({ alerts: [{ id: 'w', entity: 'binary_sensor.w', conditions: [{ entity: 'input_boolean.c', state: 'on' }] }] }, hass);
  el.shadowRoot.querySelector('[data-close]').click(); await tick(20);
  el.hass = { ...hass, states: { ...s, 'input_boolean.c': st('input_boolean.c', 'off', {}, '2026-11-01T11:00:00Z') } }; await tick(10);
  el.hass = { ...hass, states: { ...s, 'input_boolean.c': st('input_boolean.c', 'on', {}, '2026-11-01T11:00:01Z') } };
  await tick(300);
  return { shown: ids(el), stored: localStorage.getItem('nsc-dismissed:default') };
}, (r) => eq(r, { shown: ['w:binary_sensor.w'], stored: null }));

test('AU1b side by side, swipe up, then conditions off and on during the slide-out: the new incident still shows', async (THREE) => {
  const s = { 'input_boolean.c': st('input_boolean.c', 'on') };
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const hass = makeHass(s);
  const alerts = THREE.map((a) => (a.id === 'b' ? { ...a, conditions: [{ entity: 'input_boolean.c', state: 'on' }] } : a));
  const el = mount({ layout: 'horizontal', keep_expanded: 'always', alerts }, hass);
  el.style.width = '900px';
  await tick(50); await frames();
  const content = el._items.get('b:binary_sensor.b').querySelector('.ttl');
  const fire = (type, y) => content.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, pointerId: 7, button: 0, clientX: 100, clientY: y }));
  fire('pointerdown', 200); fire('pointermove', 150); fire('pointermove', 80); fire('pointerup', 80);
  await tick(20);
  el.hass = { ...hass, states: { ...s, 'input_boolean.c': st('input_boolean.c', 'off', {}, '2026-11-01T11:00:00Z') } }; await tick(10);
  el.hass = { ...hass, states: { ...s, 'input_boolean.c': st('input_boolean.c', 'on', {}, '2026-11-01T11:00:01Z') } };
  await tick(300);
  return { b: ids(el).includes('b:binary_sensor.b'), stored: Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:default') || '{}')) };
}, (r) => eq(r, { b: true, stored: [] }), THREE);

test('AU1c X on an HA notification, then group conditions off and on during the slide-out: not dismissed in HA', async () => {
  let cb;
  const s = { 'input_boolean.c': st('input_boolean.c', 'on') };
  const hass = makeHass(s, { subscribe: (c) => { cb = c; return Promise.resolve(() => {}); } });
  const el = mount({ persistent_notifications: true, persistent_group: 'sys', groups: [{ id: 'sys', name: 'System', conditions: [{ entity: 'input_boolean.c', state: 'on' }] }] }, hass);
  await tick(5);
  cb({ type: 'current', notifications: { n1: { notification_id: 'n1', title: 'Hi', message: 'x', created_at: '2026-11-01T10:00:00Z' } } });
  el.shadowRoot.querySelector('[data-close]').click(); await tick(20);
  el.hass = { ...hass, states: { 'input_boolean.c': st('input_boolean.c', 'off', {}, '2026-11-01T11:00:00Z') } }; await tick(10);
  el.hass = { ...hass, states: { 'input_boolean.c': st('input_boolean.c', 'on', {}, '2026-11-01T11:00:01Z') } };
  await tick(300);
  return { shown: ids(el), calls: hass.calls.length };
}, (r) => eq(r, { shown: ['pn:n1'], calls: 0 }));

test('AU1d storage_key changed during the slide-out: the X does not write into the new key', async () => {
  const hass = makeHass({ 'binary_sensor.w': st('binary_sensor.w', 'on') });
  const el = mount({ storage_key: 'one', alerts: [{ id: 'w', entity: 'binary_sensor.w' }] }, hass);
  el.shadowRoot.querySelector('[data-close]').click(); await tick(20);
  el.setConfig({ storage_key: 'two', alerts: [{ id: 'w', entity: 'binary_sensor.w' }] });
  await tick(300);
  return { two: localStorage.getItem('nsc-dismissed:two'), shown: ids(el) };
}, (r) => eq(r, { two: null, shown: ['w:binary_sensor.w'] }));

test('AU2a card removed while a button runs: no template subscription restarts, the dismissal still lands', async () => {
  const { hass, calls, active } = __jinjaPending({ 'lock.front': st('lock.front', 'unlocked') });
  const el = mount({ alerts: [{ id: 'l', entity: 'lock.front', state: 'unlocked', message: '{{ 1 }}', actions: [{ name: 'Lock', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'lock.lock' } }] }] }, hass);
  await tick(20);
  el.shadowRoot.querySelector('[data-act]').click(); await tick(10);
  el.remove(); await tick(10);
  const afterRemove = active();
  calls[0]({}); await tick(30);
  return { afterRemove, afterReply: active(), stored: Object.keys(JSON.parse(localStorage.getItem('nsc-dismissed:default') || '{}')) };
}, (r) => eq(r, { afterRemove: 0, afterReply: 0, stored: ['l:lock.front'] }));

test('AU2b card removed while its dashboard template loads: no template subscription starts', async () => {
  const conf = { views: [{ cards: [{ type: 'custom:notification-stack-card', template_name: 'jt', alerts: [{ id: 'a', entity: 'binary_sensor.a', message: '{{ 2 }}' }] }] }] };
  const subs = [];
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on') }, {
    callWS: () => new Promise((r) => setTimeout(() => r(conf), 40)),
    subscribe: (cb, msg) => { if (msg.type !== 'render_template') return Promise.resolve(() => {}); const sub = { closed: false }; subs.push(sub); return Promise.resolve(() => { sub.closed = true; }); },
  });
  const el = mount({ templates: ['dash_jt/jt'] }, hass);
  await tick(5);
  el.remove();
  await tick(100);
  return subs.filter((x) => !x.closed).length;
}, (r) => r === 0);

test('AU2c keep_expanded: wide, card removed: no template subscription restarts from the resize', async () => {
  const s = {};
  ['a', 'b'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const { hass, active } = __jinjaPending(s);
  const el = mount({ keep_expanded: 'wide', keep_expanded_width: 300, alerts: [{ id: 'a', entity: 'binary_sensor.a', message: '{{ 3 }}' }, { id: 'b', entity: 'binary_sensor.b' }] }, hass);
  el.style.width = '400px';
  await tick(30); await frames();
  const before = { kept: el._kept, active: active() };
  el.remove();
  await frames(); await tick(30); await frames();
  return { before, after: active() };
}, (r) => eq(r, { before: { kept: true, active: 1 }, after: 0 }));

test('AU2d card put back with no new hass: templates subscribe again and keep updating', async () => {
  const { hass, subs, active } = __jinjaPending({ 'binary_sensor.a': st('binary_sensor.a', 'on') });
  const el = mount({ alerts: [{ id: 'a', entity: 'binary_sensor.a', message: '{{ 4 }}' }] }, hass);
  await tick(30);
  el.remove(); await tick(5);
  document.body.appendChild(el); await tick(30); await frames();
  const n = active();
  const live = subs.filter((x) => !x.closed).pop();
  if (live) live.cb({ result: 'fresh' });
  await tick(5);
  return { active: n, message: el._alerts[0].message };
}, (r) => eq(r, { active: 1, message: 'fresh' }));

test('AU3 keep_expanded: wide just above the width, list capped with a classic scrollbar (modelled as padding while open): it stays open, no flip-flop', async () => {
  const s = {};
  const alerts = [];
  for (let i = 0; i < 6; i += 1) { s[`binary_sensor.x${i}`] = st(`binary_sensor.x${i}`, 'on', {}, `2026-11-01T10:0${i}:00Z`); alerts.push({ id: `x${i}`, entity: `binary_sensor.x${i}` }); }
  const el = mount({ keep_expanded: 'wide', keep_expanded_width: 800, height: 100, styles: '.scroller.scroll { padding-right: 17px; }', alerts }, makeHass(s));
  el.style.display = 'block'; el.style.width = '805px';
  await tick(30); await frames(); // the first measurement opens it once; after that it must stay put
  let flips = 0;
  let last;
  for (let f = 0; f < 40; f += 1) {
    await new Promise((r) => requestAnimationFrame(r));
    if (last !== undefined && el._expanded !== last) flips += 1;
    last = el._expanded;
  }
  return { flips, expanded: el._expanded };
}, (r) => eq(r, { flips: 0, expanded: true }));

test('AU3b (control) keep_expanded: wide just below the width with the same scrollbar stays stacked', async () => {
  const s = {};
  const alerts = [];
  for (let i = 0; i < 6; i += 1) { s[`binary_sensor.x${i}`] = st(`binary_sensor.x${i}`, 'on', {}, `2026-11-01T10:0${i}:00Z`); alerts.push({ id: `x${i}`, entity: `binary_sensor.x${i}` }); }
  const el = mount({ keep_expanded: 'wide', keep_expanded_width: 800, height: 100, styles: '.scroller.scroll { padding-right: 17px; }', alerts }, makeHass(s));
  el.style.display = 'block'; el.style.width = '795px';
  await tick(30); await frames(); await frames();
  return el._expanded;
}, (r) => r === false);

const leftRowFn = async (el) => {
  await tick(30); await frames(); await tick(20); await frames();
  const sc = el.shadowRoot.querySelector('.scroller');
  const lead = el._items.get(el._alerts[0].id);
  const x = parseFloat(lead.style.getPropertyValue('--px'));
  return { visible: x >= sc.scrollLeft - 1 && x + lead.offsetWidth <= sc.scrollLeft + sc.clientWidth + 1, fromRight: Math.round(sc.scrollWidth - sc.clientWidth - sc.scrollLeft) };
};

test('AU4a expand_to: left, editing the card (new scroller): the first alert is still in view', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const cfg = { layout: 'horizontal', expand_to: 'left', item_width: 300, keep_expanded: 'always', alerts: THREE };
  const el = mount(cfg, makeHass(s));
  el.style.display = 'block'; el.style.width = '400px';
  const before = await __leftRow(el);
  el.setConfig({ ...cfg, title: 'Edited' });
  return { before, after: await __leftRow(el) };
}, (r) => eq(r, { before: { visible: true, fromRight: 0 }, after: { visible: true, fromRight: 0 } }), THREE);

test('AU4b expand_to: left, a third alert arrives while open: the first alert stays in view', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const off = { ...s, 'binary_sensor.c': st('binary_sensor.c', 'off') };
  const hass = makeHass(off);
  const el = mount({ layout: 'horizontal', expand_to: 'left', item_width: 300, keep_expanded: 'always', alerts: THREE }, hass);
  el.style.display = 'block'; el.style.width = '400px';
  const before = await __leftRow(el);
  el.hass = { ...hass, states: s };
  return { before, after: await __leftRow(el) };
}, (r) => eq(r, { before: { visible: true, fromRight: 0 }, after: { visible: true, fromRight: 0 } }), THREE);

test('AU4c expand_to: left, scrolled away on purpose, the row grows: it keeps its place from the right edge', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const off = { ...s, 'binary_sensor.c': st('binary_sensor.c', 'off') };
  const hass = makeHass(off);
  const el = mount({ layout: 'horizontal', expand_to: 'left', item_width: 300, keep_expanded: 'always', alerts: THREE }, hass);
  el.style.display = 'block'; el.style.width = '400px';
  await __leftRow(el);
  const sc = el.shadowRoot.querySelector('.scroller');
  sc.scrollLeft = sc.scrollWidth - sc.clientWidth - 150; await tick(20);
  el.hass = { ...hass, states: s };
  return (await __leftRow(el)).fromRight;
}, (r) => r === 150, THREE);

test('AU5 side by side: a notification that can\'t be dismissed doesn\'t block vertical touch scrolling', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const el = mount({ layout: 'horizontal', keep_expanded: 'always', alerts: THREE.map((a) => (a.id === 'a' ? { ...a, dismissible: false } : a)) }, makeHass(s));
  el.style.display = 'block'; el.style.width = '900px';
  await tick(30); await frames();
  return getComputedStyle(el._items.get('a:binary_sensor.a')).touchAction;
}, (r) => /pan-y|auto|manipulation/.test(r), THREE);

test('AU6a side by side closed stack, big peeks on a narrow card: every card stays inside the card', async () => {
  const s = {};
  const alerts = [];
  for (let i = 0; i < 6; i += 1) { s[`binary_sensor.x${i}`] = st(`binary_sensor.x${i}`, 'on', {}, `2026-11-01T10:0${i}:00Z`); alerts.push({ id: `x${i}`, entity: `binary_sensor.x${i}` }); }
  const out = {};
  for (const dir of ['left', 'right']) {
    const el = mount({ layout: 'horizontal', expand_to: dir, max_peek: 5, peek_offset: 40, alerts }, makeHass(s));
    el.style.display = 'block'; el.style.width = '240px';
    await tick(30); await frames();
    const W = el.shadowRoot.querySelector('.scroller').clientWidth;
    out[dir] = el._alerts.every((a) => {
      const e = el._items.get(a.id);
      const x = parseFloat(e.style.getPropertyValue('--px'));
      return x >= 0 && x + parseFloat(e.style.width) <= W + 0.5;
    });
    el.remove();
  }
  return out;
}, (r) => eq(r, { left: true, right: true }));

test('AU6b side by side at the narrowest column (160px): a folded group stays inside its column', async () => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const out = {};
  for (const dir of ['right', 'left']) {
    const el = mount({ layout: 'horizontal', expand_to: dir, item_width: 120, keep_expanded: 'always', groups: [{ id: 'g', name: 'G' }],
      alerts: [{ id: 'a', entity: 'binary_sensor.a' }, { id: 'b', entity: 'binary_sensor.b', group: 'g' }, { id: 'c', entity: 'binary_sensor.c', group: 'g' }] }, makeHass(s));
    el.style.display = 'block'; el.style.width = '600px';
    await tick(30); await frames();
    const span = (k) => { const e = el._items.get(`${k}:binary_sensor.${k}`); const x = parseFloat(e.style.getPropertyValue('--px')); return [x, x + parseFloat(e.style.width)]; };
    const lone = span('a');
    const [b, c] = [span('b'), span('c')];
    const lo = Math.min(b[0], c[0]);
    const hi = Math.max(b[1], c[1]);
    out[dir] = hi - lo <= 160.5 && (hi <= lone[0] - 8 + 0.5 || lo >= lone[1] + 8 - 0.5);
    el.remove();
  }
  return out;
}, (r) => eq(r, { right: true, left: true }));

test('AU7 a template update keeps a focused action button (same element, still focused)', async () => {
  const subs = [];
  const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') }, {
    subscribe: (cb, msg) => { if (msg.type !== 'render_template') return Promise.resolve(() => {}); subs.push(cb); setTimeout(() => cb({ result: 'one' }), 5); return Promise.resolve(() => {}); },
  });
  const el = mount({ alerts: [{ id: 'l', entity: 'lock.front', state: 'unlocked', title: '{{ x }}', actions: [{ name: 'Lock', tap_action: { action: 'perform-action', perform_action: 'lock.lock' } }] }] }, hass);
  await tick(20);
  const btn = el.shadowRoot.querySelector('[data-act]');
  btn.focus();
  subs[0]({ result: 'two' }); await tick(5);
  const now = el.shadowRoot.querySelector('[data-act]');
  return { same: now === btn, focused: el.shadowRoot.activeElement === btn, title: el.shadowRoot.querySelector('.ttl').textContent };
}, (r) => eq(r, { same: true, focused: true, title: 'two' }));

test('AU7b (pre-existing, also 0.9.3) a {attr} placeholder change replaces a focused action button too', async () => {
  const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked', { who: 'A' }) });
  const el = mount({ alerts: [{ id: 'l', entity: 'lock.front', state: 'unlocked', message: 'by {attr:who}', actions: [{ name: 'Lock', tap_action: { action: 'perform-action', perform_action: 'lock.lock' } }] }] }, hass);
  const btn = el.shadowRoot.querySelector('[data-act]');
  btn.focus();
  el.hass = { ...hass, states: { 'lock.front': st('lock.front', 'unlocked', { who: 'B' }) } };
  return { same: el.shadowRoot.querySelector('[data-act]') === btn, focused: el.shadowRoot.activeElement === btn };
}, (r) => eq(r, { same: true, focused: true }));

test('AU5b side by side with a max height: up and down scrolls (no swipe-dismiss), the X still dismisses', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const el = mount({ layout: 'horizontal', keep_expanded: 'always', height: 120, alerts: THREE }, makeHass(s));
  el.style.display = 'block'; el.style.width = '900px';
  await tick(50); await frames();
  const item = el._items.get('b:binary_sensor.b');
  const touch = getComputedStyle(item).touchAction;
  const content = item.querySelector('.ttl');
  const fire = (type, y) => content.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, pointerId: 7, button: 0, clientX: 100, clientY: y }));
  fire('pointerdown', 200); fire('pointermove', 150); fire('pointermove', 60); fire('pointerup', 60);
  await tick(300);
  const afterSwipe = ids(el).includes('b:binary_sensor.b');
  el._items.get('b:binary_sensor.b').querySelector('[data-close]').click();
  await tick(300);
  return { touch, afterSwipe, afterX: ids(el).includes('b:binary_sensor.b') };
}, (r) => /pan-y/.test(r.touch) && r.afterSwipe === true && r.afterX === false, THREE);

test('AU5c (control) side by side without a max height: a dismissible card keeps the up/down swipe', async (THREE) => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const el = mount({ layout: 'horizontal', keep_expanded: 'always', alerts: THREE }, makeHass(s));
  el.style.display = 'block'; el.style.width = '900px';
  await tick(50); await frames();
  return getComputedStyle(el._items.get('b:binary_sensor.b')).touchAction;
}, (r) => r === 'pan-x', THREE);

test('AU2e (guard) a card put back shows its last rendered text straight away, not the fallback', async () => {
  const { hass } = __jinjaPending({ 'binary_sensor.a': st('binary_sensor.a', 'on') });
  const el = mount({ alerts: [{ id: 'a', entity: 'binary_sensor.a', message: '{{ 5 }}' }] }, hass);
  await tick(30);
  el.remove(); await tick(5);
  document.body.appendChild(el);
  return el._alerts[0].message;
}, (r) => r === 'R:{{ 5 }}');

test('AU7c a text update keeps a scrolling message running (same element, ticker copy updated)', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on', { m: 'A long message that is certainly wider than the card so it has to scroll sideways like a ticker' }) });
  const el = mount({ message_overflow: 'scroll', scroll_direction: 'horizontal', alerts: [{ id: 'a', entity: 'binary_sensor.a', message: '{attr:m}' }] }, hass);
  el.style.display = 'block'; el.style.width = '300px';
  await tick(30); await frames();
  const mi = el.shadowRoot.querySelector('.msg .mi');
  const before = !!mi._tick;
  el.hass = { ...hass, states: { 'binary_sensor.a': st('binary_sensor.a', 'on', { m: 'Another long message that is also much wider than the card so it keeps scrolling along' }) } };
  await tick(20); await frames();
  const now = el.shadowRoot.querySelector('.msg .mi');
  return { before, same: now === mi, running: !!now._tick, copy: el.shadowRoot.querySelector('.msg .mi2')?.textContent === now.textContent, text: now.textContent.slice(0, 7) };
}, (r) => eq(r, { before: true, same: true, running: true, copy: true, text: 'Another' }));

test('AU4d expand_to: left, opening a group in the row keeps the first alert in view', async () => {
  const s = {};
  ['a', 'b', 'c', 'd'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${4 - i}:00Z`)));
  const el = mount({ layout: 'horizontal', expand_to: 'left', item_width: 300, keep_expanded: 'always', groups: [{ id: 'g', name: 'G' }],
    alerts: [{ id: 'a', entity: 'binary_sensor.a' }, { id: 'b', entity: 'binary_sensor.b', group: 'g' }, { id: 'c', entity: 'binary_sensor.c', group: 'g' }, { id: 'd', entity: 'binary_sensor.d', group: 'g' }] }, makeHass(s));
  el.style.display = 'block'; el.style.width = '400px';
  const before = await __leftRow(el);
  el._setGroupOpen('g', true);
  return { before, after: await __leftRow(el) };
}, (r) => eq(r, { before: { visible: true, fromRight: 0 }, after: { visible: true, fromRight: 0 } }));

// ---------- 0.9.4 build 4 audit: failing-first checks ----------
test('AU8 an X from before an entity change does not overwrite a newer dismissal from another card on the same key', async () => {
  const id = 'sensor.signal';
  const config = { storage_key: 'race', alerts: [{ id: 'signal', entity: id, above: 0, actions: [{ name: 'Acknowledge', dismiss: true, tap_action: { action: 'none' } }] }] };
  const states = (n) => ({ [id]: st(id, String(n), {}, '2026-11-01T10:0' + n + ':00Z') });
  const hass = makeHass(states(1));
  const a = mount(config, hass);
  const b = mount(config, hass);
  const tokens = () => JSON.parse(localStorage.getItem('nsc-dismissed:race') || '{}')['signal:sensor.signal'] || [];
  a.shadowRoot.querySelector('[data-close]').click();
  a.hass = b.hass = { ...hass, states: states(2) };
  b.shadowRoot.querySelector('[data-act]').click();
  await tick(330);
  return { a: ids(a), b: ids(b), tokens: tokens() };
}, (r) => eq(r, { a: [], b: [], tokens: ['sensor.signal@2026-11-01T10:02:00Z'] }));

test('AU8b (control) X with nothing changed still dismisses, and a late button on a changed entity leaves the new incident', async () => {
  const id = 'sensor.signal';
  let resolve;
  const states = (n) => ({ [id]: st(id, String(n), {}, '2026-11-01T10:0' + n + ':00Z') });
  const hass = makeHass(states(1), { callService: () => new Promise((r) => (resolve = r)) });
  const el = mount({ alerts: [{ id: 'signal', entity: id, above: 0, actions: [{ name: 'Go', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.x' } }] }] }, hass);
  el.shadowRoot.querySelector('[data-act]').click(); await tick(10);
  el.hass = { ...hass, states: states(2) };
  resolve({}); await tick(10);
  const late = { shown: ids(el), stored: JSON.parse(localStorage.getItem('nsc-dismissed:default') || '{}')['signal:sensor.signal'] ?? null };
  el.shadowRoot.querySelector('[data-close]').click(); await tick(330);
  return { late, x: ids(el) };
}, (r) => eq(r, { late: { shown: ['signal:sensor.signal'], stored: null }, x: [] }));

const heldSwipe = async (layout) => {
  const id = 'binary_sensor.a';
  const gate = 'input_boolean.gate';
  const states = { [id]: st(id, 'on', {}, '2026-11-01T10:02:00Z'), [gate]: st(gate, 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') };
  const hass = makeHass(states);
  const alerts = [{ id: 'a', entity: id, conditions: [{ entity: gate, state: 'on' }] }];
  if (layout === 'horizontal') alerts.push({ id: 'b', entity: 'binary_sensor.b' });
  const el = mount({ layout, keep_expanded: 'always', alerts }, hass);
  el.style.display = 'block'; el.style.width = layout === 'vertical' ? '400px' : '700px'; // 164px clears 35% of 400px
  await tick(60); await frames();
  const item = el._items.get('a:' + id);
  const ttl = item.querySelector('.ttl');
  const [dx, dy] = layout === 'vertical' ? [164, 0] : [0, -90];
  const fire = (type, f) => ttl.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, pointerId: 9, button: 0, clientX: 100 + dx * f, clientY: 200 + dy * f }));
  fire('pointerdown', 0); fire('pointermove', 0.3); fire('pointermove', 1);
  el.hass = { ...hass, states: { ...states, [gate]: st(gate, 'off') } };
  el.hass = hass;
  const replaced = el._items.get('a:' + id) !== item;
  fire('pointerup', 1);
  await tick(330);
  return { replaced, shown: ids(el).includes('a:' + id), stored: localStorage.getItem('nsc-dismissed:default') };
};
test('AU9a a swipe held while conditions turn off and on does not dismiss the alert that came back (vertical)', async () => __heldSwipe('vertical'),
  (r) => eq(r, { replaced: true, shown: true, stored: null }));
test('AU9b same, side by side', async () => __heldSwipe('horizontal'), (r) => eq(r, { replaced: true, shown: true, stored: null }));

const rowRead = (el) => {
  const sc = el.shadowRoot.querySelector('.scroller');
  const view = sc.getBoundingClientRect();
  const lead = el._items.get(el._alerts[0].id).getBoundingClientRect();
  const end = el._stack.offsetWidth + parseFloat(getComputedStyle(sc).paddingLeft) + parseFloat(getComputedStyle(sc).paddingRight);
  return { leadVisible: lead.left >= view.left - 1 && lead.right <= view.right + 1, fromRight: Math.round(end - sc.clientWidth - sc.scrollLeft) };
};
test('AU10a expand_to: left, the card gets narrower (a window resize, a tablet rotating): the first alert stays in view', async () => {
  const s = {};
  ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
  const el = mount({ layout: 'horizontal', expand_to: 'left', item_width: 300, keep_expanded: 'always', alerts: ['a', 'b', 'c'].map((k) => ({ id: k, entity: `binary_sensor.${k}` })) }, makeHass(s));
  el.style.display = 'block'; el.style.width = '890px';
  await tick(60); await frames(); await tick(400);
  const wide = __rowRead(el);
  el.style.width = '350px';
  await tick(60); await frames(); await tick(400);
  return { wide, narrow: __rowRead(el) };
}, (r) => eq(r, { wide: { leadVisible: true, fromRight: 0 }, narrow: { leadVisible: true, fromRight: 0 } }));

test('AU10b expand_to: left, folding a group keeps a deliberate distance from the right end', async () => {
  const s = {};
  const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
  keys.forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${6 - i}:00Z`)));
  const el = mount({ layout: 'horizontal', expand_to: 'left', item_width: 300, keep_expanded: 'always', groups: [{ id: 'g', name: 'G' }],
    alerts: keys.map((k) => ({ id: k, entity: `binary_sensor.${k}`, ...(['b', 'c', 'd'].includes(k) ? { group: 'g' } : {}) })) }, makeHass(s));
  el.style.display = 'block'; el.style.width = '420px';
  await tick(60); await frames(); await tick(400);
  el._setGroupOpen('g', true);
  await tick(60); await frames(); await tick(400);
  const sc = el.shadowRoot.querySelector('.scroller');
  sc.scrollLeft -= 120;
  await tick(60);
  const open = __rowRead(el).fromRight;
  el._setGroupOpen('g', false);
  await tick(60); await frames(); await tick(400);
  return { open, folded: __rowRead(el).fromRight };
}, (r) => eq(r, { open: 120, folded: 120 }));

test('AU11 right-to-left dashboard: a right-opening row starts at its first alert and the wheel scrolls it; text keeps its direction', async () => {
  document.body.dir = 'rtl';
  try {
    const s = {};
    ['a', 'b', 'c'].forEach((k, i) => (s[`binary_sensor.${k}`] = st(`binary_sensor.${k}`, 'on', {}, `2026-11-01T10:0${3 - i}:00Z`)));
    const el = mount({ layout: 'horizontal', item_width: 300, keep_expanded: 'always', alerts: ['a', 'b', 'c'].map((k) => ({ id: k, entity: `binary_sensor.${k}` })) }, makeHass(s));
    el.style.display = 'block'; el.style.width = '420px';
    await tick(60); await frames(); await tick(300);
    const sc = el.shadowRoot.querySelector('.scroller');
    const lead = () => { const v = sc.getBoundingClientRect(); const b = el._items.get('a:binary_sensor.a').getBoundingClientRect(); return b.left >= v.left - 1 && b.right <= v.right + 1; };
    const before = { lead: lead(), scroll: sc.scrollLeft };
    sc.dispatchEvent(new WheelEvent('wheel', { deltaY: 150, bubbles: true, cancelable: true }));
    await tick(30);
    return { before, moved: sc.scrollLeft !== before.scroll, text: getComputedStyle(el._items.get('a:binary_sensor.a').querySelector('.ttl')).direction };
  } finally {
    document.body.dir = '';
  }
}, (r) => eq(r, { before: { lead: true, scroll: 0 }, moved: true, text: 'rtl' }));

const focusAcrossBlank = (source) => {
  const id = 'sensor.signal';
  const states = (note) => ({ [id]: st(id, '1', { note }) });
  const callbacks = [];
  const hass = makeHass(states(''), { subscribe: (cb, m) => { if (m.type === 'render_template') callbacks.push(cb); return Promise.resolve(() => {}); } });
  const el = mount({ alerts: [{ id: 'signal', entity: id, above: 0, message: source === 'jinja' ? '{{ states(entity) }}' : '{attr:note}', actions: [{ name: 'Acknowledge' }] }] }, hass);
  const action = () => el.shadowRoot.querySelector('[data-act]');
  return ['A message', 'Another message', ''].map((next) => {
    const button = action();
    button.focus();
    if (source === 'jinja') callbacks[0]({ result: next });
    else el.hass = { ...hass, states: states(next) };
    const msg = el.shadowRoot.querySelector('.msg');
    return { same: action() === button, focused: el.shadowRoot.activeElement === button, shown: !!msg && !msg.hidden && msg.textContent === next };
  });
};
test('AU12a a message appearing or going blank keeps a focused button ({attr})', async () => __focusAcrossBlank('placeholder'),
  (r) => eq(r, [{ same: true, focused: true, shown: true }, { same: true, focused: true, shown: true }, { same: true, focused: true, shown: false }]));
test('AU12b same with a template', async () => __focusAcrossBlank('jinja'),
  (r) => eq(r, [{ same: true, focused: true, shown: true }, { same: true, focused: true, shown: true }, { same: true, focused: true, shown: false }]));

test('AU12c (control) a blank message takes no space and a tap on a card without a message does nothing', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on') });
  const el = mount({ alerts: [{ id: 'a', entity: 'binary_sensor.a', message: '' }] }, hass);
  await frames();
  const item = el._items.get('a:binary_sensor.a');
  item.querySelector('.ttl').click();
  return { msgH: item.querySelector('.msg').offsetHeight, full: item.classList.contains('full') };
}, (r) => eq(r, { msgH: 0, full: false }));

test('AU13 two quick reattachments keep the last template text until a new one arrives', async () => {
  const id = 'sensor.signal';
  const callbacks = [];
  const hass = makeHass({ [id]: st(id, '1') }, { subscribe: (cb, m) => { if (m.type === 'render_template') callbacks.push(cb); return Promise.resolve(() => {}); } });
  const el = mount({ alerts: [{ id: 'signal', entity: id, above: 0, message: '{{ states(entity) }}' }] }, hass);
  const message = () => el.shadowRoot.querySelector('.mi')?.textContent ?? '';
  callbacks[0]({ result: 'Rendered' });
  el.remove(); document.body.append(el);
  const first = message();
  el.remove(); document.body.append(el);
  const second = message();
  callbacks[callbacks.length - 1]({ result: 'Updated' });
  return { first, second, resolved: message() };
}, (r) => eq(r, { first: 'Rendered', second: 'Rendered', resolved: 'Updated' }));

// ---------- build 5 audit (GPT, Nov 8): failing-first checks AU14–AU17 ----------
test('AU14 a delayed dismissal of a combined alert records only the entities still matching (button and X)', async () => {
  const a = 'sensor.alpha', b = 'sensor.beta', at = '2026-11-01T10:00:00Z';
  const S = (m) => ({ [a]: st(a, 'normal', { attention: 'yes' }, at), [b]: st(b, 'normal', { attention: m ? 'yes' : 'no' }, at) });
  const run = async (key, how) => {
    let fin;
    const hass = makeHass(S(true), { callService: () => new Promise((res) => { fin = res; }) });
    const el = mount({ storage_key: key, alerts: [{ id: 'c', entities: [a, b], combine: true, attribute: 'attention', state: 'yes',
      actions: [{ name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.x' } }] }] }, hass);
    if (how === 'button') el.shadowRoot.querySelector('[data-act="0"]').click();
    else el.shadowRoot.querySelector('[data-close]').click();
    el.hass = { ...hass, states: S(false) }; // beta stops matching (attribute only) while it's pending
    await frames();
    if (how === 'button') fin({});
    await tick(how === 'button' ? 10 : 320);
    const rec = Object.values(JSON.parse(localStorage.getItem('nsc-dismissed:' + key) || '{}'))[0] || [];
    el.hass = { ...hass, states: S(true) }; // beta joins again, same last_changed
    await frames();
    const r = { record: rec.length, shown: ids(el).length };
    el.remove();
    return r;
  };
  return { button: await run('au14b', 'button'), x: await run('au14x', 'x') };
}, (r) => eq(r, { button: { record: 1, shown: 1 }, x: { record: 1, shown: 1 } }));

test('AU14b (control) a combined alert dismissed whole stays dismissed when a member leaves and rejoins', async () => {
  const a = 'sensor.alpha', b = 'sensor.beta', at = '2026-11-01T10:00:00Z';
  const S = (m) => ({ [a]: st(a, 'normal', { attention: 'yes' }, at), [b]: st(b, 'normal', { attention: m ? 'yes' : 'no' }, at) });
  const hass = makeHass(S(true));
  const el = mount({ storage_key: 'au14c', alerts: [{ id: 'c', entities: [a, b], combine: true, attribute: 'attention', state: 'yes' }] }, hass);
  el._dismiss(el._alerts[0]);
  el.hass = { ...hass, states: S(false) };
  el.hass = { ...hass, states: S(true) };
  return ids(el).length;
}, (r) => r === 0);

test('AU15 a reattached card catches up with dismissals and snoozes made while it was away', async () => {
  const a = 'binary_sensor.alpha', b = 'binary_sensor.beta';
  const config = { storage_key: 'au15', alerts: [{ id: 'a', entity: a }, { id: 'b', entity: b }] };
  const hass = makeHass({ [a]: st(a, 'on'), [b]: st(b, 'on') });
  const away = mount(config, hass);
  const here = mount(config, hass);
  away.remove();
  here._dismiss(here._alerts.find((x) => x.id.startsWith('a:')));
  here._snoozed['b:' + b] = { until: Date.now() + 3600e3, tokens: here._alerts[0].tokens };
  localStorage.setItem('nsc-snoozed:au15', JSON.stringify(here._snoozed));
  here._refresh();
  await tick(); // let the other cards hear about it (they're told in a microtask) before this one comes back
  document.body.append(away);
  away.hass = hass;
  await frames();
  return { here: { shown: ids(here).length, snoozed: here._snoozedCount }, away: { shown: ids(away).length, snoozed: away._snoozedCount } };
}, (r) => eq(r, { here: { shown: 0, snoozed: 1 }, away: { shown: 0, snoozed: 1 } }));

test('AU16 a template alert that ends and comes back starts blank, not with text from before a reattach', async () => {
  const id = 'sensor.reading';
  const callbacks = [];
  const states = (on, lc) => ({ [id]: st(id, on ? '5' : '0', {}, lc) });
  const hass = makeHass(states(true, '2026-11-01T10:00:00Z'), { subscribe: (cb, m) => { if (m.type === 'render_template') callbacks.push(cb); return Promise.resolve(() => {}); } });
  const el = mount({ alerts: [{ id: 'r', entity: id, above: 0, message: 'Reading {{ count }}' }] }, hass);
  const message = () => el._alerts[0]?.message ?? null;
  callbacks[0]({ result: 'Reading 1' });
  el.remove(); document.body.append(el);
  callbacks[callbacks.length - 1]({ result: 'Reading 2' });
  const resolved = message();
  el.hass = { ...hass, states: states(false, '2026-11-01T10:01:00Z') };
  el.hass = { ...hass, states: states(true, '2026-11-01T10:02:00Z') };
  const pending = message();
  return { resolved, pending };
}, (r) => eq(r, { resolved: 'Reading 2', pending: '' }));

test('AU17 side by side, item_width below the minimum: columns are 160px and the whole X fits and can be tapped', async () => {
  const hass = makeHass({ 'binary_sensor.a': st('binary_sensor.a', 'on'), 'binary_sensor.b': st('binary_sensor.b', 'on') });
  const el = mount({ layout: 'horizontal', item_width: 120, alerts: [
    { id: 'a', entity: 'binary_sensor.a', title: 'Front door unlocked', message: 'Unlocked' },
    { id: 'b', entity: 'binary_sensor.b', title: 'Back door', message: 'Open' }] }, hass);
  el._setExpanded(true);
  await frames(); await tick(400);
  const it = el.shadowRoot.querySelector('.item');
  const ir = it.getBoundingClientRect(), x = it.querySelector('[data-close]').getBoundingClientRect();
  const hit = el.shadowRoot.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
  return { column: Math.round(ir.width), xInside: Math.round(Math.min(x.right, ir.right) - x.left), hit: !!hit?.closest('[data-close]') };
}, (r) => eq(r, { column: 160, xInside: 28, hit: true }));

// ---------- build 6 audit (GPT, Nov 8): failing-first checks AU18–AU20 ----------
// A card put back on the page still has the states from when it left; the fresh ones arrive just after.
const staleReattach = async (arg) => {
  const a = 'sensor.alpha', b = 'sensor.beta';
  const T0 = '2026-11-01T10:00:00Z', T1 = '2026-11-01T10:02:00Z';
  const states = (v, t) => ({ [a]: st(a, v, {}, t), [b]: st(b, v, {}, t) });
  const key = 'au18-' + arg;
  const config = { storage_key: key, keep_expanded: 'always', alerts: [{ id: 'a', entity: a, above: 0 }, { id: 'b', entity: b, above: 0 }] };
  // changed: both went 1 -> 2 while it was away. unmatched: it last saw them at 0 (no alerts). same: nothing changed.
  const old = makeHass(arg === 'unmatched' ? states('0', T0) : states('1', T0));
  const cur = { ...old, states: arg === 'same' ? states('1', T0) : states('2', T1) };
  const away = mount(config, old);
  const here = mount(config, old);
  away.remove();
  here.hass = cur;
  await frames();
  const item = (id) => here.shadowRoot.querySelector('.item:not(.leaving)[data-id="' + id + '"]');
  item('a:' + a).querySelector('[data-close]').click();
  await tick(300);
  item('b:' + b).querySelector('[data-snz-open]').click();
  item('b:' + b).querySelector('[data-snz="0"]').click();
  await tick(300);
  const rec = () => ({
    d: !!JSON.parse(localStorage.getItem('nsc-dismissed:' + key) || '{}')['a:' + a],
    s: !!JSON.parse(localStorage.getItem('nsc-snoozed:' + key) || '{}')['b:' + b],
  });
  const before = rec();
  document.body.append(away);
  const atAttach = rec();
  away.hass = cur;
  await frames();
  return { before, atAttach, after: rec(), here: [ids(here).length, here._snoozedCount], away: [ids(away).length, away._snoozedCount] };
};
const staleOk = (r) => eq(r, { before: { d: true, s: true }, atAttach: { d: true, s: true }, after: { d: true, s: true }, here: [0, 1], away: [0, 1] });
test('AU18 a card put back with older states keeps the newer dismissal and snooze another card made', staleReattach, staleOk, 'changed');
test('AU18b same, when it last saw those alerts not matching at all', staleReattach, staleOk, 'unmatched');
test('AU18c (control) states unchanged while away: the shared dismissal and snooze stay', staleReattach, staleOk, 'same');

test('AU18d a card fed while off the page acts on it straight away: an alert that came back shows', async () => {
  const id = 'sensor.signal';
  const hass = makeHass({ [id]: st(id, '1', {}, '2026-11-01T10:00:00Z') });
  const el = mount({ storage_key: 'au18d', alerts: [{ id: 'signal', entity: id, above: 0 }] }, hass);
  el.shadowRoot.querySelector('[data-close]').click();
  await tick(300);
  el.remove();
  el.hass = { ...hass, states: { [id]: st(id, '2', {}, '2026-11-01T10:02:00Z') } }; // heard while away
  const away = ids(el).length;
  document.body.append(el); // and nothing new after coming back
  return { away, back: ids(el).length, record: !!JSON.parse(localStorage.getItem('nsc-dismissed:au18d') || '{}')['signal:' + id] };
}, (r) => eq(r, { away: 1, back: 1, record: false }));

const offPageAnswer = async (arg) => {
  const id = 'sensor.signal', aid = 'signal:' + id;
  const T0 = '2026-11-01T10:00:00Z', T1 = '2026-11-01T10:02:00Z';
  let finish;
  const old = makeHass({ [id]: st(id, '1', {}, T0) }, { callService: () => new Promise((r) => { finish = r; }) });
  const key = 'au19-' + arg;
  const config = { storage_key: key, alerts: [{ id: 'signal', entity: id, above: 0, actions: [{ name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.test' } }] }] };
  const away = mount(config, old);
  const here = mount(config, old);
  away.shadowRoot.querySelector('[data-act]').click();
  await tick();
  away.remove();
  if (arg === 'changed') {
    here.hass = { ...old, states: { [id]: st(id, '2', {}, T1) } };
    here.shadowRoot.querySelector('[data-close]').click();
    await tick(300);
  }
  finish({});
  await frames();
  return { here: ids(here).length, record: JSON.parse(localStorage.getItem('nsc-dismissed:' + key) || '{}')[aid] || null };
};
test('AU19 a button answer reaching a card off the page keeps a newer dismissal from another card', offPageAnswer,
  (r) => eq(r, { here: 0, record: ['sensor.signal@2026-11-01T10:02:00Z'] }), 'changed');
test('AU19b (control) unchanged: the answer reaching a card off the page still dismisses', offPageAnswer,
  (r) => eq(r, { here: 0, record: ['sensor.signal@2026-11-01T10:00:00Z'] }), 'same');

const jinjaAway = async (arg) => {
  const id = 'binary_sensor.signal';
  const T0 = '2026-11-01T10:00:00Z', T1 = '2026-11-01T10:02:00Z';
  const callbacks = [];
  const states = (t) => ({ [id]: st(id, 'on', {}, t) });
  const hass = makeHass(states(T0), { subscribe: (cb, m) => { if (m.type === 'render_template') callbacks.push(cb); return Promise.resolve(() => {}); } });
  const el = mount({ alerts: [{ id: 's', entity: id, message: 'At {{ states[entity].last_changed }}' }] }, hass);
  callbacks[0]({ result: 'At 10:00' });
  el.remove();
  document.body.append(el);
  el.hass = { ...hass, states: states(arg === 'changed' ? T1 : T0) };
  const pending = el._alerts[0]?.message ?? null;
  callbacks[callbacks.length - 1]({ result: arg === 'changed' ? 'At 10:02' : 'At 10:00' });
  return { pending, resolved: el._alerts[0]?.message ?? null };
};
test('AU20 a template alert that ended and came back while the card was away starts blank, not with the old text', jinjaAway,
  (r) => eq(r, { pending: '', resolved: 'At 10:02' }), 'changed');
test('AU20b (control) the same incident after a reattach keeps its text until Home Assistant answers', jinjaAway,
  (r) => eq(r, { pending: 'At 10:00', resolved: 'At 10:00' }), 'same');

// ---------- build 7 audit (GPT) and live check (Nov 8): failing-first checks AU21–AU26 ----------
// As observed in Home Assistant 2026.11: a card that hides itself (when_empty: hide) is taken off the page but keeps
// getting hass; a card on a hidden view gets none until it's back; a new card gets hass before it's attached.
const selfHidden = async (arg) => {
  const id = 'lock.front_door';
  const T0 = '2026-11-01T10:00:00Z', T1 = '2026-11-01T11:00:00Z', T2 = '2026-11-01T12:00:00Z';
  const S = (s, t) => ({ [id]: st(id, s, {}, t) });
  const hass = makeHass(S('unlocked', T0));
  const key = 'au21-' + arg;
  const config = { storage_key: key, alerts: [{ id: 'door', entity: id, state: 'unlocked' }] };
  const wrap = document.createElement('div');
  document.body.append(wrap);
  const make = () => { const c = document.createElement('notification-stack-card'); c.setConfig(config); c.hass = hass; return c; };
  let el = make();
  wrap.append(el);
  // Home Assistant's wrapper: a hidden card leaves the page, a shown one comes back.
  const sync = () => { if (el.hidden && el.isConnected) el.remove(); else if (!el.hidden && !el.isConnected) wrap.append(el); };
  const feed = (s, t) => { el.hass = { ...hass, states: S(s, t) }; sync(); };
  await frames();
  el.shadowRoot.querySelector('[data-close]').click();
  await tick(300);
  sync();
  const afterX = [el.hidden, el.isConnected];
  if (arg === 'reload') { el.remove(); el = make(); sync(); } // a reload: hass first, attached only if shown
  if (arg === 'same') feed('unlocked', T0);
  else { feed('locked', T1); feed('unlocked', T2); }
  await frames();
  const record = !!JSON.parse(localStorage.getItem('nsc-dismissed:' + key) || '{}')['door:' + id];
  return { afterX, shown: ids(el).length, hidden: el.hidden, onPage: el.isConnected, record };
};
const comesBack = { afterX: [true, false], shown: 1, hidden: false, onPage: true, record: false };
test('AU21 a card that hid itself brings a dismissed alert back when it comes back as a new incident', selfHidden, (r) => eq(r, comesBack), 'new');
test('AU21b same after a reload (the new card gets hass before it is attached)', selfHidden, (r) => eq(r, comesBack), 'reload');
test('AU21c (control) the same incident keeps the dismissal and the card stays hidden', selfHidden,
  (r) => eq(r, { afterX: [true, false], shown: 0, hidden: true, onPage: false, record: true }), 'same');

// A conditions cycle the card was fed while off the page counts, as it did in 0.9.3.
const offPageCycle = async (arg) => {
  const gate = 'binary_sensor.armed', a = 'binary_sensor.a', b = 'binary_sensor.b';
  const key = 'au22-' + arg;
  const cond = [{ entity: gate, state: 'on' }];
  const config = { storage_key: key, keep_expanded: 'always', alerts: [{ id: 'a', entity: a, conditions: cond }, { id: 'b', entity: b, conditions: cond }] };
  const on = makeHass({ [gate]: st(gate, 'on'), [a]: st(a, 'on'), [b]: st(b, 'on') });
  const el = mount(config, on);
  await frames();
  const item = (id) => el.shadowRoot.querySelector('.item:not(.leaving)[data-id="' + id + '"]');
  item('a:' + a).querySelector('[data-close]').click();
  await tick(300);
  item('b:' + b).querySelector('[data-snz-open]').click();
  item('b:' + b).querySelector('[data-snz="0"]').click();
  await tick(300);
  if (arg === 'away') el.remove();
  el.hass = { ...on, states: { ...on.states, [gate]: st(gate, 'off', {}, '2026-11-01T10:01:00Z') } };
  el.hass = { ...on, states: { ...on.states, [gate]: st(gate, 'on', {}, '2026-11-01T10:02:00Z') } };
  if (arg === 'away') document.body.append(el);
  await frames();
  const n = (kind) => Object.keys(JSON.parse(localStorage.getItem('nsc-' + kind + ':' + key) || '{}')).length;
  return { shown: ids(el).sort(), records: [n('dismissed'), n('snoozed')] };
};
const cycled = { shown: ['a:binary_sensor.a', 'b:binary_sensor.b'], records: [0, 0] };
test('AU22 conditions turning off and on while the card was off the page bring the dismissed and snoozed alerts back', offPageCycle, (r) => eq(r, cycled), 'away');
test('AU22b (control) the same on the page', offPageCycle, (r) => eq(r, cycled), 'here');

test('AU23 a card off the page whose old snooze ran out keeps the longer snooze another card set since', async () => {
  const entity = 'binary_sensor.signal';
  const cfg = { storage_key: 'au23', alerts: [{ id: 'a', entity }], snooze_options: [{ minutes: 0.02 }, { minutes: 5 }] };
  const hass = makeHass({ [entity]: st(entity, 'on') });
  const a = mount(cfg, hass);
  const b = mount(cfg, hass);
  const snooze = (card, i) => {
    const item = card.shadowRoot.querySelector('.item:not(.leaving)');
    item.querySelector('[data-snz-open]').click();
    item.querySelector('[data-snz="' + i + '"]').click();
  };
  const record = () => JSON.parse(localStorage.getItem('nsc-snoozed:au23') || '{}')['a:' + entity];
  snooze(a, 0);
  const first = record().until;
  await tick(300);
  a.remove();
  const chip = b.shadowRoot.querySelector('.snzc:not([hidden])');
  chip.click();
  chip.click();
  snooze(b, 1);
  const longer = record().until;
  await tick(Math.max(0, first - Date.now() + 40));
  a.hass = { ...hass }; // the short one has run out; a is still off the page
  await tick(0);
  return { kept: record()?.until === longer, longer: longer > first, a: ids(a).length, b: ids(b).length };
}, (r) => eq(r, { kept: true, longer: true, a: 0, b: 0 }));

// Two cards, both off the page while their dismissals finish: A's button (tapped at T0) answers first, then B's
// X (tapped at T1) ends its slide-out. B can't tell whose is newer off the page, so it waits for its next hass.
const lateMeetsOther = async (combined) => {
  const alpha = 'sensor.alpha', beta = 'sensor.beta';
  const T0 = '2026-11-01T10:00:00Z', T1 = '2026-11-01T10:02:00Z';
  const action = { name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.example' } };
  const rule = combined
    ? { id: 'signal', entities: [alpha, beta], combine: true, attribute: 'attention', state: 'yes' }
    : { id: 'signal', entity: alpha, above: 0 };
  const key = 'au24-' + (combined ? 'c' : 's');
  const cfg = { storage_key: key, alerts: [{ ...rule, actions: [action] }] };
  const resolve = [];
  const old = makeHass({ [alpha]: st(alpha, '1', { attention: 'yes' }, T0), [beta]: st(beta, '1', { attention: 'yes' }, T0) },
    { callService: () => new Promise((r) => resolve.push(r)) });
  const fresh = { ...old, states: { [alpha]: st(alpha, '2', { attention: 'yes' }, T1), [beta]: st(beta, '1', { attention: 'no' }, T0) } };
  const a = mount(cfg, old);
  const b = mount(cfg, old);
  a.shadowRoot.querySelector('[data-act]').click();
  a.remove();
  b.hass = fresh;
  const id = ids(b)[0];
  b.shadowRoot.querySelector(combined ? '[data-act]' : '[data-close]').click();
  b.remove();
  const rec = () => JSON.parse(localStorage.getItem('nsc-dismissed:' + key) || '{}')[id] ?? null;
  await tick(0);
  resolve[0]({});
  await tick(10);
  const first = rec();
  if (combined) resolve[1]({});
  await tick(290);
  const waiting = rec();
  document.body.append(b);
  b.hass = fresh;
  await tick(0);
  return { first, waiting, settled: rec(), shown: ids(b).length };
};
test('AU24 a late dismissal that meets another stored record off the page waits for fresh states, then counts', lateMeetsOther,
  (r) => eq(r, { first: ['sensor.alpha@2026-11-01T10:00:00Z'], waiting: ['sensor.alpha@2026-11-01T10:00:00Z'], settled: ['sensor.alpha@2026-11-01T10:02:00Z'], shown: 0 }), false);
test('AU24b same with a combined alert\'s button', lateMeetsOther,
  (r) => eq(r, { first: ['sensor.alpha@2026-11-01T10:00:00Z', 'sensor.beta@2026-11-01T10:00:00Z'], waiting: ['sensor.alpha@2026-11-01T10:00:00Z', 'sensor.beta@2026-11-01T10:00:00Z'], settled: ['sensor.alpha@2026-11-01T10:02:00Z'], shown: 0 }), true);

// Template text is remembered with the incident it was rendered for.
const jinjaAdvanced = async (arg) => {
  const entity = 'sensor.signal';
  const requests = [];
  const old = makeHass({ [entity]: st(entity, '1') }, { subscribe: (reply, msg) => { requests.push(reply); return Promise.resolve(() => {}); } });
  const next = { ...old, states: { [entity]: st(entity, '2', {}, '2026-11-01T10:02:00Z') } };
  const el = mount({ alerts: [{ id: 'signal', entity, above: 0, message: '{{ states(entity) }}' }] }, old);
  const msg = () => el.shadowRoot.querySelector('.item:not(.leaving) .mi')?.textContent ?? null;
  requests[0]({ result: 'Reading 1' });
  if (arg === 'changed') el.hass = next; // a new incident, before Home Assistant renders it
  el.remove();
  document.body.append(el);
  el.hass = arg === 'changed' ? next : old;
  const pending = msg();
  requests[requests.length - 1]({ result: arg === 'changed' ? 'Reading 2' : 'Reading 1' });
  return { pending, resolved: msg() };
};
test('AU25 a new incident seen just before leaving the page starts blank, not with the previous incident\'s text', jinjaAdvanced,
  (r) => eq(r, { pending: '', resolved: 'Reading 2' }), 'changed');
test('AU25b (control) the same incident keeps its text', jinjaAdvanced, (r) => eq(r, { pending: 'Reading 1', resolved: 'Reading 1' }), 'same');

test('AU26 two alerts sharing a template: one that comes back starts blank, the other keeps its text', async () => {
  const entity = 'binary_sensor.signal', gate = 'binary_sensor.gate';
  const msg = '{{ states("binary_sensor.gate") }}';
  const cbs = [];
  const on = makeHass({ [entity]: st(entity, 'on'), [gate]: st(gate, 'on') }, { subscribe: (cb) => { cbs.push(cb); return Promise.resolve(() => {}); } });
  const el = mount({ keep_expanded: 'always', alerts: [
    { id: 'gated', entity, conditions: [{ entity: gate, state: 'on' }], message: msg },
    { id: 'steady', entity, message: msg },
  ] }, on);
  const texts = () => Object.fromEntries([...el.shadowRoot.querySelectorAll('.item:not(.leaving)')].map((e) => [e.dataset.id.split(':')[0], e.querySelector('.mi').textContent]).sort());
  cbs[0]({ result: 'on' });
  el.hass = { ...on, states: { ...on.states, [gate]: st(gate, 'off', {}, '2026-11-01T10:01:00Z') } };
  cbs[0]({ result: 'off' });
  el.remove();
  el.hass = { ...on, states: { ...on.states, [gate]: st(gate, 'on', {}, '2026-11-01T10:02:00Z') } };
  document.body.append(el);
  el.hass = { ...el.hass };
  const pending = texts();
  cbs[cbs.length - 1]({ result: 'on' });
  return { pending, resolved: texts() };
}, (r) => eq(r, { pending: { gated: '', steady: 'off' }, resolved: { gated: 'on', steady: 'on' } }));


// ---------- build 9: GPT's audit of build 8 ----------
// L2: a dismissal waiting for fresh states stops hiding its alert once a config change rules it out.
const parkedEdit = async (mode) => {
  const entity = 'sensor.signal', gate = 'input_boolean.gate';
  const T0 = '2026-11-01T10:00:00Z', T1 = '2026-11-01T10:01:00Z';
  const key = 'au29-' + mode;
  const cfg = { storage_key: key, when_empty: 'show', alerts: [{ id: 'a', entity, conditions: [{ entity: gate, state: 'on' }],
    actions: [{ name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.example' } }] }] };
  let finish;
  const hass = makeHass({ [entity]: st(entity, 'on', {}, T0), [gate]: st(gate, 'on') }, { callService: () => new Promise((r) => { finish = r; }) });
  const card = mount(cfg, hass);
  card.shadowRoot.querySelector('[data-act]').click();
  card.remove();
  const writer = mount(cfg, { ...hass, states: { ...hass.states, [entity]: st(entity, 'on', {}, T1) } });
  writer.shadowRoot.querySelector('[data-close]').click();
  await tick(300);
  finish({});
  await tick(0);
  const parked = card._parked.size;
  if (mode === 'key') card.setConfig({ ...cfg, storage_key: key + '-new' });
  else {
    // The other card sees the alert end and come back (conditions off and on), which clears its dismissal.
    const at = (on) => ({ ...hass, states: { ...hass.states, [entity]: st(entity, 'on', {}, T1), [gate]: st(gate, on ? 'on' : 'off') } });
    writer.hass = at(false);
    writer.hass = at(true);
    card.setConfig({ ...cfg, alerts: [{ ...cfg.alerts[0], dismissible: false }] });
  }
  return { parked, after: { shown: ids(card).length, parked: card._parked.size, requests: card._requests.size } };
};
test('AU29 a waiting dismissal stops hiding its alert when the card\'s storage_key changes', parkedEdit,
  (r) => eq(r, { parked: 1, after: { shown: 1, parked: 0, requests: 0 } }), 'key');
test('AU29b same when the alert is edited to be non-dismissible', parkedEdit,
  (r) => eq(r, { parked: 1, after: { shown: 1, parked: 0, requests: 0 } }), 'rule');

// J1: an alert that stopped using a shared template (conditions off) and came back doesn't get its old text.
test('AU30 an alert that comes back while a sibling keeps the template starts blank after a reattach', async () => {
  const entity = 'sensor.signal', gate = 'input_boolean.gate', T0 = '2026-11-01T10:00:00Z';
  const tpl = "{{ states('sensor.caption') }}";
  const cbs = [];
  const states = (on) => ({ [entity]: st(entity, 'on', {}, T0), [gate]: st(gate, on ? 'on' : 'off') });
  const hass = makeHass(states(true), { subscribe: (cb) => { cbs.push(cb); return Promise.resolve(() => {}); } });
  const el = mount({ when_empty: 'show', keep_expanded: 'always', alerts: [
    { id: 'steady', entity, message: tpl },
    { id: 'gated', entity, message: tpl, conditions: [{ entity: gate, state: 'on' }] },
  ] }, hass);
  const texts = () => ['steady', 'gated'].map((id) => el.shadowRoot.querySelector(`.item:not(.leaving)[data-id="${id}:${entity}"] .mi`)?.textContent ?? null);
  cbs[0]({ result: 'Old caption' });
  el.hass = { ...hass, states: states(false) };
  el.hass = { ...hass, states: states(true) }; // back before Home Assistant answers again
  el.remove();
  document.body.append(el);
  el.hass = { ...hass, states: states(true) };
  const pending = texts();
  cbs[cbs.length - 1]({ result: 'New caption' });
  return { pending, resolved: texts() };
}, (r) => eq(r, { pending: ['Old caption', ''], resolved: ['New caption', 'New caption'] }));

// L4: a card that hid itself (its last alert snoozed) shows again when the snooze runs out, without a state change.
test('AU31 a card that hid itself comes back when its snooze runs out, with no state change', async () => {
  const entity = 'binary_sensor.signal';
  const key = 'au31';
  const hass = makeHass({ [entity]: st(entity, 'on') });
  const el = mount({ storage_key: key, snoozed_position: 'hidden', snooze_options: [{ minutes: 0.02 }], alerts: [{ id: 'a', entity }] }, hass);
  let told = 0;
  el.addEventListener('card-visibility-changed', () => told++);
  el.shadowRoot.querySelector('[data-snz-open]').click();
  el.shadowRoot.querySelector('[data-snz]').click();
  await tick(300);
  const hid = el.hidden;
  el.remove(); // Home Assistant takes a card that hid itself off the page and keeps feeding it
  el.hass = { ...hass, states: { ...hass.states } };
  await tick(1900);
  const rec = JSON.parse(localStorage.getItem('nsc-snoozed:' + key) || '{}')['a:' + entity] ?? null;
  return { hid, after: { hidden: el.hidden, shown: ids(el).length, rec, told: told > 0 } };
}, (r) => eq(r, { hid: true, after: { hidden: false, shown: 1, rec: null, told: true } }));

// S6: another browser tab's write is judged only on this tab's next hass (a background tab's states can be old).
const otherTab = async (later) => {
  const alpha = 'sensor.alpha';
  const T0 = '2026-11-01T10:00:00Z', T1 = '2026-11-01T10:01:00Z', T2 = '2026-11-01T10:02:00Z';
  const key = 'au32';
  const hass = makeHass({ [alpha]: st(alpha, 'on', {}, T0) });
  const el = mount({ storage_key: key, when_empty: 'show', alerts: [{ id: 'a', entity: alpha }] }, hass);
  const id = 'a:' + alpha;
  const rec = () => JSON.parse(localStorage.getItem('nsc-dismissed:' + key) || '{}')[id] ?? null;
  localStorage.setItem('nsc-dismissed:' + key, JSON.stringify({ [id]: [alpha + '@' + T1] })); // the other tab saw T1
  window.dispatchEvent(new StorageEvent('storage', { key: 'nsc-dismissed:' + key }));
  const atEvent = { rec: rec(), shown: ids(el).length };
  el.hass = { ...hass, states: { [alpha]: st(alpha, 'on', {}, later ? T2 : T1) } };
  return { atEvent, after: { rec: rec(), shown: ids(el).length } };
};
test('AU32 another tab\'s dismissal survives until this tab has current states', otherTab,
  (r) => eq(r, { atEvent: { rec: ['sensor.alpha@2026-11-01T10:01:00Z'], shown: 0 }, after: { rec: ['sensor.alpha@2026-11-01T10:01:00Z'], shown: 0 } }), false);
test('AU32b (control) a newer incident on the next hass still ends it', otherTab,
  (r) => eq(r.after, { rec: null, shown: 1 }), true);


// ---------- build 10: GPT's audit of build 9 ----------
// B9-1: of two overlapping late dismissals, the later tap's records the alert as it is then (build 8 behaviour).
const olderFuller = async (parked) => {
  const alpha = 'sensor.alpha', beta = 'sensor.beta';
  const key = 'au33-' + parked;
  const state = (both) => ({ [alpha]: st(alpha, 'on', { attention: 'yes' }), [beta]: st(beta, 'on', { attention: both ? 'yes' : 'no' }) });
  const finish = [];
  const hass = makeHass(state(true), { callService: () => new Promise((r) => finish.push(r)) });
  const cfg = { storage_key: key, when_empty: 'show', alerts: [{ id: 'a', entities: [alpha, beta], combine: true, attribute: 'attention', state: 'yes',
    actions: [{ name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.example' } }] }] };
  const rec = (id) => JSON.parse(localStorage.getItem('nsc-dismissed:' + key) || '{}')[id] ?? null;
  const older = mount(cfg, hass);
  const id = ids(older)[0];
  older.shadowRoot.querySelector('[data-act]').click();
  await tick(0);
  older.remove(); // its view is hidden
  const current = { ...hass, states: state(false) }; // beta leaves, same token
  const later = mount(cfg, current);
  later.shadowRoot.querySelector('[data-act]').click();
  await tick(0);
  if (parked) later.remove();
  finish[0]({});
  await tick(0);
  finish[1]({});
  await tick(0);
  if (parked) { document.body.append(later); later.hass = { ...current, states: { ...current.states } }; }
  const settled = rec(id);
  later.hass = { ...hass, states: state(true) }; // beta matches again
  return { settled, afterRejoin: rec(id), shown: ids(later).length };
};
test('AU33 of two overlapping late dismissals, the later tap records the alert as it is then', olderFuller,
  (r) => eq(r, { settled: ['sensor.alpha@2026-11-01T10:00:00Z'], afterRejoin: null, shown: 1 }), false);
test('AU33b same when the later card waited for fresh states', olderFuller,
  (r) => eq(r, { settled: ['sensor.alpha@2026-11-01T10:00:00Z'], afterRejoin: null, shown: 1 }), true);

// B9-3: another card with a different rule for the same alert ID doesn't cancel a pending dismissal.
test('AU34 a different rule with the same alert ID on another card doesn\'t cancel a pending dismissal', async () => {
  const entity = 'sensor.signal', key = 'au34';
  let finish;
  const hass = makeHass({ [entity]: st(entity, 'on') }, { callService: () => new Promise((r) => { finish = r; }) });
  const cfg = { storage_key: key, when_empty: 'show', alerts: [{ id: 'a', entity, state: 'on',
    actions: [{ name: 'Run', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'script.example' } }] }] };
  const a = mount(cfg, hass);
  a.shadowRoot.querySelector('[data-act]').click();
  await tick(0);
  a.remove();
  const other = mount({ ...cfg, alerts: [{ ...cfg.alerts[0], state: 'off' }] }, hass);
  other.remove();
  document.body.append(a);
  a.hass = { ...hass, states: { ...hass.states } };
  finish({});
  await tick(0);
  return { shown: ids(a).length, stored: JSON.parse(localStorage.getItem('nsc-dismissed:' + key) || '{}')['a:' + entity] ?? null };
}, (r) => eq(r, { shown: 0, stored: ['sensor.signal@2026-11-01T10:00:00Z'] }));

// B9-2: a card that hid itself and whose view was then left only judges records on a hass it just received.
test('AU35 a card off the page re-reading memory outside a hass (a config change) keeps another card\'s newer dismissal', async () => {
  const alpha = 'sensor.alpha', gate = 'input_boolean.gate', key = 'au35';
  const states = (on) => ({ [alpha]: st(alpha, 'on'), [gate]: st(gate, on ? 'on' : 'off') });
  const cfg = { storage_key: key, alerts: [{ id: 'a', entity: alpha, conditions: [{ entity: gate, state: 'on' }] }] };
  const hass = makeHass(states(false));
  const old = mount(cfg, hass);
  const hid = old.hidden; // nothing to show: it hid itself
  old.remove();
  old.hass = { ...hass, states: states(false) }; // fed while off the page; then its view is left (no more hass)
  const now = mount(cfg, { ...hass, states: states(true) });
  now.shadowRoot.querySelector('[data-close]').click();
  await tick(300);
  old.setConfig({ ...cfg, title: 'Edited' });
  return { hid, stored: JSON.parse(localStorage.getItem('nsc-dismissed:' + key) || '{}')['a:' + alpha] ?? null };
}, (r) => eq(r, { hid: true, stored: ['sensor.alpha@2026-11-01T10:00:00Z'] }));

// B9-4: a card that hid itself and gets no hass afterwards still comes back when the snooze runs out.
test('AU36 a card that hid itself comes back when its snooze runs out, with no hass after hiding', async () => {
  const entity = 'binary_sensor.signal', key = 'au36';
  const hass = makeHass({ [entity]: st(entity, 'on') });
  const el = mount({ storage_key: key, snoozed_position: 'hidden', snooze_options: [{ minutes: 0.02 }], alerts: [{ id: 'a', entity }] }, hass);
  const events = [];
  el.addEventListener('card-visibility-changed', (e) => events.push(e.detail.value));
  el.shadowRoot.querySelector('[data-snz-open]').click();
  el.shadowRoot.querySelector('[data-snz]').click();
  await tick(300);
  const hid = el.hidden;
  el.remove();
  await tick(1900);
  const rec = JSON.parse(localStorage.getItem('nsc-snoozed:' + key) || '{}')['a:' + entity] ?? null;
  return { hid, after: { hidden: el.hidden, shown: ids(el).length, rec }, events };
}, (r) => eq(r, { hid: true, after: { hidden: false, shown: 1, rec: null }, events: [false, true] }));


// ---------- build 11: GPT's audit of build 10 ----------
// B10-2: a card that came back off a snooze timer while its view was hidden waits for current states before judging.
test('AU37 a card brought back by its snooze timer off the page keeps another card\'s newer records', async () => {
  const d = 'sensor.dismiss', s = 'sensor.snooze', t = 'sensor.timer', key = 'au37';
  const T0 = '2026-11-01T10:00:00Z', T1 = '2026-11-01T10:01:00Z';
  const states = (stamp) => ({ [d]: st(d, 'on', {}, stamp), [s]: st(s, 'on', {}, stamp), [t]: st(t, 'on') });
  const h0 = makeHass(states(T0)), h1 = { ...h0, states: states(T1) };
  const cfg = { storage_key: key, snoozed_position: 'hidden', keep_expanded: 'always', snooze_options: [{ minutes: 10 }], alerts: [
    { id: 'd', entity: d }, { id: 's', entity: s }, { id: 't', entity: t, snooze_options: [{ minutes: 0.02 }] }] };
  const tap = (c, id, sel) => c.shadowRoot.querySelector(`.item:not(.leaving)[data-id="${id}"] ${sel}`).click();
  const snz = (c, id) => { tap(c, id, '[data-snz-open]'); tap(c, id, '[data-snz="0"]'); };
  const rec = (kind, id) => JSON.parse(localStorage.getItem(`nsc-${kind}:${key}`) || '{}')[id] ?? null;
  const a = mount(cfg, h0);
  tap(a, 'd:' + d, '[data-close]');
  await tick(300);
  snz(a, 's:' + s);
  await tick(300);
  snz(a, 't:' + t);
  await tick(300);
  const hid = a.hidden;
  a.remove();
  a.hass = { ...h0, states: { ...h0.states } }; // fed while its view is open, then the view is left
  const b = mount({ ...cfg, when_empty: 'show' }, h1); // the incidents come back on another view
  tap(b, 'd:' + d, '[data-close]');
  await tick(300);
  snz(b, 's:' + s);
  await tick(1300); // a's short snooze runs out while its view is hidden
  b.remove();
  if (!a.hidden) document.body.append(a); // back on the view: attached first, current hass 25 ms later
  await tick(25);
  a.hass = { ...h1, states: { ...h1.states } };
  const r = { hid, d: rec('dismissed', 'd:' + d), s: rec('snoozed', 's:' + s)?.tokens ?? null, shown: ids(a) };
  a.remove();
  return r;
}, (r) => eq(r, { hid: true, d: ['sensor.dismiss@2026-11-01T10:01:00Z'], s: ['sensor.snooze@2026-11-01T10:01:00Z'], shown: ['t:sensor.timer'] }));

// B10-1: a card showing persistent notifications that hid itself keeps listening (Home Assistant takes it off the page).
// Each check stands in for Home Assistant's subscription, which stops delivering once unsubscribed.
test('AU38 a notification card that hid itself shows a new persistent notification', async () => {
  const subs = [];
  const hass = makeHass({}, { subscribe: (cb, msg) => {
    if (msg.type !== 'persistent_notification/subscribe') return Promise.resolve(() => {});
    const sub = { cb, live: true };
    subs.push(sub);
    return Promise.resolve(() => { sub.live = false; });
  } });
  const send = (m) => subs.forEach((x) => x.live && x.cb(m));
  const pn = (id) => ({ [id]: { notification_id: id, title: 'Note ' + id, message: 'x', created_at: '2026-11-01T10:00:00Z' } });
  const el = mount({ when_empty: 'hide', persistent_notifications: true }, hass);
  send({ type: 'current', notifications: {} });
  const hid = el.hidden;
  el.remove();
  el.hass = { ...hass, states: {} };
  await tick(10);
  send({ type: 'added', notifications: pn('n1') });
  return { hid, hidden: el.hidden, shown: ids(el), live: subs.filter((x) => x.live).length };
}, (r) => eq(r, { hid: true, hidden: false, shown: ['pn:n1'], live: 1 }));
test('AU38b a snoozed persistent notification brings its hidden card back when the snooze runs out', async () => {
  const subs = [];
  const hass = makeHass({}, { subscribe: (cb, msg) => {
    if (msg.type !== 'persistent_notification/subscribe') return Promise.resolve(() => {});
    const sub = { cb, live: true };
    subs.push(sub);
    return Promise.resolve(() => { sub.live = false; });
  } });
  const send = (m) => subs.forEach((x) => x.live && x.cb(m));
  const pn = (id) => ({ [id]: { notification_id: id, title: 'Note ' + id, message: 'x', created_at: '2026-11-01T10:00:00Z' } });
  const el = mount({ storage_key: 'au38b', when_empty: 'hide', persistent_notifications: true, snoozed_position: 'hidden', snooze_options: [{ minutes: 0.02 }] }, hass);
  send({ type: 'current', notifications: pn('n1') });
  el.shadowRoot.querySelector('[data-snz-open]').click();
  el.shadowRoot.querySelector('[data-snz="0"]').click();
  await tick(300);
  const hid = el.hidden;
  el.remove();
  el.hass = { ...hass, states: {} };
  await tick(1700);
  return { hid, hidden: el.hidden, shown: ids(el) };
}, (r) => eq(r, { hid: true, hidden: false, shown: ['pn:n1'] }));
test('AU38c (control) a card taken off the page while showing stops listening', async () => {
  const subs = [];
  const hass = makeHass({}, { subscribe: (cb, msg) => {
    if (msg.type !== 'persistent_notification/subscribe') return Promise.resolve(() => {});
    const sub = { cb, live: true };
    subs.push(sub);
    return Promise.resolve(() => { sub.live = false; });
  } });
  const send = (m) => subs.forEach((x) => x.live && x.cb(m));
  const pn = (id) => ({ [id]: { notification_id: id, title: 'Note ' + id, message: 'x', created_at: '2026-11-01T10:00:00Z' } });
  const el = mount({ when_empty: 'hide', persistent_notifications: true }, hass);
  send({ type: 'current', notifications: pn('n1') });
  el.remove(); // its view is hidden
  await tick(10);
  return { hidden: el.hidden, live: subs.filter((x) => x.live).length };
}, (r) => eq(r, { hidden: false, live: 0 }));

// ---------- build 12: GPT's audit of build 11 ----------
// B11-1: re-creating a persistent notification with the same ID sends an "updated" message with a new created_at and
// changes no entity state, so no hass follows. A card that hid itself must judge that notification's snooze on receipt.
test('AU39 a snoozed notification re-created with the same ID brings its hidden card back on receipt', async () => {
  const subs = [];
  const hass = makeHass({}, { subscribe: (cb, msg) => {
    if (msg.type !== 'persistent_notification/subscribe') return Promise.resolve(() => {});
    const sub = { cb, live: true };
    subs.push(sub);
    return Promise.resolve(() => { sub.live = false; });
  } });
  const send = (m) => subs.forEach((x) => x.live && x.cb(m));
  const pn = (title, at) => ({ n1: { notification_id: 'n1', title, message: 'x', created_at: at } });
  const el = mount({ storage_key: 'au39', when_empty: 'hide', persistent_notifications: true, snoozed_position: 'hidden',
    snooze_options: [{ minutes: 10 }] }, hass);
  send({ type: 'current', notifications: pn('Original', '2026-11-01T10:00:00Z') });
  el.shadowRoot.querySelector('[data-snz-open]').click();
  el.shadowRoot.querySelector('[data-snz="0"]').click();
  await tick(300);
  const hid = el.hidden;
  el.remove();
  el.hass = { ...hass, states: {} }; // fed while its view is open
  await tick(10);
  send({ type: 'updated', notifications: pn('Replacement', '2026-11-01T10:05:00Z') }); // no hass follows
  const stored = !!JSON.parse(localStorage.getItem('nsc-snoozed:au39') || '{}')['pn:n1'];
  return { hid, hidden: el.hidden, titles: el._alerts.map((a) => a.title), stored };
}, (r) => eq(r, { hid: true, hidden: false, titles: ['Replacement'], stored: false }));
test('AU39b (control) the same notification delivered again stays snoozed on a card that hid itself', async () => {
  const subs = [];
  const hass = makeHass({}, { subscribe: (cb, msg) => {
    if (msg.type !== 'persistent_notification/subscribe') return Promise.resolve(() => {});
    const sub = { cb, live: true };
    subs.push(sub);
    return Promise.resolve(() => { sub.live = false; });
  } });
  const send = (m) => subs.forEach((x) => x.live && x.cb(m));
  const pn = (title, at) => ({ n1: { notification_id: 'n1', title, message: 'x', created_at: at } });
  const el = mount({ storage_key: 'au39b', when_empty: 'hide', persistent_notifications: true, snoozed_position: 'hidden',
    snooze_options: [{ minutes: 10 }] }, hass);
  send({ type: 'current', notifications: pn('Original', '2026-11-01T10:00:00Z') });
  el.shadowRoot.querySelector('[data-snz-open]').click();
  el.shadowRoot.querySelector('[data-snz="0"]').click();
  await tick(300);
  el.remove();
  el.hass = { ...hass, states: {} };
  await tick(10);
  send({ type: 'current', notifications: pn('Original', '2026-11-01T10:00:00Z') }); // same created_at
  const stored = !!JSON.parse(localStorage.getItem('nsc-snoozed:au39b') || '{}')['pn:n1'];
  return { hidden: el.hidden, shown: ids(el), stored };
}, (r) => eq(r, { hidden: true, shown: [], stored: true }));
test('AU39c (control) a notification message off the page leaves another card\'s newer entity dismissal alone', async () => {
  const d = 'sensor.d', key = 'au39c';
  const T0 = '2026-11-01T10:00:00Z', T1 = '2026-11-01T10:01:00Z';
  const subs = [];
  const h0 = makeHass({ [d]: st(d, 'on', {}, T0) }, { subscribe: (cb, msg) => {
    if (msg.type !== 'persistent_notification/subscribe') return Promise.resolve(() => {});
    const sub = { cb, live: true };
    subs.push(sub);
    return Promise.resolve(() => { sub.live = false; });
  } });
  const h1 = { ...h0, states: { [d]: st(d, 'on', {}, T1) } };
  const send = (m) => subs.forEach((x) => x.live && x.cb(m));
  const pn = (title, at) => ({ n1: { notification_id: 'n1', title, message: 'x', created_at: at } });
  const tap = (c, id, sel) => c.shadowRoot.querySelector(`.item:not(.leaving)[data-id="${id}"] ${sel}`).click();
  const cfg = { storage_key: key, when_empty: 'hide', keep_expanded: 'always', snoozed_position: 'hidden',
    snooze_options: [{ minutes: 10 }], alerts: [{ id: 'd', entity: d }] };
  const a = mount({ ...cfg, persistent_notifications: true }, h0);
  send({ type: 'current', notifications: pn('Original', T0) });
  await frames();
  tap(a, 'd:' + d, '[data-close]');
  await tick(300);
  tap(a, 'pn:n1', '[data-snz-open]');
  tap(a, 'pn:n1', '[data-snz="0"]');
  await tick(300);
  const hid = a.hidden;
  a.remove();
  a.hass = { ...h0, states: { ...h0.states } }; // fed, then its view is left: no more hass
  const b = mount({ ...cfg, when_empty: 'show' }, h1); // the incident comes back on another view
  tap(b, 'd:' + d, '[data-close]');
  await tick(300);
  send({ type: 'updated', notifications: pn('Replacement', '2026-11-01T10:05:00Z') }); // a's old states see T0
  const rec = JSON.parse(localStorage.getItem(`nsc-dismissed:${key}`) || '{}')['d:' + d] ?? null;
  return { hid, d: rec };
}, (r) => eq(r, { hid: true, d: ['sensor.d@2026-11-01T10:01:00Z'] }));

(async () => {
  const { browser, page, errors } = await open(SRC);
  let pass = 0;
  const fails = [];
  for (const t of T) {
    await page.evaluate(() => { localStorage.clear(); document.body.innerHTML = ''; window.unhandled = []; window.toasts = []; history.replaceState(null, '', '/lovelace/0'); });
    let r;
    try {
      const src = t.fn.toString().replace(/__pnHass/g, `(${pnHass.toString()})`).replace(/__jinjaHass/g, `(${jinjaHass.toString()})`).replace(/__jinjaPending/g, `(${jinjaPending.toString()})`).replace(/__leftRow/g, `(${leftRowFn.toString()})`).replace(/__heldSwipe/g, `(${heldSwipe.toString()})`).replace(/__rowRead/g, `(${rowRead.toString()})`).replace(/__focusAcrossBlank/g, `(${focusAcrossBlank.toString()})`);
      r = await page.evaluate(`(${src})(${JSON.stringify(t.arg ?? null)})`);
    } catch (e) { r = 'ERR ' + e.message.split('\n')[0]; }
    let ok = false;
    try { ok = !!t.check(r); } catch (_) {}
    if (ok) pass++; else fails.push({ name: t.name, got: r });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${t.name}${ok ? '' : '  -> ' + JSON.stringify(r)}`);
  }
  console.log(`\n${pass}/${T.length} passed; page errors: ${JSON.stringify(errors)}`);
  if (SHOT) {
    await page.evaluate(async () => {
      localStorage.clear(); document.body.innerHTML = ''; document.body.style.background = '#1c2230'; document.body.style.padding = '16px';
      let resolve;
      const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked', { friendly_name: 'Front door' }), 'vacuum.r': st('vacuum.r', 'error', { friendly_name: 'Roborock' }), 'binary_sensor.w': st('binary_sensor.w', 'on', { friendly_name: 'Kitchen window' }) },
        { callService: (d) => (d === 'vacuum' ? Promise.reject(new Error('x')) : new Promise((r) => (resolve = r))) });
      const el = mount({ title: 'Notifications', alerts: [
        { id: 'lock', entity: 'lock.front', state: 'unlocked', severity: 'critical', title: 'Front door', message: 'Unlocked', actions: [{ name: 'Lock', icon: 'mdi:lock', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'lock.lock' } }] },
        { id: 'vac', entity: 'vacuum.r', state: 'error', severity: 'warning', title: 'Roborock needs help', message: 'Stuck', actions: [{ name: 'Dock', icon: 'mdi:home-import-outline', dismiss: true, tap_action: { action: 'perform-action', perform_action: 'vacuum.return_to_base' } }, { icon: 'mdi:check', dismiss: true }] },
        { id: 'w', entity: 'binary_sensor.w', title: 'Kitchen window open', message: 'Open since this morning' },
      ] }, hass);
      el._setExpanded(true);
      await frames();
      el.shadowRoot.querySelectorAll('[data-act]')[0].click();
      el.shadowRoot.querySelectorAll('[data-act]')[1].click();
      await tick(50); await frames(); await tick(400);
    });
    await page.screenshot({ path: SHOT, clip: { x: 0, y: 0, width: 420, height: 420 } });
  }
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
