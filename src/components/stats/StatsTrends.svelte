<!--
  "What changed" (HeroCard): up to three sentences with badges (categories against their 3-period average,
  then the average savings of the last finished months) and the period's totals.
  Props:
    trends, savingsRate, totals   From `StatsData`.
    kind          Period kind (names the average: 3-week, 3-month…).
    categoryName  Category id → name.
    locale, currency, t
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import { formatMoney } from '../../lib/money';
  import type { CategoryTrend, SavingsRate, Sums } from '../../lib/stats/calc';
  import { plainPercent } from '../../lib/stats/format';
  import type { PeriodKind } from '../../lib/stats/period';

  interface Props {
    trends: readonly CategoryTrend[];
    savingsRate: SavingsRate | null;
    totals: Sums;
    kind: PeriodKind;
    categoryName: (id: string | null) => string;
    locale: Locale;
    currency: string;
    t: Translate;
  }

  let { trends, savingsRate, totals, kind, categoryName, locale, currency, t }: Props = $props();

  const averageKey = {
    week: 'stats.averageWeek',
    month: 'stats.averageMonth',
    year: 'stats.averageYear',
    custom: 'stats.averageCustom',
  } as const;

  interface Line {
    key: string;
    badge: string;
    tone: 'positive' | 'warning' | 'negative';
    text: string;
  }

  const lines = $derived.by(() => {
    const average = t(averageKey[kind]);
    const result: Line[] = trends.slice(0, savingsRate ? 2 : 3).map((trend) => {
      const up = trend.change > 0;
      return {
        key: trend.categoryId,
        badge: `${up ? '↑' : '↓'} ${plainPercent(trend.change, locale)}`,
        tone: up ? 'warning' : 'positive',
        text: t(up ? 'stats.trendUp' : 'stats.trendDown', {
          category: categoryName(trend.categoryId),
          average,
        }),
      };
    });
    if (savingsRate) {
      const negative = savingsRate.rate < 0;
      result.push({
        key: 'savings',
        badge: `${negative ? '−' : ''}${plainPercent(savingsRate.rate, locale)}`,
        tone: negative ? 'negative' : 'positive',
        text:
          savingsRate.months === 1
            ? t('stats.savingsRateOne')
            : t('stats.savingsRate', { n: savingsRate.months }),
      });
    }
    return result;
  });

  const money = (cents: number) => formatMoney(cents, locale, { currency });
</script>

<section class="hero-card changed" aria-labelledby="changed-title" data-testid="stats-changed">
  <h2 id="changed-title">{t('stats.changedTitle')}</h2>
  {#if lines.length > 0}
    <ul class="changed__list">
      {#each lines as line (line.key)}
        <li>
          <span class="badge badge--{line.tone} num">{line.badge}</span>
          <span>{line.text}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="changed__empty">{t('stats.changedEmpty')}</p>
  {/if}
  <dl class="changed__totals">
    <div>
      <dt>{t('stats.income')}</dt>
      <dd class="num">{money(totals.incomeCents)}</dd>
    </div>
    <div>
      <dt>{t('stats.expenses')}</dt>
      <dd class="num">{money(totals.expenseCents)}</dd>
    </div>
    <div>
      <dt>{t('stats.savings')}</dt>
      <dd class="num">{money(totals.savingsCents)}</dd>
    </div>
  </dl>
</section>

<style>
  .changed {
    display: grid;
    gap: var(--space-4);
  }

  .changed h2 {
    font-size: 1.0625rem;
  }

  .changed__list {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .changed__list li {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
  }

  .changed__list .badge {
    flex: none;
  }

  .changed__empty {
    max-width: 40ch;
  }

  .changed__totals {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-6);
    margin: 0;
  }

  .changed__totals dt {
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .changed__totals dd {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 600;
  }
</style>
