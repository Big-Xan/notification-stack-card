/*
 * notification-stack-card.js  v0.2.0
 * A stacked, tap-to-expand notification card for Home Assistant, with a visual editor.
 *
 * Alerts come from rules (entity states) and, optionally, Home Assistant's own
 * persistent notifications. Rules can belong to a group, which supplies shared
 * defaults (color, icon, severity, dismiss/snooze behaviour, tap action, buttons,
 * conditions). A multi-entity rule can `combine` its matches into one notification.
 *
 * Dismiss and snooze are stored per device (localStorage). A dismissed or snoozed
 * alert comes back when something new happens: an entity changes state again or a
 * new entity joins a combined alert. Persistent notifications are dismissed in HA.
 */

const NSC_VERSION = '0.2.0';

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };
const DEFAULT_ICONS = {
  critical: 'mdi:alert-octagon',
  warning: 'mdi:alert',
  info: 'mdi:information-outline',
};
const UNAVAILABLE = ['unavailable', 'unknown'];

const DEFAULT_SNOOZE = [
  { label: '5 minutes', minutes: 5 },
  { label: '30 minutes', minutes: 30 },
  { label: 'Until tomorrow', until: 'tomorrow' },
];

const DEFAULTS = {
  title: '',
  show_header: true,
  header_align: 'left',
  header_padding_left: 4,
  header_padding_right: 4,
  width: '',
  height: '',
  card_align: 'left',
  max_peek: 2,
  peek_offset: 10,
  message_lines: 2,
  auto_collapse: 0,
  sort: 'severity',
  show_time: true,
  hide_when_empty: true,
  empty_text: 'All clear',
  persistent_notifications: false,
  persistent_severity: 'info',
  persistent_icon: 'mdi:bell-outline',
  persistent_group: '',
  snooze: true,
  snooze_display: 'icon',
  snooze_label: 'Snooze',
  show_snoozed: true,
  snooze_options: DEFAULT_SNOOZE,
  storage_key: '',
  styles: '',
};

// ---------- helpers ----------

