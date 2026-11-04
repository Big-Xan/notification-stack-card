# Tests

Browser tests for the card. They load `notification-stack-card.js` into headless Chromium with small stand-ins for Home Assistant's `ha-card`, `ha-icon`, `ha-form` and `hass`, then check behaviour: stacking and expanding, sub-stacks, dismiss and snooze memory, templates, persistent notifications, action buttons (busy, success, failure), scrolling messages, colors and an editor round trip.

```sh
npm install playwright
npx playwright install chromium
node tests/run.js notification-stack-card.js
```

Each test prints PASS or FAIL; the run exits non-zero if any fail. Add a screenshot path as a second argument to save a picture of action buttons in their busy and failed states.

These tests use stand-ins, not a real Home Assistant frontend, so check changes in Home Assistant too before a release.
