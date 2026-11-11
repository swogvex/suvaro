/**
 * Budget alerts for the signed-in user's current cycle (server only): records new ones and words them for
 * a toast. Used by the app layout (page loads) and the movement API (after a save).
 */
import { eq } from 'drizzle-orm';
import { useTranslations, type Locale } from '../../i18n';
import { cycleOf, type Cycle } from '../cycle';
import { todayIn } from '../dates';
import type { Database } from '../db/client';
import { category } from '../db/schema';
import { describeError, logError } from '../errors';
import { alertMessage } from './alerts';
import { syncAlerts } from './repo';

export interface ProfileCycle {
  timezone: string;
  cycleStartDay: number;
  locale: Locale;
}

export function currentCycle(profile: ProfileCycle): Cycle {
  return cycleOf(todayIn(profile.timezone), profile.cycleStartDay);
}

/** Records the cycle's new alerts and returns the toast for them (null when there is nothing new). */
export async function newAlertMessage(
  db: Database,
  userId: string,
  profile: ProfileCycle,
): Promise<string | null> {
  const alerts = await syncAlerts(db, userId, currentCycle(profile));
  if (alerts.length === 0) return null;
  const names = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(eq(category.userId, userId));
  const byId = new Map(names.map((row) => [row.id, row.name]));
  return alertMessage(alerts, (id) => byId.get(id) ?? '', useTranslations(profile.locale));
}

/** Same, for the movement API: an alert must never make a saved movement look failed. */
export async function safeAlertMessage(
  db: Database,
  userId: string,
  profile: ProfileCycle,
): Promise<string | null> {
  try {
    return await newAlertMessage(db, userId, profile);
  } catch (error) {
    await logError('/api/movements', 'BUDGET_ALERTS', describeError(error));
    return null;
  }
}
