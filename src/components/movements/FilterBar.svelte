<!--
  Movement filters shared by the list and the calendar: a "Filters" button that opens a panel (dates,
  type, categories, amount), then the active filters as removable chips, "Clear filters" and a summary.
  Every change calls `onchange` at once (the island updates the URL and reloads).
  Props:
    filters     Current filters.
    categories  The user's categories.
    locale, currency, today
    t           Translator.
    summary     Optional text after the chips ("17 movements · −333.20 €").
    onchange    Called with the new filters.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import type { IconName } from '../../lib/icons';
  import { emptyFilters, hasFilters, type Filters, type Period } from '../../lib/movements/filters';
  import { shortDate } from '../../lib/movements/format';
  import type { CategoryOption } from '../../lib/movements/model';
  import { centsToInput, formatMoney, parseAmount } from '../../lib/money';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    filters: Filters;
    categories: CategoryOption[];
    locale: Locale;
    currency: string;
    t: Translate;
    summary?: string | undefined;
    onchange: (filters: Filters) => void;
  }

  let { filters, categories, locale, currency, t, summary, onchange }: Props = $props();

  const periodOptions: { value: Period | null; label: Parameters<Translate>[0] }[] = [
    { value: null, label: 'filters.allTime' },
    { value: 'this-month', label: 'filters.thisMonth' },
    { value: 'last-month', label: 'filters.lastMonth' },
    { value: '3-months', label: 'filters.threeMonths' },
    { value: 'custom', label: 'filters.custom' },
  ];

  let open = $state(false);
  // Disabled until hydration, so an early click is never lost.
  let ready = $state(false);
  onMount(() => (ready = true));
  let amountError = $state(false);

  const example = $derived(centsToInput(1250, locale));
  const money = (cents: number) => formatMoney(cents, locale, { currency });
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '';
  const activeCount = $derived(
    Number(filters.period !== null) +
      Number(filters.type !== null) +
      filters.categories.length +
      Number(filters.minCents !== null || filters.maxCents !== null),
  );

  interface Chip {
    key: string;
    label: string;
    without: Filters;
  }

  const chips = $derived.by((): Chip[] => {
    const list: Chip[] = [];
    if (filters.period) {
      const label =
        filters.period !== 'custom'
          ? t(periodOptions.find((o) => o.value === filters.period)?.label ?? 'filters.custom')
          : filters.from && filters.to
            ? t('filters.range', { from: shortDate(filters.from, locale), to: shortDate(filters.to, locale) })
            : filters.from
              ? t('filters.fromDate', { date: shortDate(filters.from, locale) })
              : filters.to
                ? t('filters.toDate', { date: shortDate(filters.to, locale) })
                : t('filters.custom');
      list.push({ key: 'period', label, without: { ...filters, period: null, from: null, to: null } });
    }
    if (filters.type) {
      list.push({
        key: 'type',
        label: t(filters.type === 'income' ? 'editor.income' : 'editor.expense'),
        without: { ...filters, type: null },
      });
    }
    for (const id of filters.categories) {
      list.push({
        key: `cat-${id}`,
        label: categoryName(id),
        without: { ...filters, categories: filters.categories.filter((c) => c !== id) },
      });
    }
    if (filters.minCents !== null) {
      list.push({
        key: 'min',
        label: t('filters.minChip', { amount: money(filters.minCents) }),
        without: { ...filters, minCents: null },
      });
    }
    if (filters.maxCents !== null) {
      list.push({
        key: 'max',
        label: t('filters.maxChip', { amount: money(filters.maxCents) }),
        without: { ...filters, maxCents: null },
      });
    }
    return list;
  });

  function setPeriod(period: Period | null) {
    onchange({ ...filters, period, from: null, to: null });
  }

  function setDate(which: 'from' | 'to', value: string) {
    onchange({ ...filters, [which]: value || null });
  }

  function toggleCategory(id: string) {
    const categoriesNext = filters.categories.includes(id)
      ? filters.categories.filter((c) => c !== id)
      : [...filters.categories, id];
    onchange({ ...filters, categories: categoriesNext });
  }

  /** Amount inputs apply when they change (blur or Enter); a bad value shows an error and is not applied. */
  function setAmounts(form: HTMLElement) {
    const read = (name: string) => {
      const value = form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value.trim() ?? '';
      return value === '' ? null : parseAmount(value, locale);
    };
    const rawMin = form.querySelector<HTMLInputElement>('[name="min"]')?.value.trim() ?? '';
    const rawMax = form.querySelector<HTMLInputElement>('[name="max"]')?.value.trim() ?? '';
    const minCents = read('min');
    const maxCents = read('max');
    const bad =
      (rawMin !== '' && minCents === null) ||
      (rawMax !== '' && maxCents === null) ||
      (minCents !== null && maxCents !== null && minCents > maxCents);
    amountError = bad;
    if (!bad) onchange({ ...filters, minCents, maxCents });
  }
</script>

