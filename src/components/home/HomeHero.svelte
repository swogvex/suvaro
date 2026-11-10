<!--
  Home hero: "Available this month", the daily allowance phrase and the spent / set aside / left bar with
  its inline legend. With nothing noted in the current month it becomes the empty state (one action:
  note this month's income).
  Props:
    figures     Totals of the cycle (`calc.ts`).
    isCurrent   The cycle contains today (past cycles show "Left over" and no daily phrase).
    empty       Nothing noted in the current cycle.
    range       Cycle label, for "October 2026 is over."
    locale, currency, t
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import type { CycleFigures } from '../../lib/calc';
  import { formatMoney, percent } from '../../lib/money';
  import { openEditor } from '../../lib/movements/client';
  import StackedBar from '../charts/StackedBar.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    figures: CycleFigures;
    isCurrent: boolean;
    empty: boolean;
    range: string;
    locale: Locale;
    currency: string;
    t: Translate;
  }

  let { figures, isCurrent, empty, range, locale, currency, t }: Props = $props();

  const money = (cents: number) => formatMoney(cents, locale, { currency });
  const whole = (cents: number) => formatMoney(cents, locale, { currency, wholeUnits: true });

  const phrase = $derived.by(() => {
    if (!isCurrent) return t('home.pastCycle', { range });
    const { availableCents: available, daysLeft: days, dailyAllowCents: daily } = figures;
    if (available < 0) {
      const amount = money(-available);
      return days === 1 ? t('home.dailyOverOne', { amount }) : t('home.dailyOver', { days, amount });
    }
    if (days === 1) return t('home.dailyOne', { amount: money(available) });
    // Less than one whole unit a day reads as "nothing left".
    if (daily === null || daily < 100) return t('home.dailyNothing', { days });
    return t('home.daily', { days, amount: whole(daily) });
  });

  const parts = $derived([
    { tone: 'spent', label: t('home.spent'), cents: figures.expenseCents },
    { tone: 'setAside', label: t('home.setAside'), cents: figures.setAsideCents },
    { tone: 'free', label: t('home.free'), cents: Math.max(figures.availableCents, 0) },
  ] as const);

  const barLabel = $derived.by(() => {
    const total = parts.reduce((sum, p) => sum + p.cents, 0);
    const [spent, setAside, free] = parts.map((p) => percent(p.cents, total));
    return t('home.barLabel', { spent: spent ?? 0, setAside: setAside ?? 0, free: free ?? 0 });
  });
</script>

<section class="hero-card hero" aria-labelledby="hero-title">
  <span class="hero__dot hero__dot--butter" aria-hidden="true"></span>
  <span class="hero__dot hero__dot--peach" aria-hidden="true"></span>
  <span class="hero__dot hero__dot--accent" aria-hidden="true"></span>

  {#if empty}
    <div class="hero__empty">
      <h2 id="hero-title" class="hero__empty-title">{t('home.emptyTitle')}</h2>
      <p>{t('home.emptyText')}</p>
      <button class="btn btn--primary" type="button" onclick={() => openEditor({ type: 'income' })}>
        <Icon name="plus" />
        {t('home.emptyAction')}
      </button>
    </div>
  {:else}
    <div class="hero__group">
      <h2 id="hero-title" class="hero__label">{isCurrent ? t('home.available') : t('home.availablePast')}</h2>
      <p
        class={['hero__amount num', figures.availableCents < 0 && 'hero__amount--over']}
        data-testid="available"
      >
        {money(figures.availableCents)}
      </p>
      <p class="hero__phrase" data-testid="daily">{phrase}</p>
    </div>
    <div class="hero__group">
      <figure class="hero__bar" role="img" aria-label={barLabel}>
        <StackedBar segments={parts.map((p) => ({ value: p.cents, tone: p.tone }))} />
      </figure>
      <ul class="hero__legend">
        {#each parts as part (part.tone)}
          <li>
            <span class="hero__key hero__key--{part.tone}" aria-hidden="true"></span>
            <span>{part.label}</span>
            <span class="num">{money(part.cents)}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<style>
  /* Two groups: the number on top, the bar and its legend at the bottom (the card can be taller than its
     content next to the stat cards on desktop). */
  .hero {
    display: grid;
    align-content: space-between;
    gap: var(--space-5);
  }

  .hero__group {
    display: grid;
    gap: var(--space-3);
  }

  /* Own decoration (butter circle, peach dot, accent dot) instead of the default square and circle. */
  .hero::before,
  .hero::after {
    display: none;
  }

  .hero__dot {
    position: absolute;
    z-index: -1;
    border-radius: 50%;
    pointer-events: none;
  }

  /* Kept in the top-right corner, clear of the text (light text on butter would fail contrast in dark). */
  .hero__dot--butter {
    inset-block-start: -3rem;
    inset-inline-end: -2.5rem;
    width: 6rem;
    height: 6rem;
    background: var(--cat-4);
  }

  .hero__dot--peach {
    inset-block-start: 0.5rem;
    inset-inline-end: 4.25rem;
    width: 1.125rem;
    height: 1.125rem;
    background: var(--cat-1);
  }

  .hero__dot--accent {
    inset-block-start: 2.25rem;
    inset-inline-end: 4.75rem;
    width: 0.625rem;
    height: 0.625rem;
    background: var(--accent);
  }

  @media (min-width: 48rem) {
    .hero__dot--butter {
      inset-block-start: -3rem;
      inset-inline-end: -2rem;
      width: 8.5rem;
      height: 8.5rem;
    }

    .hero__dot--peach {
      inset-inline-end: 7.25rem;
    }

    .hero__dot--accent {
      inset-block-start: 3rem;
      inset-inline-end: 7.75rem;
    }
  }

  .hero__label {
    font-family: var(--font-ui);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  .hero__amount {
    font-size: clamp(2.75rem, 12vw, 4.5rem);
    line-height: 1;
    letter-spacing: var(--tracking-number);
    overflow-wrap: anywhere;
  }

  .hero__amount--over {
    color: var(--negative);
  }

  .hero__phrase {
    font-weight: 500;
  }

  .hero__bar {
    margin: var(--space-2) 0 0;
  }

  .hero__legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-5);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.9375rem;
  }

  .hero__legend li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .hero__legend .num {
    font-size: 0.875rem;
  }

  .hero__key {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: var(--radius-track);
  }

  .hero__key--spent {
    background: var(--accent-2);
  }

  .hero__key--setAside {
    background: var(--accent);
  }

  .hero__key--free {
    border: 1px solid var(--hero-line);
    background: var(--surface);
  }

  .hero__empty {
    display: grid;
    justify-items: start;
    gap: var(--space-3);
    max-width: 30rem;
  }

  .hero__empty-title {
    font-size: 1.5rem;
    line-height: 1.15;
  }
</style>
