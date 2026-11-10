<!--
  One movement in a list: category tile, name (note or category), category · Recurring, signed amount.
  The row itself opens the editor. Desktop: Edit and Delete icon buttons appear on hover or focus.
  Phones: swipe left to reveal Delete (a CSS scroll-snap strip, so it also works with the keyboard).
  Props:
    movement   The movement.
    category   Its category (undefined for income).
    locale, currency
    t          Translator.
    onedit, ondelete  Actions.
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import type { IconName } from '../../lib/icons';
  import { movementAmount, movementName } from '../../lib/movements/format';
  import type { CategoryOption, Movement } from '../../lib/movements/model';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    movement: Movement;
    category: CategoryOption | undefined;
    locale: Locale;
    currency: string;
    t: Translate;
    onedit: (movement: Movement) => void;
    ondelete: (movement: Movement) => void;
  }

  let { movement, category, locale, currency, t, onedit, ondelete }: Props = $props();

  const name = $derived(movementName(movement, category, t));
  const meta = $derived(
    movement.type === 'income' ? t('movements.income') : (category?.name ?? t('movements.noCategory')),
  );
  const icon = $derived((movement.type === 'income' ? 'wallet' : (category?.icon ?? 'dots')) as IconName);
  const color = $derived(movement.type === 'income' ? 3 : (category?.color ?? 7));
</script>

<li class="row" data-movement={movement.id}>
  <div class="row__track">
    <button class="row__main" type="button" onclick={() => onedit(movement)}>
      <span class="cat-tile" data-color={color} aria-hidden="true"><Icon name={icon} /></span>
      <span class="row__text">
        <span class="row__name">{name}</span>
        <span class="row__meta">
          {meta}
          {#if movement.recurring}
            <span class="badge"><Icon name="repeat" />{t('movements.recurring')}</span>
          {/if}
        </span>
      </span>
      <span class={['row__amount num', movement.type === 'income' && 'row__amount--income']}>
        {movementAmount(movement, locale, currency)}
      </span>
    </button>
    <div class="row__actions">
      <!-- Mouse shortcut only: the row itself already opens the editor for keyboard and screen readers. -->
      <button
        class="icon-btn row__edit"
        type="button"
        tabindex="-1"
        aria-label={t('movements.edit', { name })}
        onclick={() => onedit(movement)}
      >
        <Icon name="pencil" />
      </button>
      <button
        class="icon-btn row__delete"
        type="button"
        aria-label={t('movements.delete', { name })}
        onclick={() => ondelete(movement)}
      >
        <Icon name="trash" />
      </button>
    </div>
  </div>
</li>

<style>
  .row {
    position: relative;
    list-style: none;
  }

  .row__track {
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    border-radius: var(--radius-btn);
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }

  .row__track::-webkit-scrollbar {
    display: none;
  }

  .row__main {
    display: grid;
    flex: 0 0 100%;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-3);
    align-items: center;
    min-height: 3.5rem;
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-btn);
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    scroll-snap-align: start;
  }

  .row__main:hover {
    background: var(--surface-2);
  }

  .row__main:focus-visible {
    outline-offset: -2px;
  }

  .row__text {
    display: grid;
    min-width: 0;
  }

  .row__name {
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    color: var(--ink-2);
    font-size: 0.8125rem;
  }

  .row__amount {
    font-size: 0.9375rem;
    white-space: nowrap;
    color: var(--negative);
  }

  .row__amount--income {
    color: var(--positive);
  }

  .row__actions {
    display: flex;
    flex: none;
    scroll-snap-align: end;
  }

  .row__edit {
    display: none;
  }

  /* Phones: Delete is a full-height red block revealed by swiping. */
  .row__delete {
    width: 4.5rem;
    height: auto;
    margin-inline-start: var(--space-2);
    border-radius: var(--radius-btn);
    background: var(--negative);
    color: var(--surface);
  }

  .row__delete:hover {
    background: var(--negative);
  }

  @media (hover: hover) and (min-width: 48rem) {
    .row__track {
      overflow: visible;
      align-items: center;
    }

    .row__main {
      flex: 1;
    }

    /* Desktop: the actions float over the amount on hover or focus, so they never squeeze the row. */
    .row__actions {
      position: absolute;
      inset-block: 0;
      inset-inline-end: 0;
      align-items: center;
      gap: var(--space-1);
      padding-inline: var(--space-2) var(--space-1);
      border-radius: var(--radius-btn);
      background: var(--surface-2);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--dur) var(--ease);
    }

    /* Keyboard focus on the row itself keeps the amount visible; focus on Delete shows the actions. */
    .row:hover .row__actions,
    .row__actions:focus-within {
      opacity: 1;
      pointer-events: auto;
    }

    .row:hover .row__main,
    .row:has(.row__actions:focus-within) .row__main {
      background: var(--surface-2);
    }

    .row__edit {
      display: inline-grid;
    }

    .row__delete {
      width: 2.75rem;
      height: 2.75rem;
      margin: 0;
      background: transparent;
      color: var(--negative);
    }

    .row__edit:hover,
    .row__delete:hover {
      background: var(--surface);
    }
  }
</style>