<div class="filters">
  <div class="filters__bar">
    <button
      class="btn btn--secondary"
      type="button"
      aria-expanded={open}
      aria-controls="filters-panel"
      disabled={!ready}
      onclick={() => (open = !open)}
    >
      <Icon name="sliders" />
      {t('filters.button')}
      {#if activeCount > 0}<span class="badge badge--accent">{activeCount}</span>{/if}
    </button>
    {#if summary}<p class="filters__summary num" aria-live="polite">{summary}</p>{/if}
  </div>

  {#if open}
    <section id="filters-panel" class="filters__panel card" aria-labelledby="filters-title">
      <h2 id="filters-title" class="visually-hidden">{t('filters.title')}</h2>

      <fieldset>
        <legend class="field__label">{t('filters.period')}</legend>
        <div class="chips">
          {#each periodOptions as option (option.value ?? 'all')}
            <label class="chip">
              <input
                type="radio"
                name="filter-period"
                checked={filters.period === option.value}
                onchange={() => setPeriod(option.value)}
              />
              {t(option.label)}
            </label>
          {/each}
        </div>
        {#if filters.period === 'custom'}
          <div class="filters__pair">
            <div class="field">
              <label class="field__label" for="filter-from">{t('filters.from')}</label>
              <input
                id="filter-from"
                class="field__input"
                type="date"
                value={filters.from ?? ''}
                max={filters.to ?? undefined}
                onchange={(event) => setDate('from', event.currentTarget.value)}
              />
            </div>
            <div class="field">
              <label class="field__label" for="filter-to">{t('filters.to')}</label>
              <input
                id="filter-to"
                class="field__input"
                type="date"
                value={filters.to ?? ''}
                min={filters.from ?? undefined}
                onchange={(event) => setDate('to', event.currentTarget.value)}
              />
            </div>
          </div>
        {/if}
      </fieldset>

      <fieldset>
        <legend class="field__label">{t('filters.type')}</legend>
        <div class="segmented">
          {#each [[null, 'filters.anyType'], ['expense', 'editor.expense'], ['income', 'editor.income']] as const as [value, label] (value ?? 'all')}
            <label class="segmented__item">
              <input
                type="radio"
                name="filter-type"
                checked={filters.type === value}
                onchange={() => onchange({ ...filters, type: value })}
              />
              {t(label)}
            </label>
          {/each}
        </div>
      </fieldset>

      <fieldset>
        <legend class="field__label">{t('filters.categories')}</legend>
        <div class="chips">
          {#each categories as category (category.id)}
            <label class="chip">
              <input
                type="checkbox"
                checked={filters.categories.includes(category.id)}
                onchange={() => toggleCategory(category.id)}
              />
              <span class="cat-tile" data-color={category.color} aria-hidden="true">
                <Icon name={category.icon as IconName} />
              </span>
              {category.name}
            </label>
          {/each}
        </div>
      </fieldset>

      <fieldset
        class="filters__amounts"
        aria-describedby={amountError ? 'filter-amount-error' : undefined}
        onchange={(event) => setAmounts(event.currentTarget)}
      >
        <legend class="field__label">{t('filters.amount')}</legend>
        <div class="filters__pair">
          <div class="field">
            <label class="field__label" for="filter-min">{t('filters.min')}</label>
            <input
              id="filter-min"
              name="min"
              class="field__input"
              inputmode="decimal"
              autocomplete="off"
              value={filters.minCents === null ? '' : centsToInput(filters.minCents, locale)}
              aria-invalid={amountError ? 'true' : undefined}
            />
          </div>
          <div class="field">
            <label class="field__label" for="filter-max">{t('filters.max')}</label>
            <input
              id="filter-max"
              name="max"
              class="field__input"
              inputmode="decimal"
              autocomplete="off"
              value={filters.maxCents === null ? '' : centsToInput(filters.maxCents, locale)}
              aria-invalid={amountError ? 'true' : undefined}
            />
          </div>
        </div>
        {#if amountError}
          <p class="field__error" id="filter-amount-error">
            <Icon name="alert" />{t('filters.errorAmount', { example })}
          </p>
        {/if}
      </fieldset>

      <div class="filters__actions">
        {#if hasFilters(filters)}
          <button class="btn btn--ghost" type="button" onclick={() => onchange(emptyFilters)}
            >{t('filters.clear')}</button
          >
        {/if}
        <button class="btn btn--primary" type="button" onclick={() => (open = false)}
          >{t('filters.done')}</button
        >
      </div>
    </section>
  {/if}

  {#if chips.length > 0}
    <div class="filters__active">
      <h2 class="visually-hidden">{t('filters.active')}</h2>
      <ul class="chips">
        {#each chips as chip (chip.key)}
          <li class="chip chip--on">
            {chip.label}
            <button
              class="chip__remove"
              type="button"
              aria-label={t('filters.remove', { name: chip.label })}
              onclick={() => onchange(chip.without)}
            >
              <Icon name="x" />
            </button>
          </li>
        {/each}
        <li>
          <button class="btn btn--ghost filters__clear" type="button" onclick={() => onchange(emptyFilters)}>
            {t('filters.clear')}
          </button>
        </li>
      </ul>
    </div>
  {/if}
</div>

<style>
  .filters {
    display: grid;
    gap: var(--space-3);
  }

  .filters__bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
  }

  .filters__summary {
    color: var(--ink-2);
    font-size: 0.9375rem;
  }

  .filters__panel {
    display: grid;
    gap: var(--space-5);
  }

  fieldset {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .segmented {
    justify-self: start;
  }

  .filters__pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 12rem));
    gap: var(--space-3);
  }

  .filters__actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .filters__active .chip {
    cursor: default;
  }

  .filters__clear {
    min-height: 2.25rem;
  }
</style>
