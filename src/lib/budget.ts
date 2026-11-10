/** Budget color rules (same in every theme): < 80 % ok, 80–94 % warning, ≥ 95 % over. */
export type BudgetLevel = 'ok' | 'warning' | 'over';

export function budgetLevel(pct: number): BudgetLevel {
  if (pct >= 95) return 'over';
  if (pct >= 80) return 'warning';
  return 'ok';
}
