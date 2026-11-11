/** Settings sections: the list on `/app/settings`, the side navigation on desktop and search results. */
import type { UiKey } from '../../i18n';
import type { IconName } from '../icons';
import { appPaths } from '../routes';

export type SettingsSection = 'appearance' | 'security';

export const settingsSections: readonly {
  key: SettingsSection;
  href: string;
  title: UiKey;
  lead: UiKey;
  search: UiKey;
  icon: IconName;
}[] = [
  {
    key: 'appearance',
    href: appPaths.appearance,
    title: 'settings.appearance',
    lead: 'settings.appearanceLead',
    search: 'search.appearance',
    icon: 'palette',
  },
  {
    key: 'security',
    href: appPaths.security,
    title: 'settings.security',
    lead: 'settings.securityLead',
    search: 'search.security',
    icon: 'shield',
  },
];
