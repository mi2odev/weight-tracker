/**
 * CSV serialisation — section 7 of the App Spec sheet.
 *
 * "This is how a user leaves the app with their data, and mirrors the workbook
 * they are coming from." So the export is one file per sheet of that workbook,
 * with the same column order, and always in metric: the stored values, not the
 * display ones, so a round-trip cannot lose precision to a unit conversion.
 *
 * Pure and free of native imports, so the escaping rules can be tested on
 * Node without pulling in the React Native runtime. Writing the files and
 * opening the share sheet lives in `export.ts`.
 */

import { AppData } from '../data/types';
import { habitTicks, habitsMetCount } from './calc';
import { todayKey } from './date';

/** RFC 4180: quote when the value contains a comma, quote or newline. */
function cell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

export function weighInsCsv(data: AppData): string {
  const today = todayKey();
  const rows = data.entries
    .slice()
    .sort((a, b) => (a.logDate < b.logDate ? -1 : 1))
    .map((e) => {
      const ticks = habitTicks(e, data.profile, e.logDate, today);
      return [
        e.logDate,
        e.weightKg ?? '',
        e.calories ?? '',
        e.proteinG ?? '',
        e.waterL ?? '',
        e.steps ?? '',
        e.cardioMin ?? '',
        e.strengthDone ? 'Yes' : 'No',
        e.sleepH ?? '',
        // Derived, but worth carrying: it is what the habit screens show.
        ticks ? habitsMetCount(ticks) : '',
        e.notes ?? '',
      ];
    });

  return toCsv(
    [
      'log_date',
      'weight_kg',
      'calories',
      'protein_g',
      'water_l',
      'steps',
      'cardio_min',
      'strength_done',
      'sleep_h',
      'habits_met',
      'notes',
    ],
    rows,
  );
}

export function mealsCsv(data: AppData): string {
  return toCsv(
    ['log_date', 'meal_type', 'description', 'calories', 'protein_g', 'notes'],
    data.meals
      .slice()
      .sort((a, b) => (a.logDate < b.logDate ? -1 : 1))
      .map((m) => [m.logDate, m.mealType, m.description, m.calories, m.proteinG, m.notes ?? '']),
  );
}

export function workoutsCsv(data: AppData): string {
  return toCsv(
    ['log_date', 'type', 'session', 'duration_min', 'intensity', 'calories_burned', 'notes'],
    data.workouts
      .slice()
      .sort((a, b) => (a.logDate < b.logDate ? -1 : 1))
      .map((w) => [
        w.logDate,
        w.type,
        w.session,
        w.durationMin,
        w.intensity,
        w.caloriesBurned,
        w.notes ?? '',
      ]),
  );
}

export function measurementsCsv(data: AppData): string {
  return toCsv(
    ['log_date', 'waist_cm', 'chest_cm', 'arms_cm', 'thighs_cm', 'neck_cm'],
    data.measurements
      .slice()
      .sort((a, b) => (a.logDate < b.logDate ? -1 : 1))
      .map((m) => [m.logDate, m.waistCm, m.chestCm, m.armsCm, m.thighsCm, m.neckCm]),
  );
}

export function profileCsv(data: AppData): string {
  const p = data.profile;
  return toCsv(
    ['field', 'value'],
    [
      ['start_date', p.startDate],
      ['start_weight_kg', p.startWeightKg],
      ['goal_weight_kg', p.goalWeightKg],
      ['height_cm', p.heightCm],
      ['age_years', p.ageYears],
      ['sex', p.sex],
      ['activity_level', p.activityLevel],
      ['target_calories', p.targetCalories],
      ['target_protein_g', p.targetProteinG],
      ['target_water_l', p.targetWaterL],
      ['target_steps', p.targetSteps],
      ['target_sleep_h', p.targetSleepH],
      ['units', p.units],
    ],
  );
}

export interface ExportFile {
  name: string;
  contents: string;
}

/** Every sheet of the workbook, in metric. */
export function buildExport(data: AppData): ExportFile[] {
  const stamp = todayKey();
  const files: ExportFile[] = [
    { name: `weight-tracker-${stamp}-profile.csv`, contents: profileCsv(data) },
    { name: `weight-tracker-${stamp}-weigh-ins.csv`, contents: weighInsCsv(data) },
  ];
  if (data.meals.length) files.push({ name: `weight-tracker-${stamp}-meals.csv`, contents: mealsCsv(data) });
  if (data.workouts.length)
    files.push({ name: `weight-tracker-${stamp}-workouts.csv`, contents: workoutsCsv(data) });
  if (data.measurements.length)
    files.push({ name: `weight-tracker-${stamp}-measurements.csv`, contents: measurementsCsv(data) });
  return files;
}
