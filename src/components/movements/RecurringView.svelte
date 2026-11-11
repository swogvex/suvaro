<!--
  Movements · Recurring (island on /app/movements/recurring): what is waiting for confirmation (Confirm /
  Skip this time), three summary cards and the table of templates (scrolls sideways on phones). Every
  write is optimistic (the screen changes first, then the API; a failure rolls back with a toast).
  Deleting a template offers Undo for 5 seconds before it reaches the server.
  Props:
    initial      `loadRecurring` for the user.
    today, locale, currency
    categories   The user's categories (names and tiles).
    messages     Translated strings.
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import { translator, type Messages } from '../../i18n/client';
  import type { IconName } from '../../lib/icons';
  import { ulid } from '../../lib/id';
  import { formatMoney } from '../../lib/money';
  import { emitChange } from '../../lib/movements/client';
  import { shortDate, signedMoney } from '../../lib/movements/format';
  import type { CategoryOption } from '../../lib/movements/model';
  import * as api from '../../lib/recurring/client';
  import { frequencyLabel, recurringName } from '../../lib/recurring/format';
  import {
    compareRecurring,
    ended,
    MAX_RECURRING,
    summarize,
    type PendingItem,
    type Recurring,
    type RecurringData,
    type RecurringFields,
  } from '../../lib/recurring/model';
  import { firstDue } from '../../lib/recurring/schedule';
  import { showPlanDot, showToast } from '../../lib/toast';
  import Icon from '../ui/Icon.svelte';
  import RecurringDialog from './RecurringDialog.svelte';

  interface Props {
    initial: RecurringData;
    today: string;
    categories: CategoryOption[];
    locale: Locale;
    currency: string;
    messages: Messages;
  }

  let { initial, today, categories, locale, currency, messages }: Props = $props();

  const t = $derived(translator(messages));

  // svelte-ignore state_referenced_locally
  let data = $state<RecurringData>(initial);
  let dialog: RecurringDialog | undefined = $state();

  const byId = $derived(new Map(categories.map((c) => [c.id, c])));
  const summary = $derived(summarize(data.items));
  const atLimit = $derived(data.items.length >= MAX_RECURRING);

  const money = (cents: number) => formatMoney(cents, locale, { currency });
  const signed = (item: { type: 'income' | 'expense'; amountCents: number }) =>
    signedMoney(item.type === 'income' ? item.amountCents : -item.amountCents, locale, currency);
  const nameOf = (item: Pick<Recurring, 'note' | 'type' | 'categoryId'>) =>
    recurringName(item, item.categoryId ? byId.get(item.categoryId) : undefined, t);
  const metaOf = (item: Pick<Recurring, 'type' | 'categoryId'>) =>
    item.type === 'income'
      ? t('movements.income')
      : ((item.categoryId ? byId.get(item.categoryId)?.name : undefined) ?? t('movements.noCategory'));
  const iconOf = (item: Pick<Recurring, 'type' | 'categoryId'>): IconName =>
    item.type === 'income'
      ? 'wallet'
      : (((item.categoryId ? byId.get(item.categoryId)?.icon : undefined) ?? 'dots') as IconName);
  const colorOf = (item: Pick<Recurring, 'type' | 'categoryId'>) =>
    item.type === 'income' ? 3 : ((item.categoryId ? byId.get(item.categoryId)?.color : undefined) ?? 7);

  function failed(error: unknown): string {
    const code = error instanceof api.ApiError ? error.code : '';
    if (code === 'LIMIT_REACHED') return t('recurring.errorLimit');
    if (code === 'NETWORK' && !navigator.onLine) return t('recurring.errorOffline');
    return t('recurring.errorSave');
  }

  function setItem(item: Recurring) {
    const others = data.items.filter((i) => i.id !== item.id);
    data.items = [...others, item].sort(compareRecurring);
  }

  // ------------------------------------------------------------------------------------------ templates

  async function save(fields: RecurringFields, editing: Recurring | null) {
    const snapshot = data.items;
    const from = fields.anchorDate > today ? fields.anchorDate : today;
    if (editing) {
      setItem({ ...editing, ...fields, nextDate: firstDue(fields, from) });
      showToast(t('recurring.updated'));
      try {
        setItem(await api.updateRecurring(editing.id, fields));
      } catch (error) {
        data.items = snapshot;
        showToast(failed(error));
      }
      return;
    }
    const id = ulid();
    setItem({ id, ...fields, nextDate: firstDue(fields, from) });
    showToast(t('recurring.created', { name: nameOf(fields) }));
    try {
      setItem(await api.createRecurring(id, fields));
    } catch (error) {
      data.items = snapshot;
      showToast(failed(error));
    }
  }

  function remove(item: Recurring) {
    const snapshot = data;
    data = {
      items: data.items.filter((i) => i.id !== item.id),
      pending: data.pending.filter((p) => p.recurringId !== item.id),
    };
    showToast(t('recurring.deleted', { name: nameOf(item) }), {
      undo: () => (data = snapshot),
      onDismiss: () => {
        void api.deleteRecurring(item.id).catch((error: unknown) => {
          if (error instanceof api.ApiError && error.code === 'NOT_FOUND') return;
          data = snapshot;
          showToast(failed(error));
        });
      },
    });
  }

  // -------------------------------------------------------------------------------------------- pending

  async function confirm(pending: PendingItem) {
    const snapshot = data.pending;
    data.pending = data.pending.filter((p) => p.id !== pending.id);
    showToast(t('recurring.confirmed', { name: nameOf(pending), amount: signed(pending) }));
    try {
      const result = await api.confirmPending(pending.id);
      emitChange({ kind: 'upsert', movement: result.movement });
      if (result.alert) {
        showPlanDot();
        showToast(result.alert, { queue: true });
      }
    } catch (error) {
      if (error instanceof api.ApiError && error.code === 'NOT_FOUND') return;
      data.pending = snapshot;
      showToast(failed(error));
    }
  }

  async function skip(pending: PendingItem) {
    const snapshot = data.pending;
    data.pending = data.pending.filter((p) => p.id !== pending.id);
    showToast(t('recurring.skipped', { name: nameOf(pending) }));
    try {
      await api.skipPending(pending.id);
    } catch (error) {
      if (error instanceof api.ApiError && error.code === 'NOT_FOUND') return;
      data.pending = snapshot;
      showToast(failed(error));
    }
  }

  const pendingText = (p: PendingItem) => ({
    name: nameOf(p),
    amount: signed(p),
    date: shortDate(p.dueDate, locale),
  });
