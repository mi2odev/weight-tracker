/**
 * Health guardrails.
 *
 * This app is used for real weight loss, so a target it accepts is a target it
 * is implicitly endorsing. These rules decide what to refuse outright, what to
 * warn about while still letting the user choose, and what to say.
 *
 * Two principles run through all of it:
 *
 * - **A warning is not a block.** Only a genuinely unsafe floor is hard. Above
 *   it the user keeps their choice, because they may well be working with a
 *   doctor who knows more about their case than this app does.
 *
 * - **The tone rule from the spec still applies.** Nothing here shames anyone.
 *   These messages assume good faith and suggest, they do not scold.
 *
 * Pure, so the thresholds are testable without a screen.
 */

import { Profile } from '../data/types';
import {
  KCAL_PER_KG,
  SUGGESTED_DEFICIT_KCAL,
  SUGGESTION_FLOOR_KCAL,
  expectedLossPerWeek,
  healthyWeightRange,
  tdee,
  weightForBmi,
} from './calc';

// ── calorie targets ──────────────────────────────────────────────────────────

/**
 * The floor below which the app will not let a target be *saved*.
 *
 * 1500 for men and 1200 for women are the conventional lower bounds for
 * unsupervised dieting. This is lower than `SUGGESTION_FLOOR_KCAL`, and
 * deliberately so: the app suggests conservatively but accepts a lower number
 * from someone who has a reason for it.
 *
 * Every piece of copy that quotes a floor derives it from here — the two
 * numbers used to be written out by hand in different places and had already
 * drifted apart.
 */
export function calorieFloor(sex: Profile['sex']): number {
  return sex === 'Male' ? 1500 : 1200;
}

/** "We suggest a 750 kcal deficit, never below 1,500 kcal…" — built, not typed. */
export function calorieTargetExplainer(sex: Profile['sex']): string {
  const suggestion = SUGGESTION_FLOOR_KCAL.toLocaleString('en-GB');
  const floor = calorieFloor(sex).toLocaleString('en-GB');
  const both =
    calorieFloor(sex) === SUGGESTION_FLOOR_KCAL
      ? `never below ${suggestion} kcal`
      : `never below ${suggestion} kcal, and it will not save a target under ${floor} kcal`;
  return `We suggest a ${SUGGESTED_DEFICIT_KCAL} kcal deficit, ${both}. Change it if your coach or doctor says otherwise.`;
}

/** Well above any plausible real target; catches a slipped decimal point. */
export const CALORIE_CEILING = 6000;

/**
 * Losing more than roughly 1% of body weight per week is faster than is
 * generally advised outside medical supervision.
 */
const FAST_LOSS_FRACTION = 0.01;

export interface TargetCheck {
  /** Set when the value cannot be saved at all. */
  error: string | null;
  /** Set when it can be saved but is worth a second thought. */
  warning: string | null;
}

/**
 * Checks a proposed calorie target against the hard floor, a sanity ceiling,
 * and the pace it implies for this body.
 */
export function checkCalorieTarget(
  targetCalories: number,
  profile: Profile,
  currentWeightKg: number,
): TargetCheck {
  const floor = calorieFloor(profile.sex);

  if (!Number.isFinite(targetCalories)) {
    return { error: 'Enter a calorie target.', warning: null };
  }
  if (targetCalories < floor) {
    return {
      error: `${floor.toLocaleString('en-GB')} kcal is the lowest this app will set. Eating less than that without a doctor's supervision tends to cost you muscle and energy rather than fat.`,
      warning: null,
    };
  }
  if (targetCalories > CALORIE_CEILING) {
    return {
      error: `${CALORIE_CEILING.toLocaleString('en-GB')} kcal is the highest this app will set — check the number.`,
      warning: null,
    };
  }

  // The deficit this target implies, expressed as a share of body weight.
  // Null under 18, where the app sets no target at all — the caller should
  // not have reached this, and there is certainly no pace to warn about.
  const perWeek = expectedLossPerWeek(currentWeightKg, { ...profile, targetCalories });
  const fastThreshold = currentWeightKg * FAST_LOSS_FRACTION;

  if (perWeek != null && perWeek > fastThreshold) {
    const gentler = suggestedGentlerTarget(profile, currentWeightKg);
    return {
      error: null,
      warning: `That works out to about ${perWeek.toFixed(1)} kg a week, which is faster than the usual guidance of around 1% of body weight. A slower pace is easier to hold on to — roughly ${gentler.toLocaleString('en-GB')} kcal would get you there. It is your call, though.`,
    };
  }

  return { error: null, warning: null };
}

