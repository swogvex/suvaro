<!--
  Movements list (island on /app/movements): filters, days newest first with their totals, infinite scroll
  by month (with skeleton rows), and the empty, error and "no results" states. The first month arrives
  rendered from the server; later months load as the end of the list comes into view.
  Stays in sync with every optimistic write (`suvaro:movement` events) and refreshes when the tab comes
  back after a while (another device may have written).
  Props:
    initial     First page from the server (`GET /api/movements` shape).
    filters     Filters read from the URL.
    categories, locale, currency, today
    messages    Translated strings.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Locale } from '../../i18n';
  import { translator, type Messages } from '../../i18n/client';
  import { monthOf, monthStart } from '../../lib/dates';
  import {
    deleteMovement,
    fetchMonth,
    onChange,
    openEditor,
    type MonthResponse,
  } from '../../lib/movements/client';
  import {
    filtersToParams,
    hasFilters,
    matchesFilters,
    sameFilters,
    type Filters,
  } from '../../lib/movements/filters';
  import {
    dayHeading,
    monthName,
    monthOnly,
    movementAmount,
    movementName,
    signedMoney,
  } from '../../lib/movements/format';
  import { groupByDay, signedCents, type CategoryOption, type Movement } from '../../lib/movements/model';
  import { syncUrl } from '../../lib/movements/view-url';
  import Icon from '../ui/Icon.svelte';
  import FilterBar from './FilterBar.svelte';
  import MovementRow from './MovementRow.svelte';

  interface Props {
    initial: MonthResponse;
    filters: Filters;
    categories: CategoryOption[];
    locale: Locale;
    currency: string;
    today: string;
    messages: Messages;
  }

  let { initial, filters: initialFilters, categories, locale, currency, today, messages }: Props = $props();

  const t = $derived(translator(messages));
  /** Refresh on tab focus only when the data is at least this old. */
  const STALE_MS = 60_000;

  // Local copies of the server data: the island owns them from here on.
  // svelte-ignore state_referenced_locally
  let filters = $state(initialFilters);
  // svelte-ignore state_referenced_locally
  let items = $state<Movement[]>(initial.items);
  // svelte-ignore state_referenced_locally
  let oldest = $state<string | null>(initial.month);
  // svelte-ignore state_referenced_locally
  let next = $state<string | null>(initial.next);
  // svelte-ignore state_referenced_locally
  let summary = $state(initial.summary ?? null);
  let loading = $state<'first' | 'more' | null>(null);
  let failed = $state<'first' | 'more' | null>(null);
  let loadedAt = Date.now();
  let request: AbortController | undefined;
  let sentinel: HTMLElement | undefined = $state();

  const groups = $derived(groupByDay(items));
  const filtered = $derived(hasFilters(filters));
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id);
  const summaryText = $derived(
    filtered && summary
      ? t(summary.count === 1 ? 'movements.summaryOne' : 'movements.summary', {
          count: summary.count.toLocaleString(locale),
          amount: signedMoney(summary.netCents, locale, currency),
        })
      : undefined,
  );

  /** Loaded range: everything from the oldest loaded month on (or all of it when there is no more). */
  function inLoadedRange(movement: Movement): boolean {
    return next === null || oldest === null || movement.date >= monthStart(oldest);
  }

  function applyChange(movement: Movement | null, id: string) {
    const before = items.find((m) => m.id === id);
    const counts = movement !== null && matchesFilters(movement, filters, today);
    if (summary) {
      let { count, netCents } = summary;
      if (before) {
        count -= 1;
        netCents -= signedCents(before);
      }
      if (counts && movement) {
        count += 1;
        netCents += signedCents(movement);
      }
      summary = { count, netCents };
    }
    const rest = items.filter((m) => m.id !== id);
    items = counts && movement && inLoadedRange(movement) ? [...rest, movement] : rest;
    if (movement && counts && oldest === null) oldest = monthOf(movement.date);
  }

  async function loadFirst(quiet = false) {
    request?.abort();
    request = new AbortController();
    if (!quiet) loading = 'first';
    failed = null;
    try {
      const page = await fetchMonth(filtersToParams(filters), undefined, request.signal);
      items = page.items;
      oldest = page.month;
      next = page.next;
      summary = page.summary ?? null;
      loadedAt = Date.now();
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      if (!quiet) failed = 'first';
    } finally {
      if (!quiet) loading = null;
    }
  }

  async function loadMore() {
    if (!next || loading) return;
    const month = next;
    loading = 'more';
    failed = null;
    const controller = (request = new AbortController());
    try {
      const page = await fetchMonth(filtersToParams(filters), month, controller.signal);
      const known = new Set(items.map((m) => m.id));
      items = [...items, ...page.items.filter((m) => !known.has(m.id))];
      oldest = page.month;
      next = page.next;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') failed = 'more';
    } finally {
      loading = null;
    }
  }

  function changeFilters(value: Filters) {
    if (sameFilters(value, filters)) return;
    filters = value;
    syncUrl(value);
    void loadFirst();
  }

  function edit(movement: Movement) {
    openEditor({ movement });
  }

  function remove(movement: Movement) {
    const name = movementName(movement, categoryOf(movement.categoryId), t);
    deleteMovement(movement, {
      done: t('movements.deleted', { name, amount: movementAmount(movement, locale, currency) }),
      failed: () => t('movements.errorSave'),
    });
  }

  onMount(() => {
    const stop = onChange((change) =>
      change.kind === 'upsert'
        ? applyChange(change.movement, change.movement.id)
        : applyChange(null, change.id),
    );
    const refresh = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt > STALE_MS) void loadFirst(true);
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', refresh);
    };
  });

  // Infinite scroll: load the next month when the end of the list comes near.
  $effect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && failed !== 'more') void loadMore();
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
</script>

