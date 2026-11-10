<!--
  The three stat cards: Income (badge: main income and its date), Expenses (badge: change against the
  previous cycle by the same day, warning color when higher) and Savings (badge: share of income).
  Props:
    figures, comparison   From `calc.ts`.
    main                  The cycle's main income, or null.
    mainName              Its row title (note, else "Income").
    previousName          "October" / "last cycle".
    locale, currency, t
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import type { Comparison, CycleFigures } from '../../lib/calc';
  import { dayMonth, signedPercent } from '../../lib/home/format';
  import { formatMoney, percent } from '../../lib/money';
  import type { Movement } from '../../lib/movements/model';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    figures: CycleFigures;
    comparison: Comparison;
    main: Movement | null;
    mainName: string;
    previousName: string | null;
    locale: Locale;
    currency: string;
    t: Translate;
  }

  let { figures, comparison, main, mainName, previousName, locale, currency, t }: Props = $props();

  const money = (cents: number) => formatMoney(cents, locale, { currency });
  const change = $derived(comparison.change);
  const vsLast = $derived.by(() => {
    if (change === null) return null;
    const value = signedPercent(change, locale);
    return previousName
      ? t('home.vsLast', { change: value, name: previousName })
      : t('home.vsLastCycle', { change: value });
  });
</script>

<ul class="stats">
  <li class="card stat">
    <p class="stat__label">{t('home.income')}</p>
    <p class="stat__value num" data-testid="income">{money(figures.incomeCents)}</p>
    {#if main}
      <span class="badge">
        <Icon name="wallet" />
        {t('home.incomeBadge', { name: mainName, date: dayMonth(main.date, locale) })}
      </span>
    {/if}
  </li>
  <li class="card stat">
    <p class="stat__label">{t('home.expenses')}</p>
    <p class="stat__value num" data-testid="expenses">{money(figures.expenseCents)}</p>
    {#if vsLast && change !== null}
      <span class={['badge', change > 0 && 'badge--warning']}>
        <Icon name="chart" />
        {vsLast}
      </span>
    {/if}
  </li>
  <li class="card stat">
    <p class="stat__label">{t('home.savings')}</p>
    <p
      class={[
        'stat__value num',
        figures.savingsCents < 0 ? 'stat__value--negative' : 'stat__value--positive',
      ]}
      data-testid="savings"
    >
      {money(figures.savingsCents)}
    </p>
    {#if figures.incomeCents > 0}
      <span class="badge"
        >{t('home.ofIncome', { pct: percent(figures.savingsCents, figures.incomeCents) })}</span
      >
    {/if}
  </li>
</ul>

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .stat {
    display: grid;
    align-content: start;
    justify-items: start;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-4);
  }

  .stat__label {
    color: var(--ink-2);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .stat__value {
    /* Fits "€1,850.00" in a third of a 360 px screen without breaking the number. */
    font-size: clamp(1.0625rem, 4.6vw, 1.375rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .stat__value--positive {
    color: var(--positive);
  }

  .stat__value--negative {
    color: var(--negative);
  }

  .stat .badge {
    margin-block-start: var(--space-1);
  }

  /* Desktop: the cards stack in the column next to the hero. */
  @media (min-width: 48rem) {
    .stats {
      grid-template-columns: 1fr;
    }
  }
</style>
