/**
 * What every movements island needs from the server (one place, so pages and the layout agree).
 * The categories query runs once per request even when the layout and the page both ask.
 */
import { todayIn } from '../dates';
import { db } from '../db';
import type { CategoryOption } from './model';
import { listCategories } from './repo';

export interface MovementsContext {
  locale: 'en' | 'es';
  currency: string;
  /** The user's today, `YYYY-MM-DD`, in their time zone. */
  today: string;
  weekStart: 1 | 7;
  categories: CategoryOption[];
}

const cache = new WeakMap<App.Locals, Promise<MovementsContext>>();

export function movementsContext(locals: App.Locals): Promise<MovementsContext> {
  const { user, profile } = locals;
  if (!user || !profile) throw new Error('movementsContext needs a signed-in request');
  let context = cache.get(locals);
  if (!context) {
    const today = todayIn(profile.timezone);
    context = listCategories(db, user.id, today).then((categories) => ({
      locale: profile.locale,
      currency: profile.currency,
      today,
      weekStart: profile.weekStart === 7 ? 7 : 1,
      categories,
    }));
    cache.set(locals, context);
  }
  return context;
}
