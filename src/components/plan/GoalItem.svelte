<!--
  One goal card: tile, name, deadline, "On Home" badge, saved / target / %, track, tip, Contribute and Edit.
  A completed goal (in "Completed") shows a compact card with its completion date.
  `celebrate` plays the short celebration once (off with reduced motion).
  Props: goal, today, celebrate, locale, currency, t, oncontribute, onedit.
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import { iconOr } from '../../lib/icons';
  import { formatMoney } from '../../lib/money';
  import { longDate, monthName } from '../../lib/movements/format';
  import { goalPct, goalTip } from '../../lib/plan/calc';
  import type { Goal } from '../../lib/plan/model';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    goal: Goal;
    today: string;
    celebrate?: boolean;
    locale: Locale;
    currency: string;
    t: Translate;
    oncontribute: (goal: Goal) => void;
    onedit: (goal: Goal) => void;
  }

  let { goal, today, celebrate = false, locale, currency, t, oncontribute, onedit }: Props = $props();

  const money = (cents: number) => formatMoney(cents, locale, { currency });
  const pct = $derived(goalPct(goal.savedCents, goal.targetCents));
  const done = $derived(goal.completedAt !== null && !celebrate);
  const tip = $derived.by(() => {
    const value = goalTip(goal, today);
    if (value.kind === 'reached') return t('plan.tipReached');
    if (value.kind === 'need') return t('plan.tipNeed', { amount: money(value.cents) });
    if (value.kind === 'pace') return t('plan.tipPace', { month: monthName(value.month, locale) });
    return t('plan.tipStart');
  });
</script>

<article
  class={['card', 'goal', done && 'goal--done']}
  data-celebrate={celebrate ? 'true' : undefined}
  data-goal={goal.id}
>
  <header class="goal__head">
    <span class="cat-tile" data-color={goal.color} aria-hidden="true">
      <Icon name={iconOr(goal.icon, 'target')} />
    </span>
    <div class="goal__title">
      <h3 class="goal__name">{goal.name}</h3>
      <p class="goal__meta">
        {#if done && goal.completedAt}
          {t('plan.completedOn', { date: longDate(goal.completedAt.slice(0, 10), locale) })}
        {:else}
          {goal.deadline ? t('plan.byDate', { date: longDate(goal.deadline, locale) }) : t('plan.noDeadline')}
        {/if}
        {#if goal.pinned}
          <span class="badge badge--accent">{t('plan.onHome')}</span>
        {/if}
      </p>
    </div>
    <button
      class="icon-btn"
      type="button"
      aria-label={t('plan.editGoal', { name: goal.name })}
      onclick={() => onedit(goal)}
    >
      <Icon name="pencil" />
    </button>
  </header>

  <p class="goal__amounts">
    <span class="num goal__saved">{money(goal.savedCents)}</span>
    <span class="goal__of">{t('plan.ofTarget', { target: money(goal.targetCents), pct })}</span>
  </p>
  <progress
    class="progress"
    max="100"
    value={Math.min(pct, 100)}
    data-level={pct >= 100 ? undefined : 'accent'}
    aria-label={t('plan.progressLabel', { name: goal.name, pct })}
  >
    {pct} %
  </progress>

  {#if !done}
    <p class={['goal__tip', pct >= 100 && 'goal__tip--reached']}>
      {#if pct >= 100}<Icon name="check" />{/if}{tip}
    </p>
    <button class="btn btn--secondary goal__action" type="button" onclick={() => oncontribute(goal)}>
      <Icon name="plus" />{t('plan.contribute')}
    </button>
  {/if}
</article>

<style>
  .goal {
    position: relative;
    display: grid;
    gap: var(--space-3);
    min-width: 0;
  }

  .goal__head {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }

  .goal__title {
    display: grid;
    flex: 1;
    gap: var(--space-1);
    min-width: 0;
  }

  .goal__name {
    font-size: 1.0625rem;
    overflow-wrap: anywhere;
  }

  .goal__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    color: var(--ink-2);
    font-size: 0.875rem;
  }

  .goal__amounts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    align-items: baseline;
  }

  .goal__saved {
    font-size: 1.625rem;
    letter-spacing: var(--tracking-display);
  }

  .goal__of {
    color: var(--ink-2);
  }

  .goal__tip {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    color: var(--ink-2);
  }

  .goal__tip--reached {
    color: var(--ink);
    font-weight: 500;
  }

  .goal__tip :global(svg) {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    color: var(--positive);
  }

  .goal__action {
    justify-self: start;
  }

  .goal--done .goal__saved {
    font-size: 1.25rem;
  }

  /* One short celebration when a goal is completed. */
  @media (prefers-reduced-motion: no-preference) {
    .goal[data-celebrate='true'] {
      animation: goal-pop 600ms var(--ease);
    }

    .goal[data-celebrate='true']::after {
      content: '';
      position: absolute;
      inset: -2px;
      border: 2px solid var(--positive);
      border-radius: inherit;
      pointer-events: none;
      animation: goal-ring 1200ms var(--ease) forwards;
    }
  }

  @keyframes goal-pop {
    40% {
      transform: scale(1.02);
    }
  }

  @keyframes goal-ring {
    from {
      opacity: 1;
      transform: scale(1);
    }

    to {
      opacity: 0;
      transform: scale(1.04);
    }
  }
</style>