</script>

<div class="recurring">
  {#if data.pending.length > 0}
    <section class="pending card" aria-labelledby="pending-title">
      <h2 id="pending-title" class="visually-hidden">{t('recurring.pendingTitle')}</h2>
      {#if data.pending.length === 1 && data.pending[0]}
        {@const only = data.pending[0]}
        <div class="pending__row">
          <p class="pending__text">
            <Icon name="clock" />{t('recurring.pendingOne', pendingText(only))}
          </p>
          <div class="pending__actions">
            <button class="btn btn--ghost" type="button" onclick={() => skip(only)}
              >{t('recurring.skip')}</button
            >
            <button class="btn btn--primary" type="button" onclick={() => confirm(only)}>
              <Icon name="check" />{t('recurring.confirm')}
            </button>
          </div>
        </div>
      {:else}
        <p class="pending__text">
          <Icon name="clock" />{t('recurring.pendingMany', { count: data.pending.length })}
        </p>
        <ul class="pending__list">
          {#each data.pending as item (item.id)}
            <li class="pending__row">
              <span>{t('recurring.pendingItem', pendingText(item))}</span>
              <div class="pending__actions">
                <button class="btn btn--ghost" type="button" onclick={() => skip(item)}>
                  {t('recurring.skip')}
                </button>
                <button class="btn btn--primary" type="button" onclick={() => confirm(item)}>
                  <Icon name="check" />{t('recurring.confirm')}
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  {#if data.items.length === 0}
    <div class="state card">
      <svg class="state__art" viewBox="0 0 160 96" aria-hidden="true" focusable="false">
        <rect class="art-1" x="14" y="30" width="40" height="40" rx="10" />
        <rect class="art-2" x="62" y="30" width="40" height="40" rx="10" />
        <rect class="art-3" x="110" y="30" width="40" height="40" rx="10" />
        <rect class="art-4" x="44" y="80" width="72" height="6" rx="3" />
      </svg>
      <h2 class="state__title">{t('recurring.emptyTitle')}</h2>
      <p class="state__text">{t('recurring.emptyText')}</p>
      <button class="btn btn--primary" type="button" onclick={() => dialog?.open()}>
        <Icon name="plus" />{t('recurring.emptyAction')}
      </button>
    </div>
  {:else}
    <ul class="summary">
      <li class="card summary__card">
        <span class="summary__label">{t('recurring.incomeMonthly')}</span>
        <span class="summary__value num summary__value--income">{money(summary.incomeMonthlyCents)}</span>
      </li>
      <li class="card summary__card">
        <span class="summary__label">{t('recurring.expenseMonthly')}</span>
        <span class="summary__value num">{money(summary.expenseMonthlyCents)}</span>
      </li>
      <li class="card summary__card">
        <span class="summary__label">{t('recurring.expenseYearly')}</span>
        <span class="summary__value num">{money(summary.expenseYearlyCents)}</span>
      </li>
    </ul>

    <div class="card list">
      <header class="list__head">
        <h2 id="recurring-title" class="list__title">{t('recurring.tableLabel')}</h2>
        <button
          class="btn btn--primary"
          type="button"
          disabled={atLimit}
          aria-describedby={atLimit ? 'recurring-limit' : undefined}
          onclick={() => dialog?.open()}
        >
          <Icon name="plus" />{t('recurring.new')}
        </button>
      </header>
      {#if atLimit}
        <p class="field__hint" id="recurring-limit">{t('recurring.errorLimit')}</p>
      {/if}
      <!-- Scrollable on phones, so it takes keyboard focus (arrow keys scroll it). -->
      <div class="table" role="region" aria-labelledby="recurring-title" tabindex="0">
        <table>
          <thead>
            <tr>
              <th scope="col">{t('recurring.colName')}</th>
              <th scope="col" class="end">{t('recurring.colAmount')}</th>
              <th scope="col">{t('recurring.colFrequency')}</th>
              <th scope="col">{t('recurring.colNext')}</th>
              <th scope="col">{t('recurring.colMode')}</th>
              <th scope="col"><span class="visually-hidden">{t('recurring.colEdit')}</span></th>
            </tr>
          </thead>
          <tbody>
            {#each data.items as item (item.id)}
              {@const done = ended(item)}
              <tr class={[done && 'is-ended']} data-recurring={item.id}>
                <th scope="row">
                  <span class="name">
                    <span class="cat-tile cat-tile--sm" data-color={colorOf(item)} aria-hidden="true">
                      <Icon name={iconOf(item)} />
                    </span>
                    <span class="name__text">
                      <span class="name__main">{nameOf(item)}</span>
                      <span class="name__meta">{metaOf(item)}</span>
                    </span>
                  </span>
                </th>
                <td class={['num end', item.type === 'income' && 'income']}>{signed(item)}</td>
                <td>{frequencyLabel(item, locale, t)}</td>
                <td>{done ? '—' : shortDate(item.nextDate, locale)}</td>
                <td>
                  {#if done}
                    <span class="badge">{t('recurring.ended')}</span>
                  {:else if item.mode === 'auto'}
                    <span class="badge badge--accent"><Icon name="repeat" />{t('recurring.auto')}</span>
                  {:else}
                    <span class="badge"><Icon name="clock" />{t('recurring.asks')}</span>
                  {/if}
                </td>
                <td class="end">
                  <button
                    class="icon-btn"
                    type="button"
                    aria-label={t('recurring.edit', { name: nameOf(item) })}
                    onclick={() => dialog?.open(item)}
                  >
                    <Icon name="pencil" />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<RecurringDialog
  bind:this={dialog}
  {locale}
  {currency}
  {today}
  {categories}
  {t}
  onsave={save}
  ondelete={remove}
/>

<style>
  .recurring {
    display: grid;
    /* minmax(0, …): the wide table scrolls inside its box instead of widening the page. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }

  .pending {
    display: grid;
    gap: var(--space-3);
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .pending__text {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    font-weight: 600;
  }

  .pending__text :global(svg) {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
  }

  .pending__list {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pending__row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    align-items: center;
    justify-content: space-between;
  }

  .pending__list .pending__row {
    padding-block-start: var(--space-2);
    border-block-start: 1px solid var(--line);
  }

  .pending__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .summary__card {
    display: grid;
    gap: var(--space-1);
    align-content: start;
  }

  .summary__label {
    color: var(--ink-2);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .summary__value {
    font-family: var(--font-display);
    font-size: 1.375rem;
  }

  .summary__value--income {
    color: var(--positive);
  }

  @media (max-width: 47.99rem) {
    .summary {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-2);
    }

    .summary__card {
      grid-template-columns: 1fr auto;
      align-items: baseline;
    }

    .summary__value {
      font-size: 1.125rem;
    }
  }

  .list {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
  }

  .list__head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
    justify-content: space-between;
  }

  .list__title {
    font-size: 1.125rem;
  }

  /* Phones: the title wraps above the button, which then fills the row instead of leaving a gap. */
  @media (max-width: 47.99rem) {
    .list__head .btn {
      flex: 1;
    }
  }

  /* position: relative keeps the visually hidden header text inside the scroll box (no page overflow). */
  .table {
    position: relative;
    overflow-x: auto;
    border-radius: var(--radius-s);
  }

  .table:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  table {
    width: 100%;
    min-width: 44rem;
    border-collapse: collapse;
    font-size: 0.9375rem;
  }

  th,
  td {
    padding: var(--space-2);
    border-block-end: 1px solid var(--line);
    text-align: start;
    vertical-align: middle;
    white-space: nowrap;
  }

  thead th {
    color: var(--ink-2);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  tbody tr:last-child > * {
    border-block-end: 0;
  }

  tbody th {
    font-weight: 400;
  }

  .end {
    text-align: end;
  }

  /* The edit column only needs its button; the spare width goes to the other columns. */
  th:last-child,
  td:last-child {
    width: 1%;
  }

  .income {
    color: var(--positive);
  }

  .is-ended > :not(:last-child) {
    color: var(--ink-2);
  }

  .name {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }

  .name__text {
    display: grid;
    min-width: 0;
  }

  .name__main {
    max-width: 16rem;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
  }

  .name__meta {
    color: var(--ink-2);
    font-size: 0.8125rem;
  }

  .state {
    display: grid;
    gap: var(--space-3);
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
    max-width: 40ch;
    color: var(--ink-2);
  }
</style>
