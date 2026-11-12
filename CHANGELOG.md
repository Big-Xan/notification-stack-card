# Changelog

## 0.9.4 — 2026-11-07

New layout options and Home Assistant templates. Existing configs keep working unchanged.

**New**

- **`keep_expanded`**: show every notification without stacking. `always`, or `wide` to do it only while the card is at least `keep_expanded_width` wide (800px by default), so a desktop or tablet shows the full list and a phone keeps the stack. Kept expanded, nothing folds the list back (a tap elsewhere, a pop-up opening or `auto_collapse`), and **Show less** is hidden. Group sub-stacks still fold (tap one to open it) unless `group_stacks: false`. With `height` set, a long list scrolls. ([#1](https://github.com/Big-Xan/notification-stack-card/issues/1))
- **`layout: horizontal`**: the expanded list sits side by side in a row that scrolls sideways, for wide wall tablets. `item_width` sets each notification's width (300px by default, 160px at least), and `expand_to: left` opens the row leftward from the right edge instead of rightward (right and left are the same in right-to-left languages). The closed stack and folded groups peek out toward the side the row opens, so you can see which way it goes. Open groups get their heading across their columns. Side by side, you swipe a notification up or down to dismiss it, since a sideways swipe scrolls the row, and a mouse wheel scrolls the row too. With `height` set, up and down scrolls the list instead and the X dismisses, so a tall notification or open group is always reachable by touch.
- **Home Assistant templates (Jinja) in titles and messages** ([#2](https://github.com/Big-Xan/notification-stack-card/issues/2)). Text with `{{ }}`, `{% %}` or `{# #}` is rendered by Home Assistant and updates by itself. Templates get the alert's `entity`, `entities`, `name`, `names` and `count`. Text without them works as before and is never sent to Home Assistant.
- All three are in the visual editor under **Size and layout** and in the alert's title and message help.

**Fixes**

- **A long card title no longer runs under the header buttons** (the snoozed count, **Clear**, **Show less**). It now ends with … before them, in every header alignment.
- **Opening a group no longer leaves empty space at the bottom of its notifications.** Each card was measured with the group name still showing, and the name is hidden once the group's heading is above it. They were the height of one extra line until the card next redrew.
- **X or a swipe no longer dismisses an alert that came back while the card slid out**, or while you were still holding the swipe. If its conditions (or its group's) turned off and on in that moment, it's a new alert and now stays, as it already did for buttons. This also covers Home Assistant notifications, which are no longer dismissed in Home Assistant in that case.
- **A dismissal that finishes late no longer undoes a newer one.** If the alert changed while an X slid out or a button's request ran, it now stays as the new alert, and a dismissal of that new alert from another card on the same `storage_key` is kept, also when the card with the button left the screen before it finished. Before, the old dismissal overwrote it and the alert came back on both cards.
- **A card with `when_empty: hide` keeps showing new persistent notifications after it hides itself.** Home Assistant takes a hidden card off the page, and the card stopped listening for notifications there, so new ones, and snoozed ones coming back (when the snooze ran out or Home Assistant sent them again), only showed after a reload.
- **Dismissing or snoozing in one browser tab is no longer undone by another tab.** A tab left in the background (Home Assistant pauses its connection after a while) could see the newer dismissal as ended and remove it on every tab. It now waits for current states first.
- **A dismissal that finishes late records the alert as it is then.** If an entity stopped matching a combined alert while the X or a swipe slid it out, or while a button's action ran, the alert now comes back when that entity matches again, as it would have after a tap at that moment.
- **A card coming back on screen catches up.** A card in another view or a closed pop-up showed alerts you had meanwhile dismissed or snoozed on another card with the same `storage_key`, until the next change or a reload.
- **A changing title or message no longer redraws the buttons.** When the text updates (a `{since}`, an attribute, a template), including a message that appears or goes blank, only the text changes now: a button you've moved to with the keyboard keeps its focus, and a tap that lands as the text changes still counts.

## 0.9.3 — 2026-11-05

A fix release. No options changed and existing configs keep working.

**Fixes**

- **Combined alerts with the same `id` no longer share dismiss/snooze memory unless they watch the same entities.** Two different combined alerts on one `storage_key` (including two unnamed ones in separate cards) could clear or overwrite each other's dismissals, and **Unsnooze all** could clear the other card's snooze. Identical combined alerts on two cards, such as one template used twice, still share. **After updating, a combined alert you had dismissed or snoozed shows once more**; dismiss or snooze it again. Older versions didn't save which entities it covered, so those records can't be safely carried over.
- **Dismissing a combined alert sticks when an entity joined it through an attribute.** When a battery dropped below the limit without the visible text or time changing, the card kept the old list of entities, so the alert came straight back after X.
- **Snoozes now end when an alert's conditions (or its group's) turn off and on again**, as dismissals already did and the README describes. This includes Home Assistant notifications in a group with conditions. Before, a snoozed alert stayed hidden until its time ran out.
- **A button that finishes after things changed** only dismisses if the alert still has that button, unchanged, can still be dismissed, and hasn't ended meanwhile. A cosmetic edit, or the alert being hidden or snoozed, still lets it dismiss. Replacing the button, removing the alert, or its conditions turning off and on (which makes it a new alert) doesn't.
- **A button on a Home Assistant notification no longer dismisses a newer one.** If Home Assistant replaced the notification (same ID, new content) while the button's request ran, the new one stays.
- **A notification could stay invisible** after you dismissed, swiped or snoozed it, if it came back at that moment (rain starting just as you snooze "Unless it rains", say). It now slides back in.
- **When the browser blocks storage or it's full**, every dismissal and snooze now lasts until the page reloads. Before, only the latest one did.
- **Times must be `HH:MM` or `H:MM`, optionally with seconds.** A time with extra text, such as `07:00am`, was read as `07:00`; it's now ignored like any other invalid time.

## 0.9.2 — 2026-11-04

A fix release. No options changed and existing configs keep working.

**Fixes**

- **Dismissals could disappear when another card used the same `storage_key`**, including the default key. Opening the card picker (its preview uses the default key) or a second card with different alerts cleared the first card's dismissals. A card now only ends dismissals for alerts it can show. Two cards with unnamed alerts no longer clear each other's.
- **Cards on the same key now stay in step.** Dismissing or snoozing on one card updates the others straight away, also in other tabs, and two cards on the same page no longer overwrite each other's changes. **Unsnooze all** clears only that card's snoozes.
- **A button action that can't run no longer dismisses.** A refused link, `navigate` without a path or an unknown action keeps the notification and shows *Failed*. A button with no action (or `action: none`) still just dismisses.
- **Service buttons stay busy until Home Assistant answers.** The 30-second limit is gone, so a long script can't be started twice by a second tap.
- **Conditions turning off and on while an alert is hidden now count.** If it happens during quiet hours, outside a zone or under `show_groups`, a dismissed alert comes back once it can show again, as the README already described.
- Editing a card while a button's request was running could show the new button as busy or *Failed*.
- Dismissals for alerts you've removed from the config are no longer cleaned up automatically; they take a few bytes and never hide anything else.

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
