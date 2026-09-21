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
npm test           # 51 tests — calculation engine, units, CSV escaping
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
              export.ts · notifications.ts (spec §6) · date.ts · *.test.ts
  components/ Card, Controls, HabitTicks, Icon, Overlays, Screen, TabBar, Type
              charts/ TrendChart, Sparkline, LossBars, HeatMap
  screens/    Onboarding, Today, Progress, Trends, Habits, Milestones,
              Body, Log, More, Settings
  navigation/ Root.tsx — an explicit route union, no navigation library
```

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

## Not built

- **Health integrations** (Apple Health / Google Fit import of weight, steps and
  sleep). Needs platform work beyond the screens.
- **PDF export.** CSV is done; PDF would need a rendering library.
- **Progress photos** are placeholders, as they are in the design.
- **Biometric app lock**, listed under the spec's privacy requirements.

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
