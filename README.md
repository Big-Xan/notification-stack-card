# Notification Stack Card

A lightweight, stacked, tap-to-expand notification card for Home Assistant. Alerts come from your entities (and, optionally, Home Assistant's own notifications), stack like phone notifications, and expand into a full list with action buttons, dismiss and snooze.

One self-contained JavaScript file. No dependencies. Includes a visual editor.


## Features

- **Stack that expands on tap**, with the most severe and newest alert on top and up to five cards peeking behind
- **Rules from entity states**: `state`, `state_not`, `above`, `below`, `attribute`, plus extra `conditions`
- **Groups**: shared color, icon, severity, buttons, tap action and snooze options, plus **quiet hours**, **zones** and **sub-stacks**
- **Templates**: share one card's groups and alerts and reuse them on any dashboard, while each card keeps its own layout
- **Combine**: one notification for several matching entities ("3 windows open")
- **Action buttons**: perform-action, navigate, more-info, toggle, url, dismiss, with optional tap-twice confirm
- **Dismiss** with the X or a swipe; **snooze** with your own options and labels
- Dismissed and snoozed alerts **come back when something new happens**
- **Home Assistant persistent notifications**, dismissed in HA itself
- **Matches your theme**: notifications are drawn as regular Home Assistant cards, so card themes like Frosted Glass apply
- Long messages can **scroll** instead of being cut off; one tap opens the stack and shows the full text
- Header layout (alignment, padding, count and snoozed-chip positions), width, max heights, custom CSS

## Installation

### Manual

1. Copy `notification-stack-card.js` to `/config/www/`.
2. Add a dashboard resource: **Settings → Dashboards → ⋮ → Resources → Add resource**
   - URL: `/local/notification-stack-card.js?v=0.6.2`
   - Type: JavaScript module
3. Reload the browser. Bump the `?v=` number after every update.

### HACS

Not yet available while the repository is private.

## Quick start

```yaml
type: custom:notification-stack-card
title: Notifications
persistent_notifications: true
alerts:
  - id: front_door
    entity: lock.front_door
    state: [unlocked, jammed]
    severity: critical
    title: Front door
    message: "{state} · {since}"
    actions:
      - name: Lock
        icon: mdi:lock
        confirm: true
        tap_action:
          action: perform-action
          perform_action: lock.lock
          target:
            entity_id: lock.front_door
```

Everything can also be set up in the visual editor.

## Card options

| Option | Default | Description |
|---|---|---|
| `title` | – | Header text |
| `when_empty` | `hide` | `hide` (takes no space), `reserve` (invisible, keeps the collapsed card's last height on this layout, or `collapsed_height` before it has been seen, so the layout doesn't move) or `show` (shows `empty_text`) |
| `show_header` | `true` | Show the header. When off, Clear, Show less and the snoozed chip sit under the stack |
| `header_align` | `left` | `left`, `center` or `right` |
| `header_padding_left` / `header_padding_right` | `4` | Header side padding (px) |
| `count_position` | `right` | Count badge `right` or `left` of the title, or `hidden` |
| `snoozed_position` | `buttons` | Snoozed chip `buttons`, `before_title`, `after_title` or `hidden` |
| `card_style` | `theme` | `theme`: each notification is a normal Home Assistant card, styled by your theme (Frosted Glass and other card themes apply). `glass`: the card's own built-in look |
| `width` | fill | e.g. `360px` or `90%` |
| `card_align` | `left` | Card position when `width` is set |
| `collapsed_height` | none | Max height of the collapsed stack in px, peeking cards included. Peeks tighten first, then fewer cards peek, then the top card fades out at the bottom |
| `compact` | `false` | While collapsed, hide buttons so the stack stays short. They appear when the stack opens, or with a first tap on a single card |
| `height` | none | Max height of the expanded list; it scrolls past this |
| `max_peek` | `2` | Cards peeking behind the top card |
| `peek_offset` | `10` | Pixels each peeking card shows |
| `message_lines` | `2` | Message lines shown before the rest is cut off (tap to show all) |
| `message_overflow` | `truncate` | `truncate` (ends with …) or `scroll` (longer text scrolls slowly up and back) |
| `auto_collapse` | `0` | Seconds before the expanded list folds back (0 = never) |
| `sort` | `severity` | `severity` (then newest) or `time` |
| `show_time` | `true` | Relative time on each card |
| `group_label` | `name` | How each card shows its group: `name`, `dot` (color dot only) or `none` |
| `title_font_size` / `message_font_size` | `14` / `13` | Notification title and message text size (px) |
| `group_font_size` | `10.5` | Group name size (px) |
| `header_font_size` | `15` | Card header title size (px) |
| `group_stacks` | `true` | Fold each group with 2+ alerts into a sub-stack in the expanded list |
| `show_groups` | all | Only show these group IDs |
| `show_ungrouped` | `true` | With `show_groups` set, also show alerts that have no group |
| `zone_person` | viewer | Person used for zones when the viewer has no person (e.g. a wall tablet) |
| `persistent_notifications` | `false` | Include Home Assistant notifications |
| `persistent_severity` / `persistent_icon` / `persistent_group` | – | Styling for those notifications |
| `snooze` | `true` | Allow snoozing |
| `snooze_display` | `icon` | `icon` (next to the X) or `button` (with the actions) |
| `snooze_label` | `Snooze` | Text on the snooze button |
| `snooze_options` | 5 min, 30 min, until tomorrow | See below |
| `template_name` | – | Share this card's groups, alerts and snooze options under this name |
| `templates` | – | Templates to reuse, as `dashboard/name` |
| `groups` | – | See below |
| `alerts` | – | See below |
| `empty_text` | `All clear` | Text for `when_empty: show` |
| `storage_key` | `default` | Separate dismiss/snooze memory for another copy of the card |
| `styles` | – | Extra CSS inside the card |

### Snooze options

```yaml
snooze_options:
  - label: 5 minutes
    minutes: 5
  - label: 2 hours
    hours: 2
  - label: Until 8am
    until: "08:00"      # next time it is 08:00
  - label: Until tomorrow
    until: tomorrow     # midnight
```

### Groups

Groups give alerts shared defaults. Anything set on the alert wins.

```yaml
groups:
  - id: home
    name: Home               # small label on each card and sub-stack heading
    color: [76, 175, 80]     # [r, g, b] or any CSS color
    icon: mdi:home
    severity: info
    show_name: true
    stack: true              # fold into a sub-stack in the expanded list
    dismissible: true
    snoozable: true
    tap_action:
      action: more-info
    actions: []              # default buttons
    snooze_options: []       # override the card's snooze options
    conditions: []           # only show when these pass
    quiet_hours:
      start: "23:00"
      end: "07:00"
      allow_critical: true   # critical alerts still show (default)
    zones: [zone.home]       # only show while the person is in one of these
    zone_mode: inside        # or outside: only while away from all of them
    zone_person: person.jane # default: whoever is viewing
```

**Zones** follow the person linked to whoever is logged in. A device without a person (a wall tablet user, for example) uses the group's `zone_person`, then the card's `zone_person`. With no person at all, the group shows rather than hiding silently.

**Quiet hours** use the viewing device's clock and can cross midnight.

### Alerts

| Option | Description |
|---|---|
| `id` | Stable ID; keeps dismiss/snooze memory when alerts are reordered |
| `entity` / `entities` | One entity, or a list of entity IDs or `{entity, name, icon}` |
| `group` | Group ID to inherit from |
| `state` / `state_not` | Value or list. With no match fields at all, the alert matches `on` |
| `above` / `below` | Numeric match |
| `attribute` | Match an attribute instead of the state |
| `conditions` | Extra checks that must all pass: `[{entity, state, state_not, above, below, attribute}]` |
| `severity` | `critical`, `warning` or `info` (sort order and color) |
| `color`, `icon` | Override the group or severity look |
| `title`, `message` | Text with placeholders |
| `combine` | One notification for all matching entities |
| `combined_title`, `combined_message` | Text used when 2 or more entities match |
| `dismissible`, `snoozable` | Default `true`; snoozable follows dismissible |
| `tap_action` | Action when the expanded card is tapped (default: show the full message) |
| `actions` | Buttons: `{name, icon, tap_action, confirm, confirm_text, dismiss}` |

**Placeholders:** `{name}` `{state}` (translated) `{value}` (raw) `{since}` `{attr:key}`, plus `{count}` and `{names}` on combined alerts.

## Templates

Give one card a `template_name` and it shares its groups, alerts and snooze options. Any other card, on any dashboard, can reuse it:

```yaml
type: custom:notification-stack-card
templates:
  - dashboard-home/main    # dashboard URL / template name
show_groups: [security]
collapsed_height: 120
```

- Each card keeps its own layout, header, filter and dismiss/snooze memory.
- A card can use several templates and still add its own groups and alerts. Its own win when IDs match.
- Saving the source dashboard updates every card that uses the template, with no reload needed.
- The default dashboard is `lovelace`. A bare name (`main`) means the same dashboard.
- Templates are one level deep: a shared card's own `templates` are not passed on.
- The viewing user must be able to open the dashboard the template lives on.

## How dismiss and snooze work

Both are remembered per device in the browser. An alert stays hidden while nothing new happens. It comes back when an entity changes state again or, for a combined alert, when a new entity starts matching. Snoozes also end at their time. Dismissing a Home Assistant notification removes it in Home Assistant for everyone.

## Theming

With `card_style: theme` (the default) each notification uses your theme's card styling. The colors for severities and chips, and the built-in look (`card_style: glass`), use these CSS variables, which `styles` can override:

`--nsc-critical` `--nsc-warning` `--nsc-info` `--nsc-bg` `--nsc-radius` `--nsc-blur` `--nsc-border` `--nsc-shadow` `--nsc-duration`

```yaml
styles: |
  :host { --nsc-radius: 24px; --nsc-critical: #e53935; }
```
