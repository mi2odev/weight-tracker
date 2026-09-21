import React from 'react';
import { Pressable, StyleProp, TextInput, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { font, MIN_TAP, radius, space, tnum } from '../theme/tokens';
import { Body, Caption, Heading, Label } from './Type';
import { Icon, IconName } from './Icon';

export function PrimaryButton({
  label,
  onPress,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          minHeight: 50,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: disabled ? colors.card : pressed ? colors.accentPressed : colors.accent,
          borderWidth: disabled ? 1 : 0,
          borderColor: colors.line,
        },
        style,
      ]}
    >
      <Body
        style={{ fontFamily: font.semibold, fontSize: 16 }}
        color={disabled ? colors.disabled : colors.onAccent}
      >
        {label}
      </Body>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  style,
  dashed = false,
  tone = 'accent',
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  dashed?: boolean;
  tone?: 'accent' | 'muted';
}) {
  const { colors } = useTheme();
  const fg = tone === 'accent' ? colors.accent : colors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: MIN_TAP + 6,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: tone === 'accent' && !dashed ? colors.line : fg,
          backgroundColor: pressed ? colors.tint : 'transparent',
        },
        style,
      ]}
    >
      <Body style={{ fontFamily: font.semibold, fontSize: 15 }} color={fg}>
        {label}
      </Body>
    </Pressable>
  );
}

/** The 48 × 29 pill switch from the Today screen's Strength tile. */
export function Toggle({
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  accessibilityLabel?: string;
  /** For a switch the device cannot satisfy — reads as off and stays put. */
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      onPress={disabled ? undefined : () => onChange(!value)}
      style={{
        width: 48,
        height: 29,
        borderRadius: radius.pill,
        backgroundColor: value ? colors.accent : colors.line,
        opacity: disabled ? 0.45 : 1,
        padding: 3,
        flexDirection: 'row',
        justifyContent: value ? 'flex-end' : 'flex-start',
      }}
    >
      <View style={{ width: 23, height: 23, borderRadius: radius.pill, backgroundColor: '#FFFFFF' }} />
    </Pressable>
  );
}

/** Week / Month on Trends. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.md,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt)}
            style={{
              flex: 1,
              minHeight: MIN_TAP - 4,
              borderRadius: radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.tint : 'transparent',
            }}
          >
            <Body
              style={{ fontFamily: font.semibold, fontSize: 14 }}
              color={active ? colors.accent : colors.muted}
            >
              {opt}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A labelled numeric field — the shape used across Today, Settings and the sheets. */
export function NumberField({
  label,
  hint,
  value,
  unit,
  onChangeText,
  placeholder = '—',
  valueColor,
}: {
  label: string;
  hint?: string;
  value: string;
  unit?: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  valueColor?: string;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = React.useState(false);

  // Grouped thousands at rest, raw digits while editing — a separator that
  // appears mid-keystroke fights the caret.
  const parsed = Number(value);
  const display =
    !focused && value !== '' && Number.isFinite(parsed)
      ? parsed.toLocaleString('en-GB', { maximumFractionDigits: 2 })
      : value;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.md,
        paddingHorizontal: 13,
        paddingVertical: 11,
        gap: 2,
      }}
    >
      <Label numberOfLines={1}>{label}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs }}>
        <TextInput
          value={display}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.disabled}
          keyboardType="decimal-pad"
          inputMode="decimal"
          accessibilityLabel={label}
          style={[
            {
              flex: 1,
              minWidth: 0,
              padding: 0,
              fontFamily: font.semibold,
              fontSize: 20,
              letterSpacing: -0.4,
              color: valueColor ?? colors.text,
            },
            tnum,
          ]}
        />
        {!!unit && <Caption style={{ fontSize: 11 }}>{unit}</Caption>}
      </View>
      {!!hint && <Caption numberOfLines={1}>{hint}</Caption>}
    </View>
  );
}

/** A full-width row with a label on the left and a value on the right. */
export function ValueRow({
  label,
  note,
  value,
  valueColor,
  onPress,
  last = false,
}: {
  label: string;
  note?: string;
  value: string;
  valueColor?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: MIN_TAP + 8,
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.line,
      }}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>{label}</Body>
        {!!note && <Caption style={{ fontSize: 11.5 }}>{note}</Caption>}
      </View>
      <Body
        style={[{ fontFamily: font.semibold, fontSize: 15 }, tnum]}
        color={valueColor ?? colors.text}
      >
        {value}
      </Body>
      {!!onPress && <Icon name="chevronRight" size={13} color={colors.disabled} />}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

/** Section heading above a group of cards. */
export function SectionHeading({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
      }}
    >
      <Heading>{title}</Heading>
      {!!trailing && <Caption style={{ fontSize: 11.5 }}>{trailing}</Caption>}
    </View>
  );
}

/** The dashed panel every locked / empty state uses. */
export function EmptyState({ icon, message }: { icon: IconName; message: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.line,
        borderRadius: radius.lg,
        paddingVertical: 40,
        paddingHorizontal: space.xl,
        alignItems: 'center',
        gap: space.md,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.pill,
          backgroundColor: colors.tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={20} color={colors.accent} />
      </View>
      <Body style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }} color={colors.muted}>
        {message}
      </Body>
    </View>
  );
}
