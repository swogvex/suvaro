<!--
  Home (island on /app): greeting + cycle selector, then hero + stat cards, cumulative spending + budgets at
  risk, last movements + pinned goal. The first cycle arrives rendered from the server; other cycles load
  on the client with skeletons. Every block is derived from the cycle's movements with `calc.ts`, so an
  optimistic write (`suvaro:movement`) updates all of them at once. Refreshes when the tab comes back after
  a while (another device may have written).
  Props:
    initial      Data of the first cycle (`GET /api/home` shape).
    current      The cycle containing today (the selector can't go past it).
    startDay     Profile cycle start day (1–28).
    name         Display name for the greeting ("" → "Hi").
    categories, today, locale, currency
    messages     Translated strings.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Locale } from '../../i18n';
  import { translator, type Messages } from '../../i18n/client';
  import {
    budgetsAtRisk,
    compareWithPrevious,
    cumulativeExpenses,
    cycleFigures,
    mainIncome,
    runningTotal,
  } from '../../lib/calc';
  import { cycleMonth, inCycle, shiftCycle, type Cycle } from '../../lib/cycle';
  import { cycleLabel, cycleMonthName, longWeekday } from '../../lib/home/format';
  import type { HomeData } from '../../lib/home/model';
  import { ApiError, onChange } from '../../lib/movements/client';
  import { movementName } from '../../lib/movements/format';
  import { compareMovements, type CategoryOption, type Movement } from '../../lib/movements/model';
  import Icon from '../ui/Icon.svelte';
  import BudgetsCard from './BudgetsCard.svelte';
  import GoalCard from './GoalCard.svelte';
  import HomeHero from './HomeHero.svelte';
  import HomeStats from './HomeStats.svelte';
  import LastMovements from './LastMovements.svelte';
  import SpendingCard from './SpendingCard.svelte';

  interface Props {
    initial: HomeData;
    current: Cycle;
    startDay: number;
    name: string;
    categories: CategoryOption[];
    today: string;
    locale: Locale;
    currency: string;
    messages: Messages;
  }

  let { initial, current, startDay, name, categories, today, locale, currency, messages }: Props = $props();

  const t = $derived(translator(messages));
  const STALE_MS = 60_000;

  // svelte-ignore state_referenced_locally
  let data = $state<HomeData>(initial);
  /** The cycle being loaded (the selector shows it right away). */
  // svelte-ignore state_referenced_locally
  let shown = $state<Cycle>(initial.cycle);
  let loading = $state(false);
  let failed = $state(false);
  let hydrated = $state(false);
  let loadedAt = Date.now();
  let request: AbortController | undefined;

  const isCurrent = $derived(data.cycle.start === current.start);
  const figures = $derived(cycleFigures(data.movements, data.setAsideCents, data.cycle, today));
  const comparison = $derived(compareWithPrevious(data.movements, data.cycle, data.previousDaily, today));
  const currentSeries = $derived(cumulativeExpenses(data.movements, data.cycle, comparison.day));
  const previousSeries = $derived(runningTotal(data.previousDaily));
  const risks = $derived(budgetsAtRisk(data.budgets, data.movements, data.cycle));
  const last = $derived([...data.movements].sort(compareMovements).slice(0, 5));
  const main = $derived(mainIncome(data.movements, data.cycle));

  const currentMonthName = $derived(cycleMonthName(data.cycle, startDay, locale));
  const previousMonthName = $derived(cycleMonthName(data.previousCycle, startDay, locale));
  const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

  async function load(cycle: Cycle, quiet = false) {
    request?.abort();
    request = new AbortController();
    const { signal } = request;
    shown = cycle;
    if (!quiet) loading = true;
    failed = false;
    try {
      const params = cycle.start === current.start ? '' : `?cycle=${cycleMonth(cycle)}`;
      const response = await fetch(`/api/home${params}`, { signal });
      if (!response.ok) throw new ApiError(`HTTP_${response.status}`);
      data = (await response.json()) as HomeData;
      loadedAt = Date.now();
    } catch {
      if (signal.aborted) return;
      if (!quiet) failed = true;
    } finally {
      if (!signal.aborted) loading = false;
    }
  }

  function goTo(cycle: Cycle) {
    if (cycle.start > current.start) return;
    const url = new URL(window.location.href);
    if (cycle.start === current.start) url.searchParams.delete('cycle');
    else url.searchParams.set('cycle', cycleMonth(cycle));
    history.replaceState(history.state, '', url);
    void load(cycle);
  }

  /** Applies an optimistic write to the cycle's movements. */
  function apply(list: Movement[], cycle: Cycle, id: string, movement: Movement | null) {
    const rest = list.filter((m) => m.id !== id);
    if (movement && inCycle(movement.date, cycle)) return [movement, ...rest];
    return rest.length === list.length ? list : rest;
  }

  /**
   * The previous cycle arrives as daily totals (no rows), so a write dated in it reloads the cycle quietly
   * once the request has had time to land.
   */
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  function reloadSoon() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => void load(data.cycle, true), 1_500);
  }

  onMount(() => {
    hydrated = true;
    const stop = onChange((change) => {
      const id = change.kind === 'upsert' ? change.movement.id : change.id;
      const movement = change.kind === 'upsert' ? change.movement : null;
      data = { ...data, movements: apply(data.movements, data.cycle, id, movement) };
      if (movement && inCycle(movement.date, data.previousCycle)) reloadSoon();
    });
    const refresh = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt > STALE_MS)
        void load(data.cycle, true);
    };
    // ← / → change the month, unless typing or inside a dialog.
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable], dialog, [role="region"]')) return;
      if (event.key === 'ArrowLeft') goTo(shiftCycle(shown, -1, startDay));
      if (event.key === 'ArrowRight') goTo(shiftCycle(shown, 1, startDay));
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('keydown', onKey);
    return () => {
      stop();
      clearTimeout(reloadTimer);
      request?.abort();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="home">
  <header class="home__head">
    <div class="home__hello">
      <p class="home__date">{capitalize(longWeekday(today, locale))}</p>
      <h1>{name ? t('home.greeting', { name }) : t('home.greetingNoName')}</h1>
    </div>
    <nav class="cycle" aria-label={t('home.cycleNav')}>
      <button
        class="icon-btn"
        type="button"
        aria-label={t('home.cyclePrev')}
        disabled={!hydrated}
        onclick={() => goTo(shiftCycle(shown, -1, startDay))}
      >
        <Icon name="chevron-left" />
      </button>
      <p class="cycle__label" aria-live="polite" data-testid="cycle-label">
        {cycleLabel(shown, startDay, locale)}
      </p>
      <button
        class="icon-btn"
        type="button"
        aria-label={t('home.cycleNext')}
        disabled={!hydrated || shown.start >= current.start}
        onclick={() => goTo(shiftCycle(shown, 1, startDay))}
      >
        <Icon name="chevron-right" />
      </button>
      {#if shown.start !== current.start}
        <button class="btn btn--ghost" type="button" onclick={() => goTo(current)}>
          {t('home.cycleCurrent')}
        </button>
      {/if}
    </nav>
  </header>

  {#if failed}
    <div class="card home__error" role="alert">
      <p>{t('home.errorLoad')}</p>
      <button class="btn btn--secondary" type="button" onclick={() => load(shown)}>{t('home.retry')}</button>
    </div>
  {:else if loading}
    <div class="home__grid" aria-busy="true">
      <span class="visually-hidden" role="status">{t('home.loading')}</span>
      <div class="card home__skeleton home__skeleton--hero">
        <span class="skeleton skeleton--title"></span>
        <span class="skeleton skeleton--big"></span>
        <span class="skeleton"></span>
      </div>
      <div class="home__skeleton-stats">
        {#each [1, 2, 3] as n (n)}
          <div class="card home__skeleton"><span class="skeleton"></span><span class="skeleton"></span></div>
        {/each}
      </div>
      {#each [1, 2, 3, 4] as n (n)}
        <div class="card home__skeleton home__skeleton--block">
          <span class="skeleton skeleton--title"></span>
          <span class="skeleton"></span>
          <span class="skeleton"></span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="home__grid">
      <HomeHero
        {figures}
        {isCurrent}
        empty={isCurrent && data.movements.length === 0}
        range={cycleLabel(data.cycle, startDay, locale)}
        {locale}
        {currency}
        {t}
      />
      <HomeStats
        {figures}
        {comparison}
        {main}
        mainName={main ? movementName(main, undefined, t) : ''}
        previousName={previousMonthName}
        {locale}
        {currency}
        {t}
      />
      <SpendingCard
        cycle={data.cycle}
        previousCycle={data.previousCycle}
        {comparison}
        current={currentSeries}
        previous={previousSeries}
        currentName={currentMonthName ? capitalize(currentMonthName) : t('home.thisCycle')}
        previousName={previousMonthName ? capitalize(previousMonthName) : t('home.lastCycleLabel')}
        previousInText={previousMonthName ?? t('home.lastCycle')}
        {locale}
        {currency}
        {t}
      />
      <BudgetsCard
        {risks}
        hasBudgets={data.budgets.some((b) => b.categoryId !== null)}
        {categories}
        {locale}
        {currency}
        {t}
      />
      <LastMovements movements={last} {categories} {today} {locale} {currency} {t} />
      <GoalCard goal={data.goal} {today} {locale} {currency} {t} />
    </div>
  {/if}
</div>

<style>
  .home {
    display: grid;
    gap: var(--space-6);
  }

  .home__head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-4);
    align-items: flex-end;
    justify-content: space-between;
  }

  .home__hello {
    display: grid;
    gap: var(--space-1);
  }

  .home__date {
    color: var(--ink-2);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .cycle {
    display: flex;
    gap: var(--space-1);
    align-items: center;
  }

  .cycle__label {
    min-width: 8.5rem;
    font-weight: 600;
    text-align: center;
  }

  .home__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }

  .home__grid :global(h2) {
    font-size: 1.0625rem;
    line-height: 1.25;
  }

  @media (min-width: 48rem) {
    .home__grid {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    }
  }

  .home__error {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
    justify-content: space-between;
  }

  .home__skeleton {
    display: grid;
    align-content: start;
    gap: var(--space-3);
  }

  .home__skeleton--hero {
    min-height: 14rem;
    border-radius: var(--radius-l);
  }

  .home__skeleton--block {
    min-height: 12rem;
  }

  .home__skeleton-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
    gap: var(--space-3);
  }

  @media (min-width: 48rem) {
    .home__skeleton-stats {
      grid-template-columns: 1fr;
    }
  }

  .skeleton--title {
    width: 40%;
  }

  .skeleton--big {
    width: 60%;
    min-height: 3.5rem;
  }
</style>