const toList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isBlank = (v) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ||
  (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
const validSeverity = (s) => (SEVERITY_RANK[s] !== undefined ? s : undefined);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const stripMd = (s) =>
  String(s ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

const cssSize = (v) => {
  if (isBlank(v)) return '';
  const s = String(v).trim();
  return /^\d+(\.\d+)?$/.test(s) ? `${s}px` : s;
};

const cssColor = (v) => {
  if (isBlank(v)) return '';
  if (Array.isArray(v) && v.length >= 3) return `rgb(${v.slice(0, 3).map(Number).join(', ')})`;
  return String(v);
};

const joinNames = (names) => {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

const timeOf = (ts) => new Date(ts || 0).getTime() || 0;

function relTime(ts, long = false) {
  if (!ts) return '';
  const t = timeOf(ts);
  if (!t) return '';
  const diff = Math.max(0, (Date.now() - t) / 1000);
  if (diff < 45) return long ? 'just now' : 'now';
  if (diff < 3600) {
    const m = Math.max(1, Math.round(diff / 60));
    return long ? `${m} min ago` : `${m}m`;
  }
  if (diff < 86400) {
    const h = Math.round(diff / 3600);
    return long ? `${h} h ago` : `${h}h`;
  }
  const d = Math.round(diff / 86400);
  return long ? `${d} d ago` : `${d}d`;
}

/** Snooze option -> epoch ms it ends, or null if the option is invalid. */
function snoozeEnd(opt, now = new Date()) {
  if (!opt) return null;
  const mins = Number(opt.minutes) || (Number(opt.hours) || 0) * 60;
  if (mins > 0) return now.getTime() + mins * 60000;
  if (opt.until === 'tomorrow') {
    const d = new Date(now);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
  const m = typeof opt.until === 'string' && opt.until.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    const d = new Date(now);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  return null;
}

const normalizeSnooze = (list) =>
  toList(list)
    .filter((o) => o && snoozeEnd(o) !== null)
    .map((o) => ({ ...o, label: o.label || (o.minutes ? `${o.minutes} min` : o.until) }));

const normalizeGroups = (groups) => {
  const map = new Map();
  if (Array.isArray(groups)) groups.forEach((g) => g && g.id && map.set(String(g.id), { ...g, id: String(g.id) }));
  else if (groups && typeof groups === 'object')
    Object.entries(groups).forEach(([id, g]) => g && map.set(id, { ...g, id }));
  return map;
};

function readStore(key) {
  try {
    const obj = JSON.parse(window.localStorage.getItem(key) || '{}');
    return obj && typeof obj === 'object' ? obj : {};
  } catch (_) {
    return {};
  }
}

function writeStore(key, obj) {
  try {
    window.localStorage.setItem(key, JSON.stringify(obj));
  } catch (_) {
    /* blocked storage: state lasts until reload */
  }
}

// ---------- card styles ----------

const STYLE = `
:host {
  display: block;
  --nsc-critical: rgb(220, 60, 60);
  --nsc-warning: rgb(255, 152, 0);
  --nsc-info: var(--primary-color, #03a9f4);
  --nsc-bg: var(--ha-card-background, var(--card-background-color, rgba(30, 30, 30, 0.6)));
  --nsc-radius: var(--ha-card-border-radius, 18px);
  --nsc-blur: blur(18px) saturate(140%);
  --nsc-border: 1px solid rgba(255, 255, 255, 0.10);
  --nsc-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  --nsc-chip: rgba(var(--rgb-primary-text-color, 255, 255, 255), 0.10);
  --nsc-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --nsc-duration: 380ms;
}
:host([hidden]) { display: none; }
@media (prefers-reduced-motion: reduce) { :host { --nsc-duration: 0ms; } }

.wrap { display: flex; flex-direction: column; gap: 8px; max-width: 100%; box-sizing: border-box; }

.header {
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
  column-gap: 8px; min-height: 28px;
}
.header[hidden], .footer[hidden] { display: none; }
.htitle, .hbtns { grid-row: 1; min-width: 0; }
.al-left .htitle { grid-column: 1 / 3; justify-self: start; }
.al-left .hbtns { grid-column: 3; justify-self: end; }
.al-center .htitle { grid-column: 2; justify-self: center; }
.al-center .hbtns { grid-column: 3; justify-self: end; }
.al-right .htitle { grid-column: 2 / 4; justify-self: end; }
.al-right .hbtns { grid-column: 1; justify-self: start; }
.htitle {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 600; color: var(--primary-text-color); cursor: pointer;
}
.htitle .title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.htitle .title:empty { display: none; }
.count { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 10px; background: var(--nsc-chip); }
.count:empty { display: none; }
.hbtns, .footer { display: flex; gap: 6px; align-items: center; }
.footer.al-left { justify-content: flex-start; }
.footer.al-center { justify-content: center; }
.footer.al-right { justify-content: flex-end; }
.hbtn {
  all: unset; box-sizing: border-box; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 14px;
  color: var(--primary-text-color); background: var(--nsc-chip);
  backdrop-filter: var(--nsc-blur); -webkit-backdrop-filter: var(--nsc-blur);
}
.hbtn[hidden] { display: none; }
.hbtn.confirm { background: var(--nsc-critical); color: #fff; }
.hbtn ha-icon { --mdc-icon-size: 16px; }

.scroller.scroll { overflow-y: auto; overscroll-behavior: contain; padding: 2px 2px 6px; margin: -2px -2px 0; }
.stack { position: relative; transition: height var(--nsc-duration) var(--nsc-ease); }

.item {
  --nsc-accent: var(--nsc-info);
  --nsc-tint-amount: 0%;
  --nsc-tint: color-mix(in srgb, var(--nsc-accent) var(--nsc-tint-amount), transparent);
  position: absolute; top: 0; left: 0; right: 0;
  box-sizing: border-box; overflow: hidden;
  border-radius: var(--nsc-radius); border: var(--nsc-border); box-shadow: var(--nsc-shadow);
  background: linear-gradient(var(--nsc-tint), var(--nsc-tint)), var(--nsc-bg);
  backdrop-filter: var(--nsc-blur); -webkit-backdrop-filter: var(--nsc-blur);
  transform: translate3d(var(--x, 0px), var(--y, 0px), 0) scale(var(--s, 1));
  transform-origin: 50% 100%;
  transition:
    transform var(--nsc-duration) var(--nsc-ease),
    height var(--nsc-duration) var(--nsc-ease),
    opacity 250ms ease;
  touch-action: pan-y; cursor: pointer;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
}
.item.sev-critical { --nsc-accent: var(--nsc-critical); --nsc-tint-amount: 30%; }
.item.sev-warning { --nsc-accent: var(--nsc-warning); --nsc-tint-amount: 12%; }
.item.dragging { transition: height var(--nsc-duration) var(--nsc-ease); }
.item.entering, .item.leaving, .item.hiddenstack { opacity: 0; }
.item.leaving, .item.hiddenstack { pointer-events: none; }
.no-anim, .no-anim .item { transition: none !important; }

.content { padding: 12px; transition: opacity 200ms ease; }
.item.behind .content { opacity: 0; }
.row { display: flex; align-items: flex-start; gap: 12px; }
.icon {
  flex: 0 0 auto; width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--nsc-accent); background: color-mix(in srgb, var(--nsc-accent) 25%, transparent);
}
.item.sev-critical .icon { color: #fff; background: var(--nsc-accent); }
.icon ha-icon { --mdc-icon-size: 22px; }
.text { flex: 1 1 auto; min-width: 0; padding-top: 1px; }
.grp {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--nsc-accent); margin-bottom: 1px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.trow { display: flex; align-items: baseline; gap: 8px; }
.ttl {
  flex: 1 1 auto; min-width: 0; font-size: 14px; font-weight: 600; color: var(--primary-text-color);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.time { flex: 0 0 auto; font-size: 12px; color: var(--secondary-text-color); }
.msg {
  margin-top: 2px; font-size: 13px; line-height: 1.35; color: var(--secondary-text-color);
  white-space: pre-line; word-break: break-word;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--nsc-lines, 2); overflow: hidden;
}
.item.full .msg { display: block; -webkit-line-clamp: unset; }

.ibtns { display: flex; gap: 6px; flex: 0 0 auto; margin: -2px -2px 0 0; }
.ib {
  all: unset; box-sizing: border-box; cursor: pointer;
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--secondary-text-color); background: var(--nsc-chip);
}
.ib ha-icon { --mdc-icon-size: 16px; }

.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; padding-left: 50px; }
.act {
  all: unset; box-sizing: border-box; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  flex: 1 1 0; min-width: 0; padding: 7px 10px; border-radius: 12px;
  font-size: 13px; font-weight: 600; white-space: nowrap;
  color: var(--primary-text-color); background: rgba(var(--rgb-primary-text-color, 255, 255, 255), 0.12);
  transition: background 150ms ease, transform 120ms ease;
}
.act span { overflow: hidden; text-overflow: ellipsis; }
.act.confirm { background: var(--nsc-accent); color: #fff; }
.act ha-icon { --mdc-icon-size: 18px; flex: 0 0 auto; }
.snz .act { flex: 0 1 auto; padding: 7px 12px; }
.snz .act.cancel { padding: 7px; }
.act:active, .ib:active, .hbtn:active { transform: scale(0.96); }

.empty {
  padding: 14px; text-align: center; font-size: 13px; color: var(--secondary-text-color);
  border-radius: var(--nsc-radius); border: var(--nsc-border); background: var(--nsc-bg);
  backdrop-filter: var(--nsc-blur); -webkit-backdrop-filter: var(--nsc-blur);
}
.empty[hidden] { display: none; }
`;

// ---------- card ----------

class NotificationStackCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._expanded = false;
    this._items = new Map();
    this._alerts = [];
    this._pn = {};
    this._pnSub = null;
    this._pnFailed = false;
    this._sig = '';
    this._confirming = null;
    this._snoozeOpen = null;
    this._snoozedCount = 0;
    this._drag = null;
    this._suppressClick = false;
    this._lastW = 0;
  }

  static getConfigElement() {
    return document.createElement('notification-stack-card-editor');
  }

  static getStubConfig() {
    return { title: 'Notifications', persistent_notifications: true, alerts: [] };
  }

  getCardSize() {
    return Math.max(1, Math.min(4, this._alerts.length || 1));
  }

  getGridOptions() {
    return { columns: 12, min_columns: 4 };
  }

  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    this._raw = config;
    this._config = {
      ...DEFAULTS,
      ...config,
      alerts: toList(config.alerts).filter((r) => r && typeof r === 'object'),
    };
    const snooze = normalizeSnooze(this._config.snooze_options);
    this._snoozeOptions = snooze.length ? snooze : DEFAULT_SNOOZE;
    this._groups = normalizeGroups(config.groups);
    const key = this._config.storage_key || 'default';
    this._dismissKey = `nsc-dismissed:${key}`;
    this._snoozeKey = `nsc-snoozed:${key}`;
    this._dismissed = readStore(this._dismissKey);
    this._snoozed = readStore(this._snoozeKey);
    this._expanded = false;
    this._snoozeOpen = null;
    this._confirming = null;
    this._sig = '';
    this._build();
    this._maybeSubscribe();
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._maybeSubscribe();
    this._update();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._maybeSubscribe();
    if (!this._timer) {
      this._timer = setInterval(() => this._refresh(), 60000);
    }
    if (this._stack) requestAnimationFrame(() => this._layout());
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = null;
    [this._acTimer, this._confirmTimer, this._wakeTimer].forEach(clearTimeout);
    if (this._pnSub) {
      this._pnSub.then((unsub) => unsub && unsub()).catch(() => {});
      this._pnSub = null;
    }
  }

  _refresh() {
    this._sig = '';
    this._update();
  }

  // ---------- persistent notifications ----------

  _maybeSubscribe() {
    if (!this._config?.persistent_notifications || !this._hass?.connection) return;
    if (this._pnSub || this._pnFailed || !this.isConnected) return;
    this._pnSub = this._hass.connection.subscribeMessage((msg) => this._onPN(msg), {
      type: 'persistent_notification/subscribe',
    });
    this._pnSub.catch((err) => {
      console.warn('notification-stack-card: persistent notification subscription failed', err);
      this._pnSub = null;
      this._pnFailed = true;
    });
  }

  _onPN(msg) {
    const n = (msg && msg.notifications) || {};
    if (msg.type === 'current') this._pn = { ...n };
    else if (msg.type === 'removed') Object.keys(n).forEach((id) => delete this._pn[id]);
    else this._pn = { ...this._pn, ...n };
    this._refresh();
  }

  // ---------- rules ----------

  _test(val, c) {
    const hasState = c.state !== undefined;
    const hasNot = c.state_not !== undefined;
    const hasNum = c.above !== undefined || c.below !== undefined;
    const s = String(val);
    if (hasState) {
      if (!toList(c.state).map(String).includes(s)) return false;
    } else {
      if (UNAVAILABLE.includes(s)) return false;
      if (!hasNot && !hasNum && s !== 'on') return false;
    }
    if (hasNot && toList(c.state_not).map(String).includes(s)) return false;
    if (hasNum) {
      const n = Number(val);
      if (!Number.isFinite(n)) return false;
      if (c.above !== undefined && !(n > Number(c.above))) return false;
      if (c.below !== undefined && !(n < Number(c.below))) return false;
    }
    return true;
  }

  _conditionsPass(conds) {
    return toList(conds).every((c) => {
      const so = c && this._hass.states[c.entity];
      if (!so) return false;
      return this._test(c.attribute ? so.attributes[c.attribute] : so.state, c);
    });
  }

  _fill(tpl, ctx) {
    const { so } = ctx;
    return String(tpl ?? '').replace(/\{(\w+)(?::([^}]+))?\}/g, (m, key, arg) => {
      switch (key) {
        case 'name':
          return ctx.name;
        case 'names':
          return ctx.names;
        case 'count':
          return String(ctx.count);
        case 'state':
          try {
            return this._hass.formatEntityState ? this._hass.formatEntityState(so) : so.state;
          } catch (_) {
            return so.state;
          }
        case 'value':
          return so.state;
        case 'since':
          return relTime(so.last_changed, true);
        case 'attr': {
          const v = arg ? so.attributes[arg] : undefined;
          return v === undefined || v === null ? '' : String(v);
        }
        default:
          return m;
      }
    });
  }

  /** Settings a rule inherits from its group (rule values win). */
  _inherit(rule, g) {
    const severity = validSeverity(rule.severity) || validSeverity(g?.severity) || 'info';
    const dismissible = (rule.dismissible ?? g?.dismissible) !== false;
    return {
      severity,
      dismissible,
      snoozable: (rule.snoozable ?? g?.snoozable ?? dismissible) !== false,
      icon: rule.icon || g?.icon,
      color: cssColor(rule.color ?? g?.color),
      tap_action: rule.tap_action ?? g?.tap_action,
      actions: toList(rule.actions ?? g?.actions),
      snooze_options: rule.snooze_options ?? g?.snooze_options,
      groupName: g && g.show_name !== false ? g.name || '' : '',
    };
  }

  _computeAlerts() {
    const hass = this._hass;
    const cfg = this._config;
    const out = [];

    cfg.alerts.forEach((rule, idx) => {
      const g = rule.group ? this._groups.get(String(rule.group)) : undefined;
      if (g?.conditions && !this._conditionsPass(g.conditions)) return;
      if (rule.conditions && !this._conditionsPass(rule.conditions)) return;

      const hits = [];
      const ents = rule.entities ? toList(rule.entities) : rule.entity ? [rule.entity] : [];
      for (const e of ents) {
        const ent = typeof e === 'string' ? { entity: e } : e || {};
        const so = ent.entity && hass.states[ent.entity];
        if (!so) continue;
        if (!this._test(rule.attribute ? so.attributes[rule.attribute] : so.state, rule)) continue;
        hits.push({ ent, so, name: ent.name || so.attributes.friendly_name || ent.entity });
      }
      if (!hits.length) return;

      const base = this._inherit(rule, g);
      const ruleId = rule.id || `r${idx}`;
      const make = (id, list) => {
        const lead = list[0];
        const multi = list.length > 1;
        const names = joinNames(list.map((h) => h.name));
        const ctx = { so: lead.so, name: multi ? names : lead.name, names, count: list.length };
        const tTpl = (multi && rule.combined_title) || rule.title || '{name}';
        const mTpl = multi && rule.combined_message !== undefined ? rule.combined_message : rule.message ?? '{state}';
        return {
          ...base,
          id,
          kind: 'entity',
          entity: lead.ent.entity,
          icon: lead.ent.icon || base.icon || lead.so.attributes.icon || DEFAULT_ICONS[base.severity],
          title: this._fill(tTpl, ctx),
          message: this._fill(mTpl, ctx),
          ts: lead.so.last_changed,
          tokens: list.map((h) => `${h.ent.entity}@${h.so.last_changed}`),
        };
      };

      if (rule.combine) {
        hits.sort((a, b) => timeOf(b.so.last_changed) - timeOf(a.so.last_changed));
        out.push(make(`${ruleId}:combined`, hits));
      } else {
        hits.forEach((h) => out.push(make(`${ruleId}:${h.ent.entity}`, [h])));
      }
    });

    if (cfg.persistent_notifications) {
      const g = cfg.persistent_group ? this._groups.get(String(cfg.persistent_group)) : undefined;
      const base = this._inherit({ severity: this._raw.persistent_severity, icon: this._raw.persistent_icon }, g);
      for (const n of Object.values(this._pn)) {
        if (!n || !n.notification_id) continue;
        out.push({
          ...base,
          id: `pn:${n.notification_id}`,
          kind: 'pn',
          notification_id: n.notification_id,
          icon: base.icon || DEFAULTS.persistent_icon,
          title: stripMd(n.title) || 'Notification',
          message: stripMd(n.message),
          ts: n.created_at,
          dismissible: true,
          tokens: [`pn@${n.created_at}`],
        });
      }
    }

    // Dismissed / snoozed: hidden while every current token was already seen.
    const now = Date.now();
    const active = new Map(out.map((a) => [a.id, a]));
    const covered = (seen, a) => Array.isArray(seen) && a.tokens.every((t) => seen.includes(t));
    let dChanged = false;
    let sChanged = false;
    for (const id of Object.keys(this._dismissed)) {
      const a = active.get(id);
      if (!a || !covered(this._dismissed[id], a)) {
        delete this._dismissed[id];
        dChanged = true;
      }
    }
    for (const id of Object.keys(this._snoozed)) {
      const s = this._snoozed[id];
      const a = active.get(id);
      if (!s || !(s.until > now) || (a && !covered(s.tokens, a))) {
        delete this._snoozed[id];
        sChanged = true;
      }
    }
    if (dChanged) writeStore(this._dismissKey, this._dismissed);
    if (sChanged) writeStore(this._snoozeKey, this._snoozed);

    let snoozed = 0;
    const visible = out.filter((a) => {
      if (this._dismissed[a.id]) return false;
      if (this._snoozed[a.id]) {
        snoozed += 1;
        return false;
      }
      return true;
    });
    this._snoozedCount = snoozed;
    this._scheduleWake();

    visible.sort((a, b) => {
      if (cfg.sort !== 'time') {
        const d = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (d) return d;
      }
      return timeOf(b.ts) - timeOf(a.ts);
    });
    return visible;
  }

  _scheduleWake() {
    clearTimeout(this._wakeTimer);
    const ends = Object.values(this._snoozed).map((s) => s.until).filter(Number.isFinite);
    if (!ends.length) return;
    const wait = Math.min(Math.max(500, Math.min(...ends) - Date.now() + 500), 2147483000);
    this._wakeTimer = setTimeout(() => this._refresh(), wait);
  }

  // ---------- DOM ----------

  _build() {
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>${STYLE}</style>
      <style>${this._config.styles || ''}</style>
      <div class="wrap">
        <div class="header" hidden>
          <div class="htitle"><span class="title"></span><span class="count"></span></div>
          <div class="hbtns"></div>
        </div>
        <div class="scroller"><div class="stack no-anim"></div></div>
        <div class="footer" hidden></div>
        <div class="empty" hidden></div>
      </div>`;
    const $ = (s) => root.querySelector(s);
    this._wrap = $('.wrap');
    this._header = $('.header');
    this._hbtns = $('.hbtns');
    this._footer = $('.footer');
    this._titleEl = $('.htitle .title');
    this._countEl = $('.count');
    this._scroller = $('.scroller');
    this._stack = $('.stack');
    this._emptyEl = $('.empty');
    this._items = new Map();

    // Header controls live in one container that moves between header and footer.
    this._ctrls = document.createElement('div');
    this._ctrls.style.display = 'contents';
    this._ctrls.innerHTML = `
      <button class="hbtn snzc" hidden><ha-icon icon="mdi:bell-sleep"></ha-icon><span></span></button>
      <button class="hbtn clear" hidden></button>
      <button class="hbtn less" hidden><ha-icon icon="mdi:chevron-up"></ha-icon><span>Show less</span></button>`;
    this._snzcBtn = this._ctrls.querySelector('.snzc');
    this._clearBtn = this._ctrls.querySelector('.clear');
    this._lessBtn = this._ctrls.querySelector('.less');

    const cfg = this._config;
    const align = ['left', 'center', 'right'].includes(cfg.header_align) ? cfg.header_align : 'left';
    this._header.classList.add(`al-${align}`);
    this._footer.classList.add(`al-${align}`);
    const pl = cssSize(cfg.header_padding_left);
    const pr = cssSize(cfg.header_padding_right);
    [this._header, this._footer].forEach((el) => {
      el.style.paddingLeft = pl;
      el.style.paddingRight = pr;
    });
    this._wrap.style.width = cssSize(cfg.width);
    this._wrap.style.marginLeft = cfg.card_align === 'left' ? '0' : 'auto';
    this._wrap.style.marginRight = cfg.card_align === 'right' ? '0' : 'auto';
    if (!cssSize(cfg.width)) this._wrap.style.margin = '0';
    this.style.setProperty('--nsc-lines', String(Number(cfg.message_lines) || 2));

    root.querySelector('.htitle').addEventListener('click', () => {
      if (this._alerts.length > 1) this._setExpanded(!this._expanded, true);
    });
    this._lessBtn.addEventListener('click', () => this._setExpanded(false, true));
    this._clearBtn.addEventListener('click', () => this._onClearAll());
    this._snzcBtn.addEventListener('click', () => this._onUnsnoozeAll());

    this._stack.addEventListener('click', (ev) => this._onClick(ev));
    this._stack.addEventListener('pointerdown', (ev) => this._onPointerDown(ev));
    this._stack.addEventListener('pointermove', (ev) => this._onPointerMove(ev));
    this._stack.addEventListener('pointerup', (ev) => this._onPointerUp(ev, false));
    this._stack.addEventListener('pointercancel', (ev) => this._onPointerUp(ev, true));

    if (this._ro) this._ro.disconnect();
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect?.width || 0;
        if (w && w !== this._lastW) {
          this._lastW = w;
          this._layout();
        }
      });
      this._ro.observe(this._stack);
    }
  }

  _update() {
    if (!this._hass || !this._config || !this._stack) return;
    const alerts = this._computeAlerts();
    const sig =
      alerts.map((a) => `${a.id}|${a.ts}|${a.severity}|${a.icon}|${a.color}|${a.title}|${a.message}`).join('§') +
      `#${this._expanded}#${this._confirming || ''}#${this._snoozeOpen || ''}#${this._snoozedCount}`;
    if (sig === this._sig) return;
    this._sig = sig;
    this._alerts = alerts;
    this._render();
  }

  _render() {
    const cfg = this._config;
    const alerts = this._alerts;
    const n = alerts.length;
    if (n <= 1 && this._expanded) {
      this._expanded = false;
      clearTimeout(this._acTimer);
    }
    const snoozeChip = cfg.show_snoozed && this._snoozedCount > 0;
    const empty = n === 0;
    this.hidden = empty && !snoozeChip && cfg.hide_when_empty && !this.preview;

    // Header / footer controls
    const showHeader = cfg.show_header !== false && (cfg.title || this._expanded || snoozeChip) && (!empty || snoozeChip);
    this._header.hidden = !showHeader;
    const ctrlHost = cfg.show_header !== false ? this._hbtns : this._footer;
    if (this._ctrls.parentNode !== ctrlHost) ctrlHost.appendChild(this._ctrls);
    this._titleEl.textContent = cfg.title || (this._expanded ? 'Notifications' : '');
    this._countEl.textContent = n > 1 ? String(n) : '';

    this._snzcBtn.hidden = !snoozeChip;
    this._snzcBtn.classList.toggle('confirm', this._confirming === 'unsnooze');
    this._snzcBtn.querySelector('span').textContent =
      this._confirming === 'unsnooze' ? 'Unsnooze all?' : String(this._snoozedCount);
    this._lessBtn.hidden = !this._expanded;
    this._clearBtn.hidden = !(this._expanded && alerts.some((a) => a.dismissible));
    this._clearBtn.textContent = this._confirming === 'clear' ? 'Clear all?' : 'Clear';
    this._clearBtn.classList.toggle('confirm', this._confirming === 'clear');
    this._footer.hidden = cfg.show_header !== false || !(this._expanded || snoozeChip);

    // Height limit applies while expanded
    const maxH = this._expanded ? cssSize(cfg.height) : '';
    this._scroller.style.maxHeight = maxH;
    this._scroller.classList.toggle('scroll', !!maxH);

    // Empty state
    const showEmpty = empty && (!cfg.hide_when_empty || this.preview);
    this._emptyEl.hidden = !showEmpty;
    this._emptyEl.textContent = cfg.hide_when_empty && this.preview ? `${cfg.empty_text} (hidden when empty)` : cfg.empty_text;

    // Items (keyed)
    const seen = new Set();
    for (const a of alerts) {
      let el = this._items.get(a.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'item entering';
        el.dataset.id = a.id;
        this._stack.appendChild(el);
        this._items.set(a.id, el);
      }
      el.classList.remove('sev-critical', 'sev-warning', 'sev-info');
      el.classList.add(`sev-${a.severity}`);
      if (a.color) el.style.setProperty('--nsc-accent', a.color);
      else el.style.removeProperty('--nsc-accent');
      const html = this._itemHTML(a);
      if (el._html !== html) {
        el.innerHTML = html;
        el._html = html;
      }
      seen.add(a.id);
    }
    for (const [id, el] of this._items) {
      if (seen.has(id)) continue;
      this._items.delete(id);
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 320);
    }

    requestAnimationFrame(() => this._layout());
  }

  _snoozeEnabled(a) {
    return this._config.snooze !== false && a.snoozable;
  }

  _optionsFor(a) {
    const own = normalizeSnooze(a.snooze_options);
    return own.length ? own : this._snoozeOptions;
  }

  _itemHTML(a) {
    const cfg = this._config;
    const snz = this._snoozeEnabled(a);
    const asButton = snz && cfg.snooze_display === 'button';
    const snzIcon = '<ha-icon icon="mdi:bell-sleep-outline"></ha-icon>';

    let row;
    if (this._snoozeOpen === a.id) {
      row = `<div class="actions snz">${this._optionsFor(a)
        .map((o, k) => `<button class="act" data-snz="${k}">${esc(o.label)}</button>`)
        .join('')}<button class="act cancel" data-snz-cancel aria-label="Cancel"><ha-icon icon="mdi:close"></ha-icon></button></div>`;
    } else {
      const buttons = a.actions
        .map((b, j) => {
          if (!b) return '';
          const confirming = this._confirming === `${a.id}:${j}`;
          const label = confirming ? b.confirm_text || 'Confirm?' : b.name || '';
          return `<button class="act${confirming ? ' confirm' : ''}" data-act="${j}">${
            b.icon ? `<ha-icon icon="${esc(b.icon)}"></ha-icon>` : ''
          }${label ? `<span>${esc(label)}</span>` : ''}</button>`;
        })
        .join('');
      const snzBtn = asButton ? `<button class="act" data-snz-open>${snzIcon}<span>${esc(cfg.snooze_label)}</span></button>` : '';
      row = buttons || snzBtn ? `<div class="actions">${buttons}${snzBtn}</div>` : '';
    }

    const ibtns = [
      snz && !asButton ? `<button class="ib" data-snz-open aria-label="Snooze">${snzIcon}</button>` : '',
      a.dismissible ? '<button class="ib" data-close aria-label="Dismiss"><ha-icon icon="mdi:close"></ha-icon></button>' : '',
    ].join('');
    const time = cfg.show_time && a.ts ? `<span class="time">${esc(relTime(a.ts))}</span>` : '';

    return `<div class="content">
      <div class="row">
        <div class="icon"><ha-icon icon="${esc(a.icon)}"></ha-icon></div>
        <div class="text">
          ${a.groupName ? `<div class="grp">${esc(a.groupName)}</div>` : ''}
          <div class="trow"><span class="ttl">${esc(a.title)}</span>${time}</div>
          ${a.message ? `<div class="msg">${esc(a.message)}</div>` : ''}
        </div>
        ${ibtns ? `<div class="ibtns">${ibtns}</div>` : ''}
      </div>
      ${row}
    </div>`;
  }

  _layout() {
    if (!this._stack) return;
    const els = this._alerts.map((a) => this._items.get(a.id)).filter(Boolean);
    const n = els.length;
    const heights = els.map((el) => (el.firstElementChild ? el.firstElementChild.offsetHeight : 0));
    const gap = 8;
    const peek = Number(this._config.peek_offset) || 10;
    const maxPeek = Math.max(0, Number(this._config.max_peek) || 0);
    const collapsed = !this._expanded && n > 1;
    let total = 0;

    if (!collapsed) {
      let y = 0;
      els.forEach((el, i) => {
        this._place(el, { y, s: 1, h: heights[i], z: n - i, behind: false, hide: false });
        y += heights[i] + gap;
      });
      total = n ? y - gap : 0;
    } else {
      const h0 = heights[0];
      els.forEach((el, i) => {
        const depth = Math.min(i, maxPeek);
        this._place(el, { y: depth * peek, s: 1 - depth * 0.05, h: h0, z: n - i, behind: i > 0, hide: i > maxPeek });
      });
      total = h0 + Math.min(n - 1, maxPeek) * peek;
    }

    this._stack.style.height = `${total}px`;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        els.forEach((el) => el.classList.remove('entering'));
        this._stack.classList.remove('no-anim');
      })
    );
  }

  _place(el, p) {
    el.style.setProperty('--y', `${p.y}px`);
    el.style.setProperty('--s', String(p.s));
    el.style.height = `${p.h}px`;
    el.style.zIndex = String(p.z);
    el.classList.toggle('behind', p.behind);
    el.classList.toggle('hiddenstack', p.hide);
  }

  // ---------- interaction ----------

  _alertFor(el) {
    return el ? this._alerts.find((a) => a.id === el.dataset.id) : undefined;
  }

  _isCollapsed() {
    return !this._expanded && this._alerts.length > 1;
  }

  _onClick(ev) {
    if (this._suppressClick) return;
    const item = ev.target.closest('.item');
    if (!item || item.classList.contains('leaving')) return;
    const alert = this._alertFor(item);
    if (!alert) return;
    const collapsed = this._isCollapsed();
    if (this._expanded) this._armAutoCollapse();

    if (collapsed && this._alerts[0]?.id !== alert.id) return this._setExpanded(true, true);

    const t = ev.target;
    if (t.closest('[data-close]')) return this._animateOut(item, 1, () => this._dismiss(alert));
    if (t.closest('[data-snz-open]')) return this._setSnoozeOpen(this._snoozeOpen === alert.id ? null : alert.id);
    if (t.closest('[data-snz-cancel]')) return this._setSnoozeOpen(null);
    const snzBtn = t.closest('[data-snz]');
    if (snzBtn) return this._snooze(item, alert, Number(snzBtn.dataset.snz));
    const actBtn = t.closest('[data-act]');
    if (actBtn) return this._onActionButton(alert, Number(actBtn.dataset.act));

    if (collapsed) return this._setExpanded(true, true);
    if (alert.tap_action) {
      this._haptic();
      this._runAction(alert.tap_action, alert);
    } else if (item.querySelector('.msg')) {
      item.classList.toggle('full');
      this._layout();
    }
  }

  _setExpanded(v, user = false) {
    if (v && this._alerts.length <= 1) v = false;
    if (this._expanded === v) return;
    this._expanded = v;
    this._confirming = null;
    this._snoozeOpen = null;
    if (user) this._haptic();
    if (v) this._armAutoCollapse();
    else clearTimeout(this._acTimer);
    if (!v) this._items.forEach((el) => el.classList.remove('full'));
    this._refresh();
  }

  _armAutoCollapse() {
    clearTimeout(this._acTimer);
    const secs = Number(this._config.auto_collapse) || 0;
    if (secs > 0) this._acTimer = setTimeout(() => this._setExpanded(false), secs * 1000);
  }

  _setConfirming(key) {
    this._confirming = key;
    clearTimeout(this._confirmTimer);
    if (key) this._confirmTimer = setTimeout(() => this._setConfirming(null), 3000);
    this._refresh();
  }

  _setSnoozeOpen(id) {
    this._snoozeOpen = id;
    this._confirming = null;
    this._haptic();
    this._refresh();
  }

  _onClearAll() {
    if (this._confirming !== 'clear') return this._setConfirming('clear');
    this._haptic();
    this._alerts.filter((a) => a.dismissible).forEach((a) => this._dismiss(a, true));
    writeStore(this._dismissKey, this._dismissed);
    this._confirming = null;
    this._expanded = false;
    this._refresh();
  }

  _onUnsnoozeAll() {
    if (this._confirming !== 'unsnooze') return this._setConfirming('unsnooze');
    this._haptic();
    this._snoozed = {};
    writeStore(this._snoozeKey, this._snoozed);
    this._confirming = null;
    this._refresh();
  }

  _onActionButton(alert, j) {
    const b = alert.actions[j];
    if (!b) return;
    const key = `${alert.id}:${j}`;
    if (b.confirm && this._confirming !== key) return this._setConfirming(key);
    if (this._confirming) this._setConfirming(null);
    this._haptic();
    const act = b.tap_action || b;
    this._runAction(act, alert);
    if (b.dismiss && act.action !== 'dismiss') this._dismiss(alert);
  }

  _runAction(act, alert) {
    const hass = this._hass;
    if (!act || !hass) return;
    const entity = act.entity || alert.entity;
    switch (act.action) {
      case 'perform-action':
      case 'call-service': {
        const svc = act.perform_action || act.service;
        if (!svc || !svc.includes('.')) return;
        const [domain, service] = svc.split('.', 2);
        Promise.resolve(hass.callService(domain, service, act.data || act.service_data || {}, act.target)).catch(
          (e) => this._fire('hass-notification', { message: `Action failed: ${e?.message || e}` })
        );
        break;
      }
      case 'navigate':
        if (act.navigation_path) {
          history.pushState(null, '', act.navigation_path);
          window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
        }
        break;
      case 'more-info':
        if (entity) this._fire('hass-more-info', { entityId: entity });
        break;
      case 'toggle':
        if (entity) hass.callService('homeassistant', 'toggle', { entity_id: entity });
        break;
      case 'url':
        if (act.url_path) window.open(act.url_path, act.new_tab === false ? '_self' : '_blank', 'noopener');
        break;
      case 'dismiss':
        this._dismiss(alert);
        break;
      case 'snooze':
        this._setSnoozeOpen(alert.id);
        break;
      default:
        break;
    }
  }

  _dismiss(alert, batch = false) {
    if (alert.kind === 'pn') {
      this._hass.callService('persistent_notification', 'dismiss', { notification_id: alert.notification_id });
      delete this._pn[alert.notification_id];
    } else {
      this._dismissed[alert.id] = alert.tokens;
      if (!batch) writeStore(this._dismissKey, this._dismissed);
    }
    if (!batch) this._refresh();
  }

  _snooze(item, alert, k) {
    const opt = this._optionsFor(alert)[k];
    const until = snoozeEnd(opt);
    if (!until) return;
    this._snoozed[alert.id] = { until, tokens: alert.tokens };
    writeStore(this._snoozeKey, this._snoozed);
    this._snoozeOpen = null;
    this._animateOut(item, 1, () => this._refresh());
  }

  _animateOut(el, dir, done) {
    this._haptic();
    el.style.setProperty('--x', `${dir * (el.offsetWidth + 40)}px`);
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    setTimeout(done, 240);
  }

  _onPointerDown(ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    if (ev.target.closest('button')) return;
    const item = ev.target.closest('.item');
    const alert = this._alertFor(item);
    if (!alert || !alert.dismissible) return;
    if (this._isCollapsed() && this._alerts[0]?.id !== alert.id) return;
    this._drag = { item, alert, x0: ev.clientX, y0: ev.clientY, dx: 0, active: false, id: ev.pointerId };
  }

  _onPointerMove(ev) {
    const d = this._drag;
    if (!d || ev.pointerId !== d.id) return;
    const dx = ev.clientX - d.x0;
    const dy = ev.clientY - d.y0;
    if (!d.active) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        this._drag = null;
        return;
      }
      d.active = true;
      d.item.classList.add('dragging');
      try {
        d.item.setPointerCapture(ev.pointerId);
      } catch (_) {
        /* ignore */
      }
    }
    d.dx = dx;
    d.item.style.setProperty('--x', `${dx}px`);
    d.item.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / (d.item.offsetWidth || 1)));
  }

  _onPointerUp(ev, cancelled) {
    const d = this._drag;
    this._drag = null;
    if (!d || !d.active) return;
    this._suppressClick = true;
    setTimeout(() => {
      this._suppressClick = false;
    }, 80);
    d.item.classList.remove('dragging');
    if (!cancelled && Math.abs(d.dx) > (d.item.offsetWidth || 1) * 0.35) {
      this._animateOut(d.item, Math.sign(d.dx), () => this._dismiss(d.alert));
    } else {
      d.item.style.setProperty('--x', '0px');
      d.item.style.opacity = '';
    }
  }

  _haptic() {
    this._fire('haptic', 'light');
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

// ---------- visual editor ----------

let haComponentsReady;
function loadHaComponents() {
  if (!haComponentsReady) {
    haComponentsReady = (async () => {
      if (!customElements.get('ha-form') || !customElements.get('hui-card-features-editor')) {
        try {
          const helpers = await window.loadCardHelpers?.();
          const card = await helpers?.createCardElement({ type: 'entities', entities: [] });
          await card?.constructor?.getConfigElement?.();
        } catch (_) {
          /* fall through: ha-form is normally already loaded inside the card editor */
        }
      }
      await Promise.race([customElements.whenDefined('ha-form'), new Promise((r) => setTimeout(r, 3000))]);
    })();
  }
  return haComponentsReady;
}

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical (red, sorted first)' },
  { value: 'warning', label: 'Warning (orange)' },
  { value: 'info', label: 'Info' },
];
const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];
const sel = {
  text: { text: {} },
  multiline: { text: { multiline: true } },
  bool: { boolean: {} },
  icon: { icon: {} },
  action: { ui_action: {} },
  yaml: { object: {} },
  entity: { entity: {} },
  color: { color_rgb: {} },
  num: (min, max, unit, step = 1) => ({ number: { min, max, step, mode: 'box', unit_of_measurement: unit } }),
  select: (options, mode = 'dropdown') => ({ select: { mode, options } }),
};
const grid = (...schema) => ({ type: 'grid', name: '', schema });
const expandable = (name, title, icon, schema) => ({ type: 'expandable', name, title, icon, flatten: true, schema });

