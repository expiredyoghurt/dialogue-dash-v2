# Dash Express (Dialogue Dash): handoff for the next Claude

Written at **v1.7.0**; updated for **v1.9.0** (see the status note below). This file has two jobs:

1. **Part A** gets you productive in this codebase quickly: what it is, how it is built, how to test and ship, what the owner has already decided, and what has *not* been verified.
2. **Part B** is the scoped plan for the next round of UI/UX work, ready to build in order.

Read **Part A §1–§3** and **Part B §10** first (about ten minutes), then dip into the rest as needed. Everything stated here was true when it was written; where something is a guess or unverified it says so.


> **Status at v2.0.0.** 2.0.0 (the old plan's 1.10 "Teacher power") is built: T1, T2, T3, T4, T5, T6, T7, T9. Still open from Part B: P6, P8, P9, P11, T8, S1, X6, X7. Older note follows.
>
> **Status at v1.9.0.** Releases 1.8.0 and 1.9.0 are built (CHANGELOG has the detail). Done from Part B: X1, X2, X3, X4, P10, T10 (1.8.0) and P1, P2, P3, P4, P5, P7, X5 (1.9.0). Next is **1.10.0 (Teacher power)**: T1, T2, T5, T4, T3, T6, T7, T9. Notes for the next Claude:
> - `node test/visual/shots.mjs` (Playwright + Chromium; `--update` re-saves baselines) also audits touch targets. The 1.7.0 "me" baselines were really the Town; fixed in 1.9.0.
> - Real-browser checks found and fixed: invisible ghost buttons in dark mode, feedback hidden behind the answer bar on phones, a 38px sound button. Still **not** verified on real devices: the on-screen keyboard bar, install/update, sound, screen readers (Part A §7).
> - Decisions made without the owner (flag them): calm mode removes the speed bonus; comfort settings are cleared from the device at sign-out; the QR carries the class code only (no username); P4's comparison is shown only when the answer is revealed (never earlier, to avoid leaking the answer) and only for Mode 1; P5's "Try one" needs an unlocked district.
> - Open questions in §12 are still open, especially 3 (is a printed QR sheet allowed?).

---

# Part A. Where things stand

## 1. What this is

A gamified web app that teaches pupils to write dialogue (speech marks, capitals, end punctuation, commas, speech tags, strong verbs, reported speech, tense, reading between the lines). It runs on **Cloudflare Workers + static assets + D1**, with an optional Workers AI call (judging unfamiliar "saying verbs"). **No build step**: plain JavaScript files served as-is.

- **Pupils** sign in with a **username and a class code**. **No passwords.** Guests can play without a class. Pupils mostly use **phones, tablets and laptops**.
- **Teachers** sign in with a username and password at `/teacher.html`.
- The owner is a Singapore primary-school English teacher who builds several small learning games (S&T Invaders, The Newsroom, Spell Academy and others). Assume **primary pupils (roughly P3 to P6)** unless told otherwise, and keep pupil-facing language simple.

**The story layer ("Dash Express").** Pupils are couriers in the friendly town of **Chatterbury**. Each question is a *parcel*. **Dot** is the depot boss; the careless rival firm is **the Smudge**. The map is **12 districts, one per rule** (names in `src/districts.js`). Routes are 5 stops; each district ends in a **Big Delivery** (6 stops, 3 patience envelopes); **Rush Hour** is a mixed route unlocked after 3 districts are cleared. Ranks come with vehicles (on foot, bike, scooter, van, truck, rocket). There is a garage with paint, helmets and stickers.

### Rules and settled decisions (do not break without asking)
- **No fantasy or medieval theming** in the Dash Express setting, and **no references to "dungeon"** (a separate game) or **"floors"**. Some *seeded question content* still has fantasy-flavoured wording (a guard, a knight, a crown); the owner has not asked to change it. Ask before editing content.
- Districts are one per rule: the **original seven** (1 Speech Mark Street, 2 Capital Corner, 3 Full Stop Market, 4 Comma Lane, 5 Inside Row, 6 Crossroads, 7 Verb Garage) plus five added for the rules introduced in v1.1 (8 Doorstep Row, 9 Action Alley, 10 Relay Road, 11 Diary Docks, 12 Customer Quarter).
- **Pupils never have passwords** (the owner's words: "no passwords, only username and class code"). I read that as being about pupils; **teacher accounts keep passwords** because they can change and delete real data. That reading is my assumption, so check with the owner before touching teacher sign-in.

## 2. Release history (what exists)

| Version | What it added |
|---|---|
| 1.0 | Original app: Modes 1 to 3 (rewrite, spot the error, upgrade the tag), XP, ranks, teacher console, verb bank with AI fallback. |
| 1.1.0 | Modes 4 to 6 (choose best answer, change the speech, fix the tense), 12 rules, linked question groups. Built in parallel by the owner. |
| 1.2.0 | Dash Express: districts, routes, tips (bonus XP), Big Delivery, Rush Hour, garage, Dot's tip, teacher Districts tab. `floors` removed. |
| 1.3.0 | Levels and tiered unlocks (districts 1–3 / 4–6 at level 10 / 7–12 at level 20). Teacher accounts, per-class manual unlocks. |
| 1.3.1 | XP per level varies by range and is admin-adjustable. |
| 1.4.0 | Super admin vs teachers; teachers create and own classes (cap 30). |
| 1.5.0 | Admin sets XP for each rank and each vehicle separately. |
| 1.6.0 | Phone bottom nav, custom dialogs and toasts, question-bank search and paging, focus and keyboard basics, loading and error states, sounds. |
| 1.7.0 | Class dashboard, unlock grid, Game settings tab (draft, preview, one save), play-screen polish and punctuation keys, garage/sound/keys saved to the account, installable PWA. |
| 1.8.0 | Self-hosted fonts, 44px touch targets, answer retry on no signal, tab keyboard, style guide, real-browser pictures. |
| 1.9.0 | Comfort settings, join links/QR, celebrations, feedback comparison, handbook v2, first-route tips. |

`CHANGELOG.md` has the detail and is the source of truth for behaviour.

## 3. Architecture in one page

```
public/            static assets, served by Cloudflare directly (no build)
  index.html       pupil app shell        app.js (~1,700 lines)  art.js  sfx.js  ui.js  app.css
  teacher.html     teacher console shell  teacher.js (~1,240)    ui.js   app.css
  sw.js, manifest.webmanifest, _headers, icons/    install support
src/               the Worker (API only: /api/*)
  index.js         routing, auth gate, cron purge of old guests
  pupil.js         pupil API: login, guest, me, questions, answer, route, prefs, meta
  teacher.js       teacher API (/api/t/*): scoped by `who` (see accounts.js)
  accounts.js      teacher accounts, PBKDF2 passwords, who-is-signed-in, permission helpers
  express.js       the courier layer: settings, access/levels, per-pupil state, finishing a route
  districts.js     districts, level maths, tiers, vehicles, cosmetics, route scoring (pure functions)
  prefs.js         pupil preferences (garage, sound, keys), validated
  engine.js        the marking engine for punctuation answers   rules.js: rules, error codes, ranks
  modes.js         per-question-type validation, payloads, marking   verbs.js: verb bank + AI fallback
  auth.js util.js version.js
test/              server tests (node:test + in-memory SQLite) and test/ui (jsdom against the real Worker)
migrations/        0002 to 0006, all idempotent       schema.sql: full schema for fresh installs
scripts/           seed builders, make-icons.py
```

**Pupil client** (`app.js`) is one IIFE. State lives in `S`; `render()` rebuilds the whole screen each time; views are plain functions returning DOM built with the `h(tag, attrs, ...kids)` helper. **Server text is never put in with innerHTML** (always text nodes). `render()` keeps scroll position on same-screen re-renders and moves focus on screen/question changes.

**Teacher client** (`teacher.js`) is the same style. `render()` keeps the old tab content on screen while the same tab reloads (no flash) and restores scroll. Views are `async function xView(root)`; `guard(fn)` wraps handlers so errors become toasts. `S.dirty` guards leaving the Game settings tab.

**Shared UI** (`ui.js`): `DashUI.ask / confirm / prompt` (dialogs), `toast`, `announce` (screen-reader live region), `skeleton`, `errorPanel`, `focusMain`, `watchOnline`.

### Data model (D1)
`meta` (key/value; also stores settings as JSON strings: `clock`, `open_districts`, `level_bands`, `rank_xp`, `vehicle_xp`), `classes`, `pupils`, `questions` (mode + JSON `data`; optional `data.rule` 1–12 sets the district, otherwise `autoRule()` suggests one), `attempts`, `verbs`, `verb_forms`, `verb_ai`, `route_runs` (one row per finished route: stars, tips, passed), `teachers`, `teacher_classes`, `class_settings` (manual unlocks per class), `class_owners` (who created a class), `pupil_prefs`.

### API surface
- Public: `GET /api/meta`, `POST /api/login`, `POST /api/guest`, `POST /api/teacher/login`.
- Pupil (bearer token): `GET /api/me`, `GET /api/questions?mode=&district=&practice=`, `POST /api/answer`, `POST /api/route`, `PUT /api/prefs`.
- Teacher (`/api/t/…`, scoped by role): `me`, `me/password`, `teachers*` (super admin), `classes*`, `classes/:id/unlocks`, `classes/:id/pupils*`, `pupils/:id*`, `questions*`, `questions/rules`, `settings` (GET all, PUT admin), `settings/preview` (admin), `dashboard?class=`, `unlock-grid`, `districts`, `verbs*` (admin; review is open to teachers), `analytics`.

### Rules that decide how the game behaves (see `districts.js`, `express.js`)
- **Level**: level 1 is free; each later level costs the XP of the range it falls in. Defaults: levels 2–10 cost 50 each, 11–20 cost 75, 21–30 cost 100, 31–40 cost 150, 41+ cost 200. So level 10 = 450 XP, level 20 = 1,200 XP. Admin-adjustable (`level_bands`).
- **Unlocks**: districts 1–3 always; 4–6 at level 10; 7–12 at level 20; plus anything a teacher ticks for a class; or everything if the admin switches "open every district" on. **Enforced on the server**: locked questions are never sent, and answering or delivering one is refused (403).
- **Ranks and vehicles** have **separate** XP lists (`rank_xp`, `vehicle_xp`), default identical (0, 60, 160, 320, 560, 900). Names are fixed.
- **XP total** = answer XP + route "tips" (bonus). Tips are computed **server-side** from recorded attempts, never from client numbers.
- **Permissions**: *super admin* = the Cloudflare secrets (`teacher_user` / `teacher_password`). *Teachers* are rows in `teachers`; each can create and own up to 30 classes, run assigned classes, and delete classes they created. Only the super admin manages accounts, the shared question bank and verb list, town-wide settings, guests. Enforced in `teacherRoute` with `needClass` / `needAdmin` / `needOwner`.

## 4. Conventions and gotchas

- **Adding a table**: add it to `schema.sql` *and* a new idempotent `migrations/000N_*.sql`; write the code so the app **still works before the migration runs** (wrap reads in try/catch and fall back; tests prove this by dropping the table). Add an npm script `db:*:local|remote`. Tell the owner to run the migration **before** `npm run deploy`.
- **Settings** live in `meta` as JSON text and are read through `getSettings()` (`express.js`), which validates and falls back to defaults on damaged values.
- **Server errors**: throw `HttpError(status, friendlyMessage)`; messages reach pupils and teachers verbatim, so write them for children and busy teachers.
- **Marking is untouched** by the courier layer. Do not change the engine, answer XP tables, or answer payload whitelists (`test/payload.test.mjs` guards that no answers leak to the client).
- **Release checklist**: bump `src/version.js`, `package.json`, `public/sw.js` (`VERSION`) together; add the `CHANGELOG.md` entry **at the top** (a test checks the top entry matches the version); update the version assertion in `test/express.test.mjs`; run `npm test`; zip without `node_modules` and `.wrangler`.
- **Language and tone** (as observed in the app): British spelling, plain words, short sentences, no jargon on pupil screens.
- **Dark mode** is automatic (`prefers-color-scheme`). Any new colour needs both light and dark values via CSS variables.
- **Reduced motion**: new animation must respect `prefers-reduced-motion`.
- **Service worker** (`sw.js`) is network-first with a 4-second fallback to cache; it must never handle `/api/*`, `/sw.js` or `/teacher*`. A test runs the real file in a sandbox to prove that.
- `CODES` (`rules.js`) entries have `rule`, `label`, optional `hidden`. Hidden codes are never shown or counted.

## 5. Testing

```
npm install
npm test            # server tests, then browser tests
npm run test:server # 165 tests: node:test + in-memory SQLite (test/helpers/d1.mjs)
npm run test:ui     # 29 tests: the real pupil app and teacher console in jsdom, against the real Worker
npm run dev         # wrangler dev (needs a real D1 id in wrangler.jsonc)
```

- **UI tests** (`test/ui/helpers.mjs`): `makeWorld()` (fresh DB), `mount(world, 'index.html' | 'teacher.html', { pre })` returns `{ $, $$, text, btn, exact, until, type, dialog, errors }`. Set `world.offline = true` to simulate no signal. Call `a11yProblems(page)` to run the automatic accessibility check (names, labels, unique ids, landmarks). Each file registers `test.after(closeAll)`; without it the process hangs on the app's timers.
- jsdom has **no layout, no real focus rendering, no media queries, no audio, no service worker, no install prompt, no visual viewport**. Tests that need those stub them (see `pupil.test.mjs` for `matchMedia`, `beforeinstallprompt`). **Do not claim layout, keyboard-overlay, install or sound behaviour is verified from these tests.**
- `test/e2e.mjs` (`npm run e2e`) needs `wrangler dev`; it is **not** part of `npm test` and may be stale. Check before relying on it.

## 6. Deploying

1. Run any new migrations first (all safe to repeat): `npm run db:express:remote`, `npm run db:accounts:remote`, `npm run db:prefs:remote`.
2. `npm run deploy`.
3. Secrets `teacher_user` and `teacher_password` must exist (they are the super admin sign-in). Cron purges guest accounts after 30 days (`GUEST_RETENTION_DAYS`). Sessions last 12 h (pupils) and 8 h (teachers).
4. Rate limits (`RL_LOGIN`, `RL_GUEST`) and the Workers AI binding are optional; the app degrades without them.

## 7. Known gaps and unverified claims

Treat these as the first things to test on real hardware.

1. **On-screen-keyboard answer bar** (`.dock`, uses `visualViewport` and a `--kb` CSS variable). Written for iOS Safari and Chrome Android; **never run on a device**. Also uses `body:has(.dock)` (Safari 15.4+, Chrome 105+).
2. **Install and service worker**: never tested in a real browser or on Cloudflare. Verify the `_headers` file is honoured, the manifest installs on Android, the iOS "Add to Home Screen" flow works, and an update after deploy actually reaches an installed copy.
3. **Sounds** (Web Audio): never heard. Check volume, iOS unlock on first tap, and that nothing plays before a tap.
4. **Sticky action buttons** on Modes 2, 3, 4, 6 (`.sticky-actions`): added by CSS only; not exercised in tests.
5. **Teacher console on phones** is usable but not designed for it (wide tables scroll sideways; small buttons are about 30 px tall).
6. **Google Fonts** (Atkinson Hyperlegible) are loaded from Google and are **not cached by the service worker**. School networks sometimes block Google; fall-back fonts then apply. Self-hosting is recommended (Part B).
7. **Colour contrast**: text pairs checked by calculation and pass AA in light and dark (ink on panel 16:1, secondary text 7.8:1, good 5.4:1, bad 6.5:1). **Not yet checked**: the `--h0` to `--h3` highlight colours (1.3:1 to 3.6:1 on the panel), which are fine only if used purely as backgrounds behind ink text. Confirm where they are used.
8. **Screen readers** (VoiceOver, TalkBack, NVDA) have **not** been run. The automatic check only proves names and landmarks exist.
9. Answer-submission failure inside a question (network drops mid-answer) is handled by the API wrapper's error message, but the **typed answer is not explicitly preserved with a Retry** control. Verify.
10. Real **performance** is unmeasured (app.js is about 87 KB, teacher.js about 94 KB, app.css about 38 KB, unminified).

---

# Part B. Scope: further UI/UX upgrades

## 8. Principles

1. **Children first.** Short words, big targets, one obvious next action, no dead ends, no blame in feedback.
2. **Real devices decide.** The first release in this plan exists to find out what is actually true on phones and tablets.
3. **Teachers are busy.** Fewer clicks to the thing they do every week (see who is stuck, open a district, print a class sheet).
4. **No build step, no framework.** Keep plain files and the existing helpers. If code is split, use classic scripts sharing a namespace, because the jsdom harness does not run ES modules.
5. **Server decides, client shows.** Never move unlock, XP or permission logic into the browser.
6. **Every item ships with tests and a changelog line.** Behaviour in jsdom tests; layout and feel in real-browser screenshots (item X2).

## 9. The backlog

Sizes: **S** (under a day), **M** (a few days), **L** (a week or more). "Dep" lists what must come first.

### Cross-cutting (build first)
| ID | Item | Size | Dep |
|---|---|---|---|
| X1 | **Living style guide** page (`/styleguide.html`, not linked, no data) showing every component in light/dark and at phone width, so layout can be reviewed by screenshot without playing the game. | S | none |
| X2 | **Real-browser visual tests** (Playwright, if browsers can be installed in the environment): screenshots at 390×844, 820×1180 and 1366×768, light and dark, for Town, a typed question, a tap question, receipt, Me, Dashboard, Game settings. Store baselines; fail on large diffs. Also exercises the keyboard answer bar with a touch-emulated device. | M | X1 |
| X3 | **Self-host the font** (Atkinson Hyperlegible, OFL licence, woff2 in `public/fonts/`), add to the service-worker shell, remove the Google Fonts links. Fixes blocked-network and offline cases. | S | none |
| X4 | **Touch targets**: on coarse pointers make every button, tab, swatch, checkbox and select at least 44 px; keep compact sizing for mouse. Applies to teacher console too. | S | none |
| X5 | **Copy pass**: reading-age review of every pupil-facing string (target about P4), consistent Dot voice, friendly error text with a next step, no idioms. Central strings object only if it stays simple. | S | none |
| X6 | **Performance budget**: measure with Lighthouse (mobile profile); set budgets (JS under 100 KB gzip on the pupil page, LCP under 2.5 s on throttled 4G); lazy-load teacher-only code is already separate, consider deferring `art.js` drawing until needed. Optional minify step as a script (not required to run). | M | X2 |
| X7 | **Split `app.js` and `teacher.js`** into several classic scripts by area (state, api, views, question modes), sharing one namespace; update `sw.js` SHELL and the HTML script lists and the jsdom helper. Pure refactor, no behaviour change, done when tests are green and nothing is lost. | M | after any feature work to avoid merge pain |

### Pupil experience
| ID | Item | Size | Dep |
|---|---|---|---|
| P1 | **Comfort settings** under Me: text size (3 steps), extra line and letter spacing, high-contrast theme, "calm mode" (no animation, no sound, no clock). Saved in `pupil_prefs` (extend `prefs.js` whitelist). | M | X4 |
| P2 | **Join links and QR for classes**: `/?class=CODE` pre-fills the class code on sign-in; teachers print a class sheet with a QR and each pupil's username. Removes the biggest phone friction (typing codes). Add "Not you? Switch" to the header for shared devices. | M | none |
| P3 | **Level-up, new-district and new-ride moments**: a one-time celebratory overlay with Dot and the new vehicle, tap to continue; respects calm mode and reduced motion; also plays the existing sounds. Replace the current banner-only treatment. | M | P1 |
| P4 | **Better feedback**: for typed modes show "yours" and "the model" with changes marked by colour **and** a mark (underline or symbol), a one-line "why" in plain words, and a link to that rule in the Handbook. Never red-only. | M | none |
| P5 | **Handbook v2**: searchable, one card per rule with a tiny worked example, a "try one" button that starts a route in that district, and anchors so feedback can deep-link. | M | P4 |
| P6 | **Visual town map**: a scrolling road with district buildings (reuse `buildingSvg`), padlocks with the level that opens each, a "next unlock" progress ring. Keep the card list as the accessible alternative with a toggle; the map must be fully keyboard and screen-reader reachable. | L | X2 |
| P7 | **Guided first route**: three coach-marks (tap, answer, combo) on the very first route; "Replay Dot's intro" button under Me. | S | none |
| P8 | **Goals and streaks, gently**: weekly goal ring (a teacher-configurable number of routes), streak calendar under Me, a few badges (first Big Delivery, 10-answer combo). Teacher toggle to hide all of it. | M | P1 |
| P9 | **Wide-screen play layout** (≥ 900 px): question on the left, feedback and hints on the right; Town as a two-column grid. | S | X2 |
| P10 | **Answer-submission resilience**: if sending an answer fails, keep the typed text, show "No signal. Your answer is safe. Try again" with one button, and never lose a combo to a network blip. | S | none |
| P11 | **Optional haptics** on supported phones (`navigator.vibrate`) for right/wrong, behind the sound/calm settings. | S | P1 |
| P12 | **Offline practice** (research only): cache a small pack of already-answered question types so a pupil can practise with no signal and sync later. Needs a design for marking offline without leaking answers; likely out of scope. | L | decision needed |

### Teacher experience
| ID | Item | Size | Dep |
|---|---|---|---|
| T1 | **Class context switcher** in the header, used by Dashboard, Classes, Districts and Analytics, remembered between visits, so you pick the class once. | S | none |
| T2 | **Pupil detail panel**: click a pupil for a side panel with level and rank, district progress (cleared, stars), slips by rule, recent activity, and Edit / Reset / Delete / Print report. | M | T1 |
| T3 | **Dashboard v2**: 14-day XP sparkline, a pupils-by-districts **heat map** (not started, in progress, cleared), and one-click **suggestions** ("6 pupils reached level 10: open districts 4–6 for this class?"). CSV export. | L | T1 |
| T4 | **Question bank power tools**: multi-select with bulk "set district", "move to class", "remove"; **undo** after remove (needs a restore endpoint: questions are soft-deleted with `active = 0`); duplicate; **preview as a pupil**; saved filters. | L | none |
| T5 | **Sidebar navigation** on wide screens, grouped (Teach, Content, Admin), with the header class switcher; top tabs remain on tablets. Breadcrumbs inside class detail. | M | T1 |
| T6 | **First-run checklist** for new teachers: create class, add pupils, print sheet, try as a pupil; empty states with one primary action each. | S | P2 |
| T7 | **Teacher account hygiene**: force a password change on first sign-in (needs a `must_change` flag, i.e. one new column or table), show/hide password, strength hint, copy button for the temporary password. Admin sees who signed in and when. | M | none |
| T8 | **Settings presets and history**: presets ("Gentle", "Standard", "Quick") for XP per level, a short **change history** with "restore this", and a second curve on the chart for comparison. Needs a small `settings_log` table. | M | none |
| T9 | **Responsive tables**: below 640 px render tables as stacked cards; sticky header and `aria-sort` on sortable columns. | M | X4 |
| T10 | **Keyboard**: `/` focuses search, Esc clears a filter, arrow keys move between tabs (`role="tablist"` pattern). | S | none |

### Safety and privacy UX
| ID | Item | Size | Note |
|---|---|---|---|
| S1 | **Shared-device care**: obvious "Sign out" after a route on school computers, optional auto sign-out after inactivity (teacher setting), no pupil data left in localStorage after sign-out (garage/sound/keys now live on the account). | S | |
| S2 | **Minimal usage counters** (tab use, route abandonment) to guide UX decisions. **Default off and needs the owner's explicit decision**; aggregate only, no personal data. | M | Singapore's data protection rules probably apply to children's data; confirm with the school |

## 10. Suggested order

| Release | Theme | Items |
|---|---|---|
| **1.8.0** | *Make it true on real devices* | X3, X4, X1, X2, P10, T10, plus a **device test pass** (see §11) and fixes from it |
| **1.9.0** | *Pupil delight and comfort* | P1, P2, P3, P4, P5, P7, X5 |
| **1.10.0** | *Teacher power* | T1, T2, T5, T4, T3, T6, T7, T9 |
| **1.11.0** | *Polish and depth* | P6 (town map), P8, P9, P11, T8, S1, X6 |
| **2.0.0** | *Maintainability* | X7 (split files), revisit P12 and S2 with the owner |

Each release: a CHANGELOG entry, a version bump in the four places in §4, new tests, and a short plain-English summary for the owner covering what changed, what to run before deploying, and what was **not** verified.

## 11. Device test pass (do this at the start of 1.8.0)

Ask the owner for screenshots or screen recordings, or run on real hardware if possible. Test **iPhone Safari, Android Chrome, iPad Safari, a school laptop (Chrome or Edge)** in light and dark.

- [ ] Sign in with a class code on a phone; the keyboard does not hide the Check button or the punctuation keys; typing with keys inserts at the cursor; the bar clears after the answer.
- [ ] Modes 2, 3, 4, 6 on a phone: the main button stays reachable; tap targets are comfortable; no unwanted zoom.
- [ ] Bottom bar: all four buttons work; the "playing" state hides it; it clears the home indicator.
- [ ] Rotate to landscape on a phone and a tablet.
- [ ] Install on Android (prompt appears under Me) and iPhone (Add to Home Screen); launch full screen; notch and home bar are clear; after a deploy, the installed app updates.
- [ ] Turn off wifi mid-session: banner appears; starting a route explains the problem; answers are not silently lost.
- [ ] Sounds: audible but quiet; off switch works; nothing plays before a tap; iOS plays after the first tap.
- [ ] Screen reader pass on Town, a typed question and the receipt (VoiceOver and TalkBack).
- [ ] Teacher console on a tablet and a laptop: dashboard, unlock grid (does the wide table scroll sanely?), Game settings sticky bar, dialogs.
- [ ] Slow network (throttled 3G): loading placeholders appear; the service-worker 4-second fallback feels acceptable (consider stale-while-revalidate for static assets if not).

## 12. Open questions for the owner

Ask these early; do not guess.
1. Which year levels use Dash Express (P3/4, P5/6, both)? It sets reading level and how playful the animation can be.
2. Do school networks block Google Fonts or other external sites?
3. Is a printed **class sheet with QR join links** acceptable under school policy, or must codes stay typed?
4. Is **any usage counting** acceptable (S2), and if so who approves it?
5. Should teachers be able to **hide gamification** (streaks, badges, sound) per class?
6. Do you want **offline practice** (P12) badly enough to justify the design effort?

## 13. How to work with this owner

- They give short, specific directions ("build v1.6 and v1.7 with these items") and expect working, tested code, a clean zip, and a concise summary, not a long essay.
- They like a **scope first, then "build as scoped"** rhythm for larger work. Honour what was scoped; flag deviations plainly.
- State assumptions you made and the one or two choices they might want to change; do not bury them.
- Be honest about what is **not** verified. This app runs in real classrooms.
- Keep to their rules in §1 ("Hard rules") even when something else would be easier.

## 14. Appendix: where to look for things

| To change… | Look in |
|---|---|
| Level, tier, vehicle, route scoring maths | `src/districts.js` (pure, well tested) |
| Which districts a pupil may play | `pupilAccess()` in `src/express.js`; enforced in `listQuestions`, `answer`, `finishRoute` |
| Any setting the admin can change | `getSettings` / `saveSettings` in `src/express.js`; UI in `gameSettingsView` (`teacher.js`) |
| Who may do what in the console | `teacherRoute` (`src/teacher.js`) and `src/accounts.js` |
| Pupil screens | `townView`, `depotView`, `garageView`, `progressView`, `playView`, `receiptView` (`public/app.js`) |
| Question input UIs | `qMode1` … `qMode6` (`public/app.js`); shared `punctKeys`, `answerDock` |
| Dialogs, toasts, loading, errors | `public/ui.js` |
| Artwork (vehicles, Dot, buildings, stars) | `public/art.js` (SVG built with `createElementNS`) |
| Install behaviour | `public/sw.js`, `public/manifest.webmanifest`, `public/_headers`, `installPanel()` in `app.js` |
| CSS for anything new | end of `public/app.css`; sections are labelled with the release that added them |
