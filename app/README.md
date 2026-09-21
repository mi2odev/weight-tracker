# Weight Tracker

A React Native (Expo) implementation of the Claude Design handoff in
`../project/`, built from the App Spec sheet in
`../project/uploads/Weight_Loss_Tracker.xlsx`.

Nine screens, real state throughout: the weigh-in keypad actually enters a
weight, Save writes one row per day, habit ticks are derived from the log, and
every stat, chart, roll-up, projection and insight recomputes from the data.

## Running it

```bash
npm install
npm start          # Expo dev server — press i / a, or scan the QR code
npm run typecheck  # app + tests
npm test           # 159 tests — calc engine, units, CSV, backup, health, crash scrubbing
```

`npm run web` runs it in a browser, which is how the screenshots during
development were taken.

## What's here

```
src/
  theme/      tokens.ts — the pasted palette, type ramp, spacing; ThemeContext
  data/       types.ts (spec §3) · store.tsx (state + AsyncStorage) · seed.ts
              derived.tsx — memoised derived data, computed once per change
  lib/        calc.ts (spec §4) · insights.ts (spec §5) · units.ts · csv.ts
              backup.ts · export.ts · health.ts · photos.ts · diagnostics.ts
              lockRules.ts / lock.ts · notifications.ts (spec §6) · date.ts
              *.test.ts
  components/ Card, Controls, HabitTicks, Icon, Overlays, Screen, TabBar, Type
              ErrorBoundary, LockGate
              charts/ TrendChart, Sparkline, LossBars, HeatMap
  screens/    Onboarding, Today, Progress, Trends, Habits, Milestones,
              Body, Log, More, Settings, Privacy
  navigation/ Root.tsx — an explicit route union, no navigation library
tools/        generate-icons.mjs — redraws everything in assets/
```

Modules that touch native APIs are split from the rules they implement —
`lockRules.ts` beside `lock.ts`, `csv.ts` beside `export.ts` — so the rules run
under `tsx --test` on Node without a simulator.

`lib/calc.ts` is one function per row of the spec's calculations table, pure and
tested. Screens never re-derive a number inline, so the Progress card, the
Settings read-only block and the insight copy cannot disagree.

## Two datasets

The app opens on a real first run: onboarding, then empty and locked states
everywhere. Settings → Data → **Load the 8-week demo journey** fills in 57 days
of weigh-ins, meals, workouts and measurements, reproducing the populated
screens the artboards show (157.0 → 152.2 kg, day 57 of 730). This mirrors the
Day 1 / Week 9 switch the design prototype carried. **Reset everything** goes
back to day one.

The demo series is generated from the same week anchors and noise function the
`ProgressScreen.dc.html` prototype used, so the trend chart draws the curve from
artboard 1e rather than an invented one.

## Design decisions worth knowing

**Visual direction.** The teal / IBM Plex Sans palette from
`Weight Tracker - Screens.dc.html` is applied to all nine screens, including the
seven that only existed in the earlier plum / Public Sans Android prototype.
Those seven keep their layouts from `Weight Journey.dc.html` and take the new
palette.

**No red on a weight gain.** The spec's calculations table says "display in
green, gains in red", but the later design direction is explicit and overrides
it: amber-red (`#A8544A`) marks a missed habit and nothing else. A gain reads in
plain text with an up arrow — the arrow, not the colour, carries the direction.
This also satisfies the spec's own tone rule and the accessibility requirement
that colour is never the only signal.

**Average rate vs. 14-day trend.** These are two different numbers and the app
uses each where the design does. The 14-day trend (`trendPerDay`) decides
*whether* a projection is shown at all — flat or upward means a dash, never an
extrapolation. The journey average (`averageDailyLossKg`) then *sizes* it, and
is what the "Avg weekly loss" card and the loss-rate insight report. That is
what makes the demo read 0.6 kg/week and ~609 days to goal, as the artboards do.

**Milestone dates are immutable.** Achieved dates are stored on the profile
rather than recomputed from the log, so editing or losing an old entry cannot
move or erase one. `newlyAchievedMilestones` stamps them on save and fires the
celebration once.

**Derived habit ticks.** `habitTicks` returns `null` — no tick at all — for days
outside the plan, rather than a zero score, so the heat map and the rolling
consistency figures aren't diluted by days before the start date.

**Dark-mode heat ramp.** The handoff specified only a light ramp. The dark one
is the same 0→6 walk interpolated between the dark card and the dark-mode
accent.

**Navigation.** A route union in `navigation/Root.tsx` rather than a navigation
library: the design draws its own tab bar and its sub-screens are simple pushes
over a tab, so this keeps the chrome pixel-exact and the whole flow readable in
one file. Android hardware back pops a sub-screen.

**Number fields** show grouped thousands at rest and raw digits while editing —
a separator that appears mid-keystroke fights the caret.

**Units are display-only.** Storage is always metric, as the spec requires.
`lib/units.ts` holds the conversions and a formatter bound to the profile's
setting; screens take a formatter rather than appending `' kg'`, so a weight
cannot be rendered in the wrong unit by omission. Text fields parse back to
metric on save, and the tests pin the round trip.

**Derived data is computed once per change, not once per render.** At the
730-day horizon the spec plans for, walking the log for roll-ups, streaks,
per-habit rates and insights cost ~13 ms per Progress render — and it re-ran on
every keystroke in a Today field. `data/derived.tsx` memoises the walk on the
log itself, so typing no longer pays for it.

