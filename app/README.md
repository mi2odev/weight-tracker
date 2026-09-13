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
npm test           # 32 spec-conformance tests for the calculation engine
```

`npm run web` runs it in a browser, which is how the screenshots during
development were taken.

## What's here

```
src/
  theme/      tokens.ts — the pasted palette, type ramp, spacing; ThemeContext
  data/       types.ts (spec §3) · store.tsx (state + AsyncStorage) · seed.ts
  lib/        calc.ts (spec §4) · insights.ts (spec §5) · date.ts · calc.test.ts
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

## Not built

- **Health integrations** (Apple Health / Google Fit import of weight, steps and
  sleep) and **CSV / PDF export** — both are listed in the spec's
  non-functional requirements, and both need platform work beyond the screens.
- **Notification delivery.** The four reminders in Settings persist their
  on/off state and their rules are written down, but nothing is scheduled with
  `expo-notifications` yet.
- **Imperial units.** The profile carries a `units` field; only metric is
  implemented, and the spec wants conversion on display only.
- **Progress photos** are placeholders, as they are in the design.
