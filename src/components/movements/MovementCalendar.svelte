<!--
  Movements calendar (island on /app/movements/calendar). Month grid starting on the profile's week start.
  Desktop cells show the day total and a bar proportional to the day's spending (over 150 in the second
  accent); phone cells show a dot sized by spending (< 30, 30–150, > 150) with a legend. Selecting a day
  shows its movements (desktop: side panel, phones: card below) and "Note on this day".
  `←` / `→` change the month. Filters are shared with the list.
  Props:
    initial     The month's movements from the server.
    month       `YYYY-MM` shown first.
    filters, categories, locale, currency, today, weekStart
    messages    Translated strings.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Locale } from '../../i18n';
  import { translator, type Messages } from '../../i18n/client';
  import { calendarWeeks, monthOf, shiftMonth } from '../../lib/dates';
  import { deleteMovement, fetchMonth, onChange, openEditor } from '../../lib/movements/client';
  import { filtersToParams, matchesFilters, sameFilters, type Filters } from '../../lib/movements/filters';
  import {
    longDate,
    monthName,
    movementAmount,
    movementName,
    signedMoney,
    weekdayNames,
  } from '../../lib/movements/format';
  import { groupByDay, type CategoryOption, type Movement } from '../../lib/movements/model';
  import { formatMoney } from '../../lib/money';
  import { syncUrl } from '../../lib/movements/view-url';
  import Icon from '../ui/Icon.svelte';
  import FilterBar from './FilterBar.svelte';
  import MovementRow from './MovementRow.svelte';

  interface Props {
    initial: Movement[];
    month: string;
    filters: Filters;
    categories: CategoryOption[];
    locale: Locale;
    currency: string;
    today: string;
    weekStart: 1 | 7;
    messages: Messages;
  }

  let {
    initial,
    month: initialMonth,
    filters: initialFilters,
    categories,
    locale,
    currency,
    today,
    weekStart,
    messages,
  }: Props = $props();

  const t = $derived(translator(messages));
  /** Spending thresholds in cents: dots small < 30, medium 30–150, large > 150; bars over 150 use accent 2. */
  const LOW = 3_000;
  const HIGH = 15_000;

  // svelte-ignore state_referenced_locally
  let month = $state(initialMonth);
  // svelte-ignore state_referenced_locally
  let filters = $state(initialFilters);
  // svelte-ignore state_referenced_locally
  let items = $state<Movement[]>(initial);
  // svelte-ignore state_referenced_locally
  let selected = $state<string | null>(monthOf(today) === initialMonth ? today : null);
  let loading = $state(false);
  // Month buttons stay disabled until hydration, so an early click is never lost.
  let ready = $state(false);
  let failed = $state(false);
  let request: AbortController | undefined;
  let grid: HTMLElement | undefined = $state();

  const weeks = $derived(calendarWeeks(month, weekStart));
  const days = $derived(new Map(groupByDay(items).map((group) => [group.date, group])));
  /** Expenses per day, in cents. */
  const spend = $derived(
    new Map(
      [...days.values()].map((group) => [
        group.date,
        group.items.reduce((sum, m) => sum + (m.type === 'expense' ? m.amountCents : 0), 0),
      ]),
    ),
  );
  const maxSpend = $derived(Math.max(1, ...spend.values()));
  const shortNames = $derived(weekdayNames(locale, weekStart, 'short'));
  const longNames = $derived(weekdayNames(locale, weekStart, 'long'));
  const selectedGroup = $derived(selected ? days.get(selected) : undefined);
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id);
  const money = (cents: number) => formatMoney(cents, locale, { currency, wholeUnits: true });

  function level(cents: number): 'none' | 'low' | 'mid' | 'high' {
    if (cents <= 0) return 'none';
    if (cents < LOW) return 'low';
    return cents <= HIGH ? 'mid' : 'high';
  }

  async function load() {
    request?.abort();
    request = new AbortController();
    loading = true;
    failed = false;
    try {
      const page = await fetchMonth(filtersToParams(filters), month, request.signal);
      items = page.items;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') failed = true;
    } finally {
      loading = false;
    }
  }

  function goTo(target: string) {
    month = target;
    selected = monthOf(today) === target ? today : null;
    syncUrl(filters, { month });
    void load();
  }

  function changeFilters(value: Filters) {
    if (sameFilters(value, filters)) return;
    filters = value;
    syncUrl(value, { month });
    void load();
  }

  async function select(date: string) {
    selected = date;
    await tick();
  }

  /** Arrow keys move between days inside the grid (roving focus on the day buttons). */
  async function moveFocus(event: KeyboardEvent, date: string) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    const all = weeks.flat().filter((d): d is string => d !== null);
    const target = all[all.indexOf(date) + step];
    if (!target) return;
    await select(target);
    grid?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)?.focus();
  }

  function remove(movement: Movement) {
    const name = movementName(movement, categoryOf(movement.categoryId), t);
    deleteMovement(movement, {
      done: t('movements.deleted', { name, amount: movementAmount(movement, locale, currency) }),
      failed: () => t('movements.errorSave'),
    });
  }

  onMount(() => {
    ready = true;
    const stop = onChange((change) => {
      const rest = items.filter((m) => m.id !== (change.kind === 'upsert' ? change.movement.id : change.id));
      if (
        change.kind === 'upsert' &&
        monthOf(change.movement.date) === month &&
        matchesFilters(change.movement, filters, today)
      ) {
        items = [...rest, change.movement];
      } else {
        items = rest;
      }
    });
    // ← / → change the month, unless typing or inside a dialog.
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable], dialog, [data-calendar-grid]')) return;
      if (event.key === 'ArrowLeft') goTo(shiftMonth(month, -1));
      if (event.key === 'ArrowRight') goTo(shiftMonth(month, 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      stop();
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="calendar">
  <FilterBar {filters} {categories} {locale} {currency} {t} onchange={changeFilters} />

  <div class="calendar__layout">
    <section class="calendar__main card" aria-labelledby="calendar-title">
      <header class="calendar__head">
        <h2 id="calendar-title" class="calendar__title" aria-live="polite">
          {monthName(month, locale)}
        </h2>
        <div class="calendar__nav">
          {#if month !== monthOf(today)}
            <button
              class="btn btn--ghost"
              type="button"
              disabled={!ready}
              onclick={() => goTo(monthOf(today))}>{t('calendar.current')}</button
            >
          {/if}
          <button
            class="icon-btn"
            type="button"
            aria-label={t('calendar.prev')}
            disabled={!ready}
            onclick={() => goTo(shiftMonth(month, -1))}
          >
            <Icon name="chevron-left" />
          </button>
          <button
            class="icon-btn"
            type="button"
            aria-label={t('calendar.next')}
            disabled={!ready}
            onclick={() => goTo(shiftMonth(month, 1))}
          >
            <Icon name="chevron-right" />
          </button>
        </div>
      </header>

      {#if failed}
        <div class="calendar__error" role="alert">
          <p>{t('movements.errorLoad')}</p>
          <button class="btn btn--secondary" type="button" onclick={() => load()}
            >{t('movements.retry')}</button
          >
        </div>
      {/if}

      <table class="grid" aria-busy={loading} data-calendar-grid bind:this={grid}>
        <thead>
          <tr>
            {#each shortNames as name, i (i)}
              <th scope="col"><abbr title={longNames[i]}>{name}</abbr></th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each weeks as week, w (w)}
            <tr>
              {#each week as date, d (d)}
                <td>
                  {#if date}
                    {@const group = days.get(date)}
                    {@const spent = spend.get(date) ?? 0}
                    <button
                      class="day"
                      type="button"
                      data-date={date}
                      data-level={level(spent)}
                      aria-pressed={selected === date}
                      aria-current={date === today ? 'date' : undefined}
                      tabindex={selected === date || (!selected && date.endsWith('-01')) ? 0 : -1}
                      onclick={() => select(date)}
                      onkeydown={(event) => moveFocus(event, date)}
                    >
                      <span class="visually-hidden">{longDate(date, locale)}</span>
                      <span class="day__number" aria-hidden="true">{Number(date.slice(8))}</span>
                      {#if group}
                        <span class="day__total num">{signedMoney(group.totalCents, locale, currency)}</span>
                      {/if}
                      {#if spent > 0}
                        <svg
                          class="day__bar"
                          viewBox="0 0 100 4"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <rect width={Math.max(4, Math.round((spent / maxSpend) * 100))} height="4" rx="1" />
                        </svg>
                        <span class="day__dot" aria-hidden="true"></span>
                      {/if}
                    </button>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="legend">
        <p class="legend__title">{t('calendar.legend')}</p>
        <ul>
          <li>
            <span class="legend__dot" data-level="low" aria-hidden="true"></span>{t('calendar.legendLow', {
              amount: money(LOW),
            })}
          </li>
          <li>
            <span class="legend__dot" data-level="mid" aria-hidden="true"></span>{t('calendar.legendMid', {
              low: money(LOW),
              high: money(HIGH),
            })}
          </li>
          <li>
            <span class="legend__dot" data-level="high" aria-hidden="true"></span>{t('calendar.legendHigh', {
              amount: money(HIGH),
            })}
          </li>
        </ul>
      </div>
    </section>

    {#if selected}
      <section class="panel card" aria-labelledby="calendar-day-title">
        <header class="panel__head">
          <h2 id="calendar-day-title" class="panel__title">{longDate(selected, locale)}</h2>
          {#if selectedGroup}
            <p class="panel__total num">{signedMoney(selectedGroup.totalCents, locale, currency)}</p>
          {/if}
        </header>
        {#if selectedGroup}
          <ul class="panel__list">
            {#each selectedGroup.items as movement (movement.id)}
              <MovementRow
                {movement}
                category={categoryOf(movement.categoryId)}
                {locale}
                {currency}
                {t}
                onedit={(m) => openEditor({ movement: m })}
                ondelete={remove}
              />
            {/each}
          </ul>
        {:else if selected <= today}
          <p class="panel__empty">{t('calendar.nothing')}</p>
        {/if}
        {#if selected > today}
          <p class="panel__empty">{t('calendar.future')}</p>
        {:else}
          <button
            class="btn btn--secondary"
            type="button"
            onclick={() => openEditor({ date: selected ?? today })}
          >
            <Icon name="plus" />{t('calendar.noteOnDay')}
          </button>
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .calendar {
    display: grid;
    gap: var(--space-6);
  }

  .calendar__layout {
    display: grid;
    gap: var(--space-4);
    align-items: start;
  }

  .calendar__main {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-3);
  }

  .calendar__head {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
  }

  .calendar__title {
    font-size: 1.25rem;
    text-transform: capitalize;
  }

  .calendar__nav {
    display: flex;
    gap: var(--space-1);
    align-items: center;
  }

  .calendar__error {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
  }

  .grid {
    width: 100%;
    border-collapse: separate;
    border-spacing: 2px;
    table-layout: fixed;
  }

  .grid[aria-busy='true'] {
    opacity: 0.6;
  }

  th {
    padding-block: var(--space-1);
    color: var(--ink-2);
    font-size: 0.75rem;
    font-weight: 600;
  }

  abbr {
    text-decoration: none;
  }

  td {
    padding: 0;
  }

  .day {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: 3rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }

  .day:hover {
    background: var(--surface-2);
  }

  .day[aria-current='date'] .day__number {
    color: var(--accent);
    font-weight: 700;
  }

  .day[aria-pressed='true'] {
    border-color: var(--ink);
    background: var(--surface-2);
  }

  .day__number {
    font-size: 0.875rem;
  }

  .day__total,
  .day__bar {
    display: none;
  }

  .day__dot {
    position: absolute;
    bottom: 5px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--accent);
  }

  .day[data-level='mid'] .day__dot {
    width: 7px;
    height: 7px;
  }

  .day[data-level='high'] .day__dot {
    width: 10px;
    height: 10px;
    bottom: 3px;
    background: var(--accent-2);
  }

  .legend {
    display: grid;
    gap: var(--space-1);
    color: var(--ink-2);
    font-size: 0.8125rem;
  }

  .legend__title {
    font-weight: 600;
  }

  .legend ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .legend li {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .legend__dot {
    display: inline-block;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--accent);
  }

  .legend__dot[data-level='mid'] {
    width: 7px;
    height: 7px;
  }

  .legend__dot[data-level='high'] {
    width: 10px;
    height: 10px;
    background: var(--accent-2);
  }

  .panel {
    display: grid;
    gap: var(--space-3);
    justify-items: start;
  }

  .panel__head {
    display: flex;
    gap: var(--space-3);
    align-items: baseline;
    justify-content: space-between;
    width: 100%;
  }

  .panel__title {
    font-family: var(--font-ui);
    font-size: 1.0625rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  .panel__total {
    color: var(--ink-2);
    font-size: 0.9375rem;
  }

  .panel__list {
    display: grid;
    width: 100%;
    margin: 0;
    padding: 0;
  }

  .panel__empty {
    color: var(--ink-2);
  }

  /* Desktop: 84 px cells with total and bar; legend for dots not needed; day panel on the side. */
  @media (min-width: 48rem) {
    .calendar__layout {
      grid-template-columns: minmax(0, 1fr) 20rem;
    }

    .day {
      align-content: space-between;
      justify-items: start;
      height: 5.25rem;
      padding: var(--space-2);
      border-color: var(--line);
    }

    .day__total {
      display: block;
      overflow: hidden;
      max-width: 100%;
      font-size: 0.75rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .day__bar {
      display: block;
      width: 100%;
      height: 4px;
      fill: var(--accent);
    }

    .day[data-level='high'] .day__bar {
      fill: var(--accent-2);
    }

    .day__dot,
    .legend {
      display: none;
    }
  }
</style>
