<!--
  Budgets column: the global limit in a HeroCard (spent / limit, %, "left and days: about X a day"), then
  one row per category budget sorted by % (< 80 accent, 80–94 warning, ≥ 95 negative). Empty state with
  "Set limits" when there are none.
  Props: rows, global (or null), daysLeft, range, categories, locale, currency, t, onedit.
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import type { IconName } from '../../lib/icons';
  import { formatMoney } from '../../lib/money';
  import type { CategoryOption } from '../../lib/movements/model';
  import type { BudgetRow, GlobalBudget } from '../../lib/plan/calc';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    rows: readonly BudgetRow[];
    global: GlobalBudget | null;
    daysLeft: number;
    range: string;
    categories: readonly CategoryOption[];
    locale: Locale;
    currency: string;
    t: Translate;
    onedit: () => void;
  }

  let { rows, global, daysLeft, range, categories, locale, currency, t, onedit }: Props = $props();

  const money = (cents: number) => formatMoney(cents, locale, { currency });
  const whole = (cents: number) => formatMoney(cents, locale, { currency, wholeUnits: true });
  const byId = $derived(new Map(categories.map((c) => [c.id, c])));
  const empty = $derived(rows.length === 0 && global === null);
  const levelAttr = (level: BudgetRow['level']) => (level === 'ok' ? 'accent' : level);

  const globalPhrase = $derived.by(() => {
    if (!global) return '';
    if (global.leftCents < 0) return t('plan.globalOver', { amount: money(-global.leftCents) });
    if (global.perDayCents === null || global.perDayCents < 100)
      return t('plan.globalNothing', { days: daysLeft });
    if (daysLeft === 1) return t('plan.globalLeftOne', { left: money(global.leftCents) });
    return t('plan.globalLeft', {
      left: money(global.leftCents),
      days: daysLeft,
      perDay: whole(global.perDayCents),
    });
  });
</script>

{#if empty}
  <div class="card empty">
    <span class="cat-tile cat-tile--lg" data-color="4" aria-hidden="true"><Icon name="wallet" /></span>
    <h3>{t('plan.budgetsEmptyTitle')}</h3>
    <p class="muted">{t('plan.budgetsEmpty')}</p>
    <button class="btn btn--primary" type="button" onclick={onedit}>
      <Icon name="sliders" />{t('plan.budgetsEmptyAction')}
    </button>
  </div>
{:else}
  {#if global}
    <section class="hero-card global" aria-labelledby="global-title">
      <h3 id="global-title" class="global__title">{t('plan.globalTitle')}</h3>
      <p class="global__amounts">
        <span class="num global__spent"
          >{t('plan.globalSpent', { spent: money(global.spentCents), limit: money(global.limitCents) })}</span
        >
        <span class="num global__pct">{global.pct} %</span>
      </p>
      <progress
        class="progress global__track"
        max="100"
        value={Math.min(global.pct, 100)}
        data-level={levelAttr(global.level)}
        aria-label={t('plan.globalTitle')}
      >
        {global.pct} %
      </progress>
      <p class="global__phrase">{globalPhrase}</p>
    </section>
  {:else}
    <p class="card nolimit">
      <Icon name="wallet" />
      <span>{t('plan.globalNone')}</span>
    </p>
  {/if}

  {#if rows.length > 0}
    <ul class="card rows">
      {#each rows as row (row.budgetId)}
        {@const category = byId.get(row.categoryId)}
        {@const name = category?.name ?? t('movements.noCategory')}
        <li class="row">
          <span class="cat-tile" data-color={category?.color ?? 7} aria-hidden="true">
            <Icon name={(category?.icon ?? 'dots') as IconName} />
          </span>
          <div class="row__text">
            <p class="row__line">
              <span class="row__name">{name}</span>
              <span class={['row__pct', row.level !== 'ok' && `row__pct--${row.level}`]}>
                {t('plan.budgetRow', {
                  pct: row.pct,
                  used: money(row.spentCents),
                  limit: money(row.limitCents),
                })}
              </span>
            </p>
            <progress
              class="progress"
              max="100"
              value={Math.min(row.pct, 100)}
              data-level={levelAttr(row.level)}
              aria-label={t('plan.budgetLabel', { category: name })}
            >
              {row.pct} %
            </progress>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="note">{t('plan.cycle', { range })} · {t('plan.budgetsNote')}</p>
{/if}

<style>
  .empty {
    display: grid;
    justify-items: start;
    gap: var(--space-3);
  }

  .muted,
  .note {
    color: var(--ink-2);
  }

  .note {
    font-size: 0.875rem;
  }

  .global {
    display: grid;
    gap: var(--space-3);
  }

  .global__title {
    font-family: inherit;
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: normal;
  }

  .global__amounts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    align-items: baseline;
    justify-content: space-between;
  }

  .global__spent {
    font-size: 1.5rem;
    letter-spacing: var(--tracking-display);
  }

  .global__pct {
    font-size: 1.125rem;
  }

  .global__phrase {
    max-width: calc(100% - 4rem);
  }

  .nolimit {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    color: var(--ink-2);
  }

  .nolimit :global(svg) {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--accent);
  }

  .rows {
    display: grid;
    gap: var(--space-4);
    margin: 0;
    list-style: none;
  }

  .row {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }

  .row__text {
    display: grid;
    flex: 1;
    gap: var(--space-2);
    min-width: 0;
  }

  .row__line {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    align-items: baseline;
    justify-content: space-between;
  }

  .row__name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .row__pct {
    color: var(--ink-2);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  .row__pct--warning,
  .row__pct--over {
    color: var(--ink);
    font-weight: 600;
  }
</style>
