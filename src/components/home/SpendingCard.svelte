<!--
  Cumulative spending card: text summary ("By day 9 you've spent 42 more than in October"), the line chart
  (this cycle vs the previous one, dashed) and a "View as table" toggle with the same numbers.
  Props:
    cycle, previousCycle
    comparison            From `calc.ts` (day reached and totals by then).
    current, previous     Cumulative cents by day.
    currentName, previousName       Direct labels ("November", "October" / "This cycle", "Last cycle").
    previousInText        How the summary names the previous cycle ("October" / "last cycle").
    locale, currency, t
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import type { Comparison } from '../../lib/calc';
  import { cycleLength, type Cycle } from '../../lib/cycle';
  import { addDays } from '../../lib/dates';
  import { dayMonth } from '../../lib/home/format';
  import { formatMoney } from '../../lib/money';
  import LineCumulative from '../charts/LineCumulative.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    cycle: Cycle;
    previousCycle: Cycle;
    comparison: Comparison;
    current: readonly number[];
    previous: readonly number[];
    currentName: string;
    previousName: string;
    previousInText: string;
    locale: Locale;
    currency: string;
    t: Translate;
  }

  let {
    cycle,
    previousCycle,
    comparison,
    current,
    previous,
    currentName,
    previousName,
    previousInText,
    locale,
    currency,
    t,
  }: Props = $props();

  let showTable = $state(false);
  const whole = (cents: number) => formatMoney(cents, locale, { currency, wholeUnits: true });
  const money = (cents: number) => formatMoney(cents, locale, { currency });

  const summary = $derived.by(() => {
    const { day, currentCents, previousCents } = comparison;
    if (previousCents === 0) {
      return t('home.chartNoPrevious', { day, amount: money(currentCents), name: previousInText });
    }
    const diff = currentCents - previousCents;
    if (Math.abs(diff) < 100) return t('home.chartSame', { day, name: previousInText });
    const key = diff > 0 ? 'home.chartMore' : 'home.chartLess';
    return t(key, { day, amount: whole(Math.abs(diff)), name: previousInText });
  });

  const days = $derived(cycleLength(cycle));
  const rows = $derived(
    Array.from({ length: Math.max(days, cycleLength(previousCycle)) }, (_, i) => ({
      day: i + 1,
      current: current[i],
      previous: previous[i],
    })),
  );
</script>

<section class="card spending" aria-labelledby="spending-title">
  <h2 id="spending-title">{t('home.chartTitle')}</h2>
  <p class="spending__summary" data-testid="spending-summary">{summary}</p>
  <LineCumulative
    {current}
    {previous}
    {days}
    currentLabel={currentName}
    previousLabel={previousName}
    tick={(index) => String(Number(addDays(cycle.start, index).slice(8)))}
    format={whole}
  />
  <button
    class="btn btn--ghost spending__toggle"
    type="button"
    aria-expanded={showTable}
    aria-controls="spending-table"
    onclick={() => (showTable = !showTable)}
  >
    <Icon name="list" />
    {showTable ? t('home.chartHide') : t('home.chartTable')}
  </button>
  <!-- Scrollable, so it takes keyboard focus (arrow keys scroll it). -->
  <div
    id="spending-table"
    class="spending__table"
    hidden={!showTable}
    tabindex={showTable ? 0 : -1}
    role="region"
    aria-label="{currentName} · {previousName}"
  >
    {#if showTable}
      <table>
        <caption class="visually-hidden">{t('home.chartTitle')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('home.chartDay')}</th>
            <th scope="col">{currentName}</th>
            <th scope="col">{previousName}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.day)}
            <tr>
              <th scope="row">
                {row.day <= days ? dayMonth(addDays(cycle.start, row.day - 1), locale) : row.day}
              </th>
              <td class="num">{row.current === undefined ? '—' : money(row.current)}</td>
              <td class="num">{row.previous === undefined ? '—' : money(row.previous)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</section>

<style>
  .spending {
    display: grid;
    align-content: start;
    gap: var(--space-3);
    min-width: 0;
  }

  .spending__summary {
    color: var(--ink-2);
  }

  .spending__toggle {
    justify-self: start;
  }

  .spending__table {
    max-height: 20rem;
    overflow: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  th,
  td {
    padding: var(--space-1) var(--space-2);
    border-block-end: 1px solid var(--line);
    text-align: end;
  }

  th:first-child {
    text-align: start;
  }

  thead th {
    position: sticky;
    inset-block-start: 0;
    background: var(--surface);
    color: var(--ink-2);
  }

  td.num {
    font-size: 0.875rem;
  }
</style>