const LABELS = {
  title: 'Title',
  persistent_notifications: 'Show Home Assistant notifications',
  hide_when_empty: 'Hide when there is nothing to show',
  show_header: 'Show header (title and count)',
  header_align: 'Header alignment',
  header_padding_left: 'Padding left',
  header_padding_right: 'Padding right',
  width: 'Width',
  height: 'Max height when expanded',
  card_align: 'Card alignment',
  max_peek: 'Cards peeking behind',
  peek_offset: 'Peek offset',
  message_lines: 'Message lines',
  auto_collapse: 'Auto-collapse after',
  sort: 'Sort by',
  show_time: 'Show time',
  persistent_severity: 'Severity',
  persistent_icon: 'Icon',
  persistent_group: 'Group',
  empty_text: 'Empty text',
  storage_key: 'Storage key',
  styles: 'Custom CSS',
  snooze: 'Allow snoozing',
  snooze_display: 'Snooze control',
  snooze_label: 'Snooze button text',
  show_snoozed: 'Show snoozed count',
  label: 'Text shown',
  type: 'Snooze',
  minutes: 'Duration',
  time: 'Until',
  id: 'ID',
  name: 'Name',
  color: 'Color',
  icon: 'Icon',
  severity: 'Severity',
  show_name: 'Show group name on cards',
  dismissible: 'Dismissible',
  snoozable: 'Snoozable',
  tap_action: 'Tap action',
  conditions: 'Only when (conditions, YAML)',
  group: 'Group',
  message: 'Message',
  state: 'State is',
  state_not: 'State is not',
  above: 'Above',
  below: 'Below',
  attribute: 'Attribute',
  combine: 'Combine into one notification',
  combined_title: 'Title when combined',
  combined_message: 'Message when combined',
  entity: 'Entity',
  confirm: 'Tap twice to confirm',
  dismiss: 'Dismiss after action',
  confirm_text: 'Confirm text',
};

