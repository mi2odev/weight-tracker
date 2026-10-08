# Weighpoint — Weight-loss tracker

A React Native (Expo) app for tracking a weight-loss journey: daily weigh-ins, habits, progress charts, projections, milestones and backups. Everything is stored on the device.

## Highlights

- **Weigh-in keypad** that saves one entry per day
- **Habit ticks** derived from the log
- **Charts**: trend line, sparkline, loss bars and a heat map
- **Projections and insights** recalculated from your data
- Milestones, body measurements and progress photos
- CSV export, backup and restore, optional app lock and reminders
- 377 tests covering calculations, units, CSV, backup and reminder rules

## Stack

React Native · Expo · TypeScript · AsyncStorage

## Run it

```bash
cd app
npm install
npm start          # Expo dev server — press i / a, or scan the QR code
npm test           # unit tests
```

## Structure

```
app/       the Expo app (screens, components, data, lib, tests)
project/   original HTML/CSS design prototypes and the app spec
```

See [`app/README.md`](app/README.md) for the full architecture.
