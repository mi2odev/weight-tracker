import React from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * Every path here is transcribed verbatim from the design files so the icons
 * are the ones that were drawn, not lookalikes. The number is the viewBox the
 * path was authored against.
 */
const PATHS_16 = {
  weight: 'M3 6h10l1.5 7.5H1.5L3 6zM6 6V4.5a2 2 0 014 0V6',
  food: 'M4 2v5a2 2 0 004 0V2M6 7v7M12 2v12M10.5 2v3.5a1.5 1.5 0 003 0V2',
  water: 'M8 1.5S3.5 6.5 3.5 9.5a4.5 4.5 0 009 0C12.5 6.5 8 1.5 8 1.5z',
  steps:
    'M4.5 13.5c-1 0-1.5-.7-1.5-2 0-1.8 1-2.3 1-4.5C4 5.3 4.8 4 6 4s1.8 1 1.8 3-1.3 3.3-1.3 5c0 1-.8 1.5-2 1.5zM11 9.5c-1 0-1.5-.7-1.5-2 0-1.8 1-2.3 1-4.5',
  workout: 'M2 6v4M14 6v4M4 5v6M12 5v6M4 8h8',
  sleep: 'M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z',

  down: 'M8 3v9M4.5 8.5L8 12l3.5-3.5',
  up: 'M8 13V3M4 7l4-4 4 4',
  rate: 'M2.5 12l4-4.5 3 2.5 4-6',
  goal: 'M8 2v12M8 2l6 2-6 2',
  steady: 'M2.5 8h11M11 5.5L13.5 8 11 10.5',
  habit: 'M3 8.5l3.5 3.5L13 5',
  lock: 'M4.5 7V5.5a3.5 3.5 0 017 0V7M3.5 7h9v6.5h-9V7z',

  star: 'M8 2l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4 4.3 13.5l.8-4.2L2 6.4l4.2-.5L8 2z',
  ruler: 'M1 6h14v4H1V6zM4 6v2M7 6v3M10 6v2M13 6v3',
  plate: 'M8 2a6 6 0 100 12A6 6 0 008 2zM8 5a3 3 0 100 6 3 3 0 000-6z',
  gear: 'M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4',
  book: 'M3 2.5h10v11H3v-11zM6 5.5h4M6 8h4M6 10.5h2',
  camera: 'M2 12l3.5-4 2.5 3 2-2.5L14 12M2 4h12v8H2V4z',
  bars: 'M2 13V9m4 4V4m4 9V7m4 6V3',
  plus: 'M8 3v10M3 8h10',
  chevronRight: 'M6 3l5 5-5 5',
  chevronLeft: 'M10 3L5 8l5 5',
  check: 'M3 8.5l3.5 3.5L13 5',
  close: 'M4 4l8 8M12 4l-8 8',
  sun: 'M8 5a3 3 0 100 6 3 3 0 000-6zM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06',
  moon: 'M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5',
} as const;

const PATHS_20 = {
  tabToday: 'M10 3.5v13M3.5 10h13',
  tabProgress: 'M3 13.5l4-4.5 3 2.5 4-6 3 3.5',
  tabTrends: 'M3.5 16.5V11m4.3 5.5V5m4.4 11.5V9m4.3 7.5v-13',
  tabHabits:
    'M3 3.5h5.5V9H3V3.5zM11.5 3.5H17V9h-5.5V3.5zM3 11.5h5.5V17H3v-5.5zM11.5 11.5H17V17h-5.5v-5.5z',
  tabMore: 'M4 10h.01M10 10h.01M16 10h.01',
} as const;

export type IconName = keyof typeof PATHS_16 | keyof typeof PATHS_20;

interface Props {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, color, strokeWidth = 1.7 }: Props) {
  const is20 = name in PATHS_20;
  const d = is20 ? PATHS_20[name as keyof typeof PATHS_20] : PATHS_16[name as keyof typeof PATHS_16];
  const box = is20 ? 20 : 16;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} fill="none">
      <Path
        d={d}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
