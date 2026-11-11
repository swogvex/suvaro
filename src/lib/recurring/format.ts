/** Labels for recurring templates in the user's language (browser and server). */
import type { Locale } from '../../i18n';
import type { Translate } from '../../i18n/client';
import type { CategoryOption } from '../movements/model';
import type { Recurring } from './model';

const intlLocale: Record<Locale, string> = { en: 'en-GB', es: 'es-ES' };

function format(date: string, locale: Locale, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale[locale], { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** "Monthly · day 1", "Weekly · Monday", "Yearly · 5 Mar", "Every 10 days". */
export function frequencyLabel(
  item: Pick<Recurring, 'frequency' | 'intervalDays' | 'anchorDate'>,
  locale: Locale,
  t: Translate,
): string {
  switch (item.frequency) {
    case 'monthly':
      return t('recurring.monthlyDay', { day: Number(item.anchorDate.slice(8, 10)) });
    case 'weekly':
      return t('recurring.weeklyOn', { weekday: format(item.anchorDate, locale, { weekday: 'long' }) });
    case 'yearly':
      return t('recurring.yearlyOn', {
        date: format(item.anchorDate, locale, { day: 'numeric', month: 'short' }),
      });
    case 'every_n_days':
      return t('recurring.everyDays', { n: item.intervalDays ?? 2 });
  }
}

/** The note, else the category name, else "Income". */
export function recurringName(
  item: Pick<Recurring, 'note' | 'type'>,
  category: CategoryOption | undefined,
  t: Translate,
): string {
  if (item.note) return item.note;
  if (item.type === 'income') return t('movements.income');
  return category?.name ?? t('movements.noCategory');
}
