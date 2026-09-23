import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useStore } from './store';
import { InboxItem, inboxItems, unreadCount } from '../lib/inbox';

/**
 * The clock, to the minute.
 *
 * The inbox depends on the time of day (the weigh-in nudge appears at 07:00
 * whether or not anything was logged), so it has to re-derive as time passes,
 * not only when data changes. Coming back to the foreground re-reads it at
 * once, since timers do not run while the app is in the background.
 */
function useMinuteClock(): number {
  const read = () => Math.floor(Date.now() / 60000);
  const [minute, setMinute] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => setMinute(read()), 30000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setMinute(read());
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return minute;
}

export function useInbox(): {
  items: InboxItem[];
  unread: number;
  isRead: (id: string) => boolean;
  markRead: (ids: string[]) => void;
} {
  const { data, markInboxRead } = useStore();
  const minute = useMinuteClock();
  const items = useMemo(() => inboxItems(data, new Date(minute * 60000)), [data, minute]);
  const read = useMemo(() => new Set(data.inboxRead), [data.inboxRead]);
  return {
    items,
    unread: unreadCount(items, data.inboxRead),
    isRead: (id) => read.has(id),
    markRead: markInboxRead,
  };
}
