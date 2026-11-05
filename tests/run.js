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
  rec.until = Date.now() - 1; el._refresh();
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

(async () => {
  const { browser, page, errors } = await open(SRC);
  let pass = 0;
  const fails = [];
  for (const t of T) {
    await page.evaluate(() => { localStorage.clear(); document.body.innerHTML = ''; window.unhandled = []; window.toasts = []; history.replaceState(null, '', '/lovelace/0'); });
    let r;
    try {
      const src = t.fn.toString().replace(/__pnHass/g, `(${pnHass.toString()})`);
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