const HELPERS = {
  width: 'e.g. 360px or 90%. Blank fills the space.',
  height: 'e.g. 420px. The list scrolls past it.',
  storage_key: 'Give a second copy of this card its own dismiss/snooze memory.',
  state: 'Comma separated. Leave all match fields blank to match "on".',
  message: 'Placeholders: {name} {state} {value} {since} {attr:key}',
  combined_title: 'Used when 2+ entities match. Adds {count} and {names}.',
  conditions: '- entity: input_boolean.away_mode\n  state: "on"',
  id: 'Keeps dismiss/snooze memory if you reorder alerts.',
};

const GENERAL_SCHEMA = [
  { name: 'title', selector: sel.text },
  grid({ name: 'persistent_notifications', selector: sel.bool }, { name: 'hide_when_empty', selector: sel.bool }),
  expandable('g_header', 'Header', 'mdi:format-title', [
    { name: 'show_header', selector: sel.bool },
    { name: 'header_align', selector: sel.select(ALIGN_OPTIONS, 'list') },
    grid(
      { name: 'header_padding_left', selector: sel.num(0, 200, 'px') },
      { name: 'header_padding_right', selector: sel.num(0, 200, 'px') }
    ),
  ]),
  expandable('g_layout', 'Size and layout', 'mdi:arrow-expand-all', [
    grid({ name: 'width', selector: sel.text }, { name: 'height', selector: sel.text }),
    { name: 'card_align', selector: sel.select(ALIGN_OPTIONS, 'list') },
    grid({ name: 'max_peek', selector: sel.num(0, 5) }, { name: 'peek_offset', selector: sel.num(0, 40, 'px') }),
    grid({ name: 'message_lines', selector: sel.num(1, 10) }, { name: 'auto_collapse', selector: sel.num(0, 600, 's') }),
    grid(
      { name: 'sort', selector: sel.select([{ value: 'severity', label: 'Severity, then newest' }, { value: 'time', label: 'Newest first' }]) },
      { name: 'show_time', selector: sel.bool }
    ),
  ]),
];