/** The target that would land at about 1% of body weight per week. */
export function suggestedGentlerTarget(profile: Profile, currentWeightKg: number): number {
  // 7 700 kcal ≈ 1 kg, so the daily deficit for a week's safe loss is that
  // loss × 7 700 ÷ 7. Eat maintenance minus that.
  const dailyDeficit = (currentWeightKg * FAST_LOSS_FRACTION * KCAL_PER_KG) / 7;
  // Rounded *up* to the nearest 50, never to the nearest: rounding down means
  // a slightly bigger deficit, and a suggestion that still trips the warning
  // it was offered to avoid.
  const target = Math.ceil((tdee(currentWeightKg, profile) - dailyDeficit) / 50) * 50;
  return Math.max(calorieFloor(profile.sex), target);
}

// ── goal weight ──────────────────────────────────────────────────────────────

/** Below this BMI the app refuses to set a goal at all. */
export const BLOCKED_GOAL_BMI = 17;

export interface GoalCheck {
  error: string | null;
  warning: string | null;
}

/**
 * Judges a goal weight against the BMI bands for this height.
 *
 * A goal under BMI 17 is refused: that is the clinical threshold for moderate
 * thinness, and an app that cheerfully counts a user down to it is doing harm.
 * Between 17 and 18.5 it warns and lets them decide, since BMI is a crude
 * instrument and a lean, short, or athletic person is not an emergency.
 */
export function checkGoalWeight(goalWeightKg: number, profile: Profile): GoalCheck {
  const { lowKg } = healthyWeightRange(profile.heightCm);
  const floorKg = weightForBmi(BLOCKED_GOAL_BMI, profile.heightCm);

  if (goalWeightKg < floorKg) {
    return {
      error: `For your height, ${goalWeightKg.toFixed(1)} kg would be well below a healthy weight, so this app will not set it as a goal. The lowest it will accept is ${floorKg.toFixed(1)} kg. If a doctor has advised a weight in this range, they are the right person to track it with.`,
      warning: null,
    };
  }

  if (goalWeightKg < lowKg) {
    return {
      error: null,
      warning: `${goalWeightKg.toFixed(1)} kg is a little under the healthy range for your height, which starts around ${lowKg.toFixed(1)} kg. Worth a conversation with a doctor before you aim there. You can still set it.`,
    };
  }

  return { error: null, warning: null };
}

// ── age ──────────────────────────────────────────────────────────────────────

/**
 * Mifflin-St Jeor and the whole deficit model behind this app are built for
 * adult bodies. Rather than lock under-18s out — a teenager may be tracking
 * at a doctor's request, and shutting the door does not help them — the app
 * accepts them and turns the prescribing off: no suggested deficit, no
 * calorie target, no projected goal date.
 */
export { ADULT_AGE, isAdult } from './calc';

export const UNDER_18_NOTICE =
  'You are under 18, so this app will not set a calorie target or a weight-loss pace for you — the formulas behind those are built for adult bodies. Everything else works: you can log your weight and habits and see your own trend. For anything about what to aim for, a doctor or a parent is the right place to start.';

// ── rapid loss ───────────────────────────────────────────────────────────────

/**
 * Sustained loss faster than this share of body weight per week is worth
 * flagging, whatever the target says the plan is.
 */
const RAPID_LOSS_FRACTION = 0.015;

/**
 * True when the measured 14-day trend shows loss faster than ~1.5% of body
 * weight per week.
 *
 * Deliberately driven by `trendPerDay`, which already requires two weeks of
 * data: "sustained over two weeks" is exactly what that function measures, so
 * a single heavy dehydration day cannot trigger this on its own.
 */
export function isLosingTooFast(trendPerDay: number | null, currentWeightKg: number): boolean {
  if (trendPerDay == null || trendPerDay >= 0) return false;
  const lossPerWeek = -trendPerDay * 7;
  return lossPerWeek > currentWeightKg * RAPID_LOSS_FRACTION;
}

export function rapidLossMessage(lossPerWeekKg: number): string {
  return `You have been losing about ${lossPerWeekKg.toFixed(1)} kg a week for the last fortnight, which is quicker than the usual guidance. That is worth mentioning to a doctor or dietitian — not because anything is wrong, but because they can check you are losing fat rather than muscle.`;
}