<div class="movements">
  <FilterBar {filters} {categories} {locale} {currency} {t} summary={summaryText} onchange={changeFilters} />

  {#if loading === 'first'}
    <div class="skeleton-list" aria-busy="true">
      <p class="visually-hidden" role="status">
        {t('movements.loading', { month: monthName(monthOf(today), locale) })}
      </p>
      {#each [1, 2, 3, 4, 5] as row (row)}
        <div class="skeleton-row" aria-hidden="true">
          <span class="skeleton skeleton--tile"></span>
          <span class="skeleton skeleton--text"></span>
          <span class="skeleton skeleton--amount"></span>
        </div>
      {/each}
    </div>
  {:else if failed === 'first'}
    <div class="state card" role="alert">
      <p>{t('movements.errorLoad')}</p>
      <button class="btn btn--secondary" type="button" onclick={() => loadFirst()}
        >{t('movements.retry')}</button
      >
    </div>
  {:else if groups.length === 0}
    {#if filtered}
      <div class="state card">
        <p>{t('movements.emptyFiltered')}</p>
      </div>
    {:else}
      <div class="state state--empty card">
        <svg class="state__art" viewBox="0 0 160 96" aria-hidden="true" focusable="false">
          <rect class="art-1" x="14" y="38" width="44" height="44" rx="10" />
          <rect class="art-2" x="66" y="18" width="34" height="64" rx="8" />
          <circle class="art-3" cx="128" cy="58" r="22" />
          <rect class="art-4" x="108" y="12" width="20" height="20" rx="5" />
        </svg>
        <h2 class="state__title">
          {t('movements.emptyTitle', { month: monthOnly(monthOf(today), locale) })}
        </h2>
        <p class="state__text">{t('movements.emptyText')}</p>
        <button class="btn btn--primary" type="button" onclick={() => openEditor()}>
          <Icon name="plus" />{t('movements.emptyAction')}
        </button>
      </div>
    {/if}
  {:else}
    <div class="days">
      {#each groups as group (group.date)}
        <section class="day" aria-labelledby="day-{group.date}">
          <header class="day__head">
            <h2 class="day__title" id="day-{group.date}">{dayHeading(group.date, today, locale, t)}</h2>
            <p class="day__total num">
              <span class="visually-hidden">
                {t('movements.dayTotal', { amount: signedMoney(group.totalCents, locale, currency) })}
              </span>
              <span aria-hidden="true">{signedMoney(group.totalCents, locale, currency)}</span>
            </p>
          </header>
          <ul class="day__list">
            {#each group.items as movement (movement.id)}
              <MovementRow
                {movement}
                category={categoryOf(movement.categoryId)}
                {locale}
                {currency}
                {t}
                onedit={edit}
                ondelete={remove}
              />
            {/each}
          </ul>
        </section>
      {/each}
    </div>

    <div class="more" bind:this={sentinel}>
      {#if loading === 'more' && next}
        <p class="more__text" role="status">{t('movements.loading', { month: monthName(next, locale) })}</p>
        {#each [1, 2, 3] as row (row)}
          <div class="skeleton-row" aria-hidden="true">
            <span class="skeleton skeleton--tile"></span>
            <span class="skeleton skeleton--text"></span>
            <span class="skeleton skeleton--amount"></span>
          </div>
        {/each}
      {:else if failed === 'more'}
        <div class="state" role="alert">
          <p>{t('movements.errorLoad')}</p>
          <button class="btn btn--secondary" type="button" onclick={() => loadMore()}
            >{t('movements.retry')}</button
          >
        </div>
      {:else if next === null}
        <p class="more__text">{t('movements.end')}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .movements {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-6);
  }

  .days {
    display: grid;
    gap: var(--space-4);
  }

  .day {
    padding: var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .day__head {
    display: flex;
    gap: var(--space-3);
    align-items: baseline;
    justify-content: space-between;
    padding: var(--space-2) var(--space-2) var(--space-1);
  }

  .day__title {
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  .day__total {
    color: var(--ink-2);
    font-size: 0.875rem;
  }

  .day__list {
    display: grid;
    margin: 0;
    padding: 0;
  }

  .more {
    display: grid;
    gap: var(--space-2);
    justify-items: stretch;
    min-height: 1px;
  }

  .more__text {
    color: var(--ink-2);
    font-size: 0.875rem;
    text-align: center;
  }

  .skeleton-list {
    display: grid;
    gap: var(--space-2);
  }

  .skeleton-row {
    display: grid;
    grid-template-columns: 2.25rem 1fr 5rem;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-2);
  }

  .skeleton--tile {
    height: 2.25rem;
    border-radius: var(--radius-btn);
  }

  .skeleton--text {
    width: 60%;
  }

  .state {
    display: grid;
    gap: var(--space-3);
    justify-items: start;
  }

  .state--empty {
    justify-items: center;
    padding-block: var(--space-8);
    text-align: center;
  }

  .state__art {
    width: 10rem;
    height: auto;
  }

  .art-1 {
    fill: var(--cat-1);
  }

  .art-2 {
    fill: var(--cat-2);
  }

  .art-3 {
    fill: var(--cat-3);
  }

  .art-4 {
    fill: var(--cat-4);
  }

  .state__title {
    font-size: 1.375rem;
  }

  .state__text {
    max-width: 36ch;
    color: var(--ink-2);
  }
</style>
