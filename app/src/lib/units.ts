/**
 * Unit display.
 *
 * Storage is always metric — the spec is explicit that imperial is "display
 * only ... always store metric". So nothing here is ever persisted: these
 * functions convert on the way to the screen, and `parse*` converts back to
 * metric on the way in from a text field.
 */

import { Units } from '../data/types';
import { parseDecimalInput } from './numberInput';

const LB_PER_KG = 2.2046226218;
const IN_PER_CM = 0.3937007874;
const FLOZ_PER_L = 33.814022702; // US fluid ounces

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const cmToIn = (cm: number) => cm * IN_PER_CM;
export const inToCm = (inches: number) => inches / IN_PER_CM;
export const litresToFlOz = (l: number) => l * FLOZ_PER_L;
export const flOzToLitres = (oz: number) => oz / FLOZ_PER_L;

export interface UnitLabels {
  weight: string;
  length: string;
  volume: string;
}

export const labelsFor = (units: Units): UnitLabels =>
  units === 'imperial'
    ? { weight: 'lb', length: 'in', volume: 'fl oz' }
    : { weight: 'kg', length: 'cm', volume: 'L' };

/**
 * A formatter bound to one `units` setting.
 *
 * Every screen takes one of these rather than calling `f1(kg) + ' kg'`, so a
 * weight cannot be rendered in the wrong unit by omission.
 */
export interface UnitFormatter {
  units: Units;
  labels: UnitLabels;

  /** The number alone, for when the unit is rendered separately. */
  weightValue: (kg: number | null | undefined, decimals?: number) => string;
  /** Number and unit together, e.g. "152.2 kg" / "335.5 lb". */
  weight: (kg: number | null | undefined, decimals?: number) => string;
  /** A signed delta with its arrow, e.g. "↓ 0.3 kg". Colour is never the only signal. */
  weightDelta: (kg: number | null | undefined) => string;

  lengthValue: (cm: number | null | undefined, decimals?: number) => string;
  length: (cm: number | null | undefined, decimals?: number) => string;
  /** Height reads as 5'10" in imperial, 178 cm in metric. */
  height: (cm: number) => string;

  volumeValue: (litres: number | null | undefined, decimals?: number) => string;
  volume: (litres: number | null | undefined, decimals?: number) => string;

  /** Text field → metric, for saving. */
  parseWeight: (text: string) => number | null;
  parseLength: (text: string) => number | null;
  parseVolume: (text: string) => number | null;

  /** Metric → the text a field should show. */
  weightField: (kg: number | null | undefined) => string;
  lengthField: (cm: number | null | undefined) => string;
  volumeField: (litres: number | null | undefined) => string;
}

/** See `numberInput.ts` — "1,250" must not read back as 1. */
const num = parseDecimalInput;

function fixed(value: number | null | undefined, decimals: number): string {
  return value == null || Number.isNaN(value) ? '—' : value.toFixed(decimals);
}

export function formatterFor(units: Units): UnitFormatter {
  const imperial = units === 'imperial';
  const labels = labelsFor(units);

  const toWeight = (kg: number) => (imperial ? kgToLb(kg) : kg);
  const toLength = (cm: number) => (imperial ? cmToIn(cm) : cm);
  const toVolume = (l: number) => (imperial ? litresToFlOz(l) : l);

  const weightValue = (kg: number | null | undefined, decimals = 1) =>
    kg == null ? '—' : fixed(toWeight(kg), decimals);

  const lengthValue = (cm: number | null | undefined, decimals = 1) =>
    cm == null ? '—' : fixed(toLength(cm), decimals);

  // Fluid ounces are a coarser unit than litres, so they lose the decimal.
  const volumeValue = (l: number | null | undefined, decimals = imperial ? 0 : 1) =>
    l == null ? '—' : fixed(toVolume(l), decimals);

  return {
    units,
    labels,

    weightValue,
    weight: (kg, decimals = 1) => (kg == null ? '—' : `${weightValue(kg, decimals)} ${labels.weight}`),
    weightDelta: (kg) => {
      if (kg == null) return '—';
      const shown = toWeight(Math.abs(kg));
      // Below a tenth of the displayed unit there is nothing to report.
      if (shown < 0.05) return 'No change';
      return `${kg < 0 ? '↓' : '↑'} ${shown.toFixed(1)} ${labels.weight}`;
    },

    lengthValue,
    length: (cm, decimals = 1) => (cm == null ? '—' : `${lengthValue(cm, decimals)} ${labels.length}`),
    height: (cm) => {
      if (!imperial) return `${Math.round(cm)} cm`;
      const totalInches = Math.round(cmToIn(cm));
      return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
    },

    volumeValue,
    volume: (l, decimals) => (l == null ? '—' : `${volumeValue(l, decimals)} ${labels.volume}`),

    parseWeight: (text) => {
      const v = num(text);
      return v == null ? null : imperial ? lbToKg(v) : v;
    },
    parseLength: (text) => {
      const v = num(text);
      return v == null ? null : imperial ? inToCm(v) : v;
    },
    parseVolume: (text) => {
      const v = num(text);
      return v == null ? null : imperial ? flOzToLitres(v) : v;
    },

    // Fields hold a plain number with no separator, so they round-trip through
    // parse* without the formatter's grouping getting in the way.
    weightField: (kg) => (kg == null ? '' : String(Math.round(toWeight(kg) * 10) / 10)),
    lengthField: (cm) => (cm == null ? '' : String(Math.round(toLength(cm) * 10) / 10)),
    // Two places in litres: quick-add works in 250 ml steps, and rounding
    // 3.05 L to "3.1" showed a figure nobody logged.
    volumeField: (l) =>
      l == null ? '' : String(imperial ? Math.round(toVolume(l)) : Math.round(toVolume(l) * 100) / 100),
  };
}

/** The metric formatter, for code paths with no profile to hand. */
export const METRIC = formatterFor('metric');

// ── quick-add water ──────────────────────────────────────────────────────────

export interface WaterStep {
  /** What the button says: "+250 ml", "+8 fl oz". */
  label: string;
  /** Always stored in litres, whatever the button says. */
  litres: number;
}

/**
 * The two quick-add buttons under the water field.
 *
 * Water is logged a glass at a time through the day, so typing a running total
 * with a decimal point in it is the wrong interaction entirely. A glass and a
 * bottle, in the unit people actually pour in.
 */
export function waterSteps(units: Units): WaterStep[] {
  return units === 'imperial'
    ? [
        { label: '+8 fl oz', litres: flOzToLitres(8) },
        { label: '+16 fl oz', litres: flOzToLitres(16) },
      ]
    : [
        { label: '+250 ml', litres: 0.25 },
        { label: '+500 ml', litres: 0.5 },
      ];
}

/**
 * Adds a glass to the day's total.
 *
 * Rounded to the millilitre, because floating point would otherwise turn four
 * glasses of 0.25 into 0.9999999 and a fifth into something the field then
 * shows as "1.2" while the habit check compares against 1.25.
 */
export function addWater(currentLitres: number | null | undefined, stepLitres: number): number {
  return Math.round(((currentLitres ?? 0) + stepLitres) * 1000) / 1000;
}
