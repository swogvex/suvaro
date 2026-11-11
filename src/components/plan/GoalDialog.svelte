<!--
  New / edit goal dialog: name, icon, color, target, optional deadline and "Show on Home".
  Call `open(goal?)` (bind:this) to show it; `onsave` gets the fields, `ondelete` the goal being edited.
  Props: locale, currency, today, t, onsave, ondelete.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { Locale, UiKey } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import { isIsoDate } from '../../lib/dates';
  import { centsToInput, currencySymbol, parseAmount } from '../../lib/money';
  import type { GoalFields } from '../../lib/plan/client';
  import { GOAL_NAME_MAX, goalIcons, type ColorIndex, type Goal } from '../../lib/plan/model';
  import Dialog from '../ui/Dialog.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    locale: Locale;
    currency: string;
    today: string;
    t: Translate;
    onsave: (fields: GoalFields, editing: Goal | null) => void;
    ondelete: (goal: Goal) => void;
  }

  let { locale, currency, today, t, onsave, ondelete }: Props = $props();

  type Field = 'name' | 'target' | 'deadline';
  const COLORS: ColorIndex[] = [1, 2, 3, 4, 5, 6, 7, 8];

  let dialog: HTMLDialogElement | undefined = $state();
  let editing = $state<Goal | null>(null);
  let name = $state('');
  let icon = $state<string>('target');
  let color = $state<ColorIndex>(1);
  let targetText = $state('');
  let deadline = $state('');
  let pinned = $state(false);
  let errors = $state<Partial<Record<Field, string>>>({});

  const symbol = $derived(currencySymbol(locale, currency));

  export async function open(goal: Goal | null = null) {
    editing = goal;
    errors = {};
    name = goal?.name ?? '';
    icon = goal?.icon ?? 'target';
    color = goal?.color ?? 1;
    targetText = goal ? centsToInput(goal.targetCents, locale) : '';
    deadline = goal?.deadline ?? '';
    pinned = goal?.pinned ?? false;
    dialog?.showModal();
    await tick();
    dialog?.querySelector<HTMLInputElement>('#goal-name')?.focus();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const cents = parseAmount(targetText, locale);
    const next: Partial<Record<Field, string>> = {};
    if (!name.trim()) next.name = t('plan.errorName');
    if (cents === null || cents <= 0)
      next.target = t('plan.errorAmount', { example: centsToInput(50000, locale) });
    if (deadline && !isIsoDate(deadline)) next.deadline = t('plan.errorDate');
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
        name: name.trim().slice(0, GOAL_NAME_MAX),
        icon,
        color,
        targetCents: cents,
        deadline: deadline || null,
        pinned,
      },
      before,
    );
  }

  function remove() {
    const goal = editing;
    if (!goal) return;
    dialog?.close();
    ondelete(goal);
  }
</script>

<Dialog
  id="goal-dialog"
  title={editing ? t('plan.goalEdit') : t('plan.goalNew')}
  closeLabel={t('plan.close')}
  bind:dialog
  onsubmit={submit}
>
  {#snippet body()}
    <div class="field">
      <label class="field__label" for="goal-name">{t('plan.goalName')}</label>
      <input
        id="goal-name"
        class="field__input"
        bind:value={name}
        maxlength={GOAL_NAME_MAX}
        autocomplete="off"
        placeholder={t('plan.goalNamePlaceholder')}
        aria-invalid={errors.name ? 'true' : undefined}
        aria-describedby={errors.name ? 'goal-name-error' : undefined}
      />
      {#if errors.name}
        <p class="field__error" id="goal-name-error"><Icon name="alert" />{errors.name}</p>
      {/if}
    </div>

    <fieldset class="group">
      <legend class="field__label">{t('plan.goalIcon')}</legend>
      <div class="swatches">
        {#each goalIcons as option (option)}
          <label class="swatch">
            <input
              type="radio"
              name="goal-icon"
              value={option}
              checked={icon === option}
              onchange={() => (icon = option)}
            />
            <span class="cat-tile" data-color={color} aria-hidden="true"><Icon name={option} /></span>
            <span class="visually-hidden">{t(`plan.icon.${option}` as UiKey)}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset class="group">
      <legend class="field__label">{t('plan.goalColor')}</legend>
      <div class="swatches swatches--colors">
        {#each COLORS as option (option)}
          <label class="swatch">
            <input
              type="radio"
              name="goal-color"
              value={option}
              checked={color === option}
              onchange={() => (color = option)}
            />
            <span class="cat-tile swatch__color" data-color={option} aria-hidden="true"></span>
            <span class="visually-hidden">{t('plan.colorN', { n: option })}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <div class="field">
      <label class="field__label" for="goal-target">{t('plan.goalTarget')}</label>
      <div class="money-input">
        <input
          id="goal-target"
          class="field__input num"
          bind:value={targetText}
          inputmode="decimal"
          autocomplete="off"
          placeholder={centsToInput(0, locale)}
          aria-invalid={errors.target ? 'true' : undefined}
          aria-describedby={errors.target ? 'goal-target-error' : undefined}
        />
        <span class="money-input__symbol" aria-hidden="true">{symbol}</span>
      </div>
      {#if errors.target}
        <p class="field__error" id="goal-target-error"><Icon name="alert" />{errors.target}</p>
      {/if}
    </div>

    <div class="field">
      <label class="field__label" for="goal-deadline">{t('plan.goalDeadline')}</label>
      <input
        id="goal-deadline"
        class="field__input date-input"
        type="date"
        min={today}
        bind:value={deadline}
        aria-invalid={errors.deadline ? 'true' : undefined}
        aria-describedby={errors.deadline ? 'goal-deadline-error goal-deadline-hint' : 'goal-deadline-hint'}
      />
      <p class="field__hint" id="goal-deadline-hint">{t('plan.goalDeadlineHint')}</p>
      {#if errors.deadline}
        <p class="field__error" id="goal-deadline-error"><Icon name="alert" />{errors.deadline}</p>
      {/if}
    </div>

    <div class="switch-row">
      <input
        id="goal-pinned"
        class="switch"
        type="checkbox"
        role="switch"
        bind:checked={pinned}
        aria-describedby="goal-pinned-hint"
      />
      <div>
        <label for="goal-pinned">{t('plan.goalPinned')}</label>
        <p class="field__hint" id="goal-pinned-hint">{t('plan.goalPinnedHint')}</p>
      </div>
    </div>
  {/snippet}

  {#snippet footer()}
    {#if editing}
      <button class="btn btn--danger" type="button" onclick={remove}>
        <Icon name="trash" />{t('plan.goalDelete')}
      </button>
    {/if}
    <button class="btn btn--primary" type="submit">{t('plan.save')}</button>
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

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  /* 44 px targets: the tile plus a ring when checked. */
  .swatch {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: var(--radius-btn);
    cursor: pointer;
  }

  .swatch input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .swatch:has(input:checked) {
    box-shadow: inset 0 0 0 2px var(--ink);
  }

  .swatch:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .swatch__color {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
  }

  /* Phones: the 8 colors in two even rows instead of 6 + 2. */
  @media (max-width: 30rem) {
    .swatches--colors {
      display: grid;
      grid-template-columns: repeat(4, 2.75rem);
    }
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

  .date-input {
    max-width: 14rem;
  }

  .switch-row {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }

  .switch-row label {
    font-weight: 600;
    cursor: pointer;
  }
</style>
