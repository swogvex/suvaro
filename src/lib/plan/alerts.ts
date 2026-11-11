/** Words for budget alerts (server side: the layout's toast and the movement API's response). */
import type { UiKey } from '../../i18n';
import { alertsToShow } from './calc';
import type { BudgetAlert } from './model';

type Translate = (key: UiKey, vars?: Record<string, string | number>) => string;

/** One sentence for the toast, or null when there is nothing new. */
export function alertMessage(
  alerts: readonly BudgetAlert[],
  categoryName: (id: string) => string,
  t: Translate,
): string | null {
  const shown = alertsToShow(alerts);
  const [first] = shown;
  if (!first) return null;
  if (shown.length > 1) return t('plan.alertMany', { n: shown.length });
  const vars = { category: categoryName(first.categoryId), pct: first.pct };
  return first.level === 100 ? t('plan.alert100', vars) : t('plan.alert80', vars);
}
