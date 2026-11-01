# Changelog

## 0.2.0 — 2026-10-31

- Visual editor for every option, including groups, alerts, entities, buttons and snooze options. Values left at their defaults are kept out of the YAML.
- Groups: shared color, icon, severity, dismiss/snooze behaviour, tap action, buttons, conditions and snooze options, with an optional group label on each card. Home Assistant notifications can be assigned to a group.
- `combine`: one notification for several matching entities, with `{count}` and `{names}` and optional `combined_title` / `combined_message`.
- Snooze with configurable options (duration, time of day, until tomorrow) and labels. Shown as an icon or a button. Header chip shows the snoozed count and unsnoozes all.
- Header: `show_header`, `header_align`, `header_padding_left` / `header_padding_right`. With the header hidden, the controls move below the stack.
- Size: `width`, `height` (max height of the expanded list, scrolls), `card_align`.
- Dismissals now track every matching entity, so a dismissed combined alert stays hidden when one entity clears and returns when a new one matches.

## 0.1.0 — 2026-10-31

- First version: rules from entity states, stack that expands on tap, action buttons with confirm, dismiss by X or swipe, Home Assistant persistent notifications, auto-collapse.
