
# Notification Stack Card

**Navigation**

- **Get started:** [Features](#features) · [Installation](#installation) · [Quick start](#quick-start) · [Visual editor](#visual-editor)
- **Configuration:** [Card options](#card-options) · [Snooze options](#snooze-options) · [Groups](#groups) · [Alerts](#alerts) · [Templates](#templates)
- **More:** [Action buttons](#action-buttons) · [Dismiss & snooze behavior](#how-dismiss-and-snooze-work) · [Theming](#theming) · [Example configurations & Creative implementations](#example-configurations) · [Credits](#credits)

A lightweight, stacked, tap-to-expand notification card for Home Assistant. Alerts come from your entities (and, optionally, Home Assistant's own notifications), stack like phone notifications, and expand into a full list with action buttons, dismiss and snooze.

One self-contained JavaScript file. No dependencies. Includes a visual editor.

<img width="3072" height="2048" alt="notification-stack-card-header" src="https://github.com/user-attachments/assets/701483b6-ee74-4904-9fc2-a38779eb8efd" />


## Features

- **Stack that expands on tap**, with the most severe and newest alert on top and up to five cards peeking behind
- **Rules from entity states**: `state`, `state_not`, `above`, `below`, `attribute`, plus extra `conditions`
- **Groups**: shared color, icon, severity, buttons, tap action and snooze options, plus **quiet hours**, **zones** and **sub-stacks**
- **Templates**: share one card's groups and alerts and reuse them on any dashboard, while each card keeps its own layout
- **Combine**: one notification for several matching entities ("3 windows open")
- **Action buttons**: perform-action, navigate, more-info, toggle, url, dismiss, with optional tap-twice confirm
- **Buttons dismiss only after the action goes through**: with `dismiss: true`, a service action has to succeed first. If Home Assistant reports an error, the notification stays and you can try again
- **Dismiss** with the X or a swipe; **snooze** with your own options and labels
- Dismissed and snoozed alerts **come back when something new happens**
- **Home Assistant persistent notifications**, dismissed in HA itself
- **Matches your theme**: notifications are drawn as regular Home Assistant cards, so card themes like Frosted Glass apply
- Long messages can **scroll** instead of being cut off; one tap opens the stack and shows the full text
- Header layout (alignment, padding, count and snoozed-chip positions), width, max heights, custom CSS
- **In the card picker**: pick a lock or a leak, smoke, door or window sensor under *By entity* and a ready-made notification card is offered

<img width="3072" height="1440" alt="features-gallery" src="https://github.com/user-attachments/assets/e05bf724-56bd-4988-acee-e53a01e284f3" />


## Installation

### Marketplace (Home Assistant 2026.11 and later, recommended)

1. Go to **Settings → Marketplace** and select **Add from link** in the upper-right corner.
2. Enter `https://github.com/Big-Xan/notification-stack-card` and select **Add**. If asked for a type, choose **Dashboards**. Adding a link needs a GitHub connection; the Marketplace asks for one if you haven't connected it yet.
3. Open **Notification Stack Card**, select **Install**, and reload the browser.

The Marketplace adds the dashboard resource for you and offers new versions under **Settings → Updates**, so there's nothing to bump. If you manage dashboard resources in YAML, the install dialog shows the line to add instead.

Already installed through HACS? Nothing to do: when Home Assistant updates to 2026.11, the card and its updates move to the Marketplace.

### HACS (before Home Assistant 2026.11)

1. In HACS, open the ⋮ menu → **Custom repositories**.
2. Add `https://github.com/Big-Xan/notification-stack-card` with type **Dashboard**.
3. Install **Notification Stack Card** and reload the browser.

HACS adds the dashboard resource for you and updates its version on every update, so there's nothing to bump.

### Manual

1. Download `notification-stack-card.js` from the [latest release](https://github.com/Big-Xan/notification-stack-card/releases/latest) and copy it to `/config/www/`.
2. Add a dashboard resource: **Settings → Dashboards → ⋮ → Resources → Add resource**
   - URL: `/local/notification-stack-card.js?v=0.9.3`
   - Type: JavaScript module
3. Reload the browser. Bump the `?v=` number after every update.

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

Everything can also be set up in the [visual editor](#visual-editor).

## Visual editor

Set up the card without writing YAML. The visual editor covers layout, appearance, notification behavior, groups, alerts, and snoozing. These are **actual editor screenshots**, arranged by the settings they show; select any screenshot to view it at full resolution.

<table>
  <tr>
    <th width="50%">1. Card configuration and layout</th>
    <th width="50%">2. Text, colors, groups and templates</th>
  </tr>
  <tr>
    <td align="center" valign="top">
      <a href="https://github.com/user-attachments/assets/52f84360-9920-4a17-9488-871bc016b053"><img src="https://github.com/user-attachments/assets/52f84360-9920-4a17-9488-871bc016b053" alt="Visual editor: card title, empty state, header alignment, card sizing, peeking and sort order" width="355" /></a>
      <p><sub>Title, empty state, header, dimensions, stacked preview, sorting and auto-collapse.</sub></p>
    </td>
    <td align="center" valign="top">
      <a href="https://github.com/user-attachments/assets/13b4e5bd-d8ca-422c-8774-1ebf1848ba2d"><img src="https://github.com/user-attachments/assets/13b4e5bd-d8ca-422c-8774-1ebf1848ba2d" alt="Visual editor: text settings, card styling, group filtering, zones and reusable templates" width="355" /></a>
      <p><sub>Typography, message overflow, theme colors, group filtering, zones and reusable templates.</sub></p>
    </td>
  </tr>
  <tr>
    <th>3. Snoozing, persistent notifications and advanced options</th>
    <th>4. Individual alert editor</th>
  </tr>
  <tr>
    <td align="center" valign="top">
      <a href="https://github.com/user-attachments/assets/83a27d8f-1388-474f-b032-4bc2ff5e64c0"><img src="https://github.com/user-attachments/assets/83a27d8f-1388-474f-b032-4bc2ff5e64c0" alt="Visual editor: snooze presets, Home Assistant notifications and advanced settings" width="355" /></a>
      <p><sub>Custom snooze presets, group and alert lists, Home Assistant notifications and storage settings.</sub></p>
    </td>
    <td align="center" valign="top">
      <a href="https://github.com/user-attachments/assets/074822d4-d3d1-4762-b1f3-0764a7e080df"><img src="https://github.com/user-attachments/assets/074822d4-d3d1-4762-b1f3-0764a7e080df" alt="Visual editor: alert title, message, severity, visibility rules, actions and entities" width="355" /></a>
      <p><sub>Per-alert text, severity, icon, conditions, dismiss/snooze behavior, entity matching and buttons.</sub></p>
    </td>
  </tr>
  <tr>
    <th colspan="2">5. Group editor</th>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <a href="https://github.com/user-attachments/assets/2e8be60d-a392-4f10-bb73-aeb906f13fc8"><img src="https://github.com/user-attachments/assets/2e8be60d-a392-4f10-bb73-aeb906f13fc8" alt="Visual editor: group appearance, severity, actions, quiet hours, zones and conditions" width="510" /></a>
      <p><sub>Shared appearance, behavior, quiet hours, zones, conditional visibility and snooze options.</sub></p>
    </td>
  </tr>
</table>

For the YAML equivalents, see [Card options](#card-options), [Groups](#groups), and [Alerts](#alerts).

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
| `background_color` | theme | Notification background, as `[r, g, b]` or any CSS color. Groups and alerts can set their own |
| `background_opacity` | `100` | Background opacity in %. Lower it to let the theme or glass show through |
| `text_color` | theme | Text color for the card. Titles use it as is; messages and times a softer shade. Groups and alerts can set their own |
| `width` | fill | e.g. `360px` or `90%` |
| `card_align` | `left` | Card position when `width` is set |
| `collapsed_height` | none | Max height of the collapsed stack in px, peeking cards included. Peeks tighten first, then fewer cards peek, then the top card fades out at the bottom |
| `compact` | `false` | While collapsed, hide buttons so the stack stays short. They appear when the stack opens, or with a first tap on a single card |
| `height` | none | Max height of the expanded list; it scrolls past this |
| `max_peek` | `2` | Cards peeking behind the top card |
| `peek_offset` | `10` | Pixels each peeking card shows (`0` stacks them exactly) |
| `message_lines` | `2` | Message lines shown before the rest is cut off (tap to show all) |
| `message_overflow` | `truncate` | `truncate` (ends with …) or `scroll` (longer text moves instead of being cut off) |
| `scroll_direction` | `vertical` | With `scroll`: `vertical` scrolls up through the lines and back; `horizontal` keeps each message on one line and scrolls it right to left like a ticker (`message_lines` then doesn't apply) |
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
| `storage_key` | `default` | Dismiss/snooze memory to use. Cards with the same key (including the default) share it |
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
  - label: Until I'm home
    until_zone: zone.home         # the next time the person arrives there
  - label: Unless it rains
    until_conditions:             # the next time all of these match
      - entity: binary_sensor.rain_expected
        state: "on"
```

`until_zone` follows `person` if the option sets one, else the group's or card's `zone_person`, else whoever is viewing. When nobody can be followed, the option isn't offered. `until_conditions` uses the same format as `conditions`. Both end the *next* time it happens: snooze "Until I'm home" while you're home and it waits until you leave and come back. The card notices this while it's on screen, so a trip that starts and ends while no dashboard with the card is open can be missed; the time limit or an entity change still ends the snooze. Add `minutes` or `hours` to either as a time limit; without one they end after 30 days at most. Like every snooze, they also end when the entity changes again.

A group or an alert can have its own `snooze_options`. The most specific wins: an alert's own options, then its group's, then the card's. In the editor, open **Snooze options** inside a group or alert: it shows which options apply, **Customize** copies them in to edit, and **Reset to default** removes them again.

### Groups

Groups give alerts shared defaults. Anything set on the alert wins.

```yaml
groups:
  - id: home
    name: Home               # small label on each card and sub-stack heading
    color: [76, 175, 80]     # [r, g, b] or any CSS color
    icon: mdi:home
    background_color: [27, 94, 32]   # optional, overrides the card's
    text_color: "#ffffff"            # optional, overrides the card's
    severity: info
    show_name: true
    stack: true              # fold into a sub-stack in the expanded list
    dismissible: true
    snoozable: true
    tap_action:
      action: more-info
    actions: []              # default buttons
    snooze_options: []       # its own snooze options; empty uses the card's (snoozable: false turns snoozing off)
    conditions: []           # only show when these pass (also applies to persistent notifications in this group)
    quiet_hours:
      start: "23:00"
      end: "07:00"
      allow_critical: true   # critical alerts still show (default)
    zones: [zone.home]       # only show while the person is in one of these
    zone_mode: inside        # or outside: only while away from all of them
    zone_person: person.jane # default: whoever is viewing
```

**Zones** follow the person linked to whoever is logged in. A device without a person (a wall tablet user, for example) uses the group's `zone_person`, then the card's `zone_person`. With no person at all, the group shows rather than hiding silently.

**Quiet hours** use the viewing device's clock and can cross midnight. Times are 24-hour `HH:MM`; an invalid time turns quiet hours off.

### Alerts

| Option | Description |
|---|---|
| `id` | Stable ID; keeps dismiss/snooze memory when alerts are reordered |
| `entity` / `entities` | One entity, or a list of entity IDs or `{entity, name, icon}` |
| `group` | Group ID to inherit from |
| `state` / `state_not` | Value or list (comma separated in the editor). Either the state as Home Assistant shows it (`Clear`, `Unlocked`) or its raw value (`off`, `unlocked`); not case-sensitive. With no match fields at all, the alert matches `on` |
| `above` / `below` | Numeric match |
| `attribute` | Match an attribute instead of the state. A missing attribute never matches |
| `conditions` | Extra checks that must all pass: `[{entity, state, state_not, above, below, attribute}]` |
| `severity` | `critical`, `warning` or `info` (sort order and color) |
| `color`, `icon` | Override the group or severity look |
| `background_color`, `text_color` | Override the group's or card's colors for this alert |
| `title`, `message` | Text with placeholders |
| `combine` | One notification for all matching entities |
| `combined_title`, `combined_message` | Text used when 2 or more entities match |
| `dismissible`, `snoozable` | Default `true`; snoozable follows dismissible |
| `tap_action` | Action when the expanded card is tapped (default: show the full message) |
| `actions` | Buttons: `{name, icon, tap_action, confirm, confirm_text, dismiss}`. See [Action buttons](#action-buttons) |
| `snooze_options` | This alert's own snooze options, used instead of its group's or the card's |

**Placeholders:** `{name}` (the entity's name as Home Assistant shows it) `{state}` (translated) `{value}` (raw) `{since}` `{attr:key}`, plus `{count}` and `{names}` on combined alerts.

## Templates

Give one card a `template_name` and it shares its groups, alerts and snooze options. Any other card, on any dashboard, can reuse it:

```yaml
type: custom:notification-stack-card
templates:
  - dashboard-home/main    # dashboard URL / template name
show_groups: [security]
collapsed_height: 120
```

- Each card keeps its own layout, header and filter. Dismiss/snooze memory follows `storage_key`, so cards sharing a key share it.
- A card can use several templates and still add its own groups and alerts. Its own win when IDs match; between templates, the later one in the list wins.
- Saving the source dashboard updates every card that uses the template, with no reload needed.
- The default dashboard is `lovelace`. A bare name (`main`) means the same dashboard.
- Templates are one level deep: a shared card's own `templates` are not passed on.
- The viewing user must be able to open the dashboard the template lives on.

## Action buttons

Each button runs its `tap_action`. With `confirm: true` the first tap asks and the second runs it.

With `dismiss: true` the notification is dismissed after the action:

- **Service actions** (`perform-action`, `toggle`): the card waits for Home Assistant to finish the request. The button shows it's busy meanwhile, however long that takes (a script keeps it busy while it runs), and can't be tapped twice. If Home Assistant reports an error, the notification stays, the button shows *Failed* for a moment and Home Assistant shows the error, so you can try again.
- **Other actions** (`navigate`, `more-info`, `url`, or a button with no action): the notification is dismissed as soon as the action opens. If the action can't run (a refused link, `navigate` without a path), the notification stays and the button shows *Failed*.

A finished request means Home Assistant accepted and ran it. Whether the device actually got there (the lock locked, the vacuum docked) shows in the entity's state, which the alert keeps following: an alert for an unlocked door goes away by itself once the lock reports locked.

## How dismiss and snooze work

Both are remembered per device in the browser, under the card's `storage_key`. An alert stays hidden while nothing new happens. It comes back when:

- an entity changes state again,
- for a combined alert, a new entity starts matching, or
- its `conditions` (or its group's) turn off and on again. For example, a window alert that only shows while armed comes back the next time you arm, if the window is still open.

A change to an attribute alone (a battery level dropping further, say) doesn't count as new, since the entity's state hasn't changed.

Quiet hours, zones and `show_groups` only hide an alert, so a dismissed alert stays dismissed through them, unless one of the changes above happens while it's hidden. Snoozes also end at their time.

Cards with the same `storage_key` share this memory: dismissing or snoozing on one updates the others straight away, including in other tabs of the same browser. Each card only ends dismissals for its own alerts, so cards with different alerts can share a key. Combined alerts are told apart by their entities too, so two with the same `id` but different entities don't share memory.

Dismissing a Home Assistant notification removes it in Home Assistant for everyone. If Home Assistant can't remove it, it shows again. **Clear** works the same way for each notification.

## Theming

With `card_style: theme` (the default) each notification uses your theme's card styling, and `background_color` / `text_color` paint over it where you set them (a `background_opacity` below 100 keeps the theme visible underneath). The colors for severities and chips, and the built-in look (`card_style: glass`), use these CSS variables, which `styles` can override:

`--nsc-critical` `--nsc-warning` `--nsc-info` `--nsc-bg` `--nsc-radius` `--nsc-blur` `--nsc-border` `--nsc-shadow` `--nsc-duration`

```yaml
styles: |
  :host { --nsc-radius: 24px; --nsc-critical: #e53935; }
```

## Example configurations

Copy what you need into one card. Replace the entity IDs with your own; integrations name their entities after your devices, so yours will differ. Alert snippets all go in the card's `alerts:` list. A complete card is in [`examples/full.yaml`](examples/full.yaml), and a wall-tablet card that reuses it in [`examples/tablet.yaml`](examples/tablet.yaml).

### Example groups

```yaml
groups:
  - id: security
    name: Security
    icon: mdi:shield-home-outline
  - id: water
    name: Leaks
    color: [33, 150, 243]
    icon: mdi:water-alert
    severity: critical       # sorted first, red
    dismissible: false       # stays until the sensor is dry
    tap_action:
      action: more-info
  - id: vacuum
    name: Vacuum
    color: [0, 150, 136]
    icon: mdi:robot-vacuum-alert
    severity: warning
  - id: deliveries
    name: Deliveries
    color: [255, 167, 38]
    icon: mdi:package-variant-closed
    zones: [zone.home]       # only while you're home
  - id: plants
    name: Plants
    color: [76, 175, 80]
    icon: mdi:sprout
    quiet_hours:
      start: "21:00"
      end: "08:00"
  - id: system
    name: Home Assistant
    color: [149, 117, 205]

persistent_notifications: true
persistent_group: system     # Home Assistant's own notifications join this group
```

### Unlocked door

```yaml
alerts:
  - id: front_door_lock
    group: security
    entity: lock.front_door
    state: [unlocked, unlocking, open, opening, jammed]
    severity: critical
    icon: mdi:lock-open-variant
    title: Front door
    message: "{state} · {since}"
    actions:
      - name: Lock
        icon: mdi:lock
        confirm: true          # tap twice so it can't fire by accident
        tap_action:
          action: perform-action
          perform_action: lock.lock
          target:
            entity_id: lock.front_door
```

### Leaks

One alert covers every leak sensor. Each wet sensor gets its own notification, with the name you give it.

```yaml
  - id: leaks
    group: water
    entities:
      - entity: binary_sensor.kitchen_sink_leak
        name: Kitchen sink
      - entity: binary_sensor.bathroom_leak
        name: Bathroom
      - entity: binary_sensor.water_heater_leak
        name: Water heater
    title: "Leak: {name}"
    message: "Water detected {since}"
```

### Open windows and doors

`combine` folds every open window into one notification ("3 windows open"). `conditions` limits it to when it matters, here while away mode is on.

```yaml
  - id: windows_away
    group: security
    entities:
      - entity: binary_sensor.living_room_window
        name: Living room
      - entity: binary_sensor.kitchen_window
        name: Kitchen
      - entity: binary_sensor.bedroom_window
        name: Bedroom
    combine: true
    conditions:
      - entity: input_boolean.away_mode
        state: "on"
    severity: warning
    icon: mdi:window-open-variant
    title: "{name} window open"
    message: "Open {since}"
    combined_title: "{count} windows open"
    combined_message: "{names}"

  - id: back_door_open
    group: security
    entity: binary_sensor.back_door
    icon: mdi:door-open
    title: Back door open
    message: "Opened {since}"
```

### Vacuum

Vacuum integrations report problems differently. Roborock has error sensors that read `none` and `ok` when all is well; most others set the vacuum's own state to `error`.

```yaml
  - id: vacuum_error
    group: vacuum
    entity: sensor.robot_vacuum_vacuum_error     # Roborock
    state_not: none
    title: Vacuum needs help
    message: "{state}"
    actions:
      - name: Dock
        icon: mdi:home-import-outline
        dismiss: true
        tap_action:
          action: perform-action
          perform_action: vacuum.return_to_base
          target:
            entity_id: vacuum.robot_vacuum

  - id: dock_error
    group: vacuum
    entity: sensor.robot_vacuum_dock_dock_error  # Roborock dock
    state_not: ok
    title: Dock needs attention
    message: "{state}"

  - id: vacuum_stuck
    group: vacuum
    entity: vacuum.robot_vacuum                  # any vacuum
    state: error
    title: Vacuum stopped
    message: "Since {since}"
```

### Mail and packages

These use [Mail and Packages](https://github.com/moralmunky/Home-Assistant-Mail-And-Packages) sensors, which count items. Check the entity IDs on your install; they depend on how the integration was set up.

```yaml
  - id: mail
    group: deliveries
    entity: sensor.mail_usps_mail
    above: 0
    icon: mdi:email-outline
    title: Mail today
    message: "{value} piece(s) from USPS"

  - id: packages
    group: deliveries
    entities:
      - entity: sensor.mail_usps_delivering
        name: USPS
      - entity: sensor.mail_ups_delivering
        name: UPS
      - entity: sensor.mail_fedex_delivering
        name: FedEx
    above: 0
    combine: true
    icon: mdi:truck-delivery-outline
    title: "{name} package arriving"
    message: "{value} out for delivery"
    combined_title: Packages arriving
    combined_message: "Out for delivery: {names}"
```

### Plant care with Adaptive Plant

[Adaptive Plant](https://github.com/Big-Xan/adaptive_plant) schedules watering, fertilizing and health check-ins for each plant. To show one notification for everything due today, add a template sensor helper (**Settings → Devices & services → Helpers → Create helper → Template → Template sensor**) named `Plant tasks today` with this state template:

```jinja
{% set t = now().date() | string %}
{% set ns = namespace(n=0) %}
{% for e in integration_entities('adaptive_plant') | select('search', '_next_(watering|fertilization)$') %}
  {% set s = states(e) %}
  {% if s not in ['unknown', 'unavailable', ''] and s <= t %}
    {% set ns.n = ns.n + 1 %}
  {% endif %}
{% endfor %}
{% for e in integration_entities('adaptive_plant') | select('match', 'select\..*_health$') %}
  {% if state_attr(e, 'health_check_in_overdue') %}
    {% set ns.n = ns.n + 1 %}
  {% endif %}
{% endfor %}
{{ ns.n }}
```

Then point an alert at it, with a button to the view that holds your Adaptive Plant card:

```yaml
  - id: plant_tasks
    group: plants
    entity: sensor.plant_tasks_today
    above: 0
    title: Plant care
    message: "{value} task(s) due today"
    actions:
      - name: Plants
        icon: mdi:flower
        tap_action:
          action: navigate
          navigation_path: /dashboard-home/plants
```

### Smarter snoozes

Snoozes can end on what happens next instead of after a set time.

**Windows open: hide it unless rain is coming.** Make a sensor for "rain expected in the next few hours" once (it needs a weather integration with hourly forecasts; set `hours` and `chance` to taste), then snooze the window alert until it turns on:

```yaml
# configuration.yaml
template:
  - triggers:
      - trigger: time_pattern
        minutes: /30
      - trigger: homeassistant
        event: start
    actions:
      - action: weather.get_forecasts
        target:
          entity_id: weather.home
        data:
          type: hourly
        response_variable: forecast
    binary_sensor:
      - name: Rain expected
        unique_id: rain_expected
        state: >
          {% set hours = 6 %}
          {% set chance = 50 %}
          {{ forecast['weather.home'].forecast[:hours]
             | selectattr('precipitation_probability', 'defined')
             | selectattr('precipitation_probability', 'ge', chance)
             | list | count > 0 }}
```

```yaml
  - id: windows_open
    group: home
    entities: [binary_sensor.living_room_window, binary_sensor.bedroom_window]
    combine: true
    combined_title: "{count} windows open"
    combined_message: "{names}"
    snooze_options:
      - label: Unless it rains
        until_conditions:
          - entity: binary_sensor.rain_expected
            state: "on"
      - label: 2 hours
        hours: 2
```

**A package at the door: remind me when I'm home.** On your phone at work, snooze it until you get back:

```yaml
  - id: package
    group: home
    entity: binary_sensor.porch_package
    title: Package at the door
    snooze_options:
      - label: Until I'm home
        until_zone: zone.home
      - label: 1 hour
        hours: 1
```

**Someone else's reminder.** On a shared wall tablet, follow one person instead of the viewer, with a time limit as a backstop:

```yaml
    snooze_options:
      - label: Until they're home
        until_zone: zone.home
        person: person.your_name
        hours: 12
```

**This evening, at home.** Conditions combine: here the snooze ends once you're home *and* it's evening, using a Times of the Day helper:

```yaml
    snooze_options:
      - label: This evening at home
        until_conditions:
          - entity: person.your_name
            state: home
          - entity: binary_sensor.evening   # Times of the Day helper, 17:00–23:00
            state: "on"
```

### A short card for a busy dashboard

A collapsed stack about 70px tall, with buttons tucked away until it opens and long messages scrolling instead of being cut off. Add `scroll_direction: horizontal` to scroll them sideways instead:

```yaml
type: custom:notification-stack-card
# ...your groups and alerts, plus:
show_header: false
compact: true
collapsed_height: 70
peek_offset: 6
message_lines: 1
message_overflow: scroll
title_font_size: 13
message_font_size: 12
group_label: none
count_position: hidden
snoozed_position: hidden
when_empty: reserve
auto_collapse: 30
```

## Credits

Built and maintained by [Big-Xan](https://github.com/Big-Xan), with development help from Claude Opus (Anthropic). Claude also helped move the project over from an earlier private repository: the version-by-version commits from v0.2.0 to v0.6.3 were carried across on the day this repo went public, which is why they share a date.

If you like this card, you might also like [Adaptive Plant](https://github.com/Big-Xan/adaptive_plant), a plant-care integration for Home Assistant.

If this card makes your dashboard better, you can support its development on Ko-fi. It's entirely optional; the card stays free.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/bigxan)
