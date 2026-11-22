/** First-paint setup shared by every demo page: today in the visitor's time zone and the sample state. */
import type { Locale } from '../../i18n';
import { isTimeZone, todayIn } from '../dates';
import { buildDemoState } from './fixture';
import { categoryOptions } from './store';

export function demoSetup(request: Request, locale: Locale) {
  const zone = request.headers.get('x-vercel-ip-timezone') ?? '';
  const today = todayIn(isTimeZone(zone) ? zone : 'Europe/Madrid');
  const state = buildDemoState(today, locale);
  const common = { locale, currency: state.currency, today, categories: categoryOptions(state) };
  return { today, state, common };
}
