<!--
  Stats (island on /app/stats): period picker (Week · Month · Year · Custom + ‹ ›, keyboard ← →), export
  (CSV / print), then "What changed", spending by category, by month and cumulative savings. The first
  period arrives rendered from the server; others load from `GET /api/stats` with skeletons. A movement
  saved anywhere on the page reloads the numbers quietly. A print-only report, mounted only while printing,
  replaces it all on paper.
  Props:
    initial       Data of the first period (`GET /api/stats` shape).
    today         The user's today, `YYYY-MM-DD`.
    startDay      Profile cycle start day (1–28).
    weekStart     1 Monday, 7 Sunday.
    categories, locale, currency
    messages      Translated strings.
-->
<script lang="ts">
  import { flushSync, onMount } from 'svelte';
  import type { Locale } from '../../i18n';
  import { translator, type Messages } from '../../i18n/client';
  import { daysBetween } from '../../lib/dates';
  import { dayMonth } from '../../lib/home/format';
  import type { IconName } from '../../lib/icons';
  import { formatMoney } from '../../lib/money';
  import { ApiError, onChange } from '../../lib/movements/client';
  import { monthOnly } from '../../lib/movements/format';
  import type { CategoryOption } from '../../lib/movements/model';
  import { movementsCsv } from '../../lib/stats/csv';
  import { compactMoney, listOf, periodLabel, shortMonth } from '../../lib/stats/format';
  import type { StatsData } from '../../lib/stats/model';
  import {
    MAX_CUSTOM_DAYS,
    periodOf,
    periodQuery,
    shiftPeriod,
    type Period,
    type PeriodKind,
  } from '../../lib/stats/period';
  import LineArea from '../charts/LineArea.svelte';
  import MonthlyBars from '../charts/MonthlyBars.svelte';
  import PairedBars from '../charts/PairedBars.svelte';
  import Icon from '../ui/Icon.svelte';
  import ChartCard from './ChartCard.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import PrintReport from './PrintReport.svelte';
  import StatsTrends from './StatsTrends.svelte';

  interface Props {
    initial: StatsData;
    today: string;
    startDay: number;
    weekStart: 1 | 7;
    categories: CategoryOption[];
    locale: Locale;
    currency: string;
    messages: Messages;
  }

  let { initial, today, startDay, weekStart, categories, locale, currency, messages }: Props = $props();

  const t = $derived(translator(messages));
  const settings = $derived({ startDay, weekStart });
  const KINDS: readonly PeriodKind[] = ['week', 'month', 'year', 'custom'];

  // svelte-ignore state_referenced_locally
  let data = $state<StatsData>(initial);
  /** The period being loaded (the picker shows it right away). */
  // svelte-ignore state_referenced_locally
  let shown = $state<Period>(initial.period);
  /** The selected kind; "custom" opens the range form before anything loads. */
  // svelte-ignore state_referenced_locally
  let kind = $state<PeriodKind>(initial.period.kind);
  // svelte-ignore state_referenced_locally
  let from = $state(initial.period.start);
  // svelte-ignore state_referenced_locally
  let to = $state(initial.period.end < today ? initial.period.end : today);
  let rangeError = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let hydrated = $state(false);
  let request: AbortController | undefined;

  const byId = $derived(new Map(categories.map((category) => [category.id, category])));
  const categoryName = (id: string | null) =>
    (id === null ? undefined : byId.get(id)?.name) ?? t('movements.noCategory');
  const money = (cents: number) => formatMoney(cents, locale, { currency });
  const whole = (cents: number) => formatMoney(cents, locale, { currency, wholeUnits: true });
  const compact = (cents: number) => compactMoney(cents, locale, currency);
  const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

  const label = $derived(periodLabel(shown, startDay, locale));
  const dataLabel = $derived(periodLabel(data.period, startDay, locale));
  const canGoNext = $derived(shiftPeriod(shown, 1, settings).start <= today);
  const isNow = $derived(shown.kind === 'custom' || (shown.start <= today && today <= shown.end));
  const empty = $derived(data.movements.length === 0);

  // ---------- Loading ----------

  async function load(period: Period, quiet = false) {
    request?.abort();
    request = new AbortController();
    const { signal } = request;
    shown = period;
    if (!quiet) loading = true;
    failed = false;
    try {
      const response = await fetch(`/api/stats${periodQuery(period, today, settings)}`, { signal });
      if (!response.ok) throw new ApiError(`HTTP_${response.status}`);
      data = (await response.json()) as StatsData;
    } catch {
      if (signal.aborted) return;
      if (!quiet) failed = true;
    } finally {
      if (!signal.aborted) loading = false;
    }
  }

  function goTo(period: Period) {
    if (period.start > today) return;
    kind = period.kind;
    const url = new URL(window.location.href);
    url.search = periodQuery(period, today, settings);
    history.replaceState(history.state, '', url);
    void load(period);
  }

  function chooseKind(next: PeriodKind) {
    kind = next;
    if (next === 'custom') {
      from = shown.start;
      to = shown.end < today ? shown.end : today;
      rangeError = false;
      return;
    }
    // Keep the moment in view: the new period holds the last day shown (or today).
    goTo(periodOf(next, shown.end < today ? shown.end : today, settings));
  }

  function applyRange(event: SubmitEvent) {
    event.preventDefault();
    const valid =
      from !== '' && to !== '' && from <= to && from <= today && daysBetween(from, to) < MAX_CUSTOM_DAYS;
    rangeError = !valid;
    if (valid) goTo({ kind: 'custom', start: from, end: to });
  }

  let reloadTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * The print report exists only while printing (Export › PDF or the browser's own print): it keeps the page
   * light, and `beforeprint` lets the DOM change before the browser lays the page out.
   */
  let printing = $state(false);
  function startPrinting() {
    flushSync(() => (printing = true));
  }
  function print() {
    startPrinting();
    window.print();
  }

  onMount(() => {
    hydrated = true;
    // Any write can move any number here (trends, months, savings): reload once the request has landed.
    const stop = onChange(() => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => void load(data.period, true), 1_500);
    });
    // ← / → move the period, unless typing or inside a dialog or a table.
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable], dialog, [role="region"]')) return;
      if (event.key === 'ArrowLeft') goTo(shiftPeriod(shown, -1, settings));
      if (event.key === 'ArrowRight' && canGoNext) goTo(shiftPeriod(shown, 1, settings));
    };
    const stopPrinting = () => (printing = false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeprint', startPrinting);
    window.addEventListener('afterprint', stopPrinting);
    return () => {
      stop();
      clearTimeout(reloadTimer);
      request?.abort();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeprint', startPrinting);
      window.removeEventListener('afterprint', stopPrinting);
    };
  });

  // ---------- Export ----------

  function downloadCsv() {
    const csv = movementsCsv(data.movements, locale, {
      headers: [
        t('stats.csvDate'),
        t('stats.csvType'),
        t('stats.csvCategory'),
        t('stats.csvAmount'),
        t('stats.csvNote'),
      ],
      income: t('stats.income'),
      expense: t('stats.expense'),
      category: (movement) =>
        movement.type === 'income' ? t('stats.income') : categoryName(movement.categoryId),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `suvaro-${data.period.start}_${data.period.end}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  // ---------- Blocks ----------

  const previousLegend = $derived(
    today > data.period.end ? t('stats.previousPeriod') : t('stats.previousSameDay'),
  );

  const categoryRows = $derived(
    data.categories.map((row) => {
      const category = row.categoryId === null ? undefined : byId.get(row.categoryId);
      return {
        id: row.categoryId ?? 'none',
        name: categoryName(row.categoryId),
        icon: (category?.icon ?? 'dots') as IconName,
        color: category?.color ?? 7,
        current: row.currentCents,
        previous: row.previousCents,
      };
    }),
  );
  const categorySummary = $derived.by(() => {
    const topRow = categoryRows[0];
    if (!topRow || topRow.current === 0) return t('stats.categoryEmpty');
    return t('stats.categorySummary', { category: topRow.name, amount: money(topRow.current) });
  });
  const categoryLabel = $derived(
    `${t('stats.categoryTitle')}. ${categoryRows
      .map((row) =>
        t('stats.categoryItem', {
          category: row.name,
          current: money(row.current),
          previous: money(row.previous),
        }),
      )
      .join('. ')}`,
  );

  const bars = $derived(
    data.months.map((month) => ({
      key: month.start,
      label: capitalize(shortMonth(month.start, locale)),
      cents: month.expenseCents,
      inProgress: month.inProgress,
      over: month.expenseCents > month.incomeCents,
      name: capitalize(monthOnly(month.start.slice(0, 7), locale)),
      income: month.incomeCents,
    })),
  );
  const activeMonths = $derived(
    data.months.filter((month) => month.expenseCents > 0 || month.incomeCents > 0),
  );
  const monthsSummary = $derived.by(() => {
    if (!data.months.some((month) => month.expenseCents > 0)) return t('stats.monthsEmpty');
    const total = activeMonths.reduce((sum, month) => sum + month.expenseCents, 0);
    return t('stats.monthsSummary', { amount: whole(Math.round(total / activeMonths.length)) });
  });
  const overMonths = $derived(bars.filter((bar) => bar.over).map((bar) => bar.name));
  const monthsLabel = $derived(
    `${t('stats.monthsTitle')}. ${bars
      .map((bar) =>
        t('stats.monthsItem', { month: bar.name, spent: money(bar.cents), income: money(bar.income) }),
      )
      .join('. ')}`,
  );

  const savingsValues = $derived(data.savings.map((point) => point.cents));
  const byDay = $derived(data.savings.every((point) => point.start === point.end));
  const pointLabel = (start: string) =>
    byDay ? dayMonth(start, locale) : capitalize(shortMonth(start, locale));
  const savingsSummary = $derived.by(() => {
    if (empty) return t('stats.savingsEmpty');
    const cents = data.totals.savingsCents;
    if (cents > 0) return t('stats.savingsUp', { period: dataLabel, amount: money(cents) });
    if (cents < 0) return t('stats.savingsDown', { period: dataLabel, amount: money(-cents) });
    return t('stats.savingsEven', { period: dataLabel });
  });
  const savingsLabel = $derived(
    `${t('stats.savingsTitle')}. ${data.savings
      .map((point) => t('stats.savingsItem', { date: pointLabel(point.start), amount: money(point.cents) }))
      .join('. ')}`,
  );
</script>

<div class="stats" data-print-hide>
  <header class="stats__head">
    <h1>{t('app.stats')}</h1>
    <ExportMenu period={dataLabel} disabled={!hydrated || loading} onCsv={downloadCsv} onPrint={print} {t} />
  </header>

  <div class="stats__picker">
    <fieldset class="segmented-group">
      <legend class="visually-hidden">{t('stats.periodLabel')}</legend>
      <div class="segmented">
        {#each KINDS as option (option)}
          <label class="segmented__item">
            <input
              type="radio"
              name="stats-period"
              value={option}
              checked={kind === option}
              disabled={!hydrated}
              onchange={() => chooseKind(option)}
            />
            <span>{t(`stats.${option}`)}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    {#if kind === 'custom'}
      <form class="stats__range" onsubmit={applyRange} novalidate>
        <label class="field">
          <span class="field__label">{t('stats.from')}</span>
          <input
            class="field__input"
            type="date"
            bind:value={from}
            max={today}
            required
            aria-invalid={rangeError}
            aria-describedby={rangeError ? 'range-error' : undefined}
          />
        </label>
        <label class="field">
          <span class="field__label">{t('stats.to')}</span>
          <input
            class="field__input"
            type="date"
            bind:value={to}
            required
            aria-invalid={rangeError}
            aria-describedby={rangeError ? 'range-error' : undefined}
          />
        </label>
        <button class="btn btn--primary" type="submit">{t('stats.apply')}</button>
        {#if rangeError}
          <p id="range-error" class="field__error" role="alert">
            <Icon name="alert" />{t('stats.rangeInvalid')}
          </p>
        {/if}
      </form>
    {/if}

    <nav class="stats__nav" aria-label={t('stats.nav')}>
      <button
        class="icon-btn"
        type="button"
        aria-label={t('stats.prev')}
        disabled={!hydrated}
        onclick={() => goTo(shiftPeriod(shown, -1, settings))}
      >
        <Icon name="chevron-left" />
      </button>
      <p class="stats__label" aria-live="polite" data-testid="period-label">{label}</p>
      <button
        class="icon-btn"
        type="button"
        aria-label={t('stats.next')}
        disabled={!hydrated || !canGoNext}
        onclick={() => goTo(shiftPeriod(shown, 1, settings))}
      >
        <Icon name="chevron-right" />
      </button>
      {#if !isNow}
        <button
          class="btn btn--ghost"
          type="button"
          onclick={() => goTo(periodOf(shown.kind === 'custom' ? 'month' : shown.kind, today, settings))}
        >
          {t('stats.now')}
        </button>
      {/if}
    </nav>
  </div>

  {#if failed}
    <div class="card stats__error" role="alert">
      <p>{t('stats.errorLoad')}</p>
      <button class="btn btn--secondary" type="button" onclick={() => load(shown)}>{t('stats.retry')}</button>
    </div>
  {:else if loading}
    <div class="stats__grid" aria-busy="true">
      <span class="visually-hidden" role="status">{t('stats.loading')}</span>
      {#each [1, 2, 3, 4] as n (n)}
        <div class={['card stats__skeleton', n === 1 && 'stats__skeleton--hero']}>
          <span class="skeleton skeleton--title"></span>
          <span class="skeleton"></span>
          <span class="skeleton"></span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="stats__grid">
      <StatsTrends
        trends={data.trends}
        savingsRate={data.savingsRate}
        totals={data.totals}
        kind={data.period.kind}
        {categoryName}
        {locale}
        {currency}
        {t}
      />

      <ChartCard
        id="stats-categories"
        title={t('stats.categoryTitle')}
        summary={categorySummary}
        showTable={categoryRows.length > 0}
        {t}
      >
        {#snippet legend()}
          <p class="legend">
            <span class="legend__item"
              ><span class="legend__key legend__key--current"></span>{t('stats.thisPeriod')}</span
            >
            <span class="legend__item"
              ><span class="legend__key legend__key--previous"></span>{previousLegend}</span
            >
          </p>
        {/snippet}
        {#snippet chart()}
          <PairedBars rows={categoryRows} label={categoryLabel} format={whole} />
        {/snippet}
        {#snippet table()}
          <table>
            <caption class="visually-hidden">{t('stats.categoryTitle')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('stats.colCategory')}</th>
                <th scope="col">{t('stats.thisPeriod')}</th>
                <th scope="col">{previousLegend}</th>
              </tr>
            </thead>
            <tbody>
              {#each categoryRows as row (row.id)}
                <tr>
                  <th scope="row">{row.name}</th>
                  <td class="num">{money(row.current)}</td>
                  <td class="num">{money(row.previous)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/snippet}
      </ChartCard>

      <ChartCard
        id="stats-months"
        title={t('stats.monthsTitle')}
        summary={monthsSummary}
        caption={overMonths.length > 0
          ? t('stats.monthsOver', { months: listOf(overMonths, locale) })
          : undefined}
        showTable={activeMonths.length > 0}
        {t}
      >
        {#snippet chart()}
          <MonthlyBars
            {bars}
            average={data.averageIncomeCents}
            averageLabel={data.averageIncomeCents === null
              ? ''
              : t('stats.monthsIncome', { amount: compact(data.averageIncomeCents) })}
            label={monthsLabel}
            format={compact}
          />
        {/snippet}
        {#snippet table()}
          <table>
            <caption class="visually-hidden">{t('stats.monthsTitle')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('stats.colMonth')}</th>
                <th scope="col">{t('stats.colSpent')}</th>
                <th scope="col">{t('stats.income')}</th>
              </tr>
            </thead>
            <tbody>
              {#each bars as bar (bar.key)}
                <tr>
                  <th scope="row">{bar.name}{bar.inProgress ? ` (${t('stats.monthsRunning')})` : ''}</th>
                  <td class="num">{money(bar.cents)}</td>
                  <td class="num">{money(bar.income)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/snippet}
      </ChartCard>

      <ChartCard
        id="stats-savings"
        title={t('stats.savingsTitle')}
        summary={savingsSummary}
        showTable={!empty}
        {t}
      >
        {#snippet chart()}
          <LineArea
            values={savingsValues}
            first={data.savings[0] ? pointLabel(data.savings[0].start) : ''}
            last={data.savings.at(-1) ? pointLabel(data.savings.at(-1)?.start ?? '') : ''}
            label={savingsLabel}
            format={whole}
          />
        {/snippet}
        {#snippet table()}
          <table>
            <caption class="visually-hidden">{t('stats.savingsTitle')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('stats.colDate')}</th>
                <th scope="col">{t('stats.colSavings')}</th>
              </tr>
            </thead>
            <tbody>
              {#each data.savings as point (point.start)}
                <tr>
                  <th scope="row"
                    >{byDay
                      ? dayMonth(point.start, locale)
                      : `${dayMonth(point.start, locale)} – ${dayMonth(point.end, locale)}`}</th
                  >
                  <td class="num">{money(point.cents)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/snippet}
      </ChartCard>
    </div>
  {/if}
</div>

{#if printing}
  <PrintReport
    {data}
    period={dataLabel}
    previousLabel={previousLegend}
    {categoryName}
    {today}
    {locale}
    {currency}
    {t}
  />
{/if}

<style>
  .stats {
    display: grid;
    gap: var(--space-5);
  }

  .stats__head {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    justify-content: space-between;
  }

  .stats__picker {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-4);
    align-items: center;
    justify-content: space-between;
  }

  .segmented-group {
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .segmented-group legend {
    padding: 0;
  }

  .stats__picker .segmented {
    max-width: 100%;
  }

  .stats__picker .segmented__item {
    padding: 0 var(--space-2);
  }

  @media (min-width: 30rem) {
    .stats__picker .segmented__item {
      padding: 0 var(--space-3);
    }
  }

  .stats__range {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: flex-end;
    width: 100%;
  }

  .stats__range .field {
    flex: 1 1 9rem;
  }

  .stats__range .field__error {
    flex-basis: 100%;
  }

  .stats__nav {
    display: flex;
    gap: var(--space-1);
    align-items: center;
  }

  .stats__label {
    min-width: 8.5rem;
    font-weight: 600;
    text-align: center;
  }

  .stats__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }

  .stats__grid :global(h2) {
    font-size: 1.0625rem;
    line-height: 1.25;
  }

  @media (min-width: 48rem) {
    .stats__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stats__grid > :global(:first-child) {
      grid-column: 1 / -1;
    }
  }

  .stats__error {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
    justify-content: space-between;
  }

  .stats__skeleton {
    display: grid;
    align-content: start;
    gap: var(--space-3);
    min-height: 14rem;
  }

  .stats__skeleton--hero {
    min-height: 10rem;
    border-radius: var(--radius-l);
  }

  .skeleton--title {
    width: 40%;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    color: var(--ink-2);
    font-size: 0.8125rem;
  }

  .legend__item {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
  }

  .legend__key {
    display: inline-block;
    width: 1rem;
    border-radius: 3px;
  }

  .legend__key--current {
    height: 10px;
    background: var(--accent);
  }

  .legend__key--previous {
    height: 6px;
    background: color-mix(in srgb, var(--ink-3) 45%, transparent);
  }

  @media print {
    .stats {
      display: none;
    }
  }
</style>
