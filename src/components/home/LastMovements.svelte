<!--
  The cycle's 5 newest movements: category tile, name, "category · relative date" (recurring marked with an
  icon) and the signed amount. A row opens the editor; "See all" goes to the list.
  Props:
    movements   Already sorted, newest first (at most 5).
    categories, today, locale, currency, t
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import { relativeDay } from '../../lib/home/format';
  import type { IconName } from '../../lib/icons';
  import { openEditor } from '../../lib/movements/client';
  import { movementAmount, movementName } from '../../lib/movements/format';
  import type { CategoryOption, Movement } from '../../lib/movements/model';
  import { appPaths } from '../../lib/routes';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    movements: readonly Movement[];
    categories: readonly CategoryOption[];
    today: string;
    locale: Locale;
    currency: string;
    t: Translate;
  }

  let { movements, categories, today, locale, currency, t }: Props = $props();

  const byId = $derived(new Map(categories.map((c) => [c.id, c])));
</script>

<section class="card last" aria-labelledby="last-title">
  <div class="last__head">
    <h2 id="last-title">{t('home.lastTitle')}</h2>
    <a href={appPaths.movements}>{t('home.seeAll')}</a>
  </div>

  {#if movements.length === 0}
    <p class="last__empty">{t('home.lastEmpty')}</p>
  {:else}
    <ul class="last__list">
      {#each movements as movement (movement.id)}
        {@const category = movement.categoryId ? byId.get(movement.categoryId) : undefined}
        {@const income = movement.type === 'income'}
        <li>
          <button class="last__row" type="button" onclick={() => openEditor({ movement })}>
            <span class="cat-tile" data-color={income ? 3 : (category?.color ?? 7)} aria-hidden="true">
              <Icon name={(income ? 'wallet' : (category?.icon ?? 'dots')) as IconName} />
            </span>
            <span class="last__text">
              <span class="last__name">{movementName(movement, category, t)}</span>
              <span class="last__meta">
                {income ? t('movements.income') : (category?.name ?? t('movements.noCategory'))} · {relativeDay(
                  movement.date,
                  today,
                  locale,
                )}
                {#if movement.recurring}
                  <span class="last__repeat" title={t('movements.recurring')}>
                    <Icon name="repeat" /><span class="visually-hidden">{t('movements.recurring')}</span>
                  </span>
                {/if}
              </span>
            </span>
            <span class={['last__amount num', income && 'last__amount--income']}>
              {movementAmount(movement, locale, currency)}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .last {
    display: grid;
    align-content: start;
    gap: var(--space-3);
    min-width: 0;
  }

  .last__head {
    display: flex;
    gap: var(--space-3);
    align-items: baseline;
    justify-content: space-between;
  }

  .last__head a {
    font-weight: 600;
  }

  .last__empty {
    color: var(--ink-2);
  }

  .last__list {
    display: grid;
    margin: 0 calc(var(--space-2) * -1);
    padding: 0;
    list-style: none;
  }

  .last__row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-3);
    align-items: center;
    width: 100%;
    min-height: 3.5rem;
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-btn);
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .last__row:hover {
    background: var(--surface-2);
  }

  .last__row:focus-visible {
    outline-offset: -2px;
  }

  .last__text {
    display: grid;
    min-width: 0;
  }

  .last__name {
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .last__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    align-items: center;
    color: var(--ink-2);
    font-size: 0.8125rem;
  }

  .last__repeat {
    display: inline-flex;
  }

  .last__repeat :global(svg) {
    width: 0.875rem;
    height: 0.875rem;
  }

  .last__amount {
    color: var(--negative);
    font-size: 0.9375rem;
    white-space: nowrap;
  }

  .last__amount--income {
    color: var(--positive);
  }
</style>
