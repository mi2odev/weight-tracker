import { Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space } from '../theme/tokens';
import { useInbox } from '../data/useInbox';
import { GhostButton } from '../components/Controls';
import { Icon, IconName } from '../components/Icon';
import { Screen } from '../components/Screen';
import { Body, Caption } from '../components/Type';
import { InboxItem, InboxKind, InboxTarget, inboxWhen } from '../lib/inbox';
import { useStore } from '../data/store';

const ICONS: Record<InboxKind, IconName> = {
  weigh: 'weight',
  water: 'water',
  evening: 'habit',
  milestone: 'star',
  week: 'bars',
  streak: 'rate',
  measure: 'ruler',
  custom: 'bell',
};

export function InboxScreen({
  onBack,
  onOpen,
  onOpenSettings,
}: {
  onBack: () => void;
  onOpen: (target: InboxTarget) => void;
  onOpenSettings: () => void;
}) {
  const { colors } = useTheme();
  const { items, unread, isRead, markRead } = useInbox();
  const { today } = useStore();

  const fresh = items.filter((i) => !isRead(i.id));
  const earlier = items.filter((i) => isRead(i.id));

  const open = (item: InboxItem) => {
    markRead([item.id]);
    onOpen(item.target);
  };

  return (
    <Screen title="Inbox" meta={unread ? `${unread} new` : 'All caught up'} onBack={onBack}>
      {!items.length && (
        <View style={{ alignItems: 'center', paddingVertical: space.xxl * 2, gap: space.md }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.tint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="check" size={28} color={colors.accent} strokeWidth={2} />
          </View>
          <Body style={{ fontFamily: font.semibold, fontSize: 17 }}>You're all caught up</Body>
          <Caption style={{ textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
            Reminders, milestones and your weekly review land here as they happen.
          </Caption>
        </View>
      )}

      {fresh.length > 0 && <Group title="New" items={fresh} unread today={today} onOpen={open} />}
      {earlier.length > 0 && <Group title="Earlier" items={earlier} today={today} onOpen={open} />}

      {unread > 0 && (
        <GhostButton label="Mark all as read" onPress={() => markRead(fresh.map((i) => i.id))} />
      )}
      <GhostButton label="Notification settings" tone="muted" onPress={onOpenSettings} />
    </Screen>
  );
}

function Group({
  title,
  items,
  unread = false,
  today,
  onOpen,
}: {
  title: string;
  items: InboxItem[];
  unread?: boolean;
  today: string;
  onOpen: (item: InboxItem) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.sm, marginBottom: space.md }}>
      <Caption style={{ fontFamily: font.semibold, fontSize: 12, paddingHorizontal: space.xs }}>{title}</Caption>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.body}`}
          onPress={() => onOpen(item)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            gap: space.md,
            padding: space.md + 2,
            borderRadius: radius.lg,
            backgroundColor: pressed ? colors.tint : colors.card,
            borderWidth: 1,
            borderColor: unread ? colors.accent + '55' : colors.line,
          })}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: unread ? colors.tint : colors.rail,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={ICONS[item.kind]} size={18} color={unread ? colors.accent : colors.muted} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Body style={{ flex: 1, fontFamily: font.semibold, fontSize: 14.5 }} numberOfLines={1}>
                {item.title}
              </Body>
              <Caption style={{ fontSize: 11 }}>{inboxWhen(item.date, today)}</Caption>
              {unread && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
              )}
            </View>
            <Caption style={{ fontSize: 12.5, lineHeight: 18 }} color={colors.muted}>
              {item.body}
            </Caption>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
