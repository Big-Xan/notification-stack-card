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

test('G8 a request that never answers frees the button after the cap', async (lockCard) => {
  const real = window.setTimeout;
  window.setTimeout = (fn, ms, ...a) => real(fn, ms === 30000 ? 30 : ms, ...a);
  try {
    const hass = makeHass({ 'lock.front': st('lock.front', 'unlocked') }, { callService: () => new Promise(() => {}) });
    const el = mount(lockCard, hass);
    el.shadowRoot.querySelector('[data-act]').click();
    await tick(10);
    const busy = el.shadowRoot.querySelector('[data-act]').disabled;
    await tick(60);
    return { busy, freed: !el.shadowRoot.querySelector('[data-act]').disabled, shown: ids(el) };
  } finally { window.setTimeout = real; }
}, (r) => eq(r, { busy: true, freed: true, shown: ['lock:lock.front'] }), lockCard());

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

test('I2 dismissal for a deleted alert is pruned', async () => {
  localStorage.setItem('nsc-dismissed:I2', JSON.stringify({ 'gone:binary_sensor.x': ['binary_sensor.x@1'] }));
  mount({ storage_key: 'I2', alerts: [] }, makeHass({}));
  return localStorage.getItem('nsc-dismissed:I2');
}, (r) => r === '{}');

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
