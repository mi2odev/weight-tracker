import React from 'react';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { tnum, type } from '../theme/tokens';

/**
 * The type ramp from the style frame, bound to the theme. Screens use these
 * rather than raw <Text>, so a size or tracking change happens in one place.
 */

type Props = TextProps & {
  /** Overrides the role's default colour. */
  color?: string;
  /** Figures are tabular by default on the numeric roles; opt in elsewhere. */
  numeric?: boolean;
  style?: StyleProp<TextStyle>;
};

function make(base: TextStyle, defaultColor: (c: ReturnType<typeof useTheme>['colors']) => string, alwaysNumeric = false) {
  return function Role({ color, numeric, style, ...rest }: Props) {
    const { colors } = useTheme();
    return (
      <Text
        {...rest}
        style={[base, { color: color ?? defaultColor(colors) }, (alwaysNumeric || numeric) && tnum, style]}
      />
    );
  };
}

export const Display = make(type.display, (c) => c.text, true);
export const Hero = make(type.hero, (c) => c.text, true);
export const Title = make(type.title, (c) => c.text);
export const Stat = make(type.stat, (c) => c.text, true);
export const Body = make(type.body, (c) => c.text);
export const Label = make(type.label, (c) => c.muted);
export const Eyebrow = make(type.eyebrow, (c) => c.muted);

/** 13 px semibold — card titles and section headings. */
export const Heading = make(
  { fontFamily: type.title.fontFamily, fontSize: 13 },
  (c) => c.text,
);

/** 11–13 px supporting copy under a value. */
export const Caption = make(
  { fontFamily: 'IBMPlexSans_500Medium', fontSize: 10.5 },
  (c) => c.muted,
);

export const Meta = make(
  { fontFamily: 'IBMPlexSans_500Medium', fontSize: 13 },
  (c) => c.muted,
);
