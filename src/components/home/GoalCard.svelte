<!--
  Pinned goal: progress ring, name, saved / target, deadline and "Set aside X a month", with a link to add
  a contribution (opens Plan's contribute dialog for it). Without a pinned goal: a short prompt to pin one.
  Props: goal (or null), today, locale, currency, t.
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import { monthlyNeed } from '../../lib/calc';
  import type { PinnedGoal } from '../../lib/home/model';
  import { iconOr } from '../../lib/icons';
  import { formatMoney, percent } from '../../lib/money';
  import { longDate } from '../../lib/movements/format';
  import { appPaths } from '../../lib/routes';
  import ProgressRing from '../charts/ProgressRing.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    goal: PinnedGoal | null;
    today: string;
    locale: Locale;
    currency: string;
    t: Translate;
  }

  let { goal, today, locale, currency, t }: Props = $props();

  const money = (cents: number) => formatMoney(cents, locale, { currency });
  const pct = $derived(goal ? percent(goal.savedCents, goal.targetCents) : 0);
  const need = $derived(goal ? monthlyNeed(goal.targetCents, goal.savedCents, goal.deadline, today) : null);
</script>

<section class="card goal" aria-labelledby="goal-title">
  <h2 id="goal-title">{t('home.goalTitle')}</h2>

  {#if goal}
    <div class="goal__body">
      <ProgressRing {pct} label={t('home.goalRing', { pct })} />
      <div class="goal__text">
        <p class="goal__name">
          <span class="cat-tile cat-tile--sm" data-color={goal.color} aria-hidden="true">
            <Icon name={iconOr(goal.icon, 'target')} />
          </span>
          {goal.name}
        </p>
        <p class="goal__saved">
          {t('home.goalSaved', { saved: money(goal.savedCents), target: money(goal.targetCents) })}
        </p>
        {#if goal.deadline}
          <p class="goal__meta">{t('home.goalBy', { date: longDate(goal.deadline, locale) })}</p>
        {/if}
      </div>
    </div>
    {#if need === 0 || goal.savedCents >= goal.targetCents}
      <p class="goal__need"><Icon name="check" />{t('home.goalReached')}</p>
    {:else if need !== null}
      <p class="goal__need">{t('home.goalNeed', { amount: money(need) })}</p>
    {/if}
    <a class="btn btn--secondary goal__action" href="{appPaths.plan}?contribute={goal.id}">
      <Icon name="plus" />
      {t('home.goalAdd')}
    </a>
  {:else}
    <p class="goal__empty">{t('home.goalEmpty')}</p>
    <a class="goal__link" href={appPaths.plan}>{t('home.goalEmptyAction')}</a>
  {/if}
</section>

<style>
  .goal {
    display: grid;
    align-content: start;
    gap: var(--space-3);
    min-width: 0;
  }

  .goal__body {
    display: flex;
    gap: var(--space-4);
    align-items: center;
  }

  .goal__text {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
  }

  .goal__name {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    font-weight: 600;
  }

  .goal__saved,
  .goal__meta,
  .goal__empty {
    color: var(--ink-2);
    font-size: 0.875rem;
  }

  .goal__need {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    font-weight: 500;
  }

  .goal__need :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
    color: var(--positive);
  }

  .goal__action,
  .goal__link {
    justify-self: start;
  }

  .goal__link {
    font-weight: 600;
  }
</style>
