# Changelog

## 0.7.0 — 2026-11-01

- **`scroll_direction`**: with `message_overflow: scroll`, choose `vertical` (up through the lines, as before) or `horizontal`, which keeps each message on one line and scrolls it right to left like a ticker, looping seamlessly. Set it in the editor under Size and layout once Longer messages is set to Scroll. With reduced motion turned on, horizontal messages stay still.

## 0.6.3 — 2026-10-31

- **Fix**: the stack could show on top of pop-ups and dialogs (Bubble Card pop-ups, for example). Its layering now stays inside the card.
- **Folds back on its own**: an opened stack, snooze choices or a tapped-open card fold back when you tap anywhere outside the card or a pop-up opens.
- **Snooze row**: the ✕ now sits at the right end of the snooze options, and the row uses the card's full width so the default three options fit on one line.

## 0.6.2 — 2026-10-31

- **Fix**: tapping snooze on a collapsed stack only gave haptic feedback. It now opens the stack (or folded sub-stack) with the snooze options showing. With `compact`, a single card shows its snooze options in place.

## 0.6.1 — 2026-10-31

- **Fix**: `when_empty: reserve` could keep far more space than the card used. Two copies of the card with the same `storage_key` shared one height memory, so a taller layout overwrote a shorter one, and a single card showing its buttons could set the height. Heights are now remembered per layout, ignore cards that were tapped open, and fall back to `collapsed_height` before a height has been seen.

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
