# Changelog

## 0.9.1 — 2026-11-04

A reliability and editor release. No options were renamed and existing configs keep working.

**New**

- **Buttons dismiss only after the action goes through.** With `dismiss: true`, a service action (`perform-action`, `toggle`) has to succeed before the notification is dismissed. If Home Assistant reports an error, the notification stays and the button shows *Failed* for a moment. While the request runs, the button shows it's busy and can't be tapped twice (a double-tapped `toggle` used to switch back). Navigate, more-info, url and dismiss-only buttons still dismiss right away.
- **Snoozes that end on what happens next.** A snooze option can end when someone arrives in a zone (`until_zone`, "Until I'm home") or when conditions match (`until_conditions`, "Unless it rains"), with an optional time limit. See *Smarter snoozes* in the README for examples.
- **Snooze options per group and per alert, in the editor.** Each group and alert has a collapsed **Snooze options** section that lists the options in use. **Customize** copies them in so you can edit them, and **Reset to default** goes back. An alert's own options win over its group's, which win over the card's.
- **Card picker**: when you add a card by picking an entity, locks and leak, smoke, gas, carbon monoxide, safety, door, window, garage door, opening and problem sensors offer a ready-made Notification Stack Card. Other entities get no suggestion. The picker also links to the documentation.
- **States match as shown or raw, regardless of case**: `Clear`, `clear` and `off` all match a sensor Home Assistant shows as "Clear".
- **`{name}`** uses Home Assistant's own entity name, falling back to `friendly_name`, so it keeps working as `friendly_name` is phased out from 2026.11.

**Fixes**

- Dismissing alerts that come from a template didn't last: they came back on the next page load.
- Quiet hours and zones no longer undo a dismissal. Conditions turning off and on still bring an alert back, now documented.
- A Home Assistant notification that failed to dismiss stayed hidden until a reload; it now comes back. **Clear** reports how many couldn't be cleared.
- Group `conditions` now apply to persistent notifications shown in that group.
- Removing a template while it was still loading could bring its alerts back. When two templates use the same alert ID, the later one wins (the card's own alerts still win over both).
- In the visual editor, a comma typed into **State** or **State not** disappeared straight away.
- An attribute the entity doesn't have no longer matches `state_not`, and an empty value no longer counts as `0` for `above`/`below`.
- An alert with an empty snooze list now falls back to its group's options instead of the card's.
- `peek_offset: 0` was treated as 10, and quiet hours with an impossible time (such as `25:90`) are ignored.
- Custom CSS is applied only as CSS, and `url` buttons won't open `javascript:` links.
- Zones notice a person linked to your user without a reload. Turning off persistent notifications stops listening for them. Icon-only buttons are announced to screen readers. Home Assistant's own error message is no longer replaced by a vaguer one from the card.
- The Longer messages helper describes both scroll directions.

## 0.7.0 — 2026-11-01

- **`scroll_direction`**: with `message_overflow: scroll`, choose `vertical` (up through the lines, as before) or `horizontal`, which keeps each message on one line and scrolls it right to left like a ticker. It loops seamlessly with a short pause each time the text comes back around. Set it in the editor under Text once Longer messages is set to Scroll. With reduced motion turned on, horizontal messages stay still.
- **Colors**: `background_color`, `background_opacity` and `text_color` on the card, in a new Colors and styling section of the editor. Groups and alerts can set their own `background_color` and `text_color`. The severity tint still shows on top.
- **Editor**: message lines, longer messages, scroll direction and show time moved to the Text section; Custom CSS moved to Colors and styling, marked (Advanced).
- **Fix**: scrolling messages no longer restart every minute when the card's time label changes; after any redraw they carry on from where they were.
- **Fix**: when the only alerts showing belong to one group, opening the stack lists them right away instead of showing a folded sub-stack first.
- **Fix**: snoozing a single card could leave the empty space as tall as the card with its snooze options open (`when_empty: reserve`). The remembered height is now learned only from a closed stack, and heights remembered by earlier versions are discarded once.
- **Fix**: a card in a hidden view or closed pop-up could remember a near-zero height or stay collapsed when shown again; it now measures once visible. The editor preview no longer overwrites the dashboard card's remembered height.
- **Fix**: snooze options or a pending confirm close with their alert, and a card tapped open on its own folds back when a second alert arrives.

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
