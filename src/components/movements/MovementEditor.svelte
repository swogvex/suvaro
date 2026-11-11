<!--
  New / edit movement (island, once per app page). A native modal <dialog>: centered 560 px on desktop,
  a full-screen sheet from the right on phones. Opened with `openEditor()` (dock "+", header "New", `N`,
  a list row, search). Enter saves, Esc closes, focus returns to what opened it. Saving is optimistic with
  Undo (see `src/lib/movements/client.ts`).
  Props:
    categories  The user's categories (most used first in the chips).
    locale, currency, today  From the profile.
    messages    Translated `editor.*` / `movements.*` strings.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Locale } from '../../i18n';
  import { translator, type Messages } from '../../i18n/client';
  import type { IconName } from '../../lib/icons';
  import { addDays, isIsoDate } from '../../lib/dates';
  import { ulid } from '../../lib/id';
  import {
    createMovement,
    deleteMovement,
    EDITOR_EVENT,
    listenFor,
    updateMovement,
    type ApiError,
    type EditorRequest,
    type WriteMessages,
  } from '../../lib/movements/client';
  import { movementAmount, movementName } from '../../lib/movements/format';
  import { NOTE_MAX, type CategoryOption, type Movement, type MovementType } from '../../lib/movements/model';
  import { inCycle } from '../../lib/cycle';
  import { centsToInput, currencySymbol, parseAmount } from '../../lib/money';
  import { budgetAfterSave } from '../../lib/plan/calc';
  import { fetchBudgetStatus } from '../../lib/plan/client';
  import type { BudgetStatus } from '../../lib/plan/model';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    categories: CategoryOption[];
    locale: Locale;
    currency: string;
    today: string;
    messages: Messages;
  }

  let { categories, locale, currency, today, messages }: Props = $props();

  const t = $derived(translator(messages));
  const TOP_CATEGORIES = 8;
  type DateChoice = 'today' | 'yesterday' | 'pick';
  type Field = 'amount' | 'category' | 'date';

  let dialog: HTMLDialogElement | undefined = $state();
  let amountInput: HTMLInputElement | undefined = $state();
  let editing = $state<Movement | null>(null);
  let type = $state<MovementType>('expense');
  let amountText = $state('');
  let categoryId = $state<string | null>(null);
  let dateChoice = $state<DateChoice>('today');
  let pickedDate = $state('');
  let note = $state('');
  let repeat = $state(false);
  let showAll = $state(false);
  let errors = $state<Partial<Record<Field, string>>>({});
  let online = $state(true);
  let ready = $state(false);
  /** Category limits and this cycle's spending, read each time the editor opens (for the notice). */
  let budgets = $state<BudgetStatus | null>(null);

  const yesterday = $derived(addDays(today, -1));
  const symbol = $derived(currencySymbol(locale, currency));
  const example = $derived(centsToInput(1250, locale));
  const date = $derived(dateChoice === 'today' ? today : dateChoice === 'yesterday' ? yesterday : pickedDate);
  const byUse = $derived(
    [...categories].sort((a, b) => b.uses - a.uses || categories.indexOf(a) - categories.indexOf(b)),
  );
  const top = $derived(byUse.slice(0, TOP_CATEGORIES));
  const hiddenSelected = $derived(categoryId !== null && !top.some((c) => c.id === categoryId));
  const visibleCategories = $derived(showAll || hiddenSelected ? categories : top);
  const repeatDay = $derived(isIsoDate(date) ? Number(date.slice(8, 10)) : 1);

  /** "Leisure would reach 115 % of its budget": shown before saving an expense that takes it ≥ 80 %. */
  const budgetNotice = $derived.by(() => {
    if (!budgets || type !== 'expense' || !categoryId || !isIsoDate(date) || !inCycle(date, budgets.cycle))
      return null;
    const limit = budgets.limits.find((l) => l.categoryId === categoryId);
    const cents = parseAmount(amountText, locale);
    if (!limit || cents === null || cents <= 0) return null;
    const counted =
      editing?.type === 'expense' && editing.categoryId === categoryId && inCycle(editing.date, budgets.cycle)
        ? editing.amountCents
        : 0;
    const pct = budgetAfterSave(limit.limitCents, budgets.spent[categoryId] ?? 0, cents, counted);
    if (pct === null) return null;
    const category = categoryOf(categoryId)?.name ?? '';
    return pct >= 100
      ? t('editor.budgetNoticeOver', { category, pct })
      : t('editor.budgetNotice', { category, pct });
  });

  onMount(() => {
    online = navigator.onLine;
    const sync = () => (online = navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    const stop = listenFor(EDITOR_EVENT, (request) => void open(request));
    ready = true;
    return () => {
      stop();
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  });

  async function open(request: EditorRequest) {
    const movement = request.movement ?? null;
    budgets = null;
    fetchBudgetStatus().then(
      (status) => (budgets = status),
      () => undefined,
    );
    editing = movement;
    errors = {};
    showAll = false;
    repeat = false;
    if (movement) {
      type = movement.type;
      amountText = centsToInput(movement.amountCents, locale);
      categoryId = movement.categoryId;
      note = movement.note;
      setDate(movement.date);
    } else {
      type = request.type ?? 'expense';
      amountText = '';
      categoryId = null;
      note = '';
      setDate(request.date ?? today);
    }
    if (!dialog?.open) dialog?.showModal();
    await tick();
    amountInput?.focus();
  }

  function setDate(value: string) {
    pickedDate = value;
    dateChoice = value === today ? 'today' : value === yesterday ? 'yesterday' : 'pick';
  }

  function close() {
    dialog?.close();
  }

  function categoryOf(id: string | null) {
    return categories.find((c) => c.id === id);
  }

  function failed(error: ApiError): string {
    if (error.code === 'LIMIT_REACHED') return t('movements.errorLimit');
    if (error.code === 'NETWORK' && !navigator.onLine) return t('movements.errorOffline');
    return t('movements.errorSave');
  }

  function savedMessage(movement: Movement): string {
    const amount = movementAmount(movement, locale, currency);
    if (editing) return t('movements.updated');
    if (movement.type === 'income') return t('movements.savedIncome', { amount });
    return t('movements.saved', { amount, category: categoryOf(movement.categoryId)?.name ?? '' });
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const cents = parseAmount(amountText, locale);
    const next: Partial<Record<Field, string>> = {};
    if (cents === null || cents <= 0) next.amount = t('editor.errorAmount', { example });
    if (type === 'expense' && !categoryOf(categoryId)) next.category = t('editor.errorCategory');
    if (!isIsoDate(date)) next.date = t('editor.errorDate');
    errors = next;
    if (cents === null || Object.keys(next).length > 0) {
      await tick();
      dialog?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid] input')?.focus();
      return;
    }

    const movement: Movement = {
      id: editing?.id ?? ulid(),
      type,
      amountCents: cents,
      categoryId: type === 'expense' ? categoryId : null,
      date,
      note: note.trim().slice(0, NOTE_MAX),
      recurring: editing?.recurring ?? repeat,
    };
    const messagesFor: WriteMessages = { done: savedMessage(movement), failed };
    const before = editing;
    close();
    if (before) void updateMovement(before, movement, messagesFor);
    else void createMovement(movement, repeat, messagesFor);
  }

  function remove() {
    const movement = editing;
    if (!movement) return;
    close();
    const name = movementName(movement, categoryOf(movement.categoryId), t);
    deleteMovement(movement, {
      done: t('movements.deleted', { name, amount: movementAmount(movement, locale, currency) }),
      failed,
    });
  }

  function chooseType(value: MovementType) {
    type = value;
    errors = { ...errors, category: undefined };
  }
</script>

<dialog class="editor" bind:this={dialog} aria-labelledby="editor-title" onclose={() => (editing = null)}>
  {#if ready}
    <form class="editor__form" novalidate onsubmit={save}>
      <header class="editor__head">
        <h2 id="editor-title" class="editor__title">
          {editing ? t('editor.titleEdit') : t('editor.titleNew')}
        </h2>
        <button class="icon-btn" type="button" aria-label={t('editor.close')} onclick={close}>
          <Icon name="x" />
        </button>
      </header>

      <div class="editor__body">
        <fieldset class="editor__type">
          <legend class="visually-hidden">{t('editor.type')}</legend>
          <div class="segmented">
            {#each [['expense', 'editor.expense'], ['income', 'editor.income']] as const as [value, label] (value)}
              <label class="segmented__item">
                <input
                  type="radio"
                  name="editor-type"
                  {value}
                  checked={type === value}
                  onchange={() => chooseType(value)}
                />
                {t(label)}
              </label>
            {/each}
          </div>
        </fieldset>

        <div class="field">
          <label class="field__label" for="editor-amount">{t('editor.amount')}</label>
          <div class={['amount', type === 'income' && 'amount--income']}>
            <span class="amount__sign num" aria-hidden="true">{type === 'income' ? '+' : '−'}</span>
            <input
              id="editor-amount"
              class="amount__input num"
              bind:this={amountInput}
              bind:value={amountText}
              inputmode="decimal"
              autocomplete="off"
              enterkeyhint="done"
              placeholder={centsToInput(0, locale)}
              aria-invalid={errors.amount ? 'true' : undefined}
              aria-describedby={errors.amount ? 'editor-amount-error' : undefined}
            />
            <span class="amount__currency num" aria-hidden="true">{symbol}</span>
          </div>
          {#if errors.amount}
            <p class="field__error" id="editor-amount-error"><Icon name="alert" />{errors.amount}</p>
          {/if}
        </div>

        {#if type === 'expense'}
          <fieldset
            class="editor__group"
            data-invalid={errors.category ? 'true' : undefined}
            aria-describedby={errors.category ? 'editor-category-error' : undefined}
          >
            <legend class="field__label">{t('editor.category')}</legend>
            <div class="chips">
              {#each visibleCategories as category (category.id)}
                <label class="chip">
                  <input
                    type="radio"
                    name="editor-category"
                    value={category.id}
                    checked={categoryId === category.id}
                    onchange={() => {
                      categoryId = category.id;
                      errors = { ...errors, category: undefined };
                    }}
                  />
                  <span class="cat-tile" data-color={category.color} aria-hidden="true">
                    <Icon name={category.icon as IconName} />
                  </span>
                  {category.name}
                </label>
              {/each}
              {#if categories.length > TOP_CATEGORIES && !hiddenSelected}
                <button
                  class="chip chip--more"
                  type="button"
                  aria-expanded={showAll}
                  onclick={() => (showAll = !showAll)}
                >
                  {showAll ? t('editor.fewer') : t('editor.more')}
                </button>
              {/if}
            </div>
            {#if errors.category}
              <p class="field__error" id="editor-category-error"><Icon name="alert" />{errors.category}</p>
            {/if}
          </fieldset>
        {/if}

        <fieldset class="editor__group">
          <legend class="field__label">{t('editor.date')}</legend>
          <div class="chips">
            {#each [['today', 'editor.today'], ['yesterday', 'editor.yesterday'], ['pick', 'editor.pick']] as const as [value, label] (value)}
              <label class="chip">
                <input
                  type="radio"
                  name="editor-date"
                  {value}
                  checked={dateChoice === value}
                  onchange={() => (dateChoice = value)}
                />
                {t(label)}
              </label>
            {/each}
          </div>
          {#if dateChoice === 'pick'}
            <label class="visually-hidden" for="editor-date">{t('editor.pickLabel')}</label>
            <input
              id="editor-date"
              class="field__input editor__date"
              type="date"
              bind:value={pickedDate}
              aria-invalid={errors.date ? 'true' : undefined}
              aria-describedby={errors.date ? 'editor-date-error' : undefined}
            />
          {/if}
          {#if errors.date}
            <p class="field__error" id="editor-date-error"><Icon name="alert" />{errors.date}</p>
          {/if}
        </fieldset>

        <div class="field">
          <label class="field__label" for="editor-note">{t('editor.note')}</label>
          <input
            id="editor-note"
            class="field__input"
            bind:value={note}
            maxlength={NOTE_MAX}
            autocomplete="off"
            placeholder={t('editor.notePlaceholder')}
            aria-describedby="editor-note-count"
          />
          <p class="field__hint editor__count" id="editor-note-count">
            {t('editor.noteCount', { n: note.length, max: NOTE_MAX })}
          </p>
        </div>

        {#if !editing}
          <div class="editor__repeat">
            <input
              id="editor-repeat"
              class="switch"
              type="checkbox"
              role="switch"
              bind:checked={repeat}
              aria-describedby="editor-repeat-hint"
            />
            <div>
              <label for="editor-repeat">{t('editor.repeat')}</label>
              <p class="field__hint" id="editor-repeat-hint">{t('editor.repeatHint', { day: repeatDay })}</p>
            </div>
          </div>
        {:else if editing.recurring}
          <p class="field__hint editor__recurring"><Icon name="repeat" />{t('editor.recurringNote')}</p>
        {/if}

        {#if budgetNotice}
          <p class="editor__notice" role="status"><Icon name="alert" />{budgetNotice}</p>
        {/if}
      </div>

      <footer class="editor__foot">
        {#if editing}
          <button class="btn btn--danger" type="button" onclick={remove}>
            <Icon name="trash" />{t('editor.delete')}
          </button>
        {/if}
        <button class="btn btn--primary btn--lg editor__save" type="submit" disabled={!online}>
          {t('editor.save')}
        </button>
      </footer>
    </form>
  {/if}
</dialog>

<style>
  .editor {
    width: min(35rem, calc(100% - 2 * var(--space-4)));
    max-height: calc(100dvh - 2 * var(--space-6));
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-float);
  }

  .editor::backdrop {
    background: rgb(20 18 16 / 0.45);
  }

  .editor__form {
    display: grid;
    grid-template-rows: auto 1fr auto;
    max-height: inherit;
  }

  .editor__head,
  .editor__foot {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
  }

  .editor__head {
    border-bottom: 1px solid var(--line);
  }

  .editor__title {
    flex: 1;
    font-family: var(--font-display);
    font-size: 1.25rem;
    letter-spacing: var(--tracking-display);
  }

  .editor__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);
    overflow-y: auto;
    padding: var(--space-5);
    overscroll-behavior: contain;
  }

  .editor__foot {
    justify-content: flex-end;
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--line);
  }

  .editor__save {
    min-width: 8rem;
  }

  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .editor__type .segmented {
    display: flex;
  }

  .editor__type .segmented__item {
    flex: 1;
  }

  .editor__group {
    display: grid;
    gap: var(--space-2);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .chip--more {
    color: var(--ink-2);
  }

  .editor__date {
    max-width: 14rem;
  }

  .amount {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding-inline: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-s);
    background: var(--surface);
  }

  .amount:has(input:focus-visible) {
    border-color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .amount:has(input[aria-invalid='true']) {
    border-color: var(--negative);
  }

  .amount__sign,
  .amount__currency {
    flex: none;
    color: var(--ink-2);
    font-size: 1.75rem;
  }

  .amount--income .amount__sign {
    color: var(--positive);
  }

  .amount__input {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 4rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    font-size: 2.25rem;
    outline: none;
  }

  .amount__input::placeholder {
    color: var(--ink-3);
  }

  .editor__count {
    justify-self: end;
    font-variant-numeric: tabular-nums;
  }

  .editor__repeat {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }

  .editor__repeat label {
    font-weight: 600;
    cursor: pointer;
  }

  .editor__notice {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
    padding: var(--space-3);
    border: 1px solid var(--warning);
    border-radius: var(--radius-s);
    font-weight: 500;
  }

  .editor__notice :global(svg) {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--warning);
  }

  .editor__recurring {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .editor__recurring :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
  }

  /* Phones: a full-screen sheet that slides in from the right. */
  @media (max-width: 47.99rem) {
    .editor {
      width: 100%;
      max-width: none;
      height: 100dvh;
      max-height: none;
      margin: 0;
      border: 0;
      border-radius: 0;
    }

    .editor__form {
      height: 100%;
    }

    .editor__foot {
      padding-block-end: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
    }

    .editor__save {
      flex: 1;
    }

    @media (prefers-reduced-motion: no-preference) {
      .editor[open] {
        animation: sheet-in var(--dur) var(--ease);
      }
    }
  }

  @keyframes sheet-in {
    from {
      transform: translateX(100%);
    }
  }
</style>
