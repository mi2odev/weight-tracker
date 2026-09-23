import React from 'react';
import { Pressable, StyleProp, TextInput, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { font, MIN_TAP, radius, space, tnum } from '../theme/tokens';
import { Body, Caption, Heading, Label } from './Type';
import { Icon, IconName } from './Icon';
import { parseDecimalInput, readFieldEntry } from '../lib/numberInput';

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
            style={({ pressed }) => ({
              opacity: pressed && !active ? 0.7 : 1,
              flex: 1,
              minHeight: MIN_TAP - 4,
              borderRadius: radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.tint : 'transparent',
            })}
          >
            <Body
              style={{ fontFamily: font.semibold, fontSize: 14 }}
              color={active ? colors.accent : colors.muted}
            >
              {/* Values are often lower-case keys ('metric'); labels are not. */}
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
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
  additive = false,
}: {
  label: string;
  hint?: string;
  value: string;
  unit?: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  valueColor?: string;
  /**
   * Lets the field add to itself: "+12" on a field holding 10 stores 22, and
   * a + button starts that (phone number pads have no + key).
   */
  additive?: boolean;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = React.useState<string | null>(null);
  /** What the field held when editing began — what "+12" adds to. */
  const base = React.useRef<number | null>(null);
  /** Set by the + button so focusing starts an addition rather than an edit. */
  const startAdding = React.useRef(false);

  /**
   * While focused the field shows what was typed, not what the store made of
   * it.
   *
   * Without this, any field bound to a parsed number could never accept a
   * decimal point: typing "2." round-trips through `parseFloat` as 2, the
   * prop comes back "2", and the point is erased on the next render. Worse
   * than losing a keystroke — "2.5" ended up stored as 25.
   *
   * The draft is dropped on blur, so the formatted value takes over again and
   * the store stays the single source of truth between edits.
   */
  const parsed = Number(value);
  const display =
    draft ??
    (value !== '' && Number.isFinite(parsed)
      ? parsed.toLocaleString('en-GB', { maximumFractionDigits: 2 })
      : value);

  const inputRef = React.useRef<TextInput>(null);

  const entry = additive && draft != null ? readFieldEntry(draft, base.current) : null;
  const adding = additive && draft != null && /^\s*[+\-−]/.test(draft);
  const beginAdd = () => {
    base.current = parseDecimalInput(value);
    if (inputRef.current?.isFocused()) setDraft('+');
    else {
      startAdding.current = true;
      inputRef.current?.focus();
    }
  };

  return (
    <Pressable
      // The whole card is the target, not just the digits: a thumb landing on
      // the label or the hint should still open the keyboard.
      onPress={() => inputRef.current?.focus()}
      accessible={false}
      style={{
        // Deliberately not `flex: 1`. Every one of these sits in a `Grid`
        // cell, and a cell is a *column*, so `flex: 1` sets flexBasis 0 on the
        // vertical axis of a parent whose height comes from this child. Web
        // flexbox falls back to the content height; Yoga on Android collapses
        // it, and the field rendered as an empty pill with no label, no
        // placeholder and nothing to tap. The cell already supplies the width.
        alignSelf: 'stretch',
        // A floor, so no future parent can squeeze the contents out of sight.
        minHeight: 62,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.md,
        paddingHorizontal: 13,
        paddingVertical: 11,
        gap: 2,
      }}
    >
      {/* The unit sits with the label rather than trailing the input: an
          input that fills the row pushed it to the far edge, detached from
          the number it describes. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <Label numberOfLines={1} style={{ flexShrink: 1 }}>{label}</Label>
        {!!unit && (
          <Caption style={{ fontSize: 11, marginLeft: 'auto' }} numberOfLines={1}>
            {unit}
          </Caption>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <TextInput
          ref={inputRef}
          value={display}
          // Seeded from the raw value, never from the grouped display — the
          // caret should not land after a separator the user did not type.
          onFocus={() => {
            base.current = parseDecimalInput(value);
            setDraft(startAdding.current ? '+' : value);
            startAdding.current = false;
          }}
          onBlur={() => setDraft(null)}
          onChangeText={(text) => {
            setDraft(text);
            if (!additive) {
              onChangeText(text);
              return;
            }
            // "+" alone waits for a number; anything else stores the result.
            const next = readFieldEntry(text, base.current);
            if (next.kind === 'value') onChangeText(next.value == null ? '' : String(next.value));
            // Backspaced to a bare sign: the addition is gone, so is its total.
            else if (parseDecimalInput(value) !== base.current)
              onChangeText(base.current == null ? '' : String(base.current));
          }}
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
              // The card is the focus affordance; the browser's ring on the
              // bare input (web builds only) just boxed the digits.
              outlineWidth: 0,
              fontFamily: font.semibold,
              fontSize: 20,
              letterSpacing: -0.4,
              // An addition in progress isn't a missed target yet.
              color: adding ? colors.accent : (valueColor ?? colors.text),
            },
            tnum,
          ]}
        />
        {additive && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add to ${label}`}
            hitSlop={8}
            onPress={beginAdd}
            style={({ pressed }) => ({
              width: 30,
              height: 30,
              borderRadius: 15,
              alignSelf: 'center',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.line : colors.tint,
            })}
          >
            <Icon name="plus" size={14} color={colors.accent} strokeWidth={2.2} />
          </Pressable>
        )}
      </View>
      {adding && entry ? (
        // The sum spelled out while adding, so it is clear what will be stored.
        <Caption numberOfLines={1} color={colors.accent}>
          {entry.kind === 'pending'
            ? `Adding to ${formatAmount(base.current ?? 0)}…`
            : // The amount as typed, not the difference: "-50" on 22 reads
              // "22 − 50 = 0", since the total is floored at zero.
              `${formatAmount(base.current ?? 0)} ${draft!.trim()[0] === '+' ? '+' : '−'} ${formatAmount(
                parseDecimalInput(draft!.trim().slice(1)) ?? 0,
              )} = ${formatAmount(entry.value ?? 0)}`}
        </Caption>
      ) : (
        !!hint && <Caption numberOfLines={1}>{hint}</Caption>
      )}
    </Pressable>
  );
}

const formatAmount = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 2 });

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
