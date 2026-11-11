/** The demo's pages: the same paths as the app, under `/demo` (English) and `/es/demo` (Spanish). */
import type { Locale } from '../../i18n';

export const demoViews = [
  '',
  'movements',
  'movements/calendar',
  'movements/recurring',
  'stats',
  'plan',
  'settings',
] as const;
export type DemoView = (typeof demoViews)[number];

export function isDemoView(value: string): value is DemoView {
  return (demoViews as readonly string[]).includes(value);
}

export const demoPrefix: Record<Locale, string> = { en: '/demo', es: '/es/demo' };

export function demoPath(locale: Locale, view: DemoView): string {
  return view ? `${demoPrefix[locale]}/${view}` : demoPrefix[locale];
}
