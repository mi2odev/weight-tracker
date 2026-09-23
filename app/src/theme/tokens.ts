/**
 * Design tokens — transcribed from the Claude Design handoff
 * (`project/Weight Tracker - Screens.dc.html`, artboard 1a "Style frame").
 *
 * The palette below is the one the user pasted verbatim in the design chat.
 * Dark-mode values for the derived roles (tints, rails, neutral data) come from
 * the `TodayScreen.dc.html` / `ProgressScreen.dc.html` theme maps.
 */

export type Mode = 'light' | 'dark';

export interface Palette {
  page: string;
  card: string;
  line: string;
  text: string;
  muted: string;
  disabled: string;

  accent: string;
  accentPressed: string;
  tint: string;
  onAccent: string;

  /** Progress green — bars, positive deltas. */
  green: string;
  /** Green tuned for small text on the page background. */
  greenText: string;
  greenTint: string;

  caution: string;

  /** Amber-red. Habits only — never weight gain. See RULES below. */
  missed: string;
  missedTint: string;

  /** Un-emphasised data marks: daily weigh-in dots, flat/gain bars. */
  neutral: string;
  /** Track behind a progress bar. */
  rail: string;

  /** 0 → 6 habits met. */
  heat: readonly string[];
}

const light: Palette = {
  page: '#FAFAF8',
  card: '#FFFFFF',
  line: '#E6E5E0',
  text: '#1C1C1A',
  muted: '#6B6B66',
  disabled: '#A3A29C',

  accent: '#2F6C7A',
  accentPressed: '#1F4F5C',
  tint: '#E3EFF2',
  onAccent: '#FFFFFF',

  green: '#4F8A6B',
  greenText: '#3E7057',
  greenTint: '#E4EFE8',

  caution: '#B5763C',

  missed: '#A8544A',
  missedTint: '#F5E9E7',

  neutral: '#C9C8C2',
  rail: '#EFEEE9',

  heat: ['#F0EFEA', '#DCE7EA', '#BCD2D8', '#98B8C1', '#7099A6', '#4E7F8D', '#2F6C7A'],
};

const dark: Palette = {
  page: '#17181A',
  card: '#1F2124',
  line: '#2E3134',
  text: '#F0EFEC',
  muted: '#A0A09B',
  disabled: '#6E6E69',

  accent: '#5FA3B3',
  accentPressed: '#4A8A99',
  tint: '#22343A',
  onAccent: '#0F1112',

  green: '#4F8A6B',
  greenText: '#7FB995',
  greenTint: '#1E2A24',

  caution: '#C98B4F',

  missed: '#A8544A',
  missedTint: '#2C1F1E',

  neutral: '#4A4B48',
  rail: '#2A2D30',

  // The handoff only specified a light ramp; this is the same 0→6 walk
  // interpolated between the dark card and the dark-mode accent.
  heat: ['#1F2124', '#253A41', '#2C525E', '#366B7A', '#428496', '#4F94A6', '#5FA3B3'],
};

export const palettes: Record<Mode, Palette> = { light, dark };

/** 4 pt base — the only spacing values the design uses. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Card radii — softened from the handoff's 14 / 18 for a rounder, current look — plus the pill used for controls. */
export const radius = { sm: 12, md: 16, lg: 22, pill: 999 } as const;

export const font = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
} as const;

/**
 * Type ramp from artboard 1a. The design expresses tracking in `em`; React
 * Native wants points, so each value is pre-multiplied by its own size.
 */
export const type = {
  display: { fontFamily: font.semibold, fontSize: 68, letterSpacing: -3.06, lineHeight: 69 },
  hero: { fontFamily: font.semibold, fontSize: 54, letterSpacing: -2.16, lineHeight: 54 },
  title: { fontFamily: font.semibold, fontSize: 28, letterSpacing: -0.56 },
  stat: { fontFamily: font.semibold, fontSize: 21, letterSpacing: -0.42 },
  body: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 19 },
  label: { fontFamily: font.semibold, fontSize: 10.5, letterSpacing: 0.735, textTransform: 'uppercase' as const },
  /** The slightly larger uppercase eyebrow used on hero cards. */
  eyebrow: { fontFamily: font.semibold, fontSize: 11, letterSpacing: 0.99, textTransform: 'uppercase' as const },
} as const;

/** Columns of numbers must align — applied to every figure in the app. */
export const tnum = { fontVariant: ['tabular-nums' as const] };

/** Minimum tap target, per the spec's accessibility requirement. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
export const MIN_TAP = 44;

/**
 * The five rules written on the style frame. Kept here because they are
 * design constraints the code has to honour, not decoration:
 *
 * 1. Colour is never the only signal — every green or red value carries an
 *    arrow or a sign.
 * 2. Amber-red marks a missed habit only, never a weight gain.
 * 3. Cards: hairline border OR light shadow, never both.
 * 4. Tap targets 44 pt minimum. Spacing on a 4 pt base.
 * 5. Figures are tabular everywhere.
 */
