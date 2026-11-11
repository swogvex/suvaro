<!--
  Contribute dialog: amount + date (today by default) for one goal, and its recent contributions with
  edit and delete. Call `open(goal)` (bind:this). The goal shown follows `goals` (it updates live).
  Props:
    goals       Every goal (to read the open one's contributions as they change).
    onadd(goal, amountCents, date)  New contribution.
    onedit(before, after)           Edited contribution.
    ondelete(goal, contribution)    Deleted contribution.
    locale, currency, today, t
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import { isIsoDate } from '../../lib/dates';
  import { centsToInput, currencySymbol, formatMoney, parseAmount } from '../../lib/money';
  import { longDate } from '../../lib/movements/format';
  import type { Contribution, Goal } from '../../lib/plan/model';
  import Dialog from '../ui/Dialog.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    goals: readonly Goal[];
    locale: Locale;
    currency: string;
    today: string;
    t: Translate;
    onadd: (goal: Goal, amountCents: number, date: string) => void;
    onedit: (before: Contribution, after: Contribution) => void;
    ondelete: (goal: Goal, contribution: Contribution) => void;
  }

  let { goals, locale, currency, today, t, onadd, onedit, ondelete }: Props = $props();

  type Field = 'amount' | 'date';

  let dialog: HTMLDialogElement | undefined = $state();
  let goalId = $state<string | null>(null);
  let editing = $state<Contribution | null>(null);
  let amountText = $state('');
  let date = $state('');
  let errors = $state<Partial<Record<Field, string>>>({});

  const goal = $derived(goals.find((g) => g.id === goalId) ?? null);
  const symbol = $derived(currencySymbol(locale, currency));
  const money = (cents: number) => formatMoney(cents, locale, { currency });

  export async function open(target: Goal) {
    goalId = target.id;
    reset();
    dialog?.showModal();
    await tick();
    focusAmount();
  }

  function reset() {
    editing = null;
    amountText = '';
    date = today;
    errors = {};
  }

  function focusAmount() {
    dialog?.querySelector<HTMLInputElement>('#contribution-amount')?.focus();
  }

  async function startEdit(contribution: Contribution) {
    editing = contribution;
    amountText = centsToInput(contribution.amountCents, locale);
    date = contribution.date;
    errors = {};
    await tick();
    focusAmount();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!goal) return;
    const cents = parseAmount(amountText, locale);
    const next: Partial<Record<Field, string>> = {};
    if (cents === null || cents <= 0)
      next.amount = t('plan.errorAmount', { example: centsToInput(5000, locale) });
    if (!isIsoDate(date)) next.date = t('plan.errorDate');
    errors = next;
    if (cents === null || Object.keys(next).length > 0) {
      await tick();
      dialog?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    if (editing) {
      onedit(editing, { ...editing, amountCents: cents, date });
      reset();
      focusAmount();
      return;
    }
    dialog?.close();
    onadd(goal, cents, date);
  }

  function remove(contribution: Contribution) {
    if (!goal) return;
    if (editing?.id === contribution.id) reset();
    ondelete(goal, contribution);
  }
</script>

<Dialog
  id="contribute-dialog"
  title={goal ? t('plan.contributeTitle', { name: goal.name }) : ''}
  closeLabel={t('plan.close')}
  bind:dialog
  onsubmit={submit}
  onclose={() => (editing = null)}
>
  {#snippet body()}
    {#if editing}
      <p class="editing"><Icon name="pencil" />{t('plan.contributionEdit')}</p>
    {/if}
    <div class="row">
      <div class="field">
        <label class="field__label" for="contribution-amount">{t('plan.amount')}</label>
        <div class="money-input">
          <input
            id="contribution-amount"
            class="field__input num"
            bind:value={amountText}
            inputmode="decimal"
            autocomplete="off"
            placeholder={centsToInput(0, locale)}
            aria-invalid={errors.amount ? 'true' : undefined}
            aria-describedby={errors.amount ? 'contribution-amount-error' : 'contribution-hint'}
          />
          <span class="money-input__symbol" aria-hidden="true">{symbol}</span>
        </div>
        {#if errors.amount}
          <p class="field__error" id="contribution-amount-error"><Icon name="alert" />{errors.amount}</p>
        {/if}
      </div>
      <div class="field">
        <label class="field__label" for="contribution-date">{t('plan.date')}</label>
        <input
          id="contribution-date"
          class="field__input"
          type="date"
          bind:value={date}
          aria-invalid={errors.date ? 'true' : undefined}
          aria-describedby={errors.date ? 'contribution-date-error' : undefined}
        />
        {#if errors.date}
          <p class="field__error" id="contribution-date-error"><Icon name="alert" />{errors.date}</p>
        {/if}
      </div>
    </div>
    <p class="field__hint" id="contribution-hint">{t('plan.setAsideHint')}</p>

    <section class="recent" aria-labelledby="contribution-recent">
      <h3 id="contribution-recent" class="field__label">{t('plan.recent')}</h3>
      {#if goal && goal.contributions.length > 0}
        <ul class="recent__list">
          {#each goal.contributions as contribution (contribution.id)}
            {@const vars = {
              amount: money(contribution.amountCents),
              date: longDate(contribution.date, locale),
            }}
            <li class="recent__item" data-editing={editing?.id === contribution.id ? 'true' : undefined}>
              <span class="recent__date">{vars.date}</span>
              <span class="num recent__amount">{vars.amount}</span>
              <button
                class="icon-btn"
                type="button"
                aria-label={t('plan.editContribution', vars)}
                onclick={() => startEdit(contribution)}
              >
                <Icon name="pencil" />
              </button>
              <button
                class="icon-btn"
                type="button"
                aria-label={t('plan.deleteContribution', vars)}
                onclick={() => remove(contribution)}
              >
                <Icon name="trash" />
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="recent__empty">{t('plan.recentEmpty')}</p>
      {/if}
    </section>
  {/snippet}

  {#snippet footer()}
    {#if editing}
      <button class="btn btn--ghost" type="button" onclick={reset}>{t('plan.cancelEdit')}</button>
    {/if}
    <button class="btn btn--primary" type="submit">
      {editing ? t('plan.save') : t('plan.contribute')}
    </button>
  {/snippet}
</Dialog>

<style>
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 12rem);
    gap: var(--space-4);
    align-items: start;
  }

  .editing {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    font-weight: 600;
  }

  .editing :global(svg) {
    width: 1rem;
    height: 1rem;
    color: var(--accent);
  }

  .money-input {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  /* Same height as the date input next to it. */
  .money-input input {
    flex: 1;
    min-width: 0;
  }

  .money-input__symbol {
    flex: none;
    color: var(--ink-2);
  }

  .recent {
    display: grid;
    gap: var(--space-2);
    padding-block-start: var(--space-4);
    border-block-start: 1px solid var(--line);
  }

  .recent__list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .recent__item {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding-block: var(--space-1);
    border-radius: var(--radius-s);
  }

  .recent__item + .recent__item {
    border-block-start: 1px solid var(--line);
  }

  .recent__item[data-editing='true'] {
    background: var(--surface-2);
  }

  .recent__date {
    flex: 1;
    min-width: 0;
    padding-inline-start: var(--space-2);
    color: var(--ink-2);
  }

  .recent__amount {
    padding-inline-end: var(--space-2);
  }

  .recent__empty {
    color: var(--ink-2);
  }

  @media (max-width: 30rem) {
    .row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