**Red is for missed habits, and for one button.** The style frame reserves
amber-red for a missed habit, never a weight gain, and that still holds for
every value on screen. The single exception is the "Delete it all" button in
the reset dialog: that rule governs how data is *reported*, and a destructive
action is an affordance, not a judgement about the user.

## Backup, restore and import

Three different jobs, deliberately not one feature:

- **Export as CSV** writes four spreadsheets. It is for reading elsewhere, and
  it loses the profile's shape, so it is not what a restore reads. Fields that
  begin `=`, `+`, `-` or `@` are prefixed with an apostrophe so a note cannot
  become a formula in someone's spreadsheet.
- **Back up as JSON** is the whole dataset verbatim, and is what **Restore**
  reads. Restoring is deliberately strict about the envelope and forgiving about
  the contents: the wrong *file* is refused with a reason, while a right file
  with one bad row still restores the other three hundred, because the payload
  goes through the same `migrate()` validation as anything read off disk. The
  dialog says what the backup holds and what it would replace, and the toast
  that follows offers an undo.
- **Import weigh-ins from CSV** merges by date. Columns are matched by *name*,
  not position, and the rule throughout is that an imported blank never erases
  something already recorded.

Progress photos ride along only when asked: base64 roughly doubles their size,
so the button says what it will add. A backup's `file://` paths belong to the
device that wrote them, so on restore the bytes are written to fresh local files
and each measurement is re-pointed at what actually landed — anything that did
not land is cleared rather than left pointing at nothing. Files are written only
once the restore is confirmed.

## Safety rules

The app gives people numbers about their own bodies, so several rules are
enforced in `lib/health.ts` rather than left to the UI:

- **A calorie target has a floor**: 1 500 kcal for men, 1 200 for women, and a
  6 000 ceiling. Going under is warned about once, with a gentler target
  suggested, and saving anyway is the user's call.
- **A goal weight below BMI 17 is refused**, and below 18.5 is warned about.
- **Under 18, the calculated block is replaced** with a note to talk to a
  doctor. Adult formulas do not apply to a growing body.
- **Losing faster than 1.5 % of body weight a week** raises a supportive note,
  not an alarm.

The tone rule holds throughout: these are observations with a suggestion, never
a scolding, and never red.

## Privacy

There is no account, no sign-in and no server. Everything is written to this
device's storage. **More → Privacy** says so in full, and holds the two switches:

- **App lock** (`expo-local-authentication`), off by default — a tracker that
  demands a fingerprint before you can write down a number is a tracker people
  stop using. Turning it on asks for the face or finger *first*, because
  enabling a gate you cannot open is the one failure that costs someone their
  whole log. `LockGate` puts up two separate covers: the lock screen after the
  grace period, and an opaque cover during `inactive`, which is when the OS
  takes the app-switcher snapshot.
- **Crash reports**, also off by default. A report is assembled from a fixed set
  of fields and the error *message* is not one of them — a message is where a
  user's own numbers end up ("Invalid weight 152.2"). Only the error class and
  its stack frames travel, with paths cut back to basenames. The crash screen
  shows the whole report verbatim, and `diagnostics.test.ts` feeds it stacks
  full of weights, dates and photo paths to prove none survive. No reporting
  service is wired up, so nothing is uploaded today; the switch is what one
  would have to ask first.

Progress photos live in the document directory, never the cache — the cache is
the OS's to delete when storage runs low, and a before-photo from six months ago
is not recoverable.

## When something goes wrong

`ErrorBoundary` sits outside every provider, so it still renders when the store
or the theme is the thing that threw. It offers two actions in the order a
person needs them: **Export my data**, which reads AsyncStorage directly rather
than going through the store it cannot trust, and **Restart**, which remounts
rather than reloads so nothing the debounced write had not flushed is lost.

A payload that will not parse at startup is never discarded: it is copied to
`wt.data.corrupt.<timestamp>` and that copy is awaited *before* the app reports
itself hydrated, so the rescue always wins the race against the first write.

## Releasing it

`eas.json` carries the three usual profiles — `development` (a dev client),
`preview` (an internal APK) and `production`. `app.json` sets the bundle
identifier, the Android package, the adaptive icon and a light/dark splash.

> The identifier is currently `com.mi2odev.weighttracker`, chosen as a
> placeholder. Change it before the first submission — it cannot be changed
> afterwards.

The icons are drawn by `tools/generate-icons.mjs` rather than kept as opaque
binaries, so the mark, its colour and the Android safe-zone scale can be
adjusted without a design tool.

## Not built

- **Health integrations** (Apple HealthKit / Android Health Connect). Both need
  a development build rather than Expo Go, so they are waiting on a decision
  rather than on the code.
- **A home-screen quick action** for "log my weight". `expo-quick-actions` is a
  third-party package with a config plugin, so it too leaves Expo Go behind.
- **PDF export.** CSV and JSON are done; PDF would need a rendering library.
- **Gain as a goal type.** Lose and maintain are implemented; inverting the
  milestone ladder, the "total lost" framing and the whole insight vocabulary
  is a much larger change than adding a band.

## Notes on the reminders

All four are *local* notifications, so they work offline — which the spec
requires — and they work in Expo Go, which remote push no longer does.

Two of the four are conditional: the morning weigh-in is suppressed once the
day is logged, and the evening nudge only fires under three habits. A scheduled
notification cannot evaluate a condition when it fires, so instead the whole
schedule is rewritten whenever the log changes: if today's condition is already
satisfied, today's occurrence is simply never scheduled. `plannedReminders` is
pure, so those rules are readable without a device.

On a simulator or in Expo Go you will be asked for notification permission the
first time the app has something to schedule. Declining turns the feature off
rather than erroring — logging never depends on it.
