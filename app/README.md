# Weighpoint

A React Native (Expo) implementation of the Claude Design handoff in
`../project/`, built from the App Spec sheet in
`../project/uploads/Weight_Loss_Tracker.xlsx`. Shipped as **Weighpoint**; the
design files still carry the working title "Weight Tracker".

Nine screens, real state throughout: the weigh-in keypad actually enters a
weight, Save writes one row per day, habit ticks are derived from the log, and
every stat, chart, roll-up, projection and insight recomputes from the data.

## Running it

```bash
npm install
npm start          # Expo dev server — press i / a, or scan the QR code
npm run typecheck  # app + tests
npm test           # 272 tests — calc, units, CSV, backup, health, hydration,
                   #             snapshots, lock rules, photo sweeps, crash scrubbing
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
              backup.ts · export.ts · health.ts · diagnostics.ts · date.ts
              hydration.ts · snapshots.ts · templates.ts · numberInput.ts
              notifications.ts (spec §6)
              lockRules.ts / lock.ts · photoRules.ts / photos.ts · *.test.ts
  components/ Card, Controls, HabitTicks, Icon, Overlays, Screen, TabBar, Type
              ErrorBoundary, LockGate
              charts/ TrendChart, Sparkline, LossBars, HeatMap
  screens/    Onboarding, Today, Progress, Trends, Habits, Milestones,
              Body, Log, More, Settings, Privacy, StorageError
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

**Number fields keep their own text while you are typing.** They show grouped
thousands at rest and raw digits while editing, but the draft matters for a
sharper reason: a field bound straight to a parsed number can never accept a
decimal point. "2." round-trips through the parser as 2, the prop comes back
"2", and the point is erased on the next render — so "2.5 L" of water was
being stored as 25. `NumberField` now holds what was typed until blur.

**One reader for every number field.** `parseDecimalInput` strips a grouped
separator before parsing, because `parseFloat('1,250')` is 1 and `parseInt`
stops there too — a 1,250 kcal meal logged as one calorie, an 8,000 step
target saved as 8. A lone comma is still read as a decimal point, since
someone typing "2,5" means two and a half.

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

## Saved meals and workouts

Retyping the same porridge every morning is the kind of friction that stops
people logging at all, so a meal or a workout can be kept as a template and
added with a tap afterwards. The entry sheet offers the library at the top and
a "keep this for reuse" switch at the foot; templates carry no date, which is
the only thing that separates them from a log row.

Two rules in `lib/templates.ts` keep the library worth scanning:

- **Saving a duplicate updates it rather than adding a second line.** Matching
  is on the name and the meal type, deliberately not on the numbers — "Porridge
  410 kcal" and "Porridge 415 kcal" are the same meal to everyone except a
  computer. Re-saving with a corrected figure means "this is the right number
  now", so it overwrites rather than being refused.
- **The list ranks itself by use.** A template's position comes from how often
  its name appears in the log, so the daily breakfast rises to the top without
  a separate favourites system bolted on top of a favourites system.

Tapping a saved row *fills the form* rather than logging straight away: the
numbers on a repeated meal shift a little, and the user should get to look
before it lands in their day. Removing is a separate small target, so a mis-tap
costs a fill rather than a deletion, and it is undoable.

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

- **Two calorie floors, which are different promises.**
  `SUGGESTION_FLOOR_KCAL` (1,500) is the lowest the app will *suggest*;
  `calorieFloor(sex)` — 1,500 for men, 1,200 for women — is the lowest it will
  *accept*. Suggesting conservatively while accepting a lower number from
  someone who has a reason for it is deliberate. Every piece of copy quoting
  either is built from them by `calorieTargetExplainer`, with a test asserting
  the wording always names the floor actually enforced. It previously said
  "never below 1 500" to everyone, which was simply not the rule.
- **A 6 000 kcal ceiling**, to catch a slipped decimal point.
- **A goal weight below BMI 17 is refused**, and below 18.5 is warned about.
- **Age is derived, never stored.** `Profile.birthYear` is the fact;
  `currentAge` works it out. A stored age is wrong from the next birthday
  onward and never corrects itself — over a 730-day plan that is a one- or two-
  year error in Mifflin-St Jeor (5 kcal per year) and in the under-18 rule,
  which a 17-year-old would otherwise never age out of. The forms still *ask*
  for an age, because that is what people know about themselves; the conversion
  happens once, on save.
- **Turning 18 offers, it does not switch on.** `shouldOfferAdulthood` fires
  once, and only when they are an adult now, still have no target, and have not
  been told before. The dialog says targets are available and leaves them off
  until asked. Crossing a birthday is not consent to a calorie deficit.
- **Under 18, nothing is prescribed at all.** Not just hidden — the numbers are
  not produced. `plannedDailyDeficit` and `expectedLossPerWeek` return null,
  milestones get no target date and are never "Overdue", `daysToGoal` returns
  null, and the stored `targetCalories` is `NO_CALORIE_TARGET` (0). Returning a
  number and trusting every screen to remember to hide it is how it leaked out
  the first time. A milestone that was *reached* still says so — the
  achievement is theirs either way.
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
  takes the app-switcher snapshot. While the lock is enabled,
  `expo-screen-capture` also asks the OS to refuse screenshots and recordings
  outright — the in-app cover cannot reach the Android recents thumbnail,
  because that image is the system's to take. Tied to `lock.enabled` rather than to being
  currently locked: a screenshot taken while someone is looking at their log is
  exactly as revealing as the thumbnail. The locked content is hidden from the
  accessibility tree too, so VoiceOver and TalkBack cannot read out the weights
  behind it — tied to *locked*, not *covered*, so a glance at the control
  centre does not yank a screen reader out of its place.

  If the phone's passcode or enrolment is deleted **after** the lock was turned
  on, the gate would otherwise stand in front of a prompt that can never
  succeed. `classifyAuthResult` separates that case (`passcode_not_set`,
  `not_enrolled`, `not_available`) from an ordinary cancel, and offers "Turn
  the lock off and continue". That escape hatch appears only then — offering it
  after a cancel would let anyone holding the phone walk past the lock.
- **Crash reports**, also off by default. A report is assembled from a fixed set
  of fields and the error *message* is not one of them — a message is where a
  user's own numbers end up ("Invalid weight 152.2"). Only the error class and
  its stack frames travel, with paths cut back to basenames. The crash screen
  shows the whole report verbatim, and `diagnostics.test.ts` feeds it stacks
  full of weights, dates and photo paths to prove none survive. Nothing uploads
  on its own: a kept report sits on the device until the user taps **Send crash
  report** — on the crash screen, or in Privacy — which shares exactly the text
  they were shown. There is no fuller version held back for sending.

Progress photos live in the document directory, never the cache — the cache is
the OS's to delete when storage runs low, and a before-photo from six months ago
is not recoverable.

**A photo file outlives its row until the undo window closes.** Deleting it the
moment the measurement disappears would make Undo a lie: the row comes back
pointing at an image that is gone. `UndoAction.onExpire` runs only when the
window closes *without* the undo being taken, and that is where the deletion
lives — for a single delete, for a reset and for a restore alike. The sweep is
computed by `orphanedPhotoFiles` from the measurements themselves rather than
from a remembered list, and its tests lean on the expensive direction: a
referenced file must never be reported as an orphan, however its URI is spelled.

**A sweep only runs when the measurements in memory are the whole story.** The
startup sweep — which exists so a window cut short by the app being killed does
not strand files forever — used to claim it was "safe by construction". It was
not: on the corrupt path the app runs on `emptyData()` while
`wt.data.corrupt.*` still references every photo, so it deleted the user's
entire photo set and made the rescue worthless. `maySweepPhotos` now refuses
that case and three more of the same shape — storage unreadable or nothing
loaded, a downgrade whose stored measurements are the real ones, and a
migration that altered measurement rows, since dropped rows may come back from
the pre-migration snapshot. On top of those, finding files but no owners at
launch is a reason to stop rather than a mandate to delete everything; only an
explicit reset or restore, whose undo has expired, may clear the last photo.

## When something goes wrong

`ErrorBoundary` sits outside every provider, so it still renders when the store
or the theme is the thing that threw. It offers, in the order a person needs
them: **Export my data**, which reads AsyncStorage directly rather than going
through the store it cannot trust; **Send crash report**; and **Restart**, which
remounts rather than reloads so nothing the debounced write had not flushed is
lost.

**Storage that will not answer is not an empty log.** A read that threw used to
be swallowed — hydration completed on defaults and the next debounced write
saved them over the user's real data. `lib/hydration.ts` retries a throwing read
twice and returns one of three outcomes, and only a read that *succeeded* and
returned nothing counts as a first run. Writing is gated on
`mayPersist(hydration)`, not on "did hydration finish", because finishing
unsuccessfully is exactly the case that must not write. When it still fails, the
app blocks on a Retry screen rather than opening empty. There is deliberately no
"continue anyway": continuing means writing.

A payload that will not parse is never discarded: it is copied to
`wt.data.corrupt.<timestamp>` and that copy is awaited *before* the app reports
itself hydrated, so the rescue always wins the race against the first write.

**A migration keeps the bytes it replaces.** When one repairs or drops
anything, the original is copied to
`wt.data.premigration.<fromVersion>.<timestamp>` first, and the newest two are
kept. `snapshotsToPrune` filters by prefix before sorting, with a test asserting
it can never return `wt.data.v1` — deleting the wrong key here would be worse
than keeping too many.

**A downgrade is never written over.** Data from a newer build can hold fields
this one does not recognise, and `migrate()` drops what it does not know, so
writing it back would delete them. A downgrade takes the same snapshot and then
holds off writing entirely until the user changes something — at which point
their edit is the newer truth, and a toast has said so.

**A failed save says so, once.** `setItem(...).catch(() => {})` meant a phone
out of space logged nothing and said nothing. Now the first failure in a spell
raises a toast — once, because the write is debounced per keystroke — and the
payload goes back on the queue so it retries.

## Releasing it

`eas.json` carries the three usual profiles — `development` and `preview`
(internal builds) and `production`. `app.json` sets the bundle identifier, the
Android package, the adaptive icon and a light/dark splash.

Two keys are deliberately absent. `channel` is the link between a build and an
expo-updates release train, and expo-updates is not installed — it named a
delivery mechanism that did not exist. `developmentClient: true` needs
expo-dev-client, a native dependency. Both are one-line reinstatements once
those are decisions rather than defaults.

> The identifier is currently `com.mi2odev.weighpoint`, chosen as a
> placeholder. Change it before the first submission — it cannot be changed
> afterwards.

Every asset in `assets/` is cut from one artboard,
`assets/source/weighpoint-logo.webp`, by `tools/generate-icons.mjs` — so a
change to the logo is one re-run rather than six exports.

The rule is that the logo goes out **whole** — scale, trend line and wordmark —
wherever the platform allows it. An earlier version of this script took the
logo apart and rebuilt it from its pieces, which produced a launcher icon that
was just the scale mark on a gradient: recognisably related to the brand, and
not the thing anyone asked for. Two liberties remain, both forced:

- **The artboard's white margin is trimmed**, because it is padding rather than
  design and would otherwise show as a pale frame inside every icon. The
  corners that trim exposes are filled with the tile's own corner colour, since
  iOS applies its own rounding and a pre-rounded tile shows pale notches.
- **Android insets the logo to 66%** of the adaptive foreground. The launcher
  crops the outer third of that layer, which would cut the wordmark in half, so
  the whole logo is scaled to sit inside the guaranteed-visible zone and
  survives every mask shape intact.

There is no monochrome layer: a themed-icon monochrome asset has to be a
silhouette, and a full-colour logo with a wordmark has no honest one.

Two identifiers deliberately did **not** change with the name:
`STORAGE_KEY` (`wt.data.v1`), which is where every existing log lives, and
`BACKUP_FORMAT` (`weight-tracker-backup`), which is a stored format marker —
renaming it would make every backup taken before the rename unrestorable.

## Not built

- **Health integrations** (Apple HealthKit / Android Health Connect). Both need
  a development build rather than Expo Go, so they are waiting on a decision
  rather than on the code.
- **A home-screen quick action** for "log my weight". `expo-quick-actions` is a
  third-party package with a config plugin, so it too leaves Expo Go behind.
- **A crash reporting service.** The scrubber, the opt-in and the share button
  are done; wiring `beforeSend` to something like Sentry is a native dependency
  and a decision about a third party seeing crash data.
- **PDF export.** CSV and JSON are done; PDF would need a rendering library.
- **Gain as a goal type.** Lose and maintain are implemented; inverting the
  milestone ladder, the "total lost" framing and the whole insight vocabulary
  is a much larger change than adding a band.

## Notes on the reminders

All four are *local* notifications, so they work offline, which the spec
requires.

**They need a development build on Android.** Not because local notifications
stopped working, but because `expo-notifications` cannot be *imported* at all
on Android inside Expo Go: its index re-exports
`DevicePushTokenAutoRegistration.fx`, which calls `addPushTokenListener()` at
module scope, and since SDK 53 that throws rather than warns — remote push was
removed from the Go client. A top-level import took the whole app down at
startup, over a feature this app never uses.

So the module is `require`d on first use and not at all where the require is
fatal (`remindersSupported`). Reminders are the only thing that stops working
there; the Settings switches say so and disable themselves. iOS in Expo Go
only warns, so they work there.

Two of the four are conditional: the morning weigh-in is suppressed once the
day is logged, and the evening nudge only fires under three habits. A scheduled
notification cannot evaluate a condition when it fires, so instead the whole
schedule is rewritten whenever the log changes: if today's condition is already
satisfied, today's occurrence is simply never scheduled. `plannedReminders` is
pure, so those rules are readable without a device.

On a simulator, or in a development build, you will be asked for notification
permission the first time the app has something to schedule. Declining turns
the feature off rather than erroring — logging never depends on it.
