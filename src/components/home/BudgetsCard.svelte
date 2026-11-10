<!--
  Budgets at risk: up to 3 categories at ≥ 80 % of their limit, highest first, with a track and
  "97 % · 1.03 left". "All budgets on track" when none is at risk; a pointer to Plan when there are none.
  Props:
    risks        From `budgetsAtRisk` (`calc.ts`).
    hasBudgets   The user has at least one budget.
    categories   To name the categories.
    locale, currency, t
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import { budgetLevel } from '../../lib/budget';
  import type { BudgetRisk } from '../../lib/calc';
  import type { IconName } from '../../lib/icons';
  import { formatMoney } from '../../lib/money';
  import type { CategoryOption } from '../../lib/movements/model';
  import { appPaths } from '../../lib/routes';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    risks: readonly BudgetRisk[];
    hasBudgets: boolean;
    categories: readonly CategoryOption[];
    locale: Locale;
    currency: string;
    t: Translate;
  }

  let { risks, hasBudgets, categories, locale, currency, t }: Props = $props();

  const money = (cents: number) => formatMoney(cents, locale, { currency });
  const byId = $derived(new Map(categories.map((c) => [c.id, c])));
</script>

<section class="card budgets" aria-labelledby="budgets-title">
  <div class="budgets__head">
    <h2 id="budgets-title">{t('home.budgetsTitle')}</h2>
    {#if risks.length > 0}
      <span class="badge badge--warning"
        ><Icon name="alert" />{t('home.budgetsAtRisk', { n: risks.length })}</span
      >
    {/if}
  </div>

  {#if risks.length > 0}
    <ul class="budgets__list">
      {#each risks as risk (risk.categoryId)}
        {@const category = byId.get(risk.categoryId)}
        {@const name = category?.name ?? t('movements.noCategory')}
        <li class="budgets__item">
          <span class="cat-tile cat-tile--sm" data-color={category?.color ?? 7} aria-hidden="true">
            <Icon name={(category?.icon ?? 'dots') as IconName} />
          </span>
          <div class="budgets__text">
            <p class="budgets__name">{name}</p>
            <progress
              class="progress"
              max="100"
              value={Math.min(risk.pct, 100)}
              aria-label={t('home.budgetLabel', { category: name })}
              data-level={budgetLevel(risk.pct)}
            >
              {risk.pct} %
            </progress>
            <p class="budgets__pct">
              {risk.leftCents >= 0
                ? t('home.budgetLeft', { pct: risk.pct, amount: money(risk.leftCents) })
                : t('home.budgetOver', { pct: risk.pct, amount: money(-risk.leftCents) })}
            </p>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="budgets__empty">
      {#if hasBudgets}
        <Icon name="check" />
      {/if}
      {hasBudgets ? t('home.budgetsOk') : t('home.budgetsNone')}
    </p>
  {/if}

  <a class="budgets__link" href={appPaths.plan}>{t('home.budgetsAll')}</a>
</section>

<style>
  .budgets {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    min-width: 0;
  }

  .budgets__head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
  }

  .budgets__list {
    display: grid;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .budgets__item {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }

  .budgets__text {
    display: grid;
    flex: 1;
    gap: var(--space-1);
    min-width: 0;
  }

  .budgets__name {
    font-weight: 600;
  }

  .budgets__pct,
  .budgets__empty {
    color: var(--ink-2);
    font-size: 0.875rem;
  }

  .budgets__empty {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .budgets__empty :global(svg) {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    color: var(--positive);
  }

  .budgets__link {
    justify-self: start;
    font-weight: 600;
  }
</style>
