<!--
  Plan (island on /app/plan): goals and budgets. Desktop shows both columns side by side; phones switch
  between them with a segmented control. Every write is optimistic (the screen changes first, then the
  API; a failure rolls back with a toast). Contributions and goal deletes offer Undo. `?contribute=<id>`
  (from Home's pinned goal) opens the contribute dialog for that goal.
  Props:
    initial      `loadPlan` for the current cycle.
    startDay, today, locale, currency
    categories   The user's categories (budgets and names).
    messages     Translated strings.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Locale } from '../../i18n';
  import { translator, type Messages } from '../../i18n/client';
  import { daysLeft as cycleDaysLeft } from '../../lib/cycle';
  import { cycleLabel } from '../../lib/home/format';
  import { ulid } from '../../lib/id';
  import { formatMoney } from '../../lib/money';
  import { onChange } from '../../lib/movements/client';
  import type { CategoryOption } from '../../lib/movements/model';
  import { budgetRows, globalBudget } from '../../lib/plan/calc';
  import * as api from '../../lib/plan/client';
  import {
    CONTRIBUTIONS_SHOWN,
    MAX_GOALS,
    type Contribution,
    type Goal,
    type PlanData,
  } from '../../lib/plan/model';
  import { showToast } from '../../lib/toast';
  import Icon from '../ui/Icon.svelte';
  import BudgetsPanel from './BudgetsPanel.svelte';
  import ContributeDialog from './ContributeDialog.svelte';
  import GoalDialog from './GoalDialog.svelte';
  import GoalItem from './GoalItem.svelte';
  import LimitsDialog from './LimitsDialog.svelte';

  interface Props {
    initial: PlanData;
    startDay: number;
    today: string;
    categories: CategoryOption[];
    locale: Locale;
    currency: string;
    messages: Messages;
  }

  let { initial, startDay, today, categories, locale, currency, messages }: Props = $props();

  const t = $derived(translator(messages));
  const CELEBRATE_MS = 1_600;
  const STALE_MS = 60_000;

  // svelte-ignore state_referenced_locally
  let data = $state<PlanData>(initial);
  let view = $state<'goals' | 'budgets'>('goals');
  let celebrating = $state<string | null>(null);
  let goalDialog: GoalDialog | undefined = $state();
  let contributeDialog: ContributeDialog | undefined = $state();
  let limitsDialog: LimitsDialog | undefined = $state();
  let loadedAt = Date.now();
  /** Writes in flight: a refresh then would bring back what the screen already changed. */
  let pending = 0;

  const active = $derived(data.goals.filter((g) => g.completedAt === null || g.id === celebrating));
  const completed = $derived(data.goals.filter((g) => g.completedAt !== null && g.id !== celebrating));
  const atLimit = $derived(data.goals.length >= MAX_GOALS);
  const rows = $derived(budgetRows(data.budgets, data.spent));
  const daysLeft = $derived(cycleDaysLeft(data.cycle, today));
  const globalRow = $derived(data.budgets.find((b) => b.categoryId === null) ?? null);
  const global = $derived(
    globalRow ? globalBudget(globalRow.limitCents, data.totalSpentCents, daysLeft) : null,
  );
  const range = $derived(cycleLabel(data.cycle, startDay, locale));
  const money = (cents: number) => formatMoney(cents, locale, { currency });

  onMount(() => {
    const wanted = new URLSearchParams(window.location.search).get('contribute');
    const target = wanted ? data.goals.find((g) => g.id === wanted && g.completedAt === null) : undefined;
    if (wanted) history.replaceState(history.state, '', window.location.pathname);
    if (target) contributeDialog?.open(target);

    const refresh = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt > STALE_MS) void reload();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    // A movement saved from the editor on this page changes what the budgets have spent.
    const stop = onChange(() => setTimeout(() => void reload(), 400));
    return () => {
      stop();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  });

  async function reload() {
    if (pending > 0) return;
    try {
      const next = await api.fetchPlan();
      if (pending === 0) {
        data = next;
        loadedAt = Date.now();
      }
    } catch {
      // Keep what is on screen; the next focus tries again.
    }
  }

  /** Runs a write, counting it as pending so a refresh can't overwrite the optimistic state meanwhile. */
  async function track<T>(work: Promise<T>): Promise<T> {
    pending += 1;
    try {
      return await work;
    } finally {
      pending -= 1;
    }
  }

  function failed(error: unknown): string {
    const code = error instanceof api.ApiError ? error.code : '';
    if (code === 'LIMIT_REACHED') return t('plan.errorLimit');
    if (code === 'NETWORK' && !navigator.onLine) return t('plan.errorOffline');
    return t('plan.errorSave');
  }

  function setGoal(goal: Goal) {
    const others = goal.pinned
      ? data.goals.map((g) => (g.id === goal.id ? g : { ...g, pinned: false }))
      : data.goals;
    data.goals = others.some((g) => g.id === goal.id)
      ? others.map((g) => (g.id === goal.id ? goal : g))
      : [...others, goal];
  }

  function removeGoalLocally(id: string) {
    data.goals = data.goals.filter((g) => g.id !== id);
  }

  // ------------------------------------------------------------------------------------------- goals

  async function saveGoal(fields: api.GoalFields, editing: Goal | null) {
    const snapshot = data.goals;
    if (editing) {
      setGoal({ ...editing, ...fields });
      showToast(t('plan.goalUpdated'));
      try {
        setGoal(await track(api.updateGoal(editing.id, fields)));
      } catch (error) {
        data.goals = snapshot;
        showToast(failed(error));
      }
      return;
    }
    const id = ulid();
    setGoal({ id, ...fields, completedAt: null, savedCents: 0, firstDate: null, contributions: [] });
    showToast(t('plan.goalCreated', { name: fields.name }));
    try {
      setGoal(await track(api.createGoal(id, fields)));
    } catch (error) {
      data.goals = snapshot;
      showToast(failed(error));
    }
  }

  function deleteGoal(goal: Goal) {
    const snapshot = data.goals;
    removeGoalLocally(goal.id);
    showToast(t('plan.goalDeleted', { name: goal.name }), {
      undo: () => (data.goals = snapshot),
      onDismiss: () => {
        void track(api.deleteGoal(goal.id)).catch((error: unknown) => {
          if (error instanceof api.ApiError && error.code === 'NOT_FOUND') return;
          data.goals = snapshot;
          showToast(failed(error));
        });
      },
    });
  }

  // ----------------------------------------------------------------------------------- contributions

  /** The goal after adding, changing or removing one contribution (saved, first date, newest list). */
  function applyContribution(goal: Goal, before: Contribution | null, after: Contribution | null): Goal {
    const list = goal.contributions.filter((c) => c.id !== (before ?? after)?.id);
    if (after) list.push(after);
    list.sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1));
    const savedCents = goal.savedCents - (before?.amountCents ?? 0) + (after?.amountCents ?? 0);
    // Close enough until the server answers (it only sends the newest contributions).
    let firstDate = goal.firstDate;
    if (before && before.date === firstDate) firstDate = list.at(-1)?.date ?? null;
    if (after && (!firstDate || after.date < firstDate)) firstDate = after.date;
    list.splice(CONTRIBUTIONS_SHOWN);
    const reached = savedCents >= goal.targetCents;
    const completedAt = reached ? (goal.completedAt ?? new Date().toISOString()) : null;
    return { ...goal, contributions: list, savedCents, firstDate, completedAt };
  }

  function celebrate(goal: Goal) {
    celebrating = goal.id;
    setTimeout(() => {
      if (celebrating === goal.id) celebrating = null;
    }, CELEBRATE_MS);
  }

  async function addContribution(goal: Goal, amountCents: number, date: string) {
    const contribution: Contribution = { id: ulid(), goalId: goal.id, amountCents, date };
    const before = goal;
    const after = applyContribution(goal, null, contribution);
    setGoal(after);
    const completes = before.completedAt === null && after.completedAt !== null;
    if (completes) celebrate(after);
    let undone = false;
    const saved = track(api.addContribution(goal.id, contribution));
    showToast(
      completes
        ? t('plan.celebrate', { name: goal.name })
        : t('plan.contributed', { amount: money(amountCents), name: goal.name }),
      {
        undo: () => {
          undone = true;
          if (celebrating === goal.id) celebrating = null;
          setGoal(before);
          saved.then(
            () =>
              track(api.deleteContribution(contribution.id)).then(setGoal, (error: unknown) =>
                restore(error),
              ),
            () => undefined,
          );
        },
      },
    );
    try {
      const result = await saved;
      if (!undone) setGoal(result.goal);
    } catch (error) {
      if (undone) return;
      setGoal(before);
      showToast(failed(error));
    }
  }

  function restore(error: unknown) {
    showToast(failed(error));
    void reload();
  }

  async function editContribution(before: Contribution, after: Contribution) {
    const goal = data.goals.find((g) => g.id === before.goalId);
    if (!goal) return;
    setGoal(applyContribution(goal, before, after));
    const saved = track(api.updateContribution(after));
    showToast(t('plan.contributionUpdated'), {
      undo: () => {
        const current = data.goals.find((g) => g.id === goal.id);
        if (current) setGoal(applyContribution(current, after, before));
        saved.then(
          () => track(api.updateContribution(before)).then((r) => setGoal(r.goal), restore),
          () => undefined,
        );
      },
    });
    try {
      setGoal((await saved).goal);
    } catch (error) {
      setGoal(goal);
      showToast(failed(error));
    }
  }

  function deleteContribution(goal: Goal, contribution: Contribution) {
    setGoal(applyContribution(goal, contribution, null));
    showToast(t('plan.contributionDeleted', { amount: money(contribution.amountCents) }), {
      undo: () => {
        const current = data.goals.find((g) => g.id === goal.id);
        if (current) setGoal(applyContribution(current, null, contribution));
      },
      onDismiss: () => {
        void track(api.deleteContribution(contribution.id)).then(setGoal, (error: unknown) => {
          if (error instanceof api.ApiError && error.code === 'NOT_FOUND') return;
          restore(error);
        });
      },
    });
  }

  // ----------------------------------------------------------------------------------------- budgets

  async function saveLimits(body: api.BudgetsBody) {
    const snapshot = data.budgets;
    data.budgets = [
      ...(body.globalCents === null
        ? []
        : [{ id: 'global', categoryId: null, limitCents: body.globalCents }]),
      ...body.categories.map((row) => ({ id: row.categoryId, ...row })),
    ];
    showToast(t('plan.limitsSaved'));
    try {
      data.budgets = await track(api.saveBudgets(body));
    } catch (error) {
      data.budgets = snapshot;
      showToast(failed(error));
    }
  }
