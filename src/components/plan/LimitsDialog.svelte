<!--
  "Edit limits": an optional limit for all expenses and one box per category (empty = no budget).
  Call `open(budgets)` (bind:this); `onsave` gets the request body.
  Props: categories, locale, currency, t, onsave.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import type { IconName } from '../../lib/icons';
  import { centsToInput, currencySymbol, parseAmount } from '../../lib/money';
  import type { CategoryOption } from '../../lib/movements/model';
  import type { BudgetsBody } from '../../lib/plan/client';
  import type { BudgetLimitRow } from '../../lib/plan/model';
  import Dialog from '../ui/Dialog.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    categories: readonly CategoryOption[];
    locale: Locale;
    currency: string;
    t: Translate;
    onsave: (body: BudgetsBody) => void;
  }

  let { categories, locale, currency, t, onsave }: Props = $props();

  const GLOBAL = 'global';

  let dialog: HTMLDialogElement | undefined = $state();
  let values = $state<Record<string, string>>({});
  let invalid = $state<string[]>([]);

  const symbol = $derived(currencySymbol(locale, currency));
  const example = $derived(centsToInput(20000, locale));

  export async function open(budgets: readonly BudgetLimitRow[]) {
    const next: Record<string, string> = {};
    for (const row of budgets) next[row.categoryId ?? GLOBAL] = centsToInput(row.limitCents, locale);
    values = next;
    invalid = [];
    dialog?.showModal();
    await tick();
    dialog?.querySelector<HTMLInputElement>('#limit-global')?.focus();
  }

  /** null = empty box (no budget); NaN = not a valid amount. */
  function read(key: string): number | null {
    const text = (values[key] ?? '').trim();
    if (!text) return null;
    const cents = parseAmount(text, locale);
    return cents !== null && cents > 0 ? cents : Number.NaN;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const keys = [GLOBAL, ...categories.map((c) => c.id)];
    invalid = keys.filter((key) => Number.isNaN(read(key)));
    if (invalid.length > 0) {
      await tick();
      dialog?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const body: BudgetsBody = {
      globalCents: read(GLOBAL),
      categories: categories.flatMap((c) => {
        const limitCents = read(c.id);
        return limitCents === null ? [] : [{ categoryId: c.id, limitCents }];
      }),
    };
    dialog?.close();
    onsave(body);
  }
</script>

<Dialog
  id="limits-dialog"
  title={t('plan.limitsTitle')}
  closeLabel={t('plan.close')}
  bind:dialog
  onsubmit={submit}
>
  {#snippet body()}
    <div class="field">
      <label class="field__label" for="limit-global">{t('plan.limitsGlobal')}</label>
      <div class="money-input">
        <input
          id="limit-global"
          class="field__input num"
          bind:value={values[GLOBAL]}
          inputmode="decimal"
          autocomplete="off"
          aria-invalid={invalid.includes(GLOBAL) ? 'true' : undefined}
          aria-describedby={invalid.includes(GLOBAL) ? 'limit-global-error' : 'limit-global-hint'}
        />
        <span class="money-input__symbol" aria-hidden="true">{symbol}</span>
      </div>
      <p class="field__hint" id="limit-global-hint">{t('plan.limitsGlobalHint')}</p>
      {#if invalid.includes(GLOBAL)}
        <p class="field__error" id="limit-global-error">
          <Icon name="alert" />{t('plan.errorAmount', { example })}
        </p>
      {/if}
    </div>

    <fieldset class="group" aria-describedby="limits-hint">
      <legend class="field__label">{t('plan.limitsCategories')}</legend>
      <p class="field__hint" id="limits-hint">{t('plan.limitsHint')}</p>
      <ul class="limits">
        {#each categories as category (category.id)}
          {@const bad = invalid.includes(category.id)}
          <li class="limits__row">
            <span class="cat-tile cat-tile--sm" data-color={category.color} aria-hidden="true">
              <Icon name={category.icon as IconName} />
            </span>
            <label class="limits__name" for="limit-{category.id}">{category.name}</label>
            <div class="money-input limits__input">
              <input
                id="limit-{category.id}"
                class="field__input num"
                bind:value={values[category.id]}
                inputmode="decimal"
                autocomplete="off"
                aria-label={t('plan.limitFor', { category: category.name })}
                aria-invalid={bad ? 'true' : undefined}
                aria-describedby={bad ? `limit-${category.id}-error` : undefined}
              />
              <span class="money-input__symbol" aria-hidden="true">{symbol}</span>
            </div>
            {#if bad}
              <p class="field__error limits__error" id="limit-{category.id}-error">
                <Icon name="alert" />{t('plan.errorAmount', { example })}
              </p>
            {/if}
          </li>
        {/each}
      </ul>
    </fieldset>
  {/snippet}

  {#snippet footer()}
    <button class="btn btn--primary btn--lg save" type="submit">{t('plan.save')}</button>
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

  .money-input {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .money-input input {
    flex: 1;
    min-width: 0;
  }

  .money-input__symbol {
    flex: none;
    color: var(--ink-2);
  }

  .limits {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .limits__row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 10rem);
    gap: var(--space-2) var(--space-3);
    align-items: center;
    padding-block: var(--space-2);
  }

  .limits__row + .limits__row {
    border-block-start: 1px solid var(--line);
  }

  .limits__name {
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .limits__error {
    grid-column: 2 / -1;
  }

  .save {
    min-width: 8rem;
  }

  @media (max-width: 47.99rem) {
    .save {
      flex: 1;
    }
  }
</style>
