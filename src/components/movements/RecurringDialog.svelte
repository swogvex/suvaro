<!--
  New / edit recurring movement: type, amount, category (expenses), name, how often, first and end date,
  and what happens on the day (add it automatically or ask first).
  Call `open(item?)` (bind:this) to show it; `onsave` gets the fields, `ondelete` the item being edited.
  Props: locale, currency, today, categories, t, onsave, ondelete.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { Locale, UiKey } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import { isIsoDate } from '../../lib/dates';
  import { centsToInput, currencySymbol, parseAmount } from '../../lib/money';
  import { NOTE_MAX, type CategoryOption, type MovementType } from '../../lib/movements/model';
  import {
    frequencies,
    type Recurring,
    type RecurringFields,
    type RecurringMode,
  } from '../../lib/recurring/model';
  import { MAX_INTERVAL_DAYS, MIN_INTERVAL_DAYS, type Frequency } from '../../lib/recurring/schedule';
  import Dialog from '../ui/Dialog.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    locale: Locale;
    currency: string;
    today: string;
    categories: CategoryOption[];
    t: Translate;
    onsave: (fields: RecurringFields, editing: Recurring | null) => void;
    ondelete: (item: Recurring) => void;
  }

  let { locale, currency, today, categories, t, onsave, ondelete }: Props = $props();

  type Field = 'amount' | 'category' | 'interval' | 'start' | 'end';

  let dialog: HTMLDialogElement | undefined = $state();
  let editing = $state<Recurring | null>(null);
  let type = $state<MovementType>('expense');
  let amountText = $state('');
  let categoryId = $state('');
  let note = $state('');
  let frequency = $state<Frequency>('monthly');
  let intervalText = $state('');
  let anchorDate = $state('');
  let endDate = $state('');
  let mode = $state<RecurringMode>('auto');
  let errors = $state<Partial<Record<Field, string>>>({});

  const symbol = $derived(currencySymbol(locale, currency));

  export async function open(item: Recurring | null = null) {
    editing = item;
    errors = {};
    type = item?.type ?? 'expense';
    amountText = item ? centsToInput(item.amountCents, locale) : '';
    categoryId = item?.categoryId ?? '';
    note = item?.note ?? '';
    frequency = item?.frequency ?? 'monthly';
    intervalText = item?.intervalDays ? String(item.intervalDays) : '';
    anchorDate = item?.anchorDate ?? today;
    endDate = item?.endDate ?? '';
    mode = item?.mode ?? 'auto';
    dialog?.showModal();
    await tick();
    dialog?.querySelector<HTMLInputElement>('#recurring-amount')?.focus();
  }

  function message(field: Field): string | undefined {
    return errors[field];
  }

  function describedBy(field: Field, hint?: string): string | undefined {
    const ids = [errors[field] ? `recurring-${field}-error` : '', hint ?? ''].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : undefined;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const cents = parseAmount(amountText, locale);
    const interval = Number(intervalText);
    const next: Partial<Record<Field, string>> = {};
    if (cents === null || cents <= 0)
      next.amount = t('recurring.errorAmount', { example: centsToInput(2999, locale) });
    if (type === 'expense' && !categoryId) next.category = t('recurring.errorCategory');
    if (
      frequency === 'every_n_days' &&
      (!Number.isInteger(interval) || interval < MIN_INTERVAL_DAYS || interval > MAX_INTERVAL_DAYS)
    ) {
      next.interval = t('recurring.errorInterval');
    }
    if (!isIsoDate(anchorDate)) next.start = t('recurring.errorDate');
    if (endDate && !isIsoDate(endDate)) next.end = t('recurring.errorDate');
    else if (endDate && isIsoDate(anchorDate) && endDate < anchorDate) next.end = t('recurring.errorEnd');
    errors = next;
    if (cents === null || Object.keys(next).length > 0) {
      await tick();
      dialog?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const before = editing;
    dialog?.close();
    onsave(
      {
        type,
        amountCents: cents,
        categoryId: type === 'expense' ? categoryId : null,
        note: note.trim().slice(0, NOTE_MAX),
        frequency,
        intervalDays: frequency === 'every_n_days' ? interval : null,
        anchorDate,
        endDate: endDate || null,
        mode,
      },
      before,
    );
  }

  function remove() {
    const item = editing;
    if (!item) return;
    dialog?.close();
    ondelete(item);
  }
</script>

<Dialog
  id="recurring-dialog"
  title={editing ? t('recurring.editTitle') : t('recurring.newTitle')}
  closeLabel={t('recurring.close')}
  bind:dialog
  onsubmit={submit}
>
  {#snippet body()}
    <fieldset class="group">
      <legend class="visually-hidden">{t('editor.type')}</legend>
      <div class="segmented segmented--fill">
        {#each [['expense', 'editor.expense'], ['income', 'editor.income']] as const as [value, label] (value)}
          <label class="segmented__item">
            <input
              type="radio"
              name="recurring-type"
              {value}
              checked={type === value}
              onchange={() => (type = value)}
            />
            {t(label)}
          </label>
        {/each}
      </div>
    </fieldset>

    <div class="field">
      <label class="field__label" for="recurring-amount">{t('editor.amount')}</label>
      <div class="money-input">
        <input
          id="recurring-amount"
          class="field__input num"
          bind:value={amountText}
          inputmode="decimal"
          autocomplete="off"
          placeholder={centsToInput(0, locale)}
          aria-invalid={errors.amount ? 'true' : undefined}
          aria-describedby={describedBy('amount')}
        />
        <span class="money-input__symbol" aria-hidden="true">{symbol}</span>
      </div>
      {#if message('amount')}
        <p class="field__error" id="recurring-amount-error"><Icon name="alert" />{message('amount')}</p>
      {/if}
    </div>

    {#if type === 'expense'}
      <div class="field">
        <label class="field__label" for="recurring-category">{t('editor.category')}</label>
        <select
          id="recurring-category"
          class="field__input"
          bind:value={categoryId}
          aria-invalid={errors.category ? 'true' : undefined}
          aria-describedby={describedBy('category')}
        >
          <option value="" disabled>{t('recurring.categoryPick')}</option>
          {#each categories as option (option.id)}
            <option value={option.id}>{option.name}</option>
          {/each}
        </select>
        {#if message('category')}
          <p class="field__error" id="recurring-category-error">
            <Icon name="alert" />{message('category')}
          </p>
        {/if}
      </div>
    {/if}

    <div class="field">
      <label class="field__label" for="recurring-note">{t('recurring.name')}</label>
      <input
        id="recurring-note"
        class="field__input"
        bind:value={note}
        maxlength={NOTE_MAX}
        autocomplete="off"
        placeholder={t('recurring.namePlaceholder')}
      />
    </div>

    <div class="row">
      <div class="field">
        <label class="field__label" for="recurring-frequency">{t('recurring.frequency')}</label>
        <select id="recurring-frequency" class="field__input" bind:value={frequency}>
          {#each frequencies as option (option)}
            <option value={option}>{t(`recurring.freq.${option}` as UiKey)}</option>
          {/each}
        </select>
      </div>
      {#if frequency === 'every_n_days'}
        <div class="field">
          <label class="field__label" for="recurring-interval">{t('recurring.interval')}</label>
          <input
            id="recurring-interval"
            class="field__input num"
            bind:value={intervalText}
            inputmode="numeric"
            autocomplete="off"
            placeholder="10"
            aria-invalid={errors.interval ? 'true' : undefined}
            aria-describedby={describedBy('interval')}
          />
          {#if message('interval')}
            <p class="field__error" id="recurring-interval-error">
              <Icon name="alert" />{message('interval')}
            </p>
          {/if}
        </div>
      {/if}
    </div>

    <div class="row">
      <div class="field">
        <label class="field__label" for="recurring-start">{t('recurring.start')}</label>
        <input
          id="recurring-start"
          class="field__input date-input"
          type="date"
          bind:value={anchorDate}
          aria-invalid={errors.start ? 'true' : undefined}
          aria-describedby={describedBy(
            'start',
            frequency === 'monthly' ? 'recurring-start-hint' : undefined,
          )}
        />
        {#if message('start')}
          <p class="field__error" id="recurring-start-error"><Icon name="alert" />{message('start')}</p>
        {/if}
      </div>
      <div class="field">
        <label class="field__label" for="recurring-end">{t('recurring.end')}</label>
        <input
          id="recurring-end"
          class="field__input date-input"
          type="date"
          min={anchorDate || undefined}
          bind:value={endDate}
          aria-invalid={errors.end ? 'true' : undefined}
          aria-describedby={describedBy('end', 'recurring-end-hint')}
        />
        {#if message('end')}
          <p class="field__error" id="recurring-end-error"><Icon name="alert" />{message('end')}</p>
        {/if}
      </div>
    </div>
    <div class="hints">
      {#if frequency === 'monthly'}
        <p class="field__hint" id="recurring-start-hint">{t('recurring.startHint')}</p>
      {/if}
      <p class="field__hint" id="recurring-end-hint">{t('recurring.endHint')}</p>
    </div>

    <fieldset class="group">
      <legend class="field__label">{t('recurring.mode')}</legend>
      <div class="segmented segmented--fill">
        {#each [['auto', 'recurring.modeAuto'], ['confirm', 'recurring.modeConfirm']] as const as [value, label] (value)}
          <label class="segmented__item">
            <input
              type="radio"
              name="recurring-mode"
              {value}
              checked={mode === value}
              onchange={() => (mode = value)}
            />
            {t(label)}
          </label>
        {/each}
      </div>
    </fieldset>
  {/snippet}

  {#snippet footer()}
    {#if editing}
      <button class="btn btn--danger" type="button" onclick={remove}>
        <Icon name="trash" />{t('recurring.delete')}
      </button>
    {/if}
    <button class="btn btn--primary" type="submit">{t('recurring.save')}</button>
  {/snippet}
</Dialog>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .group {
    display: grid;
    gap: var(--space-2);
  }

  .segmented--fill {
    display: flex;
  }

  .segmented--fill .segmented__item {
    flex: 1;
    justify-content: center;
  }

  .money-input {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .money-input input {
    flex: 1;
    min-width: 0;
    font-size: 1.25rem;
  }

  .money-input__symbol {
    flex: none;
    color: var(--ink-2);
    font-size: 1.25rem;
  }

  /* Two fields side by side (frequency + interval, start + end); stacked on narrow phones. */
  .row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: var(--space-4);
  }

  .hints {
    display: grid;
    gap: var(--space-1);
    margin-block-start: calc(-1 * var(--space-2));
  }
</style>
