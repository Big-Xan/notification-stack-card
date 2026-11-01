# Changelog

## 0.6.0 — 2026-10-31

- **`compact`**: while collapsed, buttons stay hidden so the stack can be very short (a 75px stack fits comfortably). They show when the stack opens; a single card shows them on the first tap, and its tap action runs on the next.

## 0.5.0 — 2026-10-31

- **Text sizes**: `title_font_size`, `message_font_size`, `group_font_size` and `header_font_size`, in a new Text section of the editor.
- **`group_label`**: show the group `name` on each card, only a color `dot`, or `none`. The icon keeps the group color either way.

## 0.4.0 — 2026-10-31

- **Matches your theme**: notifications are now drawn as regular Home Assistant cards, so card themes like Frosted Glass style them like your other cards. `card_style: glass` keeps the previous built-in look.
- **Scrolling messages**: `message_overflow: scroll` slowly scrolls text that's longer than `message_lines` up and back instead of cutting it off. Respects reduced-motion settings.
- **One tap shows everything**: tapping a collapsed card whose message is cut off now opens the stack and shows the full message at once. Folding a sub-stack resets its cards.

## 0.3.0 — 2026-10-31

- **Templates**: `template_name` shares a card's groups, alerts and snooze options; `templates` reuses them on any dashboard. Each card keeps its own layout and can add its own alerts. Cards update when the source dashboard is saved. The editor lists available templates.
- **Sub-stacks**: in the expanded list, each group with 2+ alerts folds into its own small stack; tap to open it, chevron to fold it. `group_stacks` turns this off for the card, `stack: false` for one group.
- **Quiet hours** per group (`quiet_hours: {start, end}`). Critical alerts still show unless `allow_critical: false`.
- **Zones** per group (`zones`, `zone_mode: inside | outside`), following the viewer's person, with `zone_person` overrides on the group or card.
- **Group filter**: `show_groups` and `show_ungrouped`.
- **`collapsed_height`**: max height of the collapsed stack including peeking cards. Peeks tighten, then fewer cards peek, then the top card fades out at the bottom.
- **`when_empty`**: `hide`, `reserve` (invisible but keeps its height) or `show`. Replaces `hide_when_empty`, which still works.
- **`count_position`**: right or left of the title, or hidden.
- **`snoozed_position`**: with the buttons, before or after the title, or hidden. Replaces `show_snoozed`, which still works.
- Editor: new Templates section, "Groups and zones" section, quiet hours and zones on each group, and each empty mode explained.

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
