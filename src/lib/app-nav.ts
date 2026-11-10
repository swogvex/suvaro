/** App sections shared by the desktop header tabs and the mobile dock. */
import type { UiKey } from '../i18n';
import type { IconName } from './icons';
import { appPaths } from './routes';

export type AppSection = 'home' | 'movements' | 'stats' | 'plan';

export const appSections: readonly { key: AppSection; href: string; label: UiKey; icon: IconName }[] = [
  { key: 'home', href: appPaths.app, label: 'app.home', icon: 'house' },
  { key: 'movements', href: appPaths.movements, label: 'app.movements', icon: 'list' },
  { key: 'stats', href: appPaths.stats, label: 'app.stats', icon: 'chart' },
  { key: 'plan', href: appPaths.plan, label: 'app.plan', icon: 'target' },
];