</script>

<div class="plan" data-view={view}>
  <header class="plan__head">
    <div class="plan__intro">
      <h1>{t('app.plan')}</h1>
      <p class="plan__lead">{t('plan.lead')}</p>
    </div>
    <fieldset class="plan__switch">
      <legend class="visually-hidden">{t('plan.viewLabel')}</legend>
      <div class="segmented">
        {#each [['goals', 'plan.goals'], ['budgets', 'plan.budgets']] as const as [value, label] (value)}
          <label class="segmented__item">
            <input
              type="radio"
              name="plan-view"
              {value}
              checked={view === value}
              onchange={() => (view = value)}
            />
            {t(label)}
          </label>
        {/each}
      </div>
    </fieldset>
  </header>

  <div class="plan__columns">
    <section class="plan__col plan__goals" aria-labelledby="plan-goals">
      <div class="plan__col-head">
        <h2 id="plan-goals">{t('plan.goals')}</h2>
        <button
          class="btn btn--secondary"
          type="button"
          disabled={atLimit}
          onclick={() => goalDialog?.open()}
        >
          <Icon name="plus" />{t('plan.newGoal')}
        </button>
      </div>
      {#if atLimit}
        <p class="plan__note">{t('plan.goalsLimit')}</p>
      {/if}

      {#if data.goals.length === 0}
        <div class="card empty">
          <span class="cat-tile cat-tile--lg" data-color="2" aria-hidden="true"><Icon name="target" /></span>
          <h3>{t('plan.goalsEmptyTitle')}</h3>
          <p class="plan__muted">{t('plan.goalsEmpty')}</p>
          <button class="btn btn--primary" type="button" onclick={() => goalDialog?.open()}>
            <Icon name="plus" />{t('plan.goalsEmptyAction')}
          </button>
        </div>
      {:else}
        <div class="plan__list">
          {#each active as goal (goal.id)}
            <GoalItem
              {goal}
              {today}
              celebrate={celebrating === goal.id}
              {locale}
              {currency}
              {t}
              oncontribute={(g) => contributeDialog?.open(g)}
              onedit={(g) => goalDialog?.open(g)}
            />
          {/each}
          {#if !atLimit}
            <!-- Desktop: fills the goals column down to the budgets' height with the next step. -->
            <button
              class="add-goal"
              type="button"
              tabindex="-1"
              aria-hidden="true"
              onclick={() => goalDialog?.open()}
            >
              <Icon name="plus" />{t('plan.newGoal')}
            </button>
          {/if}
        </div>
        {#if completed.length > 0}
          <details class="done">
            <summary class="done__summary">
              <Icon name="chevron-down" />{t('plan.completed', { n: completed.length })}
            </summary>
            <div class="plan__list done__list">
              {#each completed as goal (goal.id)}
                <GoalItem
                  {goal}
                  {today}
                  {locale}
                  {currency}
                  {t}
                  oncontribute={(g) => contributeDialog?.open(g)}
                  onedit={(g) => goalDialog?.open(g)}
                />
              {/each}
            </div>
          </details>
        {/if}
      {/if}
    </section>

    <section class="plan__col plan__budgets" aria-labelledby="plan-budgets">
      <div class="plan__col-head">
        <h2 id="plan-budgets">{t('plan.budgets')}</h2>
        <button class="btn btn--secondary" type="button" onclick={() => limitsDialog?.open(data.budgets)}>
          <Icon name="sliders" />{t('plan.editLimits')}
        </button>
      </div>
      <BudgetsPanel
        {rows}
        {global}
        {daysLeft}
        {range}
        {categories}
        {locale}
        {currency}
        {t}
        onedit={() => limitsDialog?.open(data.budgets)}
      />
    </section>
  </div>
</div>

<GoalDialog bind:this={goalDialog} {locale} {currency} {today} {t} onsave={saveGoal} ondelete={deleteGoal} />
<ContributeDialog
  bind:this={contributeDialog}
  goals={data.goals}
  {locale}
  {currency}
  {today}
  {t}
  onadd={addContribution}
  onedit={editContribution}
  ondelete={deleteContribution}
/>
<LimitsDialog bind:this={limitsDialog} {categories} {locale} {currency} {t} onsave={saveLimits} />

<style>
  .plan {
    display: grid;
    gap: var(--space-6);
  }

  .plan__head {
    display: grid;
    gap: var(--space-4);
  }

  .plan__intro {
    display: grid;
    gap: var(--space-1);
  }

  .plan__lead,
  .plan__muted,
  .plan__note {
    color: var(--ink-2);
  }

  .plan__note {
    font-size: 0.875rem;
  }

  .plan__switch {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .plan__switch .segmented {
    display: flex;
  }

  .plan__switch .segmented__item {
    flex: 1;
  }

  .plan__columns {
    display: grid;
    gap: var(--space-8);
    align-items: start;
  }

  .plan__col {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .plan__col-head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
    justify-content: space-between;
    min-height: 2.75rem;
  }

  .plan__list {
    display: grid;
    gap: var(--space-4);
  }

  /* A duplicate of the "New goal" button (hidden from assistive tech and the tab order), only where the
     goals column would otherwise end well above the budgets column. */
  .add-goal {
    display: none;
  }

  @media (min-width: 60rem) {
    .plan__columns {
      align-items: stretch;
    }

    .plan__goals {
      display: flex;
      flex-direction: column;
    }

    .plan__goals > .plan__list {
      display: flex;
      flex: 1;
      flex-direction: column;
    }

    .add-goal {
      display: flex;
      flex: 1;
      gap: var(--space-2);
      align-items: center;
      justify-content: center;
      min-height: 6rem;
      border: 2px dashed var(--line);
      border-radius: var(--radius-m);
      background: transparent;
      color: var(--ink-2);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .add-goal:hover {
      border-color: var(--accent);
      color: var(--ink);
    }

    .add-goal :global(svg) {
      width: 1.25rem;
      height: 1.25rem;
    }
  }

  .empty {
    display: grid;
    justify-items: start;
    gap: var(--space-3);
  }

  .done__summary {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
    min-height: 2.75rem;
    padding-inline: var(--space-2);
    border-radius: var(--radius-btn);
    font-weight: 600;
    list-style: none;
    cursor: pointer;
  }

  .done__summary::-webkit-details-marker {
    display: none;
  }

  .done__summary :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
    transition: transform var(--dur) var(--ease);
  }

  .done[open] .done__summary :global(svg) {
    transform: rotate(180deg);
  }

  .done__list {
    margin-block-start: var(--space-3);
  }

  /* Phones and tablets: one column at a time, chosen with the segmented control. */
  @media (max-width: 59.99rem) {
    .plan[data-view='goals'] .plan__budgets,
    .plan[data-view='budgets'] .plan__goals {
      display: none;
    }
  }

  @media (min-width: 60rem) {
    .plan__switch {
      display: none;
    }

    .plan__columns {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }
</style>
