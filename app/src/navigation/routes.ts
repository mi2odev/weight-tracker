import { TabKey } from '../components/TabBar';

/** Screens reached from More, or pushed over a tab. */
export type SubScreen = 'milestones' | 'body' | 'log' | 'settings' | 'privacy';

export type Route = { kind: 'tab'; tab: TabKey } | { kind: 'sub'; screen: SubScreen; from: TabKey };

export const HOME: Route = { kind: 'tab', tab: 'today' };