const SNOOZE_SCHEMA = [
  grid({ name: 'snooze', selector: sel.bool }, { name: 'show_snoozed', selector: sel.bool }),
  grid(
    {
      name: 'snooze_display',
      selector: sel.select([
        { value: 'icon', label: 'Icon next to dismiss' },
        { value: 'button', label: 'Button with the actions' },
      ]),
    },
    { name: 'snooze_label', selector: sel.text }
  ),
];

const ADVANCED_SCHEMA = [
  { name: 'empty_text', selector: sel.text },
  { name: 'storage_key', selector: sel.text },
  { name: 'styles', selector: sel.multiline },
];

const ALERT_FORM_KEYS = [
  'id', 'group', 'title', 'message', 'severity', 'icon', 'combine', 'combined_title', 'combined_message',
  'state', 'state_not', 'above', 'below', 'attribute', 'conditions', 'dismissible', 'snoozable', 'tap_action',
];

const schemaKeys = (schema) =>
  schema.flatMap((s) => (s.schema ? schemaKeys(s.schema) : s.name ? [s.name] : []));

const listToText = (v) => toList(v).join(', ');
const textToList = (t) => {
  const parts = String(t ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : parts;
};

const EDITOR_STYLE = `
:host { display: block; }
.ed { display: flex; flex-direction: column; gap: 12px; }
h3 { margin: 12px 0 0; font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
h3 ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); }
.hint { margin: -6px 0 0; font-size: 12px; color: var(--secondary-text-color); }
.list { display: flex; flex-direction: column; gap: 8px; }
.rowbox {
  display: flex; gap: 8px; align-items: flex-start;
  padding: 10px; border-radius: 12px; border: 1px solid var(--divider-color);
}
.rowbox > ha-form { flex: 1 1 auto; min-width: 0; }
.tools { display: flex; flex-direction: column; gap: 2px; }
.tool {
  all: unset; cursor: pointer; width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color);
}
.tool:hover { background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.06); }
.tool[disabled] { opacity: 0.3; pointer-events: none; }
.tool ha-icon { --mdc-icon-size: 20px; }
.add {
  all: unset; cursor: pointer; align-self: flex-start;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 18px; font-size: 14px; font-weight: 500;
  color: var(--primary-color); border: 1px solid var(--primary-color);
}
.add ha-icon { --mdc-icon-size: 18px; }
details { border: 1px solid var(--divider-color); border-radius: 12px; overflow: hidden; }
summary {
  list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px;
  padding: 8px 8px 8px 12px; font-weight: 500;
}
summary::-webkit-details-marker { display: none; }
summary .dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; background: var(--primary-color); }
summary .sum { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
summary .sub { font-size: 12px; color: var(--secondary-text-color); font-weight: 400; }
summary .tools { flex-direction: row; }
.body { padding: 4px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
.subhead { font-size: 13px; font-weight: 600; color: var(--secondary-text-color); margin-top: 6px; }
`;

class NotificationStackCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._open = new Set();
    this._bindings = [];
  }

  set hass(hass) {
    this._hass = hass;
    this._bindings.forEach((b) => (b.el.hass = hass));
  }

  setConfig(config) {
    this._config = clone(config) || {};
    this._render();
  }

  connectedCallback() {
    loadHaComponents().then(() => this._render(true));
  }

  // ----- config access -----

  _alerts() {
    return toList(this._config.alerts);
  }

  _groups() {
    const g = this._config.groups;
    if (Array.isArray(g)) return g;
    if (g && typeof g === 'object') return Object.entries(g).map(([id, v]) => ({ id, ...v }));
    return [];
  }

  _groupMap() {
    return normalizeGroups(this._groups());
  }

  _snoozeList() {
    return this._config.snooze_options ? toList(this._config.snooze_options) : clone(DEFAULT_SNOOZE);
  }

  _entityRows(rule) {
    if (rule.entities) return toList(rule.entities).map((e) => (typeof e === 'string' ? { entity: e } : { ...e }));
    return [{ entity: rule.entity || '' }];
  }

  _commit(cfg) {
    this._config = cfg;
    this._render();
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: cfg }, bubbles: true, composed: true }));
  }

  _patch(fn) {
    const cfg = clone(this._config);
    fn(cfg);
    this._commit(cfg);
  }

  /** Write top-level keys from a form, dropping blanks and defaults. */
  _setTop(value, keys) {
    this._patch((cfg) => {
      for (const k of keys) {
        const v = value[k];
        if (isBlank(v) || (k in DEFAULTS && deepEq(v, DEFAULTS[k]))) delete cfg[k];
        else cfg[k] = v;
      }
    });
  }

  _setList(key, list, isDefault = () => false) {
    this._patch((cfg) => {
      if (!list.length || isDefault(list)) delete cfg[key];
      else cfg[key] = list;
    });
  }

  _setAlert(i, rule) {
    const alerts = this._alerts().map(clone);
    alerts[i] = rule;
    this._setList('alerts', alerts);
  }

  // ----- render -----

  _structure() {
    return JSON.stringify({
      ready: !!customElements.get('ha-form'),
      s: this._snoozeList().length,
      g: this._groups().length,
      a: this._alerts().map((r) => [this._entityRows(r).length, toList(r.actions).length]),
    });
  }

  _render(force = false) {
    if (!this._config) return;
    const struct = this._structure();
    if (!force && struct === this._struct && this._bindings.length) {
      this._bindings.forEach((b) => b.refresh());
      return;
    }
    this._struct = struct;
    this._build();
  }

  _form(schema, data, onChange, helpers = HELPERS) {
    const el = document.createElement('ha-form');
    const binding = {
      el,
      refresh: () => {
        el.schema = typeof schema === 'function' ? schema() : schema;
        el.data = data();
      },
    };
    el.hass = this._hass;
    el.computeLabel = (s) => LABELS[s.name] ?? s.title ?? s.name;
    el.computeHelper = (s) => helpers[s.name];
    el.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      onChange(ev.detail.value || {});
    });
    binding.refresh();
    this._bindings.push(binding);
    return el;
  }

  /** Register a non-form element that updates on every config change, and run it now. */
  _live(refresh) {
    this._bindings.push({ el: {}, refresh });
    refresh();
  }

  _tool(icon, title, onClick, disabled = false) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.title = title;
    if (disabled) b.setAttribute('disabled', '');
    b.innerHTML = `<ha-icon icon="${icon}"></ha-icon>`;
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    return b;
  }

  _addButton(text, onClick) {
    const b = document.createElement('button');
    b.className = 'add';
    b.innerHTML = `<ha-icon icon="mdi:plus"></ha-icon><span>${esc(text)}</span>`;
    b.addEventListener('click', onClick);
    return b;
  }

  _heading(icon, text, hint) {
    const frag = document.createDocumentFragment();
    const h = document.createElement('h3');
    h.innerHTML = `<ha-icon icon="${icon}"></ha-icon>${esc(text)}`;
    frag.appendChild(h);
    if (hint) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = hint;
      frag.appendChild(p);
    }
    return frag;
  }

  /** A row with a form plus move/delete tools. */
  _rowBox(form, idx, len, onMove, onDelete) {
    const box = document.createElement('div');
    box.className = 'rowbox';
    const tools = document.createElement('div');
    tools.className = 'tools';
    if (onMove) {
      tools.appendChild(this._tool('mdi:arrow-up', 'Move up', () => onMove(idx, -1), idx === 0));
      tools.appendChild(this._tool('mdi:arrow-down', 'Move down', () => onMove(idx, 1), idx === len - 1));
    }
    tools.appendChild(this._tool('mdi:delete-outline', 'Remove', () => onDelete(idx)));
    box.append(form, tools);
    return box;
  }

  _panel(key, summaryFill, bodyFill, tools) {
    const d = document.createElement('details');
    if (this._open.has(key)) d.open = true;
    d.addEventListener('toggle', () => (d.open ? this._open.add(key) : this._open.delete(key)));
    const s = document.createElement('summary');
    summaryFill(s);
    const t = document.createElement('div');
    t.className = 'tools';
    tools.forEach((x) => t.appendChild(x));
    s.appendChild(t);
    const body = document.createElement('div');
    body.className = 'body';
    bodyFill(body);
    d.append(s, body);
    return d;
  }

  _build() {
    this._bindings = [];
    const root = this.shadowRoot;
    root.innerHTML = `<style>${EDITOR_STYLE}</style><div class="ed"></div>`;
    const ed = root.querySelector('.ed');
    if (!customElements.get('ha-form')) {
      ed.textContent = 'Loading editor…';
      return;
    }

    // General
    const generalKeys = schemaKeys(GENERAL_SCHEMA);
    ed.appendChild(
      this._form(GENERAL_SCHEMA, () => ({ ...DEFAULTS, ...this._config }), (v) => this._setTop(v, generalKeys))
    );

    this._buildSnooze(ed);
    this._buildGroups(ed);
    this._buildAlerts(ed);

    // Persistent notifications + advanced
    const pnSchema = () => [
      expandable('g_pn', 'Home Assistant notifications', 'mdi:bell-outline', [
        grid(
          { name: 'persistent_severity', selector: sel.select(SEVERITY_OPTIONS) },
          { name: 'persistent_icon', selector: sel.icon }
        ),
        { name: 'persistent_group', selector: sel.select(this._groupOptions('No group')) },
      ]),
      expandable('g_adv', 'Advanced', 'mdi:cog-outline', ADVANCED_SCHEMA),
    ];
    const pnKeys = ['persistent_severity', 'persistent_icon', 'persistent_group', ...schemaKeys(ADVANCED_SCHEMA)];
    ed.appendChild(
      this._form(pnSchema, () => ({ ...DEFAULTS, ...this._config, persistent_group: this._config.persistent_group || '__none' }), (v) =>
        this._setTop({ ...v, persistent_group: v.persistent_group === '__none' ? '' : v.persistent_group }, pnKeys)
      )
    );
  }

  _groupOptions(noneLabel) {
    return [{ value: '__none', label: noneLabel }, ...this._groups().map((g) => ({ value: String(g.id), label: g.name || g.id }))];
  }

  // ----- snooze -----

  _buildSnooze(ed) {
    ed.appendChild(this._heading('mdi:bell-sleep-outline', 'Snooze', 'Options people pick from when they snooze a notification.'));
    const keys = schemaKeys(SNOOZE_SCHEMA);
    ed.appendChild(this._form(SNOOZE_SCHEMA, () => ({ ...DEFAULTS, ...this._config }), (v) => this._setTop(v, keys)));

    const list = document.createElement('div');
    list.className = 'list';
    const opts = this._snoozeList();
    const toRow = (o) => ({
      label: o.label,
      type: o.until === 'tomorrow' ? 'tomorrow' : o.until ? 'until' : 'minutes',
      minutes: o.minutes ?? (o.hours ? o.hours * 60 : undefined),
      time: o.until && o.until !== 'tomorrow' ? o.until : undefined,
    });
    const fromRow = (r) => {
      const o = { label: r.label || '' };
      if (r.type === 'tomorrow') o.until = 'tomorrow';
      else if (r.type === 'until') o.until = (r.time || '08:00').slice(0, 5);
      else o.minutes = Number(r.minutes) || 5;
      return o;
    };
    const schemaFor = (i) => {
      const row = toRow(this._snoozeList()[i] || {});
      return [
        grid(
          { name: 'label', selector: sel.text },
          {
            name: 'type',
            selector: sel.select([
              { value: 'minutes', label: 'For a duration' },
              { value: 'until', label: 'Until a time of day' },
              { value: 'tomorrow', label: 'Until tomorrow (midnight)' },
            ]),
          }
        ),
        ...(row.type === 'minutes' ? [{ name: 'minutes', selector: sel.num(1, 10080, 'min') }] : []),
        ...(row.type === 'until' ? [{ name: 'time', selector: { time: {} } }] : []),
      ];
    };
    const save = (next) => this._setList('snooze_options', next, (l) => deepEq(l, DEFAULT_SNOOZE));
    const move = (i, d) => {
      const next = this._snoozeList();
      [next[i], next[i + d]] = [next[i + d], next[i]];
      save(next);
    };
    const del = (i) => save(this._snoozeList().filter((_, j) => j !== i));

    opts.forEach((_, i) => {
      const form = this._form(
        () => schemaFor(i),
        () => toRow(this._snoozeList()[i] || {}),
        (v) => {
          const next = this._snoozeList();
          next[i] = fromRow(v);
          save(next);
        }
      );
      list.appendChild(this._rowBox(form, i, opts.length, move, del));
    });
    ed.appendChild(list);
    ed.appendChild(this._addButton('Add snooze option', () => save([...this._snoozeList(), { label: '1 hour', minutes: 60 }])));
  }

  // ----- groups -----

  _buildGroups(ed) {
    ed.appendChild(
      this._heading('mdi:shape-outline', 'Groups', 'Shared settings for alerts: color, icon, severity, buttons and more.')
    );
    const groups = this._groups();
    const save = (next) => this._setList('groups', next);
    const schema = [
      grid({ name: 'name', selector: sel.text }, { name: 'id', selector: sel.text }),
      grid({ name: 'color', selector: sel.color }, { name: 'icon', selector: sel.icon }),
      grid(
        { name: 'severity', selector: sel.select([{ value: '__default', label: 'Default (info)' }, ...SEVERITY_OPTIONS]) },
        { name: 'show_name', selector: sel.bool }
      ),
      grid({ name: 'dismissible', selector: sel.bool }, { name: 'snoozable', selector: sel.bool }),
      { name: 'tap_action', selector: sel.action },
      { name: 'conditions', selector: sel.yaml },
    ];
    const toForm = (g) => ({
      ...g,
      severity: validSeverity(g.severity) || '__default',
      show_name: g.show_name !== false,
      dismissible: g.dismissible !== false,
      snoozable: (g.snoozable ?? g.dismissible) !== false,
    });
    const fromForm = (old, v) => {
      const g = { id: old.id };
      if (v.id && v.id !== old.id) g.id = v.id.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
      if (v.name) g.name = v.name;
      if (!isBlank(v.color)) g.color = v.color;
      if (v.icon) g.icon = v.icon;
      if (validSeverity(v.severity)) g.severity = v.severity;
      if (v.show_name === false) g.show_name = false;
      if (v.dismissible === false) g.dismissible = false;
      if (v.snoozable !== (v.dismissible !== false)) g.snoozable = v.snoozable;
      if (v.tap_action?.action) g.tap_action = v.tap_action;
      if (!isBlank(v.conditions)) g.conditions = v.conditions;
      for (const [k, val] of Object.entries(old)) if (!(k in g) && !schemaKeys(schema).includes(k)) g[k] = val;
      return g;
    };

    const wrap = document.createElement('div');
    wrap.className = 'list';
    groups.forEach((g, i) => {
      const key = `g:${i}`;
      const summary = (s) => {
        s.innerHTML = `<span class="dot"></span><ha-icon icon="${esc(g.icon || 'mdi:shape-outline')}"></ha-icon><span class="sum"></span>`;
        const dot = s.querySelector('.dot');
        const sum = s.querySelector('.sum');
        this._live(() => {
            const cur = this._groups()[i] || {};
            sum.innerHTML = `${esc(cur.name || cur.id)} <span class="sub">${esc(cur.id)}</span>`;
            dot.style.background = cssColor(cur.color) || 'var(--primary-color)';
        });
      };
      const body = (b) =>
        b.appendChild(
          this._form(schema, () => toForm(this._groups()[i] || {}), (v) => {
            const old = this._groups()[i];
            const next = this._groups().map(clone);
            next[i] = fromForm(old, v);
            this._patch((cfg) => {
              cfg.groups = next;
              if (next[i].id !== old.id) {
                cfg.alerts = toList(cfg.alerts).map((r) => (r.group === old.id ? { ...r, group: next[i].id } : r));
                if (cfg.persistent_group === old.id) cfg.persistent_group = next[i].id;
              }
            });
          })
        );
      const move = (d) => {
        const next = this._groups().map(clone);
        [next[i], next[i + d]] = [next[i + d], next[i]];
        save(next);
      };
      wrap.appendChild(
        this._panel(key, summary, body, [
          this._tool('mdi:arrow-up', 'Move up', () => move(-1), i === 0),
          this._tool('mdi:arrow-down', 'Move down', () => move(1), i === groups.length - 1),
          this._tool('mdi:delete-outline', 'Remove group', () => save(this._groups().filter((_, j) => j !== i))),
        ])
      );
    });
    ed.appendChild(wrap);
    ed.appendChild(
      this._addButton('Add group', () => {
        const taken = new Set(this._groups().map((g) => g.id));
        let n = this._groups().length + 1;
        while (taken.has(`group_${n}`)) n += 1;
        this._open.add(`g:${this._groups().length}`);
        save([...this._groups(), { id: `group_${n}`, name: `Group ${n}` }]);
      })
    );
  }

  // ----- alerts -----

  _alertSchema(i) {
    const rule = this._alerts()[i] || {};
    const g = rule.group ? this._groupMap().get(String(rule.group)) : undefined;
    const multi = this._entityRows(rule).length > 1;
    return [
      { name: 'group', selector: sel.select(this._groupOptions('No group')) },
      { name: 'title', selector: sel.text },
      { name: 'message', selector: sel.text },
      grid(
        {
          name: 'severity',
          selector: sel.select([
            { value: '__default', label: g ? `From group (${validSeverity(g.severity) || 'info'})` : 'Default (info)' },
            ...SEVERITY_OPTIONS,
          ]),
        },
        { name: 'icon', selector: sel.icon }
      ),
      ...(multi
        ? [
            { name: 'combine', selector: sel.bool },
            ...(rule.combine
              ? [grid({ name: 'combined_title', selector: sel.text }, { name: 'combined_message', selector: sel.text })]
              : []),
          ]
        : []),
      expandable('g_match', 'When to show', 'mdi:filter-outline', [
        grid({ name: 'state', selector: sel.text }, { name: 'state_not', selector: sel.text }),
        grid({ name: 'above', selector: sel.num(undefined, undefined, undefined, 'any') }, { name: 'below', selector: sel.num(undefined, undefined, undefined, 'any') }),
        { name: 'attribute', selector: sel.text },
        { name: 'conditions', selector: sel.yaml },
      ]),
      grid({ name: 'dismissible', selector: sel.bool }, { name: 'snoozable', selector: sel.bool }),
      { name: 'tap_action', selector: sel.action },
      { name: 'id', selector: sel.text },
    ];
  }

  _inherited(rule) {
    const g = rule.group ? this._groupMap().get(String(rule.group)) : undefined;
    const dismissible = (rule.dismissible ?? g?.dismissible) !== false;
    return {
      g,
      dismissible: g?.dismissible !== false,
      dismissibleEff: dismissible,
      snoozableDefault: (g?.snoozable ?? dismissible) !== false,
      snoozableEff: (rule.snoozable ?? g?.snoozable ?? dismissible) !== false,
    };
  }

  _alertToForm(rule) {
    const inh = this._inherited(rule);
    return {
      group: rule.group ? String(rule.group) : '__none',
      title: rule.title,
      message: rule.message,
      severity: validSeverity(rule.severity) || '__default',
      icon: rule.icon,
      combine: !!rule.combine,
      combined_title: rule.combined_title,
      combined_message: rule.combined_message,
      state: listToText(rule.state),
      state_not: listToText(rule.state_not),
      above: rule.above,
      below: rule.below,
      attribute: rule.attribute,
      conditions: rule.conditions,
      dismissible: inh.dismissibleEff,
      snoozable: inh.snoozableEff,
      tap_action: rule.tap_action,
      id: rule.id,
    };
  }

  _alertFromForm(old, v) {
    const fields = ALERT_FORM_KEYS;
    const r = {};
    const put = (k, val) => {
      if (!isBlank(val)) r[k] = val;
    };
    put('id', v.id ?? old.id);
    if (old.entity !== undefined) r.entity = old.entity;
    if (old.entities !== undefined) r.entities = old.entities;
    if (v.group && v.group !== '__none') r.group = v.group;
    put('title', v.title);
    put('message', v.message);
    if (validSeverity(v.severity)) r.severity = v.severity;
    put('icon', v.icon);
    if (v.combine) {
      r.combine = true;
      put('combined_title', v.combined_title);
      put('combined_message', v.combined_message);
    }
    put('state', textToList(v.state));
    put('state_not', textToList(v.state_not));
    if (Number.isFinite(Number(v.above)) && v.above !== '' && v.above !== undefined) r.above = Number(v.above);
    if (Number.isFinite(Number(v.below)) && v.below !== '' && v.below !== undefined) r.below = Number(v.below);
    put('attribute', v.attribute);
    put('conditions', v.conditions);
    const inh = this._inherited(r);
    if (v.dismissible !== inh.dismissible) r.dismissible = v.dismissible;
    const snzDefault = this._inherited(r).snoozableDefault;
    if (v.snoozable !== snzDefault) r.snoozable = v.snoozable;
    if (v.tap_action?.action) r.tap_action = v.tap_action;
    for (const [k, val] of Object.entries(old)) if (!(k in r) && !fields.includes(k) && k !== 'actions') r[k] = val;
    if (old.actions) r.actions = old.actions;
    return r;
  }

  _buildAlerts(ed) {
    ed.appendChild(
      this._heading('mdi:bell-badge-outline', 'Alerts', 'Each alert watches one or more entities. Tap a row to edit it.')
    );
    const alerts = this._alerts();
    const saveAll = (next) => this._setList('alerts', next);
    const wrap = document.createElement('div');
    wrap.className = 'list';

    alerts.forEach((rule, i) => {
      const key = `a:${rule.id || i}`;
      const summary = (s) => {
        s.innerHTML = `<span class="dot"></span><ha-icon></ha-icon><span class="sum"></span>`;
        const dot = s.querySelector('.dot');
        const icon = s.querySelector('ha-icon');
        const sum = s.querySelector('.sum');
        this._live(() => {
            const cur = this._alerts()[i] || {};
            const inh = this._inherited(cur);
            const sev = validSeverity(cur.severity) || validSeverity(inh.g?.severity) || 'info';
            dot.style.background =
              cssColor(cur.color ?? inh.g?.color) ||
              { critical: 'rgb(220,60,60)', warning: 'rgb(255,152,0)', info: 'var(--primary-color)' }[sev];
            icon.setAttribute('icon', cur.icon || inh.g?.icon || DEFAULT_ICONS[sev]);
            const rows = this._entityRows(cur).filter((e) => e.entity);
            const what = rows.length > 1 ? `${rows.length} entities` : rows[0]?.entity || 'No entity yet';
            sum.innerHTML = `${esc(cur.title || rows[0]?.name || 'New alert')} <span class="sub">${esc(what)}${
              inh.g ? ` · ${esc(inh.g.name || inh.g.id)}` : ''
            }</span>`;
        });
      };
      const body = (b) => {
        b.appendChild(
          this._form(
            () => this._alertSchema(i),
            () => this._alertToForm(this._alerts()[i] || {}),
            (v) => this._setAlert(i, this._alertFromForm(this._alerts()[i] || {}, v))
          )
        );
        this._buildEntityRows(b, i);
        this._buildActionRows(b, i);
      };
      const move = (d) => {
        const next = this._alerts().map(clone);
        [next[i], next[i + d]] = [next[i + d], next[i]];
        saveAll(next);
      };
      wrap.appendChild(
        this._panel(key, summary, body, [
          this._tool('mdi:arrow-up', 'Move up', () => move(-1), i === 0),
          this._tool('mdi:arrow-down', 'Move down', () => move(1), i === alerts.length - 1),
          this._tool('mdi:delete-outline', 'Remove alert', () => saveAll(this._alerts().filter((_, j) => j !== i))),
        ])
      );
    });
    ed.appendChild(wrap);
    ed.appendChild(
      this._addButton('Add alert', () => {
        const id = `alert_${Date.now().toString(36)}`;
        this._open.add(`a:${id}`);
        saveAll([...this._alerts().map(clone), { id, entity: '' }]);
      })
    );
  }

  _writeEntities(i, rows) {
    const rule = clone(this._alerts()[i] || {});
    delete rule.entity;
    delete rule.entities;
    const clean = rows.map((r) => {
      const o = { entity: r.entity || '' };
      if (r.name) o.name = r.name;
      if (r.icon) o.icon = r.icon;
      return o;
    });
    if (clean.length === 1 && !clean[0].name && !clean[0].icon) rule.entity = clean[0].entity;
    else rule.entities = clean.map((o) => (o.name || o.icon ? o : o.entity));
    if (clean.length < 2) {
      delete rule.combine;
      delete rule.combined_title;
      delete rule.combined_message;
    }
    const ordered = rule.id ? { id: rule.id, ...rule } : rule;
    this._setAlert(i, ordered);
  }

  _buildEntityRows(b, i) {
    const head = document.createElement('div');
    head.className = 'subhead';
    head.textContent = 'Entities';
    b.appendChild(head);
    const rows = this._entityRows(this._alerts()[i] || {});
    const schema = [grid({ name: 'entity', selector: sel.entity }, { name: 'name', selector: sel.text })];
    const list = document.createElement('div');
    list.className = 'list';
    rows.forEach((_, j) => {
      const form = this._form(
        schema,
        () => this._entityRows(this._alerts()[i] || {})[j] || {},
        (v) => {
          const cur = this._entityRows(this._alerts()[i] || {});
          cur[j] = { ...cur[j], entity: v.entity || '', name: v.name || '' };
          this._writeEntities(i, cur);
        }
      );
      list.appendChild(
        this._rowBox(form, j, rows.length, null, () => {
          const cur = this._entityRows(this._alerts()[i] || {}).filter((_, k) => k !== j);
          this._writeEntities(i, cur.length ? cur : [{ entity: '' }]);
        })
      );
    });
    b.appendChild(list);
    b.appendChild(
      this._addButton('Add entity', () =>
        this._writeEntities(i, [...this._entityRows(this._alerts()[i] || {}), { entity: '' }])
      )
    );
  }

  _buildActionRows(b, i) {
    const head = document.createElement('div');
    head.className = 'subhead';
    head.textContent = 'Buttons';
    b.appendChild(head);
    const getActions = () => toList((this._alerts()[i] || {}).actions).map(clone);
    const save = (next) => {
      const rule = clone(this._alerts()[i] || {});
      if (next.length) rule.actions = next;
      else delete rule.actions;
      this._setAlert(i, rule);
    };
    const schema = [
      grid({ name: 'name', selector: sel.text }, { name: 'icon', selector: sel.icon }),
      { name: 'tap_action', selector: sel.action },
      grid({ name: 'confirm', selector: sel.bool }, { name: 'dismiss', selector: sel.bool }),
      { name: 'confirm_text', selector: sel.text },
    ];
    const toForm = (btn) => {
      const { name, icon, confirm, dismiss, confirm_text, tap_action, ...rest } = btn;
      return { name, icon, confirm: !!confirm, dismiss: !!dismiss, confirm_text, tap_action: tap_action || (rest.action ? rest : undefined) };
    };
    const fromForm = (v) => {
      const o = {};
      if (v.name) o.name = v.name;
      if (v.icon) o.icon = v.icon;
      if (v.confirm) o.confirm = true;
      if (v.confirm && v.confirm_text) o.confirm_text = v.confirm_text;
      if (v.dismiss) o.dismiss = true;
      if (v.tap_action?.action) o.tap_action = v.tap_action;
      return o;
    };
    const actions = getActions();
    const list = document.createElement('div');
    list.className = 'list';
    const move = (j, d) => {
      const next = getActions();
      [next[j], next[j + d]] = [next[j + d], next[j]];
      save(next);
    };
    actions.forEach((_, j) => {
      const form = this._form(schema, () => toForm(getActions()[j] || {}), (v) => {
        const next = getActions();
        next[j] = fromForm(v);
        save(next);
      });
      list.appendChild(this._rowBox(form, j, actions.length, move, (k) => save(getActions().filter((_, x) => x !== k))));
    });
    b.appendChild(list);
    b.appendChild(this._addButton('Add button', () => save([...getActions(), { name: 'Open', icon: 'mdi:open-in-app', tap_action: { action: 'more-info' } }])));
  }
}

// ---------- registration ----------

if (!customElements.get('notification-stack-card-editor')) {
  customElements.define('notification-stack-card-editor', NotificationStackCardEditor);
}
if (!customElements.get('notification-stack-card')) {
  customElements.define('notification-stack-card', NotificationStackCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'notification-stack-card',
    name: 'Notification Stack Card',
    description: 'Stacked, tap-to-expand alerts with groups, action buttons, dismiss and snooze.',
    preview: true,
  });
  console.info(`%c NOTIFICATION-STACK-CARD %c v${NSC_VERSION} `, 'background:#c33;color:#fff', 'background:#333;color:#fff');
}
